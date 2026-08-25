import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pagePath = resolve(root, "glassgraph", "index.html");
const manifestPath = resolve(root, "glassgraph", "site.webmanifest");
const html = readFileSync(pagePath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const errors = [];

const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const decode = (value) => value.replaceAll("&amp;", "&");
const pageAssetPath = (reference) => resolve(root, reference.replace(/^\/+/, ""));

const releaseState = html.match(/<body\b[^>]*data-glassgraph-release-state=["']([^"']+)["']/i)?.[1];
const commerceState = html.match(/<body\b[^>]*data-glassgraph-commerce-state=["']([^"']+)["']/i)?.[1];
const visibilityState = html.match(/<body\b[^>]*data-glassgraph-site-visibility=["']([^"']+)["']/i)?.[1];
check(releaseState === "prerelease", "GlassGraph must stay marked prerelease until its app is actually released.");
check(commerceState === "closed", "GlassGraph commerce must stay closed until checkout and entitlement proof exists.");
check(visibilityState === "public-information", "The product page must be public information while download and commerce are closed.");

for (const [pattern, message] of [
  [/<title>GlassGraph Studio for Apple Silicon Macs \| NEMURIUM<\/title>/i, "The product title must identify GlassGraph and NEMURIUM."],
  [/<link\b[^>]*rel=["']canonical["'][^>]*href=["']https:\/\/www\.nemurium\.com\/glassgraph["']/i, "GlassGraph must have the dedicated /glassgraph canonical URL."],
  [/<meta\b[^>]*property=["']og:url["'][^>]*content=["']https:\/\/www\.nemurium\.com\/glassgraph["']/i, "Open Graph must identify the dedicated /glassgraph URL."],
  [/<link\b[^>]*rel=["']manifest["'][^>]*href=["']\/glassgraph\/site\.webmanifest["']/i, "The GlassGraph page must use its route-specific web manifest."],
  [/<meta\b[^>]*name=["']robots["'][^>]*content=["'][^"']*index[^"']*["']/i, "The public product page must remain indexable."],
  [/See the system\. Find the gap\.[\s\S]{0,160}Know what to do next\./i, "The product page must retain the customer-facing GlassGraph promise."],
  [/GlassGraph(?: Studio)?[\s\S]{0,300}(?:map|visual)[\s\S]{0,300}(?:projects|systems|ideas)/i, "The product page must explain what customers can do with GlassGraph."],
  [/Copilot Beta[\s\S]{0,140}coming soon/i, "The product page must keep Copilot Beta in its honest coming-soon state."],
  [/visual-sharing beta[\s\S]{0,120}coming soon/i, "The product page must keep visual agent sharing in its honest coming-soon state."],
  [/stays off until you turn it on/i, "The product page must explain that visual agent sharing is opt-in."],
  [/not your desktop, other windows, source files, or hidden content/i, "The product page must explain the visual-sharing privacy boundary in customer language."],
  [/Sharing stops when you switch boards, turn off agent access, or close GlassGraph/i, "The product page must explain immediate visual-sharing revocation."],
  [/Suggestions wait for review by default/i, "The product page must explain the default review path for agent changes."],
  [/board-building for the open board[\s\S]{0,120}without approving every node/i, "The product page must explain the optional low-friction board-building mode."],
  [/anything outside the board still stops for review/i, "The product page must preserve review outside the authorized board."],
  [/guided presentations are coming soon/i, "The product page must keep guided presentations in their honest coming-soon state."],
  [/privacy-respecting problem report[\s\S]{0,180}Nothing is sent automatically/i, "The product page must explain the opt-in issue-reporting boundary."],
  [/7 days free[\s\S]{0,120}no card required/i, "The product page must show the current planned seven-day no-card trial."],
  [/\$10\/month/i, "The product page must show the current planned monthly price."],
  [/up to two Macs/i, "The product page must disclose the current two-Mac trial limit."],
  [/NEMURIUM brand[^<]{0,120}operated by Jethro Gordon/i, "The product footer must distinguish the NEMURIUM brand from an unverified legal entity."],
  [/Have a question about GlassGraph\? Email us\./i, "The product page must provide a clear customer contact path."],
  [/<dialog\b[^>]*id=["']image-lightbox["'][^>]*>/i, "Product images must keep the in-page image viewer."],
  [/aria-label=["']Close image viewer["']/i, "The image viewer must offer an obvious close action."],
  [/lightbox\.showModal\(\)/i, "Product images must open in the in-page image viewer."],
]) check(pattern.test(html), message);

check(manifest.name === "GlassGraph Studio", "The route-specific manifest must name GlassGraph Studio.");
check(manifest.start_url === "/glassgraph", "The route-specific manifest must open /glassgraph.");
check(manifest.display === "browser", "The marketing page must not pose as an installable app.");

const commerceOrDeliveryLinks = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
  .map((match) => ({
    attributes: match[1],
    href: decode(match[1].match(/\bhref=["']([^"']+)["']/i)?.[1] ?? ""),
    label: match[2].replace(/<[^>]+>/g, " "),
  }))
  .filter(({ attributes, href, label }) =>
    /(?:stripe|lemonsqueezy|checkout|subscribe|start[-_ ]?trial|\.dmg(?:[?#]|$)|\bdownload\b|\binstall\b)/i.test(
      attributes + " " + href + " " + label,
    ),
  );
check(
  commerceOrDeliveryLinks.length === 0,
  "Pre-release GlassGraph must not expose active checkout or download links: " +
    commerceOrDeliveryLinks.map(({ href }) => href).join(", "),
);

for (const [pattern, label] of [
  [/\bproduct source\b/i, "source-status wording"],
  [/\brelease acceptance\b/i, "release-engineering wording"],
  [/\.board\.json|board schema v\d+/i, "implementation-level file-format wording"],
  [/(?:first|limited to)\s+50 accounts/i, "an obsolete account cap"],
  [/\$100\/year|\bYearly\b/i, "an unapproved annual offer"],
  [/every (?:suggested )?(?:board )?(?:change|edit)[^<]{0,80}(?:waits|requires)[^<]{0,40}(?:approval|review)/i, "an inaccurate claim that every board edit requires per-change approval"],
  [/Copilot boundary|built-in AI execution/i, "internal Copilot limitation wording"],
  [/signed app installs|recovery testing|rollback proof|download closed/i, "release engineering detail"],
  [/glassgraph-(?:board|motion)-real(?:-\d+)?\.jpg/i, "an internal-only Design Studio capture"],
  [/glassgraph-native-real\.jpg/i, "an internal Agent Swarm capture"],
  [/glassgraph-studio-(?:board|motion|views)-v0\.1\.jpg/i, "an AI-heavy capture that contradicts Copilot Beta coming soon"],
]) check(!pattern.test(html), "Product page must not expose " + label + ".");

const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]));
for (const match of html.matchAll(/\bhref=["'](?:\/glassgraph)?#([^"']+)["']/gi)) {
  check(ids.has(match[1]), "Product fragment target is missing: #" + match[1]);
}

const requiredImagePaths = [
  "/assets/glassgraph-studio-system-map-v0.1.jpg",
  "/assets/glassgraph-studio-decision-map-v0.1.jpg",
];
for (const imagePath of requiredImagePaths) {
  check(html.includes(imagePath), "Product page must show " + imagePath + ".");
  check(existsSync(pageAssetPath(imagePath)), "Product asset is missing: " + imagePath + ".");
  const escapedPath = imagePath.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&");
  check(
    new RegExp("data-image-lightbox-src=[\"']" + escapedPath + "[\"']", "i").test(html),
    "Product image must open through the viewer: " + imagePath,
  );
}

for (const match of html.matchAll(/<(?:img|source)\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
  const source = decode(match[1]);
  if (!/^(?:https?:|data:|\/\/)/i.test(source)) {
    check(existsSync(pageAssetPath(source)), "Product page references a missing asset: " + source);
  }
}

const mailtoLinks = [...html.matchAll(/<a\b[^>]*href=["'](mailto:[^"']+)["'][^>]*>/gi)].map((match) => decode(match[1]));
check(mailtoLinks.length >= 1, "Product page must expose a customer email link.");
check(
  mailtoLinks.every((href) => href === "mailto:immersivetechs@nemurium.com?subject=GlassGraph%20inquiry"),
  "Product email actions must preserve the GlassGraph inquiry subject.",
);

for (const [index, block] of [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()) {
  const [, attributes, source] = block;
  try {
    if (/type=["']application\/ld\+json["']/i.test(attributes)) {
      const data = JSON.parse(source);
      check(data["@type"] === "SoftwareApplication" && data.name === "GlassGraph Studio", "Structured data must describe GlassGraph Studio.");
      check(data.url === "https://www.nemurium.com/glassgraph", "Structured data must use the dedicated product URL.");
      check(!("downloadUrl" in data) && !("softwareVersion" in data), "Pre-release structured data must not advertise a download or version.");
    } else if (!/\bsrc=["']/i.test(attributes)) {
      new vm.Script(source, { filename: "glassgraph/index.html:inline-script-" + (index + 1) + ".js" });
    }
  } catch (error) {
    errors.push("Product inline script " + (index + 1) + " is invalid: " + error.message);
  }
}

if (errors.length > 0) {
  console.error("GlassGraph pre-release page: FAIL");
  for (const error of errors) console.error("- " + error);
  process.exit(1);
}

console.log("GlassGraph " + releaseState + " product page: PASS");
console.log("- canonical: https://www.nemurium.com/glassgraph");
console.log("- active checkout/download links: " + commerceOrDeliveryLinks.length);
console.log("- valid product fragments: " + ids.size);
