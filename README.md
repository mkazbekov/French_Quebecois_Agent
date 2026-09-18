# Québec French Voice Tutor

A personal spoken-French tutor you call from the browser. Press one button, talk,
hear the tutor answer in natural Montréal French. When you hang up, the session is
reviewed and your learner profile is updated so the next call picks up where you left off.

```text
npm run dev  →  open http://localhost:3000  →  Start Conversation  →  talk
```

Voice and review run on **Google Gemini** by default (Gemini Live for the call,
Gemini Flash for the end-of-call review), which is free-tier eligible. Learner memory
lives in **Letta**. OpenAI Realtime is available as an alternative voice backend for
paid accounts.

## First-time setup

```bash
npm install
cp .env.example .env
```

Then edit `.env`:

| variable         | required    | what it is                                                                                   |
| ---------------- | ----------- | -------------------------------------------------------------------------------------------- |
| `GEMINI_API_KEY` | yes         | Google Gemini key from https://aistudio.google.com/apikey. Voice + review, free tier.         |
| `LETTA_API_KEY`  | recommended | Letta Cloud key from https://app.letta.com. Your learner memory lives here.                   |
| `LETTA_BASE_URL` | no          | Self-hosted Letta server instead of Letta Cloud (e.g. `http://localhost:8283`).               |
| `OPENAI_API_KEY` | no          | Only if you want the OpenAI Realtime backend (`VOICE_PROVIDER=openai`, paid).                 |

With a Gemini key alone the whole tutor runs at no cost. Without a Letta key the app
still works, but memory is kept in a local JSON file under `./data/`. The page footer
shows which voice provider and memory backend are active.

## Everyday use

```bash
npm run dev
```

Then:

1. Open http://localhost:3000
2. Press **Start Conversation** (allow the microphone the first time)
3. Talk. The tutor greets you first, then waits for you. Take your time: pauses while
   you think or search for a word are expected, and the tutor is tuned not to jump in.
4. Press **End Conversation** when you're done. A short summary appears and your progress is saved.

Nothing else to configure. Your very first call is a friendly **placement**: the tutor
probes all four competencies (listening, speaking, reading, writing) so it knows where
to start. After that, calls rotate automatically through practice, a lesson, a Québec
role-play, practice, a lesson, and a level check.

**Text box.** Under the transcript there is a text field. The tutor will sometimes ask
you to *type* an answer (that is how it assesses your writing) or to *read* what it
just said on screen (reading). You can also type any time instead of speaking.

**Mode chips** (optional, under the button) force the flavour of the next call:

- **Free Conversation**: fluency first, light corrections.
- **Guided Practice**: the conversation is steered toward your current roadmap focus.
- **Lesson**: one grammar point explained and drilled, three to five new words, then used live.
- **Québec Mode**: role-play of one Montréal situation (dépanneur, STM, landlord, winter…).
- **Correction Mode**: explicit one-line corrections after each clear error.
- **Level Check**: evidence gathering across the four competencies; no score is announced.

**Language switch** (how much English the tutor uses):

- **Auto** (default): follows your level. At niveau 1–2 the tutor is fully bilingual and
  teaches French in small steps. At niveau 3–4 it leads in French with English on
  standby. From niveau 5 it stays in French.
- **English help**: keep the bilingual style regardless of level.
- **French only**: French all the way, English only for a rare quick gloss.

The choice is saved in your learner profile. You can also just ask the tutor out
loud ("explain in English", "on continue en français").

**Review Mistakes** (link at the top) shows your level per competency, recurring
errors, vocabulary being recycled, grammar points, and the current curriculum focus.

## Levels

Progress is tracked on the **Échelle québécoise des niveaux de compétence en français**
(12 levels, four competencies: compréhension orale, production orale, compréhension
écrite, production écrite). The approximate CEFR equivalent is shown next to every level.

| Échelle québécoise | stage         | CEFR ≈ |
| ------------------ | ------------- | ------ |
| 1–2                | débutant      | A1     |
| 3–4                | débutant      | A2     |
| 5–6                | intermédiaire | B1     |
| 7–8                | intermédiaire | B2     |
| 9–10               | avancé        | C1     |
| 11–12              | avancé        | C2     |

Levels only ever move one step per session, and only once there is enough evidence.
Profiles saved before this scale existed (CEFR strings) are migrated on load.

## How it works

See [ARCHITECTURE.md](ARCHITECTURE.md). Short version:

- Voice: **Gemini Live** (`gemini-3.8-live`, raw WebSocket + Web Audio, ephemeral
  token per call). OpenAI Realtime (`gpt-realtime-2.1`, WebRTC via the OpenAI Agents
  SDK) sits behind the same button when `VOICE_PROVIDER=openai`. The real API key never
  reaches the browser. Turn detection is set to be patient (long silence window, low
  end-of-speech sensitivity) and the prompt tells the tutor to wait rather than fill silence.
- Memory: one Letta agent per learner. Eight memory blocks hold the learner model
  (profile, four competencies, error registry, vocabulary, grammar, pronunciation,
  roadmap, progress); each finished session is written as an archival passage.
- Review: at the end of a call the transcript plus the tutor's live notes go through
  a structured review model (Gemini Flash by default, JSON-schema constrained). The
  model only reports observations; deterministic code merges them (levels move at most
  one step per session, errors are deduplicated and counted, vocabulary is promoted
  only after repeated correct use).

## Scripts

| command                       | purpose                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                 | start the tutor at http://localhost:3000                                   |
| `npm run build && npm start`  | production build / serve                                                   |
| `npm test`                    | unit tests (merge rules, stores, levels, prompt builder, two-session loop) |
| `npm run typecheck`           | TypeScript                                                                 |
| `npm run lint`                | ESLint                                                                     |
| `npm run verify:persistence`  | writes learner state, re-reads it from a fresh process, reports PASS/FAIL  |
| `npm run check:gemini-setup`  | confirms the Live API accepts the exact setup message the browser sends    |
| `npm run check:gemini`        | live 3-turn text→speech session against Gemini Live (protocol check, no mic) |
| `npm run check:review`        | live structured session review with the configured provider               |
| `npm run check:realtime`      | same protocol check for the OpenAI backend (needs credits)                 |

## Privacy

Raw transcripts are never persisted. Only compact learning evidence (error patterns,
vocabulary, level estimates, short session summaries) is stored. `.env` and `./data/`
are git-ignored.
