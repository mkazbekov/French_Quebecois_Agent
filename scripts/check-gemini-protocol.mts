import "dotenv/config";
import { GeminiLiveProtocol } from "../src/lib/voice/gemini-protocol";
import { buildGeminiLiveSetup, geminiLiveUrlForApiKey } from "../src/lib/tutor/gemini-setup";
import type { LiveEvidence, TranscriptTurn } from "../src/lib/learner/schema";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY missing");
const model = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live";

let audioBytes = 0;
let turnCompleteCount = 0;
let lastTranscript: TranscriptTurn[] = [];
let lastAssistantCount = 0;
const evidence: LiveEvidence[] = [];

function waitForTurnComplete(protocol: GeminiLiveProtocol, from: number, timeoutMs = 30_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      if (turnCompleteCount > from) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("timed out waiting for turnComplete"));
      setTimeout(tick, 200);
    };
    tick();
  });
}

async function main() {
  const protocol = new GeminiLiveProtocol({
    onAudioChunk: (bytes) => {
      audioBytes += bytes.byteLength;
    },
    onTranscript: (turns) => {
      lastTranscript = turns;
      const assistantCount = turns.filter((t) => t.role === "assistant").length;
      if (assistantCount > lastAssistantCount) {
        lastAssistantCount = assistantCount;
        turnCompleteCount++;
      }
    },
    onActivity: () => {},
    onEvidence: (e) => {
      evidence.push(e);
    },
    onInterrupted: () => {},
    onSetupComplete: () => {
      console.log("setup complete:", model);
    },
    onDisconnected: (reason) => {
      console.log("disconnected:", reason);
    },
    onError: (message) => {
      console.error("error:", message);
    },
  });

  const url = geminiLiveUrlForApiKey(apiKey!);
  const setupMessage = buildGeminiLiveSetup({
    model,
    voice: "Kore",
    instructions:
      "Tu es une tutrice de français de Montréal. Phrases courtes. Appelle note_evidence quand tu remarques une erreur.",
  });

  await protocol.connect(url, setupMessage);
  // connect() already sent the CALL_START_SENTINEL greeting turn.
  await waitForTurnComplete(protocol, 0);

  protocol.sendText("Salut! Hier j'ai allé au travail en métro.");
  await waitForTurnComplete(protocol, 1);

  protocol.sendText("Après je suis allé à l'épicerie.");
  await waitForTurnComplete(protocol, 2);

  protocol.close();

  const assistantTurns = lastTranscript.filter((t) => t.role === "assistant" && t.text.trim().length > 0);
  console.log("--- transcript ---");
  for (const t of lastTranscript) console.log(`${t.role.toUpperCase()}: ${t.text}`);
  console.log("audio bytes:", audioBytes);
  console.log("evidence:", JSON.stringify(evidence));

  const ok = assistantTurns.length >= 3 && audioBytes > 0 && evidence.length >= 1;
  console.log(ok ? "GEMINI PROTOCOL OK" : "GEMINI PROTOCOL INCOMPLETE");
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
