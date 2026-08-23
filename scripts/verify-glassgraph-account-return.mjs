import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pagePath = resolve(root, "account", "index.html");
const vercelPath = resolve(root, "vercel.json");

assert.ok(existsSync(pagePath), "The GlassGraph account return page is missing.");
const html = readFileSync(pagePath, "utf8");
const vercel = JSON.parse(readFileSync(vercelPath, "utf8"));
assert.match(html, /<meta\b[^>]*name=["']robots["'][^>]*content=["']noindex,follow["']/i, "The account return page must remain noindex,follow.");
assert.match(html, /<h1>Open GlassGraph Studio to continue<\/h1>/i, "The account return page must provide the customer return heading.");
assert.match(html, /Open GlassGraph Studio[\s\S]{0,160}Check access again\./i, "The account return page must tell customers to check access again in GlassGraph Studio.");
assert.match(html, /GlassGraph subscriptions are not available yet\./i, "The account return page must not imply live billing or access proof.");
assert.match(html, /When billing is available, you’ll manage subscription changes inside the app\./i, "The account return page must make subscription controls conditional on billing availability.");
assert.match(html, /href=["']mailto:immersivetechs@nemurium\.com\?subject=GlassGraph%20account%20support["']/i, "The account return page must expose the GlassGraph support email path.");
assert.match(html, /href=["']\/glassgraph["']/i, "The account return page must provide a safe return to the public GlassGraph page.");
assert.doesNotMatch(html, /https?:\/\/(?:checkout\.stripe\.com|billing\.stripe\.com)|stripe\.com|lemonsqueezy\.com/i, "The account return page must not expose a live provider, checkout, or portal link.");
assert.doesNotMatch(html, /<form\b|\bfetch\(|\bXMLHttpRequest\b/i, "The account return page must remain a static, non-transactional surface.");

const accountRewrite = vercel.rewrites?.find((rewrite) => rewrite.source === "/account");
assert.deepEqual(accountRewrite, { source: "/account", destination: "/account/index.html" }, "Vercel must rewrite /account to the static account return page.");

console.log("PASS GlassGraph account return seam");
console.log("- route: /account");
console.log("- billing claim: not live");
console.log("- checkout or portal links: absent");
