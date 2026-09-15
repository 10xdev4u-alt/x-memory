import type { SessionState } from "./settings.js";

export type SessionEvent = "CHECK_OK" | "CHECK_GONE" | "CHECK_EXPIRED" | "LOGGED_OUT";

export function transition(state: SessionState, event: SessionEvent): SessionState {
  switch (event) {
    case "CHECK_OK":
      return "active";
    case "CHECK_GONE":
    case "LOGGED_OUT":
      return "missing";
    case "CHECK_EXPIRED":
      return state === "active" ? "expired" : state;
  }
}

export function probeSession(cookie: string): SessionState {
  return /(?:^|; )ct0=[^;]+/.test(cookie) ? "active" : "missing";
}

export function sessionMessage(state: SessionState): string {
  switch (state) {
    case "active":
      return "X session active. Sync is available.";
    case "missing":
      return "No X session found. Log into X, then sync.";
    case "expired":
      return "X session expired. Log into X again to resume.";
    case "unknown":
      return "Session not checked yet.";
  }
}
