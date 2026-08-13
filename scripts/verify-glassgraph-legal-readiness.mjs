#!/usr/bin/env node
import { resolve } from "node:path";
import { verifyGlassGraphLegalReadiness } from "./glassgraph-legal-readiness-core.mjs";

const args = process.argv.slice(2);
const stateIndex = args.indexOf("--state");
const contractIndex = args.indexOf("--contract");
const pageIndex = args.indexOf("--page");
const state = stateIndex >= 0 ? args[stateIndex + 1] : "prerelease";
const contractPath = resolve(contractIndex >= 0 ? args[contractIndex + 1] : "release/glassgraph-legal.json");
const pagePath = resolve(pageIndex >= 0 ? args[pageIndex + 1] : "index.html");

try {
  const result = verifyGlassGraphLegalReadiness({ contractPath, pagePath, state });
  console.log(`GLASSGRAPH_LEGAL_${state.toUpperCase()}_GREEN ${JSON.stringify(result)}`);
} catch (error) {
  console.error(`GLASSGRAPH_LEGAL_${state.toUpperCase()}_BLOCKED: ${error.message}`);
  process.exit(1);
}
