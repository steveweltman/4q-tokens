# MCP Proxy Gateway

A context-aware MCP proxy that reduces token usage by exposing only 2 tools (`mcp_search`, `mcp_call`) to LLMs instead of the full catalog.

## Why This Exists

When you connect multiple MCP servers to an LLM, every tool from every server is listed in the LLM's context window. For a typical workspace with 50-100 tools across multiple MCP servers, that's thousands of tokens of schema documentation on every request.

MCP Proxy Gateway sits between your LLM and your MCP servers, offering:

- **JIT tool loading** — tools from upstream servers are discovered once at startup, then tools are called on-demand. Clients never see the full catalog.
- **Intelligent search** — hybrid lexical + semantic search (BM25 + embeddings via `all-MiniLM-L6-v2`) to find the right tool for a query, ranked by relevance. Tool tokens are pre-computed at startup for fast per-query scoring.
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
- Semantic search is enabled by default using `@xenova/transformers` with the `all-MiniLM-L6-v2` model (~90MB download on first run, cached after). Falls back to lexical search automatically if the model fails to load.

## Installation

### From Source

```bash
git clone https://github.com/steveweltman/4q-tokens.git
cd 4q-tokens

pnpm install
pnpm build

# Install to ~/.local/bin and configure
./install.sh
```

### As a Dependency

```bash
npm install @arvoretech/mcp-proxy
```

## Getting Started: Google Workspace Example

Here's a concrete walkthrough to connect Google Workspace (Gmail, Calendar, Drive) to your LLM through the proxy:

### Step 1: Choose or Build an MCP Server for Google

You need an MCP server that wraps Google APIs. Options:

- **@antidrift/mcp-google** (recommended) — Supports Gmail, Calendar, Drive, Docs, Sheets
  ```bash
  npm install @antidrift/mcp-google
  # or
  npx @antidrift/mcp-google --help
  ```

- **@modelcontextprotocol/server-gmail** — Gmail-only, official MCP server
- **Build your own** — See the [MCP spec](https://modelcontextprotocol.io/) to wrap your own APIs

### Step 2: Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable these APIs:
   - Gmail API
   - Google Calendar API
   - Google Drive API
4. Create an OAuth 2.0 credential (type: Desktop application)
5. Download the credential JSON
6. Run the Google MCP server once to generate `token.json`:
   ```bash
   GOOGLE_CREDENTIAL_FILE=~/Downloads/credentials.json \
   npx @antidrift/mcp-google
   ```
   This opens a browser for you to authorize. Once done, it saves `token.json` locally.

### Step 3: Configure the Proxy

Create `~/.config/4q-tokens/config.json`:

```json
{
  "upstreams": [
    {
      "name": "google-workspace",
      "transport": "stdio",
      "command": "npx",
      "args": ["@antidrift/mcp-google"],
      "env": {
        "GOOGLE_TOKEN_FILE": "~/.local/share/google-mcp/token.json",
        "GOOGLE_CONNECTORS": "gmail,calendar,drive"
      }
    }
  ],
  "searchLimit": 5,
  "callItemLimit": 30,
  "maxTextLength": 800,
  "maxOutputTokens": 10000,
  "idleTimeoutMs": 600000
}
```

### Step 4: Start the Proxy

```bash
mcp-proxy
# Or via systemd if installed:
systemctl --user start mcp-proxy
```

### Step 5: Connect Your LLM

Configure your LLM to use `http://127.0.0.1:9200/mcp` as its MCP server. It will see:
- `mcp_search` — find tools by natural language
- `mcp_call` — invoke a tool
- `mcp_schema` — see tool details

Example query:
```
mcp_search("send an email")
# Returns: google_send_email (Gmail)

mcp_call(ref="google_send_email", args={"to": "user@example.com", "subject": "Hello", "body": "Test"})
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

Semantic search uses `@xenova/transformers` with `all-MiniLM-L6-v2`. On first run it downloads ~90MB to a local cache. If the download fails or the model fails to initialize, the proxy automatically falls back to lexical (BM25) search with no loss of core functionality.

To override the embedding model:

```bash
export MCP_PROXY_EMBEDDING_MODEL="Xenova/all-MiniLM-L6-v2"
```

Check logs for `[embeddings] Engine ready` to confirm semantic search is active.

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

## Security & Networking

The proxy binds to **`127.0.0.1` only** for security — it's not accessible from the network by default. To access remotely:

- **Same machine**: Connect locally on `127.0.0.1:9200`
- **Remote access**: Use Tailscale, SSH forwarding, or a VPN tunnel
  ```bash
  ssh -L 9200:127.0.0.1:9200 user@remote-host
  ```
- **Systemd service**: Access is local by default; no firewall rule needed

## Known Limitations

- **No automated tests** — this is production-quality code used daily, but test suite is not included
- **Embeddings cold start**: The `all-MiniLM-L6-v2` model (~90MB) downloads on first run and is cached locally. Subsequent starts use the cache. The proxy falls back to lexical (BM25) search automatically if the model fails to load.

## Changelog

### v1.17.1
- Pre-compute tool token sets at registry build time; lexical scoring now reads the cache instead of re-tokenizing on every query
- Add 50-entry LRU cache for query embeddings; repeated queries within a session skip model inference

### v1.17.0
- Switch embedding model from `paraphrase-multilingual-MiniLM-L12-v2` (12-layer, ~470MB, multilingual) to `all-MiniLM-L6-v2` (6-layer, ~90MB, English-optimized)
- Reduces cold-start download by ~380MB and halves per-query inference time with no accuracy loss for English deployments
- Reduces dependency attack surface (smaller model, fewer native components)

### v1.16.0
- Update `@modelcontextprotocol/sdk` from `~1.22.0` to `^1.26.0` — resolves 3 high-severity CVEs: ReDoS, cross-client data leak, DNS rebinding
- Add pnpm override: `protobufjs >=7.5.8` — resolves critical arbitrary code execution and multiple high CVEs in `@xenova/transformers` transitive dependency chain
- Add pnpm override: `qs >=6.15.2` — resolves moderate DoS vulnerability in `express` transitive dependency

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
