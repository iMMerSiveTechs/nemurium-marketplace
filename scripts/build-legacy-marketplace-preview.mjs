import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const archiveRoot = resolve(root, "archive/legacy-marketplace");
const previewRoot = resolve(root, "preview/legacy-marketplace");
const originalIndex = execFileSync("git", ["show", "9e3e278:index.html"], {
  cwd: root,
  encoding: "utf8",
});

const categoryFolders = new Map([
  ["Agents", "agents"],
  ["Engineering", "skills/engineering"],
  ["Design", "skills/design"],
  ["Sales", "skills/sales"],
  ["Marketing", "skills/marketing"],
  ["Data & Analytics", "skills/data"],
  ["Customer Support", "skills/support"],
  ["Finance", "skills/finance"],
  ["Operations", "skills/operations"],
  ["Legal", "skills/legal"],
  ["Human Resources", "skills/hr"],
  ["Productivity", "skills/productivity"],
  ["Enterprise Search", "skills/search"],
  ["Slack", "skills/slack"],
  ["Apollo", "skills/apollo"],
  ["Common Room", "skills/common-room"],
]);

const nameAliases = new Map([
  ["Process Documentation", "process-doc"],
  ["KB Article", "kb-article"],
  ["SOX Testing", "sox-testing"],
  ["NDA Triage", "nda-triage"],
  ["SQL Queries", "sql-queries"],
  ["SEO Audit", "seo-audit"],
  ["UX Copy", "ux-copy"],
  ["Create Viz", "create-viz"],
  ["Claude Code Guide", "claude-code-guide"],
]);

const kebab = (value) =>
  value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const listHtmlFiles = (directory, prefix = "") => {
  const entries = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const next = join(directory, entry.name);
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) entries.push(...listHtmlFiles(next, rel));
    else if (entry.isFile() && entry.name.endsWith(".html") && entry.name !== "index.html") {
      entries.push(rel.replaceAll("\\", "/"));
    }
  }
  return entries;
};

const htmlFiles = listHtmlFiles(archiveRoot);
const filesByFolder = new Map();
for (const file of htmlFiles) {
  const folder = dirname(file).replaceAll("\\", "/");
  if (!filesByFolder.has(folder)) filesByFolder.set(folder, []);
  filesByFolder.get(folder).push(file);
}

const matchPage = (product) => {
  const folder = categoryFolders.get(product.category);
  if (!folder) return null;
  const candidates = filesByFolder.get(folder) ?? [];
  const slugs = [nameAliases.get(product.name), kebab(product.name)].filter(Boolean);
  for (const slug of slugs) {
    const hit = candidates.find((file) => file.endsWith(`/${slug}.html`) || file === `${slug}.html`);
    if (hit) return hit;
  }
  const words = kebab(product.name).split("-").filter((word) => word.length > 2);
  const loose = candidates.find((file) => {
    const base = file.split("/").pop().replace(/\.html$/, "");
    return words.every((word) => base.includes(word.slice(0, 4)));
  });
  return loose ?? null;
};

const productMatches = originalIndex.match(/\{ name: "([^"]+)",[\s\S]*?category: "([^"]+)"/g) ?? [];
const pageIndex = {};
for (const snippet of productMatches) {
  const name = snippet.match(/name: "([^"]+)"/)[1];
  const category = snippet.match(/category: "([^"]+)"/)[1];
  const href = matchPage({ name, category });
  if (href) pageIndex[name] = href;
}

const copyTree = (from, to) => {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const dest = join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, dest);
    else if (entry.name !== "index.html") {
      let html = readFileSync(source, "utf8");
      if (entry.name.endsWith(".html")) {
        const depth = relative(previewRoot, dest).split("/").length - 1;
        const home = `${"../".repeat(depth)}index.html`;
        html = html
          .replaceAll('href="/marketplace"', `href="${home}"`)
          .replaceAll('href="#marketplace"', `href="${home}"`)
          .replaceAll('href="/marketplace/', `href="${home}#`)
          .replaceAll('href="/skills/', `href="${home}#`)
          .replaceAll('href="/"', `href="${home}"`)
          .replaceAll('<a href="#" class="nav-back">', `<a href="${home}" class="nav-back">`);
        if (!/<meta\b[^>]*name=["']robots["']/i.test(html)) {
          html = html.replace("<head>", '<head>\n    <meta name="robots" content="noindex,nofollow">');
        }
      }
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, html);
    }
  }
};

copyTree(archiveRoot, previewRoot);

const banner = `
<style>
  .legacy-preview-banner {
    position: sticky;
    top: 0;
    z-index: 200;
    padding: 12px 20px;
    background: #111827;
    color: #f9fafb;
    font: 600 13px/1.4 Inter, -apple-system, BlinkMacSystemFont, sans-serif;
    text-align: center;
  }
  .legacy-preview-banner strong { color: #fbbf24; }
  .product-card[data-missing="true"] { opacity: 0.72; }
  .product-card[data-missing="true"] .card-arrow { display: none; }
</style>
<div class="legacy-preview-banner">
  <strong>Archived preview</strong> — this is the old NEMURIUM AI Toolkit Marketplace catalog.
  Cards with pages open. Cards without a page were listed on the homepage only.
</div>
`;

const pageIndexScript = `
const pageIndex = ${JSON.stringify(pageIndex, null, 2)};
products.forEach(function (product) {
  if (pageIndex[product.name]) product.href = pageIndex[product.name];
});
`;

const updatedIndex = originalIndex
  .replace("<title>", '<meta name="robots" content="noindex,nofollow">\n<title>')
  .replace('<body>', `<body>\n${banner}`)
  .replace(
    '            <div class="product-card" style="--accent:${p.color}" onclick="openProduct(\'${p.name.replace(/\'/g, "\\\\\'")}\')">',
    '            <div class="product-card" style="--accent:${p.color}" data-missing="${p.href ? \'false\' : \'true\'}" onclick="openProduct(\'${p.name.replace(/\'/g, "\\\\\'")}\')">',
  )
  .replace(
    "function openProduct(name) {\n  // Placeholder — individual pages will link here\n  console.log('Open product:', name);\n}",
    `function openProduct(name) {
  var product = products.find(function (item) { return item.name === name; });
  if (product && product.href) {
    window.location.href = product.href;
    return;
  }
  window.alert(name + " was listed in the catalog, but this item never received its own page.");
}`,
  )
  .replace("// ========== INIT ==========", `${pageIndexScript}\n// ========== INIT ==========`);

writeFileSync(join(previewRoot, "index.html"), updatedIndex);

const mappingPath = join(previewRoot, "page-index.json");
writeFileSync(mappingPath, JSON.stringify({
  generatedFromCommit: "9e3e278",
  pageCount: Object.keys(pageIndex).length,
  pages: pageIndex,
}, null, 2) + "\n");

if (!existsSync(join(previewRoot, "index.html"))) {
  throw new Error("Legacy marketplace preview index was not written.");
}

console.log(`LEGACY_MARKETPLACE_PREVIEW_READY ${previewRoot}`);
console.log(`linked_pages=${Object.keys(pageIndex).length}`);
console.log(`archived_html=${htmlFiles.length}`);
