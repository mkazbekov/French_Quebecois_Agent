# In-app feedback

> Picking this work up fresh? Read [NEXT-SESSION-FEEDBACK.md](NEXT-SESSION-FEEDBACK.md)
> first — it says what is already built, what has never been tested, and the one
> decision still open (whether the relay URL ships with the app).

Learners can press **Send feedback** inside the tutor and send a note to
Mirzabek. The app itself never needs an API key for this: the "Send
feedback" button always works, either by relaying through a small script you
(the project owner) deploy once on your own Google account, or — if you
never deploy anything — by opening a pre-filled email draft in the learner's
own mail client. Nothing about the learner's session (transcript, profile,
keys) is ever included; only the message they type, their optional email,
and, if they opt in, three technical details (app version, OS, voice
provider).

## Option A — deploy the relay (recommended: learners get a smooth in-app send + auto-reply)

1. Go to [script.google.com](https://script.google.com) and click **New project**.
2. Delete the placeholder `Code.gs` contents and paste in the contents of
   [`docs/feedback-relay.gs`](./feedback-relay.gs) from this repo.
3. At the top of the script, set `OWNER_EMAIL` to the address that should
   receive feedback (defaults to `mjkazbekov@gmail.com`).
4. Click **Deploy → New deployment**.
   - Click the gear icon next to "Select type" and choose **Web app**.
   - **Execute as:** *Me* (your Google account — this is what lets the script
     send mail as you, without ever handing out your credentials).
   - **Who has access:** *Anyone* (this is what lets the deployed script
     receive requests from any learner's browser via the app's server; it
     does not expose your Google account or inbox — it only runs the
     `doPost`/`doGet` functions in the script).
   - Click **Deploy**, then **Authorize access** and approve the permissions
     (it needs to send email as you).
5. Copy the web app URL — it ends in `/exec`.
6. Put it in `.env` (and in a shipped copy if you distribute one):
   ```
   FEEDBACK_ENDPOINT=https://script.google.com/macros/s/AKfycb.../exec
   ```
   This URL is **not a secret** — it can only receive a feedback message and
   send two emails, nothing else, and anyone who has it can at most spam
   your feedback inbox. But it's also **not required**: if `FEEDBACK_ENDPOINT`
   is unset, the app falls back to the mailto draft below, so nothing breaks
   for learners who don't have it configured.
7. Smoke-test it:
   ```bash
   curl "https://script.google.com/macros/s/AKfycb.../exec"
   # {"ok":true}

   curl -X POST "https://script.google.com/macros/s/AKfycb.../exec" \
     -H "Content-Type: application/json" \
     -d '{"message":"test feedback","email":"you@example.com"}'
   # {"ok":true}
   ```
   Check that the feedback email (and, if you gave a test email, the
   auto-reply) actually arrived.

### Quota

A free Gmail account's `MailApp` quota is **100 recipients/day**. Each
feedback submission uses 1 (you) or 2 (you + an auto-reply) of that
allowance. This is more than enough for a small group of learners; if you
ever expect heavier traffic, a Google Workspace account raises the quota
substantially.

## Option B — no deployment: mailto + a Gmail auto-reply

If you'd rather not deploy anything, leave `FEEDBACK_ENDPOINT` unset. The
"Send feedback" button will open a pre-filled email draft (to
`mjkazbekov@gmail.com` by default, or whatever `FEEDBACK_EMAIL` is set to)
in the learner's own mail client — they just press send. You lose the
in-app "delivered" confirmation and the automatic reply, but senders can
still get a reply automatically if you set up a Gmail filter:

1. In Gmail, open **Settings → Advanced** and enable **Templates** (canned
   responses), then compose and save a short reply as a template
   (**Settings → General** view, More → Save as template while composing).
2. Go to **Settings → Filters and Blocked Addresses → Create a new filter**.
3. Match on the subject the app uses (`Québec French Tutor feedback`) or on
   your own address in "To" if you want it broader.
4. Under **Create filter**, choose **Send template** and pick the one you
   saved (this option only appears after you enable templates above).
5. Save the filter. Incoming feedback emails now get an automatic reply.

## Environment variables

See `.env.example`:

- `FEEDBACK_ENDPOINT` — the Apps Script `/exec` URL from Option A. Optional;
  unset means the mailto fallback is used instead.
- `FEEDBACK_EMAIL` — where feedback goes / who the mailto draft addresses.
  Defaults to `mjkazbekov@gmail.com`.
