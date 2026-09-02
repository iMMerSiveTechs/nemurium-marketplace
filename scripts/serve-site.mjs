import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

// Local static dev server that mirrors the vercel.json routing so the
// public site (/, /glassgraph, /account) and the archived legacy
// marketplace preview can be browsed exactly as they deploy.
const root = resolve(import.meta.dirname, "..");
const port = Number(process.argv[2] ?? 4321);

const types = {
  ".html": "text/html; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const rewrites = new Map([
  ["/account", "/account/index.html"],
  ["/glassgraph", "/glassgraph/index.html"],
]);

async function resolvePath(pathname) {
  if (rewrites.has(pathname)) return join(root, rewrites.get(pathname));
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, "");
  let full = join(root, rel);
  try {
    const info = await stat(full);
    if (info.isDirectory()) full = join(full, "index.html");
  } catch {
    // Fall through to the read attempt, which yields a 404.
  }
  return full;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const file = await resolvePath(url.pathname);
    if (!resolve(file).startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": types[extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end("<h1>404 Not Found</h1>");
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Serving ${root} at http://localhost:${port}`);
});
