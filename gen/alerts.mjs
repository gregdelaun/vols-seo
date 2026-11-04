// Alertes « baisse de prix » sur le canal Telegram : quand une route depuis Charleroi
// atteint un NOUVEAU plus bas, nettement sous sa moyenne récente, on poste une alerte
// urgente avec le lien affilié. Source = data/price_history.json (snapshot quotidien,
// cf. history.mjs) + data/catalog.json (dates/lien du prix actuel).
// Anti-spam : seuil de baisse réel, max N alertes/jour, pas de ré-alerte au même prix
// (mémoire dans data/alerts_sent.json, committée par le workflow).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { flightLink, euro, frShort } from "./lib.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dir, "..", "data");
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
const DRY = process.env.TELEGRAM_DRY === "1";
const ORIGIN = process.env.TELEGRAM_ORIGIN || "CRL";      // canal = Charleroi
const MAX = parseInt(process.env.ALERTS_MAX || "3", 10);  // alertes max par jour
const MIN_PCT = 0.15;   // au moins 15 % sous la moyenne des jours précédents
const MIN_EUR = 5;      // et au moins 5 € de moins (évite le bruit à 1 €)
const MIN_DAYS = 3;     // historique minimum (aujourd'hui inclus)
const COOLDOWN_DAYS = 7;

if ((!TOKEN || !CHAT) && !DRY) { console.warn("Alertes : TELEGRAM_BOT_TOKEN/CHAT_ID absents → sauté."); process.exit(0); }

const rd = (f, d) => { try { return JSON.parse(readFileSync(join(DATA, f), "utf8")); } catch { return d; } };
const hist = rd("price_history.json", { routes: {} }).routes || {};
const catalog = rd("catalog.json", { routes: [] }).routes || [];
const BL = rd("blurbs.json", {});
const SENT_F = join(DATA, "alerts_sent.json");
const sent = existsSync(SENT_F) ? rd("alerts_sent.json", {}) : {};
const today = new Date().toISOString().slice(0, 10);
const daysAgo = (iso) => (Date.parse(today) - Date.parse(iso)) / 864e5;

const byKey = new Map(catalog.filter((r) => r.priceFrom != null).map((r) => [`${r.origin}-${r.dest}`, r]));
const cands = [];
for (const [key, series] of Object.entries(hist)) {
  if (!key.startsWith(`${ORIGIN}-`)) continue;
  const pts = Object.entries(series).sort(([a], [b]) => a.localeCompare(b));
  if (pts.length < MIN_DAYS || pts.at(-1)[0] !== today) continue; // il faut le prix du jour
  const now = pts.at(-1)[1];
  const prev = pts.slice(0, -1).map(([, v]) => v);
  const prevMin = Math.min(...prev);
  const prevAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
  if (!(now < prevMin && prevAvg - now >= MIN_EUR && (prevAvg - now) / prevAvg >= MIN_PCT)) continue;
  const s = sent[key];
  if (s && daysAgo(s.date) < COOLDOWN_DAYS && now >= s.price) continue; // déjà alerté à ce prix
  const r = byKey.get(key);
  if (!r) continue;
  cands.push({ key, r, now, prevAvg, pct: (prevAvg - now) / prevAvg, days: pts.length });
}
cands.sort((a, b) => b.pct - a.pct);
const picks = cands.slice(0, MAX);
if (!picks.length) { console.log(`Alertes : aucune vraie baisse aujourd'hui (${ORIGIN}).`); process.exit(0); }

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
const city = (r) => BL[r.dest]?.cityFr || r.destCity;
const blocks = picks.map(({ r, now, prevAvg, pct, days }) => {
  const dates = r.departDate ? ` · ${frShort(r.departDate)}${r.returnDate ? ` → ${frShort(r.returnDate)}` : ""}` : "";
  const link = flightLink(r.origin, r.dest, r.departDate, r.returnDate);
  return `📉 <b>${esc(city(r))}</b> — <b>${euro(now)}€</b> ${r.roundTrip ? "aller-retour" : "aller simple"}${dates}\n` +
    `   au lieu de ~${euro(prevAvg)}€ (−${Math.round(pct * 100)} %, plus bas vu en ${days} jours)\n` +
    `   👉 <a href="${link}">Réserver avant que ça remonte</a>`;
});
const text = `🚨 <b>ALERTE BAISSE DE PRIX</b> — depuis Charleroi\n\n${blocks.join("\n\n")}\n\n` +
  `<i>Prix Ryanair relevés aujourd'hui, ils bougent vite. Liens affiliés (même prix pour toi).</i>`;

if (DRY) { console.log("--- APERÇU alerte (non postée) ---\n" + text); process.exit(0); }

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ chat_id: CHAT, text, parse_mode: "HTML", disable_web_page_preview: true }),
});
const j = await res.json();
if (!j.ok) { console.error("Alertes Telegram KO:", j.description || res.status); process.exit(1); }
for (const { key, now } of picks) sent[key] = { price: now, date: today };
writeFileSync(SENT_F, JSON.stringify(sent, null, 2));
console.log(`Alertes : ${picks.length} baisse(s) postée(s) sur ${CHAT}.`);
