#!/usr/bin/env node
/**
 * MCP Relay
 * 
 * A universal stdio-to-HTTP/SSE bridge for Model Context Protocol servers.
 * Allows Cursor CLI and other stdio-based MCP clients to communicate with
 * HTTP/SSE-based MCP servers that require session handling.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import EventSource from 'eventsource';

// Configuration from environment variables
const BRIDGE_URL = process.env.BRIDGE_URL || 'http://127.0.0.1:8082';
const BRIDGE_SSE_PATH = process.env.BRIDGE_SSE_PATH || '/sse';
const BRIDGE_NAME = process.env.BRIDGE_NAME || 'mcp-sse-bridge';
const BRIDGE_VERSION = process.env.BRIDGE_VERSION || '1.0.0';
const BRIDGE_HEADERS = parseHeaders(process.env.BRIDGE_HEADERS);

// Derived config
const SSE_ENDPOINT = new URL(BRIDGE_SSE_PATH, BRIDGE_URL).toString();

// State
let upstreamClient = null;
let isConnected = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

/**
 * Parse optional headers from JSON string
 */
function parseHeaders(headersJson) {
  if (!headersJson) return undefined;
  try {
    return JSON.parse(headersJson);
  } catch (error) {
    console.error('[Relay] Warning: Failed to parse BRIDGE_HEADERS:', error.message);
    return undefined;
  }
}

/**
 * Calculate exponential backoff delay
 */
function getReconnectDelay() {
  const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  reconnectAttempts++;
  return delay;
}

/**
 * Probe upstream server capabilities
 */
async function probeCapabilities(client) {
  const capabilities = {};
  
  // Probe tools
  try {
    await client.listTools();
    capabilities.tools = {};
  } catch (error) {
    // Tools not supported
  }
  
  // Probe resources
  try {
    await client.listResources();
    capabilities.resources = {};
  } catch (error) {
    // Resources not supported
  }
  
  // Probe prompts
  try {
    await client.listPrompts();
    capabilities.prompts = {};
  } catch (error) {
    // Prompts not supported
  }
  
  return capabilities;
}

/**
 * Connect to the upstream HTTP/SSE MCP server
 */
async function connectToUpstream() {
  try {
    console.error(`[Relay] Connecting to upstream server at ${SSE_ENDPOINT}...`);
    
    // Create EventSource with optional headers
    const eventSourceOptions = BRIDGE_HEADERS ? { headers: BRIDGE_HEADERS } : undefined;
    const eventSource = new EventSource(SSE_ENDPOINT, eventSourceOptions);
    
    // Create SSE transport
    const transport = new SSEClientTransport(
      new URL(SSE_ENDPOINT),
      () => eventSource
    );
    
    // Create MCP client
    upstreamClient = new Client({
      name: BRIDGE_NAME,
      version: BRIDGE_VERSION
    }, {
      capabilities: {}
    });
    
    // Connect to upstream server
    await upstreamClient.connect(transport);
    isConnected = true;
    reconnectAttempts = 0;
    
    console.error('[Relay] Connected to upstream server successfully');
    
    return upstreamClient;
  } catch (error) {
    console.error('[Relay] Failed to connect to upstream server:', error.message);
    throw error;
  }
}

/**
 * Create stdio MCP server that proxies to upstream
 */
async function createRelayServer() {
  // Ensure we're connected to upstream first
  if (!isConnected) {
    await connectToUpstream();
  }
  
  // Probe what the upstream server supports
  console.error('[Relay] Probing upstream capabilities...');
  const capabilities = await probeCapabilities(upstreamClient);
  console.error('[Relay] Upstream capabilities:', Object.keys(capabilities).join(', ') || 'none');
  
  // Create stdio server with mirrored capabilities
  const server = new Server({
    name: BRIDGE_NAME,
    version: BRIDGE_VERSION
  }, {
    capabilities
  });
  
  // Proxy tools (if supported)
  if (capabilities.tools) {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      if (!isConnected) {
        throw new Error('Upstream server is not available');
      }
      try {
        return await upstreamClient.listTools();
      } catch (error) {
        console.error('[Relay] Error listing tools:', error.message);
        throw error;
      }
    });
    
    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (!isConnected) {
        throw new Error('Upstream server is not available');
      }
      try {
        return await upstreamClient.callTool(request.params);
      } catch (error) {
        console.error('[Relay] Error calling tool:', error.message);
        throw error;
      }
    });
  }
  
  // Proxy resources (if supported)
  if (capabilities.resources) {
    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      if (!isConnected) {
        throw new Error('Upstream server is not available');
      }
      try {
        return await upstreamClient.listResources();
      } catch (error) {
        console.error('[Relay] Error listing resources:', error.message);
        throw error;
      }
    });
    
    server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      if (!isConnected) {
        throw new Error('Upstream server is not available');
      }
      try {
        return await upstreamClient.readResource(request.params);
      } catch (error) {
        console.error('[Relay] Error reading resource:', error.message);
        throw error;
      }
    });
  }
  
  // Proxy prompts (if supported)
  if (capabilities.prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      if (!isConnected) {
        throw new Error('Upstream server is not available');
      }
      try {
        return await upstreamClient.listPrompts();
      } catch (error) {
        console.error('[Relay] Error listing prompts:', error.message);
        throw error;
      }
    });
    
    server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      if (!isConnected) {
        throw new Error('Upstream server is not available');
      }
      try {
        return await upstreamClient.getPrompt(request.params);
      } catch (error) {
        console.error('[Relay] Error getting prompt:', error.message);
        throw error;
      }
    });
  }
  
  // Handle upstream disconnection with exponential backoff
  upstreamClient.onclose = async () => {
    console.error('[Relay] Upstream connection closed, attempting to reconnect...');
    isConnected = false;
    
    const delay = getReconnectDelay();
    console.error(`[Relay] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})...`);
    
    setTimeout(async () => {
      try {
        await connectToUpstream();
        console.error('[Relay] Reconnected to upstream server');
      } catch (error) {
        console.error('[Relay] Reconnection failed:', error.message);
        // Will retry on next connection attempt
      }
    }, delay);
  };
  
  return server;
}

/**
 * Main entry point
 */
async function main() {
  try {
    console.error('[Relay] Starting MCP Relay...');
    console.error(`[Relay] Configuration:
  - Upstream URL: ${BRIDGE_URL}
  - SSE Path: ${BRIDGE_SSE_PATH}
  - Full SSE Endpoint: ${SSE_ENDPOINT}
  - Custom Headers: ${BRIDGE_HEADERS ? 'Yes' : 'No'}`);
    
    // Create relay server
    const server = await createRelayServer();
    
    // Connect via stdio
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('[Relay] Relay server started successfully');
    console.error('[Relay] Waiting for MCP requests from stdio client (e.g., Cursor CLI)...');
    
  } catch (error) {
    console.error('[Relay] Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.error('[Relay] Shutting down...');
  if (upstreamClient) {
    upstreamClient.close();
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[Relay] Shutting down...');
  if (upstreamClient) {
    upstreamClient.close();
  }
  process.exit(0);
});

// Start the relay
main();
