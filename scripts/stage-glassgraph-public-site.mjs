import { copyFileSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist-site");
const publicAssetNames = [
  "apple-touch-icon.png",
  "favicon.ico",
  "glassgraph-mark.svg",
  "glassgraph-studio-system-map-v0.1.jpg",
  "glassgraph-studio-decision-map-v0.1.jpg",
];

if (!output.startsWith(`${root}/`)) {
  throw new Error("Refusing to stage outside the site checkout.");
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
copyFileSync(resolve(root, "index.html"), resolve(output, "index.html"));
copyFileSync(resolve(root, "site.webmanifest"), resolve(output, "site.webmanifest"));
copyFileSync(resolve(root, "robots.txt"), resolve(output, "robots.txt"));
copyFileSync(resolve(root, "sitemap.xml"), resolve(output, "sitemap.xml"));
mkdirSync(resolve(output, "assets"));
for (const assetName of publicAssetNames) {
  copyFileSync(
    resolve(root, "assets", assetName),
    resolve(output, "assets", assetName),
  );
}
const staged = readdirSync(output).sort();
const expected = ["assets", "index.html", "robots.txt", "site.webmanifest", "sitemap.xml"];
if (JSON.stringify(staged) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected staged public files: ${staged.join(", ")}`);
}
const stagedAssets = readdirSync(resolve(output, "assets")).sort();
if (JSON.stringify(stagedAssets) !== JSON.stringify(publicAssetNames.toSorted())) {
  throw new Error(`Unexpected staged public assets: ${stagedAssets.join(", ")}`);
}

console.log(`GLASSGRAPH_PUBLIC_SITE_STAGED ${output}`);
