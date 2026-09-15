import { cardForSessionError, cardForUnknown } from "../src/lib/errors.js";
import { SessionError } from "../src/lib/session-client.js";
import { describe, expect, it } from "vitest";

describe("error-cards", () => {
  it("maps every session kind to a card with actions", () => {
    const kinds = ["expired", "forbidden", "rate-limited", "stale-operation", "network", "server"] as const;
    for (const kind of kinds) {
      const card = cardForSessionError(new SessionError(kind, 0, "x"));
      expect(card.title.length).toBeGreaterThan(0);
      expect(card.body.length).toBeGreaterThan(0);
      expect(card.actions).toContain("dismiss");
    }
  });

  it("expires toward login, limits toward waiting", () => {
    expect(cardForSessionError(new SessionError("expired", 401, "x")).actions).toContain("login");
    expect(cardForSessionError(new SessionError("rate-limited", 429, "x")).actions).toContain("wait");
    expect(cardForSessionError(new SessionError("stale-operation", 404, "x")).actions).toContain("heal");
  });

  it("wraps unknown failures without stack traces", () => {
    const card = cardForUnknown("boom");
    expect(card).toEqual({ actions: ["dismiss"], body: "boom", title: "Something went wrong" });
  });
});
