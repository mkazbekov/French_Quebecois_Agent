import "dotenv/config";
import { RealtimeAgent, RealtimeSession, tool } from "@openai/agents/realtime";
import { getLearnerStore } from "@/lib/learner";
import { LiveEvidenceSchema } from "@/lib/learner/schema";
import { buildTutorInstructions } from "@/lib/tutor/instructions";
import { env } from "@/lib/env";

// Protocol check without audio: WebSocket transport, text in, transcript + tool calls out.
const store = await getLearnerStore();
const state = await store.load();
const records = await store.recentSessionRecords(3);
const { instructions, mode } = buildTutorInstructions({ state, mode: "auto", recentRecords: records });
console.log(`instructions: ${instructions.length} chars, mode=${mode}, store=${store.kind}`);

const evidence: unknown[] = [];
const noteEvidence = tool({
  name: "note_evidence",
  description: "Silently record one piece of learning evidence.",
  parameters: LiveEvidenceSchema,
  execute: async (input) => { evidence.push(input); return "noted"; },
});
const agent = new RealtimeAgent({ name: "Tutrice", instructions, tools: [noteEvidence] });
const session = new RealtimeSession(agent, {
  transport: "websocket",
  model: env.OPENAI_REALTIME_MODEL,
  config: { outputModalities: ["audio"], audio: { output: { voice: env.OPENAI_REALTIME_VOICE } } },
});

const assistantTexts: string[] = [];
let audioBytes = 0;
session.on("history_updated", (h) => {
  for (const it of h) {
    if (it.type === "message" && it.role === "assistant") {
      const t = it.content.map((c) => ("transcript" in c ? c.transcript : "text" in c ? c.text : "")).join("");
      if (t) assistantTexts[h.indexOf(it)] = t;
    }
  }
});
session.on("audio", (e) => { audioBytes += e.data.byteLength; });
session.on("error", (e) => {
  console.error("session error", JSON.stringify(e, null, 1));
  console.log("REALTIME FAILED (see error above; a credit/quota error means billing, not code)");
  process.exit(1);
});

const done = (label: string) => new Promise<void>((resolve) => {
  const started = Date.now();
  const tick = () => {
    const last = session.history.at(-1);
    const finished = last?.type === "message" && last.role === "assistant" && last.status === "completed";
    if (finished || Date.now() - started > 25_000) { console.log(`[${label}] turn ${finished ? "completed" : "TIMEOUT"} after ${Date.now() - started} ms`); resolve(); }
    else setTimeout(tick, 300);
  };
  tick();
});

await session.connect({ apiKey: env.OPENAI_API_KEY });
console.log("connected over websocket");
session.transport.requestResponse?.();
await done("greeting");
session.sendMessage("Salut! Hier j'ai allé au travail en métro, ligne orange.");
await done("turn 2");
session.sendMessage("Après je suis allé à l'épicerie pour acheter du pain.");
await done("turn 3");
session.close();

console.log("--- assistant turns ---");
for (const t of assistantTexts.filter(Boolean)) console.log("TUTOR:", t);
console.log(`audio bytes received: ${audioBytes}`);
console.log(`note_evidence calls: ${evidence.length}`, JSON.stringify(evidence));
console.log(`REALTIME ${assistantTexts.filter(Boolean).length >= 3 && audioBytes > 0 ? "OK" : "INCOMPLETE"}`);
process.exit(0);
