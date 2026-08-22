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
const publicIllustrationImages = [
  "assets/glassgraph-studio-system-map-v0.1.jpg",
  "assets/glassgraph-studio-decision-map-v0.1.jpg",
];

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
  /NEMURIUM is (?:an|the) independent (?:product )?brand(?: behind GlassGraph Studio)?/i.test(html),
  "Combined public site must explain the NEMURIUM brand in plain English."
);
check(
  /GlassGraph(?: Studio)?[\s\S]{0,300}(?:map|visual)[\s\S]{0,300}(?:projects|systems|ideas)/i.test(html),
  "Combined public site must explain what GlassGraph helps a customer do."
);
check(
  /NEMURIUM brand[^<]{0,120}operated by Jethro Gordon/i.test(html),
  "Combined public site must state the real person operating the NEMURIUM brand."
);

const commerceLinks = [
  ...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi),
].map((match) => decodeHtml(match[1])).filter((href) =>
  /(?:lemonsqueezy|stripe|checkout|subscribe|start[-_ ]?trial|buy[-_ ]?now)/i.test(href)
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
  /<link\s+rel=["']canonical["']\s+href=["']https:\/\/www\.nemurium\.com\/["']/i.test(html),
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
check(mailtoLinks.length >= 1, "Page must expose at least one explicit email contact link.");
check(
  mailtoLinks.every((href) => href === "mailto:immersivetechs@nemurium.com?subject=GlassGraph%20inquiry"),
  "Public email actions must use the approved GlassGraph launch-updates address and subject."
);
check(
  /immersivetechs@nemurium\.com/i.test(html) && /have a question about GlassGraph\? email us/i.test(html),
  "Customer page must provide a plain launch-contact section and visible email address."
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
  [/(?:goes|go) directly to (?:the person building|the creator)/i, "internal email-routing commentary"],
  [/Email (?:the )?GlassGraph creator|Talk directly to the creator/i, "awkward creator-directed contact copy"],
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
  [/glassgraph-(?:board|motion)-real(?:-\d+)?\.jpg/i, "an internal-only Design Studio screenshot"],
  [/glassgraph-native-real\.jpg/i, "an internal Agent Swarm screenshot"],
  [/glassgraph-studio-(?:board|motion|views)-v0\.1\.jpg/i, "an AI-heavy product screenshot that contradicts the Copilot Beta coming-soon state"],
];

for (const [pattern, label] of unsupportedV01Claims) {
  check(!pattern.test(html), `Page still contains ${label}.`);
}

for (const imagePath of publicIllustrationImages) {
  check(
    html.includes(imagePath),
    `Customer page must show the approved GlassGraph illustration: ${imagePath}`,
  );
  check(
    fs.existsSync(path.resolve(rootDir, imagePath)),
    `Approved GlassGraph illustration is missing: ${imagePath}`,
  );
}
for (const imagePath of publicIllustrationImages) {
  const escapedImagePath = imagePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  check(
    new RegExp(`<button\\b[^>]*data-image-lightbox-src=["']${escapedImagePath}["'][^>]*>`, "i").test(html),
    `Product image must open through the in-page image viewer: ${imagePath}`,
  );
  check(
    !new RegExp(`<a\\b[^>]*href=["']${escapedImagePath}["'][^>]*>`, "i").test(html),
    `Product image must not navigate a visitor away to a raw image file: ${imagePath}`,
  );
}
for (const [pattern, label] of [
  [/<dialog\b[^>]*id=["']image-lightbox["'][^>]*>/i, "an accessible in-page image viewer"],
  [/aria-label=["']Close image viewer["']/i, "a visible image-viewer close control"],
  [/lightbox\.showModal\(\)/i, "image-viewer modal opening"],
  [/lightbox\.addEventListener\(["']click["'][\s\S]{0,700}event\.target\s*===\s*lightbox[\s\S]{0,160}closeLightbox\(\)/i, "image-viewer click-outside closing"],
  [/lightbox\.addEventListener\(["']close["'][\s\S]{0,400}returnFocus\.focus\(\)/i, "image-viewer focus restoration"],
]) {
  check(pattern.test(html), `Customer image viewer must provide ${label}.`);
}
check(
  /<img\b[^>]*alt=["'][^"']*Illustrative GlassGraph map[^"']*["']/i.test(html),
  "GlassGraph illustrations must include useful alternative text.",
);
for (const [pattern, label] of [
  [/<meta\b[^>]*property=["']og:image:alt["'][^>]*content=["'][^"']*Illustrative GlassGraph map[^"']*["']/i, "Open Graph illustration description"],
  [/<meta\b[^>]*property=["']og:image:width["'][^>]*content=["']1600["']/i, "Open Graph image width"],
  [/<meta\b[^>]*property=["']og:image:height["'][^>]*content=["']1000["']/i, "Open Graph image height"],
  [/<meta\b[^>]*name=["']twitter:image:alt["'][^>]*content=["'][^"']*Illustrative GlassGraph map[^"']*["']/i, "Twitter illustration description"],
]) {
  check(pattern.test(html), `Customer page must provide ${label}.`);
}

const requiredV01Truth = [
  [/<title>GlassGraph Studio for Apple Silicon Macs \| NEMURIUM<\/title>/i, "an Apple Silicon-specific page title"],
  [/GlassGraph Studio for Apple Silicon Macs/i, "an Apple Silicon-specific hero label"],
  [/See example maps/i, "an honest example-map action"],
  [/ready-made visual structure/i, "a plain-language starting structure"],
  [/(?:big picture|map)[\s\S]{0,180}(?:ordered steps|details|compare|explore)/i, "multiple ways to explore connected work"],
  [/export a portable copy/i, "portable customer-controlled export"],
  [/(?:saved|autosave)[\s\S]{0,100}locally|local autosave|designed to save[^.]{0,100}locally/i, "local saving"],
  [/Copilot Beta[\s\S]{0,120}coming soon|coming soon[\s\S]{0,120}Copilot Beta/i, "the honest Copilot Beta coming-soon state"],
  [/lightweight built-in assistant/i, "the planned lightweight built-in Copilot direction"],
  [/(?:product-use and reliability|product-use or reliability|product-use|product and reliability) data[\s\S]{0,180}(?:board content|content of your boards)/i, "the product-learning and content-privacy boundary"],
  [/7 days free[\s\S]{0,120}no card required/i, "the 7-day no-card trial plan"],
  [/\$10\/month/i, "the monthly price"],
  [/up to two Macs/i, "the two-device limit"],
  [/trial will not automatically become a paid subscription/i, "the no-automatic-charge promise"],
  [/Apple Silicon Macs first[\s\S]{0,180}Final system requirements will be confirmed at launch/i, "the honest Apple Silicon-first launch posture"],
  [/Illustrative map:[\s\S]{0,180}(?:signal|evidence|decision)/i, "a clear customer-facing illustrative-map caption"],
  [/Illustrative map:[\s\S]{0,180}(?:signal|question|evidence|decision)/i, "a clear customer-facing illustrative-map explanation"],
];

const internalProcessCopy = [
  [/standalone GlassGraph workplace is the product being prepared/i, "internal product-custody wording"],
  [/website can be public while the app download/i, "internal website-publication reasoning"],
  [/\bproduct source\b/i, "source-status language"],
  [/\brelease acceptance\b/i, "release-engineering language"],
  [/source passes (?:its|the) current product checks/i, "test-gate language"],
  [/\b(?:v0\.1 workplace|launch plan|release status)\b/i, "internal navigation labels"],
  [/\.board\.json|board schema v\d+/i, "implementation-level board file details"],
  [/(?:first|limited to)\s+50 accounts/i, "an internal trial cohort cap"],
  [/\$100\/year|\bYearly\b/i, "an annual plan that is not part of the initial offer"],
  [/\bno telemetry\b|sends no product analytics/i, "a permanent no-product-learning promise"],
  [/Copilot boundary|built-in AI execution/i, "an internal Copilot limitation explanation"],
  [/signed app installs|recovery testing|rollback proof|download closed/i, "release-engineering status details"],
  [/failed renewal|recovery period|editing pauses/i, "billing-recovery details that belong in the terms"],
  [/Your content stays yours|Content is the boundary/i, "the founder-rejected ownership-defense wording"],
  [/Connect your preferred AI|Bring the AI assistant you already use into GlassGraph through MCP/i, "an unverified present-tense AI connection claim"],
  [/Get launch updates/i, "an update-signup claim that only opens a general email contact"],
  [/See it in action/i, "a demo-like action without a demo"],
];
for (const [pattern, label] of internalProcessCopy) {
  check(!pattern.test(html), `Customer page still contains ${label}.`);
}

for (const [pattern, label] of [
  [/(?:map|see)[\s\S]{0,140}(?:projects|systems|ideas)/i, "a concrete mapping outcome"],
  [/(?:relationships|dependencies)/i, "relationships or dependencies"],
  [/(?:know|decide) what to do next|move forward|find gaps/i, "a customer decision outcome"],
]) {
  check(pattern.test(html), `Customer page must lead with ${label}.`);
}

for (const [pattern, label] of requiredV01Truth) {
  check(pattern.test(html), `Page must state current v0.1 truth: ${label}.`);
}

const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((match) => match[1]));
for (const match of html.matchAll(/\bhref=["']#([^"']+)["']/gi)) {
  check(ids.has(match[1]), `Fragment link #${match[1]} has no matching id.`);
}

check(
  /<details\b[^>]*class=["'][^"']*mobile-nav[^"']*["'][^>]*>[\s\S]*?<nav\b[^>]*aria-label=["']Mobile navigation["']/i.test(html),
  "Customer page must provide keyboard-accessible navigation when the desktop links collapse.",
);
check(
  /@media\s*\(max-width:\s*900px\)[\s\S]{0,700}\.mobile-nav\s*\{\s*display:\s*block/i.test(html),
  "Mobile navigation must become visible at the same breakpoint that hides desktop navigation.",
);
check(
  /mobileNav\.addEventListener\([\s\S]{0,260}event\.target\.closest\(["']a["']\)[\s\S]{0,180}mobileNav\.removeAttribute\(["']open["']\)/i.test(html),
  "Mobile navigation must close after a visitor chooses a same-page destination.",
);
check(
  /mobileNav\.addEventListener\(["']keydown["'][\s\S]{0,240}event\.key\s*!==?\s*["']Escape["'][\s\S]{0,120}return;[\s\S]{0,180}mobileNav\.removeAttribute\(["']open["']\)/i.test(html),
  "Mobile navigation must let a keyboard visitor dismiss it with Escape.",
);

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
      if (isPrerelease) check(!("softwareVersion" in structuredData), "Pre-release structured data must not advertise an unreleased version.");
      if (!isPrerelease) check(/^\d+\.\d+\.\d+/.test(structuredData.softwareVersion ?? ""), "Released structured data must name a semantic product version.");
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
