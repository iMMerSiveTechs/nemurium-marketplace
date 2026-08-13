#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const fail = (message) => {
  throw new Error(message);
};

export function verifyGlassGraphEntitlementPage({ pagePath, contractPath }) {
  const html = readFileSync(pagePath, "utf8");
  const contract = JSON.parse(readFileSync(contractPath, "utf8"));
  if (
    contract.schema !== "glassgraph_entitlement_release_contract_v1"
    || contract.productId !== "glassgraph-studio"
    || contract.appId !== "com.nemurium.glassgraph"
  ) fail("GlassGraph entitlement product contract mismatch");
  const offer = contract.offer ?? {};
  if (offer.trialDays !== 14 || offer.trialPaymentMethodRequired !== false) {
    fail("page contract must preserve the 14-day no-card trial");
  }
  if (offer.maximumInitialTrialAccounts !== 50) fail("page contract must preserve the first 50 accounts");
  if (offer.maximumDevicesPerAccount !== 2) fail("page contract must preserve the two devices limit");
  if (offer.monthlyPriceUsd !== 10 || !html.includes("$10/month")) fail("monthly price mismatch");
  if (offer.annualPriceUsd !== 100 || !html.includes("$100/year")) fail("annual price mismatch");
  if (!/14 days free and no card required/i.test(html)) fail("trial copy mismatch");
  if (!/limited to 50 accounts/i.test(html)) fail("trial cohort copy mismatch");
  if (!/two personally controlled Macs/i.test(html)) fail("device limit copy mismatch");

  const commerceState = /data-glassgraph-commerce-state="([^"]+)"/.exec(html)?.[1];
  if (contract.service?.baseUrl === "UNVERIFIED") {
    if (commerceState !== "closed") fail("commerce must remain closed while entitlement hosting is UNVERIFIED");
    if (/<a\b[^>]*href="[^"]*(?:checkout|buy|subscribe|lemonsqueezy)[^"]*"/i.test(html)) {
      fail("checkout or commerce link is forbidden while entitlement hosting is UNVERIFIED");
    }
  }
  return { commerceState, contractStatus: contract.status, releaseState: contract.releaseState };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyGlassGraphEntitlementPage({
      pagePath: resolve(process.argv[2] ?? "index.html"),
      contractPath: resolve(process.argv[3] ?? "release/glassgraph-entitlement.json"),
    });
    console.log(`GLASSGRAPH_ENTITLEMENT_PAGE_OK ${JSON.stringify(result)}`);
  } catch (error) {
    console.error(`GLASSGRAPH_ENTITLEMENT_PAGE_BLOCKED: ${error.message}`);
    process.exit(1);
  }
}
