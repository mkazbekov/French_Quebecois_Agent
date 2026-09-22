import type { SessionMode } from "@/lib/learner/schema";

/**
 * Learner-facing copy for every pickable session mode. Single source of
 * truth so the mode picker, the live "now running" banner and the session
 * summary all say the same thing — never the internal mode key itself.
 */

export type PickableMode = Exclude<SessionMode, "auto">;

export interface ModeCopy {
  label: string;
  blurb: string;
  length: string;
}

export const MODE_COPY: Record<PickableMode, ModeCopy> = {
  free: {
    label: "Just talk",
    blurb: "Free conversation. Corrections only when it matters.",
    length: "any length",
  },
  guided: {
    label: "Guided practice",
    blurb: "A normal chat, steered to today’s unit.",
    length: "~15 min",
  },
  lesson: {
    label: "Teach me something",
    blurb: "One grammar point + 3–5 new words, then use them.",
    length: "~20 min",
  },
  quebec: {
    label: "Québec situation",
    blurb: "Role-play a café, the métro, a dépanneur.",
    length: "~10 min",
  },
  correction: {
    label: "Correct me closely",
    blurb: "Talk, and hear the right sentence every time.",
    length: "~15 min",
  },
  remediation: {
    label: "Drill my mistakes",
    blurb: "Targeted practice on what you keep getting wrong.",
    length: "~15 min",
  },
  assessment: {
    label: "Check my level",
    blurb: "A friendly test of all four skills. Can move your level.",
    length: "~20 min",
  },
};

/** Grid/list order, auto first. */
export const MODE_ORDER: PickableMode[] = ["free", "guided", "lesson", "quebec", "correction", "remediation", "assessment"];

export const AUTO_COPY: { label: string; blurb: string } = {
  label: "Tutor decides",
  blurb:
    "Follows your program: practice, a lesson, a Québec situation, a drill on your mistakes, or a level check when one is due.",
};

export function modeLabel(mode: SessionMode): string {
  if (mode === "auto") return AUTO_COPY.label;
  return MODE_COPY[mode].label;
}

export function modeBlurb(mode: SessionMode): string {
  if (mode === "auto") return AUTO_COPY.blurb;
  return MODE_COPY[mode].blurb;
}
