import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const page = readFileSync(join(root, "glassgraph", "index.html"), "utf8");
const stage = readFileSync(join(root, "scripts", "stage-glassgraph-public-site.mjs"), "utf8");
const generator = readFileSync(join(root, "scripts", "generate-glassgraph-icon-fallbacks.sh"), "utf8");
const signupTemplate = readFileSync(join(root, "templates", "launch-signup.html"), "utf8");
const manifest = JSON.parse(readFileSync(join(root, "glassgraph", "site.webmanifest"), "utf8"));
const mailto = "mailto:immersivetechs@nemurium.com?subject=GlassGraph%20inquiry";

function navBody(className) {
  const match = page.match(new RegExp(`<nav\\b[^>]*class=["']${className}["'][^>]*>([\\s\\S]*?)<\\/nav>`, "i"));
  assert.ok(match, `${className} navigation is missing.`);
  return match[1];
}

for (const [name, nav] of [["primary", navBody("nav")], ["mobile", navBody("mobile-nav-panel")]]) {
  assert.match(nav, /<a\b[^>]*href=["']\/glassgraph#connection["'][^>]*>Local by default<\/a>/i, `${name} navigation must describe the privacy section as Local by default.`);
  assert.doesNotMatch(nav, />Privacy<\/a>/i, `${name} navigation must not label the product section as a privacy policy.`);
}

assert.doesNotMatch(page, /Ask about GlassGraph/i, "Generic contact CTAs must be replaced with an honest launch-update email action.");
const mailtoLinks = [...page.matchAll(/<a\b[^>]*href=["'](mailto:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
assert.equal(mailtoLinks.length, 3, "The page must expose the three intentional direct email actions.");
for (const [, href, label] of mailtoLinks) {
  assert.equal(href, mailto, "Every public email action must use the approved GlassGraph contact subject.");
  assert.equal(label.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim(), "Email us", "Every public email action must use plain customer-facing contact copy.");
}
assert.match(page, /Have a question about GlassGraph\? Email us\./i, "The contact section must plainly explain the email action.");
assert.match(page, /<a\b[^>]*href=["']\/glassgraph#examples["'][^>]*>See example maps<\/a>/i, "The primary action must lead to the actual example maps.");
assert.doesNotMatch(page, /glassgraph-native-real\.jpg/i, "The public page must not show the internal Agent Swarm screenshot.");
assert.doesNotMatch(stage, /glassgraph-native-real\.jpg/i, "The internal Agent Swarm screenshot must not enter the staged public bundle.");

const imageTriggers = [...page.matchAll(/<button\b[^>]*\bclass=["']product-image-trigger["'][^>]*>([\s\S]*?)<\/button>/gi)];
assert.equal(imageTriggers.length, 2, "Every public product image must open through the two intentional in-page viewer triggers.");
for (const [trigger] of imageTriggers) {
  assert.match(trigger, /\bdata-image-lightbox-src=["']\/assets\/glassgraph-studio-[^"']+\.jpg["']/i, "Product image triggers must source the in-page viewer from the approved illustrative asset.");
  assert.match(trigger, /\baria-haspopup=["']dialog["']/i, "Product image triggers must announce the modal viewer.");
  assert.match(trigger, /\baria-controls=["']image-lightbox["']/i, "Product image triggers must identify the image viewer they open.");
  assert.doesNotMatch(trigger, /\bhref=/i, "Product image triggers must not navigate to raw asset files.");
}
assert.match(page, /<dialog\b[^>]*\bid=["']image-lightbox["'][^>]*>/i, "The page must provide an in-page image viewer dialog.");
assert.match(page, /class=["']image-lightbox-close["'][^>]*aria-label=["']Close image viewer["'][^>]*>Close image<\/button>/i, "The image viewer must offer an obvious close control.");
assert.match(page, /lightbox\.showModal\(\)/, "Image triggers must open the dialog rather than navigating away.");
assert.match(page, /lightbox\.addEventListener\(["']cancel["'][\s\S]*?event\.preventDefault\(\)[\s\S]*?closeLightbox\(\)/i, "Escape must close the image viewer through the same controlled path.");
assert.match(page, /event\.target === lightbox\) closeLightbox\(\)/, "Clicking the viewer backdrop must close the image viewer.");
assert.match(page, /if \(returnFocus\) returnFocus\.focus\(\)/, "Closing the image viewer must return focus to its trigger.");

for (const pattern of [
  /<section\b[^>]*\bid=["']updates["']/i,
  /<form\b[^>]*\bid=["']launch-signup["']/i,
  /\bid=["']launch-email["']/i,
  /\bid=["']launch-website["']/i,
  /nemurium-launch-signup-/i,
  /functions\/v1\/launch-signup/i,
]) {
  assert.doesNotMatch(page, pattern, "Public HTML must not expose an inactive launch-signup form or endpoint.");
}
assert.match(signupTemplate, /SOURCE-ONLY LAUNCH-SIGNUP TEMPLATE/i, "A clearly marked source-only launch-signup template must remain available for later reviewed activation.");
assert.match(signupTemplate, /data-launch-signup-template-version=["']1["']/i, "The source-only signup template must carry an explicit template version.");
assert.match(signupTemplate, /<form\b[^>]*\bid=["']launch-signup["']/i, "The source-only signup template must preserve the launch form shell.");
assert.match(signupTemplate, /disabled/i, "The source-only signup template must stay inert until it is reviewed for activation.");
assert.doesNotMatch(signupTemplate, /(service[_-]?role|sb_secret|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)/i, "The retained signup template must not contain private credentials.");
assert.doesNotMatch(stage, /templates\//i, "The Vercel staging allowlist must keep source-only templates out of the public output.");

assert.match(page, /<link\b[^>]*rel=["']icon["'][^>]*href=["']\/assets\/favicon\.ico["'][^>]*>/i, "The page must link the standard favicon fallback.");
assert.match(page, /<link\b[^>]*rel=["']apple-touch-icon["'][^>]*href=["']\/assets\/apple-touch-icon\.png["'][^>]*sizes=["']180x180["'][^>]*>/i, "The page must link the Apple touch icon fallback.");
assert.ok(manifest.icons.some((icon) => icon.src === "/assets/apple-touch-icon.png" && icon.sizes === "180x180" && icon.type === "image/png"), "The web manifest must declare the generated Apple touch fallback.");
assert.match(stage, /"apple-touch-icon\.png"/, "Staging must include the Apple touch fallback.");
assert.match(stage, /"favicon\.ico"/, "Staging must include the favicon fallback.");
assert.match(generator, /assets\/glassgraph-mark\.svg/, "Fallback icons must be rendered from the existing GlassGraph mark.");
assert.match(generator, /assets\/apple-touch-icon\.png/, "The generator must produce the Apple touch fallback.");
assert.match(generator, /assets\/favicon\.ico/, "The generator must produce the favicon fallback.");

const appleIconPath = join(root, "assets", "apple-touch-icon.png");
const faviconPath = join(root, "assets", "favicon.ico");
assert.ok(existsSync(appleIconPath), "The Apple touch fallback asset is missing.");
assert.ok(existsSync(faviconPath), "The favicon fallback asset is missing.");
const appleIcon = readFileSync(appleIconPath);
assert.deepEqual([...appleIcon.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], "The Apple touch fallback must be a PNG.");
assert.equal(appleIcon.readUInt32BE(16), 180, "The Apple touch fallback must be 180px wide.");
assert.equal(appleIcon.readUInt32BE(20), 180, "The Apple touch fallback must be 180px high.");
const favicon = readFileSync(faviconPath);
assert.equal(favicon.readUInt16LE(0), 0, "The favicon must have an ICO reserved header.");
assert.equal(favicon.readUInt16LE(2), 1, "The fallback icon must be an ICO file.");
assert.equal(favicon.readUInt16LE(4), 1, "The favicon must contain one generated icon image.");
assert.equal(favicon[6], 64, "The favicon fallback must contain a 64px image.");

console.log("PASS prelaunch customer UX regressions");
console.log("- direct customer-inquiry email actions: 3");
console.log("- inactive signup form: absent from public HTML");
console.log("- source-only signup template: retained outside staging");
console.log("- standard icon fallbacks: staged");
