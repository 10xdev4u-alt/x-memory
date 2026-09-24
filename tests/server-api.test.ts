import { createApiServer, durableStore, memoryStore, REPORT_MAX_COUNT, REPORT_RETENTION_MS, type ApiStore } from "../server/src/server.js";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";

let servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers = [];
});

async function start(options?: { keys?: string[]; limit?: number; moderators?: string[]; origins?: string[] }, providedStore?: ApiStore): Promise<string> {
  const apiOptions = {
    allowedOrigins: new Set(options?.origins ?? []),
    keys: new Set(options?.keys ?? ["k1"]),
    moderatorKeys: new Set(options?.moderators ?? []),
  };
  const server = createApiServer(
    providedStore ?? memoryStore(),
    options?.limit === undefined ? apiOptions : { ...apiOptions, rateLimitPerMinute: options.limit },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  servers.push(server);
  const address = server.address() as AddressInfo;
  return `http://127.0.0.1:${address.port}`;
}

const COLLECTION = { id: "c1", name: "Canon", postIds: ["p1"], updatedAt: 1 };

describe("public api", () => {
  it("serves health", async () => {
    const base = await start();
    const response = await fetch(`${base}/health`);
    expect(response.status).toBe(200);
  });

  it("enforces the exact browser-origin CORS contract", async () => {
    const allowed = "chrome-extension://allowed";
    const base = await start({ origins: [allowed] });
    const preflight = await fetch(`${base}/v1/collections/c1`, {
      headers: {
        origin: allowed,
        "access-control-request-headers": "authorization, content-type",
        "access-control-request-method": "PUT",
      },
      method: "OPTIONS",
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(allowed);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("PUT");
    expect(preflight.headers.get("access-control-allow-headers")).toContain("Authorization");
    expect(preflight.headers.get("access-control-allow-credentials")).toBe("true");

    const denied = await fetch(`${base}/health`, { headers: { origin: "https://untrusted.example" } });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    expect((await fetch(`${base}/health`, { headers: { origin: allowed } })).headers.get("access-control-allow-origin")).toBe(allowed);
  });

  it("stores and serves collections with auth", async () => {
    const base = await start();
    const put = await fetch(`${base}/v1/collections/c1`, {
      body: JSON.stringify(COLLECTION),
      headers: { authorization: "Bearer k1", "content-type": "application/json" },
      method: "PUT",
    });
    expect(put.status).toBe(200);
    const get = await fetch(`${base}/v1/collections/c1`);
    expect(await get.json()).toMatchObject({ name: "Canon" });
  });

  it("rejects missing auth, bad shapes, and id mismatch", async () => {
    const base = await start();
    expect((await fetch(`${base}/v1/collections/c1`, { body: "{}", headers: { "content-type": "application/json" }, method: "PUT" })).status).toBe(401);
    const badAuth = await fetch(`${base}/v1/collections/c1`, {
      body: JSON.stringify({ id: "c1" }),
      headers: { authorization: "Bearer k1", "content-type": "application/json" },
      method: "PUT",
    });
    expect(badAuth.status).toBe(400);
    const mismatch = await fetch(`${base}/v1/collections/c1`, {
      body: JSON.stringify({ ...COLLECTION, id: "c2" }),
      headers: { authorization: "Bearer k1", "content-type": "application/json" },
      method: "PUT",
    });
    expect(mismatch.status).toBe(400);
    expect((await fetch(`${base}/v1/collections/ghost`)).status).toBe(404);
    expect((await fetch(`${base}/v1/collections/c1`, { headers: { authorization: "Bearer k1" }, method: "DELETE" })).status).toBe(404);
  });

  it("rejects malformed nested documents without storing them", async () => {
    const base = await start();
    const headers = { authorization: "Bearer k1", "content-type": "application/json" };
    const cases = [
      ["profiles", "bad-profile", { clusters: [{ count: "many", label: "x" }], extra: true, generatedAt: 1, id: "bad-profile", minds: [] }],
      ["collections", "bad-collection", { id: "bad-collection", name: "Bad", postIds: [1], updatedAt: 1 }],
      ["boards", "bad-board", { id: "bad-board", kind: "bad", rows: [{}], updatedAt: 1 }],
      ["profiles", "large-profile", { clusters: Array.from({ length: 501 }, (_, index) => ({ count: index, label: `c${index}` })), generatedAt: 1, id: "large-profile", minds: [] }],
    ] as const;

    for (const [kind, id, document] of cases) {
      const put = await fetch(`${base}/v1/${kind}/${id}`, {
        body: JSON.stringify(document),
        headers,
        method: "PUT",
      });
      expect(put.status).toBe(400);
      expect((await fetch(`${base}/v1/${kind}/${id}`)).status).toBe(404);
    }
  });

  it("rate limits writers", async () => {
    const base = await start({ limit: 2 });
    const headers = { authorization: "Bearer k1", "content-type": "application/json" };
    expect((await fetch(`${base}/v1/boards/b1`, { body: JSON.stringify({ id: "b1", kind: "k", rows: [], updatedAt: 1 }), headers, method: "PUT" })).status).toBe(200);
    expect((await fetch(`${base}/v1/boards/b1`, { body: JSON.stringify({ id: "b1", kind: "k", rows: [], updatedAt: 1 }), headers, method: "PUT" })).status).toBe(200);
    expect((await fetch(`${base}/v1/boards/b1`, { body: JSON.stringify({ id: "b1", kind: "k", rows: [], updatedAt: 1 }), headers, method: "PUT" })).status).toBe(429);
  });

  it("stores profiles", async () => {
    const base = await start();
    const profile = { clusters: [], generatedAt: 1, id: "u1", minds: [{ handle: "h", score: 3 }] };
    const put = await fetch(`${base}/v1/profiles/u1`, {
      body: JSON.stringify(profile),
      headers: { authorization: "Bearer k1", "content-type": "application/json" },
      method: "PUT",
    });
    expect(put.status).toBe(200);
    expect(await (await fetch(`${base}/v1/profiles/u1`)).json()).toMatchObject({ id: "u1" });
  });

  it("lets owners delete and blocks strangers", async () => {
    const base = await start({ keys: ["owner", "stranger"] });
    const doc = { id: "c9", name: "Gone", postIds: [], updatedAt: 1 };
    const json = { "content-type": "application/json" };
    await fetch(`${base}/v1/collections/c9`, { body: JSON.stringify(doc), headers: { ...json, authorization: "Bearer owner" }, method: "PUT" });
    const strangerUpdate = await fetch(`${base}/v1/collections/c9`, {
      body: JSON.stringify({ ...doc, name: "Hijacked" }),
      headers: { ...json, authorization: "Bearer stranger" },
      method: "PUT",
    });
    expect(strangerUpdate.status).toBe(403);
    expect(await (await fetch(`${base}/v1/collections/c9`)).json()).toMatchObject({ name: "Gone" });

    const stranger = await fetch(`${base}/v1/collections/c9`, { headers: { authorization: "Bearer stranger" }, method: "DELETE" });
    expect(stranger.status).toBe(403);
    const missing = await fetch(`${base}/v1/collections/nope`, { headers: { authorization: "Bearer owner" }, method: "DELETE" });
    expect(missing.status).toBe(404);
    const owner = await fetch(`${base}/v1/collections/c9`, { headers: { authorization: "Bearer owner" }, method: "DELETE" });
    expect(owner.status).toBe(200);
    expect((await fetch(`${base}/v1/collections/c9`)).status).toBe(404);
  });

  it("persists objects, ownership, and reports across restart", async () => {
    const directory = await mkdtemp(join(tmpdir(), "x-memory-api-"));
    const path = join(directory, "store.json");
    try {
      const firstBase = await start({ keys: ["owner"] }, await durableStore(path));
      const json = { "content-type": "application/json" };
      const collection = { id: "durable", name: "Durable", postIds: [], updatedAt: 1 };
      expect((await fetch(`${firstBase}/v1/collections/durable`, {
        body: JSON.stringify(collection),
        headers: { ...json, authorization: "Bearer owner" },
        method: "PUT",
      })).status).toBe(200);
      expect((await fetch(`${firstBase}/v1/reports`, {
        body: JSON.stringify({ id: "durable", kind: "collections", reason: "persisted report" }),
        headers: { ...json, authorization: "Bearer owner" },
        method: "POST",
      })).status).toBe(200);

      const secondBase = await start({ keys: ["owner", "stranger", "moderator"], moderators: ["moderator"] }, await durableStore(path));
      expect(await (await fetch(`${secondBase}/v1/collections/durable`)).json()).toMatchObject({ name: "Durable" });
      expect((await fetch(`${secondBase}/v1/collections/durable`, {
        body: JSON.stringify({ ...collection, name: "Hijacked" }),
        headers: { ...json, authorization: "Bearer stranger" },
        method: "PUT",
      })).status).toBe(403);
      expect(await (await fetch(`${secondBase}/v1/reports`, { headers: { authorization: "Bearer moderator" } })).json()).toMatchObject({
        reports: [{ reason: "persisted report" }],
      });
      expect((await readFile(path, "utf8")).length).toBeGreaterThan(0);
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("fails closed when durable storage is invalid", async () => {
    const directory = await mkdtemp(join(tmpdir(), "x-memory-api-"));
    const path = join(directory, "store.json");
    try {
      await writeFile(path, "not json", "utf8");
      await expect(durableStore(path)).rejects.toThrow("invalid JSON");
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
  });

  it("takes abuse reports with credit and limits reads to moderators", async () => {
    const base = await start({ keys: ["publisher", "moderator"], moderators: ["moderator"] });
    const json = { "content-type": "application/json" };
    const anon = await fetch(`${base}/v1/reports`, {
      body: JSON.stringify({ id: "c1", kind: "collections", reason: "spam" }),
      headers: json,
      method: "POST",
    });
    expect(anon.status).toBe(401);
    const bad = await fetch(`${base}/v1/reports`, {
      body: JSON.stringify({ id: "c1", kind: "nope", reason: "x" }),
      headers: { ...json, authorization: "Bearer publisher" },
      method: "POST",
    });
    expect(bad.status).toBe(400);
    const good = await fetch(`${base}/v1/reports`, {
      body: JSON.stringify({ id: "c1", kind: "collections", reason: "spam account" }),
      headers: { ...json, authorization: "Bearer publisher" },
      method: "POST",
    });
    expect(good.status).toBe(200);
    const publisherRead = await fetch(`${base}/v1/reports`, { headers: { authorization: "Bearer publisher" } });
    expect(publisherRead.status).toBe(403);
    const list = await fetch(`${base}/v1/reports`, { headers: { authorization: "Bearer moderator" } });
    expect(list.status).toBe(200);
    const body = (await list.json()) as { reports: Array<{ reason: string }> };
    expect(body.reports.map((report) => report.reason)).toEqual(["spam account"]);
  });

  it("bounds report retention, count, pagination, and read rate", async () => {
    const store = memoryStore();
    const now = Date.now();
    store.reports = Array.from({ length: REPORT_MAX_COUNT }, (_, index) => ({
      at: index === 0 ? now - REPORT_RETENTION_MS - 1 : now - index,
      id: `old-${index}`,
      kind: "collections",
      reason: "old",
      reporter: "hash",
    }));
    const base = await start({ keys: ["publisher", "moderator"], limit: 2, moderators: ["moderator"] }, store);
    const invalidBase = await start({ keys: ["publisher", "moderator"], moderators: ["moderator"] });
    expect((await fetch(`${invalidBase}/v1/reports?before=bad`, { headers: { authorization: "Bearer moderator" } })).status).toBe(400);
    const submit = await fetch(`${base}/v1/reports`, {
      body: JSON.stringify({ id: "new", kind: "collections", reason: "new" }),
      headers: { authorization: "Bearer publisher", "content-type": "application/json" },
      method: "POST",
    });
    expect(submit.status).toBe(200);
    expect(store.reports).toHaveLength(REPORT_MAX_COUNT);
    expect(store.reports.some((report) => report.id === "old-0")).toBe(false);

    const first = await fetch(`${base}/v1/reports?limit=10`, { headers: { authorization: "Bearer moderator" } });
    const firstBody = (await first.json()) as { nextCursor: number | null; reports: Array<{ id: string }> };
    expect(first.status).toBe(200);
    expect(firstBody.reports).toHaveLength(10);
    expect(firstBody.nextCursor).toEqual(expect.any(Number));

    const second = await fetch(`${base}/v1/reports?limit=10&before=${firstBody.nextCursor}`, { headers: { authorization: "Bearer moderator" } });
    expect(second.status).toBe(200);
    const third = await fetch(`${base}/v1/reports?limit=10`, { headers: { authorization: "Bearer moderator" } });
    expect(third.status).toBe(429);
  });
});
