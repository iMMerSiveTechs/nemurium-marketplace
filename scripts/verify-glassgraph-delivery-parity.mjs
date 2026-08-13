#!/usr/bin/env node
import {
  createHash,
  createPublicKey,
  verify as verifyEd25519,
} from "node:crypto";
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { TextDecoder } from "node:util";

const allowedOptions = new Set([
  "--page",
  "--contract",
  "--metadata",
  "--promotion-receipt",
  "--promotion-signature",
  "--acceptance-receipt",
  "--approval-receipt",
  "--dmg",
  "--updater-artifact",
  "--updater-signature",
  "--manifest",
  "--latest-manifest",
  "--hosted-metadata",
]);
const options = {};
const args = process.argv.slice(2);
while (args.length > 0) {
  const option = args.shift();
  const value = args.shift();
  if (!allowedOptions.has(option) || !value) {
    console.error(
      `GLASSGRAPH_SITE_PARITY_INVALID: invalid option ${option ?? ""}`.trim(),
    );
    process.exit(2);
  }
  options[option.slice(2)] = value;
}

if (!options.contract) {
  console.error(
    "usage: node scripts/verify-glassgraph-delivery-parity.mjs --contract <glassgraph-product.json> [--page <index.html>] [--metadata <glassgraph-release.json> --promotion-receipt <receipt.json> --promotion-signature <receipt.sig> --acceptance-receipt <acceptance.json> --approval-receipt <approval.json>] [--dmg <dmg> --updater-artifact <archive> --updater-signature <signature> --manifest <immutable-manifest> --latest-manifest <latest-alias-manifest> --hosted-metadata <metadata>]",
  );
  process.exit(2);
}

const pagePath = resolve(
  options.page ?? new URL("../index.html", import.meta.url).pathname,
);
const contractPath = resolve(options.contract);
const htmlBytes = readFileSync(pagePath);
const html = htmlBytes.toString("utf8");
const contractBytes = readFileSync(contractPath);
const contract = JSON.parse(contractBytes);
const SHA256 = /^[0-9a-f]{64}$/;
const PLACEHOLDER = /^(?:UNVERIFIED|NO_SHIP|NO_GO|approval_required)$/i;
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const sha256Bytes = (value) =>
  createHash("sha256").update(value).digest("hex");
const fail = (message) => {
  throw new Error(message);
};
const exact = (label, actual, expected) => {
  if (actual !== expected) {
    fail(`${label} mismatch: expected ${expected}, received ${actual}`);
  }
};
const requireSha256 = (label, value) => {
  if (!SHA256.test(value ?? "")) fail(`${label} must be a lowercase SHA-256 digest`);
};
const requireText = (label, value) => {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    value.length === 0 ||
    PLACEHOLDER.test(value)
  ) {
    fail(`${label} must contain verified non-placeholder evidence`);
  }
};
const requireExactIsoTimestamp = (label, value) => {
  requireText(label, value);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString() !== value) {
    fail(`${label} must be an exact ISO-8601 UTC timestamp`);
  }
};
const resolveTemplate = (template) =>
  template
    .replaceAll("{version}", contract.product.version)
    .replaceAll("{build}", String(contract.product.build))
    .replaceAll("{target}", contract.updater.target);

