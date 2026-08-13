import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createGlassGraphUpdaterTestFixture } from "./glassgraph-updater-test-fixture.mjs";

const root = resolve(import.meta.dirname, "..");
const verifier = join(root, "scripts", "verify-glassgraph-delivery-parity.mjs");
const fixtureRoot = mkdtempSync(join(tmpdir(), "glassgraph-site-parity-"));
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const writeJson = (path, value) =>
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);

const dmgBytes = Buffer.from("GlassGraph Studio DMG fixture\n", "utf8");
const updaterBytes = Buffer.from("GlassGraph Studio updater archive fixture\n", "utf8");
const updaterFixture = createGlassGraphUpdaterTestFixture(updaterBytes);
const contract = {
  schema: "glassgraph_product_release_contract_v2",
  version: "0.1.0",
  releaseState: "NO_SHIP",
  product: {
    productId: "glassgraph-studio",
    appId: "com.nemurium.glassgraph",
    name: "GlassGraph Studio",
    version: "0.1.0",
    build: 1,
  },
  delivery: {
    provider: "github-releases",
    repository: "iMMerSiveTechs/glassgraph-studio-releases",
    tagTemplate: "v{version}",
    dmgFileNameTemplate: "GlassGraph-Studio_{version}_{build}_{target}.dmg",
    latestManifestFileName: "latest.json",
    metadataFileName: "glassgraph-release.json",
  },
  updater: {
    channel: "stable",
    target: "darwin-aarch64",
    publicKeyRef: {
      kind: "environment",
      name: "GLASSGRAPH_UPDATER_PUBLIC_KEY",
    },
    publicKeySha256: updaterFixture.publicKeySha256,
    artifactFileNameTemplate:
      "GlassGraph-Studio_{version}_{build}_{target}.app.tar.gz",
  },
};

const contractPath = join(fixtureRoot, "glassgraph-product.json");
const metadataPath = join(fixtureRoot, "glassgraph-release.json");
const receiptPath = join(fixtureRoot, "promotion-receipt.json");
const promotionSignaturePath = `${receiptPath}.sig`;
const acceptanceReceiptPath = join(fixtureRoot, "release-acceptance.json");
const approvalReceiptPath = join(fixtureRoot, "site-publication-approval.json");
const releasedPagePath = join(fixtureRoot, "released.html");
const dmgFileName = "GlassGraph-Studio_0.1.0_1_darwin-aarch64.dmg";
const updaterFileName =
  "GlassGraph-Studio_0.1.0_1_darwin-aarch64.app.tar.gz";
const dmgPath = join(fixtureRoot, dmgFileName);
const updaterPath = join(fixtureRoot, updaterFileName);
const signaturePath = `${updaterPath}.sig`;
const manifestPath = join(fixtureRoot, "latest.json");
const latestManifestPath = join(fixtureRoot, "latest-alias.json");
const immutableBase =
  "https://github.com/iMMerSiveTechs/glassgraph-studio-releases/releases/download/v0.1.0";
const dmgUrl = `${immutableBase}/${dmgFileName}`;
const updaterUrl = `${immutableBase}/${updaterFileName}`;
const signatureUrl = `${updaterUrl}.sig`;
const manifestUrl = `${immutableBase}/latest.json`;
const metadataUrl = `${immutableBase}/glassgraph-release.json`;

const run = ({ page, metadata, receipt, contractOverride = contractPath }) => {
  const args = [verifier, "--contract", contractOverride, "--page", page];
  if (metadata) {
    args.push(
      "--metadata",
      metadata,
      "--promotion-receipt",
      receipt,
      "--promotion-signature",
      promotionSignaturePath,
      "--acceptance-receipt",
      acceptanceReceiptPath,
      "--approval-receipt",
      approvalReceiptPath,
      "--dmg",
      dmgPath,
      "--updater-artifact",
      updaterPath,
      "--updater-signature",
      signaturePath,
      "--manifest",
      manifestPath,
      "--latest-manifest",
      latestManifestPath,
      "--hosted-metadata",
      metadataPath,
    );
  }
  return spawnSync(process.execPath, args, { encoding: "utf8" });
};

