import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const catalog = JSON.parse(readFileSync(resolve(root, "toolkit", "catalog.json"), "utf8"));
const output = resolve(root, "preview", "toolkit");

if (!output.startsWith(`${root}/`)) {
  throw new Error("Refusing to write toolkit preview outside the checkout.");
}

const kinds = [
  { id: "agent", label: "Agents", blurb: "Assistants we are building around GlassGraph — not a roster of vendor agent types." },
  { id: "skill", label: "Skills", blurb: "Work shapes other people can use. Briefs now. In-app starters when the product is open." },
  { id: "tool", label: "Tools", blurb: "Software we actually make. GlassGraph is first." },
  { id: "connector", label: "Connectors", blurb: "Ways to let another system see a board you choose. Off until you turn them on." },
];

const statusLabel = {
  "first-product": "First product",
  coming: "Coming",
  brief: "Brief",
};

const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const css = `
:root {
  color-scheme: dark;
  --bg: #080d1b;
  --bg-soft: #0e1528;
  --panel: rgba(18, 27, 49, 0.76);
  --panel-solid: #121b31;
  --line: rgba(205, 220, 255, 0.14);
  --line-strong: rgba(126, 167, 255, 0.34);
  --text: #f4f7ff;
  --muted: #aeb9d4;
  --quiet: #7f8aa6;
  --blue: #74b0ff;
  --violet: #b49aff;
  --green: #67dfb2;
  --amber: #f4c36c;
  --shadow: 0 28px 80px rgba(0, 4, 15, 0.48);
  --radius: 22px;
  --wrap: 1160px;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, sans-serif;
  --mono: ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace;
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 88px; }
body {
  margin: 0;
  min-width: 320px;
  background:
    radial-gradient(900px 600px at 92% -10%, rgba(69, 118, 255, 0.18), transparent 62%),
    radial-gradient(760px 520px at -5% 26%, rgba(148, 93, 255, 0.12), transparent 62%),
    var(--bg);
  color: var(--text);
  font-family: var(--sans);
  line-height: 1.65;
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
a:focus-visible { outline: 2px solid var(--blue); outline-offset: 4px; border-radius: 8px; }
.wrap { width: min(calc(100% - 48px), var(--wrap)); margin-inline: auto; }
.skip { position: fixed; left: 18px; top: -80px; z-index: 1000; padding: 10px 15px; border-radius: 10px; background: var(--panel-solid); }
.skip:focus { top: 18px; }
.banner {
  padding: 12px 0;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg-soft) 80%, #3a2a10);
  color: var(--amber);
  font: 600 12px/1.45 var(--mono);
}
.site-header {
  position: sticky; top: 0; z-index: 100;
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 78%, transparent);
  backdrop-filter: blur(20px) saturate(150%);
}
.header-inner { min-height: 68px; display: flex; align-items: center; gap: 26px; }
.brand { margin-right: auto; text-decoration: none; font-size: 13px; font-weight: 780; letter-spacing: 0.22em; }
.brand span { color: var(--blue); }
.nav { display: flex; flex-wrap: wrap; gap: 22px; }
.nav a { color: var(--muted); font-size: 13px; font-weight: 650; text-decoration: none; }
.nav a:hover { color: var(--text); }
.hero { padding: 88px 0 72px; }
.eyebrow, .kicker {
  display: inline-flex; align-items: center; gap: 9px;
  color: var(--muted); font: 600 11px/1.3 var(--mono);
  letter-spacing: 0.12em; text-transform: uppercase;
}
.eyebrow::before { content: ""; width: 8px; height: 8px; border-radius: 50%; background: var(--green); box-shadow: 0 0 18px rgba(103, 223, 178, 0.68); }
h1 { margin: 22px 0 0; max-width: 820px; font-size: clamp(42px, 6vw, 72px); line-height: 0.99; letter-spacing: -0.047em; }
.gradient { background: linear-gradient(100deg, var(--blue), var(--violet)); -webkit-background-clip: text; background-clip: text; color: transparent; }
.lede { max-width: 680px; margin: 24px 0 0; color: var(--muted); font-size: clamp(17px, 2vw, 20px); }
.trust-row { display: flex; flex-wrap: wrap; gap: 9px; margin-top: 28px; }
.chip { display: inline-flex; border: 1px solid var(--line); border-radius: 999px; padding: 7px 12px; background: var(--panel); color: var(--muted); font: 600 11px/1.2 var(--mono); }
section.section { padding: 78px 0; border-top: 1px solid var(--line); }
.section-head { max-width: 760px; }
h2 { margin: 14px 0 0; font-size: clamp(30px, 4vw, 48px); line-height: 1.08; letter-spacing: -0.035em; }
.section-head p { margin: 16px 0 0; color: var(--muted); font-size: 17px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px; margin-top: 32px; }
.card {
  display: flex; flex-direction: column; gap: 12px;
  padding: 24px; border: 1px solid var(--line); border-radius: var(--radius);
  background: var(--panel); text-decoration: none; min-height: 100%;
}
.card:hover { border-color: var(--line-strong); }
.card h3 { margin: 0; font-size: 22px; letter-spacing: -0.03em; }
.card p { margin: 0; color: var(--muted); font-size: 15px; flex: 1; }
.status {
  align-self: flex-start;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 5px 10px;
  color: var(--blue);
  font: 600 11px/1 var(--mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.status.coming { color: var(--amber); }
.status.brief { color: var(--green); }
.article { padding: 72px 0 96px; }
.crumb { color: var(--quiet); font-size: 13px; }
.crumb a { color: var(--blue); text-decoration: none; }
.prose { max-width: 720px; }
.prose p { color: var(--muted); font-size: 17px; }
.use {
  margin-top: 28px; padding: 22px;
  border: 1px solid var(--line-strong); border-radius: 16px; background: var(--panel);
}
.use h2 { font-size: 18px; }
footer { padding: 36px 0 52px; border-top: 1px solid var(--line); color: var(--quiet); font-size: 12px; }
footer a { color: var(--muted); }
@media (max-width: 640px) {
  .wrap { width: min(calc(100% - 32px), var(--wrap)); }
  .nav { display: none; }
  .hero, .article { padding-top: 56px; }
}
`;

