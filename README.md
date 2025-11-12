# MCP SSE Bridge

A universal stdio-to-HTTP/SSE bridge for Model Context Protocol (MCP) servers.

## Why MCP SSE Bridge?

Some MCP servers use HTTP/SSE instead of stdio, and require a session handshake that stdio-based clients (like Cursor CLI) don't handle. **MCP SSE Bridge** bridges this gap, allowing any stdio MCP client to communicate with HTTP/SSE MCP servers.

### The Problem

- **Cursor CLI** and other stdio-based MCP clients expect to spawn a process and communicate via stdin/stdout
- Some MCP servers (especially those built with Kotlin MCP SDK or similar) use HTTP/SSE and require:
  1. Establishing an SSE connection to get a `sessionId`
  2. Sending POST requests with `?sessionId=xxx`
- These two approaches are incompatible

### The Solution

MCP Relay acts as a **protocol translator**:
- Exposes a **stdio interface** for Cursor CLI to spawn
- Connects to your **HTTP/SSE MCP server** as a client
- Handles session management internally
- Proxies all tools, resources, and prompts between the two

```
Cursor CLI (stdio) 
    ↓
MCP Relay (Node.js)
    - Stdio MCP Server (talks to Cursor)
    - HTTP/SSE MCP Client (talks to your server)
    - Automatic capability detection
    - Session management
    ↓
Your MCP Server (HTTP/SSE)
    - Kotlin, Python, Go, or any language
    - Tools, Resources, Prompts
```

## Features

- ✅ **Universal** - Works with any HTTP/SSE MCP server
- ✅ **Zero configuration** - Smart defaults, customize only what you need
- ✅ **Auto-discovery** - Detects which capabilities (tools/resources/prompts) your server supports
- ✅ **Authentication** - Supports custom headers for auth tokens
- ✅ **Reconnection** - Automatic reconnection with exponential backoff
- ✅ **Fast** - Minimal overhead, direct proxying

## Installation

### Option 1: Global Install (Recommended)
```bash
npm install -g mcp-sse-bridge
```

### Option 2: Use with npx (No Installation)
```bash
npx mcp-sse-bridge
```

### Option 3: Local Development
```bash
git clone <your-repo>
cd mcp-sse-bridge
npm install
chmod +x index.js
```

## Usage

### Basic Usage with Cursor

1. **Start your HTTP/SSE MCP server** on any port (e.g., `http://localhost:8082`)

2. **Configure Cursor** by editing `.cursor/mcp.json` in your project:

```json
{
  "mcpServers": {
    "my-server": {
      "command": "npx",
      "args": ["mcp-sse-bridge"],
      "env": {
        "BRIDGE_URL": "http://localhost:8082"
      }
    }
  }
}
```

3. **Restart Cursor** - The relay will automatically connect when Cursor spawns it

### Configuration

Configure via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `BRIDGE_URL` | `http://127.0.0.1:8082` | Base URL of your MCP server |
| `BRIDGE_SSE_PATH` | `/sse` | SSE endpoint path (appended to BRIDGE_URL) |
| `BRIDGE_HEADERS` | `undefined` | JSON string of headers to send (for auth) |
| `BRIDGE_NAME` | `mcp-sse-bridge` | Name to identify as to upstream server |
| `BRIDGE_VERSION` | `1.0.0` | Version to identify as to upstream server |

## Examples

### Example 1: Default Configuration
```json
{
  "mcpServers": {
    "kotlin-server": {
      "command": "npx",
      "args": ["mcp-sse-bridge"]
    }
  }
}
```
Connects to `http://127.0.0.1:8082/sse` by default.

### Example 2: Custom URL and Path
```json
{
  "mcpServers": {
    "python-server": {
      "command": "npx",
      "args": ["mcp-sse-bridge"],
      "env": {
        "BRIDGE_URL": "http://localhost:9000",
        "BRIDGE_SSE_PATH": "/mcp/events"
      }
    }
  }
}
```

### Example 3: With Authentication
```json
{
  "mcpServers": {
    "authenticated-server": {
      "command": "npx",
      "args": ["mcp-sse-bridge"],
      "env": {
        "BRIDGE_URL": "http://localhost:8082",
        "BRIDGE_HEADERS": "{\"Authorization\": \"Bearer my-api-key\"}"
      }
    }
  }
}
```

