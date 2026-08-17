import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const workflow = readFileSync(new URL(".github/workflows/deploy.yml", root), "utf8");
const vercel = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
const vercelBuildScript = readFileSync(
  new URL("scripts/build-glassgraph-public-site.mjs", root),
  "utf8",
);
const stageScript = readFileSync(
  new URL("scripts/stage-glassgraph-public-site.mjs", root),
  "utf8",
);
const liveProofScript = readFileSync(
  new URL("scripts/verify-glassgraph-live-site.mjs", root),
  "utf8",
);
const stagedReferenceClosureScript = readFileSync(
  new URL("scripts/verify-glassgraph-staged-reference-closure.mjs", root),
  "utf8",
);
const page = readFileSync(new URL("index.html", root), "utf8");
const siteManifest = JSON.parse(readFileSync(new URL("site.webmanifest", root), "utf8"));
const requiredCommands = [
  "node scripts/verify-glassgraph-hosting-gates.mjs",
  "node scripts/verify-glassgraph-prerelease-page.mjs",
  "node scripts/verify-glassgraph-launch-signup.mjs",
  "node scripts/verify-glassgraph-entitlement-page.mjs",
  "node scripts/verify-glassgraph-legal-readiness.mjs --state prerelease",
  "node scripts/verify-glassgraph-delivery-parity.mjs --contract release/glassgraph-product.json",
];
const stagingCommand = "node scripts/stage-glassgraph-public-site.mjs";
const stagedReferenceClosureCommand = "node scripts/verify-glassgraph-staged-reference-closure.mjs";
const vercelBuildCommand = "node scripts/build-glassgraph-public-site.mjs";

for (const command of requiredCommands) {
  assert.ok(
    vercelBuildScript.includes(JSON.stringify(command)),
    `Vercel build wrapper must run ${command}`,
  );
}
assert.ok(
  workflow.includes(`run: ${vercelBuildCommand}`),
  "GitHub Actions must validate the same complete build that Vercel will use",
);
assert.ok(
  vercelBuildScript.includes(JSON.stringify(stagingCommand)),
  "Vercel build wrapper must stage the same narrow public site",
);
assert.ok(
  vercelBuildScript.includes(JSON.stringify(stagedReferenceClosureCommand)),
  "Vercel build wrapper must prove every staged local reference resolves before deployment",
);
assert.match(
  stagedReferenceClosureScript,
  /Staged public reference is missing/,
  "Staged-reference proof must reject a page or manifest reference that would deploy as a 404.",
);
assert.equal(
  vercel.buildCommand,
  vercelBuildCommand,
  "Vercel must use the short, checked build wrapper",
);
assert.ok(
  vercel.buildCommand.length <= 256,
  "Vercel buildCommand must stay within the platform's 256-character limit",
);
assert.equal(vercel.outputDirectory, "dist-site");
assert.deepEqual(
  vercel.redirects,
  [
    {
      source: "/(.*)",
      has: [{ type: "host", value: "nemurium-marketplace.vercel.app" }],
      destination: "https://www.nemurium.com/$1",
      permanent: true,
    },
    { source: "/index.html", destination: "/", permanent: true },
  ],
  "Vercel must redirect its project alias to the canonical homepage and collapse /index.html.",
);
const rootHeaders = vercel.headers?.find(({ source }) => source === "/(.*)")?.headers ?? [];
const headersByKey = new Map(rootHeaders.map(({ key, value }) => [key.toLowerCase(), value]));
for (const [key, pattern] of [
  ["content-security-policy", /default-src 'self';[\s\S]*frame-ancestors 'none'/],
  ["x-content-type-options", /^nosniff$/],
  ["x-frame-options", /^DENY$/],
  ["referrer-policy", /^strict-origin-when-cross-origin$/],
  ["permissions-policy", /camera=\(\)[\s\S]*microphone=\(\)[\s\S]*geolocation=\(\)/],
]) {
  assert.match(
    headersByKey.get(key) ?? "",
    pattern,
    `Vercel must set a safe ${key} header for every public path.`,
  );
}
assert.doesNotMatch(
  workflow,
  /(?:actions\/(?:configure-pages|upload-pages-artifact|deploy-pages)|\bpages:\s*write\b|\bid-token:\s*write\b|github-pages)/i,
  "GitHub Actions must not deploy or recreate an alternate GitHub Pages site.",
);
assert.doesNotMatch(
  stageScript,
  /\.nojekyll/,
  "Vercel staging must not carry GitHub Pages-only deployment artifacts.",
);
assert.match(
  workflow,
  /actions\/setup-node@v4[\s\S]*node-version:\s*["']22["']/,
  "GitHub validation must use the pinned Node 22 runtime used by the public-site build.",
);
assert.match(
  page,
  /<link\b(?=[^>]*\brel=["']icon["'])(?=[^>]*\bhref=["']assets\/glassgraph-mark\.svg["'])[^>]*>/i,
  "The public site must provide a GlassGraph browser icon.",
);
assert.match(
  page,
  /<link\b(?=[^>]*\brel=["']manifest["'])(?=[^>]*\bhref=["']site\.webmanifest["'])[^>]*>/i,
  "The public site must link its web manifest.",
);
assert.equal(siteManifest.name, "GlassGraph Studio");
assert.equal(siteManifest.display, "browser", "The marketing page must not pose as an installable app.");
assert.equal(siteManifest.icons?.[0]?.src, "/assets/glassgraph-mark.svg");
assert.ok(
  stageScript.includes('"glassgraph-mark.svg"') && stageScript.includes('"site.webmanifest"'),
  "Vercel staging must include the site mark and manifest.",
);
assert.match(
  liveProofScript,
  /execFileSync\(process\.execPath, \["scripts\/build-glassgraph-public-site\.mjs"\]/,
  "Live-site proof must rebuild the fixed current candidate before comparing it to Vercel.",
);
assert.doesNotMatch(
  liveProofScript,
  /--staged-dir/,
  "Live-site proof must not accept an arbitrary staged directory.",
);
assert.match(
  liveProofScript,
  /readFileSync\(resolve\(root, "vercel\.json"\)/,
  "Live-site proof must derive expected headers from the actual Vercel configuration.",
);
assert.match(
  liveProofScript,
  /assertContentType\(relativePath, response\)/,
  "Live-site proof must validate the delivered MIME type for every staged file.",
);
assert.match(
  liveProofScript,
  /index\.html must redirect to the canonical homepage/,
  "Live-site proof must reject a duplicate /index.html response.",
);
assert.match(
  liveProofScript,
  /\[404, 410\]\.includes\(response\.status\)/,
  "Live-site proof must reject arbitrary error responses from retired public origins.",
);
for (const retiredOrigin of [
  "https://nemurium-marketplace.vercel.app/",
  "https://immersivetechs.github.io/nemurium-marketplace/",
  "https://nemurium.macaly-app.com/",
]) {
  assert.ok(
    liveProofScript.includes(retiredOrigin),
    `Live-site proof must require retirement or canonical redirection for ${retiredOrigin}.`,
  );
}
console.log("PASS Vercel is the only site delivery target; GitHub Actions validates the staged public site.");
