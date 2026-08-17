import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stagedRoot = resolve(root, "dist-site");
const stagedOrigin = "https://staged.nemurium.invalid";
const references = new Set();

const normalizeReference = (reference, sourcePath) => {
  if (!reference || /^(?:#|data:|mailto:|tel:|javascript:)/i.test(reference)) return null;

  const url = new URL(reference, new URL(sourcePath, `${stagedOrigin}/`));
  if (url.origin !== stagedOrigin) return null;

  const pathname = decodeURIComponent(url.pathname);
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolvedPath = resolve(stagedRoot, relativePath);
  if (resolvedPath !== stagedRoot && !resolvedPath.startsWith(`${stagedRoot}/`)) {
    throw new Error(`Staged reference escapes the public output: ${reference}`);
  }
  return relative(stagedRoot, resolvedPath).replaceAll("\\", "/");
};

const recordReference = (reference, sourcePath) => {
  const normalized = normalizeReference(reference, sourcePath);
  if (normalized) references.add(normalized);
};

const indexPath = resolve(stagedRoot, "index.html");
assert.ok(existsSync(indexPath), "Run staging before verifying public references.");
const html = readFileSync(indexPath, "utf8");

for (const match of html.matchAll(/\b(?:src|href)=['"]([^'"]+)['"]/gi)) {
  recordReference(match[1], "index.html");
}
for (const match of html.matchAll(/\bsrcset=['"]([^'"]+)['"]/gi)) {
  for (const candidate of match[1].split(",")) {
    recordReference(candidate.trim().split(/\s+/, 1)[0], "index.html");
  }
}

const manifestPath = resolve(stagedRoot, "site.webmanifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
for (const icon of manifest.icons ?? []) {
  recordReference(icon.src, "site.webmanifest");
}
recordReference(manifest.start_url, "site.webmanifest");

for (const reference of references) {
  const stagedPath = resolve(stagedRoot, reference);
  assert.ok(existsSync(stagedPath), `Staged public reference is missing: ${reference}`);
  assert.ok(statSync(stagedPath).isFile(), `Staged public reference is not a file: ${reference}`);
}

console.log(`GLASSGRAPH_STAGED_REFERENCE_CLOSURE_OK ${references.size}`);
