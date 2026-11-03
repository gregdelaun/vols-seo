// Récupère une BELLE photo par ville (Pixabay) VÉRIFIÉE par Gemini Vision :
// l'IA choisit, parmi plusieurs candidates, celle qui montre vraiment la ville
// (point de repère / skyline / vieille ville / côte) et rejette les ciels vides & photos génériques.
// Cache dans data/photos.json ; JPG dans img/{iata}.jpg.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const IMG = join(ROOT, "img");
const CAT = join(ROOT, "data", "catalog.json");
const OUT = join(ROOT, "data", "photos.json");
const PKEY = process.env.PIXABAY_API_KEY;
const GKEY = process.env.GEMINI_API_KEY;

const catalog = JSON.parse(readFileSync(CAT, "utf8"));
const photos = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
mkdirSync(IMG, { recursive: true });
if (!PKEY) { console.warn("Pas de PIXABAY_API_KEY : photos sautées."); process.exit(0); }

const cities = new Map();
for (const r of catalog.routes) if (!cities.has(r.dest)) cities.set(r.dest, { iata: r.dest, city: r.destCity, country: r.country });
const list = [...cities.values()];

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }));
}

// Candidats Pixabay (plusieurs requêtes pour avoir du choix représentatif)
async function candidates(c) {
  const queries = [`${c.city} ${c.country} landmark`, `${c.city} skyline`, `${c.city} old town`, `${c.city} ${c.country}`];
  const seen = new Set(); const out = [];
  for (const q of queries) {
    try {
      const r = await fetch(`https://pixabay.com/api/?key=${PKEY}&q=${encodeURIComponent(q)}` +
        `&image_type=photo&orientation=horizontal&category=places&order=popular&safesearch=true&per_page=5`);
      if (!r.ok) continue;
      const j = await r.json();
      for (const h of j.hits || []) {
        if (seen.has(h.id) || h.webformatWidth < h.webformatHeight) continue;
        seen.add(h.id); out.push({ id: h.id, url: h.webformatURL, large: h.largeImageURL, user: h.user, tags: h.tags });
        if (out.length >= 6) break;
      }
    } catch { /* requête suivante */ }
    if (out.length >= 6) break;
  }
  return out;
}

async function toInline(url) {
  const r = await fetch(url); if (!r.ok) throw new Error("dl");
  const b = Buffer.from(await r.arrayBuffer());
  return { inlineData: { mimeType: "image/jpeg", data: b.toString("base64") } };
}

// Gemini Vision : choisit le meilleur index parmi les candidats, ou -1.
async function pickBest(c, cands) {
  if (!GKEY || cands.length === 0) return 0; // sans IA : premier candidat
  if (cands.length === 1) return 0;
  try {
    const imgs = await Promise.all(cands.map((x) => toInline(x.url)));
    const prompt = `Voici ${cands.length} photos candidates pour illustrer la ville de ${c.city} (${c.country}), dans l'ordre (index 0 à ${cands.length - 1}).
Choisis celle qui montre le MIEUX un visuel RECONNAISSABLE et ATTRACTIF de ${c.city} : monument, skyline, vieille ville, canal, côte, place célèbre.
REJETTE : ciel vide/nuages seuls, champ ou paysage générique, gros plan d'objet, texte, carte, et toute photo d'une AUTRE ville.
Réponds en JSON STRICT {"index": n} (n = meilleur index) ou {"index": -1} si aucune ne convient.`;
    const parts = [{ text: prompt }, ...imgs];
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
      { method: "POST", headers: { "x-goog-api-key": GKEY, "content-type": "application/json" },
        body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: "application/json", temperature: 0 } }) });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const j = await res.json();
    const txt = j.candidates[0].content.parts[0].text.trim().replace(/^```json\s*/i, "").replace(/```$/, "");
    const idx = JSON.parse(txt).index;
    return Number.isInteger(idx) && idx >= 0 && idx < cands.length ? idx : -1;
  } catch { return 0; } // en cas d'erreur IA : garde le premier
}

