import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const REQUIRED_SCHEMA = "glassgraph_legal_release_contract_v1";
const APPROVAL_REQUIRED = "approval_required";
const RESOLVED_TRADE_NAME_STATES = new Set(["filed_verified", "not_required_verified"]);

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

function requireString(value, label) {
  if (typeof value !== "string" || value.trim() !== value || !value) {
    throw new Error(`${label} must be a non-empty trimmed string`);
  }
  return value;
}

function readContract(contractPath) {
  const absolute = resolve(contractPath);
  const raw = readFileSync(absolute, "utf8");
  let contract;
  try {
    contract = JSON.parse(raw);
  } catch {
    throw new Error("legal contract must be valid JSON");
  }
  return { absolute, contract };
}

function validateShape(contract) {
  requireExactKeys(contract, [
    "schema", "status", "releaseState", "productId", "brand", "supplier",
    "contact", "documents", "decisions", "approval",
  ], "legal contract");
  if (contract.schema !== REQUIRED_SCHEMA) throw new Error("legal contract schema drifted");
  if (contract.productId !== "glassgraph-studio") throw new Error("legal contract product drifted");
  if (contract.brand !== "NEMURIUM") throw new Error("legal contract brand drifted");
  requireExactKeys(contract.supplier, [
    "legalName", "businessStructure", "countryCode", "region", "tradeNameRegistrationStatus",
  ], "supplier");
  requireExactKeys(contract.contact, ["supportEmail"], "contact");
  requireExactKeys(contract.documents, [
    "effectiveDate", "softwareTerms", "privacyNotice", "billingPolicy",
  ], "documents");
  requireExactKeys(contract.decisions, [
    "refundPolicy", "governingLaw", "minimumUserAge", "paidSubscriberMinimumAge", "minorUsePolicy",
  ], "decisions");
  requireExactKeys(contract.approval, [
    "termsApproved", "privacyApproved", "billingApproved", "approvedBy", "approvedAt",
  ], "approval");
  if (contract.contact.supportEmail !== "immersivetechs@nemurium.com") {
    throw new Error("support contact drifted");
  }
  if (contract.supplier.legalName !== "Jethro Gordon" ||
      contract.supplier.businessStructure !== "individual_sole_proprietor" ||
      contract.supplier.countryCode !== "US" || contract.supplier.region !== "CA") {
    throw new Error("supplier identity drifted");
  }
  if (contract.decisions.minimumUserAge !== 16 ||
      contract.decisions.paidSubscriberMinimumAge !== 18 ||
      contract.decisions.minorUsePolicy !== "users_age_16_or_17_require_parent_or_legal_guardian_to_purchase_and_accept_terms") {
    throw new Error("minor use and paid-subscriber policy drifted");
  }
  if (contract.decisions.refundPolicy !== "requests_within_7_days_of_each_charge_except_fraud_or_abuse_and_subject_to_mandatory_legal_rights_and_lemon_squeezy_processing") {
    throw new Error("seven-day refund policy drifted");
  }
  for (const [name, path] of Object.entries({
    softwareTerms: contract.documents.softwareTerms,
    privacyNotice: contract.documents.privacyNotice,
    billingPolicy: contract.documents.billingPolicy,
  })) requireString(path, `documents.${name}`);
}

function readDocuments(contract, root) {
  return Object.fromEntries(Object.entries({
    softwareTerms: contract.documents.softwareTerms,
    privacyNotice: contract.documents.privacyNotice,
    billingPolicy: contract.documents.billingPolicy,
  }).map(([name, relativePath]) => {
    const absolute = resolve(root, relativePath);
    if (!existsSync(absolute)) throw new Error(`${name} document is missing`);
    return [name, { absolute, text: readFileSync(absolute, "utf8") }];
  }));
}

