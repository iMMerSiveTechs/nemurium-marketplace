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
const releaseState =
  html.match(/<body\b[^>]*data-glassgraph-release-state=["']([^"']+)["']/i)?.[1];
const commerceState =
  html.match(/<body\b[^>]*data-glassgraph-commerce-state=["']([^"']+)["']/i)?.[1];
const siteVisibility =
  html.match(/<body\b[^>]*data-glassgraph-site-visibility=["']([^"']+)["']/i)?.[1];
const isPrerelease = releaseState === "prerelease";

function check(condition, message) {
  if (!condition) failures.push(message);
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&");
}

check(["prerelease", "released"].includes(releaseState), "Page must declare a valid GlassGraph release state.");
check(["closed", "trial", "paid"].includes(commerceState), "Page must declare a valid GlassGraph commerce state.");
check(
  /<title>[^<]*NEMURIUM[^<]*GlassGraph Studio|<title>[^<]*GlassGraph Studio[^<]*NEMURIUM/i.test(html),
  "Combined public site title must name both NEMURIUM and GlassGraph Studio."
);
check(
  /\bid=["']nemurium["']/i.test(html) &&
    /NEMURIUM is (?:the )?independent product brand behind GlassGraph Studio/i.test(html),
  "Combined public site must explain the NEMURIUM brand in plain English."
);
check(
  /GlassGraph Studio is (?:NEMURIUM(?:'s|’s) )?(?:the )?first public product/i.test(html),
  "Combined public site must identify GlassGraph Studio as the first public product."
);
check(
  /NEMURIUM brand[^<]{0,120}operated by Jethro Gordon/i.test(html),
  "Combined public site must state the real person operating the NEMURIUM brand."
);

const commerceLinks = [
  ...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi),
].map((match) => decodeHtml(match[1])).filter((href) =>
  /(?:lemonsqueezy|checkout|subscribe|start[-_ ]?trial|buy[-_ ]?now)/i.test(href)
);
if (commerceState === "closed") check(
  commerceLinks.length === 0,
  `Closed commerce page must not contain checkout, subscription, or trial links: ${commerceLinks.join(", ")}`
);

if (isPrerelease) check(
  siteVisibility === "public-information",
  "Pre-release page must declare itself as public product information."
);

if (isPrerelease) check(
  /<meta\s+name=["']robots["']\s+content=["'][^"']*index[^"']*["']/i.test(html) &&
    !/<meta\s+name=["']robots["']\s+content=["'][^"']*noindex[^"']*["']/i.test(html),
  "Public product-information page must allow search indexing."
);

if (isPrerelease) check(
  /<link\s+rel=["']canonical["']\s+href=["']https:\/\/immersivetechs\.github\.io\/nemurium-marketplace\/["']/i.test(html),
  "Public product-information page must declare its canonical public URL."
);

if (isPrerelease) check(
  /final release testing|release in progress|download (?:is )?not open yet|coming soon/i.test(html),
  "Page must clearly separate the public product page from the unopened app download."
);

const activeDmgLinks = [
  ...html.matchAll(/<a\b[^>]*href=["']([^"']+\.dmg(?:\?[^"']*)?)["'][^>]*>/gi),
].map((match) => match[1]);
if (isPrerelease) check(
  activeDmgLinks.length === 0,
  `Historical DMG must not have an active download link: ${activeDmgLinks.join(", ")}`
);

const activeDeliveryLinks = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)]
  .map((match) => ({
    attributes: match[1],
    href: decodeHtml(match[1].match(/\bhref=["']([^"']+)["']/i)?.[1] ?? ""),
    label: match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
  }))
  .filter(({ attributes, href, label }) =>
    /\bdownload(?:\s|=|$)/i.test(attributes) ||
    /\.(?:dmg|pkg|zip)(?:[?#]|$)/i.test(href) ||
    /\b(?:download|install)\b/i.test(label)
  );
if (isPrerelease) check(
  activeDeliveryLinks.length === 0,
  `Pre-release page must not activate a download or installer link: ${activeDeliveryLinks.map(({ href }) => href).join(", ")}`
);

const mailtoLinks = [
  ...html.matchAll(/<a\b[^>]*href=["'](mailto:[^"']+)["'][^>]*>/gi),
].map((match) => decodeHtml(match[1]));
check(mailtoLinks.length === 1, "Page must expose exactly one explicit email contact link.");
check(
  /(?:goes|go) directly to (?:the person building|the creator of) GlassGraph Studio/i.test(html),
  "Support copy must state that email goes directly to the GlassGraph Studio creator."
);
check(
  /(?:does not|doesn['’]t) send (?:issue )?reports? or diagnostics automatically/i.test(html),
  "Support copy must state that the page does not send reports or diagnostics automatically."
);
check(
  !/"author"\s*:\s*\{\s*"@type"\s*:\s*"Organization"\s*,\s*"name"\s*:\s*"NEMURIUM"/i.test(html),
  "Pre-release structured data must not present the NEMURIUM brand as a legal organization."
);
check(
  !/©\s*2026\s+NEMURIUM/i.test(html),
  "Pre-release footer must not present the NEMURIUM brand as the legal copyright owner."
);
check(
  /NEMURIUM brand/i.test(html),
  "Pre-release footer must distinguish NEMURIUM as a brand while legal ownership is unresolved."
);
for (const [pattern, label] of [
  [/(?:NEMURIUM team|GlassGraph support|support team)/i, "an unverified support team"],
  [/(?:automatic(?:ally)? (?:issue )?report(?:ing)?|automatic(?:ally)? (?:diagnostic )?upload)/i, "automatic issue or diagnostic submission"],
  [/(?:support portal|reporting service) (?:is )?(?:live|available|active)/i, "a deployed support or reporting system"],
]) {
  check(!pattern.test(html), `Page must not imply ${label}.`);
}

const forbiddenClaims = [
  [/available now/i, '"available now"'],
  [/it(?:'|&#39;)s ready\.\s*take it\./i, '"It\'s ready. Take it."'],
  [/the build you download is the build these checks ran against/i, '"current checked build" download assertion'],
  [/published-byte checksum recorded/i, '"published checksum" assertion'],
  [/verify what you downloaded/i, 'active download verification instructions'],
  [/first public release/i, '"first public release" assertion'],
];

for (const [pattern, label] of isPrerelease ? forbiddenClaims : []) {
  check(!pattern.test(html), `Pre-release page still contains ${label}.`);
}

const unsupportedV01Claims = [
  [/(?:Lens A|Lens B|Lens C|lens-system|lens-agent|lens-build)/i, "the unsupported System/Agent/Build lens presentation"],
  [/glassgraph\/kernel@0\.1|contract\.gg\.json/i, "the unsupported contract-kernel handoff format"],
  [/(?:execution evidence|results return|returns to design|execution loop closed)/i, "the unsupported execution-evidence return loop"],
  [/(?:minimum context shared|user-previewed minimum)/i, "the unsupported minimum-context claim"],
  [/(?:receipts are plain files|receipt pins|every meaningful change|every proposal, decision, and undo|every change:\s*receipted|approval\s*(?:&amp;|&)\s*undo receipts)/i, "unsupported durable or change-by-change receipt claims"],
  [/(?:work with us\s*·\s*open now|mapping session|design-partner sprint|architecture conversion|fixed fee)/i, "an unverified paid-services availability claim"],
  [/glassgraph-(?:board|motion|native)-real(?:-\d+)?\.jpg/i, "a superseded Design Studio screenshot"],
];

for (const [pattern, label] of unsupportedV01Claims) {
  check(!pattern.test(html), `Page still contains ${label}.`);
}

const requiredV01Truth = [
  [/\bPacks\b/i, "Packs"],
  [/\bIndex\b[\s\S]{0,160}\bRunbook\b[\s\S]{0,160}\bMatrix\b[\s\S]{0,160}\bCopilot\b/i, "Index, Runbook, Matrix, and Copilot views"],
  [/\.board\.json/i, "explicit .board.json export"],
  [/(?:board schema|schema version)\s*(?:v?6|6)/i, "board schema v6"],
  [/local autosave/i, "local autosave"],
  [/explicit MCP session/i, "the explicit MCP session boundary"],
  [/full active board/i, "the full-active-board MCP sharing boundary"],
  [/no telemetry/i, "the no-telemetry boundary"],
  [/updater[\s\S]{0,160}GitHub[\s\S]{0,160}when enabled/i, "the conditional GitHub updater check"],
  [/14 days free[\s\S]{0,120}no card required/i, "the 14-day no-card trial plan"],
  [/\$10\/month[\s\S]*\$100\/year/i, "the monthly and yearly launch prices"],
  [/one trial per verified account/i, "the one-trial-per-verified-account limit"],
  [/up to two personally controlled Macs/i, "the two-device limit"],
  [/first (?:public )?trial[\s\S]{0,100}50 accounts/i, "the initial 50-account trial limit"],
  [/trial will not automatically become a paid subscription/i, "the no-automatic-charge promise"],
  [/Apple Silicon[\s\S]{0,80}(?:M1|M1 or newer)[\s\S]{0,120}macOS 11 or newer/i, "the v0.1 system requirements"],
  [/Cancel anytime[\s\S]{0,180}paid through[\s\S]{0,180}14-day[\s\S]{0,180}open, view, and export[\s\S]{0,120}editing pauses/i, "the cancellation, grace, and data-safety rules"],
];

for (const [pattern, label] of requiredV01Truth) {
  check(pattern.test(html), `Page must state current v0.1 truth: ${label}.`);
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
      check(/^\d+\.\d+\.\d+/.test(structuredData.softwareVersion ?? ""), "Structured data must name a semantic product version.");
      if (isPrerelease) check(!("downloadUrl" in structuredData), "Structured data must not advertise a download URL before release.");
      if (isPrerelease) check(
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

if (isPrerelease) check(
  !/automatic updates?\s+(?:are|is)?\s*(?:active|available|enabled|live)/i.test(html),
  "Page must not claim automatic updates are active before updater acceptance testing."
);
if (isPrerelease) check(
  !/\bthe app is free and yours to use\b/i.test(html),
  "Page must not describe the unreleased app as already available to use."
);

if (failures.length > 0) {
  console.error("GlassGraph pre-release page: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`GlassGraph ${releaseState} page structure: PASS`);
console.log(`- active DMG links: ${activeDmgLinks.length}`);
console.log(`- fragment targets valid: ${ids.size}`);
console.log(`- local assets present: ${localAssets.size}`);
console.log(`- inline scripts parse: ${scriptBlocks.length}`);
