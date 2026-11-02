// Enregistre un SNAPSHOT QUOTIDIEN du prix "dès X€" par route dans
// data/price_history.json. Accumulé jour après jour par le cron, il alimente
// ensuite (dans build.mjs) : "prix le plus bas vu sur 30 jours", la tendance
// (en hausse / en baisse), et un badge "bon plan" — données uniques, excellentes
// pour le SEO ET le GEO (citables, datées, que les concurrents n'ont pas).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const CAT = join(ROOT, "data", "catalog.json");
const OUT = join(ROOT, "data", "price_history.json");
const MAX_DAYS = 90; // on garde ~3 mois d'historique (borne la taille du fichier)

if (!existsSync(CAT)) { console.warn("Pas de catalog.json : historique sauté."); process.exit(0); }
const catalog = JSON.parse(readFileSync(CAT, "utf8"));
const hist = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { routes: {} };
if (!hist.routes) hist.routes = {};

const today = new Date().toISOString().slice(0, 10);
const cutoff = new Date(Date.now() - MAX_DAYS * 864e5).toISOString().slice(0, 10);

let n = 0;
for (const r of catalog.routes || []) {
  if (r.priceFrom == null) continue;
  const key = `${r.origin}-${r.dest}`;
  const series = hist.routes[key] || {};
  series[today] = Math.round(r.priceFrom);             // 1 point/jour (écrase si rerun le même jour)
  for (const d of Object.keys(series)) if (d < cutoff) delete series[d]; // purge > 90 j
  hist.routes[key] = series;
  n++;
}

hist.generatedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(hist, null, 2));
console.log(`Historique prix : snapshot ${today} pour ${n} routes -> data/price_history.json`);
