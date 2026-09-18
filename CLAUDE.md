@AGENTS.md

# Québec French Voice Tutor — project guide for Claude

Persistent Québec French voice tutor. One button, real-time spoken French over
OpenAI Realtime (WebRTC), long-term learner memory in Letta. Read
`ARCHITECTURE.md` before changing anything structural; `README.md` has the user
setup and everyday flow.

## Non-negotiables

- **Zero-friction UX.** Normal use is `npm run dev` → open http://localhost:3000 →
  press Start Conversation → talk. Never add setup screens, provider pickers,
  agent selection, or per-session configuration.
- **Real realtime voice.** Browser mic ↔ OpenAI Realtime via `@openai/agents-realtime`
  (WebRTC, ephemeral `ek_` keys minted by `src/app/api/realtime/session/route.ts`).
  Never replace with record → upload → transcribe.
- **One canonical learner store.** `LearnerStore` (`src/lib/learner/store.ts`).
  Letta (`letta-store.ts`) when `LETTA_API_KEY`/`LETTA_BASE_URL` is set, else the
  local JSON `file-store.ts`. Never write learner state anywhere else, never both.
- **Schema is the contract.** Everything the tutor remembers is defined in
  `src/lib/learner/schema.ts` (zod). Extend it there first; Letta blocks and the
  file store follow automatically.
- **LLM observes, code decides.** `src/lib/tutor/review.ts` produces a `ReviewDelta`;
  `src/lib/learner/merge.ts` applies deterministic rules (level moves ≤1 step per
  session, errors dedup by pattern, recurring at 3). Do not let the model write
  state directly.
- **Secrets.** Real keys live only in `.env` (git-ignored) and are read via
  `src/lib/env.ts` on the server. Never import `env.ts` from client code, never log
  keys, never persist raw transcripts.

## Commands

| command | purpose |
| --- | --- |
| `npm run dev` | start the tutor |
| `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` | must all pass before finishing any task |
| `npm run verify:persistence` | writes state, re-reads from a child process; use it to prove Letta works |

## Layout

```text
src/app/page.tsx                 the single screen (client)
src/app/review/page.tsx          Review Mistakes (server component)
src/app/api/realtime/session     POST: learner state → instructions → ek_ key
src/app/api/session/end          POST: evidence → review → merge → persist → summary
src/app/api/learner              GET: state + storeKind
src/hooks/useTutorSession.ts     realtime lifecycle, note_evidence tool, crash recovery
src/lib/learner/                 schema, stores, merge, render, defaults
src/lib/tutor/instructions.ts    tutor prompt builder (pedagogy lives here)
src/lib/tutor/review.ts          structured session review
tests/                           vitest; merge rules, stores, prompt, two-session loop
```

## Working style

- Fable/lead owns architecture and review; delegate only bounded implementation
  tasks and review every result. Codex CLI is available (`codex exec`) for
  independent review passes.
- Keep the product simpler than the machinery. If a change makes starting a
  conversation more complicated, it is wrong.

## State of the project and what the next session must do first

Built 2026-09-17. Verified on this machine: typecheck, lint, 31 tests, production
build, file-store persistence across processes, and a production smoke test of
all routes. **Not yet verified live** because no `.env` existed: real OpenAI
Realtime voice, real Letta persistence, and the review model.

Next session, in order:

1. Confirm `.env` exists with `OPENAI_API_KEY` and `LETTA_API_KEY` (or
   `LETTA_BASE_URL`). If not, ask the user for them before anything else.
2. `npm run verify:persistence` → must print `PERSISTENCE VERIFIED via letta`.
   If Letta agent creation fails, check `LETTA_MODEL` (default `openai/gpt-4.1`)
   against `client.models.list()` and the `embedding` handling in `letta-store.ts`.
3. `npm run dev`, then have the user do the manual voice test: press Start, say
   "Salut, ça va bien", hear a reply, press End, confirm the summary card and
   that `/review` shows updated state. Restart the server and start again: the
   greeting should reference the previous call.
4. If the realtime connect fails, check first: `OPENAI_REALTIME_MODEL`
   (`gpt-realtime-2.1`), the transcription model name in both the route and the
   hook (`gpt-4o-transcribe`), and the `client_secrets` response shape
   (`value`, `expires_at`) in `src/app/api/realtime/session/route.ts`.
5. If the review fails, check `OPENAI_REVIEW_MODEL` (`gpt-5.6-luna`) and that
   `ReviewDeltaSchema` stays strict-compatible (no optional/default fields).

After that, candidate improvements (not started): confidence time-decay, Letta
archival search for older sessions, pronunciation-aware feedback, a true
text-only session mode.