try {
  writeJson(contractPath, contract);
  const prerelease = run({ page: join(root, "index.html") });
  assert.equal(prerelease.status, 0, prerelease.stderr || prerelease.stdout);
  assert.match(prerelease.stdout, /GLASSGRAPH_SITE_PRERELEASE_PARITY_OK/);
  console.log(
    "PASS current pre-release page matches the canonical product version and stays closed",
  );

  const prereleaseHtml = readFileSync(join(root, "index.html"), "utf8");
  const hiddenPrereleasePath = join(fixtureRoot, "hidden-prerelease.html");
  writeFileSync(
    hiddenPrereleasePath,
    prereleaseHtml.replace('content="index,follow"', 'content="noindex"'),
  );
  const hiddenPrerelease = run({ page: hiddenPrereleasePath });
  assert.notEqual(hiddenPrerelease.status, 0);
  assert.match(hiddenPrerelease.stderr, /allow search indexing/);
  console.log("PASS public product page cannot silently return to noindex");

  const privateCandidatePath = join(fixtureRoot, "private-candidate.html");
  writeFileSync(
    privateCandidatePath,
    prereleaseHtml.replace(
      'data-glassgraph-site-visibility="public-information"',
      'data-glassgraph-site-visibility="private-candidate"',
    ),
  );
  const privateCandidate = run({ page: privateCandidatePath });
  assert.notEqual(privateCandidate.status, 0);
  assert.match(privateCandidate.stderr, /public-information visibility/);
  console.log("PASS public product page must declare its public-information boundary");

  writeFileSync(dmgPath, dmgBytes);
  writeFileSync(updaterPath, updaterBytes);
  writeFileSync(signaturePath, `${updaterFixture.signature}\n`);
  const manifest = {
    version: contract.product.version,
    notes: "GlassGraph Studio 0.1.0",
    pub_date: "2026-08-09T12:00:00.000Z",
    platforms: {
      [contract.updater.target]: {
        signature: updaterFixture.signature,
        url: updaterUrl,
      },
    },
  };
  writeJson(manifestPath, manifest);
  writeFileSync(latestManifestPath, readFileSync(manifestPath));

  const contractHash = sha256(readFileSync(contractPath));
  const dmgSha256 = sha256(dmgBytes);
  const updaterSha256 = sha256(updaterBytes);
  const signatureSha256 = sha256(readFileSync(signaturePath));
  const manifestSha256 = sha256(readFileSync(manifestPath));
  const metadata = {
    schema: "glassgraph_public_release_metadata_v1",
    releaseState: "NO_SHIP",
    contract: { sha256: contractHash },
    product: { ...contract.product },
    delivery: {
      provider: "github-releases",
      repository: contract.delivery.repository,
      tag: "v0.1.0",
      releaseUrl:
        "https://github.com/iMMerSiveTechs/glassgraph-studio-releases/releases/tag/v0.1.0",
      latestManifestUrl:
        "https://github.com/iMMerSiveTechs/glassgraph-studio-releases/releases/latest/download/latest.json",
      immutableManifestUrl: manifestUrl,
    },
    updater: {
      channel: "stable",
      target: "darwin-aarch64",
      feedUrl:
        "https://github.com/iMMerSiveTechs/glassgraph-studio-releases/releases/latest/download/latest.json",
      publicKeyRef: contract.updater.publicKeyRef,
      publicKeySha256: contract.updater.publicKeySha256,
    },
    dmg: {
      fileName: dmgFileName,
      url: dmgUrl,
      bytes: dmgBytes.length,
      sha256: dmgSha256,
    },
    updaterArtifact: {
      fileName: updaterFileName,
      url: updaterUrl,
      bytes: updaterBytes.length,
      sha256: updaterSha256,
      signatureFileName: `${updaterFileName}.sig`,
      signatureUrl,
      signatureBytes: readFileSync(signaturePath).length,
      signatureSha256,
      signatureVerified: true,
    },
    manifest: {
      fileName: "latest.json",
      latestUrl:
        "https://github.com/iMMerSiveTechs/glassgraph-studio-releases/releases/latest/download/latest.json",
      immutableUrl: manifestUrl,
      bytes: readFileSync(manifestPath).length,
      sha256: manifestSha256,
    },
    proofBoundary: {
      publicUploadPerformed: false,
      hostedByteParityVerified: false,
      cleanMachineInstallVerified: false,
      automaticUpdateVerified: false,
      rollbackRecoveryVerified: false,
      websiteParityVerified: false,
    },
  };
  writeJson(metadataPath, metadata);
  const metadataSha256 = sha256(readFileSync(metadataPath));
  const releasedHtml = `<!doctype html>
<html><head><script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "GlassGraph Studio",
    softwareVersion: "0.1.0",
    downloadUrl: dmgUrl,
  })}</script></head>
<body data-glassgraph-release-state="released" data-glassgraph-version="0.1.0" data-glassgraph-dmg-sha256="${dmgSha256}">
<p>GlassGraph Studio v0.1.0</p><a href="${dmgUrl}">Download</a>
</body></html>`;
  writeFileSync(releasedPagePath, releasedHtml);

  const acceptanceReceipt = {
    schema: "glassgraph_release_acceptance_receipt_v1",
    status: "RELEASE_ACCEPTED",
    product: { version: "0.1.0", build: 1 },
    delivery: { repository: contract.delivery.repository, tag: "v0.1.0" },
    artifacts: {
      dmgSha256,
      updaterSha256,
      updaterSignatureSha256: signatureSha256,
      manifestSha256,
      releaseMetadataSha256: metadataSha256,
    },
    evidence: {
      capturedAt: "2026-08-09T12:25:00.000Z",
      evidenceRef: "glassgraph-release-acceptance-v0.1.0",
    },
    proofBoundary: {
      publicUploadPerformed: true,
      githubImmutableReleaseVerified: true,
      hostedByteParityVerified: true,
      latestReleaseAliasVerified: true,
      cleanMachineInstallVerified: true,
      automaticUpdateVerified: true,
      rollbackRecoveryVerified: true,
    },
  };
  writeJson(acceptanceReceiptPath, acceptanceReceipt);

  const approvalReceiptForPage = (page, overrides = {}) => ({
    schema: "glassgraph_site_publication_approval_v1",
    approval_required: true,
    status: "APPROVED",
    scope: "GLASSGRAPH_SITE_PUBLICATION",
    product: { version: "0.1.0", build: 1 },
    delivery: { repository: contract.delivery.repository, tag: "v0.1.0" },
    siteSource: {
      fileName: "released.html",
      sha256: sha256(Buffer.from(page)),
    },
    productContract: {
      fileName: "glassgraph-product.json",
      sha256: contractHash,
    },
    releaseMetadata: {
      fileName: "glassgraph-release.json",
      sha256: metadataSha256,
    },
    acceptanceReceipt: {
      fileName: basename(acceptanceReceiptPath),
      sha256: sha256(readFileSync(acceptanceReceiptPath)),
    },
    approvedBy: "release-owner",
    approvedAt: "2026-08-09T12:30:00.000Z",
    evidenceRef: "glassgraph-site-publication-approval-v0.1.0",
    ...overrides,
  });

  const promotionReceiptForPage = (page, overrides = {}) => ({
    schema: "glassgraph_public_delivery_receipt_v1",
    status: "PUBLIC_RELEASE_VERIFIED",
    shipDecision: "SITE_DEPLOY_APPROVED",
    product: { version: "0.1.0", build: 1 },
    delivery: { repository: contract.delivery.repository, tag: "v0.1.0" },
    siteSource: {
      fileName: "released.html",
      sha256: sha256(Buffer.from(page)),
    },
    productContract: {
      fileName: "glassgraph-product.json",
      sha256: contractHash,
    },
    releaseMetadata: {
      fileName: "glassgraph-release.json",
      sha256: metadataSha256,
    },
    artifacts: {
      dmgSha256,
      updaterSha256,
      updaterSignatureSha256: signatureSha256,
      manifestSha256,
    },
    updater: {
      publicKey: updaterFixture.publicKey,
      publicKeySha256: updaterFixture.publicKeySha256,
      signatureVerified: true,
    },
    acceptanceReceipt: {
      fileName: basename(acceptanceReceiptPath),
      sha256: sha256(readFileSync(acceptanceReceiptPath)),
    },
    approvalReceipt: {
      fileName: basename(approvalReceiptPath),
      sha256: sha256(readFileSync(approvalReceiptPath)),
    },
    approval: {
      approval_required: true,
      status: "APPROVED",
      scope: "GLASSGRAPH_SITE_PUBLICATION",
      approvedBy: "release-owner",
      approvedAt: "2026-08-09T12:30:00.000Z",
      evidenceRef: "glassgraph-site-publication-approval-v0.1.0",
    },
    evidence: {
      capturedAt: "2026-08-09T12:25:00.000Z",
      dmg: { url: dmgUrl, sha256: dmgSha256 },
      updaterArtifact: { url: updaterUrl, sha256: updaterSha256 },
      updaterSignature: { url: signatureUrl, sha256: signatureSha256 },
      manifest: { url: manifestUrl, sha256: manifestSha256 },
      latestManifest: {
        url: "https://github.com/iMMerSiveTechs/glassgraph-studio-releases/releases/latest/download/latest.json",
        sha256: manifestSha256,
      },
      metadata: { url: metadataUrl, sha256: metadataSha256 },
    },
    proofBoundary: {
      publicUploadPerformed: true,
      githubImmutableReleaseVerified: true,
      hostedByteParityVerified: true,
      latestReleaseAliasVerified: true,
      cleanMachineInstallVerified: true,
      automaticUpdateVerified: true,
      rollbackRecoveryVerified: true,
    },
    ...overrides,
  });

  const writeSignedPromotionReceipt = (page, overrides = {}, approvalOverrides = {}) => {
    writeJson(
      approvalReceiptPath,
      approvalReceiptForPage(page, approvalOverrides),
    );
    writeJson(receiptPath, promotionReceiptForPage(page, overrides));
    const signature = updaterFixture.signArtifact(
      readFileSync(receiptPath),
      `timestamp:0 file:${basename(receiptPath)}`,
    );
    writeFileSync(promotionSignaturePath, `${signature}\n`);
  };

  writeSignedPromotionReceipt(
    releasedHtml,
    {
      status: "CANDIDATE_ONLY",
      shipDecision: "NO_SHIP",
    },
  );
  const blockedCandidate = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(blockedCandidate.status, 1);
  assert.match(blockedCandidate.stderr, /promotion receipt status mismatch/);
  console.log(
    "PASS CANDIDATE_ONLY and NO_SHIP receipts cannot open the website download",
  );

  writeSignedPromotionReceipt(releasedHtml);
  const released = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(released.status, 0, released.stderr || released.stdout);
  assert.match(released.stdout, /GLASSGRAPH_SITE_RELEASE_PARITY_OK/);
  console.log(
    "PASS released page binds exact hosted DMG, updater, signature, manifest, metadata, key, and approval evidence",
  );

  const authenticatedReceipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  writeJson(receiptPath, {
    ...authenticatedReceipt,
    shipDecision: "SITE_DEPLOY_APPROVED_TAMPERED",
  });
  const tamperedPromotionReceipt = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(tamperedPromotionReceipt.status, 1);
  assert.match(tamperedPromotionReceipt.stderr, /promotion receipt signature/);
  console.log("PASS promotion receipt byte tampering fails its pinned-key signature");

  writeSignedPromotionReceipt(releasedHtml);
  const acceptedBytes = readFileSync(acceptanceReceiptPath);
  writeJson(acceptanceReceiptPath, {
    ...JSON.parse(acceptedBytes),
    status: "TAMPERED",
  });
  const tamperedAcceptance = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(tamperedAcceptance.status, 1);
  assert.match(tamperedAcceptance.stderr, /acceptance receipt hash/);
  writeFileSync(acceptanceReceiptPath, acceptedBytes);
  console.log("PASS exact release acceptance receipt bytes are signed into promotion");

  writeSignedPromotionReceipt(releasedHtml);
  const approvedBytes = readFileSync(approvalReceiptPath);
  writeJson(approvalReceiptPath, {
    ...JSON.parse(approvedBytes),
    status: "TAMPERED",
  });
  const tamperedApproval = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(tamperedApproval.status, 1);
  assert.match(tamperedApproval.stderr, /approval receipt hash/);
  writeFileSync(approvalReceiptPath, approvedBytes);
  console.log("PASS exact publication approval receipt bytes are signed into promotion");

  writeSignedPromotionReceipt(releasedHtml);
  writeJson(latestManifestPath, { ...manifest, notes: "wrong latest alias bytes" });
  const staleLatestAlias = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(staleLatestAlias.status, 1);
  assert.match(staleLatestAlias.stderr, /latest manifest alias.*(?:byte|hash|equal)/i);
  writeFileSync(latestManifestPath, readFileSync(manifestPath));
  console.log("PASS live latest updater alias must byte-match the immutable manifest");

  const queryDriftHtml = releasedHtml.replaceAll(dmgUrl, `${dmgUrl}?download=1`);
  writeFileSync(releasedPagePath, queryDriftHtml);
  writeSignedPromotionReceipt(queryDriftHtml);
  const queryDrift = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(queryDrift.status, 1);
  assert.match(queryDrift.stderr, /DMG links must equal|download URL mismatch/);

  const fragmentDriftHtml = releasedHtml.replaceAll(dmgUrl, `${dmgUrl}#download`);
  writeFileSync(releasedPagePath, fragmentDriftHtml);
  writeSignedPromotionReceipt(fragmentDriftHtml);
  const fragmentDrift = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(fragmentDrift.status, 1);
  assert.match(fragmentDrift.stderr, /DMG links must equal|download URL mismatch/);
  console.log("PASS DMG query and fragment drift fail closed");

  writeSignedPromotionReceipt(releasedHtml);
  writeFileSync(releasedPagePath, releasedHtml.replace("Download</a>", "Get GlassGraph</a>"));
  const htmlDrift = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(htmlDrift.status, 1);
  assert.match(htmlDrift.stderr, /promotion site source hash mismatch/);
  console.log("PASS promotion approval is bound to exact website HTML bytes");

  writeFileSync(releasedPagePath, releasedHtml);
  writeSignedPromotionReceipt(
    releasedHtml,
    {
      approval: {
        ...promotionReceiptForPage(releasedHtml).approval,
        approvedBy: "UNVERIFIED",
      },
    },
    { approvedBy: "UNVERIFIED" },
  );
  const unapproved = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(unapproved.status, 1);
  assert.match(unapproved.stderr, /approval (?:receipt )?approvedBy/);
  console.log("PASS absent or UNVERIFIED publication approval fails closed");

  writeFileSync(signaturePath, `${updaterFixture.signature}tampered\n`);
  writeSignedPromotionReceipt(releasedHtml);
  const tamperedSignature = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
  });
  assert.equal(tamperedSignature.status, 1);
  assert.match(
    tamperedSignature.stderr,
    /updater signature hosted (?:byte count|hash) mismatch/,
  );
  writeFileSync(signaturePath, `${updaterFixture.signature}\n`);
  console.log("PASS hosted updater signature byte drift fails closed");

  const unverifiedContractPath = join(fixtureRoot, "unverified-contract.json");
  writeJson(unverifiedContractPath, {
    ...contract,
    updater: { ...contract.updater, publicKeySha256: "UNVERIFIED" },
  });
  const unverifiedKey = run({
    page: releasedPagePath,
    metadata: metadataPath,
    receipt: receiptPath,
    contractOverride: unverifiedContractPath,
  });
  assert.equal(unverifiedKey.status, 1);
  assert.match(unverifiedKey.stderr, /updater public key is UNVERIFIED/);
  console.log("PASS UNVERIFIED updater-key custody blocks released mode");
} finally {
  rmSync(fixtureRoot, { recursive: true, force: true });
}
