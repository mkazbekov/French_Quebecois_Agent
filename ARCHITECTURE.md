# Architecture

One Next.js 16 app, one process, one URL. Voice is a realtime audio stream (Gemini Live or OpenAI Realtime); long-term
learner memory lives in Letta. Nothing else stores learner state.

```
Browser (React)
  VoiceSession (src/lib/voice): GeminiVoiceSession (Live API WebSocket + Web Audio)
                                or OpenAIVoiceSession (@openai/agents-realtime, WebRTC)
      │  ephemeral credential + tutor instructions
      ▼
Next.js API routes (server, holds the real API keys)
  POST /api/realtime/session   load learner state → build instructions → mint a
                               Gemini ephemeral token or an OpenAI ek_ key (VOICE_PROVIDER)
  POST /api/session/end        transcript + evidence → structured review → merge → persist
  GET  /api/learner            read-only view of learner state (header + review page)
  GET  /api/feedback           the feedback address + version/platform/provider, so the
                               form can compose a mailto: draft (no POST: nothing is sent)
  GET  /api/version            local package.json version vs. the published one (6h cache)
      │
      ▼
LearnerStore (src/lib/learner/store.ts)
  LettaLearnerStore   canonical. One Letta agent per learner; memory blocks hold
                      the state documents; archival passages hold session records.
  FileLearnerStore    only when LETTA_API_KEY is absent (local dev / CI). Same
                      interface, JSON file under ./data. Never both at once.
```

## Learner state (canonical documents)

Each document is a JSON value validated by zod (`src/lib/learner/schema.ts`)
and stored in one Letta memory block with the same label:

| block          | content                                             |
| -------------- | --------------------------------------------------- |
| profile        | name, languages, goals, preferences, session count, placement |
| competencies   | 4 competencies: level (Échelle québécoise 1–12), confidence, evidence, notes |
| errors         | recurring error registry (ERROR-001 …)              |
| vocabulary     | known / shaky / target words, Québec items          |
| grammar        | grammar points: status + notes                      |
| pronunciation  | reliably observed pronunciation issues              |
| roadmap        | current focus, reason, next practice, queue         |
| progress       | compact per-session log (date, mode, topics, delta) |

Session records (Markdown summaries, no raw transcript) are written as Letta
archival passages and the last few are pulled back into the prompt.

## Levels

`src/lib/learner/levels.ts` defines the scale: the Échelle québécoise des niveaux
de compétence en français (integers 1–12, stages débutant / intermédiaire / avancé),
a per-level descriptor used to calibrate both the tutor and the reviewer, and the
approximate CEFR equivalent (1–2 A1 … 11–12 C2) shown wherever a level is displayed.
Stored documents still accept the pre-2026-09-18 CEFR strings and migrate them on
parse (`StoredLevelSchema` in `schema.ts`). `merge.ts` moves a level by at most one
step per session toward the median of recent observations.

**Placement** (`profile.placement`, `src/lib/learner/placement.ts`): status
`pending` → `tested` | `self_selected`. While pending, every `auto` call is an
`assessment`; when such a call is reviewed, `merge.ts` sets each observed
competency directly to the observed level (no one-step cap), gives unobserved ones
the median, and marks the placement `tested`. The learner can instead pick a level
at any time (`PATCH /api/learner {starting_level}`, `setStartingLevel`: practised
units are kept, credited ones are recomputed) or retake the test
(`{placement: "test"}`, `retakePlacement`: before session 1 it resets to defaults,
after that it only sets the placement back to pending). Either way, syllabus units below the chosen level are recorded
as `done` with `credited: true` so the program starts at that level instead of
filling every lower-level gap; confidence starts at `PLACEMENT_CONFIDENCE` (0.35,
above `LOW_CONFIDENCE`). Old profiles without the field migrate to `tested` when
they have sessions, `pending` otherwise.

**Onboarding** (`profile.onboarded_at`): null until the learner finishes the
one-time card on the main page (`src/components/Onboarding.tsx`) — their name, then a
level pick or "find my level" (placement pending) — sent as one
`PATCH /api/learner {onboarding: {name, level}}`. The name lives only in
`profile.name`; `.env` holds no personal data. Old profiles that already have a name
and at least one session migrate to onboarded; everyone else sees the card once.
Name and level can be changed later from the Profile panel (`{name}`,
`{starting_level}`, `{placement: "test"}`).

## Program (syllabus)

`src/lib/learner/syllabus.ts` is the fixed learning program: units per level
(`L<level>-<G|F|T|Q><nn>`: grammar, function, theme, quebec), each with a goal.
Progress lives in `roadmap.units` (per-unit `ok` / `struggled` counters and a
derived status) and `roadmap.current_unit`. In `merge.ts`, a unit becomes `done`
when `ok >= 2 && ok >= 2 * struggled`; the next current unit is the first not-done
unit at level ≤ oral level + 1 in program order, unless the reviewer's
`suggested_focus.unit_id` names a pending unit to pull forward. The queue is
rebuilt from the syllabus every session. The tutor prompt carries the current unit,
the next four, and per-level progress; the reviewer sees the units in play and
reports `units_practiced` against those ids only.

## Adaptivity (spacing.ts)

