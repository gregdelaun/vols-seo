// Construit le catalogue de routes (toutes les lignes Ryanair des aéroports d'origine)
// + le prix "dès X€" réel par route. Écrit data/catalog.json.
// Tolérant aux erreurs : une route qui échoue garde son dernier prix connu (cache).
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AIRPORTS, ORIGIN_CODES } from "./airports.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const OUT = join(ROOT, "data", "catalog.json");
const UA = { "User-Agent": "Mozilla/5.0", Accept: "application/json" };

const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : { routes: [] };
const prevPrice = new Map(prev.routes.map((r) => [`${r.origin}-${r.dest}`, r]));

async function getJSON(url, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const res = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!res.ok) throw new Error("HTTP " + res.status);
    return await res.json();
  } finally { clearTimeout(t); }
}

// Pool de concurrence simple.
async function pool(items, size, fn) {
  const out = []; let i = 0;
  const workers = Array.from({ length: size }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx], idx); }
  });
  await Promise.all(workers);
  return out;
}

const monthStart = (offset) => {
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + offset);
  return d.toISOString().slice(0, 10);
};

// Prix par jour (aller simple) d'une direction, sur les 3 prochains mois -> { "YYYY-MM-DD": prix }
async function pricesByDay(from, to) {
  const map = {};
  for (const off of [0, 1, 2]) {
    try {
      const j = await getJSON(
        `https://services-api.ryanair.com/farfnd/v4/oneWayFares/${from}/${to}/cheapestPerDay` +
        `?outboundMonthOfDate=${monthStart(off)}&currency=EUR`);
      for (const f of j?.outbound?.fares || []) {
        if (f.unavailable || f.soldOut || !f.price) continue;
        if (map[f.day] == null || f.price.value < map[f.day]) map[f.day] = f.price.value;
      }
    } catch { /* mois ignoré */ }
  }
  return map;
}
const addDaysStr = (iso, n) => { const d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Meilleur ALLER-RETOUR réel : aller le moins cher + retour 2 à 10 jours après.
// Renvoie { roundTrip, price (total), depart, retour } ; retombe sur l'aller simple si pas de retour.
async function cheapestTrip(origin, dest) {
  const [out, inb] = await Promise.all([pricesByDay(origin, dest), pricesByDay(dest, origin)]);
  const outDays = Object.keys(out);
  if (!outDays.length) return null;
  let best = null;
  for (const dOut of outDays) {
    for (let k = 2; k <= 10; k++) {
      const dIn = addDaysStr(dOut, k);
      const pIn = inb[dIn];
      if (pIn == null) continue;
      const total = Math.round((out[dOut] + pIn) * 100) / 100;
      if (!best || total < best.price) best = { roundTrip: true, price: total, depart: dOut, retour: dIn };
    }
  }
  if (best) return best;
  // aucun retour trouvé -> aller simple
  let bo = null;
  for (const d of outDays) if (!bo || out[d] < bo.price) bo = { roundTrip: false, price: out[d], depart: d, retour: null };
  return bo;
}

async function routesOf(origin) {
  try {
    const j = await getJSON(`https://www.ryanair.com/api/views/locate/searchWidget/routes/en/airport/${origin}`);
    return (Array.isArray(j) ? j : [])
      .map((r) => r.arrivalAirport).filter(Boolean)
      .map((a) => ({
        dest: a.code,
        destSeo: a.seoName || a.name,
        destCity: a.city?.name || a.name,
        country: a.country?.name || "",
        iso3: a.country?.iso3code || "",
        lat: a.coordinates?.latitude, lon: a.coordinates?.longitude,
      }))
      // garde une entrée par destination
      .filter((v, i, arr) => arr.findIndex((x) => x.dest === v.dest) === i);
  } catch (e) { console.warn(`routes ${origin} KO:`, e.message); return []; }
}

const all = [];
for (const origin of ORIGIN_CODES) {
  const A = AIRPORTS[origin];
  const dests = await routesOf(origin);
  console.log(`${origin} (${A.city}) : ${dests.length} destinations`);
  const priced = await pool(dests, 8, async (d) => {
    const c = await cheapestTrip(origin, d.dest);
    const cached = prevPrice.get(`${origin}-${d.dest}`);
    const priceFrom = c?.price ?? cached?.priceFrom ?? null;
    const departDate = c?.depart ?? cached?.departDate ?? null;
    const returnDate = c ? c.retour : (cached?.returnDate ?? null);
    const roundTrip = c ? c.roundTrip : (cached?.roundTrip ?? false);
    return { origin, originCity: A.city, originName: A.name, originSlug: A.slug, ...d,
      priceFrom, departDate, returnDate, roundTrip };
  });
  all.push(...priced);
}

const withPrice = all.filter((r) => r.priceFrom != null).length;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  count: all.length, withPrice,
  routes: all.sort((a, b) => (a.priceFrom ?? 9e9) - (b.priceFrom ?? 9e9)),
}, null, 2));
console.log(`Catalogue : ${all.length} routes, ${withPrice} avec prix. -> data/catalog.json`);
