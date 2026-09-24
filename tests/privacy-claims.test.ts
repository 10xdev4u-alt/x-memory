import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = new URL("../", import.meta.url);

describe("privacy claims", () => {
  it("maps public claims to existing evidence", async () => {
    const policy = await readFile(new URL("docs/PRIVACY.md", root), "utf8");
    const evidence = [
      "tests/settings.test.ts",
      "tests/export.test.ts",
      "tests/hosted-publishing.test.ts",
      "tests/visibility.test.ts",
      "tests/server-api.test.ts",
    ];

    for (const path of evidence) {
      expect(policy).toContain(path);
      await expect(access(fileURLToPath(new URL(path, root)))).resolves.toBeUndefined();
    }
    expect(policy).toContain("Local wipe does not delete hosted objects or abuse reports.");
    expect(policy).not.toContain("Hosted objects delete through owner takedown.");
  });
});
