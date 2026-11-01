// Traduit en néerlandais les contenus éditoriaux (blurbs.json FR -> blurbs_nl.json).
// Mis en cache : ne retraduit jamais une ville déjà faite.
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const SRC = join(ROOT, "data", "blurbs.json");
const OUT = join(ROOT, "data", "blurbs_nl.json");
const KEY = process.env.GEMINI_API_KEY;

if (!existsSync(SRC)) { console.warn("Pas de blurbs.json : rien à traduire."); process.exit(0); }
const fr = JSON.parse(readFileSync(SRC, "utf8"));
const nl = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
const todo = Object.keys(fr).filter((iata) => !nl[iata]);

if (!KEY) { console.warn("Pas de GEMINI_API_KEY : traduction sautée."); process.exit(0); }
if (!todo.length) { console.log("Tout est déjà traduit en NL."); process.exit(0); }

async function gen(batch) {
  const items = batch.map((iata) => {
    const b = fr[iata];
    return `[${iata}] ville=${b.cityFr} | pays=${b.countryFr} | texte="${b.blurb}" | saison="${b.bestSeason || ""}" | todo=${JSON.stringify(b.todo || [])}`;
  }).join("\n");
  const prompt = `Traduis ces fiches de voyage du français vers le NÉERLANDAIS (public belge/flamand, ton naturel).
${items}

Rends un JSON STRICT : clé = code à 3 lettres SEUL (ex "LIS"), valeur =
{"cityNl": nom de la ville en néerlandais, "countryNl": pays en néerlandais,
 "blurb": traduction naturelle du texte, "bestSeason": traduction de la saison,
 "todo": tableau des idées traduites}. Rien d'autre que le JSON.`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`,
    { method: "POST", headers: { "x-goog-api-key": KEY, "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4 } }) });
  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const txt = j.candidates[0].content.parts[0].text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```$/, "");
  return JSON.parse(txt);
}

const B = 12;
let added = 0;
for (let i = 0; i < todo.length; i += B) {
  const batch = todo.slice(i, i + B);
  try {
    const obj = await gen(batch);
    const norm = {};
    for (const [k, v] of Object.entries(obj)) norm[k.replace(/[^A-Za-z]/g, "").toUpperCase()] = v;
    for (const iata of batch) { const v = norm[iata]; if (v && v.blurb) { nl[iata] = v; added++; } }
    writeFileSync(OUT, JSON.stringify(nl, null, 2));
    console.log(`Lot ${i / B + 1} : ${batch.length} villes ✓`);
  } catch (e) { console.warn(`Lot ${i / B + 1} KO :`, e.message); }
}
console.log(`Traduit NL : ${added} nouvelles. Total : ${Object.keys(nl).length}.`);
