#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { verifyGlassGraphLegalReadiness } from "./glassgraph-legal-readiness-core.mjs";
import { verifyGlassGraphLegalDrafts } from "./glassgraph-legal-drafts-core.mjs";

const root = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && args[0] !== "--assert-not-staged")) {
  console.error("usage: node scripts/verify-glassgraph-legal-drafts.mjs [--assert-not-staged]");
  process.exit(2);
}

try {
  verifyGlassGraphLegalReadiness({
    contractPath: resolve(root, "release/glassgraph-legal.json"),
    pagePath: resolve(root, "glassgraph", "index.html"),
    state: "prerelease",
  });
  const result = verifyGlassGraphLegalDrafts({ root });
  if (args[0] === "--assert-not-staged" && existsSync(resolve(root, "dist-site", "legal"))) {
    throw new Error("review-only legal drafts must not be staged for public delivery");
  }
  console.log(`GLASSGRAPH_LEGAL_DRAFTS_GREEN ${JSON.stringify(result)}`);
} catch (error) {
  console.error(`GLASSGRAPH_LEGAL_DRAFTS_BLOCKED: ${error.message}`);
  process.exit(1);
}
