import "dotenv/config";
import { buildGeminiLiveSetup, geminiLiveUrlForApiKey } from "@/lib/tutor/gemini-setup";
// Validates that the exact setup message the browser will send is accepted by the Live API.
const ws = new WebSocket(geminiLiveUrlForApiKey(process.env.GEMINI_API_KEY!));
const done = new Promise<string>((res) => {
  const t = setTimeout(() => res("timeout"), 15000);
  ws.onopen = () => ws.send(JSON.stringify(buildGeminiLiveSetup({ model: process.env.GEMINI_LIVE_MODEL ?? "gemini-3.8-live", voice: "Kore", instructions: "Tu es une tutrice." })));
  ws.onmessage = async (ev) => { const m = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(await (ev.data as Blob).arrayBuffer()).toString()); clearTimeout(t); res(m.setupComplete ? "SETUP ACCEPTED" : "unexpected: " + JSON.stringify(m).slice(0, 300)); };
  ws.onclose = (e) => { clearTimeout(t); res(`closed ${e.code} ${e.reason}`); };
});
console.log(await done); ws.close(); process.exit(0);