const page = ({ title, description, path, body }) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description)}">
  <style>${css}</style>
</head>
<body data-nemurium-site="toolkit-preview">
  <a class="skip" href="#main">Skip to content</a>
  <div class="banner"><div class="wrap">Preview only. Not on nemurium.com. ${escape(catalog.items.length)} listings we are building — not a 130-product store.</div></div>
  <header class="site-header">
    <div class="wrap header-inner">
      <a class="brand" href="${path === "/" ? "#main" : "/"}">NEMURIUM <span>/ Toolkit</span></a>
      <nav class="nav" aria-label="Primary">
        ${kinds.map((kind) => `<a href="${path === "/" ? `#${kind.id}s` : `/#${kind.id}s`}">${escape(kind.label)}</a>`).join("")}
      </nav>
    </div>
  </header>
  <main id="main" tabindex="-1">${body}</main>
  <footer><div class="wrap">NEMURIUM toolkit preview · operated by Jethro Gordon · <a href="mailto:immersivetechs@nemurium.com">immersivetechs@nemurium.com</a></div></footer>
</body>
</html>
`;

const cards = (kind) =>
  catalog.items
    .filter((item) => item.kind === kind)
    .map(
      (item) => `<a class="card" href="/${item.kind}s/${item.id}.html">
        <span class="status ${escape(item.status)}">${escape(statusLabel[item.status] ?? item.status)}</span>
        <h3>${escape(item.name)}</h3>
        <p>${escape(item.summary)}</p>
      </a>`,
    )
    .join("\n");

const indexBody = `
  <section class="hero">
    <div class="wrap">
      <span class="eyebrow">Hosted toolkit preview</span>
      <h1>Agents, skills, tools, and connectors <span class="gradient">we are building.</span></h1>
      <p class="lede">${escape(catalog.summary)} Other people can open this catalog, read what each thing is for, and see what is actually available.</p>
      <div class="trust-row" aria-label="Honesty">
        <span class="chip">${catalog.items.length} listings</span>
        <span class="chip">no fake live badges</span>
        <span class="chip">GlassGraph first</span>
      </div>
    </div>
  </section>
  ${kinds
    .map(
      (kind) => `
  <section class="section" id="${kind.id}s">
    <div class="wrap">
      <div class="section-head">
        <span class="kicker">${escape(kind.label)}</span>
        <h2>${escape(kind.label)}</h2>
        <p>${escape(kind.blurb)}</p>
      </div>
      <div class="grid">${cards(kind.id)}</div>
    </div>
  </section>`,
    )
    .join("\n")}
`;

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
writeFileSync(
  resolve(output, "index.html"),
  page({
    title: "NEMURIUM Toolkit preview",
    description: catalog.summary,
    path: "/",
    body: indexBody,
  }),
);

for (const item of catalog.items) {
  const relative = `${item.kind}s/${item.id}.html`;
  const file = resolve(output, relative);
  mkdirSync(dirname(file), { recursive: true });
  const paragraphs = item.body.map((line) => `<p>${escape(line)}</p>`).join("\n");
  writeFileSync(
    file,
    page({
      title: `${item.name} | NEMURIUM Toolkit`,
      description: item.summary,
      path: `/${relative}`,
      body: `
  <article class="article">
    <div class="wrap prose">
      <p class="crumb"><a href="/">Toolkit</a> / ${escape(item.kind)}s</p>
      <span class="status ${escape(item.status)}">${escape(statusLabel[item.status] ?? item.status)}</span>
      <h1>${escape(item.name)}</h1>
      <p class="lede">${escape(item.summary)}</p>
      ${paragraphs}
      <div class="use">
        <h2>How someone uses this</h2>
        <p>${escape(item.use)}</p>
      </div>
    </div>
  </article>`,
    }),
  );
}

writeFileSync(
  resolve(output, "catalog.json"),
  `${JSON.stringify({ generatedFrom: "toolkit/catalog.json", releaseState: catalog.releaseState, items: catalog.items.map((item) => ({ id: item.id, kind: item.kind, status: item.status, href: `/${item.kind}s/${item.id}.html` })) }, null, 2)}\n`,
);

console.log(`NEMURIUM_TOOLKIT_PREVIEW ${output} ${catalog.items.length}`);
