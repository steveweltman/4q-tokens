import { Domain, RegistryEntry } from "./types.js";

export const DOMAIN_BOOST = 0.20;

const DOMAIN_KEYWORDS: Record<Domain, string[]> = {
  email:      ['email', 'gmail', 'mail', 'message', 'thread', 'draft', 'inbox', 'attachment'],
  calendar:   ['calendar', 'event', 'meeting', 'schedule', 'appointment'],
  docs:       ['drive', 'document', 'sheet', 'spreadsheet', 'slide', 'file', 'folder'],
  newsletter: ['mailerlite', 'campaign', 'subscriber', 'group', 'newsletter', 'segment'],
};

export function classifyTool(tool: RegistryEntry): Domain | null {
  if (tool.provider.toLowerCase().includes('mailerlite')) return 'newsletter';

  const haystack = [tool.originalName, tool.title, tool.description, ...tool.tags]
    .join(' ')
    .toLowerCase();

  const scores: Record<Domain, number> = { email: 0, calendar: 0, docs: 0, newsletter: 0 };
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS) as Array<[Domain, string[]]>) {
    for (const kw of keywords) {
      if (haystack.includes(kw)) scores[domain]++;
    }
  }

  const best = (Object.entries(scores) as Array<[Domain, number]>).reduce((a, b) =>
    b[1] > a[1] ? b : a
  );
  return best[1] > 0 ? best[0] : null;
}

export function detectActiveDomain(
  recentRefs: string[],
  allTools: RegistryEntry[]
): Domain | null {
  if (recentRefs.length === 0) return null;

  const toolByRef = new Map(allTools.map((t) => [t.ref, t]));
  const counts: Record<Domain, number> = { email: 0, calendar: 0, docs: 0, newsletter: 0 };
  let classified = 0;

  for (const ref of recentRefs) {
    const domain = toolByRef.get(ref)?.domain;
    if (!domain) continue;
    counts[domain]++;
    classified++;
  }

  if (classified === 0) return null;

  const best = (Object.entries(counts) as Array<[Domain, number]>).reduce((a, b) =>
    b[1] > a[1] ? b : a
  );
  return best[1] >= Math.ceil(classified * 0.6) ? best[0] : null;
}
