import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const page = readFileSync(join(root, "index.html"), "utf8");
const privacy = readFileSync(join(root, "privacy.html"), "utf8");
const stage = readFileSync(join(root, "scripts", "stage-glassgraph-public-site.mjs"), "utf8");
const build = readFileSync(join(root, "scripts", "build-glassgraph-public-site.mjs"), "utf8");
const workflow = readFileSync(join(root, ".github", "workflows", "deploy.yml"), "utf8");

const bodyState = page.match(/<body\b[^>]*\bdata-launch-signup-state=["']([^"']+)["']/i)?.[1];
const configState = page.match(/<meta\s+name=["']nemurium-launch-signup-state["']\s+content=["']([^"']*)["']/i)?.[1];
const endpoint = page.match(/<meta\s+name=["']nemurium-launch-signup-endpoint["']\s+content=["']([^"']*)["']/i)?.[1];
const policyVersion = page.match(/<meta\s+name=["']nemurium-launch-signup-policy-version["']\s+content=["']([^"']*)["']/i)?.[1];

assert.equal(bodyState, undefined, "Launch-signup state must have one configuration source, not a duplicate body attribute.");
assert.equal(configState, "disabled", "The public signup configuration must start disabled.");
assert.equal(endpoint, "", "The source candidate must not embed an endpoint before its service is reviewed.");
assert.equal(policyVersion, "candidate", "The source candidate must not present an unapproved privacy notice as effective.");

assert.match(page, /<form\b[^>]*\bid=["']launch-signup["'][^>]*>/i, "Launch signup form is missing.");
assert.match(page, /<section\b[^>]*\bid=["']updates["'][^>]*\bhidden\b[^>]*>/i, "A disabled signup candidate must stay out of the public customer flow.");
assert.match(page, /<input\b[^>]*\bid=["']launch-email["'][^>]*type=["']email["'][^>]*required[^>]*disabled/i, "The disabled candidate must not accept email without a service.");
assert.match(page, /<button\b[^>]*type=["']submit["'][^>]*disabled[^>]*>Get launch news<\/button>/i, "The signup action must start disabled.");
assert.match(page, /id=["']launch-website["'][^>]*name=["']website["'][^>]*aria-hidden=["']true["']/i, "A hidden website spam trap is required before the public endpoint is enabled.");
assert.match(page, /data-nemurium-privacy-notice-state=["']candidate["'][^>]*href=["']privacy\.html["'][^>]*>Read the proposed privacy notice\.<\/a>/i, "The disabled candidate must link only to its clearly marked proposed privacy notice.");
assert.match(page, /By joining, you are asking NEMURIUM to send GlassGraph Studio launch and product-update emails\. You can unsubscribe anytime\./i, "The signup needs specific, customer-readable consent copy.");
assert.match(page, /credentials:\s*["']omit["']/i, "The browser signup request must not send cross-site cookies.");
assert.match(page, /referrerPolicy:\s*["']same-origin["']/i, "The browser signup request must minimize referrer disclosure.");
assert.match(page, /url\.protocol === ["']https:["']/i, "Only HTTPS signup endpoints may be enabled.");
assert.match(page, /url\.hostname\.endsWith\(["']\.supabase\.co["']\)/i, "Only the intended Supabase host may be configured.");
assert.match(page, /functions\\\/v1\\\/launch-signup/i, "Only the dedicated launch-signup endpoint may be configured.");
assert.match(page, /state === ["']live["'] && policyVersion !== ["']candidate["']/i, "A live signup requires both a live state and an approved policy version.");
assert.match(page, /var state = document\.querySelector\([^;]*nemurium-launch-signup-state[^;]*\)\?\.getAttribute\([^;]*content[^;]*\)/i, "The runtime must read the canonical public signup state metadata.");
assert.doesNotMatch(page, /document\.body\.getAttribute\(["']data-launch-signup-state["']\)/i, "The runtime must not read a duplicate launch-signup state.");
assert.match(page, /updates\.hidden\s*=\s*false/i, "Only a live, reviewed signup configuration may reveal the public form.");
assert.match(page, /body:\s*JSON\.stringify\(\{\s*email:\s*email\.value\.trim\(\),\s*website:\s*website\.value\s*\}\)/s, "The browser must send only the endpoint's reviewed email and website fields.");
assert.doesNotMatch(page, /source:\s*form\.dataset\.source|consent:\s*\{/i, "The browser must not invent provenance or consent timestamps that the server must establish itself.");
assert.doesNotMatch(page, /(service[_-]?role|sb_secret|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY)/i, "Private Supabase credentials must never enter the public site.");

assert.match(privacy, /data-nemurium-privacy-state=["']candidate["']/i, "The privacy notice must remain candidate-only until approval.");
assert.match(privacy, /<meta\s+name=["']robots["']\s+content=["']noindex,nofollow["']/i, "The unapproved privacy candidate must not be indexed.");
assert.match(privacy, /The signup stays closed until this notice is approved and made effective\./i, "The privacy candidate must be plain about its status.");
assert.match(privacy, /The launch list is not designed to collect the content of your GlassGraph boards\./i, "The notice must protect the board-content boundary.");
assert.match(privacy, /Every launch-list email will include a way to unsubscribe\./i, "The notice must state the unsubscribe path.");

assert.match(stage, /copyFileSync\(resolve\(root, "privacy\.html"\), resolve\(output, "privacy\.html"\)\)/, "Staging must include the linked privacy page.");
assert.match(stage, /"privacy\.html"/, "Staging inventory must include only the intended privacy page.");
assert.match(build, /node scripts\/verify-glassgraph-launch-signup\.mjs/, "Vercel build must fail before staging if signup safety regresses.");
assert.match(workflow, /run: node scripts\/verify-glassgraph-launch-signup\.mjs/, "CI must run the signup safety check before staging.");

console.log("PASS launch signup is customer-ready in form but fail-closed in source");
console.log("- data collection: disabled");
console.log("- endpoint: absent");
console.log("- privacy notice: candidate-only and noindex");
