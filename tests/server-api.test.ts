import { createApiServer, memoryStore } from "../server/src/server.js";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import type { Server } from "node:http";

let servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
  servers = [];
});

async function start(options?: { keys?: string[]; limit?: number }): Promise<string> {
  const apiOptions = { keys: new Set(options?.keys ?? ["k1"]) };
  const server = createApiServer(
    memoryStore(),
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
    const stranger = await fetch(`${base}/v1/collections/c9`, { headers: { authorization: "Bearer stranger" }, method: "DELETE" });
    expect(stranger.status).toBe(403);
    const missing = await fetch(`${base}/v1/collections/nope`, { headers: { authorization: "Bearer owner" }, method: "DELETE" });
    expect(missing.status).toBe(404);
    const owner = await fetch(`${base}/v1/collections/c9`, { headers: { authorization: "Bearer owner" }, method: "DELETE" });
    expect(owner.status).toBe(200);
    expect((await fetch(`${base}/v1/collections/c9`)).status).toBe(404);
  });

  it("takes abuse reports with credit", async () => {
    const base = await start();
    const json = { "content-type": "application/json" };
    const anon = await fetch(`${base}/v1/reports`, {
      body: JSON.stringify({ id: "c1", kind: "collections", reason: "spam" }),
      headers: json,
      method: "POST",
    });
    expect(anon.status).toBe(401);
    const bad = await fetch(`${base}/v1/reports`, {
      body: JSON.stringify({ id: "c1", kind: "nope", reason: "x" }),
      headers: { ...json, authorization: "Bearer k1" },
      method: "POST",
    });
    expect(bad.status).toBe(400);
    const good = await fetch(`${base}/v1/reports`, {
      body: JSON.stringify({ id: "c1", kind: "collections", reason: "spam account" }),
      headers: { ...json, authorization: "Bearer k1" },
      method: "POST",
    });
    expect(good.status).toBe(200);
    const list = await fetch(`${base}/v1/reports`, { headers: { authorization: "Bearer k1" } });
    const body = (await list.json()) as { reports: Array<{ reason: string }> };
    expect(body.reports.map((report) => report.reason)).toEqual(["spam account"]);
  });
});
