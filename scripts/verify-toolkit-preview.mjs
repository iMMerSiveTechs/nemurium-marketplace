import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalog = JSON.parse(readFileSync(resolve(root, "toolkit", "catalog.json"), "utf8"));
const preview = resolve(root, "preview", "toolkit");
const index = readFileSync(resolve(preview, "index.html"), "utf8");

assert.equal(catalog.releaseState, "PREVIEW_ONLY");
assert.ok(catalog.items.length >= 15, "toolkit must list the high-value set, not a thin placeholder");
assert.match(index, /noindex/);
assert.doesNotMatch(index, /production-ready enterprise/i);
assert.doesNotMatch(index, /20\+ live connectors/i);
assert.doesNotMatch(index, /openProduct\(/);

const kinds = new Set(catalog.items.map((item) => item.kind));
for (const kind of ["agent", "skill", "tool", "connector"]) {
  assert.ok(kinds.has(kind), `catalog must include ${kind}s`);
}

const bannedIds = new Set(["bash", "read", "write", "grep", "apollo", "enrich-lead"]);
for (const item of catalog.items) {
  assert.ok(!bannedIds.has(item.id), `${item.id} is not a NEMURIUM listing`);
  assert.ok(["coming", "brief", "first-product"].includes(item.status), `${item.id} has an honest status`);
  const page = resolve(preview, item.kind + "s", `${item.id}.html`);
  assert.ok(existsSync(page), `missing ${item.id} page`);
  const html = readFileSync(page, "utf8");
  assert.match(html, new RegExp(item.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(html, /noindex/);
  assert.match(index, new RegExp(`${item.kind}s/${item.id}\\.html`));
}

assert.ok(!existsSync(resolve(root, "dist-site", "toolkit")), "toolkit must not be staged into the live dist-site");
console.log(`NEMURIUM_TOOLKIT_PREVIEW_OK ${catalog.items.length}`);
