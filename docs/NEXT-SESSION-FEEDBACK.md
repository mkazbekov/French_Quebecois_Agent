# Next session: finish the "Send feedback" feature

Start here. This file is the whole context for the remaining work on feedback —
read it, then read `docs/FEEDBACK.md` (the owner-facing setup guide) and
`src/app/api/feedback/route.ts` (30 lines, the whole server side).

**Status: the app side is built, tested and shipped in v0.2.0. What is missing is the
delivery path — the relay has never been deployed, so no feedback has ever actually
reached an inbox, and the auto-reply has never fired.** Everything below is about
closing that gap and deciding how it ships to learners.

---

## What already exists

| File | What it does |
| --- | --- |
| `src/components/FeedbackCard.tsx` | The footer form: message, optional email, opt-in technical details, Send/Cancel. Verified rendering in a browser. |
| `src/lib/feedback.ts` | Pure: `FeedbackInputSchema`, `buildFeedbackPayload`, `buildMailtoUrl`, `looksLikeEmail`. 14 tests in `tests/feedback.test.ts`. |
| `src/app/api/feedback/route.ts` | `GET` → `{ endpointConfigured, contact }`. `POST` → forwards to `FEEDBACK_ENDPOINT` (10s timeout) and returns `{ delivered: true, autoReply }`; on **no endpoint or any failure** returns `{ delivered: false, mailto, contact }` and the form opens a pre-filled draft. |
| `src/lib/env.ts` | `FEEDBACK_ENDPOINT` (optional) and `FEEDBACK_EMAIL` (defaults to `mjkazbekov@gmail.com`). |
| `docs/feedback-relay.gs` | The Google Apps Script web app: `doPost` emails the owner and auto-replies to the sender; `doGet` returns `{ok:true}` for smoke tests. Edit `OWNER_EMAIL` (line 15) before deploying. |
| `docs/FEEDBACK.md` | Owner-facing setup, quota notes, and the no-deploy alternative. |
| `.env.example` | Both variables, documented as optional. |

Verified locally on 2026-09-21 (dev server, real HTTP):

```text
GET  /api/feedback                    → {"endpointConfigured":false,"contact":"mjkazbekov@gmail.com"}
POST /api/feedback {"message":""}     → {"error":"Please write a message before sending."}
POST /api/feedback {...real message}  → {"delivered":false,"mailto":"mailto:mjkazbekov@gmail.com?subject=..."}
```

So: the fallback path works end to end. The relay path has never been exercised.

---

## Step 1 — Deploy the relay (only the owner can do this)

This needs Mirzabek's own Google account; an agent cannot do it. Walk the user through it,
or have them do it and paste back the `/exec` URL.

1. <https://script.google.com> → **New project**.
2. Replace the contents of `Code.gs` with `docs/feedback-relay.gs`.
3. Confirm `OWNER_EMAIL` on line 15 is the right address.
4. **Deploy → New deployment → Web app**, with **Execute as: Me** and
   **Who has access: Anyone**. Authorize when Google asks (the "unverified app" warning
   is expected for your own script — *Advanced → Go to project*).
5. Copy the `/exec` URL.

## Step 2 — Wire it up and prove it works

```bash
# In the tutor folder, put the URL in .env:
#   FEEDBACK_ENDPOINT=https://script.google.com/macros/s/…/exec

# Relay is alive?
curl -s "$FEEDBACK_ENDPOINT"

# Relay accepts a message directly?
curl -s -X POST -H 'content-type: application/json' \
  -d '{"message":"relay smoke test","email":"<a second address you own>"}' \
  "$FEEDBACK_ENDPOINT"

# The app forwards it? (dev server running)
curl -s -X POST -H 'content-type: application/json' \
  -d '{"message":"end to end from the app","email":"<same address>","include_details":true}' \
  http://localhost:3000/api/feedback
```

Then check **three** things, not one:

- the owner inbox received the message (and the reply-to is the sender's address);
- the sender address received the **auto-reply**;
- the app returned `{"delivered":true,"autoReply":true}` and the card said
  "Thanks — this went to Mirzabek. You'll get a confirmation at …".

Finally click through it in the UI once: footer → **Send feedback** → send with and
without an email address.

## Step 3 — Decide how learners get it (the real open question)

Right now `FEEDBACK_ENDPOINT` lives in `.env`, which is **git-ignored and per-machine** —
so every learner's install has it unset and falls back to the mailto draft. That makes
the feature almost pointless for the people it is for. Options, with the trade-off:

- **A. Bake the URL into the code** (e.g. a default in `src/lib/env.ts`, overridable by
  the env var). The `/exec` URL is *not* a secret — it can only accept a bounded message
  and send two emails — so this is defensible, and it is the only option where a learner
  who never touches a terminal actually gets the smooth path. Cost: the URL is public in
  the repo, so it can be POSTed to by anyone who finds it, and the daily quota is shared.
- **B. Leave it opt-in** (today's behaviour). Nothing to abuse, but effectively everyone
  gets the mailto draft, and a learner without a configured mail client gets nothing.
- **C. Bake it in, with a spam brake**: a shared secret header the app sends and the
  relay checks (weak — it ships in the install too), plus a per-deployment daily cap in
  the script and a `PropertiesService` counter. Slows casual abuse, not a determined one.

Recommendation if you want the feature to exist for real learners: **A, plus the caps
from C inside the Apps Script** (they cost nothing and protect the 100 emails/day free
Gmail quota noted in `docs/FEEDBACK.md`). Ask the user before shipping A — publishing
the endpoint is their call, not the agent's.

## Step 4 — Only after Step 3 is decided

- If A or C: set the default, update `.env.example` and `docs/FEEDBACK.md` to say the
  endpoint ships by default and how to point it elsewhere, and add a line to the
  README's privacy section — it currently says feedback is sent "only if you type a
  message and press Send", which stays true either way, but the destination should be
  named.
- Bump `package.json` + add a `CHANGELOG.md` entry (see the rules in `CLAUDE.md`).
- `npm run typecheck && npm run lint && npm test && npm run build` before finishing.

---

## Constraints that must not be broken

- **No credentials in a learner's install.** That is why the relay is a public web app
  under the owner's account and not an SMTP/Resend key. See `CLAUDE.md` → Secrets.
- **Only what the learner typed leaves the machine.** `buildFeedbackPayload` has an
  exact allow-list (`message`, `email`, `app`, `sent_at`, plus `version`/`platform`/
  `provider` *only* when the box is ticked). `tests/feedback.test.ts` asserts the exact
  key set in both directions — if you add a field, that test should fail first.
- **Never log or echo the endpoint URL** or any env value in a response.
- **The form must never block the app.** Every failure path falls back to mailto; no
  thrown errors, no spinners that can hang.

## Nice-to-haves, if there is time

- A "was this delivered?" state that survives a reload (currently in-memory only).
- Let the learner attach the last session summary (explicit, opt-in, one extra checkbox)
  — useful for "the tutor did X" reports, but re-read the privacy promise first.
- A `scripts/check-feedback.mts` live check in the style of `check:gemini`, so delivery
  can be verified without a browser.