// URL haute résolution (1280px) : utilise large si connu, sinon la récupère par id Pixabay.
async function hiRes(p) {
  if (p.large) return p.large;
  if (!p.id) return p.url;
  try {
    const r = await fetch(`https://pixabay.com/api/?key=${PKEY}&id=${p.id}`);
    if (r.ok) { const h = (await r.json()).hits?.[0]; if (h?.largeImageURL) { p.large = h.largeImageURL; return h.largeImageURL; } }
  } catch { /* fallback */ }
  return p.url;
}
async function dl1(url, dest) {
  try { const r = await fetch(url); if (!r.ok) return false; writeFileSync(dest, Buffer.from(await r.arrayBuffer())); return true; }
  catch { return false; }
}
// Les URL d'images Pixabay (webformatURL/largeImageURL) EXPIRENT (~24h) : un cache
// photos.json réutilisé plus tard pointe sur des liens morts (HTTP 400). On rafraîchit
// les deux URL par id avant de (re)télécharger.
// Espaceur d'appels API Pixabay : ~1 toutes les 700 ms (≈85/min < limite 100/min).
let _apiChain = Promise.resolve();
function throttleApi(ms = 700) { const p = _apiChain.then(() => new Promise((r) => setTimeout(r, ms))); _apiChain = p; return p; }
async function refreshById(p) {
  if (!p.id || !PKEY) return false;
  try {
    await throttleApi();
    const r = await fetch(`https://pixabay.com/api/?key=${PKEY}&id=${p.id}`);
    if (!r.ok) return false;
    const h = (await r.json()).hits?.[0];
    if (!h) return false;
    if (h.webformatURL) p.url = h.webformatURL;
    if (h.largeImageURL) p.large = h.largeImageURL;
    return true;
  } catch { return false; }
}

const FORCE = process.env.PHOTOS_FORCE === "1"; // re-vérifie même les villes déjà en cache
const todo = list.filter((c) => FORCE || !photos[c.iata]);
console.log(`${list.length} villes, ${todo.length} à (re)vérifier via Vision${GKEY ? "" : " (IA off)"}.`);
let ok = 0, rejected = 0;
await pool(todo, 3, async (c) => {
  const cands = await candidates(c);
  if (!cands.length) { rejected++; return; } // aucune image dispo -> fond dégradé
  let idx = await pickBest(c, cands);
  if (idx < 0) idx = 0; // l'IA n'a pas de favori net -> on garde la 1re (requête "landmark")
  photos[c.iata] = cands[idx];
  ok++;
});
writeFileSync(OUT, JSON.stringify(photos, null, 2));

// 2 tailles : img/{iata}.jpg = vignette 640px (cartes, léger) ; img/hero/{iata}.jpg = 1280px (grand hero seulement)
mkdirSync(join(IMG, "hero"), { recursive: true });
let dl = 0, refreshed = 0;
await pool(Object.entries(photos), 4, async ([iata, p]) => {
  let okCard = await dl1(p.url, join(IMG, `${iata}.jpg`));              // 640px (webformat)
  let okHero = await dl1(await hiRes(p), join(IMG, "hero", `${iata}.jpg`)); // 1280px (large)
  if (!okCard || !okHero) {                       // URL expirée -> rafraîchir par id et réessayer
    if (await refreshById(p)) {
      refreshed++;
      if (!okCard) okCard = await dl1(p.url, join(IMG, `${iata}.jpg`));
      if (!okHero) okHero = await dl1(p.large || p.url, join(IMG, "hero", `${iata}.jpg`));
    }
  }
  if (okCard) dl++;
});
writeFileSync(OUT, JSON.stringify(photos, null, 2)); // sauve les URLs fraîches récupérées
console.log(`Photos validées : ${ok} · rejetées : ${rejected} · rafraîchies : ${refreshed} · vignettes 640 + heros 1280 téléchargées : ${dl}.`);
