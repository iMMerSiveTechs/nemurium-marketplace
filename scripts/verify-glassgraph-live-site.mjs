#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

const root = resolve(new URL("../", import.meta.url).pathname);
const options = {};
const args = process.argv.slice(2);
const allowedOptions = new Set(["--origin", "--staged-dir"]);

while (args.length > 0) {
  const option = args.shift();
  const value = args.shift();
  if (!allowedOptions.has(option) || !value || options[option.slice(2)]) {
    console.error(
      "usage: node scripts/verify-glassgraph-live-site.mjs [--origin https://www.nemurium.com] [--staged-dir dist-site]",
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

const stagedDir = resolve(root, options.stagedDir ?? "dist-site");
if (relative(root, stagedDir).startsWith("..")) {
  throw new Error("staged-dir must remain inside the site source tree");
}

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

const assertSecurityHeaders = (response) => {
  const headers = response.headers;
  assert.match(
    headers.get("content-security-policy") ?? "",
    /default-src 'self';[\s\S]*frame-ancestors 'none'/,
    "live page must send its source-bound Content-Security-Policy",
  );
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(
    headers.get("permissions-policy") ?? "",
    /camera=\(\)[\s\S]*microphone=\(\)[\s\S]*geolocation=\(\)/,
  );
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
