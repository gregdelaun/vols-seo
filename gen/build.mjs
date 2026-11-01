// Génère le site statique dans site/ à partir de data/catalog.json (+ data/blurbs.json).
// Pages : accueil, 1 page par aéroport de départ, 1 page par route (origine→destination),
// 1 page par destination (toutes origines), + sitemap.xml, robots.txt, style.css.
import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AIRPORTS } from "./airports.mjs";
import { slugify, esc, flightLink, hotelLink, hasMarker, euro, frDate, frShort } from "./lib.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const SITE = join(ROOT, "site");
const catalog = JSON.parse(readFileSync(join(ROOT, "data", "catalog.json"), "utf8"));
const blurbs = existsSync(join(ROOT, "data", "blurbs.json"))
  ? JSON.parse(readFileSync(join(ROOT, "data", "blurbs.json"), "utf8")) : {};

const BASE = (process.env.SITE_BASE_URL || "https://gregdelaun.github.io/vols-seo").replace(/\/$/, "");
const NAME = process.env.SITE_NAME || "VolsMalins";
const now = new Date();

// --- helpers ---------------------------------------------------------------
const cityFr = (r) => blurbs[r.dest]?.cityFr || r.destCity;
const countryFr = (r) => blurbs[r.dest]?.countryFr || r.country;
const retourOf = (iso) => { if (!iso) return null; const d = new Date(iso); d.setDate(d.getDate() + 5); return d.toISOString().slice(0, 10); };
const routeUrl = (r) => `vol/${r.originSlug}-${slugify(r.destSeo)}`;
const destUrl = (r) => `destination/${slugify(r.destSeo)}`;
const departUrl = (o) => `depart/${AIRPORTS[o].slug}`;

const urls = new Set(); // pour le sitemap
function write(relDir, html) {
  const dir = relDir ? join(SITE, relDir) : SITE;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
  urls.add(relDir ? `${BASE}/${relDir}/` : `${BASE}/`);
}

function layout({ path, title, desc, body, jsonld, breadcrumb }) {
  const canonical = path ? `${BASE}/${path}/` : `${BASE}/`;
  const ld = [];
  if (breadcrumb) ld.push({
    "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: breadcrumb.map((b, i) => ({
      "@type": "ListItem", position: i + 1, name: b.name,
      item: b.path != null ? (b.path ? `${BASE}/${b.path}/` : `${BASE}/`) : undefined,
    })),
  });
  if (jsonld) ld.push(jsonld);
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${esc(NAME)}">
<meta name="robots" content="index,follow">
<link rel="stylesheet" href="${BASE}/style.css">
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n")}
</head>
<body>
<header class="nav"><a class="brand" href="${BASE}/">✈️ ${esc(NAME)}</a>
<span class="tag">Vols pas chers au départ de Belgique &amp; frontières</span></header>
<main>${body}</main>
<footer class="foot">
<p>${esc(NAME)} compare les prix et renvoie vers les sites de réservation partenaires. Les prix "dès X€" sont des tarifs aller simple relevés automatiquement via Ryanair et peuvent évoluer ; vérifie toujours le prix final sur le site de réservation (bagages non inclus).</p>
<p><a href="${BASE}/">Accueil</a> · Mis à jour le ${esc(frDate(now.toISOString()))}${hasMarker() ? "" : " · ⚠️ liens non trackés"}</p>
</footer>
</body>
</html>`;
}

const priceBadge = (p) => p == null ? `<span class="price na">prix à vérifier</span>` : `<span class="price">dès ${euro(p)}€</span>`;

function ctaButtons(r) {
  const retour = retourOf(r.bestDate);
  const f = flightLink(r.origin, r.dest, r.bestDate, retour);
  const h = hotelLink(cityFr(r));
  return `<div class="cta">
  <a class="btn btn-primary" href="${esc(f)}" rel="sponsored nofollow" target="_blank">✈️ Voir les vols ${esc(r.originCity)} → ${esc(cityFr(r))}</a>
  <a class="btn btn-ghost" href="${esc(h)}" rel="sponsored nofollow" target="_blank">🏨 Hôtels à ${esc(cityFr(r))}</a>
</div>`;
}

function routeCard(r) {
  return `<a class="card" href="${BASE}/${routeUrl(r)}/">
  <span class="card-city">${esc(cityFr(r))}</span>
  <span class="card-country">${esc(countryFr(r))}</span>
  <span class="card-from">depuis ${esc(r.originCity)}${r.bestDate ? ` · ex. ${esc(frShort(r.bestDate))}` : ""}</span>
  ${priceBadge(r.priceFrom)}
