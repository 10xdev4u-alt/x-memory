import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8")) as {
  content_security_policy?: { extension_pages?: string };
  host_permissions?: string[];
  permissions?: string[];
};

function htmlFiles(): string[] {
  return ["src/panel.html", "src/options.html"].map((file) => readFileSync(file, "utf8"));
}

describe("security posture", () => {
  it("locks extension pages to self scripts", () => {
    expect(manifest.content_security_policy?.extension_pages).toBe("script-src 'self'; object-src 'self'");
  });

  it("requests only x.com, the local API, storage, and panel", () => {
    expect(manifest.host_permissions).toEqual(["http://127.0.0.1/*", "https://x.com/*"]);
    expect(manifest.permissions).toEqual(expect.arrayContaining(["storage", "sidePanel", "alarms"]));
    expect(manifest.permissions).toHaveLength(3);
  });

  it("ships no inline scripts or handlers", () => {
    for (const html of htmlFiles()) {
      expect(html).not.toMatch(/<script(?![^>]*src=)/);
      expect(html).not.toMatch(/\son\w+=/);
    }
  });
});
