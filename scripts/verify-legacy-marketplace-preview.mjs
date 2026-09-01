import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const preview = resolve(root, "preview/legacy-marketplace");
const index = readFileSync(resolve(preview, "index.html"), "utf8");
const pageIndex = JSON.parse(readFileSync(resolve(preview, "page-index.json"), "utf8"));

assert.match(index, /Archived preview/, "The catalog must label itself as an archived preview.");
assert.match(index, /noindex,nofollow/, "The catalog must stay out of search indexes.");
assert.match(index, /function openProduct/, "Catalog cards must be clickable.");
assert.ok(pageIndex.pageCount >= 90, "Most archived skill and agent pages must be linked.");

for (const [name, href] of Object.entries(pageIndex.pages)) {
  assert.ok(existsSync(resolve(preview, href)), `Missing page for ${name}: ${href}`);
}

assert.ok(existsSync(resolve(preview, "agents/plan-agent.html")), "Plan Agent page must exist.");
assert.ok(existsSync(resolve(preview, "skills/engineering/architecture.html")), "Architecture skill page must exist.");
assert.match(
  readFileSync(resolve(preview, "skills/engineering/architecture.html"), "utf8"),
  /href="\.\.\/\.\.\/index\.html"/,
  "Skill pages must link back to the catalog.",
);
assert.match(
  readFileSync(resolve(preview, "agents/plan-agent.html"), "utf8"),
  /href="\.\.\/index\.html"/,
  "Agent pages must link back to the catalog.",
);

console.log("LEGACY_MARKETPLACE_PREVIEW_OK " + pageIndex.pageCount);
