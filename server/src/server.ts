import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

export interface PublicCollection {
  description?: string;
  id: string;
  name: string;
  originId?: string;
  postIds: string[];
  updatedAt: number;
}

export interface PublicProfile {
  clusters: Array<{ count: number; label: string }>;
  generatedAt: number;
  id: string;
  minds: Array<{ handle: string; score: number }>;
}

export interface PublicBoard {
  id: string;
  kind: string;
  rows: string[];
  updatedAt: number;
}

export interface ApiStore {
  boards: Map<string, PublicBoard>;
  collections: Map<string, PublicCollection>;
  profiles: Map<string, PublicProfile>;
}

export function memoryStore(): ApiStore {
  return { boards: new Map(), collections: new Map(), profiles: new Map() };
}

export interface ApiOptions {
  keys: Set<string>;
  maxBodyBytes?: number;
  rateLimitPerMinute?: number;
}

interface RateState {
  count: number;
  windowStart: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function validCollection(value: unknown): value is PublicCollection {
  if (!isRecord(value)) return false;
  return (
    typeof value["id"] === "string" &&
    value["id"] !== "" &&
    typeof value["name"] === "string" &&
    value["name"] !== "" &&
    Array.isArray(value["postIds"]) &&
    value["postIds"].every((entry) => typeof entry === "string") &&
    (value["description"] === undefined || typeof value["description"] === "string") &&
    (value["originId"] === undefined || typeof value["originId"] === "string") &&
    typeof value["updatedAt"] === "number"
  );
}

function validProfile(value: unknown): value is PublicProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value["id"] === "string" &&
    value["id"] !== "" &&
    Array.isArray(value["minds"]) &&
    Array.isArray(value["clusters"]) &&
    typeof value["generatedAt"] === "number"
  );
}

function validBoard(value: unknown): value is PublicBoard {
  if (!isRecord(value)) return false;
  return (
    typeof value["id"] === "string" &&
    value["id"] !== "" &&
    typeof value["kind"] === "string" &&
    isStringArray(value["rows"]) &&
    typeof value["updatedAt"] === "number"
  );
}

function readBody(request: IncomingMessage, maxBytes: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("body too large"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(chunks.length === 0 ? undefined : JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("invalid json"));
      }
    });
    request.on("error", (error: Error) => reject(error));
  });
}

function send(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, { "content-length": Buffer.byteLength(payload), "content-type": "application/json" });
  response.end(payload);
}

export function createApiServer(store: ApiStore, options: ApiOptions): Server {
  const maxBody = options.maxBodyBytes ?? 262144;
  const limit = options.rateLimitPerMinute ?? 60;
  const rates = new Map<string, RateState>();
  const checkRate = (key: string, now: number): boolean => {
    const state = rates.get(key);
    if (state === undefined || now - state.windowStart >= 60000) {
      rates.set(key, { count: 1, windowStart: now });
      return true;
    }
    state.count += 1;
    return state.count <= limit;
  };

  return createHttpServer((request: IncomingMessage, response: ServerResponse) => {
    void (async () => {
      const url = new URL(request.url ?? "/", "http://local");
      const now = Date.now();
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true });
        return;
      }
      const match = /^\/(v1)\/(collections|profiles|boards)\/([A-Za-z0-9_-]{1,120})$/.exec(url.pathname);
      if (match === null) {
        send(response, 404, { error: "not found" });
        return;
      }
      const [, , kind, id] = match;
      if (id === undefined || kind === undefined) {
        send(response, 404, { error: "not found" });
        return;
      }
      if (request.method === "GET") {
        if (!checkRate("read", now)) {
          send(response, 429, { error: "rate limited" });
          return;
        }
        const map = kind === "collections" ? store.collections : kind === "profiles" ? store.profiles : store.boards;
        const doc = map.get(id) as unknown;
        if (doc === undefined) {
          send(response, 404, { error: "not found" });
          return;
        }
        send(response, 200, doc);
        return;
      }
      if (request.method !== "PUT") {
        send(response, 405, { error: "method not allowed" });
        return;
      }
      const auth = request.headers["authorization"] ?? "";
      const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (!options.keys.has(key)) {
        send(response, 401, { error: "unauthorized" });
        return;
      }
      if (!checkRate(`write:${key}`, now)) {
        send(response, 429, { error: "rate limited" });
        return;
      }
      let body: unknown;
      try {
        body = await readBody(request, maxBody);
      } catch (error) {
        send(response, 400, { error: error instanceof Error ? error.message : "bad body" });
        return;
      }
      if (!isRecord(body) || body["id"] !== id) {
        send(response, 400, { error: "id mismatch" });
        return;
      }
      if (kind === "collections" && validCollection(body)) {
        store.collections.set(id, body);
        send(response, 200, { ok: true });
        return;
      }
      if (kind === "profiles" && validProfile(body)) {
        store.profiles.set(id, body);
        send(response, 200, { ok: true });
        return;
      }
      if (kind === "boards" && validBoard(body)) {
        store.boards.set(id, body);
        send(response, 200, { ok: true });
        return;
      }
      send(response, 400, { error: "invalid document" });
    })().catch(() => {
      if (!response.headersSent) send(response, 500, { error: "internal" });
    });
  });
}