### Example 4: Multiple MCP Servers
```json
{
  "mcpServers": {
    "dev-server": {
      "command": "npx",
      "args": ["mcp-sse-bridge"],
      "env": {
        "BRIDGE_URL": "http://localhost:8082"
      }
    },
    "prod-server": {
      "command": "npx",
      "args": ["mcp-sse-bridge"],
      "env": {
        "BRIDGE_URL": "https://mcp.example.com",
        "BRIDGE_HEADERS": "{\"Authorization\": \"Bearer prod-token\"}"
      }
    }
  }
}
```

### Example 5: Global Install
```json
{
  "mcpServers": {
    "my-server": {
      "command": "mcp-sse-bridge",
      "env": {
        "BRIDGE_URL": "http://localhost:8082"
      }
    }
  }
}
```

### Example 6: Local Development
```json
{
  "mcpServers": {
    "local-dev": {
      "command": "node",
      "args": ["/Users/you/projects/mcp-sse-bridge/index.js"],
      "env": {
        "BRIDGE_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Testing

### Manual Testing
```bash
# Terminal 1: Start your MCP server
# (make sure it's running on http://localhost:8082)

# Terminal 2: Test the relay
BRIDGE_URL=http://localhost:8082 node index.js
```

You should see:
```
[Relay] Starting MCP Relay...
[Relay] Configuration:
  - Upstream URL: http://localhost:8082
  - SSE Path: /sse
  - Full SSE Endpoint: http://localhost:8082/sse
  - Custom Headers: No
[Relay] Connecting to upstream server at http://localhost:8082/sse...
[Relay] Connected to upstream server successfully
[Relay] Probing upstream capabilities...
[Relay] Upstream capabilities: tools, resources, prompts
[Relay] Relay server started successfully
[Relay] Waiting for MCP requests from stdio client (e.g., Cursor CLI)...
```

## How It Works

1. **Startup**: MCP Relay connects to your HTTP/SSE MCP server
2. **Capability Detection**: Probes which features (tools/resources/prompts) your server supports
3. **Server Creation**: Creates a stdio MCP server advertising only the capabilities found
4. **Request Proxying**: When Cursor calls a tool/resource/prompt, the relay forwards it to your server
5. **Response Forwarding**: Results are returned to Cursor via stdio
6. **Error Handling**: If connection drops, automatically reconnects with exponential backoff

## Troubleshooting

### "Failed to connect to upstream server"
- Ensure your MCP server is running
- Check that `BRIDGE_URL` is correct
- Verify the SSE endpoint path (default `/sse`)
- Try accessing `http://localhost:8082` in your browser

### "Upstream server is not available"
- The relay lost connection to your server
- Check your server logs for errors
- The relay will attempt to reconnect automatically

### Cursor can't find mcp-sse-bridge
- Use absolute paths: `"command": "/usr/local/bin/npx"`
- Or install globally: `npm install -g mcp-sse-bridge`
- Check Node.js is installed: `node --version`

### No tools/resources/prompts showing
- Your server may not support those capabilities
- Check relay logs: it shows detected capabilities on startup
- Ensure your server implements the MCP spec correctly

### Headers not being sent
- Ensure `BRIDGE_HEADERS` is valid JSON
- Example: `"{\"Authorization\": \"Bearer token\"}"`
- Check server logs to verify headers are received

## Compatibility

### Tested With
- ✅ Cursor CLI (stdio MCP client)
- ✅ Kotlin MCP SDK servers (HTTP/SSE)
- ✅ Python MCP servers with SSE
- ✅ Any MCP server using HTTP/SSE transport

### Requirements
- Node.js >= 18.0.0
- MCP server implementing the HTTP/SSE transport

## Development

### Project Structure
```
mcp-sse-bridge/
├── index.js       # Main bridge implementation
├── package.json   # NPM package config
├── README.md      # This file
└── LICENSE        # MIT License
```

### Contributing
Contributions welcome! This tool is designed to help the MCP ecosystem.

### Testing Changes
```bash
# Make your changes to index.js

# Test locally
BRIDGE_URL=http://localhost:8082 node index.js

# Test with Cursor (update .cursor/mcp.json to point to your local copy)
```

## Limitations

- Single session per relay instance (one Cursor client per relay process)
- Requires upstream server to be running before Cursor spawns the relay
- No built-in TLS/HTTPS certificate validation (use at your own risk for remote servers)
- Designed for localhost use; authentication is basic (header-based only)

## License

MIT - See LICENSE file

## Credits

Created to bridge HTTP/SSE MCP servers (especially those built with Kotlin MCP SDK) with stdio-based clients like Cursor CLI.

## Related Projects

- [Model Context Protocol](https://github.com/modelcontextprotocol) - Official MCP SDKs
- [Cursor](https://cursor.sh) - AI-first code editor
- Your MCP server here! (PRs welcome to add examples)
