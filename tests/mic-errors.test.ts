import { describe, expect, it } from "vitest";
import { micErrorMessage } from "@/lib/voice/mic-errors";

const ok = { hasMediaDevices: true, port: "3000" };

describe("micErrorMessage", () => {
  it("explains a blocked permission (NotAllowedError)", () => {
    const err = new DOMException("denied", "NotAllowedError");
    expect(micErrorMessage(err, ok)).toMatch(/Click the icon at the left of the address bar/);
  });

  it("explains a blocked permission (SecurityError)", () => {
    const err = new DOMException("denied", "SecurityError");
    expect(micErrorMessage(err, ok)).toMatch(/Click the icon at the left of the address bar/);
  });

  it("explains a missing microphone (NotFoundError)", () => {
    const err = new DOMException("no device", "NotFoundError");
    expect(micErrorMessage(err, ok)).toMatch(/No microphone was found/);
  });

  it("explains a missing microphone (OverconstrainedError)", () => {
    const err = new DOMException("constraints", "OverconstrainedError");
    expect(micErrorMessage(err, ok)).toMatch(/No microphone was found/);
  });

  it("explains a microphone in use by another app (NotReadableError)", () => {
    const err = new DOMException("in use", "NotReadableError");
    expect(micErrorMessage(err, ok)).toMatch(/being used by another app/);
  });

  it("explains a microphone in use by another app (AbortError)", () => {
    const err = new DOMException("aborted", "AbortError");
    expect(micErrorMessage(err, ok)).toMatch(/being used by another app/);
  });

  it("tells the learner to open localhost when mediaDevices is unavailable", () => {
    const err = new Error("irrelevant");
    const msg = micErrorMessage(err, { hasMediaDevices: false, port: "3000" });
    expect(msg).toBe("This page can only use the microphone at http://localhost:3000 — open that address instead.");
  });

  it("falls back to localhost:3000 when the port is empty", () => {
    const msg = micErrorMessage(new Error("x"), { hasMediaDevices: false, port: "" });
    expect(msg).toContain("http://localhost:3000");
  });

  it("uses the actual port when mediaDevices is unavailable", () => {
    const msg = micErrorMessage(new Error("x"), { hasMediaDevices: false, port: "5173" });
    expect(msg).toContain("http://localhost:5173");
  });

  it("falls back to a generic message for unknown errors", () => {
    const err = new Error("something else broke");
    expect(micErrorMessage(err, ok)).toBe("Could not access the microphone: something else broke");
  });

  it("handles plain objects with a name field (no Error instance)", () => {
    const err = { name: "NotFoundError" };
    expect(micErrorMessage(err, ok)).toMatch(/No microphone was found/);
  });

  it("handles non-Error values with no name at all", () => {
    expect(micErrorMessage("boom", ok)).toBe("Could not access the microphone: boom");
  });
});
