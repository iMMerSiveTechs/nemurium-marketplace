#!/usr/bin/env node
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const options = {};
const args = process.argv.slice(2);
const allowedOptions = new Set(["--origin"]);

while (args.length > 0) {
  const option = args.shift();
  const value = args.shift();
  if (!allowedOptions.has(option) || !value || options[option.slice(2)]) {
    console.error(
      "usage: node scripts/verify-glassgraph-live-site.mjs [--origin https://www.nemurium.com]",
    );
    process.exit(2);
  }
  options[option.slice(2)] = value;
}

const origin = new URL(options.origin ?? "https://www.nemurium.com");
if (
  origin.protocol !== "https:" ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash ||
  !/^(?:www\.nemurium\.com|[a-z0-9-]+\.vercel\.app)$/i.test(origin.hostname)
) {
  throw new Error(
    "origin must be the canonical HTTPS domain or a direct Vercel deployment origin",
  );
}
const isCanonicalOrigin = origin.origin === "https://www.nemurium.com";

// Always stage from the current source first. A live proof must never compare
// production against a caller-supplied or stale output directory.
execFileSync(process.execPath, ["scripts/build-glassgraph-public-site.mjs"], {
  cwd: root,
  stdio: "inherit",
});

const stagedDir = resolve(root, "dist-site");
const vercelConfig = JSON.parse(readFileSync(resolve(root, "vercel.json"), "utf8"));
const expectedVercelHeaders = new Map(
  (vercelConfig.headers ?? [])
    .find(({ source }) => source === "/(.*)")
    ?.headers?.map(({ key, value }) => [key.toLowerCase(), value]) ?? [],
);
assert.ok(expectedVercelHeaders.size > 0, "vercel.json must declare source-bound response headers");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const walk = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = resolve(directory, entry.name);
    if (entry.isDirectory()) return walk(entryPath);
    if (!entry.isFile()) return [];
    return [entryPath];
  });
const expectedFiles = walk(stagedDir)
  .map((filePath) => relative(stagedDir, filePath).replaceAll("\\", "/"))
  .sort();

assert.ok(expectedFiles.includes("index.html"), "staged site must contain index.html");
assert.ok(expectedFiles.includes("robots.txt"), "staged site must contain robots.txt");
assert.ok(expectedFiles.includes("sitemap.xml"), "staged site must contain sitemap.xml");
assert.ok(expectedFiles.includes("site.webmanifest"), "staged site must contain site.webmanifest");

const fetchLive = async (path) => {
  const url = new URL(path, origin);
  const response = await fetch(url, {
    redirect: "error",
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(20_000),
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { response, bytes, url };
};

const fetchExternal = async (url) => {
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "cache-control": "no-cache" },
    signal: AbortSignal.timeout(20_000),
  });
  return { response, url: new URL(url) };
};

const assertSecurityHeaders = (response) => {
  const headers = response.headers;
  for (const [key, expectedValue] of expectedVercelHeaders) {
    assert.equal(
      headers.get(key),
      expectedValue,
      `live page must send the exact source-bound ${key} header`,
    );
  }
  assert.match(
    headers.get("strict-transport-security") ?? "",
    /max-age=\d+/,
    "live HTTPS site must keep HSTS enabled",
  );
  assert.match(
    headers.get("server") ?? "",
    /vercel/i,
    "live public site must be served by the intended Vercel delivery path",
  );
};

const expectedContentType = (relativePath) => {
  if (relativePath.endsWith(".html")) return /^text\/html\b/i;
  if (relativePath.endsWith(".txt")) return /^text\/plain\b/i;
  if (relativePath.endsWith(".xml")) return /^(?:application|text)\/xml\b/i;
  if (relativePath.endsWith(".webmanifest")) return /^application\/(?:manifest\+json|json)\b/i;
  if (relativePath.endsWith(".svg")) return /^image\/svg\+xml\b/i;
  if (relativePath.endsWith(".jpg") || relativePath.endsWith(".jpeg")) return /^image\/jpeg\b/i;
  throw new Error(`No content-type expectation is defined for staged ${relativePath}`);
};

const assertContentType = (relativePath, response) => {
  assert.match(
    response.headers.get("content-type") ?? "",
    expectedContentType(relativePath),
    `live ${relativePath} must have the expected content type`,
  );
};

