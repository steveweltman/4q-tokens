# 4Q-Tokens

**Context-aware MCP proxy for JIT tool loading — stop burning tokens on tools you're not using.**

Built on top of [`@arvoretech/mcp-proxy`](https://github.com/arvoreeducacao/arvore-mcp-servers) by [Árvore Educação](https://arvore.com.br). Full credit and thanks to João Augusto and the Árvore team for the solid foundation.

---

## The Problem

Every time your agent sends a message, it ships your entire MCP tool catalog to the LLM — all 60+ tool definitions, every single turn. Whether Grace is asking Esther what's on her calendar or just saying good morning, the model still processes Gmail tools, Sheets tools, MailerLite tools... all of them. That's thousands of tokens wasted, every message, all day.

## The Fix

4Q-Tokens sits between your agent and your MCP servers. Instead of 61 tools, the LLM sees 2:

- `mcp_search` — find the right tool by natural language query
- `mcp_call` — invoke it

The LLM's full conversation context drives the search. That's real contextual awareness — not keyword matching, not embeddings guessing. Claude (or DeepSeek, or whatever you're running) decides what it needs based on everything in the conversation, then asks for exactly that.

```text
Agent (OpenClaw / Cursor / Kiro / Claude Code)
  └─ 4q-tokens (2 tools)
       ├─ google-sbceh (Gmail, Calendar, Drive, Docs, Sheets)
       ├─ google-cim (Gmail, Calendar, Drive, Docs, Sheets)
       └─ mailerlite (23 tools)
```

## Upstream Foundation

This project forks and extends `@arvoretech/mcp-proxy` (MIT License). The core proxy engine — semantic search, hybrid BM25+cosine ranking, output shaping, pagination — is their work. What we're adding on top:

- **Session-aware context** — tool search weighted by conversation history
- **Domain tracking** — bias toward tools in the active workflow
- **OpenClaw-native wiring** — drop-in config for antidrift MCP servers

## Features (inherited from arvore)

- Semantic search via multilingual embeddings (`paraphrase-multilingual-MiniLM-L12-v2`)
- Hybrid ranking: BM25 lexical (0.4) + cosine similarity (0.6)
- Output shaping: strips redundant fields, truncates text, short refs
- Cursor-based pagination with 5-minute TTL
- stdio and HTTP transport support

## Configuration

```bash
MCP_PROXY_UPSTREAMS='[
  {
    "name": "google-sbceh",
    "command": "node",
    "args": ["/home/sweltman/.antidrift/tools/google/server.mjs"],
    "env": {
      "ANTIDRIFT_GOOGLE_TOKEN": "token-sbceh.json",
      "ANTIDRIFT_CONNECTORS": "gmail,calendar,drive,docs,sheets"
    }
  },
  {
    "name": "google-cim",
    "command": "node",
    "args": ["/home/sweltman/.antidrift/tools/google/server.mjs"],
    "env": {
      "ANTIDRIFT_GOOGLE_TOKEN": "token-cim.json",
      "ANTIDRIFT_CONNECTORS": "gmail,calendar,drive,docs,sheets"
    }
  },
  {
    "name": "mailerlite",
    "command": "node",
    "args": ["/home/sweltman/.antidrift/tools/mailerlite/server.mjs"],
    "env": { "MAILERLITE_API_KEY": "YOUR_KEY" }
  }
]'
```

## Development

```bash
pnpm build   # Compile TypeScript
pnpm dev     # Run with tsx (hot reload)
pnpm test    # Run tests
```

## License

MIT — same as the upstream. Built on the shoulders of giants. Credit Árvore Educação in your fork.
