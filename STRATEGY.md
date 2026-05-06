# 4Q-Tokens: Build Strategy

The goal is to move in small, testable steps. Each phase ends with something working that we can verify before moving on. Nothing gets built on top of something that isn't confirmed working.

---

## Phase 1 — Get It Building
**"Does the thing even run?"**
*Estimated time: 1-2 hours*

Install dependencies and compile the TypeScript code we inherited from arvore into runnable JavaScript. Then run it pointed at your real antidrift servers and verify it starts up without errors.

You'll know this is done when:
- `pnpm build` completes without errors
- 4q-tokens starts and reports it connected to all 3 upstream servers (google-sbceh, google-cim, mailerlite)
- Running `mcp_search` from the command line returns tool results

No OpenClaw changes yet. Just proving the foundation works.

---

## Phase 2 — Wire Into OpenClaw
**"Can Esther actually use it?"**
*Estimated time: 1-2 hours*

Replace the 3 MCP server entries in openclaw.json (google-sbceh, google-cim, mailerlite) with a single 4q-tokens entry. Restart OpenClaw. Test with Esther in Telegram.

You'll know this is done when:
- Esther can check Grace's calendar and get a real answer
- Esther can read or send a Gmail
- Response time is measurably faster than 61-tool direct loading
- Token counts in the trajectory file show mostly `mcp_search` + `mcp_call` instead of 61 tool definitions

This is the first real payoff. Even without the context layer, just having 2 tools instead of 61 will be a meaningful improvement.

**Decision needed before this phase:** Do you want to run 4q-tokens as a system service (always-on like OpenClaw), or have OpenClaw spawn it as a child process? Child process is simpler. Service is more robust. We'll discuss.

---

## Phase 3 — Session Memory
**"Does it remember what we were just doing?"**
*Estimated time: 4-6 hours*

This is the first thing we build that doesn't exist in the arvore code. Add a session store so 4q-tokens remembers which tools were called earlier in a conversation. When Esther searches for tools, recently-used ones rank higher.

Example: Grace asks about a calendar event. Esther calls a calendar tool. Two messages later Grace asks a follow-up. Without session memory, Esther searches cold. With it, calendar tools are already ranked at the top.

You'll know this is done when:
- Second and third messages in a conversation find the right tools faster than the first
- The tool search log shows "boosted by session history" for returning tools

**Decision needed before this phase:** Session memory lives in RAM by default (lost when 4q-tokens restarts). Do you want it persisted to disk so it survives restarts? Disk is more complex but more robust for Grace's use case.

---

## Phase 4 — Domain Awareness  
**"Does it know what kind of work we're doing?"**
*Estimated time: 4-6 hours*

Build on session memory to detect which "domain" is active in the conversation: email, calendar, documents, or newsletter. Once a domain is active, bias all searches toward it until the conversation shifts.

Example: Grace's conversation is clearly about her MailerLite newsletter. Every tool search should favor MailerLite tools without Esther having to re-discover them on every turn.

You'll know this is done when:
- A conversation that stays in one domain (e.g. email) never wastes a search round-trip on irrelevant tools
- Esther naturally follows a topic shift (email → calendar) within a few messages

---

## Phase 5 — Productize
**"Could someone else install this?"**
*Estimated time: 4-6 hours*

Clean up the rough edges, write the install documentation, and prep for npm publishing. This is what turns a personal tool into something worth $500.

- Clean error handling (what happens if Google MCP crashes mid-conversation?)
- Configurable via a single config file, not just env vars
- Install script that works on a fresh machine
- Test coverage on the critical paths (search, call, session tracking)
- npm publish under your account
- Pricing/licensing decision

---

## What We're Not Building (Yet)

- A web dashboard (the arvore code has one, it's fine for now)
- Multi-tenant support (one instance per OpenClaw, that's enough)
- Support for non-antidrift MCP servers (future expansion)
- Billing/license enforcement (manual for the first few customers)

---

## Order of Decisions

Before we start Phase 1, you don't need to decide anything — just show up.

Before Phase 2: child process vs. service
Before Phase 3: RAM-only vs. persistent session storage
Before Phase 5: pricing model and npm account setup

---

## How We'll Work

Each session we'll pick up at the current phase. I'll tell you exactly what to run, explain what it's doing and why, and flag any decision points before we hit them. You don't need to understand the TypeScript internals — you need to understand what each piece does so you can make good decisions about your own product.
