import { clearEvents, exportEvents, isTelemetryEnabled, listEvents, recordEvent, setTelemetryEnabled } from "../src/lib/telemetry.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store.get(key) }),
        remove: async (key: string) => {
          store.delete(key);
        },
        set: async (entries: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(entries)) store.set(key, value);
        },
      },
    },
  });
});

describe("telemetry", () => {
  it("stays off by default and drops events", async () => {
    expect(await isTelemetryEnabled()).toBe(false);
    expect(await recordEvent("x")).toBe(false);
    expect(await listEvents()).toEqual([]);
  });

  it("records locally when enabled", async () => {
    await setTelemetryEnabled(true);
    expect(await recordEvent("sync", { count: "3" })).toBe(true);
    const events = await listEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ name: "sync", props: { count: "3" } });
  });

  it("caps the buffer at one hundred", async () => {
    await setTelemetryEnabled(true);
    for (let i = 0; i < 105; i += 1) {
      await recordEvent(`e${i}`);
    }
    expect((await listEvents()).length).toBe(100);
  });

  it("disabling wipes the buffer", async () => {
    await setTelemetryEnabled(true);
    await recordEvent("x");
    await setTelemetryEnabled(false);
    expect(await listEvents()).toEqual([]);
    expect(await isTelemetryEnabled()).toBe(false);
  });

  it("exports and clears", async () => {
    await setTelemetryEnabled(true);
    await recordEvent("x");
    expect(JSON.parse(await exportEvents())).toHaveLength(1);
    await clearEvents();
    expect(await listEvents()).toEqual([]);
  });
});