`src/lib/learner/spacing.ts` owns spaced review. `merge.ts` sets `next_review` on
errors (by status: new/recurring 2 d, improving 7 d, resolved 21 d), vocabulary
(1 d unless known, then 2^n days capped at 60) and finished units (14 d, doubling
to 90 d; a `struggled` outcome on a done unit lapses it back to `in_progress`).
Errors carry `unit_id` (reviewer-provided, else `matchUnitForError` keyword match
in `syllabus.ts`); a recurring error whose unit is pending makes that unit current
ahead of program order. Unobserved competencies lose `CONFIDENCE_DECAY_PER_SESSION`.
`resolveMode` (instructions.ts) turns this into session plans: `remediation` when
`recurringDue` ≥ 2 (not twice in a row), `assessment` when oral confidence <
`LOW_CONFIDENCE` (not twice in a row), else the six-call cycle. The prompt carries a
DUE FOR REVIEW block built by `dueItems`.

## Session modes

`resolveMode` in `src/lib/tutor/instructions.ts`: while the placement is pending
the call is `assessment` (placement across the four competencies), then `auto` cycles
guided → lesson → quebec → guided → lesson → assessment. `lesson` is an explicit
grammar-point + vocabulary mini-lesson inside a conversation; `assessment` asks the
learner to read the on-screen transcript and to type answers so that written
comprehension/production get evidence too. Typed turns carry `typed: true` in the
transcript and the reviewer sees them as `LEARNER (typed)`.

The learner-facing side of the same set is `src/lib/tutor/modes.ts` (`MODE_COPY`: one
label, blurb and rough length per mode) — the only place those strings live, shared by
`ModePicker`, the banner naming the running mode on the call card, and `SummaryCard`. A
mode added to `SESSION_MODES` without copy fails `tests/modes.test.ts`. `GET /api/learner`
also returns `plannedMode` (`resolveMode("auto", state)`, read-only) so the picker can say
what "Tutor decides" is about to choose; the mode that actually ran comes back from
`POST /api/realtime/session` and is what the banner and the summary show.

## Turn-taking

The learner must never be interrupted while thinking. Gemini Live runs with
`END_SENSITIVITY_LOW`, `silenceDurationMs: 1500` and `prefixPaddingMs: 300`
(`gemini-setup.ts`); OpenAI uses `semantic_vad` with `eagerness: "low"`. The prompt's
PATIENCE section tells the tutor to stop after one question, wait through silence,
and never speak over the learner.

## Session lifecycle

1. Page load → `GET /api/learner` → header shows level + focus.
2. Start → `POST /api/realtime/session` (mode) → `{ provider, instructions,
   sessionId, gemini|openai credentials }` → browser opens a `VoiceSession`
   (Gemini Live WebSocket by default) → tutor greets first (client triggers one response).
3. During the call the tutor may call the client-side tools `note_evidence`
   (grammar error / vocab gap / good use / comprehension issue) and `ask_choice`
   (a 2-4 option check rendered by `QuizCard`; clicking an option sends the option
   text back as a normal user turn, flagged `choice` so the reviewer can tell it
   from speech or typing). The browser buffers evidence plus the transcript in
   memory and mirrors them to localStorage for crash recovery.
   Transcription arrives as deltas: finalized turns go to `onTranscript` (and into
   the saved evidence), while the sentence still being spoken goes to
   `onPartialTranscript` and is rendered live but never persisted.
4. End (button, or transport drop) → `POST /api/session/end` with transcript +
   evidence → structured review (delta, Gemini or OpenAI) → deterministic merge into the
   learner state → Letta blocks updated + passage written → summary returned.
5. Next start repeats step 2 with the updated state, so the tutor remembers.

## Versions and updating

`package.json` holds the version; `CHANGELOG.md` explains each one in plain language.
`scripts/version.mjs` (zero-dependency, shared by the launcher and the API route)
compares it against the published `package.json` on `main`. `scripts/launch.mjs` checks
on every start and offers the update; `scripts/update.mjs --apply` downloads the archive
to a temp dir and copies it over the install **in place** - it never deletes or moves the
install folder (the running shell holds handles on it), never touches `.env`, `data`,
`.runtime`, `node_modules` or `.git`, writes a changed root launcher script as
`<name>.new` (the shell reads those by byte offset while running) for the launcher to
swap in on the next start, and only removes files listed in its own
`.runtime/installed-files.json` manifest, so a learner-created file is never deleted.

## Why these choices

- Two voice providers behind one `VoiceSession` interface: Gemini Live has a
  free tier (audio in/out at no cost) and is the default when `GEMINI_API_KEY`
  is set; OpenAI Realtime remains available for paid accounts. The Gemini client
  is written against the raw Live API (WebSocket + AudioWorklet) so the app has
  no extra dependency; the message shapes are pinned in `src/lib/tutor/gemini-setup.ts`.
- `@openai/agents-realtime` over raw WebRTC for the OpenAI path: handles SDP,
  mic, playback, interruption, transcripts; the docs call it the recommended
  browser path.
- `@letta-ai/letta-client` over the new Letta Agent SDK: the Agent SDK wraps the
  Letta Code harness (sandboxes, repos, tool execution) and itself depends on
  letta-client for Cloud REST. Memory blocks + archival are exactly the primitives
  a learner model needs.
- Review is LLM-extract → code-merge: the model only reports what it observed;
  code owns level dampening, error frequency counting and deduplication, so one
  chatty session cannot rewrite the learner profile.
- No CopilotKit / Agents Everywhere: it adds a chat-UI framework around a
  product whose UI is one button.
