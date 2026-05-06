#!/usr/bin/env node
// Phase 1 smoke test — starts 4q-tokens, verifies upstream connections, tests mcp_search
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const UPSTREAMS = [
  {
    name: "google-sbceh",
    transport: "stdio",
    command: "node",
    args: ["/home/sweltman/.antidrift/tools/google/server.mjs"],
    env: {
      ANTIDRIFT_GOOGLE_TOKEN: "token-sbceh.json",
      ANTIDRIFT_CONNECTORS: "gmail,calendar,drive,docs,sheets",
    },
  },
  {
    name: "google-cim",
    transport: "stdio",
    command: "node",
    args: ["/home/sweltman/.antidrift/tools/google/server.mjs"],
    env: {
      ANTIDRIFT_GOOGLE_TOKEN: "token-cim.json",
      ANTIDRIFT_CONNECTORS: "gmail,calendar,drive,docs,sheets",
    },
  },
  {
    name: "mailerlite",
    transport: "stdio",
    command: "node",
    args: ["/home/sweltman/.antidrift/tools/mailerlite/server.mjs"],
    env: {
      MAILERLITE_API_KEY: process.env.MAILERLITE_API_KEY || "",
    },
  },
];

const TIMEOUT_MS = 120_000; // 2 min — first run downloads ~470MB embedding model

let msgId = 1;
function msg(method, params = {}) {
  return JSON.stringify({ jsonrpc: "2.0", method, params, id: msgId++ }) + "\n";
}

function notif(method, params = {}) {
  return JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n";
}

const proc = spawn("node", ["dist/index.js"], {
  cwd: "/home/sweltman/projects/4q-tokens",
  env: {
    ...process.env,
    MCP_PROXY_UPSTREAMS: JSON.stringify(UPSTREAMS),
    MCP_PROXY_SINGLETON_PORT: "9201", // avoid conflict with a running instance
    MCP_PROXY_DASHBOARD_PORT: "9101",
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let registryLoaded = false;
let toolsList = null;
let searchResult = null;
let done = false;

const timer = setTimeout(() => {
  if (!done) {
    console.error("\n[test] TIMEOUT — killing process");
    proc.kill();
    process.exit(1);
  }
}, TIMEOUT_MS);

// Collect stderr (proxy logs)
proc.stderr.on("data", (chunk) => {
  const lines = chunk.toString().split("\n").filter(Boolean);
  for (const line of lines) {
    console.error("[proxy]", line);
    if (line.includes("Registry loaded")) {
      registryLoaded = true;
      if (toolsList) {
        console.error("\n[test] Registry ready — sending mcp_search...");
        proc.stdin.write(
          msg("tools/call", {
            name: "mcp_search",
            arguments: { query: "send email gmail" },
          })
        );
      }
    }
  }
});

// Parse stdout (MCP responses)
const rl = createInterface({ input: proc.stdout });
rl.on("line", (line) => {
  if (!line.trim()) return;
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return;
  }

  if (parsed.result?.serverInfo) {
    // initialize response — send initialized notification then tools/list
    console.error("[test] Got initialize response — sending tools/list...");
    const isBridge = parsed.result.serverInfo.name === "mcp-proxy-bridge";
    if (isBridge) {
      console.error("[test] Bridge mode detected — registry already loaded in primary");
      registryLoaded = true;
    }
    proc.stdin.write(notif("notifications/initialized"));
    proc.stdin.write(msg("tools/list"));
    return;
  }

  if (parsed.result?.tools) {
    toolsList = parsed.result.tools;
    console.error(`[test] tools/list → ${toolsList.length} tool(s):`);
    for (const t of toolsList) console.error(`  - ${t.name}`);
    if (registryLoaded) {
      console.error("\n[test] Registry ready — sending mcp_search...");
      proc.stdin.write(
        msg("tools/call", {
          name: "mcp_search",
          arguments: { query: "send email gmail" },
        })
      );
    } else {
      console.error("[test] Waiting for registry to load before searching...");
    }
    return;
  }

  // mcp_search result
  if (parsed.result?.content) {
    searchResult = parsed.result.content[0]?.text;
    console.error("\n[test] mcp_search result:");
    console.error(searchResult);

    done = true;
    clearTimeout(timer);

    const passed =
      toolsList?.length >= 2 &&
      registryLoaded &&
      searchResult &&
      !searchResult.includes('"error"');

    console.error("\n========== PHASE 1 RESULTS ==========");
    console.error(`pnpm build:      PASS (already done)`);
    console.error(`Server started:  PASS`);
    console.error(`tools/list:      ${toolsList?.length >= 2 ? "PASS" : "FAIL"} (${toolsList?.length ?? 0} tools exposed)`);
    console.error(`Registry loaded: ${registryLoaded ? "PASS" : "FAIL"}`);
    console.error(`mcp_search:      ${searchResult && !searchResult.includes('"error"') ? "PASS" : "FAIL"}`);
    console.error("=====================================\n");

    proc.kill();
    process.exit(passed ? 0 : 1);
  }
});

proc.on("error", (err) => {
  console.error("[test] Failed to spawn process:", err.message);
  process.exit(1);
});

// Send initialize
console.error("[test] Starting 4q-tokens...");
proc.stdin.write(
  msg("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "phase1-test", version: "1.0" },
  })
);
