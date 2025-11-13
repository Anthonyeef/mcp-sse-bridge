# MCP SSE Bridge

A clean stdio-to-HTTP/SSE relay that lets any Model Context Protocol (MCP) client speak to servers that require SSE handshakes.

```
Cursor CLI (stdio) ──▶ MCP SSE Bridge ──▶ Your HTTP/SSE MCP server
```

## Highlights
- **Universal translator** – works with any HTTP/SSE MCP server (Kotlin, Python, Go, …)
- **Drop-in for stdio clients** – Cursor or any MCP stdio host can spawn it
- **Smart capability mirroring** – advertises exactly the tools/resources/prompts your server exposes
- **Header-based auth** – pass API tokens or cookies via JSON headers
- **Self-healing** – reconnects automatically with exponential backoff

## Installation

```bash
# Global install (recommended)
npm install -g mcp-sse-bridge

# One-off run
npx mcp-sse-bridge

# Local development
git clone https://github.com/Anthonyeef/mcp-sse-bridge.git
cd mcp-sse-bridge
npm install
```

## Quick Start (Cursor CLI)
1. Start your HTTP/SSE MCP server (defaults assume `http://127.0.0.1:8082/sse`).
2. Add the bridge to `.cursor/mcp.json`:
   ```json
   {
     "mcpServers": {
       "my-upstream": {
         "command": "npx",
         "args": ["mcp-sse-bridge"],
         "env": {
           "BRIDGE_URL": "http://localhost:8082"
         }
       }
     }
   }
   ```
3. Restart Cursor; it will spawn the bridge automatically.

### Alternate configs
```json
// Custom SSE path + auth header
{
  "command": "npx",
  "args": ["mcp-sse-bridge"],
  "env": {
    "BRIDGE_URL": "https://api.example.com",
    "BRIDGE_SSE_PATH": "/mcp/events",
    "BRIDGE_HEADERS": "{\"Authorization\":\"Bearer sk_live\"}"
  }
}
```

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `BRIDGE_URL` | `http://127.0.0.1:8082` | Base URL of the upstream MCP server |
| `BRIDGE_SSE_PATH` | `/sse` | SSE endpoint appended to `BRIDGE_URL` |
| `BRIDGE_HEADERS` | _unset_ | JSON string of headers (e.g. auth) |
| `BRIDGE_NAME` | `mcp-sse-bridge` | Identity reported to the upstream server |
| `BRIDGE_VERSION` | `1.0.0` | Version reported upstream |

Node.js ≥ 18 is required. All logging goes to stderr; successful operation stays quiet by design.

## Manual Test Harness

```bash
# Terminal 1
YOUR_SERVER_CMD --port 8082

# Terminal 2
BRIDGE_URL=http://127.0.0.1:8082 node index.js
```

Expected log excerpt:
```
[Relay Warning] Probing upstream capabilities...
[Relay Warning] Upstream capabilities: tools, resources, prompts
```

Once running, the bridge waits for stdio requests from Cursor or another MCP client.

## How It Works
1. Reads configuration from env vars and builds the SSE endpoint URL.
2. Opens an EventSource connection (with optional headers) and instantiates the MCP client transport.
3. Probes the upstream server for tools, resources, and prompts to learn its capabilities.
4. Spins up a stdio MCP server that mirrors those capabilities and connects it to the parent process.
5. Forwards every MCP request (tool calls, resource reads, prompts) upstream and streams responses back over stdio.
6. If the SSE connection closes, schedules a reconnect with exponential backoff (capped at 30 s) while advertising downtime to the client.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `Failed to connect to upstream server` | Verify the upstream server is running, `BRIDGE_URL`/`BRIDGE_SSE_PATH` are correct, and the endpoint is reachable in a browser. |
| `Upstream server is not available` | The SSE link dropped. Check upstream logs; the bridge will retry automatically. |
| No tools/resources/prompts in Cursor | The upstream server may not implement those endpoints or returned an error during probing. Inspect its logs and run it manually. |
| Cursor cannot spawn the bridge | Ensure `npx` is on Cursor’s PATH or install globally via `npm install -g mcp-sse-bridge`. |
| Auth headers missing | Confirm `BRIDGE_HEADERS` is valid JSON (double-quoted keys and values). |

## Limitations
- Single client per bridge process.
- Assumes the upstream server starts before the bridge.
- No TLS certificate validation override—use system trust or tunnel locally.
- Designed for localhost workflows; production hardening (auth refresh, multi-session) is up to you.

## Development
- Main implementation: `index.js`
- Scripts: `npm start` (runs the bridge), `npm test` (alias to `npm start`)
- Contributions welcome—open an issue or PR if you need another transport or feature.

## License

MIT © Yifen Wu
