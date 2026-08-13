import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "dist-site");

if (!output.startsWith(`${root}/`)) {
  throw new Error("Refusing to stage outside the site checkout.");
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
copyFileSync(resolve(root, "index.html"), resolve(output, "index.html"));
copyFileSync(resolve(root, "robots.txt"), resolve(output, "robots.txt"));
copyFileSync(resolve(root, "sitemap.xml"), resolve(output, "sitemap.xml"));
writeFileSync(resolve(output, ".nojekyll"), "");

const staged = readdirSync(output).sort();
const expected = [".nojekyll", "index.html", "robots.txt", "sitemap.xml"];
if (JSON.stringify(staged) !== JSON.stringify(expected)) {
  throw new Error(`Unexpected staged public files: ${staged.join(", ")}`);
}

console.log(`GLASSGRAPH_PUBLIC_SITE_STAGED ${output}`);
