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
    expect((await fetch(`${base}/v1/collections/c1`, { method: "DELETE" })).status).toBe(405);
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
});
