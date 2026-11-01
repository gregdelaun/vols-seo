// Génère un contenu éditorial UNIQUE par ville de destination (via Gemini) :
// nom FR, pays FR, un paragraphe guide, meilleure saison, 3 idées de choses à faire.
// Mis en cache dans data/blurbs.json : on ne régénère jamais une ville déjà écrite.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const CAT = join(ROOT, "data", "catalog.json");
const OUT = join(ROOT, "data", "blurbs.json");
const KEY = process.env.GEMINI_API_KEY;

const catalog = JSON.parse(readFileSync(CAT, "utf8"));
const blurbs = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};

// villes uniques (par IATA d'arrivée)
const cities = new Map();
for (const r of catalog.routes) {
  if (!cities.has(r.dest)) cities.set(r.dest, { iata: r.dest, city: r.destCity, country: r.country });
}
const todo = [...cities.values()].filter((c) => !blurbs[c.iata]);

if (!KEY) {
  console.warn("Pas de GEMINI_API_KEY : blurbs sautés (le build utilisera un texte générique).");
  process.exit(0);
}
if (!todo.length) { console.log("Toutes les villes ont déjà un contenu. Rien à générer."); process.exit(0); }

async function gen(batch) {
  const list = batch.map((c, i) => `${i + 1}. ${c.city} (${c.country}) [id:${c.iata}]`).join("\n");
  const prompt = `Tu écris des mini-guides de voyage en français (public francophone, tutoiement léger).
Pour chacune de ces destinations, donne un contenu UNIQUE, concret et utile (pas de blabla générique) :
${list}

Rends un JSON STRICT : un objet dont chaque clé est le code IATA à 3 lettres SEUL (ex "LIS", sans crochets ni texte), valeur =
{"cityFr": nom de la ville en français, "countryFr": pays en français,
 "blurb": 2 phrases (max 55 mots) qui donnent envie et UN détail concret (quartier, plat, site),
 "bestSeason": 2-4 mots (ex "avril à juin"),
 "todo": tableau de 3 idées courtes de choses à faire (3-6 mots chacune)}.
Rien d'autre que le JSON.`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
    { method: "POST",
      headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.8 },
      }) });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const txt = j.candidates[0].content.parts[0].text.trim()
    .replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "");
  return JSON.parse(txt);
}

const B = 12;
let added = 0;
for (let i = 0; i < todo.length; i += B) {
  const batch = todo.slice(i, i + B);
  try {
    const obj = await gen(batch);
    // normalise les clés (Gemini peut renvoyer "[LIS]", "lis", " LIS "...)
    const norm = {};
    for (const [k, v] of Object.entries(obj)) norm[k.replace(/[^A-Za-z]/g, "").toUpperCase()] = v;
    for (const c of batch) {
      const v = norm[c.iata];
      if (v && v.blurb) { blurbs[c.iata] = v; added++; }
    }
    console.log(`Lot ${i / B + 1} : ${batch.length} villes ✓`);
    writeFileSync(OUT, JSON.stringify(blurbs, null, 2)); // sauvegarde incrémentale
  } catch (e) { console.warn(`Lot ${i / B + 1} KO :`, e.message); }
}
console.log(`Contenu généré pour ${added} nouvelles villes. Total : ${Object.keys(blurbs).length}.`);
