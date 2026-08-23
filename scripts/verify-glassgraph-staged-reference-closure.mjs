import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stagedRoot = resolve(root, "dist-site");
const stagedOrigin = "https://staged.nemurium.invalid";
const expectedHtmlPaths = ["index.html", "glassgraph/index.html"];
const expectedManifestPaths = ["glassgraph/site.webmanifest"];
const references = new Set();

const publicPathFor = (reference, sourcePath) => {
  if (!reference || /^(?:#|data:|mailto:|tel:|javascript:)/i.test(reference)) return null;
  const url = new URL(reference, new URL(sourcePath, stagedOrigin + "/"));
  if (url.origin !== stagedOrigin) return null;

  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  let resolvedPath = resolve(stagedRoot, requestedPath);
  if (resolvedPath !== stagedRoot && !resolvedPath.startsWith(stagedRoot + "/")) {
    throw new Error("Staged reference escapes the public output: " + reference);
  }
  if (existsSync(resolvedPath) && statSync(resolvedPath).isDirectory()) {
    resolvedPath = resolve(resolvedPath, "index.html");
  }
  return relative(stagedRoot, resolvedPath).replaceAll("\\", "/");
};

const recordReference = (reference, sourcePath) => {
  const normalized = publicPathFor(reference, sourcePath);
  if (normalized) references.add(normalized);
};

for (const htmlPath of expectedHtmlPaths) {
  const absolutePath = resolve(stagedRoot, htmlPath);
  assert.ok(existsSync(absolutePath), "Staged public page is missing: " + htmlPath);
  const html = readFileSync(absolutePath, "utf8");
  for (const match of html.matchAll(/\b(?:src|href)=['"]([^'"]+)['"]/gi)) {
    recordReference(match[1], htmlPath);
  }
  for (const match of html.matchAll(/\bsrcset=['"]([^'"]+)['"]/gi)) {
    for (const candidate of match[1].split(",")) {
      recordReference(candidate.trim().split(/\s+/, 1)[0], htmlPath);
    }
  }
}

for (const manifestPath of expectedManifestPaths) {
  const absolutePath = resolve(stagedRoot, manifestPath);
  assert.ok(existsSync(absolutePath), "Staged public manifest is missing: " + manifestPath);
  const manifest = JSON.parse(readFileSync(absolutePath, "utf8"));
  for (const icon of manifest.icons ?? []) recordReference(icon.src, manifestPath);
  recordReference(manifest.start_url, manifestPath);
}

for (const reference of references) {
  const stagedPath = resolve(stagedRoot, reference);
  assert.ok(existsSync(stagedPath), "Staged public reference is missing: " + reference);
  assert.ok(statSync(stagedPath).isFile(), "Staged public reference is not a file: " + reference);
}

console.log("GLASSGRAPH_STAGED_REFERENCE_CLOSURE_OK " + references.size);
