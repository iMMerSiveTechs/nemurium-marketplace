import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const workflow = readFileSync(new URL(".github/workflows/deploy.yml", root), "utf8");
const vercel = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
const vercelBuildScript = readFileSync(
  new URL("scripts/build-glassgraph-public-site.mjs", root),
  "utf8",
);
const requiredCommands = [
  "node scripts/verify-glassgraph-hosting-gates.mjs",
  "node scripts/verify-glassgraph-prerelease-page.mjs",
  "node scripts/verify-glassgraph-launch-signup.mjs",
  "node scripts/verify-glassgraph-entitlement-page.mjs",
  "node scripts/verify-glassgraph-legal-readiness.mjs --state prerelease",
  "node scripts/verify-glassgraph-delivery-parity.mjs --contract release/glassgraph-product.json",
];
const stagingCommand = "node scripts/stage-glassgraph-public-site.mjs";
const vercelBuildCommand = "node scripts/build-glassgraph-public-site.mjs";

for (const command of requiredCommands) {
  assert.ok(
    workflow.includes(`run: ${command}`),
    `GitHub Pages must run ${command}`,
  );
  assert.ok(
    vercelBuildScript.includes(JSON.stringify(command)),
    `Vercel build wrapper must run ${command}`,
  );
}
assert.ok(
  workflow.indexOf(requiredCommands[2]) < workflow.indexOf("actions/upload-pages-artifact"),
  "GitHub Pages release parity must pass before upload",
);
assert.ok(
  workflow.includes(`run: ${stagingCommand}`),
  "GitHub Pages must stage a narrow public site after its gates pass",
);
assert.ok(
  workflow.includes("path: 'dist-site'"),
  "GitHub Pages must upload only the staged GlassGraph public site",
);
assert.ok(
  vercelBuildScript.includes(JSON.stringify(stagingCommand)),
  "Vercel build wrapper must stage the same narrow public site",
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
console.log("PASS GitHub Pages and Vercel fail closed and publish only the staged GlassGraph page");
