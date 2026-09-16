import { createApiServer, memoryStore } from "./server.js";

const keys = new Set((process.env["XMEM_API_KEYS"] ?? "").split(",").filter((key) => key !== ""));
if (keys.size === 0) {
  console.error("XMEM_API_KEYS is empty, refusing to start without auth");
  process.exit(1);
}

const port = Number(process.env["PORT"] ?? "8787");
const server = createApiServer(memoryStore(), { keys });
server.listen(port, "127.0.0.1", () => {
  console.log(`x-memory public api on 127.0.0.1:${port}`);
});
