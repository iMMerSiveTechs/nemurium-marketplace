import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyGlassGraphLegalReadiness } from "./glassgraph-legal-readiness-core.mjs";

const root = mkdtempSync(join(tmpdir(), "glassgraph-legal-roundtrip-"));
mkdirSync(join(root, "release"), { recursive: true });
const source = JSON.parse(readFileSync(new URL("../release/glassgraph-legal.json", import.meta.url), "utf8"));
const write = (path, value) => writeFileSync(join(root, path), value);
const writeContract = (value) => write("release/glassgraph-legal.json", `${JSON.stringify(value, null, 2)}\n`);
write("index.html", "<p>GlassGraph Studio is coming soon.</p>");
writeContract(source);

assert.doesNotThrow(() => verifyGlassGraphLegalReadiness({
  contractPath: join(root, "release/glassgraph-legal.json"),
  pagePath: join(root, "index.html"),
  state: "prerelease",
}));

const falselyApproved = structuredClone(source);
falselyApproved.approval.termsApproved = true;
writeContract(falselyApproved);
assert.throws(() => verifyGlassGraphLegalReadiness({
  contractPath: join(root, "release/glassgraph-legal.json"),
  pagePath: join(root, "index.html"),
  state: "prerelease",
}), /must not claim approval/);

writeContract(source);
assert.throws(() => verifyGlassGraphLegalReadiness({
  contractPath: join(root, "release/glassgraph-legal.json"),
  pagePath: join(root, "index.html"),
  state: "released",
}), /APPROVED \/ RELEASE_READY/);

const approved = structuredClone(source);
approved.status = "APPROVED";
approved.releaseState = "RELEASE_READY";
approved.supplier = {
  legalName: "Jethro Gordon",
  businessStructure: "individual_sole_proprietor",
  countryCode: "US",
  region: "CA",
  tradeNameRegistrationStatus: "filed_verified",
};
approved.documents = {
  effectiveDate: "2026-08-12",
  softwareTerms: "legal/software-terms.html",
  privacyNotice: "legal/privacy.html",
  billingPolicy: "legal/billing.html",
};
approved.decisions = {
  refundPolicy: "requests_within_7_days_of_each_charge_except_fraud_or_abuse_and_subject_to_mandatory_legal_rights_and_payment_processor_handling",
  governingLaw: "California, USA, subject to mandatory consumer law",
  minimumUserAge: 16,
  paidSubscriberMinimumAge: 18,
  minorUsePolicy: "users_age_16_or_17_require_parent_or_legal_guardian_to_purchase_and_accept_terms",
};
approved.approval = {
  termsApproved: true,
  privacyApproved: true,
  billingApproved: true,
  approvedBy: "Example Owner",
  approvedAt: "2026-08-12T20:00:00Z",
};
mkdirSync(join(root, "legal"), { recursive: true });
for (const path of ["legal/software-terms.html", "legal/privacy.html", "legal/billing.html"]) {
  write(path, "<h1>GlassGraph policy</h1><p>Jethro Gordon</p><p>immersivetechs@nemurium.com</p>");
}
write("index.html", Object.values({
  terms: approved.documents.softwareTerms,
  privacy: approved.documents.privacyNotice,
  billing: approved.documents.billingPolicy,
}).map((path) => `<a href="${path}">Policy</a>`).join("\n") + "<p>GlassGraph is for people age 16 or older. A parent or legal guardian must purchase and accept the paid terms for a user who is 16 or 17.</p>");
writeContract(approved);
assert.doesNotThrow(() => verifyGlassGraphLegalReadiness({
  contractPath: join(root, "release/glassgraph-legal.json"),
  pagePath: join(root, "index.html"),
  state: "released",
}));

write("legal/privacy.html", "<h1>Tampered policy</h1>");
assert.throws(() => verifyGlassGraphLegalReadiness({
  contractPath: join(root, "release/glassgraph-legal.json"),
  pagePath: join(root, "index.html"),
  state: "released",
}), /identify the supplier and support contact/);

write("legal/privacy.html", "<h1>GlassGraph policy</h1><p>Jethro Gordon</p><p>immersivetechs@nemurium.com</p>");
const unfiledTradeName = structuredClone(approved);
unfiledTradeName.supplier.tradeNameRegistrationStatus = "filing_required_before_public_paid_launch";
writeContract(unfiledTradeName);
assert.throws(() => verifyGlassGraphLegalReadiness({
  contractPath: join(root, "release/glassgraph-legal.json"),
  pagePath: join(root, "index.html"),
  state: "released",
}), /verified trade-name custody/);

console.log("PASS GlassGraph legal readiness stays closed while unresolved and fails released-mode drift");
