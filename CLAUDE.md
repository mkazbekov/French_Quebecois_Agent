@AGENTS.md

# Québec French Voice Tutor — project guide for Claude

Persistent Québec French voice tutor for any learner. One button, real-time spoken
French over Gemini Live (default) or OpenAI Realtime, long-term learner memory in
Letta (or a local JSON file). Nothing in the code, prompts or defaults may assume a
particular user: the learner's name and level come only from their saved profile. Read
`ARCHITECTURE.md` before changing anything structural; `README.md` has the user
setup and everyday flow.

## Non-negotiables

- **Zero-friction UX.** Learners install with one pasted line (`install-windows.ps1` /
  `install-mac.sh`) and then double-click the **Quebec French Tutor** Desktop icon, which
  runs `Start Tutor (Windows).bat` / `Start Tutor (Mac).command` → `scripts/launch.mjs`
  (portable Node if needed, key check, `npm ci`, `next dev -H 127.0.0.1`, open browser).
  Keep the launchers working on both OSes; README's install sections describe them
  step by step with screenshots in `docs/images/`. Developer use is `npm run dev` → open http://localhost:3000 →
  press Start Conversation → talk. The only setup screen is the one-time onboarding
  card (`src/components/Onboarding.tsx`: name → level or "find my level"), shown
  while `profile.onboarded_at` is null. Never add provider pickers, agent selection,
  or per-session configuration; name/level edits live in the collapsed Profile panel.
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
  the learner's own pick (`placement.ts`, `PATCH /api/learner`), allowed at any time;
  "Retake the level test" sets placement back to pending without erasing progress.
  Units below the chosen level are `credited`, not practised.
- **Onboarding is one launcher (or `npm install && npm run dev`).** `predev` runs `scripts/setup.mjs
  --if-needed` (silent when a key exists; asks only for the Gemini key otherwise).
  Keep it zero-dependency and never block a non-interactive `npm run dev`. The
  learner's name and starting level are asked once in the browser and stored in
  `profile` (never in `.env`); `LEARNER_ID` only separates stores on one machine.
- **Every session teaches and assesses.** First call is a placement (`assessment`) unless the learner picked a level;
  then `auto` cycles guided → lesson → quebec → guided → lesson → assessment. The
  `lesson` mode teaches one grammar point + 3–5 words; `assessment` covers all four
  competencies (typed answers and reading the on-screen transcript give the written
  ones evidence). Keep that rotation in `resolveMode`.

- **The transcript is live, the evidence is not.** Finalized turns go through
  `onTranscript` and are the only thing `SessionEvidence` ever sees; the sentence still
  being spoken goes through `onPartialTranscript`, is rendered dim in `TranscriptPanel`,
  and is never persisted. Keep those two channels separate.
- **Interactive checks are a tool.** `ask_choice` (both backends) renders `QuizCard`;
  a click sends the option text back as a user turn flagged `choice`, not `typed` —
  clicking is not written production. The tutor must still say the question out loud.
- **Updates are offered, never forced.** `scripts/launch.mjs` checks the published
  version on every start and asks once; `scripts/update.mjs` copies the new version over
  the install in place, never deleting the install folder, the launcher scripts it may be
  running from, or anything outside its own `.runtime/installed-files.json` manifest.
  `.env`, `data`, `.runtime`, `node_modules` and `.git` are untouchable. Bump
  `package.json` and add a plain-language `CHANGELOG.md` entry with every shipped change.
- **Nothing is collected.** No analytics, no telemetry, no phone-home. The only outbound
  calls are the voice/review provider, the version check (one file, nothing sent about the
  learner), and feedback the learner typed and sent themselves (`/api/feedback` →
  `FEEDBACK_ENDPOINT`, or a mailto: draft). The README's "Your privacy" section is the
  promise; keep it true.

## Commands

| command | purpose |
| --- | --- |
| `npm run dev` | start the tutor (asks for the Gemini key the first time) |
| `npm run setup` | add / replace the Gemini key in `.env` |
| `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` | must all pass before finishing any task |
| `npm run verify:persistence` | writes state, re-reads from a child process; use it to prove Letta works |
| `npm run reset:profile` | deletes the current learner's stored profile (Letta agent or file); confirms unless `--yes` |
| `npm run check:gemini` / `check:review` / `check:realtime` | live provider checks (no microphone needed) |
| `npm run update` / `check:update` | apply / report the published version (`scripts/update.mjs`) |
| `pwsh -File scripts/make-icons.ps1` | re-render `assets/*.png` + `tutor.ico` from the logo path data |

