import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const pagePath = path.join(rootDir, "index.html");
const html = fs.readFileSync(pagePath, "utf8");
const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&");
}

check(
  /<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i.test(html),
  "Pre-release page must remain noindex."
);

check(
  /final release testing|coming soon/i.test(html),
  "Page must clearly say GlassGraph is in final release testing or coming soon."
);

const activeDmgLinks = [
  ...html.matchAll(/<a\b[^>]*href=["']([^"']+\.dmg(?:\?[^"']*)?)["'][^>]*>/gi),
].map((match) => match[1]);
check(
  activeDmgLinks.length === 0,
  `Historical DMG must not have an active download link: ${activeDmgLinks.join(", ")}`
);

const forbiddenClaims = [
  [/available now/i, '"available now"'],
  [/it(?:'|&#39;)s ready\.\s*take it\./i, '"It\'s ready. Take it."'],
  [/the build you download is the build these checks ran against/i, '"current checked build" download assertion'],
  [/published-byte checksum recorded/i, '"published checksum" assertion'],
  [/verify what you downloaded/i, 'active download verification instructions'],
  [/first public release/i, '"first public release" assertion'],
];

for (const [pattern, label] of forbiddenClaims) {
  check(!pattern.test(html), `Pre-release page still contains ${label}.`);
}

const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]));
for (const match of html.matchAll(/\bhref=["']#([^"']+)["']/gi)) {
  check(ids.has(match[1]), `Fragment link #${match[1]} has no matching id.`);
}

const localAssets = new Set();
for (const match of html.matchAll(/<(?:img|source)\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
  localAssets.add(decodeHtml(match[1]));
}
for (const match of html.matchAll(/\b(?:srcset)=["']([^"']+)["']/gi)) {
  for (const candidate of match[1].split(",")) {
    localAssets.add(decodeHtml(candidate.trim().split(/\s+/)[0]));
  }
}
for (const match of html.matchAll(/<meta\b[^>]*(?:property|name)=["'](?:og:image|twitter:image)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)) {
  localAssets.add(decodeHtml(match[1]));
}
for (const asset of localAssets) {
  if (!asset || /^(?:data:|https?:|\/\/)/i.test(asset)) continue;
  const cleanAsset = asset.split(/[?#]/, 1)[0];
  check(fs.existsSync(path.resolve(rootDir, cleanAsset)), `Referenced asset is missing: ${cleanAsset}`);
}

const scriptBlocks = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
for (const [index, block] of scriptBlocks.entries()) {
  const attributes = block[1];
  const source = block[2];
  if (/\bsrc=["']/i.test(attributes)) continue;
  if (/type=["']application\/ld\+json["']/i.test(attributes)) {
    try {
      const structuredData = JSON.parse(source);
      check(structuredData.name === "GlassGraph Studio", "Structured data must name one GlassGraph Studio product.");
      check(structuredData.softwareVersion === "0.1.0", "Structured data must keep planned first release version 0.1.0.");
      check(!("downloadUrl" in structuredData), "Structured data must not advertise a download URL before release.");
      check(
        !/first public release|signed|notarized|gatekeeper-accepted/i.test(structuredData.releaseNotes ?? ""),
        "Structured release notes must not claim the planned release is already published."
      );
    } catch (error) {
      failures.push(`Structured data script ${index + 1} is invalid JSON: ${error.message}`);
    }
    continue;
  }
  try {
    new vm.Script(source, { filename: `index.html:inline-script-${index + 1}.js` });
  } catch (error) {
    failures.push(`Inline script ${index + 1} does not parse: ${error.message}`);
  }
}

check(
  !/automatic updates?\s+(?:are|is)?\s*(?:active|available|enabled|live)/i.test(html),
  "Page must not claim automatic updates are active before updater acceptance testing."
);
check(
  !/\bthe app is free and yours to use\b/i.test(html),
  "Page must not describe the unreleased app as already available to use."
);

if (failures.length > 0) {
  console.error("GlassGraph pre-release page: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("GlassGraph pre-release page: PASS");
console.log(`- noindex retained; active DMG links: ${activeDmgLinks.length}`);
console.log(`- fragment targets valid: ${ids.size}`);
console.log(`- local assets present: ${localAssets.size}`);
console.log(`- inline scripts parse: ${scriptBlocks.length}`);
