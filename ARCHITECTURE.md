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
| profile        | name, languages, goals, preferences, session count  |
| competencies   | 4 competencies: level, confidence, evidence, notes  |
| errors         | recurring error registry (ERROR-001 …)              |
| vocabulary     | known / shaky / target words, Québec items          |
| grammar        | grammar points: status + notes                      |
| pronunciation  | reliably observed pronunciation issues              |
| roadmap        | current focus, reason, next practice, queue         |
| progress       | compact per-session log (date, mode, topics, delta) |

Session records (Markdown summaries, no raw transcript) are written as Letta
archival passages and the last few are pulled back into the prompt.

## Session lifecycle

1. Page load → `GET /api/learner` → header shows level + focus.
2. Start → `POST /api/realtime/session` (mode) → `{ clientSecret, instructions,
   sessionId, voice, model }` → browser creates `RealtimeAgent` + `RealtimeSession`
   → `connect()` → tutor greets first (client triggers one response).
3. During the call the tutor may call the client-side tool `note_evidence`
   (grammar error / vocab gap / good use / comprehension issue). The browser
   buffers those plus the transcript in memory and mirrors them to localStorage
   for crash recovery.
4. End (button, or transport drop) → `POST /api/session/end` with transcript +
   evidence → structured review (delta, Gemini or OpenAI) → deterministic merge into the
   learner state → Letta blocks updated + passage written → summary returned.
5. Next start repeats step 2 with the updated state, so the tutor remembers.

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
