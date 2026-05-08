# MCP Proxy Gateway

A context-aware MCP proxy that reduces token usage by exposing only 2 tools (`mcp_search`, `mcp_call`) to LLMs instead of the full catalog.

## Why This Exists

When you connect multiple MCP servers to an LLM, every tool from every server is listed in the LLM's context window. For a typical workspace with 50-100 tools across multiple MCP servers, that's thousands of tokens of schema documentation on every request.

MCP Proxy Gateway sits between your LLM and your MCP servers, offering:

- **JIT tool loading** — tools from upstream servers are discovered once at startup, then tools are called on-demand. Clients never see the full catalog.
- **Intelligent search** — hybrid lexical + semantic search (BM25 + embeddings) to find the right tool for a query, ranked by relevance.
- **Token savings** — LLMs only see 3 tool schemas (search, call, schema) instead of 50+. Typical savings: 20-40% per turn for tool-heavy workflows.
- **Graceful degradation** — when embeddings fail (e.g., sharp module missing), falls back to lexical search automatically.

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your LLM                                │
│   (sees only: mcp_search, mcp_call, mcp_schema)                │
└────────────────────┬────────────────────────────────────────────┘
                     │
         ┌───────────▼──────────────┐
         │   MCP Proxy Gateway      │
         │ ┌──────────────────────┐ │
         │ │ Tool Registry        │ │
         │ │ (BM25 + Embeddings)  │ │
         │ └──────────────────────┘ │
         │ ┌──────────────────────┐ │
         │ │ Connector Manager    │ │
         │ │ (Idle timeout reap)  │ │
         │ └──────────────────────┘ │
         └────────────┬─────────────┘
                      │
        ┌─────────────┼─────────────┐
        │             │             │
        ▼             ▼             ▼
   ┌─────────┐  ┌─────────┐  ┌─────────┐
   │Google   │  │MailerLite│ │Your Svc │
   │Gmail    │  │ Campaigns│ │ Custom  │
   │Calendar │  │          │ │ Tools   │
   │Drive    │  │          │ │         │
   └─────────┘  └─────────┘  └─────────┘
```

## Prerequisites

- Node.js 18+ with npm or pnpm
- One or more MCP servers to proxy (stdio or HTTP)
- Optional: for semantic search, the `@xenova/transformers` library is pre-installed, but requires the `sharp` module for best performance

## Installation

### From Source

```bash
git clone https://github.com/arvoreeducacao/arvore-mcp-servers.git
cd arvore-mcp-servers/packages/mcp-proxy

pnpm install
pnpm build

# Optional: make available globally
pnpm link --global
```

### As a Dependency

```bash
npm install @arvoretech/mcp-proxy
```

## Configuration

### Quick Start with Environment Variables

```bash
export MCP_PROXY_UPSTREAMS='[
  {
    "name": "google",
    "transport": "stdio",
    "command": "node",
    "args": ["/path/to/google/server.mjs"],
    "env": {
      "GOOGLE_TOKEN_FILE": "token.json"
    }
  }
]'

export MCP_PROXY_SINGLETON_PORT=9200
export MCP_PROXY_DASHBOARD_PORT=9100

