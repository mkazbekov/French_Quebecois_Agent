/**
 * Québec French Tutor — feedback relay (Google Apps Script).
 *
 * What this is: a tiny web app hosted on Google's servers, running under the
 * project owner's own Google account. Learners never see this file or get
 * any credentials — their browser only ever calls the app's own
 * /api/feedback route, which (if configured) forwards to the public URL this
 * script is deployed at. See docs/FEEDBACK.md for the step-by-step setup.
 *
 * You do not need any Apps Script experience to use this. Two edits below
 * are all that's required: OWNER_EMAIL, and (optionally) MAX_MESSAGE_LENGTH.
 */

// Change this to the address that should receive feedback.
var OWNER_EMAIL = "mjkazbekov@gmail.com";

// Feedback messages longer than this are truncated before being emailed or
// stored anywhere, so a malformed or abusive request can't blow up quota.
var MAX_MESSAGE_LENGTH = 4000;

/**
 * Handles POST requests from the tutor's /api/feedback route.
 * Expected JSON body: { message, email?, app?, version?, platform?, provider?, sent_at? }
 * All fields except `message` are optional; anything else in the body is ignored.
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "Empty request body." });
    }

    var body;
    try {
      body = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonResponse({ ok: false, error: "Malformed JSON." });
    }

    if (!body || typeof body.message !== "string" || !body.message.trim()) {
      return jsonResponse({ ok: false, error: "Missing feedback message." });
    }

    var message = body.message.trim().slice(0, MAX_MESSAGE_LENGTH);
    var submitterEmail = typeof body.email === "string" ? body.email.trim() : "";
    var version = typeof body.version === "string" ? body.version : "";
    var platform = typeof body.platform === "string" ? body.platform : "";
    var provider = typeof body.provider === "string" ? body.provider : "";

    // --- 1. Send the feedback itself to the owner ---
    var subject = "Québec French Tutor feedback" + (version ? " (v" + version + ")" : "");
    var bodyLines = [message, ""];
    if (submitterEmail) bodyLines.push("From: " + submitterEmail);
    if (version) bodyLines.push("App version: " + version);
    if (platform) bodyLines.push("System: " + platform);
    if (provider) bodyLines.push("Voice provider: " + provider);

    MailApp.sendEmail({
      to: OWNER_EMAIL,
      replyTo: submitterEmail || OWNER_EMAIL,
      subject: subject,
      body: bodyLines.join("\n"),
    });

    // --- 2. If the submitter left an email, send them a short auto-reply ---
    if (submitterEmail && looksLikeEmail_(submitterEmail)) {
      MailApp.sendEmail({
        to: submitterEmail,
        subject: "Thanks for your feedback — Québec French Tutor",
        body:
          "Thanks for the feedback on the Québec French Tutor — I read every message.\n\n" +
          "This is an automatic confirmation; I may not reply personally, but your note " +
          "was received and helps shape what gets built next.\n\n" +
          "— Mirzabek",
      });
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    // Never let an unexpected error leak internal details back to the caller.
    return jsonResponse({ ok: false, error: "Server error." });
  }
}

/** Lets you smoke-test the deployment by opening the /exec URL in a browser. */
function doGet() {
  return jsonResponse({ ok: true });
}

function looksLikeEmail_(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
