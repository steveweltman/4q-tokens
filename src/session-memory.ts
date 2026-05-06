import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

interface CallRecord {
  ref: string;
  calledAt: string;
}

interface MemoryData {
  calls: CallRecord[];
  updatedAt: string;
}

const DEFAULT_PATH = join(homedir(), ".config", "4q-tokens", "session-memory.json");
const PRUNE_AGE_MS = 24 * 60 * 60 * 1000;

// Recency boost tiers: most recent window wins
const BOOST_TIERS: Array<{ maxAgeMs: number; boost: number }> = [
  { maxAgeMs:  5 * 60 * 1000, boost: 0.40 },  // last 5 min
  { maxAgeMs: 30 * 60 * 1000, boost: 0.25 },  // last 30 min
  { maxAgeMs:  2 * 60 * 60 * 1000, boost: 0.12 },  // last 2 hours
  { maxAgeMs:  8 * 60 * 60 * 1000, boost: 0.05 },  // last 8 hours
];

export class SessionMemory {
  private calls: CallRecord[] = [];
  private readonly path: string;

  constructor(filePath?: string) {
    this.path = filePath ?? process.env.MCP_PROXY_SESSION_MEMORY_PATH ?? DEFAULT_PATH;
    this.load();
  }

  private load(): void {
    try {
      const raw = readFileSync(this.path, "utf8");
      const data = JSON.parse(raw) as MemoryData;
      this.calls = data.calls ?? [];
      this.prune();
      console.error(`[session-memory] Loaded ${this.calls.length} entries from ${this.path}`);
    } catch {
      this.calls = [];
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const data: MemoryData = {
        calls: this.calls,
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(this.path, JSON.stringify(data, null, 2), "utf8");
    } catch (error) {
      console.error(
        `[session-memory] Save failed: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  private prune(): void {
    const cutoff = Date.now() - PRUNE_AGE_MS;
    this.calls = this.calls.filter((c) => new Date(c.calledAt).getTime() > cutoff);
  }

  record(ref: string): void {
    this.calls.push({ ref, calledAt: new Date().toISOString() });
    this.prune();
    this.save();
    console.error(`[session-memory] +${ref} (${this.calls.length} total)`);
  }

  boost(ref: string): number {
    const now = Date.now();
    let minAge = Infinity;
    for (const c of this.calls) {
      if (c.ref === ref) {
        const age = now - new Date(c.calledAt).getTime();
        if (age < minAge) minAge = age;
      }
    }
    if (minAge === Infinity) return 0;
    for (const tier of BOOST_TIERS) {
      if (minAge <= tier.maxAgeMs) return tier.boost;
    }
    return 0;
  }

  get size(): number {
    return this.calls.length;
  }
}
