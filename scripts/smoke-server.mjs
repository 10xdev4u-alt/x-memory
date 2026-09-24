import { spawn } from "node:child_process";
import { once } from "node:events";

const port = Number(process.env.SMOKE_PORT ?? "18987");
const child = spawn(process.execPath, ["dist-server/main.js"], {
  env: { ...process.env, XMEM_API_KEYS: process.env.XMEM_API_KEYS ?? "smoke-key", PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});
let output = "";
let errorOutput = "";

const started = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error("server entrypoint did not start within 5 seconds")), 5000);
  const onData = (chunk) => {
    output += chunk.toString();
    if (output.includes("x-memory public api on 127.0.0.1:")) {
      clearTimeout(timeout);
      resolve();
    }
  };
  child.stdout.on("data", onData);
  child.stderr.on("data", (chunk) => {
    errorOutput += chunk.toString();
  });
  child.once("error", (error) => {
    clearTimeout(timeout);
    reject(error);
  });
  child.once("exit", (code, signal) => {
    if (!output.includes("x-memory public api on 127.0.0.1:")) {
      clearTimeout(timeout);
      reject(new Error(`server entrypoint exited before startup: code=${code} signal=${signal} stderr=${errorOutput}`));
    }
  });
});

try {
  await started;
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const body = await response.json();
  if (!response.ok || body.ok !== true) {
    throw new Error(`server health check failed: status=${response.status} body=${JSON.stringify(body)}`);
  }
  console.log(`server entrypoint started and health returned ${response.status}`);
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}
