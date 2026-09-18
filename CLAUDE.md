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
- **Real realtime voice.** Browser mic ↔ a `VoiceSession` (`src/lib/voice/`):
  Gemini Live (raw WebSocket + Web Audio, ephemeral `auth_tokens/…`) or OpenAI
  Realtime (`@openai/agents-realtime`, WebRTC, ephemeral `ek_`). Credentials are
  minted by `src/app/api/realtime/session/route.ts`. Never replace with
  record → upload → transcribe. Gemini is the default because its Live API is
  free-tier; keep both backends working.
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

- **Language stage is pedagogy, not config.** `resolveLanguageStage` in
  `src/lib/tutor/instructions.ts` maps `profile.preferences.language_mode`
  (auto | english_support | french_only) and the oral level to one of three prompt
  blocks. Beginners get real English; French-only is earned. Keep the Language
  switch on the main page as the only user-facing control for this.
- **Levels are the Échelle québécoise (1–12).** `src/lib/learner/levels.ts` owns the
  scale, descriptors and the CEFR equivalent shown next to every level. Never
  reintroduce CEFR strings as the stored value; old profiles migrate on parse.
- **The tutor is patient.** Turn detection (`gemini-setup.ts`, OpenAI `eagerness`)
  and the PATIENCE block in the prompt exist because the tutor used to talk over the
  learner. Do not shorten the silence window or make the VAD more eager without a
  voice test.
- **The program is code, not prompt.** `src/lib/learner/syllabus.ts` is the fixed
  syllabus (stable ids, never renumber; append new units). `merge.ts` decides
  done/next; the reviewer can only report `units_practiced` and pull one pending
  unit forward. Guided and lesson calls target `roadmap.current_unit`.
- **Adaptivity is code too.** `spacing.ts` (review dates), error→unit mapping
  (`unit_id` + keyword fallback), remediation / low-confidence triggers in
  `resolveMode`, and confidence decay in `merge.ts` are deterministic. The reviewer
  only supplies `unit_id` per error. Change thresholds in one place
  (`REMEDIATION_MIN_RECURRING`, `LOW_CONFIDENCE`, interval constants), with tests.
- **Placement is code.** `profile.placement` (pending | tested | self_selected):
  a pending placement makes the auto call an `assessment`, and only that review may
  jump levels past the one-step rule (`merge.ts`). The only other level override is
  the learner's own pick before session 1 (`placement.ts`, `PATCH /api/learner`).
  Units below the starting level are `credited`, not practised.
- **Onboarding is `npm install && npm run dev`.** `predev` runs `scripts/setup.mjs
  --if-needed` (silent when a key exists; asks for the Gemini key + name otherwise).
  Keep it zero-dependency and never block a non-interactive `npm run dev`.
- **Every session teaches and assesses.** First call is a placement (`assessment`) unless the learner picked a level;
  then `auto` cycles guided → lesson → quebec → guided → lesson → assessment. The
  `lesson` mode teaches one grammar point + 3–5 words; `assessment` covers all four
  competencies (typed answers and reading the on-screen transcript give the written
  ones evidence). Keep that rotation in `resolveMode`.

## Commands

| command | purpose |
| --- | --- |
| `npm run dev` | start the tutor (asks for the Gemini key the first time) |
| `npm run setup` | add / replace the Gemini key and learner name in `.env` |
| `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` | must all pass before finishing any task |
| `npm run verify:persistence` | writes state, re-reads from a child process; use it to prove Letta works |
| `npm run check:gemini` / `check:review` / `check:realtime` | live provider checks (no microphone needed) |

## Layout

```text
src/app/page.tsx                 the single screen (client); StartingLevel shows before session 1
src/app/review/page.tsx          Review Mistakes (server component)
src/app/api/realtime/session     POST: learner state → instructions → ek_ key
src/app/api/session/end          POST: evidence → review → merge → persist → summary
src/app/api/learner              GET: state + storeKind; PATCH: language_mode | starting_level | placement:"test"
scripts/setup.mjs                first-run key/name setup (npm run setup, predev)
src/hooks/useTutorSession.ts     realtime lifecycle, note_evidence tool, crash recovery
src/lib/learner/                 schema, stores, merge, render, defaults, levels, syllabus, spacing, placement
src/lib/voice/                   VoiceSession contract + gemini/openai implementations
src/lib/tutor/instructions.ts    tutor prompt builder (pedagogy lives here)
src/lib/tutor/gemini-setup.ts    Live API setup message, tool declaration, URLs
src/lib/tutor/review.ts          structured session review (gemini | openai)
tests/                           vitest; merge rules, stores, levels, syllabus, adaptive loop, prompt, two-session loop
```

## Working style

- **Planning, thinking, architecture and review: Opus 5** (the lead session). Opus
  reads the docs, decides the design, writes the plan, and reviews every result
  before it is committed.
- **Code changes: subagents on Sonnet 5 at medium effort.** Delegate implementation
  (a function, a component, a test file) to a Sonnet 5 subagent with
  `model: "sonnet"` and medium reasoning effort; give it the exact files, the plan
  step, and the acceptance check (typecheck / lint / test). The lead only makes
  trivial edits itself (a doc line, a constant).
- **Codex CLI as needed** (`codex exec`) for an independent review pass or a second
  opinion on a tricky change.
- Keep the product simpler than the machinery. If a change makes starting a
  conversation more complicated, it is wrong.
- Before finishing any task: `npm run typecheck`, `npm run lint`, `npm test`,
  `npm run build`, and `npm run check:gemini-setup` if the Live setup message changed.

## State of the project and what the next session must do first

Built 2026-09-17; Gemini Live made the default 2026-09-17; patience, the 12-level
Échelle québécoise, lesson/level-check modes, four-competency assessment, the
fixed syllabus program, and the adaptive layer (error→unit mapping, spaced review,
remediation drills, confidence decay) added 2026-09-18. Also 2026-09-18: one-command
onboarding (`npm run setup` / `predev`, blank LEARNER_* defaults) and placement
(real level jump on the placement call, or a self-picked starting level). Verified on this machine at
that point: typecheck, lint, 71 tests,
production build, `npm run check:gemini-setup` (Live API accepts the new VAD
config), and earlier Letta persistence across processes against the real Letta
Cloud agent. The OpenAI backend is optional; `check:realtime` / `check:review`
with `REVIEW_PROVIDER=openai` still need API credits on that account.

Next session, in order:

1. `npm run dev`, then have the user do the manual voice test with Gemini: press
   Start, wait for the greeting, answer slowly with a pause mid-sentence and confirm
   the tutor does not jump in. Say "je veux arrêter", press End, confirm the summary
   card and that `/review` shows levels as `n / 12 · stage · ≈ CEFR` and a Program
   section with a current unit (set by the first review).
2. If the tutor is still impatient in the voice test, first try
   `silenceDurationMs` 2000 in `src/lib/tutor/gemini-setup.ts`, then re-run
   `npm run check:gemini-setup`.
3. `npm run verify:persistence` → must print `PERSISTENCE VERIFIED via letta`
   (existing profiles with CEFR strings migrate to numbers on load).
4. If the Live connect fails, check `GEMINI_LIVE_MODEL` (`gemini-3.8-live`), the
   ephemeral-token response shape (`name`) in `src/app/api/realtime/session/route.ts`
   and the setup message shape in `gemini-setup.ts`.

After that, candidate improvements (not started): confidence time-decay, Letta
archival search for older sessions, pronunciation-aware feedback, a true
text-only session mode.
