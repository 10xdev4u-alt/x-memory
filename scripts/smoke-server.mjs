import { spawn } from "node:child_process";
import { once } from "node:events";

const child = spawn(process.execPath, ["dist-server/main.js"], {
  env: { ...process.env, XMEM_API_KEYS: process.env.XMEM_API_KEYS ?? "smoke-key", PORT: "0" },
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
  console.log("server entrypoint started");
} finally {
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
}