node dist/index.js
```

### Config File (Recommended)

Create `~/.config/4q-tokens/config.json`:

```json
{
  "upstreams": [
    {
      "name": "google-workspace",
      "transport": "stdio",
      "command": "node",
      "args": ["/home/user/.antidrift/tools/google/server.mjs"],
      "env": {
        "GOOGLE_TOKEN_FILE": "token.json",
        "GOOGLE_CONNECTORS": "gmail,calendar,drive"
      }
    },
    {
      "name": "mailerlite",
      "transport": "stdio",
      "command": "node",
      "args": ["/home/user/.antidrift/tools/mailerlite/server.mjs"],
      "env": {
        "MAILERLITE_API_KEY": "your-api-key-here"
      }
    },
    {
      "name": "external-api",
      "transport": "http",
      "url": "https://mcp.example.com/",
      "auth": {
        "apiKey": "API_KEY_ENV_VAR"
      }
    }
  ],
  "searchLimit": 3,
  "callItemLimit": 20,
  "maxTextLength": 500,
  "maxOutputTokens": 8000,
  "idleTimeoutMs": 300000
}
```

Then run:

```bash
node dist/index.js
```

The proxy will load the config from `~/.config/4q-tokens/config.json` if it exists, otherwise fall back to the `MCP_PROXY_UPSTREAMS` environment variable.

### Configuration Reference

#### Upstream Server Config

```json
{
  "name": "unique-id",
  "transport": "stdio" | "http",
  
  // For stdio transport:
  "command": "node",
  "args": ["path/to/server.mjs"],
  "cwd": "/working/dir",  // optional
  "env": { "KEY": "value" },  // optional
  
  // For http transport:
  "url": "https://example.com/mcp",
  "auth": {
    "apiKey": "ENV_VAR_NAME"  // reads from process.env[ENV_VAR_NAME]
  }
}
```

#### Proxy Options

| Option | Default | Description |
|--------|---------|-------------|
| `searchLimit` | 3 | Max tools returned by mcp_search |
| `callItemLimit` | 20 | Max items in mcp_call response |
| `maxTextLength` | 500 | Truncate text fields to N chars (detail=false: 500, detail=true: 1500) |
| `maxOutputTokens` | 8000 | Hard cap on response size |
| `idleTimeoutMs` | 300000 | Disconnect upstream servers after N ms of inactivity (0 = disabled) |

Environment variable overrides:

```bash
export MCP_PROXY_SEARCH_LIMIT=5
export MCP_PROXY_CALL_ITEM_LIMIT=30
export MCP_PROXY_MAX_TEXT_LENGTH=800
export MCP_PROXY_MAX_OUTPUT_TOKENS=10000
export MCP_PROXY_IDLE_TIMEOUT_MS=600000
```

## Running

### Standalone (Stdio Transport)

```bash
node dist/index.js
```

The proxy connects via stdio to your LLM. Use it with Claude or other MCP clients.

### As a Systemd User Service

The install script can set this up for you (see below), or manually:

1. Create `~/.config/systemd/user/mcp-proxy.service`:

```ini
[Unit]
Description=MCP Proxy Gateway
After=network.target

[Service]
Type=simple
ExecStart=%h/.local/bin/mcp-proxy
Restart=on-failure
RestartSec=5s
Environment="PATH=%h/.local/bin:/usr/local/bin:/usr/bin"

[Install]
WantedBy=default.target
```

2. Enable and start:

```bash
systemctl --user daemon-reload
systemctl --user enable mcp-proxy
systemctl --user start mcp-proxy
```

3. View logs:

```bash
journalctl --user -u mcp-proxy -f
```

### HTTP Server (Port 9200)

When `MCP_PROXY_SINGLETON_PORT` is set, the proxy starts an HTTP transport on that port. This allows multiple clients to connect to a single proxy instance.

```bash
export MCP_PROXY_SINGLETON_PORT=9200
node dist/index.js &

# From another process:
curl -X POST http://127.0.0.1:9200/mcp -H "Content-Type: application/json" \
  -d '{"jsonrpc": "2.0", "method": "tools/call", "params": {...}}'
```

## Troubleshooting

### Semantic Search Not Working

If embeddings fail with "Cannot find module 'sharp'", the proxy automatically falls back to lexical (keyword) search.

To enable semantic search, install the optional sharp module:

```bash
npm install sharp
```

If installation still fails (common on M1/M2 Macs or unusual architectures), the fallback is already in place. See error logs for details.

### Upstream MCP Server Won't Connect

Check the server logs in the dashboard (port 9100 by default) or daemon logs:

```bash
journalctl --user -u mcp-proxy -e
```

The proxy logs:
- Tool discovery on startup
- Connection failures with error messages
- Upstream stderr (piped from stdio servers)

### Proxy Crashes or Freezes

The proxy has comprehensive error handling to gracefully degrade on upstream failures:

- If an upstream tool call fails, the error is logged and returned to the client
- If embeddings init fails, lexical search takes over
- If all upstreams fail at discovery, startup fails with `NO_UPSTREAMS`

For unhandled errors, check:

```bash
journalctl --user -u mcp-proxy -n 50  # Last 50 lines
```

### Tool Returns No Data

When a tool returns `null` or malformed data, the output shaper handles it gracefully:

- Null results return `[]`
- Strings are wrapped as `{value: string}`
- CSV is auto-parsed if it looks like tabular data
- Raw binary content (images, files) is preserved via `_rawContent`

If a tool response looks truncated, retry with `detail=true` in mcp_call to disable output shaping:

```
mcp_call(ref="google_send_email", args={...}, detail=true)
```

## Attribution

MCP Proxy Gateway is a fork of [@arvoretech/mcp-proxy](https://github.com/arvoreeducacao/arvore-mcp-servers), originally created by **João Augusto** and **Árvore Educação**.

Forked for single-player use with enhancements:
- Singleton mode for HTTP bridge
- Idle server reaping
- Comprehensive error handling
- Config file support
- Systemd integration

## License

MIT. See [LICENSE](./LICENSE).
