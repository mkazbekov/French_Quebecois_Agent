import { describe, expect, it } from "vitest";
import { buildGeminiLiveSetup, END_CALL_TOOL, NOTE_EVIDENCE_TOOL } from "@/lib/tutor/gemini-setup";
import { buildTutorInstructions } from "@/lib/tutor/instructions";
import { defaultLearnerState } from "@/lib/learner/defaults";

describe("Gemini setup message", () => {
  it("declares both note_evidence and end_call function tools", () => {
    const setup = buildGeminiLiveSetup({ model: "gemini-3.8-live", voice: "Kore", instructions: "Tu es une tutrice." });
    const declarations = setup.setup.tools[0].functionDeclarations;
    const names = declarations.map((d) => d.name);
    expect(names).toContain("note_evidence");
    expect(names).toContain("end_call");
  });

  it("gives end_call an empty, no-required-params schema", () => {
    expect(END_CALL_TOOL.name).toBe("end_call");
    expect(END_CALL_TOOL.parameters).not.toHaveProperty("required");
  });

  it("keeps note_evidence's own schema intact", () => {
    expect(NOTE_EVIDENCE_TOOL.parameters.required).toContain("kind");
  });
});

describe("tutor instructions ending guidance", () => {
  it("mentions end_call and the role-play caveat", () => {
    const state = defaultLearnerState("Mirza");
    const { instructions } = buildTutorInstructions({ state, mode: "free", recentRecords: [] });
    expect(instructions).toContain("end_call");
    expect(instructions.toLowerCase()).toContain("role-play");
  });
});
