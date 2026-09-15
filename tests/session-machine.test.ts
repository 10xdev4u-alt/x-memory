import { probeSession, sessionMessage, transition } from "../src/lib/session-machine.js";
import { describe, expect, it } from "vitest";

describe("session-machine", () => {
  it("activates on successful checks from any state", () => {
    expect(transition("unknown", "CHECK_OK")).toBe("active");
    expect(transition("missing", "CHECK_OK")).toBe("active");
    expect(transition("expired", "CHECK_OK")).toBe("active");
  });

  it("marks missing on gone checks and logout", () => {
    expect(transition("active", "CHECK_GONE")).toBe("missing");
    expect(transition("active", "LOGGED_OUT")).toBe("missing");
  });

  it("expires only from active", () => {
    expect(transition("active", "CHECK_EXPIRED")).toBe("expired");
    expect(transition("missing", "CHECK_EXPIRED")).toBe("missing");
    expect(transition("unknown", "CHECK_EXPIRED")).toBe("unknown");
  });

  it("probes cookies for the session marker", () => {
    expect(probeSession("a=1; ct0=xyz; b=2")).toBe("active");
    expect(probeSession("a=1")).toBe("missing");
  });

  it("messages every state", () => {
    for (const state of ["active", "missing", "expired", "unknown"] as const) {
      expect(sessionMessage(state).length).toBeGreaterThan(0);
    }
  });
});
