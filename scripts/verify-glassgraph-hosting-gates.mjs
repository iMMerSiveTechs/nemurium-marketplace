import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const workflow = readFileSync(new URL(".github/workflows/deploy.yml", root), "utf8");
const vercel = JSON.parse(readFileSync(new URL("vercel.json", root), "utf8"));
const requiredCommands = [
  "node scripts/verify-glassgraph-prerelease-page.mjs",
  "node scripts/verify-glassgraph-delivery-parity.mjs --contract release/glassgraph-product.json",
];

for (const command of requiredCommands) {
  assert.ok(
    workflow.includes(`run: ${command}`),
    `GitHub Pages must run ${command}`,
  );
  assert.ok(
    vercel.buildCommand?.split(/\s*&&\s*/).includes(command),
    `Vercel must run ${command}`,
  );
}
assert.ok(
  workflow.indexOf(requiredCommands[1]) < workflow.indexOf("actions/upload-pages-artifact"),
  "GitHub Pages release parity must pass before upload",
);
assert.equal(vercel.outputDirectory, ".");
console.log("PASS GitHub Pages and Vercel both fail closed on the GlassGraph publication gates");
