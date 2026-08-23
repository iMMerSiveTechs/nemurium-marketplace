import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const publicPages = [
  readFileSync(join(root, "index.html"), "utf8"),
  readFileSync(join(root, "glassgraph", "index.html"), "utf8"),
];
const stage = readFileSync(join(root, "scripts", "stage-glassgraph-public-site.mjs"), "utf8");
const build = readFileSync(join(root, "scripts", "build-glassgraph-public-site.mjs"), "utf8");
const workflow = readFileSync(join(root, ".github", "workflows", "deploy.yml"), "utf8");
const signupTemplatePath = join(root, "templates", "launch-signup.html");
const privacyTemplatePath = join(root, "templates", "launch-signup-privacy.html");

assert.ok(existsSync(signupTemplatePath), "The source-only launch-signup template is missing.");
assert.ok(existsSync(privacyTemplatePath), "The source-only launch-signup privacy candidate is missing.");
for (const pattern of [
  /<form\b[^>]*\bid=["']launch-signup["']/i,
  /<section\b[^>]*\bid=["']updates["']/i,
  /\bid=["']launch-email["']/i,
  /\bid=["']launch-website["']/i,
  /nemurium-launch-signup-/i,
  /functions\/v1\/launch-signup/i,
]) {
  for (const page of publicPages) {
    assert.doesNotMatch(page, pattern, "The public site must not expose an inactive launch-signup form or endpoint.");
  }
}
for (const page of publicPages) {
  assert.doesNotMatch(page, /(service[_-]?role|sb_secret|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)/i, "Private Supabase credentials must never enter the public site.");
}

const privacy = readFileSync(privacyTemplatePath, "utf8");
assert.match(privacy, /SOURCE-ONLY LAUNCH-SIGNUP PRIVACY CANDIDATE/i, "The privacy candidate must be clearly marked source-only.");
assert.match(privacy, /data-nemurium-privacy-state=["']candidate["']/i, "The privacy notice must remain candidate-only until approval.");
assert.match(privacy, /<meta\s+name=["']robots["']\s+content=["']noindex,nofollow["']/i, "The unapproved privacy candidate must not be indexed.");
assert.match(privacy, /The signup stays closed until this notice is approved and made effective\./i, "The privacy candidate must be plain about its status.");
assert.match(privacy, /The launch list is not designed to collect the content of your GlassGraph boards\./i, "The notice must protect the board-content boundary.");
assert.match(privacy, /Every launch-list email will include a way to unsubscribe\./i, "The notice must state the unsubscribe path.");

assert.doesNotMatch(stage, /privacy\.html/i, "The future launch-list privacy candidate must not be staged before activation.");
assert.doesNotMatch(stage, /templates\//i, "The source-only template must remain outside the public Vercel output.");
assert.match(build, /node scripts\/verify-glassgraph-launch-signup\.mjs/, "Vercel build must fail before staging if signup safety regresses.");
assert.match(workflow, /run: node scripts\/verify-glassgraph-launch-signup\.mjs/, "CI must run the signup safety check before staging.");

console.log("PASS launch signup is absent from the public site");
console.log("- data collection: not exposed");
console.log("- endpoint: not exposed");
console.log("- source-only signup and privacy templates: retained outside staging");