## Layout

```text
src/app/page.tsx                 the single screen (client); Onboarding until profile.onboarded_at is set
src/app/review/page.tsx          Review Mistakes (server component)
src/app/api/realtime/session     POST: learner state → instructions → ek_ key
src/app/api/session/end          POST: evidence → review → merge → persist → summary
src/app/api/learner              GET: state + storeKind; PATCH: onboarding | name | language_mode | starting_level | placement:"test"; DELETE: wipe the learner (back to onboarding)
src/app/api/feedback             POST: learner message -> FEEDBACK_ENDPOINT relay, else a mailto: fallback
src/app/api/version              GET: installed vs. published version (6h cache, never throws)
src/components/QuizCard.tsx      the on-screen multiple-choice check (ask_choice)
src/components/FeedbackCard.tsx  footer feedback form; VersionBadge.tsx shows the version
scripts/version.mjs              shared version helpers (launcher + /api/version)
scripts/update.mjs               in-place updater (--check | --apply)
scripts/make-icons.ps1           renders assets/*.png + tutor.ico from the logo path data
assets/                          tutor.ico + PNGs used by the installers and shortcuts
docs/FEEDBACK.md                 how to deploy the feedback relay (docs/feedback-relay.gs)
scripts/setup.mjs                first-run Gemini key setup (npm run setup, predev, launcher)
scripts/launch.mjs               one-click launcher behind the Start Tutor scripts (npm run start:app)
install-*.ps1 / install-mac.sh   one-line installers; Start Tutor (Windows).bat / (Mac).command
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

2026-09-18 (later): one-line installers + one-click launchers for Windows and macOS,
portable Node download, Gemini `AQ.` auth keys (default since May 2026) verified for
the key check, ephemeral tokens, Live and review. Windows flow verified end to end on
Windows 11 with Smart App Control on (a browser-downloaded .bat is blocked unless the
ZIP is unblocked, which is why the installer is the primary path). The macOS scripts
were verified on Linux/WSL only; a real Mac run is still pending.

2026-09-21 (v0.2.0): live streaming transcript (partial turns, never persisted),
on-screen multiple-choice checks (`ask_choice` → `QuizCard`, answerable by voice,
typing or click), version tracking + an ask-once in-place updater in the launcher,
an in-app feedback form with an optional Apps Script relay that auto-replies, a real
app icon (`assets/tutor.ico` + SVG favicon, rendered from one set of path data by
`scripts/make-icons.ps1`), and a plain-language privacy statement in the README.
Verified on this machine at that point: typecheck, lint, 156 tests, production build,
and `npm run check:gemini-setup` (the Live API accepts the setup message with the new
`ask_choice` declaration).

Not yet verified on real hardware, and worth doing first next session:

1. **Manual voice test** (the one that matters): `npm run dev`, press Start, and watch
   the transcript fill in *while* you and the tutor speak — no flicker, no sentence
   disappearing at the hand-over. Ask for a lesson and confirm a multiple-choice card
   appears, that the tutor also says the options out loud, and that answering by voice,
   by typing and by clicking all work.
2. **The one-click update** (the script path is already verified — see below; what is
   left is the double-click experience). A simulated v0.1.0 install on this machine
   updated cleanly to the published v0.2.0: key, progress and a learner-created file
   survived, a stale file listed in the manifest was removed, the running launcher was
   left alone and its `.new` copy was swapped in on the next start. Extraction on
   Windows tries `System32\tar.exe`, then `tar` on PATH, then `Expand-Archive` —
   a plain `tar` on PATH can be GNU tar, which cannot read a .zip, which is exactly
   how the first attempt failed. Still worth doing from the real Desktop icon once.
3. **The feedback relay**: deploy `docs/feedback-relay.gs`, put its `/exec` URL in
   `FEEDBACK_ENDPOINT`, and send one message end to end (delivery + auto-reply).
4. **macOS**: the icon application (`sips`/`iconutil`/NSWorkspace in `install-mac.sh`)
   and the `.command` launcher are still only tested on Linux/WSL.

After that, candidate improvements (not started): confidence time-decay, Letta
archival search for older sessions, pronunciation-aware feedback, a true
text-only session mode.
