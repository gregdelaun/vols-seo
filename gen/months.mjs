// Pages saisonnières « Où partir en <mois> depuis <aéroport> ? » : pour chaque aéroport et
// chacun des 4 prochains mois, les A/R Ryanair les moins chers PARTANT dans ce mois
// (API roundTripFares interrogée pays par pays, 1 entrée par destination).
// Sortie : data/months.json { CRL: { "2026-12": [{dest, city, country, price, out, in}] } }
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AIRPORTS } from "./airports.mjs";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "data", "months.json");
const fmt = (d) => d.toISOString().slice(0, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = new Date();
const tomorrow = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 2));

// 4 mois : le mois courant (s'il reste au moins 10 jours), puis les suivants
const months = [];
for (let k = 0; months.length < 4 && k < 6; k++) {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + k, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const from = start < tomorrow ? tomorrow : start;
  if ((end - from) / 864e5 < 10) continue;
  months.push({ key: fmt(start).slice(0, 7), from, end });
}

// ⚠️ L'API roundTripFares ne renvoie que ~18 destinations, prises dans l'ordre ALPHABÉTIQUE
// des codes (A→C), pas les moins chères. On interroge donc PAYS PAR PAYS (arrivalCountryCode).
async function countriesOf(origin) {
  try {
    const r = await fetch(`https://www.ryanair.com/api/views/locate/searchWidget/routes/en/airport/${origin}`,
      { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
    const j = await r.json();
    return [...new Set((Array.isArray(j) ? j : []).map((x) => x.arrivalAirport?.country?.code).filter(Boolean))];
  } catch { return []; }
}
async function fares(origin, market, from, to, country) {
  const retTo = new Date(to); retTo.setUTCDate(retTo.getUTCDate() + 8);
  const url = "https://www.ryanair.com/api/farfnd/v4/roundTripFares?" + new URLSearchParams({
    departureAirportIataCode: origin,
    outboundDepartureDateFrom: fmt(from), outboundDepartureDateTo: fmt(to),
    inboundDepartureDateFrom: fmt(from), inboundDepartureDateTo: fmt(retTo),
    durationFrom: "2", durationTo: "7", market, language: "fr", currency: "EUR", limit: "20",
    ...(country ? { arrivalCountryCode: country } : {}),
  });
  for (let a = 0; a < 3; a++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" } });
      if (r.ok) return (await r.json()).fares || [];
      if (r.status < 500 && r.status !== 429) return [];
    } catch { /* réessaie */ }
    await sleep(2000 * (a + 1));
  }
  return [];
}

const out = {};
// Pages saisonnières : Charleroi (marque) + Paris-Beauvais (plus gros bassin FR). MONTHS_AIRPORTS pour élargir.
const CODES = (process.env.MONTHS_AIRPORTS || "CRL,BVA").split(",");
for (const code of CODES) {
  const A = AIRPORTS[code]; if (!A) continue;
  out[code] = {};
  const countries = await countriesOf(code);
  for (const m of months) {
    // 1 appel par pays sur tout le mois (≤ 20 destinations par pays : aucune n'est perdue)
    const all = [];
    for (const c of countries) { all.push(...await fares(code, A.market, m.from, m.end, c)); await sleep(350); }
    const best = new Map();
    for (const f of all) {
      const o = f.outbound, i = f.inbound;
      if (!o || !i) continue;
      const price = Math.round(((o.price?.value ?? 0) + (i.price?.value ?? 0)) * 100) / 100;
      const dest = o.arrivalAirport.iataCode;
      if (!best.has(dest) || best.get(dest).price > price) best.set(dest, {
        dest, city: o.arrivalAirport.city?.name || o.arrivalAirport.name, country: o.arrivalAirport.countryName,
        price, out: o.departureDate.slice(0, 10), in: i.departureDate.slice(0, 10),
      });
    }
    out[code][m.key] = [...best.values()].sort((a, b) => a.price - b.price);
    console.log(`${code} ${m.key} : ${out[code][m.key].length} destinations, dès ${out[code][m.key][0]?.price ?? "-"}€`);
  }
}
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), months: months.map((m) => m.key), airports: out }, null, 1));
