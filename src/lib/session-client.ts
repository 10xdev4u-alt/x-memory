import { resolveOperation } from "./op-registry.js";

export const GRAPHQL_BASE = "https://x.com/i/api/graphql";

export type SessionErrorKind =
  | "expired"
  | "forbidden"
  | "rate-limited"
  | "stale-operation"
  | "network"
  | "server";

export class SessionError extends Error {
  readonly kind: SessionErrorKind;
  readonly status: number;

  constructor(kind: SessionErrorKind, status: number, message: string) {
    super(message);
    this.kind = kind;
    this.status = status;
  }
}

export interface GraphQLEnvelope<T = unknown> {
  data?: T;
  errors?: Array<{ message?: string; code?: number }>;
}

export function readCsrfToken(cookie: string): string {
  const match = /(?:^|; )ct0=([^;]+)/.exec(cookie);
  return match?.[1] === undefined ? "" : decodeURIComponent(match[1]);
}

export async function readStoredCsrf(): Promise<string> {
  const stored = await chrome.storage.local.get("xmem.csrf");
  return (stored["xmem.csrf"] as string | undefined) ?? "";
}

export function buildOperationUrl(queryId: string, operationName: string, variables: unknown): string {
  return `${GRAPHQL_BASE}/${queryId}/${operationName}?variables=${encodeURIComponent(JSON.stringify(variables))}`;
}

export function buildHeaders(csrfToken: string, bearer: string): Record<string, string> {
  return {
    authorization: `Bearer ${bearer}`,
    "content-type": "application/json",
    "x-csrf-token": csrfToken,
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
  };
}

export function classifyStatus(status: number): SessionErrorKind {
  if (status === 401 || status === 403) return status === 401 ? "expired" : "forbidden";
  if (status === 429) return "rate-limited";
  if (status === 400 || status === 404) return "stale-operation";
  if (status >= 500) return "server";
  return "network";
}

export interface SessionClientDeps {
  bearer: string;
  cookie: string;
  fetchImpl?: typeof fetch;
}

export async function callOperation<T>(
  operationName: string,
  variables: unknown,
  deps: SessionClientDeps,
): Promise<GraphQLEnvelope<T>> {
  const descriptor = resolveOperation(operationName);
  if (descriptor === undefined) {
    throw new SessionError("stale-operation", 0, `unknown operation: ${operationName}`);
  }
  const csrfToken = readCsrfToken(deps.cookie);
  if (csrfToken === "") {
    throw new SessionError("expired", 0, "missing csrf token, session is gone");
  }
  const fetchImpl = deps.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await fetchImpl(buildOperationUrl(descriptor.queryId, operationName, variables), {
      headers: buildHeaders(csrfToken, deps.bearer),
    });
  } catch (error) {
    throw new SessionError("network", 0, `request failed: ${String(error)}`);
  }
  if (!response.ok) {
    throw new SessionError(
      classifyStatus(response.status),
      response.status,
      `${operationName} failed with status ${response.status}`,
    );
  }
  return (await response.json()) as GraphQLEnvelope<T>;
}