</a>`;
}

// Sélection variée pour l'accueil : un éventail de prix (pas 48× le même tarif plancher),
// une seule fois chaque destination, en gardant le moins cher de chaque palier.
function spread(all, n) {
  const priced = all.filter((r) => r.priceFrom != null).sort((a, b) => a.priceFrom - b.priceFrom);
  const seen = new Set(); const uniq = [];
  for (const r of priced) { if (seen.has(r.dest)) continue; seen.add(r.dest); uniq.push(r); }
  const ranges = [[0, 15], [16, 20], [21, 28], [29, 40], [41, 60], [61, 1e9]];
  const per = Math.ceil(n / ranges.length);
  const buckets = ranges.map(([lo, hi]) => uniq.filter((r) => r.priceFrom >= lo && r.priceFrom <= hi).slice(0, per));
  // entrelacement round-robin : la 1re rangée montre déjà un éventail de prix
  const out = [];
  for (let i = 0; i < per; i++) for (const b of buckets) if (b[i]) out.push(b[i]);
  return out.slice(0, n);
}

// --- reset site ------------------------------------------------------------
if (existsSync(SITE)) rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });

const routes = catalog.routes;
const byOrigin = new Map();
const byDest = new Map();
for (const r of routes) {
  if (!byOrigin.has(r.origin)) byOrigin.set(r.origin, []);
  byOrigin.get(r.origin).push(r);
  if (!byDest.has(r.dest)) byDest.set(r.dest, []);
  byDest.get(r.dest).push(r);
}

// === PAGE ROUTE (la page qui rapporte) =====================================
for (const r of routes) {
  const b = blurbs[r.dest];
  const city = cityFr(r), country = countryFr(r);
  const title = `Vol ${r.originCity} → ${city} pas cher ${r.priceFrom ? `dès ${euro(r.priceFrom)}€` : ""} | ${NAME}`.replace(/\s+\|/, " |");
  const desc = `Trouve ton vol ${r.originCity} ${city} (${country}) au meilleur prix${r.priceFrom ? `, à partir de ${euro(r.priceFrom)}€ l'aller` : ""}. Dates, meilleure saison et réservation en 1 clic.`;
  const related = (byOrigin.get(r.origin) || []).filter((x) => x.dest !== r.dest).slice(0, 8);
  const otherOrigins = (byDest.get(r.dest) || []).filter((x) => x.origin !== r.origin);

  const faq = [
    { q: `Combien coûte un vol ${r.originCity} ${city} ?`,
      a: r.priceFrom ? `Les vols ${r.originCity}–${city} démarrent autour de ${euro(r.priceFrom)}€ l'aller simple${r.bestDate ? ` (par ex. le ${frDate(r.bestDate)})` : ""}. Les prix varient selon la date : compare via le bouton ci-dessus.` : `Compare les dates via le bouton ci-dessus pour trouver le tarif le plus bas sur la ligne ${r.originCity}–${city}.` },
    { q: `Quelle est la meilleure période pour partir à ${city} ?`,
      a: b?.bestSeason ? `La meilleure saison pour ${city} est en général ${b.bestSeason}.` : `${city} se visite toute l'année ; les tarifs sont souvent plus bas hors vacances scolaires et hors week-ends.` },
  ];
  const jsonld = { "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };

  const body = `
<nav class="crumbs"><a href="${BASE}/">Accueil</a> › <a href="${BASE}/${departUrl(r.origin)}/">${esc(r.originCity)}</a> › ${esc(city)}</nav>
<section class="hero">
  <h1>Vol ${esc(r.originCity)} → ${esc(city)} pas cher</h1>
  <p class="sub">${esc(country)} · au départ de ${esc(r.originName)} ${priceBadge(r.priceFrom)}</p>
  ${ctaButtons(r)}
</section>
${b?.blurb ? `<section class="prose"><h2>${esc(city)} en bref</h2><p>${esc(b.blurb)}</p>
  ${Array.isArray(b.todo) && b.todo.length ? `<ul class="todo">${b.todo.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
  ${b.bestSeason ? `<p class="meta">🗓️ Meilleure saison : <strong>${esc(b.bestSeason)}</strong></p>` : ""}</section>` : ""}
<section class="prose">
  <h2>Infos pratiques</h2>
  <table class="info"><tbody>
    <tr><td>Départ</td><td>${esc(r.originName)} (${esc(r.origin)})</td></tr>
    <tr><td>Arrivée</td><td>${esc(city)} (${esc(r.dest)})</td></tr>
    <tr><td>Prix indicatif</td><td>${r.priceFrom ? `dès ${euro(r.priceFrom)}€ l'aller` : "à vérifier"}</td></tr>
    ${r.bestDate ? `<tr><td>Exemple de date</td><td>${esc(frDate(r.bestDate))}</td></tr>` : ""}
  </tbody></table>
</section>
<section class="prose"><h2>Questions fréquentes</h2>
  ${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
</section>
${otherOrigins.length ? `<section class="prose"><h2>Autres départs vers ${esc(city)}</h2>
  <div class="grid">${otherOrigins.map(routeCard).join("")}</div></section>` : ""}
${related.length ? `<section class="prose"><h2>Autres bons plans depuis ${esc(r.originCity)}</h2>
  <div class="grid">${related.map(routeCard).join("")}</div></section>` : ""}`;

  write(routeUrl(r), layout({ path: routeUrl(r), title, desc, body, jsonld,
    breadcrumb: [{ name: "Accueil", path: "" }, { name: r.originCity, path: departUrl(r.origin) }, { name: city, path: routeUrl(r) }] }));
}

// === PAGE DESTINATION (toutes origines) ====================================
for (const [dest, list] of byDest) {
  const r0 = list[0]; const city = cityFr(r0); const country = countryFr(r0); const b = blurbs[dest];
  const best = list.reduce((m, x) => (x.priceFrom != null && (m == null || x.priceFrom < m) ? x.priceFrom : m), null);
  const title = `Vols pas chers pour ${city} ${best ? `dès ${euro(best)}€` : ""} | ${NAME}`.replace(/\s+\|/, " |");
  const desc = `Tous les vols pas chers vers ${city} (${country})${best ? ` à partir de ${euro(best)}€` : ""} : compare les départs et réserve au meilleur prix.`;
  const body = `
<nav class="crumbs"><a href="${BASE}/">Accueil</a> › ${esc(city)}</nav>
<section class="hero"><h1>Vols pas chers pour ${esc(city)}</h1>
  <p class="sub">${esc(country)} ${best ? priceBadge(best) : ""}</p></section>
${b?.blurb ? `<section class="prose"><p>${esc(b.blurb)}</p></section>` : ""}
<section class="prose"><h2>Au départ de quel aéroport ?</h2>
  <div class="grid">${list.sort((a, b2) => (a.priceFrom ?? 9e9) - (b2.priceFrom ?? 9e9)).map(routeCard).join("")}</div></section>`;
  write(destUrl(r0), layout({ path: destUrl(r0), title, desc, body,
    breadcrumb: [{ name: "Accueil", path: "" }, { name: city, path: destUrl(r0) }] }));
}

// === PAGE DÉPART (par aéroport) ============================================
for (const [origin, list] of byOrigin) {
  const A = AIRPORTS[origin];
  const sorted = list.slice().sort((a, b) => (a.priceFrom ?? 9e9) - (b.priceFrom ?? 9e9));
  const best = sorted.find((x) => x.priceFrom != null)?.priceFrom;
  const title = `Vols pas chers au départ de ${A.city} ${best ? `dès ${euro(best)}€` : ""} | ${NAME}`.replace(/\s+\|/, " |");
  const desc = `Les ${list.length} destinations les moins chères au départ de ${A.name}${best ? `, dès ${euro(best)}€` : ""}. Compare et réserve.`;
  const body = `
<nav class="crumbs"><a href="${BASE}/">Accueil</a> › ${esc(A.city)}</nav>
<section class="hero"><h1>Vols pas chers depuis ${esc(A.city)}</h1>
  <p class="sub">${esc(A.name)} · ${list.length} destinations</p></section>
<section class="prose"><div class="grid">${sorted.map(routeCard).join("")}</div></section>`;
  write(departUrl(origin), layout({ path: departUrl(origin), title, desc, body,
    breadcrumb: [{ name: "Accueil", path: "" }, { name: A.city, path: departUrl(origin) }] }));
}

// === ACCUEIL ===============================================================
{
  const deals = spread(routes, 48);
  const origins = [...byOrigin.keys()];
  const best = deals[0]?.priceFrom;
  const title = `${NAME} — Vols pas chers au départ de Belgique dès ${best ? euro(best) + "€" : "40€"}`;
  const desc = `Compare ${routes.length} vols pas chers au départ de Charleroi, Paris-Beauvais, Lille, Luxembourg et plus. Prix mis à jour chaque jour.`;
  const body = `
<section class="hero hero-home">
  <h1>Vols pas chers au départ de Belgique &amp; frontières</h1>
  <p class="sub">${routes.length} routes comparées, prix rafraîchis chaque jour. Choisis ton aéroport :</p>
  <div class="origins">${origins.map((o) => `<a class="chip" href="${BASE}/${departUrl(o)}/">${esc(AIRPORTS[o].city)}</a>`).join("")}</div>
</section>
<section class="prose"><h2>🔥 Les meilleurs prix du moment</h2>
  <div class="grid">${deals.map(routeCard).join("")}</div>
</section>
<section class="prose">
  <h2>Comment ça marche</h2>
  <p>${esc(NAME)} relève automatiquement chaque jour les tarifs Ryanair au départ des aéroports accessibles depuis la Belgique et la frontière, puis te renvoie vers les sites de réservation pour comparer et réserver au meilleur prix. Gratuit, sans compte.</p>
</section>`;
  write("", layout({ path: "", title, desc, body,
    breadcrumb: [{ name: "Accueil", path: "" }] }));
}

// === sitemap.xml + robots.txt + style.css ==================================
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...urls].map((u) =>
  `<url><loc>${u}</loc><lastmod>${now.toISOString().slice(0, 10)}</lastmod></url>`).join("")}</urlset>`;
writeFileSync(join(SITE, "sitemap.xml"), sitemap);
writeFileSync(join(SITE, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
writeFileSync(join(SITE, ".nojekyll"), "");
// Domaine perso GitHub Pages : écrit le fichier CNAME si SITE_DOMAIN est défini.
if (process.env.SITE_DOMAIN) writeFileSync(join(SITE, "CNAME"), process.env.SITE_DOMAIN.trim() + "\n");
writeFileSync(join(SITE, "style.css"), CSS());

console.log(`Site généré : ${urls.size} pages dans site/`);
console.log(`Base URL : ${BASE}`);

function CSS() { return `
:root{--bg:#0b1020;--ink:#0b1020;--muted:#5b6478;--line:#e6e8ef;--brand:#2563eb;--green:#059669;--card:#fff}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#f6f7fb;line-height:1.55}
a{color:var(--brand);text-decoration:none}
.nav{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:14px 20px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.brand{font-weight:800;font-size:20px;color:var(--ink)}
.tag{color:var(--muted);font-size:13px}
main{max-width:980px;margin:0 auto;padding:20px}
.crumbs{font-size:13px;color:var(--muted);margin:6px 0 14px}
.hero{background:linear-gradient(135deg,#1e3a8a,#2563eb);color:#fff;border-radius:20px;padding:34px 28px;margin-bottom:22px;box-shadow:0 12px 40px rgba(37,99,235,.18)}
.hero h1{margin:0 0 8px;font-size:30px;line-height:1.15}
.hero .sub{margin:0;opacity:.95;font-size:16px}
.hero-home{padding:44px 30px}
.origins,.cta{display:flex;flex-wrap:wrap;gap:10px;margin-top:18px}
.chip{background:rgba(255,255,255,.16);color:#fff;padding:8px 14px;border-radius:999px;font-weight:600;font-size:14px}
.chip:hover{background:rgba(255,255,255,.28)}
.price{display:inline-block;background:#dcfce7;color:var(--green);font-weight:800;padding:3px 10px;border-radius:8px;font-size:15px}
.hero .price{background:#fff;color:var(--brand)}
.price.na{background:#eef0f5;color:var(--muted);font-weight:600}
.btn{display:inline-block;padding:13px 18px;border-radius:12px;font-weight:700;font-size:15px}
.btn-primary{background:#fff;color:var(--brand)}
.btn-ghost{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.5)}
.btn:hover{transform:translateY(-1px)}
.prose{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px 24px;margin:16px 0}
.prose h2{margin:0 0 14px;font-size:21px}
.prose p{margin:0 0 10px}
.todo{margin:6px 0 10px;padding-left:20px}
.meta{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.card{display:flex;flex-direction:column;gap:2px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;transition:.15s}
.card:hover{border-color:var(--brand);box-shadow:0 8px 24px rgba(37,99,235,.12);transform:translateY(-2px)}
.card-city{font-weight:800;font-size:17px;color:var(--ink)}
.card-country{color:var(--muted);font-size:13px}
.card-from{color:var(--muted);font-size:12px;margin:2px 0 6px}
table.info{width:100%;border-collapse:collapse}
table.info td{padding:9px 6px;border-bottom:1px solid var(--line);font-size:15px}
table.info td:first-child{color:var(--muted);width:42%}
details{border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:8px}
summary{font-weight:600;cursor:pointer}
details p{margin:8px 0 0;color:#333}
.foot{max-width:980px;margin:30px auto;padding:20px;color:var(--muted);font-size:13px;border-top:1px solid var(--line)}
@media(max-width:560px){.hero h1{font-size:24px}.btn{width:100%;text-align:center}}
`; }
