# Québec French Voice Tutor

A personal spoken-French tutor you call from the browser. Press one button, talk,
hear the tutor answer in natural Montréal French. When you hang up, the session is
reviewed and your learner profile is updated so the next call picks up where you left off.

```text
npm run dev  →  open http://localhost:3000  →  Start Conversation  →  talk
```

## First-time setup

```bash
npm install
cp .env.example .env
```

Then edit `.env`:

| variable         | required | what it is                                                                 |
| ---------------- | -------- | -------------------------------------------------------------------------- |
| `OPENAI_API_KEY` | yes      | Used server-side only, to mint short-lived realtime keys and review sessions |
| `LETTA_API_KEY`  | recommended | Letta Cloud key from https://app.letta.com. Your learner memory lives here. |
| `LETTA_BASE_URL` | no       | Self-hosted Letta server instead of Letta Cloud (e.g. `http://localhost:8283`) |

Without a Letta key the app still works, but memory is kept in a local JSON file
under `./data/` (fine for trying it out; the footer of the page says which one is active).

## Everyday use

```bash
npm run dev
```

Then:

1. Open http://localhost:3000
2. Press **Start Conversation** (allow the microphone the first time)
3. Talk. The tutor greets you first and keeps the conversation going.
4. Press **End Conversation** when you're done. A short summary appears and your progress is saved.

Nothing else to configure. The optional chips under the button (Free Conversation,
Guided Practice, Québec Mode, Correction Mode) only change the flavour of the next
call; leaving them alone lets the tutor choose.

**Review Mistakes** (link at the top) shows your competency estimates, recurring
errors, vocabulary being recycled, and the current curriculum focus.

## How it works

See [ARCHITECTURE.md](ARCHITECTURE.md). Short version:

- Voice: browser ↔ OpenAI Realtime over WebRTC (`gpt-realtime-2.1`), via the
  OpenAI Agents SDK. The server mints a 10-minute client secret per call; the real
  API key never reaches the browser.
- Memory: one Letta agent per learner. Eight memory blocks hold the learner model
  (profile, four competencies, error registry, vocabulary, grammar, pronunciation,
  roadmap, progress); each finished session is written as an archival passage.
- Review: at the end of a call the transcript plus the tutor's live notes go through
  a structured review model. The model only reports observations; deterministic code
  merges them (levels move at most one step per session, errors are deduplicated and
  counted, vocabulary is promoted only after repeated correct use).

## Scripts

| command                      | purpose                                              |
| ---------------------------- | ---------------------------------------------------- |
| `npm run dev`                | start the tutor at http://localhost:3000             |
| `npm run build && npm start` | production build / serve                             |
| `npm test`                   | unit tests (merge rules, stores, prompt builder)     |
| `npm run typecheck`          | TypeScript                                           |
| `npm run lint`               | ESLint                                               |
| `npm run verify:persistence` | writes learner state, re-reads it from a fresh process, reports PASS/FAIL |

## Privacy

Raw transcripts are never persisted. Only compact learning evidence (error patterns,
vocabulary, level estimates, short session summaries) is stored. `.env` and `./data/`
are git-ignored.
