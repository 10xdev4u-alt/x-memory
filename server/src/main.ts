import { createApiServer, durableStore } from "./server.js";

async function start(): Promise<void> {
  const keys = new Set((process.env["XMEM_API_KEYS"] ?? "").split(",").filter((key) => key !== ""));
  if (keys.size === 0) throw new Error("XMEM_API_KEYS is empty, refusing to start without auth");

  const port = Number(process.env["PORT"] ?? "8787");
  const origins = new Set((process.env["XMEM_CORS_ORIGINS"] ?? "").split(",").filter((origin) => origin !== ""));
  const store = await durableStore(process.env["XMEM_API_PATH"] ?? "./data/x-memory-api.json");
  const server = createApiServer(store, { allowedOrigins: origins, keys });
  server.listen(port, "127.0.0.1", () => {
    console.log(`x-memory public api on 127.0.0.1:${port}`);
  });
}

void start().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
