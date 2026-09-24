import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

export interface AbuseReport {
  at: number;
  id: string;
  kind: string;
  reason: string;
  reporter: string;
}

export const REPORT_MAX_COUNT = 1_000;
export const REPORT_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const REPORT_PAGE_MAX = 100;

export interface ApiStore {
  boards: Map<string, PublicBoard>;
  collections: Map<string, PublicCollection>;
  owners: Map<string, string>;
  persist(): Promise<void>;
  profiles: Map<string, PublicProfile>;
  reports: AbuseReport[];
}

export function memoryStore(): ApiStore {
  return {
    boards: new Map(),
    collections: new Map(),
    owners: new Map(),
    persist: async () => undefined,
    profiles: new Map(),
    reports: [],
  };
}

interface PersistedState {
  boards: Array<[string, PublicBoard]>;
  collections: Array<[string, PublicCollection]>;
  owners: Array<[string, string]>;
  profiles: Array<[string, PublicProfile]>;
  reports: AbuseReport[];
}

function isStoredEntries(value: unknown, valid: (entry: unknown) => boolean): boolean {
  return Array.isArray(value) && value.every((entry) => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === "string" && valid(entry[1]));
}

function isStoredReport(value: unknown): value is AbuseReport {
  return (
    isRecord(value) &&
    typeof value["at"] === "number" &&
    typeof value["id"] === "string" &&
    typeof value["kind"] === "string" &&
    typeof value["reason"] === "string" &&
    typeof value["reporter"] === "string"
  );
}

function isPersistedState(value: unknown): value is PersistedState {
  return (
    isRecord(value) &&
    isStoredEntries(value["collections"], validCollection) &&
    isStoredEntries(value["profiles"], validProfile) &&
    isStoredEntries(value["boards"], validBoard) &&
    isStoredEntries(value["owners"], (entry) => typeof entry === "string") &&
    Array.isArray(value["reports"]) &&
    value["reports"].every(isStoredReport)
  );
}

function serializeStore(store: ApiStore): PersistedState {
  return {
    boards: [...store.boards.entries()],
    collections: [...store.collections.entries()],
    owners: [...store.owners.entries()],
    profiles: [...store.profiles.entries()],
    reports: store.reports.map((report) => ({ ...report })),
  };
}

async function readPersistedState(path: string): Promise<PersistedState | undefined> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("public API storage contains invalid JSON");
  }
  if (!isPersistedState(parsed)) throw new Error("public API storage has an invalid shape");
  return parsed;
}

async function writePersistedState(path: string, state: PersistedState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, JSON.stringify(state), "utf8");
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function durableStore(path: string): Promise<ApiStore> {
  const state = await readPersistedState(path);
  const store = memoryStore();
  if (state !== undefined) {
    store.boards = new Map(state.boards);
    store.collections = new Map(state.collections);
    store.owners = new Map(state.owners);
    store.profiles = new Map(state.profiles);
    store.reports = state.reports.map((report) => ({ ...report }));
  }
  store.persist = async () => writePersistedState(path, serializeStore(store));
  return store;
}

interface StoreSnapshot {
  boards: Map<string, PublicBoard>;
  collections: Map<string, PublicCollection>;
  owners: Map<string, string>;
  profiles: Map<string, PublicProfile>;
  reports: AbuseReport[];
}

function snapshotStore(store: ApiStore): StoreSnapshot {
  return {
    boards: new Map(store.boards),
    collections: new Map(store.collections),
    owners: new Map(store.owners),
    profiles: new Map(store.profiles),
    reports: [...store.reports],
  };
}

function restoreStore(store: ApiStore, snapshot: StoreSnapshot): void {
  store.boards = snapshot.boards;
  store.collections = snapshot.collections;
  store.owners = snapshot.owners;
  store.profiles = snapshot.profiles;
  store.reports = snapshot.reports;
}

async function commitStore(store: ApiStore, action: () => void): Promise<void> {
  const snapshot = snapshotStore(store);
  try {
    action();
    await store.persist();
  } catch (error) {
    restoreStore(store, snapshot);
    throw error;
  }
}

