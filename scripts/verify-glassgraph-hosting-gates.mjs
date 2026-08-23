import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const workflow = readFileSync(new URL(".github/workflows/deploy.yml", root), "utf8");
const vercel = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
const packageManifest = JSON.parse(readFileSync(new URL("package.json", root), "utf8"));
const buildScript = readFileSync(new URL("scripts/build-glassgraph-public-site.mjs", root), "utf8");
const stageScript = readFileSync(new URL("scripts/stage-glassgraph-public-site.mjs", root), "utf8");
const liveProofScript = readFileSync(new URL("scripts/verify-glassgraph-live-site.mjs", root), "utf8");
const stagedClosureScript = readFileSync(new URL("scripts/verify-glassgraph-staged-reference-closure.mjs", root), "utf8");
const hubPage = readFileSync(new URL("index.html", root), "utf8");
const productPage = readFileSync(new URL("glassgraph/index.html", root), "utf8");
const siteManifest = JSON.parse(readFileSync(new URL("glassgraph/site.webmanifest", root), "utf8"));

const requiredCommands = [
  "node scripts/verify-glassgraph-hosting-gates.mjs",
  "node scripts/verify-nemurium-hub.mjs",
  "node scripts/verify-glassgraph-prerelease-page.mjs",
  "node scripts/verify-glassgraph-launch-signup.mjs",
  "node scripts/verify-glassgraph-prelaunch-ux.mjs",
  "node scripts/verify-glassgraph-entitlement-page.mjs",
  "node scripts/verify-glassgraph-legal-readiness.mjs --state prerelease",
  "node scripts/verify-glassgraph-delivery-parity.mjs --contract release/glassgraph-product.json",
  "node scripts/stage-glassgraph-public-site.mjs",
  "node scripts/verify-glassgraph-staged-reference-closure.mjs",
];
for (const command of requiredCommands) {
  assert.ok(buildScript.includes(JSON.stringify(command)), "Vercel build wrapper must run " + command);
}

assert.equal(vercel.installCommand, "", "The static site must not install unnecessary dependencies during Vercel builds.");
assert.equal(vercel.buildCommand, "node scripts/build-glassgraph-public-site.mjs", "Vercel must use the checked site build wrapper.");
assert.equal(vercel.outputDirectory, "dist-site", "Vercel must publish the narrow staged output.");
assert.equal(packageManifest.private, true, "The deployment package must remain private.");
assert.equal(packageManifest.engines?.node, "22.x", "The Vercel build must use the verified Node 22 runtime.");
assert.ok(workflow.includes("run: node scripts/build-glassgraph-public-site.mjs"), "GitHub Actions must validate the same build Vercel runs.");
assert.match(workflow, /actions\/setup-node@v4[\s\S]*node-version:\s*["']22["']/, "GitHub validation must use Node 22.");
assert.doesNotMatch(workflow, /(?:actions\/(?:configure-pages|upload-pages-artifact|deploy-pages)|\bpages:\s*write\b|\bid-token:\s*write\b|github-pages)/i, "GitHub Actions must not create a second public host.");

assert.ok(
  vercel.redirects?.some(({ source, destination }) => source === "/index.html" && destination === "/"),
  "Vercel must collapse /index.html to the canonical NEMURIUM hub.",
);
assert.ok(
  vercel.redirects?.some(({ source, destination }) => source === "/glassgraph/index.html" && destination === "/glassgraph"),
  "Vercel must collapse /glassgraph/index.html to the canonical product URL.",
);
assert.ok(
  vercel.redirects?.some(({ source, destination }) => source === "/glassgraph/" && destination === "/glassgraph"),
  "Vercel must normalize the trailing GlassGraph slash.",
);
assert.ok(
  vercel.rewrites?.some(({ source, destination }) => source === "/glassgraph" && destination === "/glassgraph/index.html"),
  "Vercel must serve the GlassGraph product page at /glassgraph.",
);

const rootHeaders = vercel.headers?.find(({ source }) => source === "/(.*)")?.headers ?? [];
const headersByKey = new Map(rootHeaders.map(({ key, value }) => [key.toLowerCase(), value]));
for (const [key, pattern] of [
  ["content-security-policy", /default-src 'self';[\s\S]*frame-ancestors 'none'/],
  ["x-content-type-options", /^nosniff$/],
  ["x-frame-options", /^DENY$/],
  ["referrer-policy", /^strict-origin-when-cross-origin$/],
  ["permissions-policy", /camera=\(\)[\s\S]*microphone=\(\)[\s\S]*geolocation=\(\)/],
]) assert.match(headersByKey.get(key) ?? "", pattern, "Vercel must set a safe " + key + " header.");

for (const [page, description, canonical] of [
  [hubPage, "NEMURIUM hub", "https://www.nemurium.com/"],
  [productPage, "GlassGraph product page", "https://www.nemurium.com/glassgraph"],
]) {
  assert.ok(page.includes('rel="canonical" href="' + canonical + '"'), description + " must declare its own canonical URL.");
  assert.match(page, /<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*index[^"']*["']/i, description + " must remain indexable.");
}
assert.match(hubPage, /href=["']\/glassgraph["']/, "The hub must link GlassGraph at its dedicated URL.");
assert.match(productPage, /href=["']\/["'] aria-label=["']NEMURIUM home["']/, "The product page must link back to the NEMURIUM hub.");
assert.match(productPage, /href=["']\/glassgraph\/site\.webmanifest["']/, "The product page must use the dedicated manifest.");
assert.equal(siteManifest.name, "GlassGraph Studio");
assert.equal(siteManifest.start_url, "/glassgraph");
assert.equal(siteManifest.display, "browser", "The public product page must not pose as an installable app.");

assert.match(stageScript, /resolve\(root, "glassgraph", "index\.html"\)/, "Staging must include the dedicated GlassGraph page.");
assert.match(stageScript, /resolve\(root, "glassgraph", "site\.webmanifest"\)/, "Staging must include the dedicated product manifest.");
assert.match(stageScript, /"glassgraph"/, "Staging must include the GlassGraph output directory.");
assert.doesNotMatch(stageScript, /templates\//, "Staging must keep source-only signup/legal templates out of the public output.");
assert.match(stagedClosureScript, /glassgraph\/index\.html/, "Reference closure must verify the product page as well as the hub.");
assert.match(liveProofScript, /glassgraph\/index\.html/, "Live proof must verify the deployed product page as well as the hub.");
assert.match(liveProofScript, /\/glassgraph/, "Live proof must request the canonical GlassGraph route.");

console.log("PASS Vercel is the only delivery target; root is NEMURIUM and /glassgraph is the product page.");
