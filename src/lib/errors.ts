import { SessionError, type SessionErrorKind } from "./session-client.js";

export type ErrorAction = "retry" | "heal" | "login" | "wait" | "dismiss";

export interface ErrorCard {
  title: string;
  body: string;
  actions: ErrorAction[];
}

const CARDS: Record<SessionErrorKind, ErrorCard> = {
  expired: {
    actions: ["login", "dismiss"],
    body: "The X session ended. Log into X again, then retry.",
    title: "Session expired",
  },
  forbidden: {
    actions: ["login", "dismiss"],
    body: "X refused the request. The account may lack access or need a fresh login.",
    title: "Request refused",
  },
  "rate-limited": {
    actions: ["wait", "retry", "dismiss"],
    body: "X asked for a pause. Wait a little, then retry.",
    title: "Slow down",
  },
  "stale-operation": {
    actions: ["heal", "retry", "dismiss"],
    body: "X changed its internals. Heal operations, then retry the request.",
    title: "Operations out of date",
  },
  network: {
    actions: ["retry", "dismiss"],
    body: "The request never reached X. Check the connection and retry.",
    title: "Network hiccup",
  },
  server: {
    actions: ["wait", "retry", "dismiss"],
    body: "X is having trouble right now. Wait, then retry.",
    title: "X is struggling",
  },
};

export function cardForSessionError(error: SessionError): ErrorCard {
  return CARDS[error.kind];
}

export function cardForUnknown(message: string): ErrorCard {
  return { actions: ["dismiss"], body: message, title: "Something went wrong" };
}
