import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const APPROVAL_REQUIRED = "approval_required";
const DRAFT_STATE = "DRAFT_APPROVAL_REQUIRED";
const EXPECTED_DOCUMENTS = {
  softwareTerms: {
    path: "legal/software-terms.html",
    blanks: ["approved_effective_date", "notice_address", "notice_recipient", "legal_review_approval"],
  },
  privacyNotice: {
    path: "legal/privacy.html",
    blanks: ["approved_effective_date", "notice_address", "data_operations_and_vendor_register", "retention_schedule", "privacy_request_process", "legal_review_approval"],
  },
  billingPolicy: {
    path: "legal/billing.html",
    blanks: ["approved_effective_date", "notice_address", "merchant_descriptor_and_receipt_contact", "live_cancellation_path", "refund_handling_process", "legal_review_approval"],
  },
};

function requireExactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label} fields drifted`);
  }
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error(`${label} must be valid JSON`);
  }
}

function requireMarker(text, pattern, label) {
  if (!pattern.test(text)) throw new Error(`${label} is missing`);
}

function documentPath(root, relativePath) {
  const absolute = resolve(root, relativePath);
  if (!absolute.startsWith(`${root}/`)) throw new Error(`legal draft path escapes the site root: ${relativePath}`);
  if (!existsSync(absolute)) throw new Error(`legal draft document is missing: ${relativePath}`);
  return absolute;
}

export function verifyGlassGraphLegalDrafts({ root }) {
  const legal = readJson(resolve(root, "release/glassgraph-legal.json"), "legal release contract");
  const entitlement = readJson(resolve(root, "release/glassgraph-entitlement.json"), "entitlement release contract");
  const register = readJson(resolve(root, "release/glassgraph-legal-drafts.json"), "legal draft register");

  requireExactKeys(register, [
    "schema", "status", "releaseState", "reviewState", "publication", "productId", "legalContract", "entitlementContract", "documents", "founderRequired",
  ], "legal draft register");
  if (register.schema !== "glassgraph_legal_draft_register_v1") throw new Error("legal draft register schema drifted");
  if (register.status !== "CANDIDATE_ONLY" || register.releaseState !== "NO_SHIP" || register.reviewState !== DRAFT_STATE) {
    throw new Error("legal draft register must remain CANDIDATE_ONLY / NO_SHIP / DRAFT_APPROVAL_REQUIRED");
  }
  if (register.publication !== "SOURCE_ONLY_NOT_STAGED") {
    throw new Error("legal drafts must remain source-only and not staged for delivery");
  }
  if (register.productId !== "glassgraph-studio" || register.legalContract !== "release/glassgraph-legal.json" || register.entitlementContract !== "release/glassgraph-entitlement.json") {
    throw new Error("legal draft register product-contract linkage drifted");
  }
  requireExactKeys(register.documents, Object.keys(EXPECTED_DOCUMENTS), "legal draft document register");
  for (const [name, expected] of Object.entries(EXPECTED_DOCUMENTS)) {
    const entry = register.documents[name];
    requireExactKeys(entry, ["path", "state", "requiredFounderBlanks"], `legal draft ${name}`);
    if (entry.path !== expected.path || entry.state !== DRAFT_STATE) throw new Error(`legal draft ${name} path or state drifted`);
    if (JSON.stringify(entry.requiredFounderBlanks) !== JSON.stringify(expected.blanks)) {
      throw new Error(`legal draft ${name} founder blanks drifted`);
    }
  }

  const expectedFounderRequired = [
    "approvedEffectiveDate", "noticeAddress", "noticeRecipient", "legalReviewApproval", "dataOperationsAndVendorRegister",
    "retentionSchedule", "privacyRequestProcess", "merchantDescriptorAndReceiptContact", "liveCancellationPath", "refundHandlingProcess",
  ];
  requireExactKeys(register.founderRequired, expectedFounderRequired, "legal draft founder-required register");
  for (const [key, value] of Object.entries(register.founderRequired)) {
    if (value !== APPROVAL_REQUIRED) throw new Error(`legal draft founder-required field must remain approval_required: ${key}`);
  }

  if (legal.status !== "CANDIDATE_ONLY" || legal.releaseState !== "NO_SHIP") {
    throw new Error("legal source contract must remain CANDIDATE_ONLY / NO_SHIP");
  }
  if (legal.documents?.effectiveDate !== APPROVAL_REQUIRED ||
      legal.documents?.softwareTerms !== APPROVAL_REQUIRED ||
      legal.documents?.privacyNotice !== APPROVAL_REQUIRED ||
      legal.documents?.billingPolicy !== APPROVAL_REQUIRED ||
      legal.approval?.termsApproved || legal.approval?.privacyApproved || legal.approval?.billingApproved) {
    throw new Error("drafts must not make the legal source contract effective or approved");
  }
  if (legal.contact?.supportEmail !== "immersivetechs@nemurium.com" || legal.supplier?.legalName !== "Jethro Gordon" ||
      legal.supplier?.businessStructure !== "individual_sole_proprietor" || legal.supplier?.countryCode !== "US" || legal.supplier?.region !== "CA") {
    throw new Error("legal draft source identity drifted");
  }
  if (legal.decisions?.minimumUserAge !== 16) throw new Error("existing minimum-user-age field must be preserved");

  const offer = entitlement.offer;
  if (entitlement.status !== "CANDIDATE_ONLY" || entitlement.releaseState !== "NO_SHIP" ||
      offer?.trialDays !== 7 || offer?.trialPaymentMethodRequired !== false || offer?.maximumDevicesPerAccount !== 2 ||
      offer?.monthlyPriceUsd !== 10 || offer?.annualPriceUsd !== null) {
    throw new Error("legal drafts must preserve the recorded 7-day/no-card/$10/two-device/no-annual candidate offer");
  }

  const documents = Object.fromEntries(Object.entries(EXPECTED_DOCUMENTS).map(([name, expected]) => {
    const relativePath = register.documents[name].path;
    return [name, readFileSync(documentPath(root, relativePath), "utf8")];
  }));

  for (const [name, text] of Object.entries(documents)) {
    const label = `legal draft ${name}`;
    requireMarker(text, /<meta\s+name=["']robots["']\s+content=["']noindex,nofollow["']/i, `${label} noindex marker`);
    requireMarker(text, new RegExp(`<meta\\s+name=["']glassgraph-legal-draft-state["']\\s+content=["']${DRAFT_STATE}["']`, "i"), `${label} meta state`);
    requireMarker(text, new RegExp(`<body\\b[^>]*data-glassgraph-legal-draft-state=["']${DRAFT_STATE}["']`, "i"), `${label} body state`);
    requireMarker(text, /DRAFT\s*[·&middot;]\s*NOT EFFECTIVE\s*[·&middot;]\s*APPROVAL REQUIRED/i, `${label} visible draft banner`);
    requireMarker(text, /This is a review-only working draft/i, `${label} review-only status`);
    requireMarker(text, /not an active/i, `${label} not-active status`);
    requireMarker(text, /approval_required/i, `${label} unresolved approval marker`);
    requireMarker(text, /Jethro Gordon/i, `${label} proposed supplier`);
    requireMarker(text, /immersivetechs@nemurium\.com/i, `${label} support contact`);
    requireMarker(text, /GlassGraph Studio/i, `${label} product name`);
    if (/<form\b|https:\/\/buy\.stripe\.com|https:\/\/checkout\.stripe\.com|data-glassgraph-commerce-state=["'](?:trial|paid)["']/i.test(text)) {
      throw new Error(`${label} must not contain a live commerce surface`);
    }
    if (/\bage\s+(?:16|17|18)\b/i.test(text)) {
      throw new Error(`${label} must preserve, not restate or decide, the existing age field`);
    }
  }

  requireMarker(documents.softwareTerms, /existing release contract contains a minimum-user-age field/i, "terms age-field preservation");
  requireMarker(documents.privacyNotice, /existing release contract contains a minimum-user-age field/i, "privacy age-field preservation");
  requireMarker(documents.softwareTerms, /planned seven-day, no-card trial/i, "terms planned offer");
  requireMarker(documents.billingPolicy, /planned seven-day free trial with no card required/i, "billing planned trial");
  requireMarker(documents.billingPolicy, /up to two devices/i, "billing planned device limit");
  requireMarker(documents.billingPolicy, /\$10 USD monthly/i, "billing planned monthly price");
  requireMarker(documents.billingPolicy, /no annual plan/i, "billing no-annual boundary");
  requireMarker(documents.billingPolicy, /seven days from each charge/i, "billing recorded refund-window candidate");
  requireMarker(documents.billingPolicy, /actual cancellation path is approval_required/i, "billing unresolved cancellation path");

  return {
    status: register.status,
    releaseState: register.releaseState,
    reviewState: register.reviewState,
    publication: register.publication,
    documents: Object.keys(documents).length,
    founderRequired: Object.keys(register.founderRequired).length,
  };
}
