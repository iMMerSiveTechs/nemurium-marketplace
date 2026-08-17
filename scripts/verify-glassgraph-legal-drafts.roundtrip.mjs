import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyGlassGraphLegalDrafts } from "./glassgraph-legal-drafts-core.mjs";

const source = resolve(import.meta.dirname, "..");
const root = mkdtempSync(join(tmpdir(), "glassgraph-legal-drafts-roundtrip-"));

try {
  cpSync(join(source, "release"), join(root, "release"), { recursive: true });
  cpSync(join(source, "legal"), join(root, "legal"), { recursive: true });

  assert.doesNotThrow(() => verifyGlassGraphLegalDrafts({ root }));

  const billingPath = join(root, "legal", "billing.html");
  const billing = readFileSync(billingPath, "utf8");
  writeFileSync(billingPath, billing.replace('content="noindex,nofollow"', 'content="index,follow"'));
  assert.throws(() => verifyGlassGraphLegalDrafts({ root }), /noindex marker/);

  writeFileSync(billingPath, billing.replace("actual cancellation path is approval_required", "actual cancellation path is available"));
  assert.throws(() => verifyGlassGraphLegalDrafts({ root }), /unresolved cancellation path/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("PASS legal draft source stays noindex, non-effective, and approval-gated");
