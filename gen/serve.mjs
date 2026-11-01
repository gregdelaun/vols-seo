// Mini serveur statique d'aperçu local. node gen/serve.mjs  -> http://localhost:8099
import { createServer } from "node:http";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const SITE = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const PORT = Number(process.env.PORT || 8099);
const TYPES = { ".css": "text/css", ".xml": "application/xml", ".txt": "text/plain", ".html": "text/html",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

createServer((req, res) => {
  let u = decodeURIComponent(req.url.split("?")[0]);
  let fp = join(SITE, u);
  try { if (statSync(fp).isDirectory()) fp = join(fp, "index.html"); } catch {}
  try {
    const body = readFileSync(fp);
    const ext = fp.slice(fp.lastIndexOf("."));
    res.writeHead(200, { "content-type": (TYPES[ext] || "text/html") + "; charset=utf-8" });
    res.end(body);
  } catch { res.writeHead(404); res.end("404"); }
}).listen(PORT, () => console.log(`Aperçu : http://localhost:${PORT}`));
