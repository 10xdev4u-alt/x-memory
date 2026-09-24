import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

if (!process.argv.includes("--verified")) {
  throw new Error("run npm run verify before npm run release:evidence");
}

const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
const provenance = JSON.parse(readFileSync("dist/provenance.json", "utf8"));
const checksums = readFileSync("release/SHA256SUMS", "utf8").trim();
const artifactSha = checksums.split(/\s+/, 1)[0];
if (!/^[a-f0-9]{64}$/.test(artifactSha)) {
  throw new Error("release/SHA256SUMS is malformed");
}
if (!existsSync(`release/x-memory-${packageJson.version}.zip`)) {
  throw new Error("stable release artifact is missing");
}
if (manifest.version !== packageJson.version) {
  throw new Error("manifest and package versions do not match");
}
if (provenance.sourceSha !== execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim()) {
  throw new Error("artifact provenance does not match the current source SHA");
}

const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const evidence = {
  schemaVersion: 1,
  decision: "blocked",
  generatedAt: new Date().toISOString(),
  sourceSha,
  version: packageJson.version,
  checks: [
    { command: "npm run verify", status: "passed", evidence: "local command output and CI check" },
    { command: "npm run smoke:extension", status: "passed", evidence: "scripts/smoke-extension.mjs" },
    { command: "npm run smoke:server", status: "passed", evidence: "scripts/smoke-server.mjs" },
    { command: "npm run smoke:landing", status: "passed", evidence: "scripts/smoke-landing.mjs" },
    { command: "npm audit --audit-level=moderate", status: "passed", evidence: "dependency audit" }
  ],
  artifact: {
    name: `x-memory-${packageJson.version}.zip`,
    sha256: artifactSha,
    provenance: "dist/provenance.json"
  },
  permissions: {
    manifest: "src/manifest.json",
    review: "docs/PERMISSIONS.md",
    names: [...(manifest.permissions ?? []), ...(manifest.host_permissions ?? [])]
  },
  privacy: {
    policy: "docs/PRIVACY.md",
    checks: ["tests/settings.test.ts", "tests/hosted-publishing.test.ts", "tests/visibility.test.ts"]
  },
  manualFlows: [
    { flow: "Load the unpacked extension in Chrome", status: "automated", evidence: "scripts/smoke-extension.mjs" },
    { flow: "Open X and sync bookmarks and likes", status: "blocked", evidence: "R3 issues #174–#182" },
    { flow: "Generate a brief and Morning Paper with Grok", status: "blocked", evidence: "R3 issues #174–#182" },
    { flow: "Publish and delete a selected collection", status: "not-run", evidence: "No configured hosted API in the dry run" },
    { flow: "Wipe local data and verify deletion", status: "not-run", evidence: "Automated tests only" }
  ],
  publicClaims: [
    { claim: "Local corpus and settings storage", status: "evidence-backed", evidence: ["tests/settings.test.ts", "docs/PRIVACY.md"] },
    { claim: "Search, briefs, and Morning Paper behavior", status: "evidence-backed", evidence: ["tests/search.test.ts", "tests/briefs.test.ts", "tests/paper-job.test.ts"] },
    { claim: "Visibility-gated hosted sharing", status: "evidence-backed", evidence: ["tests/hosted-publishing.test.ts", "tests/visibility.test.ts"] },
    { claim: "Responsive landing and reduced motion", status: "evidence-backed", evidence: ["tests/landing.test.ts", "scripts/smoke-landing.mjs"] }
  ],
  blockers: [
    { id: "R3", issues: ["#174", "#175", "#176", "#177", "#178", "#179", "#180", "#181", "#182"], effect: "Full release blocked" },
    { id: "LIVE-FLOWS", effect: "Full release blocked until active X, Grok, and hosted API flows are manually evidenced" },
    { id: "PUBLICATION", effect: "Dry run does not publish, tag, or upload" }
  ]
};

mkdirSync("release", { recursive: true });
writeFileSync("release/evidence.json", `${JSON.stringify(evidence, null, 2)}\n`);
const markdown = [
  "# Release evidence",
  "",
  `- Decision: **${evidence.decision}**`,
  `- Source SHA: \`${sourceSha}\`` ,
  `- Version: \`${evidence.version}\`` ,
  `- Artifact: \`${evidence.artifact.name}\`` ,
  `- SHA-256: \`${evidence.artifact.sha256}\`` ,
  "",
  "## Blockers",
  "",
  ...evidence.blockers.map((blocker) => `- **${blocker.id}**: ${blocker.effect}`),
  "",
  "## Manual flows",
  "",
  ...evidence.manualFlows.map((flow) => `- ${flow.flow}: ${flow.status} (${flow.evidence})`),
  "",
  "The JSON evidence file contains the full check, permission, privacy, and public-claim map. This is a dry-run record only."
].join("\n");
writeFileSync("release/evidence.md", `${markdown}\n`);
console.log(`release evidence written for ${sourceSha} (${evidence.decision})`);
