// Poste le digest quotidien des meilleurs vols pas chers sur un canal Telegram,
// avec les liens affiliés trackés. Source = data/catalog.json (déjà rafraîchi par le cron).
// 100% automatique une fois configuré.
//
// SETUP (une seule fois, côté user) :
//   1. Telegram → @BotFather → /newbot → récupère le TOKEN du bot
//   2. Crée un canal public (ex: "Vols Malins – Bons plans Charleroi")
//   3. Ajoute le bot comme ADMIN du canal (droit de publier)
//   4. Secrets GitHub du repo : TELEGRAM_BOT_TOKEN = le token
//                               TELEGRAM_CHAT_ID  = @nom_du_canal (ou l'ID numérique)
// Sans ces 2 variables, le script ne fait rien (skip propre).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { flightLink, euro, frShort } from "./lib.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT = process.env.TELEGRAM_CHAT_ID;
const SITE = process.env.SITE_BASE_URL || "https://volsmalins.be";
const N = parseInt(process.env.TELEGRAM_DEALS || "6", 10);
const ORIGIN = process.env.TELEGRAM_ORIGIN || "CRL"; // canal = Charleroi uniquement

const DRY = process.env.TELEGRAM_DRY === "1"; // aperçu : construit le message mais ne poste pas
if ((!TOKEN || !CHAT) && !DRY) { console.warn("Telegram : TELEGRAM_BOT_TOKEN/CHAT_ID absents → post sauté."); process.exit(0); }

const catalog = JSON.parse(readFileSync(join(ROOT, "data", "catalog.json"), "utf8"));
// Noms FR (ville/pays) depuis le cache blurbs si dispo (Venise plutôt que Venice).
let BL = {};
try { BL = JSON.parse(readFileSync(join(ROOT, "data", "blurbs.json"), "utf8")); } catch { /* fallback EN */ }
const cityFr = (r) => BL[r.dest]?.cityFr || r.destCity;
const countryFr = (r) => BL[r.dest]?.countryFr || r.country;

// Meilleurs deals : 1 par destination, les moins chers d'abord.
const seen = new Set();
const deals = catalog.routes
  .filter((r) => r.priceFrom != null && r.origin === ORIGIN)
  .sort((a, b) => a.priceFrom - b.priceFrom)
  .filter((r) => (seen.has(r.dest) ? false : (seen.add(r.dest), true)))
  .slice(0, N);

const esc = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

const lines = deals.map((r, i) => {
  const trip = r.roundTrip ? "aller-retour" : "aller simple";
  const dates = r.departDate
    ? ` · ${frShort(r.departDate)}${r.returnDate ? `→${frShort(r.returnDate)}` : ""}`
    : "";
  const link = flightLink(r.origin, r.dest, r.departDate, r.returnDate);
  return `${["🥇", "🥈", "🥉", "✈️", "✈️", "✈️"][i] || "✈️"} <b>${esc(cityFr(r))}</b> (${esc(countryFr(r))}) — <b>dès ${euro(r.priceFrom)}€</b> ${trip}${dates}\n   👉 <a href="${link}">Voir / réserver</a>`;
});

const today = new Intl.DateTimeFormat("fr-BE", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
const text =
  `✈️ <b>Bons plans vols depuis Charleroi</b> — ${esc(today)}\n\n` +
  lines.join("\n\n") +
  `\n\n🔎 Tous les vols & hôtels : <a href="${SITE}">volsmalins.be</a>\n` +
  `<i>Prix Ryanair, susceptibles de changer. Liens affiliés (même prix pour toi).</i>`;

if (DRY) { console.log("--- APERÇU message Telegram (non posté) ---\n"); console.log(text); process.exit(0); }

const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    chat_id: CHAT,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  }),
});
const j = await res.json();
if (!j.ok) { console.error("Telegram KO:", j.description || res.status); process.exit(1); }
console.log(`Telegram : digest posté (${deals.length} deals) sur ${CHAT}.`);
