# What's new

Plain-language notes on what changed in each version, newest first. The
version number is shown in the tutor's own footer (bottom of the page) —
that's the easiest way to check what you're running.

## 0.7.2 (2026-09-30)

- **Your profile now opens as a panel that fits the phone screen.** Tap "Profile" and a
  sheet slides up with your name, your level and the reset options, instead of everything
  unfolding in the header.
- **During a call, the transcript fills the screen right under the controls.** No more
  scrolling to the bottom to read what was said; the typing box sits at the bottom of the
  transcript.
- **The program card and the footer step aside during a call** so the conversation has
  the whole screen, and they come back as soon as the call ends.

## 0.7.1 (2026-09-30)

- **The tutor no longer goes quiet and then answers everything at once.** If the phone's
  screen turned off or the connection hiccuped mid-call, the tutor could seem to freeze and
  then, minutes later, respond to everything you had said in one go. Old audio is now
  dropped instead of piling up, and the tutor starts listening again as soon as you are back.
- **The screen stays on during a call**, so the phone doesn't fall asleep mid-conversation.
  This applies to both the computer and the phone.

## 0.7.0 (2026-09-30)

- **The tutor on an Android phone (preview).** A separate Android app runs the whole tutor
  on the phone: no computer needed. You paste your free Gemini key once, and it stays on
  the phone. Your progress is saved on the phone too. It isn't backed up to the cloud, and
  it doesn't sync with the computer version. See "Android phone (preview)" in the README.
- Nothing changes on Windows or Mac.

## 0.6.0 (2026-09-30)

- **The tutor is now its own app.** Double-click the icon and the tutor opens in its own
  window, with no browser tabs and no address bar. The black launcher window closes by
  itself, and closing the tutor window stops the tutor completely. There's nothing left
  running in the background.
- **Faster, steadier pages.** The tutor now runs a prepared (production) version of
  itself. The first start after installing or updating takes about a minute longer while
  it's prepared; every start after that is quicker.
- Links to other sites (like *Open in Gmail* on the feedback card) open in your normal
  browser. Prefer the old way? Set `TUTOR_WINDOW=browser`.

## 0.5.0 (2026-09-22)

- **Clear your learning history in one click.** A new *Clear learning history* button, at
  the bottom of the Review page and in the Profile panel, erases your progress, mistakes,
  vocabulary and past calls after one confirmation. Your name and settings stay, so you
  don't go through the first-time questions again; your next call starts by finding your
  level (or pick one yourself in Profile). *Delete profile & start over* is still there if
  you want to erase your name too.

## 0.4.1 (2026-09-22)

- **You hear the tutor's first words again.** The start of what the tutor said (most of
  all the greeting when a call opens) could appear in the transcript without ever being
  spoken, most noticeably on laptop speakers, which switch off during silence and take a
  moment to wake up. The sound is now switched on before the tutor starts talking, kept
  awake for the whole call with a hiss too faint to hear, and the greeting starts about
  half a second later so your speakers are ready for its first word.

## 0.4.0 (2026-09-21)

- **You can see that you get to choose.** 0.3.0 hid the eight kinds of call behind a small
  *change* link, and nobody found it. They are back on the page under the Start button —
  each one named plainly, with a line saying what the call will be like: *Just talk*,
  *Teach me something*, *Québec situation*, *Drill my mistakes*, *Check my level*…
- **"Tutor decides" now tells you what it decided.** The default option names its pick
  before you press Start ("Today it picks: Teach me something"), so letting the tutor choose
  is no longer a surprise.
- **The call says what it is.** While you are talking, the mode running is shown on the
  card — and when the tutor picked it for you, it says so. The summary at the end names it
  too, next to the length of the call.

## 0.3.0 (2026-09-21)

- **A new look.** The tutor is now set on paper rather than plain white: warm background,
  hairline rules instead of boxes and shadows, and the Québec blue from the app icon used
  as the app's own colour for the first time.
- **Your progress is on the front page.** Your level, the unit you're working on, how many
  mistakes keep coming back and how many reviews are due today now sit in a card beside the
  Start button. Before, all of that was hidden behind the "Review mistakes" link.
- **One line instead of seven buttons.** The row of session-type buttons is now a single
  line — *Today: Tutor decides · change* — so the Start button is the only thing asking for
  your attention. Every mode is still there behind **change**.
- **The transcript reads like a conversation**, not a chat app: each turn is labelled
  *Tutrice* or *Vous* down the left, no more coloured bubbles.
- **New app icon**: a speech bubble with an accent aigu cut out of it. The old one packed a
  square, a bubble and a fleur-de-lys inside each other, which turned into a smudge at the
  size a browser tab or a taskbar actually shows.
- On-screen lesson checks are now laid out like a exercise in a workbook, with A/B/C
  answers you can still say out loud, type, or click.

## 0.2.1 (2026-09-21)

- **Send feedback** now writes the email for you instead of sending it for you: press
  the button and your own mail app opens with the message ready for
  mjkazbekov@gmail.com — you read it and press send. If no mail app opens, the card
  offers **Copy message** and **Open in Gmail**.
- The optional "your email" box is gone: your message now comes from your own address,
  so replies just work.
- The app no longer sends anything anywhere when you give feedback. One less way for
  anything to leave your computer without you seeing it.

## 0.2.0 (2026-09-21)

**Upgrading from 0.1.0:** that version has no update check, so it cannot offer you
this one. Close the tutor and run the one-line install command once more (see
[Updating](README.md#updating)) — your key and progress are kept. After that,
updates are offered automatically every time you start the tutor.

- You can now see what you're saying as you say it: a live transcript during the conversation.
- Lessons now include short multiple-choice checks, so you can confirm what you just learned.
- Added a way to send feedback about the tutor from inside the app.
- The tutor now checks for a new version each time you start it, and offers to update.
- New app icon.
- Added a plain-language privacy statement.

## 0.1.0 (2026-09-18)

- First release: one-line install, one-click "Start Tutor" launcher, and real spoken conversation over Gemini Live.
- Learner levels follow the 12-level Échelle québécoise, shown next to its rough CEFR equivalent.
- A fixed lesson syllabus with adaptive review: mistakes are tracked and brought back later.
