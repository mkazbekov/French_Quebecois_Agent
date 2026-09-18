# Québec French Voice Tutor

A personal spoken-French tutor you call from the browser. Press one button, talk,
hear the tutor answer in natural Montréal French. When you hang up, the session is
reviewed and your learner profile is updated so the next call picks up where you left off.

```text
npm run dev  →  open http://localhost:3000  →  Start Conversation  →  talk
```

It runs on your own computer with your own **free Google Gemini API key**: Gemini Live
for the call, Gemini Flash for the end-of-call review. No paid account is needed.

## Quick start (5 minutes)

You need **[Node.js](https://nodejs.org) 20.9 or newer** (the LTS installer is fine),
a microphone, and a recent Chrome, Edge or Firefox.

**1. Download the project.** Either clone it:

```bash
git clone https://github.com/mkazbekov/French_Quebecois_Agent.git
cd French_Quebecois_Agent
```

or on GitHub press **Code → Download ZIP**, unzip it, and open a terminal in that folder.

**2. Install and start.**

```bash
npm install
npm run dev
```

The first time, `npm run dev` asks for your Gemini API key (see below), checks it with
Google, and saves it in a local `.env` file. After that, `npm run dev` just starts the tutor.

**3. Open http://localhost:3000.** The first time, the page asks two quick things:
what the tutor should call you, and how good your French is (or "Not sure — find my
level"; see [Your starting level](#your-starting-level)). Then press **Start Conversation**.
You won't be asked again; both are saved with your progress.

### Getting your free Gemini API key

1. Go to **https://aistudio.google.com/apikey** and sign in with any Google account.
2. Click **Create API key** (accept the terms if asked; pick or create any project).
3. Copy the key and paste it when `npm run dev` or `npm run setup` asks for it.

That's all. To replace the key later, run `npm run setup` again. You can also edit
`.env` by hand (`GEMINI_API_KEY=...`); it is git-ignored and never leaves your machine.
The key stays on the local server: the browser only ever gets a short-lived, single-use
token for each call.

The free tier is enough for daily practice. If Google reports a quota or region error,
check the key's limits in AI Studio; the error is shown on the page.

### Optional extras

Everything below is optional. `.env.example` lists every setting with a comment.

| variable         | what it does                                                                                     |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `LETTA_API_KEY`  | Keep your learner memory in [Letta Cloud](https://app.letta.com) instead of `./data/` on this computer. |
| `LETTA_BASE_URL` | Use a self-hosted Letta server instead (e.g. `http://localhost:8283`).                          |
| `OPENAI_API_KEY` | Use OpenAI Realtime for the voice (`VOICE_PROVIDER=openai`, paid account).                      |
| `LEARNER_ID`     | Keeps separate learners' progress apart on one machine / Letta account (default `learner`).     |

Without Letta, progress is saved in `./data/` on your computer and survives restarts.
The page footer shows which voice provider and memory backend are active.

### Troubleshooting

- **"No Gemini API key yet"** on the page: run `npm run setup`, then restart `npm run dev`.
- **The tutor can't hear you**: allow the microphone for `localhost` in the browser's
  site settings, and check the right input device is selected in your OS.
- **`npm run dev` doesn't ask for the key** (for example in some IDE terminals): run
  `npm run setup` in a normal terminal once.
- **Port 3000 in use**: `npm run dev -- -p 3001`, then open http://localhost:3001.

## Your starting level

On first launch, right after your name, the page asks **How's your French?** You can:

- **Pick your level.** Choose *Total beginner*, *I know the basics*, *Everyday
  conversations*, *Comfortable* or *Advanced*. The program starts at that level
  (guided practice on its first unit), and earlier units are counted as done.
- **Not sure — find my level.** Your first call is a relaxed placement chat: the tutor
  starts easy, climbs until things get hard, and has you type and read a little. When
  you hang up, your level in each competency (niveau 1 to 12) is set directly from what
  it observed, and the program starts there.

After that the tutor adjusts your level from evidence, one step per session, and the
**Level Check** chip runs a progress check any time.

**Changing your name or level later.** Open **Profile** on the main page: edit your
name, pick a different level (or an exact one of the 12), or **Retake the level test**,
which makes your next call a placement chat again without erasing your progress.

### Start over as a new learner

Open **Profile** on the main page and press **Delete profile & start over** to wipe
your saved name, level, progress and mistakes and go through onboarding again.
The same thing from the command line: `npm run reset:profile` (add `--yes` to skip
the confirmation). `LEARNER_ID` in `.env` picks which profile is deleted; if
`npm run dev` is running, restart it afterwards.

## Everyday use

```bash
npm run dev
```

Then:

1. Open http://localhost:3000
2. Press **Start Conversation** (allow the microphone the first time)
3. Talk. The tutor greets you first, then waits for you. Take your time: pauses while
   you think or search for a word are expected, and the tutor is tuned not to jump in.
4. End the call whenever you like (see below). A short summary appears and your progress is saved.

**Ending a call.** Any of these hangs up:

- **Say so.** "On arrête", "je dois y aller", "bye", "I have to go". The tutor says a
  short goodbye and the call hangs up by itself once the goodbye has finished playing.
  Saying "au revoir" to a character in a role-play does not end the call. If the tutor
  isn't sure, it asks "On arrête là pour aujourd'hui ?".
- **Press End Conversation**, or press **Esc**.
- **Cancel** while it is still connecting. The same red button, or Esc, stops it and
  nothing is saved.

The microphone and audio stop immediately. A "Call ended, saving your progress" screen
replaces the call while the review runs, which can take up to a minute or two.
You don't have to wait: the session is kept in the browser first, so you can close the
tab and it will be reviewed the next time you open the app. If the review fails, the
same retry happens automatically.

Nothing else to configure. Your very first call is a friendly **placement** (unless you
picked your level): the tutor probes all four competencies (listening, speaking,
reading, writing) so it knows where to start. After that, calls rotate automatically through practice, a lesson, a Québec
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
- **Drill My Errors**: a targeted drill on your recurring errors.

**Language switch** (how much English the tutor uses):

- **Auto** (default): follows your level. At niveau 1–2 the tutor is fully bilingual and
  teaches French in small steps. At niveau 3–4 it leads in French with English on
  standby. From niveau 5 it stays in French.
- **English help**: keep the bilingual style regardless of level.
- **French only**: French all the way, English only for a rare quick gloss.

The choice is saved in your learner profile. You can also just ask the tutor out
loud ("explain in English", "on continue en français").

**Review Mistakes** (link at the top) shows your level per competency, your progress
through the program, recurring errors, vocabulary being recycled, grammar points, and
the current focus.

## The program

There is a fixed syllabus behind the calls: for each of the 12 levels, a list of
units (grammar forms, things you do with the language, vocabulary themes, Québec usage
and culture), each with a stable id like `L3-G02` and a one-line goal. Guided practice
and lessons are built around the **current unit**. Units are marked done by code
after two sessions where you produced the target well (and at most half as many
struggles); the program then moves to the next unit in order. Gaps from lower levels
are filled before moving up, and one level above yours is always in reach. The
end-of-call review may pull a unit forward when your errors call for it, but cannot
skip or invent units. The Review page shows a progress bar per level and the unit
list for your level.

## How it adapts to you

- **Errors point at units.** Every recorded error is linked to the syllabus unit that
  teaches the fix (the reviewer names it, with a keyword fallback in code). Once an
  error becomes recurring, that unit jumps to the front of the program.
- **Spaced review.** Errors, vocabulary and finished units carry a review date. New
  errors come back in two days, improving ones in a week, resolved ones in three weeks
  as a check. Words come back tomorrow after a struggle and at doubling intervals once
  known. A finished unit is re-checked after two weeks, then at doubling intervals; if
  the check fails, the unit re-enters the program. Due items are listed in the prompt
  and on the Review page.
- **Remediation calls.** When two or more recurring errors are due, the next automatic
  call is a drill on them (never two drills in a row).
- **Confidence decay.** A competency the review said nothing about loses a little
  confidence each session; when confidence in your oral skills gets low, the next
  automatic call is a level check.

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

After placement (or your own pick), levels only ever move one step per session, and
only once there is enough evidence.
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
| `npm run dev`                 | start the tutor at http://localhost:3000 (asks for a key the first time)   |
| `npm run setup`               | add or replace your Gemini API key in `.env`                               |
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