export function ownerHash(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export interface ApiOptions {
  allowedOrigins?: ReadonlySet<string>;
  keys: Set<string>;
  moderatorKeys?: ReadonlySet<string>;
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

const MAX_COLLECTION_POST_IDS = 5_000;
const MAX_BOARD_ROWS = 5_000;
const MAX_PROFILE_ITEMS = 500;
const MAX_TEXT_LENGTH = 20_000;

function hasOnlyKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBoundedString(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_TEXT_LENGTH;
}

function isStringArray(value: unknown, maxItems: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((entry) => isBoundedString(entry));
}

function validCollection(value: unknown): value is PublicCollection {
  if (!isRecord(value) || !hasOnlyKeys(value, ["description", "id", "name", "originId", "postIds", "updatedAt"])) return false;
  return (
    isBoundedString(value["id"]) &&
    value["id"] !== "" &&
    isBoundedString(value["name"]) &&
    value["name"] !== "" &&
    isStringArray(value["postIds"], MAX_COLLECTION_POST_IDS) &&
    (value["description"] === undefined || isBoundedString(value["description"])) &&
    (value["originId"] === undefined || isBoundedString(value["originId"])) &&
    isFiniteNumber(value["updatedAt"])
  );
}

function validProfile(value: unknown): value is PublicProfile {
  if (!isRecord(value) || !hasOnlyKeys(value, ["clusters", "generatedAt", "id", "minds"])) return false;
  const clusters = value["clusters"];
  const minds = value["minds"];
  if (!Array.isArray(clusters) || clusters.length > MAX_PROFILE_ITEMS || !Array.isArray(minds) || minds.length > MAX_PROFILE_ITEMS) return false;
  return (
    isBoundedString(value["id"]) &&
    value["id"] !== "" &&
    isFiniteNumber(value["generatedAt"]) &&
    clusters.every((cluster) =>
      isRecord(cluster) &&
      hasOnlyKeys(cluster, ["count", "label"]) &&
      isFiniteNumber(cluster["count"]) &&
      isBoundedString(cluster["label"]) &&
      cluster["label"] !== "",
    ) &&
    minds.every((mind) =>
      isRecord(mind) &&
      hasOnlyKeys(mind, ["handle", "score"]) &&
      isBoundedString(mind["handle"]) &&
      isFiniteNumber(mind["score"]),
    )
  );
}

function validBoard(value: unknown): value is PublicBoard {
  if (!isRecord(value) || !hasOnlyKeys(value, ["id", "kind", "rows", "updatedAt"])) return false;
  return (
    isBoundedString(value["id"]) &&
    value["id"] !== "" &&
    isBoundedString(value["kind"]) &&
    value["kind"] !== "" &&
    isStringArray(value["rows"], MAX_BOARD_ROWS) &&
    isFiniteNumber(value["updatedAt"])
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

function setCorsHeaders(response: ServerResponse, origin: string): void {
  response.setHeader("access-control-allow-credentials", "true");
  response.setHeader("access-control-allow-headers", "Authorization, Content-Type");
  response.setHeader("access-control-allow-methods", "GET, PUT, DELETE, POST, OPTIONS");
  response.setHeader("access-control-allow-origin", origin);
  response.setHeader("access-control-max-age", "600");
  response.setHeader("vary", "Origin");
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
      const origin = request.headers.origin;
      if (origin !== undefined) {
        if (options.allowedOrigins === undefined || !options.allowedOrigins.has(origin)) {
          send(response, 403, { error: "origin not allowed" });
          return;
        }
        setCorsHeaders(response, origin);
        if (request.method === "OPTIONS") {
          response.writeHead(204);
          response.end();
          return;
        }
      }
      const now = Date.now();
      if (request.method === "GET" && url.pathname === "/health") {
        send(response, 200, { ok: true });
        return;
      }
      const auth = request.headers["authorization"] ?? "";
      const key = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      if (request.method === "POST" && url.pathname === "/v1/reports") {
        if (!options.keys.has(key)) {
          send(response, 401, { error: "unauthorized" });
          return;
        }
        if (!checkRate(`report:submit:${key}`, now)) {
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
        if (
          !isRecord(body) ||
          (body["kind"] !== "collections" && body["kind"] !== "profiles" && body["kind"] !== "boards") ||
          typeof body["id"] !== "string" ||
          body["id"] === "" ||
          typeof body["reason"] !== "string" ||
          body["reason"].length < 1 ||
          body["reason"].length > 500
        ) {
          send(response, 400, { error: "invalid report" });
          return;
        }
        const reportId = body["id"];
        const reportKind = body["kind"];
        const reportReason = body["reason"];
        await commitStore(store, () => {
          store.reports = store.reports.filter((report) => now - report.at <= REPORT_RETENTION_MS);
          const overflow = store.reports.length - REPORT_MAX_COUNT + 1;
          if (overflow > 0) store.reports.splice(0, overflow);
          store.reports.push({
            at: now,
            id: reportId,
            kind: reportKind,
            reason: reportReason,
            reporter: ownerHash(key),
          });
        });
        send(response, 200, { ok: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/reports") {
        if (!options.keys.has(key)) {
          send(response, 401, { error: "unauthorized" });
          return;
        }
        if (options.moderatorKeys === undefined || !options.moderatorKeys.has(key)) {
          send(response, 403, { error: "moderator scope required" });
          return;
        }
        if (!checkRate("reports:read", now)) {
          send(response, 429, { error: "rate limited" });
          return;
        }
        const rawLimit = url.searchParams.get("limit");
        const parsedLimit = rawLimit === null ? 50 : Number(rawLimit);
        const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, REPORT_PAGE_MAX) : 50;
        const rawBefore = url.searchParams.get("before");
        const before = rawBefore === null ? undefined : Number(rawBefore);
        if (before !== undefined && (!Number.isFinite(before) || before < 0)) {
          send(response, 400, { error: "invalid cursor" });
          return;
        }
        const ordered = [...store.reports]
          .filter((report) => before === undefined || report.at < before)
          .sort((a, b) => b.at - a.at);
        const reports = ordered.slice(0, limit);
        const nextCursor = ordered.length > limit ? reports.at(-1)?.at ?? null : null;
        send(response, 200, { nextCursor, reports });
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
      if (request.method !== "PUT" && request.method !== "DELETE") {
        send(response, 405, { error: "method not allowed" });
        return;
      }
      if (!options.keys.has(key)) {
        send(response, 401, { error: "unauthorized" });
        return;
      }
      if (!checkRate(`write:${key}`, now)) {
        send(response, 429, { error: "rate limited" });
        return;
      }
      const docKey = `${kind}:${id}`;
      const map = kind === "collections" ? store.collections : kind === "profiles" ? store.profiles : store.boards;
      if (request.method === "PUT" && map.has(id) && store.owners.get(docKey) !== ownerHash(key)) {
        send(response, 403, { error: "not the owner" });
        return;
      }
      if (request.method === "DELETE") {
        if (!map.has(id)) {
          send(response, 404, { error: "not found" });
          return;
        }
        if (store.owners.get(docKey) !== ownerHash(key)) {
          send(response, 403, { error: "not the owner" });
          return;
        }
        await commitStore(store, () => {
          map.delete(id);
          store.owners.delete(docKey);
        });
        send(response, 200, { ok: true });
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
        await commitStore(store, () => {
          store.collections.set(id, body);
          store.owners.set(docKey, ownerHash(key));
        });
        send(response, 200, { ok: true });
        return;
      }
      if (kind === "profiles" && validProfile(body)) {
        await commitStore(store, () => {
          store.profiles.set(id, body);
          store.owners.set(docKey, ownerHash(key));
        });
        send(response, 200, { ok: true });
        return;
      }
      if (kind === "boards" && validBoard(body)) {
        await commitStore(store, () => {
          store.boards.set(id, body);
          store.owners.set(docKey, ownerHash(key));
        });
        send(response, 200, { ok: true });
        return;
      }
      send(response, 400, { error: "invalid document" });
    })().catch(() => {
      if (!response.headersSent) send(response, 500, { error: "internal" });
    });
  });
}
