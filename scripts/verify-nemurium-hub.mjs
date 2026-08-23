import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pagePath = resolve(root, "index.html");
const html = readFileSync(pagePath, "utf8");
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const assetPath = (reference) => resolve(root, reference.replace(/^\/+/, ""));

for (const [pattern, message] of [
  [/<title>NEMURIUM \| Software for clearer work<\/title>/i, "The root page must be a NEMURIUM product hub, not a GlassGraph duplicate."],
  [/<link\b[^>]*rel=["']canonical["'][^>]*href=["']https:\/\/www\.nemurium\.com\/["']/i, "The NEMURIUM hub must use the root canonical URL."],
  [/<meta\b[^>]*property=["']og:url["'][^>]*content=["']https:\/\/www\.nemurium\.com\/["']/i, "The NEMURIUM hub Open Graph URL must be the root URL."],
  [/<a\b[^>]*href=["']\/glassgraph["'][^>]*>Explore GlassGraph<\/a>/i, "The hub must link directly to the dedicated GlassGraph page."],
  [/NEMURIUM is the independent brand behind GlassGraph Studio\./i, "The hub must explain the relationship between NEMURIUM and GlassGraph plainly."],
  [/New products will appear here when they are ready to share\./i, "The hub must leave room for future products without inventing them."],
  [/NEMURIUM brand[^<]{0,120}operated by Jethro Gordon/i, "The hub footer must distinguish the brand from an unverified legal entity."],
  [/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*index[^"']*["']/i, "The public hub must be indexable."],
]) check(pattern.test(html), message);

const productLinks = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)]
  .map((match) => match[1].replaceAll("&amp;", "&"));
check(productLinks.filter((href) => href === "/glassgraph").length >= 2, "The hub must expose clear GlassGraph entry points.");
check(
  !productLinks.some((href) => /(?:stripe|lemonsqueezy|checkout|subscribe|\.dmg(?:[?#]|$))/i.test(href)),
  "The NEMURIUM hub must not expose GlassGraph checkout or download before those flows are live.",
);

const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]));
for (const match of html.matchAll(/\bhref=["']#([^"']+)["']/gi)) {
  check(ids.has(match[1]), "Hub fragment target is missing: #" + match[1]);
}

for (const match of html.matchAll(/<(?:img|source)\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
  const source = match[1].replaceAll("&amp;", "&");
  if (!/^(?:https?:|data:|\/\/)/i.test(source)) {
    check(existsSync(assetPath(source)), "Hub references a missing asset: " + source);
  }
}

for (const [index, block] of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()) {
  const [, attributes, source] = block;
  try {
    if (/type=["']application\/ld\+json["']/i.test(attributes)) {
      const data = JSON.parse(source);
      check(data["@type"] === "WebSite" && data.name === "NEMURIUM", "Hub structured data must describe the NEMURIUM website.");
      check(data.url === "https://www.nemurium.com/", "Hub structured data must use the root URL.");
    } else if (!/\bsrc=["']/i.test(attributes)) {
      new vm.Script(source, { filename: "index.html:inline-script-" + (index + 1) + ".js" });
    }
  } catch (error) {
    errors.push("Hub inline script " + (index + 1) + " is invalid: " + error.message);
  }
}

if (errors.length > 0) {
  console.error("NEMURIUM product hub: FAIL");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}

console.log("NEMURIUM product hub: PASS");
console.log("- GlassGraph route: /glassgraph");
console.log("- product entries: " + productLinks.filter((href) => href === "/glassgraph").length);