const decodeCanonicalBase64 = (value, label) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    fail(`${label} is not canonical base64`);
  }
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    fail(`${label} is not canonical base64`);
  }
  return decoded;
};
const decodeUtf8 = (value, label) => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value);
  } catch {
    fail(`${label} is not valid UTF-8`);
  }
};
const exactLines = (value, expected, label) => {
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== expected) fail(`${label} has an invalid Minisign envelope`);
  return lines;
};
const parseUpdaterPublicKey = (encodedPublicKey) => {
  const text = decodeUtf8(
    decodeCanonicalBase64(encodedPublicKey.trim(), "updater public key"),
    "updater public key",
  );
  const [, encodedRecord] = exactLines(text, 2, "updater public key");
  const record = decodeCanonicalBase64(encodedRecord, "Minisign public key record");
  if (record.length !== 42 || record.subarray(0, 2).toString("ascii") !== "Ed") {
    fail("updater public key record is unsupported");
  }
  return { keyId: record.subarray(2, 10), key: record.subarray(10, 42) };
};
const parseUpdaterSignature = (encodedSignature) => {
  const text = decodeUtf8(
    decodeCanonicalBase64(encodedSignature.trim(), "updater signature"),
    "updater signature",
  );
  const [, encodedRecord, trustedCommentLine, encodedGlobalSignature] =
    exactLines(text, 4, "updater signature");
  const record = decodeCanonicalBase64(
    encodedRecord,
    "Minisign signature record",
  );
  if (record.length !== 74) fail("Minisign signature record has an invalid length");
  const algorithm = record.subarray(0, 2).toString("ascii");
  if (algorithm !== "Ed" && algorithm !== "ED") {
    fail("updater signature uses an unsupported Minisign algorithm");
  }
  if (!trustedCommentLine.startsWith("trusted comment: ")) {
    fail("updater signature has an invalid trusted comment");
  }
  const globalSignature = decodeCanonicalBase64(
    encodedGlobalSignature,
    "Minisign global signature",
  );
  if (globalSignature.length !== 64) {
    fail("Minisign global signature has an invalid length");
  }
  return {
    algorithm,
    keyId: record.subarray(2, 10),
    signature: record.subarray(10, 74),
    trustedComment: trustedCommentLine.slice("trusted comment: ".length),
    globalSignature,
  };
};
const verifyUpdaterSignature = ({ artifact, encodedSignature, encodedPublicKey }) => {
  const publicKey = parseUpdaterPublicKey(encodedPublicKey);
  const signature = parseUpdaterSignature(encodedSignature);
  if (!publicKey.keyId.equals(signature.keyId)) {
    fail("updater signature key ID does not match the approved public key");
  }
  const verificationKey = createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, publicKey.key]),
    format: "der",
    type: "spki",
  });
  const payload =
    signature.algorithm === "ED"
      ? createHash("blake2b512").update(artifact).digest()
      : artifact;
  if (!verifyEd25519(null, payload, verificationKey, signature.signature)) {
    fail("updater artifact signature is invalid");
  }
  const globalPayload = Buffer.concat([
    signature.signature,
    Buffer.from(signature.trustedComment, "utf8"),
  ]);
  if (
    !verifyEd25519(
      null,
      globalPayload,
      verificationKey,
      signature.globalSignature,
    )
  ) {
    fail("updater signature trusted comment is invalid");
  }
};