const assertRetiredOrCanonical = async (url, label) => {
  const { response } = await fetchExternal(url);
  if ([301, 302, 307, 308].includes(response.status)) {
    const redirect = new URL(response.headers.get("location") ?? "", url);
    assert.equal(redirect.origin, origin.origin, `${label} must redirect to the canonical site`);
    assert.equal(redirect.pathname, "/", `${label} redirect must land on the canonical homepage`);
    assert.equal(redirect.search, "", `${label} redirect must not add a query string`);
    return;
  }
  assert.ok(
    response.status < 200 || response.status >= 300,
    `${label} must be retired or redirect to the canonical site; received HTTP ${response.status}`,
  );
};

try {
  const rootResponse = await fetchLive("/");
  assert.equal(rootResponse.response.status, 200, "canonical homepage must return HTTP 200");
  assertSecurityHeaders(rootResponse.response);
  if (isCanonicalOrigin) {
    assert.doesNotMatch(
      rootResponse.response.headers.get("x-robots-tag") ?? "",
      /noindex/i,
      "canonical live page must not be blocked from indexing by an X-Robots-Tag header",
    );
  }

  const results = [];
  for (const relativePath of expectedFiles) {
    const livePath = relativePath === "index.html" ? "/" : `/${relativePath}`;
    const { response, bytes, url } =
      relativePath === "index.html" ? rootResponse : await fetchLive(livePath);
    assert.equal(response.status, 200, `${url} must return HTTP 200`);
    assertSecurityHeaders(response);
    assertContentType(relativePath, response);
    const expectedBytes = readFileSync(resolve(stagedDir, relativePath));
    assert.equal(
      sha256(bytes),
      sha256(expectedBytes),
      `${url} does not match the exact staged ${relativePath} bytes`,
    );
    results.push({ path: relativePath, sha256: sha256(bytes) });
  }

  for (const protectedPath of [
    "/.env",
    "/.git/HEAD",
    "/vercel.json",
    "/release/glassgraph-product.json",
    "/scripts/verify-glassgraph-live-site.mjs",
    "/agents/general-purpose-agent.html",
    "/product-template.html",
    "/assets/glassgraph-board-real.jpg",
    "/assets/glassgraph-motion-real.jpg",
    "/assets/glassgraph-native-real.jpg",
  ]) {
    const { response } = await fetchLive(protectedPath);
    assert.ok(
      response.status < 200 || response.status >= 300,
      `live site must not expose source path ${protectedPath}`,
    );
  }

  if (isCanonicalOrigin) {
    const apexResponse = await fetch("https://nemurium.com/", {
      redirect: "manual",
      headers: { "cache-control": "no-cache" },
      signal: AbortSignal.timeout(20_000),
    });
    assert.ok(
      [301, 302, 307, 308].includes(apexResponse.status),
      "apex domain must redirect to the canonical www domain",
    );
    const redirect = new URL(apexResponse.headers.get("location") ?? "", "https://nemurium.com/");
    assert.equal(redirect.origin, origin.origin, "apex redirect must target the canonical www origin");
    assert.equal(redirect.pathname, "/", "apex redirect must target the canonical homepage");
    assert.equal(redirect.search, "", "apex redirect must not add a query string");

    await assertRetiredOrCanonical(
      "https://nemurium-marketplace.vercel.app/",
      "Vercel alias",
    );
    await assertRetiredOrCanonical(
      "https://immersivetechs.github.io/nemurium-marketplace/",
      "legacy GitHub Pages site",
    );
    await assertRetiredOrCanonical(
      "https://nemurium.macaly-app.com/",
      "legacy Macaly site",
    );
  }

  console.log(
    `${isCanonicalOrigin ? "GLASSGRAPH_LIVE_SITE_PROOF_OK" : "GLASSGRAPH_PREVIEW_SITE_PARITY_OK"} ${JSON.stringify({
      origin: origin.origin,
      files: results.length,
      indexSha256: results.find(({ path }) => path === "index.html")?.sha256,
      delivery: isCanonicalOrigin ? "vercel-canonical" : "vercel-preview",
    })}`,
  );
} catch (error) {
  console.error(`GLASSGRAPH_LIVE_SITE_PROOF_FAILED: ${error.message}`);
  process.exit(1);
}
