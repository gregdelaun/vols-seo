// Récupère une photo par ville de destination (Pixabay), la télécharge dans img/{iata}.jpg
// et met en cache le choix dans data/photos.json (ne re-cherche jamais une ville déjà traitée).
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const IMG = join(ROOT, "img");
const CAT = join(ROOT, "data", "catalog.json");
const OUT = join(ROOT, "data", "photos.json");
const KEY = process.env.PIXABAY_API_KEY;

const catalog = JSON.parse(readFileSync(CAT, "utf8"));
const photos = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : {};
mkdirSync(IMG, { recursive: true });

if (!KEY) { console.warn("Pas de PIXABAY_API_KEY : photos sautées (le site restera sans images)."); process.exit(0); }

// villes uniques (par IATA)
const cities = new Map();
for (const r of catalog.routes) if (!cities.has(r.dest)) cities.set(r.dest, { iata: r.dest, city: r.destCity, country: r.country });
const list = [...cities.values()];

async function pool(items, size, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (i < items.length) { const it = items[i++]; await fn(it); }
  }));
}

// choisit la meilleure photo Pixabay pour une ville
async function search(c) {
  for (const q of [`${c.city} ${c.country}`, `${c.city} city`, c.city]) {
    const url = `https://pixabay.com/api/?key=${KEY}&q=${encodeURIComponent(q)}` +
      `&image_type=photo&orientation=horizontal&category=places&order=popular&safesearch=true&per_page=6`;
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      const hit = (j.hits || []).find((h) => h.webformatWidth >= h.webformatHeight);
      if (hit) return { id: hit.id, url: hit.webformatURL, user: hit.user, tags: hit.tags, q };
    } catch { /* essaie la requête suivante */ }
  }
  return null;
}

async function download(iata, url) {
  const dest = join(IMG, `${iata}.jpg`);
  if (existsSync(dest)) return true;
  try {
    const r = await fetch(url);
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    writeFileSync(dest, buf);
    return true;
  } catch { return false; }
}

// 1) recherche (seulement les villes sans photo en cache)
const todo = list.filter((c) => !photos[c.iata]);
console.log(`${list.length} villes, ${todo.length} à chercher sur Pixabay.`);
let found = 0;
await pool(todo, 5, async (c) => {
  const p = await search(c);
  if (p) { photos[c.iata] = p; found++; }
});
writeFileSync(OUT, JSON.stringify(photos, null, 2));
console.log(`Photos trouvées : ${found} nouvelles. Total en cache : ${Object.keys(photos).length}.`);

// 2) téléchargement des JPG (toutes, pour reconstituer img/ en CI)
let dl = 0;
await pool(Object.entries(photos), 6, async ([iata, p]) => { if (await download(iata, p.url)) dl++; });
console.log(`Images disponibles dans img/ : ${dl}.`);