const readEvidence = async (overridePath, url, label) => {
  if (overridePath) return readFileSync(resolve(overridePath));
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) {
    fail(`${label} could not be read from immutable release URL (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
};

try {
  exact("contract schema", contract.schema, "glassgraph_product_release_contract_v2");
  exact("contract release state", contract.releaseState, "NO_SHIP");
  exact("contract version mirror", contract.version, contract.product?.version);
  exact(
    "release repository",
    contract.delivery?.repository,
    "iMMerSiveTechs/glassgraph-studio-releases",
  );
  exact("release provider", contract.delivery?.provider, "github-releases");
  exact("release tag template", contract.delivery?.tagTemplate, "v{version}");
  exact("latest manifest file", contract.delivery?.latestManifestFileName, "latest.json");
  exact("release metadata file", contract.delivery?.metadataFileName, "glassgraph-release.json");

  const version = contract.product.version;
  const tag = `v${version}`;
  const base = `https://github.com/${contract.delivery.repository}/releases`;
  const immutableBase = `${base}/download/${tag}`;
  const dmgFileName = resolveTemplate(contract.delivery.dmgFileNameTemplate);
  const updaterFileName = resolveTemplate(
    contract.updater.artifactFileNameTemplate,
  );
  const expected = {
    repository: contract.delivery.repository,
    tag,
    dmgFileName,
    dmgUrl: `${immutableBase}/${dmgFileName}`,
    updaterFileName,
    updaterUrl: `${immutableBase}/${updaterFileName}`,
    updaterSignatureUrl: `${immutableBase}/${updaterFileName}.sig`,
    latestManifestUrl: `${base}/latest/download/latest.json`,
    immutableManifestUrl: `${immutableBase}/latest.json`,
    immutableMetadataUrl: `${immutableBase}/glassgraph-release.json`,
  };

  const body = html.match(/<body\b([^>]*)>/i)?.[1] ?? "";
  const state = body.match(
    /\bdata-glassgraph-release-state=["']([^"']+)["']/i,
  )?.[1];
  const pageVersion = body.match(
    /\bdata-glassgraph-version=["']([^"']+)["']/i,
  )?.[1];
  exact("page release version", pageVersion, version);
  if (!html.includes(`v${version}`)) fail(`page must visibly name v${version}`);

  const structuredDataBlocks = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  if (structuredDataBlocks.length !== 1) {
    fail("page must contain exactly one SoftwareApplication JSON-LD block");
  }
  const structuredData = JSON.parse(structuredDataBlocks[0][1]);
  exact("structured-data product", structuredData.name, contract.product.name);
  exact("structured-data version", structuredData.softwareVersion, version);

  const hrefs = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)].map(
    (match) => match[1],
  );
  const dmgLinks = hrefs.filter((href) => {
    try {
      return new URL(href, "https://www.nemurium.com/").pathname.endsWith(
        ".dmg",
      );
    } catch {
      return /\.dmg(?:[?#]|$)/i.test(href);
    }
  });

  if (state === "prerelease") {
    if (!/\bdata-glassgraph-site-visibility=["']public-information["']/i.test(html)) {
      fail("pre-release page must declare public-information visibility");
    }
    if (/\bnoindex\b/i.test(html) || !/<meta\s+name=["']robots["']\s+content=["'][^"']*index/i.test(html)) {
      fail("public product-information page must allow search indexing");
    }
    if (!/final release testing|release in progress|download (?:is )?not open yet|coming soon/i.test(html)) {
      fail("pre-release page must separate the public page from the unopened app download");
    }
    if (dmgLinks.length !== 0) fail("pre-release page must not link a DMG");
    if ("downloadUrl" in structuredData) {
      fail("pre-release structured data must not contain downloadUrl");
    }
    console.log(
      `GLASSGRAPH_SITE_PRERELEASE_PARITY_OK ${JSON.stringify({
        releaseState: contract.releaseState,
        version,
        repository: expected.repository,
        latestManifestUrl: expected.latestManifestUrl,
      })}`,
    );
    process.exit(0);
  }

  if (state !== "released") fail("page release state must be prerelease or released");
  if (contract.updater?.publicKeySha256 === "UNVERIFIED") {
    fail("updater public key is UNVERIFIED; released mode is blocked");
  }
  requireSha256(
    "contract updater public key fingerprint",
    contract.updater?.publicKeySha256,
  );
  if (/\bnoindex\b/i.test(html)) fail("released page must remove noindex");
  if (/final release testing|download coming soon/i.test(html)) {
    fail("released page must remove pre-release claims");
  }

  const metadataPath = resolve(
    options.metadata ?? new URL("../release/glassgraph-release.json", import.meta.url).pathname,
  );
  const receiptPath = resolve(
    options["promotion-receipt"] ??
      new URL(
        "../release/glassgraph-public-delivery-receipt.json",
        import.meta.url,
      ).pathname,
  );
  const promotionSignaturePath = resolve(
    options["promotion-signature"] ?? `${receiptPath}.sig`,
  );
  const acceptanceReceiptPath = resolve(
    options["acceptance-receipt"] ??
      new URL(
        "../release/glassgraph-release-acceptance-receipt.json",
        import.meta.url,
      ).pathname,
  );
  const approvalReceiptPath = resolve(
    options["approval-receipt"] ??
      new URL(
        "../release/glassgraph-site-publication-approval.json",
        import.meta.url,
      ).pathname,
  );
  const metadataBytes = readFileSync(metadataPath);
  const metadata = JSON.parse(metadataBytes);
  const receiptBytes = readFileSync(receiptPath);
  const receipt = JSON.parse(receiptBytes);
  const promotionSignature = readFileSync(promotionSignaturePath, "utf8").trim();
  const acceptanceReceiptBytes = readFileSync(acceptanceReceiptPath);
  const acceptanceReceipt = JSON.parse(acceptanceReceiptBytes);
  const approvalReceiptBytes = readFileSync(approvalReceiptPath);
  const approvalReceipt = JSON.parse(approvalReceiptBytes);
  const contractSha256 = sha256Bytes(contractBytes);
  const metadataSha256 = sha256Bytes(metadataBytes);
  exact("release metadata schema", metadata.schema, "glassgraph_public_release_metadata_v1");
  exact("release metadata source state", metadata.releaseState, "NO_SHIP");
  exact("release metadata contract hash", metadata.contract?.sha256, contractSha256);
  exact("release metadata version", metadata.product?.version, version);
  exact("release metadata build", metadata.product?.build, contract.product.build);
  exact("release metadata repository", metadata.delivery?.repository, expected.repository);
  exact("release metadata tag", metadata.delivery?.tag, expected.tag);
  exact(
    "release metadata latest manifest URL",
    metadata.delivery?.latestManifestUrl,
    expected.latestManifestUrl,
  );
  exact(
    "release metadata immutable manifest URL",
    metadata.delivery?.immutableManifestUrl,
    expected.immutableManifestUrl,
  );
  exact("release metadata DMG name", metadata.dmg?.fileName, expected.dmgFileName);
  exact("release metadata DMG URL", metadata.dmg?.url, expected.dmgUrl);
  exact(
    "release metadata updater name",
    metadata.updaterArtifact?.fileName,
    expected.updaterFileName,
  );
  exact(
    "release metadata updater URL",
    metadata.updaterArtifact?.url,
    expected.updaterUrl,
  );
  exact(
    "release metadata updater signature URL",
    metadata.updaterArtifact?.signatureUrl,
    expected.updaterSignatureUrl,
  );
  exact(
    "release metadata updater key fingerprint",
    metadata.updater?.publicKeySha256,
    contract.updater.publicKeySha256,
  );
  exact(
    "release metadata intrinsic signature verification",
    metadata.updaterArtifact?.signatureVerified,
    true,
  );
  for (const [label, value] of [
    ["release metadata DMG hash", metadata.dmg?.sha256],
    ["release metadata updater hash", metadata.updaterArtifact?.sha256],
    [
      "release metadata updater signature hash",
      metadata.updaterArtifact?.signatureSha256,
    ],
    ["release metadata manifest hash", metadata.manifest?.sha256],
  ]) {
    requireSha256(label, value);
  }

  requireText("promotion updater public key", receipt.updater?.publicKey);
  exact(
    "promotion updater public key bytes",
    sha256Bytes(receipt.updater.publicKey),
    contract.updater.publicKeySha256,
  );
  try {
    verifyUpdaterSignature({
      artifact: receiptBytes,
      encodedSignature: promotionSignature,
      encodedPublicKey: receipt.updater.publicKey,
    });
  } catch (error) {
    fail(`promotion receipt signature is invalid: ${error.message}`);
  }

  exact("promotion receipt schema", receipt.schema, "glassgraph_public_delivery_receipt_v1");
  exact("promotion receipt status", receipt.status, "PUBLIC_RELEASE_VERIFIED");
  exact("promotion decision", receipt.shipDecision, "SITE_DEPLOY_APPROVED");
  exact("promotion version", receipt.product?.version, version);
  exact("promotion build", receipt.product?.build, contract.product.build);
  exact("promotion repository", receipt.delivery?.repository, expected.repository);
  exact("promotion tag", receipt.delivery?.tag, expected.tag);
  exact("promotion site source file", receipt.siteSource?.fileName, basename(pagePath));
  exact("promotion site source hash", receipt.siteSource?.sha256, sha256Bytes(htmlBytes));
  exact(
    "promotion product contract file",
    receipt.productContract?.fileName,
    basename(contractPath),
  );
  exact("promotion product contract hash", receipt.productContract?.sha256, contractSha256);
  exact("promotion metadata file", receipt.releaseMetadata?.fileName, basename(metadataPath));
  exact("promotion metadata hash", receipt.releaseMetadata?.sha256, metadataSha256);
  exact("promotion DMG hash", receipt.artifacts?.dmgSha256, metadata.dmg.sha256);
  exact(
    "promotion updater hash",
    receipt.artifacts?.updaterSha256,
    metadata.updaterArtifact.sha256,
  );
  exact(
    "promotion updater signature hash",
    receipt.artifacts?.updaterSignatureSha256,
    metadata.updaterArtifact.signatureSha256,
  );
  exact(
    "promotion latest.json hash",
    receipt.artifacts?.manifestSha256,
    metadata.manifest.sha256,
  );
  exact(
    "promotion updater public key fingerprint",
    receipt.updater?.publicKeySha256,
    contract.updater.publicKeySha256,
  );
  exact("promotion updater signature verification", receipt.updater?.signatureVerified, true);

  exact(
    "promotion acceptance receipt file",
    receipt.acceptanceReceipt?.fileName,
    basename(acceptanceReceiptPath),
  );
  exact(
    "promotion acceptance receipt hash",
    receipt.acceptanceReceipt?.sha256,
    sha256Bytes(acceptanceReceiptBytes),
  );
  exact(
    "promotion approval receipt file",
    receipt.approvalReceipt?.fileName,
    basename(approvalReceiptPath),
  );
  exact(
    "promotion approval receipt hash",
    receipt.approvalReceipt?.sha256,
    sha256Bytes(approvalReceiptBytes),
  );

  exact(
    "acceptance receipt schema",
    acceptanceReceipt.schema,
    "glassgraph_release_acceptance_receipt_v1",
  );
  exact("acceptance receipt status", acceptanceReceipt.status, "RELEASE_ACCEPTED");
  exact("acceptance version", acceptanceReceipt.product?.version, version);
  exact("acceptance build", acceptanceReceipt.product?.build, contract.product.build);
  exact(
    "acceptance repository",
    acceptanceReceipt.delivery?.repository,
    expected.repository,
  );
  exact("acceptance tag", acceptanceReceipt.delivery?.tag, expected.tag);
  for (const [label, actual, expectedHash] of [
    ["acceptance DMG hash", acceptanceReceipt.artifacts?.dmgSha256, metadata.dmg.sha256],
    [
      "acceptance updater hash",
      acceptanceReceipt.artifacts?.updaterSha256,
      metadata.updaterArtifact.sha256,
    ],
    [
      "acceptance updater signature hash",
      acceptanceReceipt.artifacts?.updaterSignatureSha256,
      metadata.updaterArtifact.signatureSha256,
    ],
    [
      "acceptance manifest hash",
      acceptanceReceipt.artifacts?.manifestSha256,
      metadata.manifest.sha256,
    ],
    [
      "acceptance release metadata hash",
      acceptanceReceipt.artifacts?.releaseMetadataSha256,
      metadataSha256,
    ],
  ]) {
    exact(label, actual, expectedHash);
  }
  requireExactIsoTimestamp(
    "acceptance evidence capturedAt",
    acceptanceReceipt.evidence?.capturedAt,
  );
  requireText(
    "acceptance evidenceRef",
    acceptanceReceipt.evidence?.evidenceRef,
  );

  exact(
    "approval receipt schema",
    approvalReceipt.schema,
    "glassgraph_site_publication_approval_v1",
  );
  exact("approval receipt requirement", approvalReceipt.approval_required, true);
  exact("approval receipt status", approvalReceipt.status, "APPROVED");
  exact(
    "approval receipt scope",
    approvalReceipt.scope,
    "GLASSGRAPH_SITE_PUBLICATION",
  );
  exact("approval receipt version", approvalReceipt.product?.version, version);
  exact(
    "approval receipt build",
    approvalReceipt.product?.build,
    contract.product.build,
  );
  exact(
    "approval receipt repository",
    approvalReceipt.delivery?.repository,
    expected.repository,
  );
  exact("approval receipt tag", approvalReceipt.delivery?.tag, expected.tag);
  exact(
    "approval site source file",
    approvalReceipt.siteSource?.fileName,
    basename(pagePath),
  );
  exact(
    "approval site source hash",
    approvalReceipt.siteSource?.sha256,
    sha256Bytes(htmlBytes),
  );
  exact(
    "approval product contract file",
    approvalReceipt.productContract?.fileName,
    basename(contractPath),
  );
  exact(
    "approval product contract hash",
    approvalReceipt.productContract?.sha256,
    contractSha256,
  );
  exact(
    "approval metadata file",
    approvalReceipt.releaseMetadata?.fileName,
    basename(metadataPath),
  );
  exact(
    "approval metadata hash",
    approvalReceipt.releaseMetadata?.sha256,
    metadataSha256,
  );
  exact(
    "approval acceptance receipt file",
    approvalReceipt.acceptanceReceipt?.fileName,
    basename(acceptanceReceiptPath),
  );
  exact(
    "approval acceptance receipt hash",
    approvalReceipt.acceptanceReceipt?.sha256,
    sha256Bytes(acceptanceReceiptBytes),
  );
  requireText("approval receipt approvedBy", approvalReceipt.approvedBy);
  requireExactIsoTimestamp("approval receipt approvedAt", approvalReceipt.approvedAt);
  requireText("approval receipt evidenceRef", approvalReceipt.evidenceRef);
  if (
    new Date(approvalReceipt.approvedAt) <
    new Date(acceptanceReceipt.evidence.capturedAt)
  ) {
    fail("publication approval predates the exact release acceptance evidence");
  }

  exact("publication approval requirement", receipt.approval?.approval_required, true);
  exact("publication approval status", receipt.approval?.status, "APPROVED");
  exact(
    "publication approval scope",
    receipt.approval?.scope,
    "GLASSGRAPH_SITE_PUBLICATION",
  );
  requireText("approval approvedBy", receipt.approval?.approvedBy);
  requireExactIsoTimestamp("approval approvedAt", receipt.approval?.approvedAt);
  requireText("approval evidenceRef", receipt.approval?.evidenceRef);
  exact("signed approval approvedBy", receipt.approval?.approvedBy, approvalReceipt.approvedBy);
  exact("signed approval approvedAt", receipt.approval?.approvedAt, approvalReceipt.approvedAt);
  exact("signed approval evidenceRef", receipt.approval?.evidenceRef, approvalReceipt.evidenceRef);
  requireExactIsoTimestamp("promotion evidence capturedAt", receipt.evidence?.capturedAt);

  for (const [label, evidence, url, hash] of [
    ["DMG", receipt.evidence?.dmg, expected.dmgUrl, metadata.dmg.sha256],
    [
      "updater artifact",
      receipt.evidence?.updaterArtifact,
      expected.updaterUrl,
      metadata.updaterArtifact.sha256,
    ],
    [
      "updater signature",
      receipt.evidence?.updaterSignature,
      expected.updaterSignatureUrl,
      metadata.updaterArtifact.signatureSha256,
    ],
    [
      "manifest",
      receipt.evidence?.manifest,
      expected.immutableManifestUrl,
      metadata.manifest.sha256,
    ],
    [
      "latest manifest alias",
      receipt.evidence?.latestManifest,
      expected.latestManifestUrl,
      metadata.manifest.sha256,
    ],
    ["metadata", receipt.evidence?.metadata, expected.immutableMetadataUrl, metadataSha256],
  ]) {
    exact(`${label} evidence URL`, evidence?.url, url);
    exact(`${label} evidence hash`, evidence?.sha256, hash);
  }
  for (const gate of [
    "publicUploadPerformed",
    "githubImmutableReleaseVerified",
    "hostedByteParityVerified",
    "latestReleaseAliasVerified",
    "cleanMachineInstallVerified",
    "automaticUpdateVerified",
    "rollbackRecoveryVerified",
  ]) {
    if (
      receipt.proofBoundary?.[gate] !== true ||
      acceptanceReceipt.proofBoundary?.[gate] !== true
    ) {
      fail(`promotion and acceptance receipt gate ${gate} is not true`);
    }
  }

  if (dmgLinks.length === 0 || dmgLinks.some((url) => url !== expected.dmgUrl)) {
    fail(`all released-page DMG links must equal ${expected.dmgUrl}`);
  }
  exact("structured-data download URL", structuredData.downloadUrl, expected.dmgUrl);
  const pageDmgHash = body.match(
    /\bdata-glassgraph-dmg-sha256=["']([^"']+)["']/i,
  )?.[1];
  exact("page DMG hash", pageDmgHash, metadata.dmg.sha256);

  const [
    hostedDmg,
    hostedUpdater,
    hostedSignature,
    hostedManifest,
    hostedLatestManifest,
    hostedMetadata,
  ] = await Promise.all([
      readEvidence(options.dmg, expected.dmgUrl, "DMG"),
      readEvidence(
        options["updater-artifact"],
        expected.updaterUrl,
        "updater artifact",
      ),
      readEvidence(
        options["updater-signature"],
        expected.updaterSignatureUrl,
        "updater signature",
      ),
      readEvidence(options.manifest, expected.immutableManifestUrl, "manifest"),
      readEvidence(
        options["latest-manifest"],
        expected.latestManifestUrl,
        "latest manifest alias",
      ),
      readEvidence(
        options["hosted-metadata"],
        expected.immutableMetadataUrl,
        "release metadata",
      ),
    ]);

  for (const [label, bytes, expectedBytes, expectedHash] of [
    ["DMG", hostedDmg, metadata.dmg.bytes, metadata.dmg.sha256],
    [
      "updater artifact",
      hostedUpdater,
      metadata.updaterArtifact.bytes,
      metadata.updaterArtifact.sha256,
    ],
    [
      "updater signature",
      hostedSignature,
      metadata.updaterArtifact.signatureBytes,
      metadata.updaterArtifact.signatureSha256,
    ],
    ["manifest", hostedManifest, metadata.manifest.bytes, metadata.manifest.sha256],
    [
      "latest manifest alias",
      hostedLatestManifest,
      metadata.manifest.bytes,
      metadata.manifest.sha256,
    ],
  ]) {
    exact(`${label} hosted byte count`, bytes.length, expectedBytes);
    exact(`${label} hosted hash`, sha256Bytes(bytes), expectedHash);
  }
  exact("hosted metadata hash", sha256Bytes(hostedMetadata), metadataSha256);
  if (!hostedMetadata.equals(metadataBytes)) {
    fail("hosted metadata bytes do not equal the website promotion metadata");
  }
  if (!hostedLatestManifest.equals(hostedManifest)) {
    fail("latest manifest alias bytes do not equal the immutable manifest");
  }
  const hostedSignatureContent = hostedSignature.toString("utf8").trim();
  const parsedManifest = JSON.parse(hostedManifest.toString("utf8"));
  exact("hosted manifest version", parsedManifest.version, version);
  exact(
    "hosted manifest updater URL",
    parsedManifest.platforms?.[contract.updater.target]?.url,
    expected.updaterUrl,
  );
  exact(
    "hosted manifest updater signature",
    parsedManifest.platforms?.[contract.updater.target]?.signature,
    hostedSignatureContent,
  );
  verifyUpdaterSignature({
    artifact: hostedUpdater,
    encodedSignature: hostedSignatureContent,
    encodedPublicKey: receipt.updater.publicKey,
  });

  console.log(
    `GLASSGRAPH_SITE_RELEASE_PARITY_OK ${JSON.stringify({
      version,
      tag,
      dmgUrl: expected.dmgUrl,
      dmgSha256: metadata.dmg.sha256,
      latestManifestUrl: expected.latestManifestUrl,
      sourceParityVerified: true,
      hostedArtifactParityVerified: true,
      updaterSignatureVerified: true,
      latestManifestAliasVerified: true,
      hostedPageParityVerified: false,
    })}`,
  );
} catch (error) {
  console.error(`GLASSGRAPH_SITE_PARITY_BLOCKED: ${error.message}`);
  process.exit(1);
}
