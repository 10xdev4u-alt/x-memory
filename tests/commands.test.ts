import { COMMANDS, filterCommands } from "../src/lib/commands.js";
import { describe, expect, it } from "vitest";

describe("commands", () => {
  it("registers navigation plus session commands", () => {
    expect(COMMANDS.map((command) => command.id)).toEqual([
      "go-library",
      "go-reader",
      "go-paper",
      "sync-now",
      "check-session",
    ]);
  });

  it("returns everything on empty query", () => {
    expect(filterCommands("  ")).toHaveLength(COMMANDS.length);
  });

  it("filters case-insensitively", () => {
    expect(filterCommands("READER").map((command) => command.id)).toEqual(["go-reader"]);
    expect(filterCommands("go").map((command) => command.id)).toEqual(["go-library", "go-reader", "go-paper"]);
  });

  it("matches nothing unknown", () => {
    expect(filterCommands("zzz")).toEqual([]);
  });
});
