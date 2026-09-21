import "dotenv/config";
import { getLearnerStore } from "@/lib/learner";
import { buildGeminiLiveSetup, geminiLiveUrlForApiKey } from "@/lib/tutor/gemini-setup";
import { buildTutorInstructions } from "@/lib/tutor/instructions";
import { GeminiLiveProtocol } from "@/lib/voice/gemini-protocol";
// Opens a real Live session with the learner's actual instructions and prints only the greeting.
const store = await getLearnerStore();
const state = await store.load();
const { instructions, stage, mode } = buildTutorInstructions({ state, mode: "auto", recentRecords: await store.recentSessionRecords(3) });
console.log(`stage=${stage} mode=${mode} level=${state.competencies.oral_production.level} pref=${state.profile.preferences.language_mode}`);
let greeting = "";
const proto = new GeminiLiveProtocol({
  onAudioChunk: () => {}, onTranscript: (t) => { greeting = t.filter((x) => x.role === "assistant").map((x) => x.text).join(" | "); },
  onPartialTranscript: () => {},
  onActivity: () => {}, onEvidence: () => {}, onQuiz: () => {}, onInterrupted: () => {}, onSetupComplete: () => {}, onDisconnected: () => {}, onError: (e) => console.error("error", e), onEndCallRequested: () => {}, onTurnComplete: () => {},
});
await proto.connect(geminiLiveUrlForApiKey(process.env.GEMINI_API_KEY!), buildGeminiLiveSetup({ model: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live", voice: process.env.GEMINI_LIVE_VOICE ?? "Kore", instructions }));
await new Promise((r) => setTimeout(r, 12000));
proto.close();
console.log("GREETING:", greeting || "(none)");
process.exit(0);
