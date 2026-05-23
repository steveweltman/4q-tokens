import { RegistryEntry, SearchResult } from "./types.js";
import { ToolRegistry, tokenize } from "./registry.js";
import { SessionMemory } from "./session-memory.js";
import { detectActiveDomain, DOMAIN_BOOST } from "./domain.js";

export class HybridSearch {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly sessionMemory?: SessionMemory,
  ) {}

  search(query: string, limit: number): SearchResult[] {
    try {
      const tools = this.registry.getAll();
      if (tools.length === 0) return [];

      const queryTokens = tokenize(query);
      const providerHint = this.detectProvider(query, tools);

      const scored = tools.map((tool) => ({
        tool,
        score: this.lexicalScore(tool, queryTokens, providerHint),
      }));

      this.applySessionBoost(scored);
      this.applyDomainBoost(scored);
      scored.sort((a, b) => b.score - a.score);
      return scored
        .filter((s) => s.score > 0)
        .slice(0, limit)
        .map((s) => this.toSearchResult(s.tool));
    } catch (error) {
      console.error(
        `[search] Search failed: ${error instanceof Error ? error.message : error}`
      );
      return [];
    }
  }

  private lexicalScore(
    tool: RegistryEntry,
    queryTokens: string[],
    providerHint: string | null
  ): number {
    let score = 0;

    if (providerHint && tool.provider === providerHint) {
      score += 3;
    }

    for (const qt of queryTokens) {
      if (tool.cachedTokens.has(qt)) {
        score += 2;
        continue;
      }
      for (const tt of tool.cachedTokens) {
        if (tt.includes(qt) || qt.includes(tt)) {
          score += 1;
          break;
        }
      }
    }

    const toolNameLower = tool.originalName.toLowerCase();
    for (const qt of queryTokens) {
      if (toolNameLower.includes(qt)) {
        score += 1.5;
      }
    }

    return score;
  }

  private applySessionBoost(scored: Array<{ tool: RegistryEntry; score: number }>): void {
    if (!this.sessionMemory) return;
    for (const entry of scored) {
      const boost = this.sessionMemory.boost(entry.tool.ref);
      if (boost > 0) entry.score += boost;
    }
  }

  private applyDomainBoost(scored: Array<{ tool: RegistryEntry; score: number }>): void {
    if (!this.sessionMemory) return;
    const recentRefs = this.sessionMemory.recentRefs(5);
    const activeDomain = detectActiveDomain(recentRefs, this.registry.getAll());
    if (!activeDomain) return;
    console.error(`[search] active domain: ${activeDomain}`);
    for (const entry of scored) {
      if (entry.tool.domain === activeDomain) entry.score += DOMAIN_BOOST;
    }
  }

  private detectProvider(
    query: string,
    tools: RegistryEntry[]
  ): string | null {
    const lower = query.toLowerCase();
    const providers = [...new Set(tools.map((t) => t.provider))];
    for (const p of providers) {
      if (lower.includes(p.toLowerCase())) return p;
    }
    return null;
  }

  private toSearchResult(tool: RegistryEntry): SearchResult {
    const params = tool.mainParams.length > 0
      ? ` [${tool.mainParams.join(", ")}]`
      : "";
    return {
      ref: tool.ref,
      title: tool.title,
      hint: `${tool.description}${params}`,
    };
  }

}