export function verifyGlassGraphLegalReadiness({ contractPath, pagePath, state }) {
  if (!new Set(["prerelease", "released"]).has(state)) {
    throw new Error("state must be prerelease or released");
  }
  const { absolute, contract } = readContract(contractPath);
  validateShape(contract);
  const root = dirname(dirname(absolute));
  const page = readFileSync(resolve(pagePath), "utf8");
  if (!/age 16 or older[\s\S]{0,180}parent or legal guardian[\s\S]{0,120}(?:purchase|paid terms)/i.test(page)) {
    throw new Error("page must state the 16+ use and adult paid-account boundary");
  }

  if (state === "prerelease") {
    if (contract.status !== "CANDIDATE_ONLY" || contract.releaseState !== "NO_SHIP") {
      throw new Error("prerelease legal contract must remain CANDIDATE_ONLY / NO_SHIP");
    }
    const unresolved = [
      contract.documents.effectiveDate,
      contract.approval.approvedBy,
      contract.approval.approvedAt,
    ];
    if (unresolved.some((value) => value !== APPROVAL_REQUIRED)) {
      throw new Error("prerelease legal decisions must remain explicitly approval_required");
    }
    if (contract.approval.termsApproved || contract.approval.privacyApproved || contract.approval.billingApproved) {
      throw new Error("prerelease legal documents must not claim approval");
    }
    if (contract.supplier.tradeNameRegistrationStatus !== "filing_required_before_public_paid_launch" &&
        !RESOLVED_TRADE_NAME_STATES.has(contract.supplier.tradeNameRegistrationStatus)) {
      throw new Error("trade-name registration status drifted");
    }
    for (const path of [
      contract.documents.softwareTerms,
      contract.documents.privacyNotice,
      contract.documents.billingPolicy,
    ]) {
      if (path !== APPROVAL_REQUIRED) {
        throw new Error("prerelease legal document locations must remain approval_required");
      }
    }
    if (/<a\b[^>]*href=["'][^"']*(?:terms|privacy|billing)[^"']*["']/i.test(page)) {
      throw new Error("unapproved legal drafts must not be linked as active policy pages");
    }
    if (!/terms, privacy, and billing polic(?:y|ies)[\s\S]{0,160}(?:before|until)[\s\S]{0,80}(?:checkout|subscriptions?)/i.test(page)) {
      throw new Error("prerelease page must say legal policies will be available before checkout opens");
    }
  } else {
    if (contract.status !== "APPROVED" || contract.releaseState !== "RELEASE_READY") {
      throw new Error("released legal contract must be APPROVED / RELEASE_READY");
    }
    if (JSON.stringify(contract).includes(APPROVAL_REQUIRED)) {
      throw new Error("released legal contract cannot contain approval_required");
    }
    if (!contract.approval.termsApproved || !contract.approval.privacyApproved || !contract.approval.billingApproved) {
      throw new Error("all legal documents must be explicitly approved");
    }
    if (!RESOLVED_TRADE_NAME_STATES.has(contract.supplier.tradeNameRegistrationStatus)) {
      throw new Error("released legal contract requires verified trade-name custody");
    }
    requireString(contract.supplier.legalName, "supplier.legalName");
    if (!/^[A-Z]{2}$/.test(contract.supplier.countryCode)) throw new Error("countryCode must be resolved");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(contract.documents.effectiveDate)) throw new Error("effectiveDate must be YYYY-MM-DD");
    if (!/^\d{4}-\d{2}-\d{2}T/.test(contract.approval.approvedAt)) throw new Error("approvedAt must be an ISO timestamp");
    const documents = readDocuments(contract, root);
    for (const { text } of Object.values(documents)) {
      if (/DRAFT|approval_required/i.test(text)) throw new Error("released legal documents cannot contain draft markers");
      if (!text.includes(contract.supplier.legalName) || !text.includes(contract.contact.supportEmail)) {
        throw new Error("released legal documents must identify the supplier and support contact");
      }
    }
    for (const path of [
      contract.documents.softwareTerms,
      contract.documents.privacyNotice,
      contract.documents.billingPolicy,
    ]) {
      if (!page.includes(`href="${path}"`)) throw new Error(`released page must link ${path}`);
    }

    return {
      state,
      productId: contract.productId,
      releaseState: contract.releaseState,
      legalNameResolved: true,
      documents: Object.keys(documents).length,
    };
  }

  return {
    state,
    productId: contract.productId,
    releaseState: contract.releaseState,
    legalNameResolved: contract.supplier.legalName !== APPROVAL_REQUIRED,
    documents: 3,
  };
}
