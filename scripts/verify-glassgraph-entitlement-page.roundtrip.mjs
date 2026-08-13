import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { verifyGlassGraphEntitlementPage } from "./verify-glassgraph-entitlement-page.mjs";

const root = mkdtempSync(join(tmpdir(), "glassgraph-entitlement-page-"));
const contract = {
  schema: "glassgraph_entitlement_release_contract_v1",
  status: "CANDIDATE_ONLY",
  releaseState: "NO_SHIP",
  productId: "glassgraph-studio",
  appId: "com.nemurium.glassgraph",
  offer: {
    trialDays: 7,
    trialPaymentMethodRequired: false,
    maximumInitialTrialAccounts: null,
    maximumDevicesPerAccount: 2,
    monthlyPriceUsd: 10,
    annualPriceUsd: null,
  },
  service: { baseUrl: "UNVERIFIED" },
  lease: {
    algorithm: "Ed25519",
    audience: "glassgraph-native",
    keyId: "UNVERIFIED",
    publicKeyBase64: "UNVERIFIED",
    publicKeySha256: "UNVERIFIED",
    privateKeyLocation: "server-only",
  },
};
const page = `<!doctype html><body data-glassgraph-commerce-state="closed">
<p>Plans to open with 7 days free and no card required.</p>
<p>Up to two Macs. $10/month.</p>
<p>Trial registration, subscriptions, and checkout remain closed.</p>
</body>`;

function run(nextPage = page, nextContract = contract) {
  const pagePath = join(root, "index.html");
  const contractPath = join(root, "contract.json");
  writeFileSync(pagePath, nextPage);
  writeFileSync(contractPath, `${JSON.stringify(nextContract)}\n`);
  return verifyGlassGraphEntitlementPage({ pagePath, contractPath });
}

try {
  assert.equal(run().commerceState, "closed");
  assert.throws(() => run(page.replace('commerce-state="closed"', 'commerce-state="open"')), /closed/);
  assert.throws(() => run(`${page}<a href="https://checkout.example.com">Subscribe</a>`), /checkout|commerce link/);
  assert.throws(() => run(page.replace("$10/month", "$12/month")), /monthly/);
  assert.throws(() => run(`${page}<p>$100/year. Yearly.</p>`), /annual/);
  assert.throws(() => run(page, { ...contract, offer: { ...contract.offer, maximumDevicesPerAccount: 3 } }), /two devices/);
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log("PASS prerelease site is byte-bound to the closed GlassGraph entitlement offer");
