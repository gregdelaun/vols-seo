// Génère le site statique BILINGUE (FR racine + NL sous /nl/) dans site/.
// Pages par langue : accueil, 1 par aéroport, 1 par route, 1 par destination.
// + hreflang, sitemap.xml, robots.txt, style.css, analytics optionnel, IndexNow.
import { writeFileSync, mkdirSync, readFileSync, rmSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { AIRPORTS } from "./airports.mjs";
import { slugify, esc, flightLink, hotelLink, hasMarker, euro } from "./lib.mjs";

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, "..");
const SITE = join(ROOT, "site");
const rd = (f) => (existsSync(join(ROOT, "data", f)) ? JSON.parse(readFileSync(join(ROOT, "data", f), "utf8")) : {});
const catalog = JSON.parse(readFileSync(join(ROOT, "data", "catalog.json"), "utf8"));
const BL = { fr: rd("blurbs.json"), nl: rd("blurbs_nl.json") };
const photos = rd("photos.json");
const IMGDIR = join(ROOT, "img");

const BASE = (process.env.SITE_BASE_URL || "https://gregdelaun.github.io/vols-seo").replace(/\/$/, "");
const NAME = process.env.SITE_NAME || "VolsMalins";
const GA = process.env.SITE_GA_ID || ""; // Google Analytics 4 (optionnel)
const now = new Date();

const hasPhoto = (iata) => photos[iata] && existsSync(join(IMGDIR, `${iata}.jpg`));
const photoUrl = (iata) => `${BASE}/img/${iata}.jpg`;

// ---- i18n -----------------------------------------------------------------
const LOCALES = ["fr", "nl"];
const PFX = { fr: "", nl: "nl/" };
const SEG = { fr: { route: "vol", dest: "destination", depart: "depart" },
             nl: { route: "vlucht", dest: "bestemming", depart: "vertrek" } };
const DTL = { fr: new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", year: "numeric" }),
             nl: new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "long", year: "numeric" }) };
const DTS = { fr: new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short" }),
             nl: new Intl.DateTimeFormat("nl-BE", { day: "numeric", month: "short" }) };
const dLong = (L, iso) => (iso ? DTL[L].format(new Date(iso)) : "");
const dShort = (L, iso) => (iso ? DTS[L].format(new Date(iso)) : "");

const T = {
  fr: {
    htmlLang: "fr", other: "nl", otherLabel: "NL",
    tag: "Vols pas chers au départ de Belgique & frontières",
    home: "Accueil", updated: "Mis à jour le", untracked: " · ⚠️ liens non trackés",
    disclaimer: `${NAME} compare les prix et renvoie vers les sites de réservation partenaires. Les prix "dès X€" sont des tarifs aller-retour indicatifs (vols les moins chers trouvés automatiquement via Ryanair pour des dates précises) et évoluent constamment ; vérifie toujours le prix final sur le site de réservation (bagages non inclus).`,
    from: "dès", toVerify: "prix à vérifier", since: "depuis", eg: "ex.",
    seeFlights: (a, b) => `✈️ Voir les vols ${a} → ${b}`, hotels: (c) => `🏨 Hôtels à ${c}`,
    routeTitle: (a, b, p) => `Vol ${a} → ${b} pas cher ${p ? `dès ${p}€` : ""} | ${NAME}`.replace(/\s+\|/, " |"),
    routeDesc: (a, b, country, p) => `Trouve ton vol ${a} ${b} (${country}) au meilleur prix${p ? `, à partir de ${p}€ l'aller` : ""}. Dates, meilleure saison et réservation en 1 clic.`,
    routeH1: (a, b) => `Vol ${a} → ${b} pas cher`, atDeparture: "au départ de",
    inBrief: (c) => `${c} en bref`, bestSeason: "Meilleure saison",
    practical: "Infos pratiques", dep: "Départ", arr: "Arrivée", indicPrice: "Prix indicatif",
    ar: "aller-retour", oneLeg: "l'aller", verify: "à vérifier", egDates: "Dates (exemple)",
    faqTitle: "Questions fréquentes",
    faqQ1: (a, b) => `Combien coûte un vol ${a} ${b} ?`,
    faqA1: (a, b, p, tl) => p ? `Les vols ${a}–${b} démarrent autour de ${p}€ ${tl}. Les prix varient selon la date : compare les dates via le bouton ci-dessus pour retrouver ce tarif.` : `Compare les dates via le bouton ci-dessus pour trouver le tarif le plus bas sur la ligne ${a}–${b}.`,
    faqQ2: (c) => `Quelle est la meilleure période pour partir à ${c} ?`,
    faqA2: (c, s) => s ? `La meilleure saison pour ${c} est en général ${s}.` : `${c} se visite toute l'année ; les tarifs sont souvent plus bas hors vacances scolaires et hors week-ends.`,
    otherDepartsTo: (c) => `Autres départs vers ${c}`, otherDealsFrom: (c) => `Autres bons plans depuis ${c}`,
    destTitle: (c, p) => `Vols pas chers pour ${c} ${p ? `dès ${p}€` : ""} | ${NAME}`.replace(/\s+\|/, " |"),
    destDesc: (c, country, p) => `Tous les vols pas chers vers ${c} (${country})${p ? ` à partir de ${p}€` : ""} : compare les départs et réserve au meilleur prix.`,
    destH1: (c) => `Vols pas chers pour ${c}`, whichAirport: "Au départ de quel aéroport ?",
    departTitle: (c, p) => `Vols pas chers au départ de ${c} ${p ? `dès ${p}€` : ""} | ${NAME}`.replace(/\s+\|/, " |"),
    departDesc: (name, n, p) => `Les ${n} destinations les moins chères au départ de ${name}${p ? `, dès ${p}€` : ""}. Compare et réserve.`,
    departH1: (c) => `Vols pas chers depuis ${c}`, destinations: "destinations",
    homeTitle: (p) => `${NAME} — Vols pas chers au départ de Belgique dès ${p ? p + "€" : "40€"}`,
    homeDesc: (n) => `Compare ${n} vols pas chers au départ de Charleroi, Paris-Beauvais, Lille, Luxembourg et plus. Prix mis à jour chaque jour.`,
    homeH1: "Vols pas chers au départ de Belgique & frontières",
    homeSub: (n) => `${n} routes comparées, prix rafraîchis chaque jour. Choisis ton aéroport :`,
    bestNow: "🔥 Les meilleurs prix du moment", howTitle: "Comment ça marche",
    how: `${NAME} relève automatiquement chaque jour les tarifs Ryanair au départ des aéroports accessibles depuis la Belgique et la frontière, puis te renvoie vers les sites de réservation pour comparer et réserver au meilleur prix. Gratuit, sans compte.`,
  },
  nl: {
    htmlLang: "nl", other: "fr", otherLabel: "FR",
    tag: "Goedkope vluchten vanuit België & grensstreek",
    home: "Home", updated: "Bijgewerkt op", untracked: " · ⚠️ niet-getrackte links",
    disclaimer: `${NAME} vergelijkt prijzen en verwijst naar de boekingssites van partners. De prijzen "vanaf X€" zijn indicatieve retourtarieven (goedkoopste vluchten automatisch gevonden via Ryanair voor specifieke data) en wijzigen voortdurend; controleer altijd de eindprijs op de boekingssite (bagage niet inbegrepen).`,
    from: "vanaf", toVerify: "prijs te checken", since: "vanuit", eg: "bijv.",
    seeFlights: (a, b) => `✈️ Bekijk vluchten ${a} → ${b}`, hotels: (c) => `🏨 Hotels in ${c}`,
    routeTitle: (a, b, p) => `Goedkope vlucht ${a} → ${b} ${p ? `vanaf ${p}€` : ""} | ${NAME}`.replace(/\s+\|/, " |"),
    routeDesc: (a, b, country, p) => `Vind je vlucht ${a} ${b} (${country}) aan de beste prijs${p ? `, vanaf ${p}€ enkele reis` : ""}. Data, beste reisperiode en boeken in 1 klik.`,
    routeH1: (a, b) => `Goedkope vlucht ${a} → ${b}`, atDeparture: "vanuit",
    inBrief: (c) => `${c} in het kort`, bestSeason: "Beste reisperiode",
    practical: "Praktische info", dep: "Vertrek", arr: "Aankomst", indicPrice: "Richtprijs",
    ar: "heen en terug", oneLeg: "enkele reis", verify: "te checken", egDates: "Data (voorbeeld)",
    faqTitle: "Veelgestelde vragen",
    faqQ1: (a, b) => `Hoeveel kost een vlucht ${a} ${b}?`,
    faqA1: (a, b, p, tl) => p ? `Vluchten ${a}–${b} starten rond ${p}€ ${tl}. Prijzen variëren per datum: vergelijk de data via de knop hierboven om dit tarief terug te vinden.` : `Vergelijk de data via de knop hierboven voor het laagste tarief op de lijn ${a}–${b}.`,
    faqQ2: (c) => `Wat is de beste periode om naar ${c} te reizen?`,
    faqA2: (c, s) => s ? `De beste reisperiode voor ${c} is meestal ${s}.` : `${c} is het hele jaar te bezoeken; tarieven zijn vaak lager buiten de schoolvakanties en weekends.`,
    otherDepartsTo: (c) => `Andere vertrekpunten naar ${c}`, otherDealsFrom: (c) => `Andere deals vanuit ${c}`,
    destTitle: (c, p) => `Goedkope vluchten naar ${c} ${p ? `vanaf ${p}€` : ""} | ${NAME}`.replace(/\s+\|/, " |"),
    destDesc: (c, country, p) => `Alle goedkope vluchten naar ${c} (${country})${p ? ` vanaf ${p}€` : ""}: vergelijk de vertrekpunten en boek aan de beste prijs.`,
    destH1: (c) => `Goedkope vluchten naar ${c}`, whichAirport: "Vanaf welke luchthaven?",
    departTitle: (c, p) => `Goedkope vluchten vanuit ${c} ${p ? `vanaf ${p}€` : ""} | ${NAME}`.replace(/\s+\|/, " |"),
    departDesc: (name, n, p) => `De ${n} goedkoopste bestemmingen vanuit ${name}${p ? `, vanaf ${p}€` : ""}. Vergelijk en boek.`,
    departH1: (c) => `Goedkope vluchten vanuit ${c}`, destinations: "bestemmingen",
    homeTitle: (p) => `${NAME} — Goedkope vluchten vanuit België vanaf ${p ? p + "€" : "40€"}`,
    homeDesc: (n) => `Vergelijk ${n} goedkope vluchten vanuit Charleroi, Parijs-Beauvais, Rijsel, Luxemburg en meer. Dagelijks bijgewerkte prijzen.`,
    homeH1: "Goedkope vluchten vanuit België & grensstreek",
    homeSub: (n) => `${n} routes vergeleken, prijzen dagelijks ververst. Kies je luchthaven:`,
    bestNow: "🔥 De beste prijzen van nu", howTitle: "Hoe werkt het",
    how: `${NAME} haalt elke dag automatisch de Ryanair-tarieven op vanuit de luchthavens bereikbaar vanuit België en de grensstreek, en verwijst je door naar de boekingssites om te vergelijken en te boeken aan de beste prijs. Gratis, zonder account.`,
  },
};

// ---- accessors par langue -------------------------------------------------
const blurb = (L, iata) => BL[L][iata] || null;
const cityName = (L, r) => (L === "nl" ? blurb("nl", r.dest)?.cityNl : null) || BL.fr[r.dest]?.cityFr || r.destCity;
const countryName = (L, r) => (L === "nl" ? blurb("nl", r.dest)?.countryNl : null) || BL.fr[r.dest]?.countryFr || r.country;
const blurbText = (L, iata) => (blurb(L, iata)?.blurb) || (BL.fr[iata]?.blurb) || "";
const blurbTodo = (L, iata) => (blurb(L, iata)?.todo) || (BL.fr[iata]?.todo) || [];
const blurbSeason = (L, iata) => (blurb(L, iata)?.bestSeason) || (BL.fr[iata]?.bestSeason) || "";

// ---- URLs (chemins relatifs, sans BASE) -----------------------------------
const routePath = (L, r) => `${PFX[L]}${SEG[L].route}/${r.originSlug}-${slugify(r.destSeo)}`;
const destPath = (L, r) => `${PFX[L]}${SEG[L].dest}/${slugify(r.destSeo)}`;
const departPath = (L, o) => `${PFX[L]}${SEG[L].depart}/${AIRPORTS[o].slug}`;
const homePath = (L) => (L === "nl" ? "nl" : "");
const abs = (p) => (p ? `${BASE}/${p}/` : `${BASE}/`);

const urls = new Set();
function write(relDir, html) {
  const dir = relDir ? join(SITE, relDir) : SITE;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
  urls.add(abs(relDir));
}

function layout(L, { path, altPath, title, desc, body, jsonld, breadcrumb }) {
  const t = T[L];
  const canonical = abs(path);
  const ld = [];
  if (breadcrumb) ld.push({ "@context": "https://schema.org", "@type": "BreadcrumbList",
    itemListElement: breadcrumb.map((b, i) => ({ "@type": "ListItem", position: i + 1, name: b.name,
      item: b.path != null ? abs(b.path) : undefined })) });
  if (jsonld) ld.push(jsonld);
  // hreflang : la même page dans les deux langues
  const alts = { fr: abs(altPath.fr), nl: abs(altPath.nl) };
  const hreflang = `<link rel="alternate" hreflang="fr" href="${alts.fr}">
<link rel="alternate" hreflang="nl" href="${alts.nl}">
<link rel="alternate" hreflang="x-default" href="${alts.fr}">`;
  const ga = GA ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA}')</script>` : "";
  return `<!DOCTYPE html>
<html lang="${t.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
${hreflang}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${esc(NAME)}">
<meta property="og:image" content="${BASE}/og.jpg">
<meta name="robots" content="index,follow">
<link rel="stylesheet" href="${BASE}/style.css">
${ga}
${ld.map((x) => `<script type="application/ld+json">${JSON.stringify(x)}</script>`).join("\n")}
</head>
<body>
<header class="nav"><a class="brand" href="${abs(homePath(L))}">✈️ ${esc(NAME)}</a>
<span class="tag">${esc(t.tag)}</span>
<a class="lang" href="${alts[t.other]}" hreflang="${t.other}">${t.otherLabel}</a></header>
<main>${body}</main>
<footer class="foot">
<p>${esc(t.disclaimer)}</p>
<p><a href="${abs(homePath(L))}">${esc(t.home)}</a> · ${esc(t.updated)} ${esc(dLong(L, now.toISOString()))}${hasMarker() ? "" : esc(t.untracked)}</p>
</footer>
</body>
</html>`;
}

const priceBadge = (L, p, rt) => p == null
  ? `<span class="price na">${esc(T[L].toVerify)}</span>`
  : `<span class="price">${esc(T[L].from)} ${euro(p)}€${rt ? ` <small>A/R</small>` : ""}</span>`;
const tripLabel = (L, r) => (r.roundTrip ? T[L].ar : T[L].oneLeg);

function ctaButtons(L, r) {
  const f = flightLink(r.origin, r.dest, r.departDate, r.returnDate);
  const h = hotelLink(cityName(L, r));
  return `<div class="cta">
  <a class="btn btn-primary" href="${esc(f)}" rel="sponsored nofollow" target="_blank">${esc(T[L].seeFlights(r.originCity, cityName(L, r)))}</a>
  <a class="btn btn-ghost" href="${esc(h)}" rel="sponsored nofollow" target="_blank">${esc(T[L].hotels(cityName(L, r)))}</a>
</div>`;
}

function routeCard(L, r) {
  const badge = priceBadge(L, r.priceFrom, r.roundTrip);
  const img = hasPhoto(r.dest)
    ? `<span class="card-img" style="background-image:url('${photoUrl(r.dest)}')">${badge}</span>`
    : `<span class="card-img card-img-ph">${badge}</span>`;
  return `<a class="card" href="${abs(routePath(L, r))}">
  ${img}
  <span class="card-body">
    <span class="card-city">${esc(cityName(L, r))}</span>
    <span class="card-country">${esc(countryName(L, r))}</span>
    <span class="card-from">${esc(T[L].since)} ${esc(r.originCity)}${r.departDate ? ` · ${esc(T[L].eg)} ${esc(dShort(L, r.departDate))}` : ""}</span>
  </span>
</a>`;
}

const heroBg = (iata) => hasPhoto(iata)
  ? ` style="background-image:linear-gradient(135deg,rgba(23,42,105,.86),rgba(37,99,235,.66)),url('${photoUrl(iata)}');background-size:cover;background-position:center"`
  : "";

function spread(all, n) {
  const priced = all.filter((r) => r.priceFrom != null).sort((a, b) => a.priceFrom - b.priceFrom);
  const seen = new Set(); const uniq = [];
  for (const r of priced) { if (seen.has(r.dest)) continue; seen.add(r.dest); uniq.push(r); }
  const ranges = [[0, 15], [16, 20], [21, 28], [29, 40], [41, 60], [61, 1e9]];
  const per = Math.ceil(n / ranges.length);
  const buckets = ranges.map(([lo, hi]) => uniq.filter((r) => r.priceFrom >= lo && r.priceFrom <= hi).slice(0, per));
  const out = [];
  for (let i = 0; i < per; i++) for (const b of buckets) if (b[i]) out.push(b[i]);
  return out.slice(0, n);
}

// --- reset site ------------------------------------------------------------
if (existsSync(SITE)) rmSync(SITE, { recursive: true, force: true });
mkdirSync(SITE, { recursive: true });

const routes = catalog.routes;
const byOrigin = new Map(), byDest = new Map();
for (const r of routes) {
  (byOrigin.get(r.origin) || byOrigin.set(r.origin, []).get(r.origin)).push(r);
  (byDest.get(r.dest) || byDest.set(r.dest, []).get(r.dest)).push(r);
}

// ======= GÉNÉRATION PAR LANGUE ============================================
for (const L of LOCALES) {
  const t = T[L];

  // --- PAGE ROUTE ---
  for (const r of routes) {
    const city = cityName(L, r), country = countryName(L, r);
    const title = t.routeTitle(r.originCity, city, r.priceFrom ? euro(r.priceFrom) : 0);
    const desc = t.routeDesc(r.originCity, city, country, r.priceFrom ? euro(r.priceFrom) : 0);
    const related = (byOrigin.get(r.origin) || []).filter((x) => x.dest !== r.dest).slice(0, 8);
    const otherOrigins = (byDest.get(r.dest) || []).filter((x) => x.origin !== r.origin);
    const season = blurbSeason(L, r.dest);
    const faq = [
      { q: t.faqQ1(r.originCity, city), a: t.faqA1(r.originCity, city, r.priceFrom ? euro(r.priceFrom) : 0, tripLabel(L, r)) },
      { q: t.faqQ2(city), a: t.faqA2(city, season) },
    ];
    const jsonld = { "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
    const bt = blurbText(L, r.dest), todo = blurbTodo(L, r.dest);
    const body = `
<nav class="crumbs"><a href="${abs(homePath(L))}">${esc(t.home)}</a> › <a href="${abs(departPath(L, r.origin))}">${esc(r.originCity)}</a> › ${esc(city)}</nav>
<section class="hero"${heroBg(r.dest)}>
  <h1>${esc(t.routeH1(r.originCity, city))}</h1>
  <p class="sub">${esc(country)} · ${esc(t.atDeparture)} ${esc(r.originName)} ${priceBadge(L, r.priceFrom, r.roundTrip)}</p>
  ${ctaButtons(L, r)}
</section>
${bt ? `<section class="prose"><h2>${esc(t.inBrief(city))}</h2><p>${esc(bt)}</p>
  ${todo.length ? `<ul class="todo">${todo.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
  ${season ? `<p class="meta">🗓️ ${esc(t.bestSeason)} : <strong>${esc(season)}</strong></p>` : ""}</section>` : ""}
<section class="prose">
  <h2>${esc(t.practical)}</h2>
  <table class="info"><tbody>
    <tr><td>${esc(t.dep)}</td><td>${esc(r.originName)} (${esc(r.origin)})</td></tr>
    <tr><td>${esc(t.arr)}</td><td>${esc(city)} (${esc(r.dest)})</td></tr>
    <tr><td>${esc(t.indicPrice)}</td><td>${r.priceFrom ? `${esc(t.from)} ${euro(r.priceFrom)}€ ${esc(tripLabel(L, r))}` : esc(t.verify)}</td></tr>
    ${r.departDate ? `<tr><td>${esc(t.egDates)}</td><td>${esc(dLong(L, r.departDate))}${r.returnDate ? ` → ${esc(dLong(L, r.returnDate))}` : ""}</td></tr>` : ""}
  </tbody></table>
</section>
<section class="prose"><h2>${esc(t.faqTitle)}</h2>
  ${faq.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join("")}
</section>
${otherOrigins.length ? `<section class="prose"><h2>${esc(t.otherDepartsTo(city))}</h2>
  <div class="grid">${otherOrigins.map((x) => routeCard(L, x)).join("")}</div></section>` : ""}
${related.length ? `<section class="prose"><h2>${esc(t.otherDealsFrom(r.originCity))}</h2>
  <div class="grid">${related.map((x) => routeCard(L, x)).join("")}</div></section>` : ""}`;
    write(routePath(L, r), layout(L, { path: routePath(L, r),
      altPath: { fr: routePath("fr", r), nl: routePath("nl", r) }, title, desc, body, jsonld,
      breadcrumb: [{ name: t.home, path: homePath(L) }, { name: r.originCity, path: departPath(L, r.origin) }, { name: city, path: routePath(L, r) }] }));
  }

  // --- PAGE DESTINATION ---
  for (const [dest, list] of byDest) {
    const r0 = list[0]; const city = cityName(L, r0); const country = countryName(L, r0);
    const bestRoute = list.filter((x) => x.priceFrom != null).sort((a, b) => a.priceFrom - b.priceFrom)[0];
    const best = bestRoute?.priceFrom ?? null;
    const bt = blurbText(L, dest);
    const body = `
<nav class="crumbs"><a href="${abs(homePath(L))}">${esc(t.home)}</a> › ${esc(city)}</nav>
<section class="hero"${heroBg(dest)}><h1>${esc(t.destH1(city))}</h1>
  <p class="sub">${esc(country)} ${best ? priceBadge(L, best, bestRoute.roundTrip) : ""}</p></section>
${bt ? `<section class="prose"><p>${esc(bt)}</p></section>` : ""}
<section class="prose"><h2>${esc(t.whichAirport)}</h2>
  <div class="grid">${list.slice().sort((a, b) => (a.priceFrom ?? 9e9) - (b.priceFrom ?? 9e9)).map((x) => routeCard(L, x)).join("")}</div></section>`;
    write(destPath(L, r0), layout(L, { path: destPath(L, r0),
      altPath: { fr: destPath("fr", r0), nl: destPath("nl", r0) },
      title: t.destTitle(city, best ? euro(best) : 0), desc: t.destDesc(city, country, best ? euro(best) : 0), body,
      breadcrumb: [{ name: t.home, path: homePath(L) }, { name: city, path: destPath(L, r0) }] }));
  }

  // --- PAGE DÉPART ---
  for (const [origin, list] of byOrigin) {
    const A = AIRPORTS[origin];
    const sorted = list.slice().sort((a, b) => (a.priceFrom ?? 9e9) - (b.priceFrom ?? 9e9));
    const best = sorted.find((x) => x.priceFrom != null)?.priceFrom;
    const oHero = sorted.find((x) => hasPhoto(x.dest))?.dest;
    const body = `
<nav class="crumbs"><a href="${abs(homePath(L))}">${esc(t.home)}</a> › ${esc(A.city)}</nav>
<section class="hero"${oHero ? heroBg(oHero) : ""}><h1>${esc(t.departH1(A.city))}</h1>
  <p class="sub">${esc(A.name)} · ${list.length} ${esc(t.destinations)}</p></section>
<section class="prose"><div class="grid">${sorted.map((x) => routeCard(L, x)).join("")}</div></section>`;
    write(departPath(L, origin), layout(L, { path: departPath(L, origin),
      altPath: { fr: departPath("fr", origin), nl: departPath("nl", origin) },
      title: t.departTitle(A.city, best ? euro(best) : 0), desc: t.departDesc(A.name, list.length, best ? euro(best) : 0), body,
      breadcrumb: [{ name: t.home, path: homePath(L) }, { name: A.city, path: departPath(L, origin) }] }));
  }

  // --- ACCUEIL ---
  {
    const deals = spread(routes, 48);
    const origins = [...byOrigin.keys()];
    const best = deals[0]?.priceFrom;
    const heroCity = deals.find((d) => hasPhoto(d.dest))?.dest;
    const body = `
<section class="hero hero-home"${heroCity ? heroBg(heroCity) : ""}>
  <h1>${esc(t.homeH1)}</h1>
  <p class="sub">${esc(t.homeSub(routes.length))}</p>
  <div class="origins">${origins.map((o) => `<a class="chip" href="${abs(departPath(L, o))}">${esc(AIRPORTS[o].city)}</a>`).join("")}</div>
</section>
<section class="prose"><h2>${esc(t.bestNow)}</h2>
  <div class="grid">${deals.map((x) => routeCard(L, x)).join("")}</div></section>
<section class="prose"><h2>${esc(t.howTitle)}</h2><p>${esc(t.how)}</p></section>`;
    write(homePath(L), layout(L, { path: homePath(L),
      altPath: { fr: homePath("fr"), nl: homePath("nl") },
      title: t.homeTitle(best ? euro(best) : 0), desc: t.homeDesc(routes.length), body,
      breadcrumb: [{ name: t.home, path: homePath(L) }] }));
  }
}

// ======= fichiers racine ===================================================
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${[...urls].map((u) =>
  `<url><loc>${u}</loc><lastmod>${now.toISOString().slice(0, 10)}</lastmod></url>`).join("")}</urlset>`;
writeFileSync(join(SITE, "sitemap.xml"), sitemap);
writeFileSync(join(SITE, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);
writeFileSync(join(SITE, ".nojekyll"), "");
// clé IndexNow (ping moteurs à chaque déploiement, via le workflow)
const IKEY = process.env.INDEXNOW_KEY || "";
if (IKEY) writeFileSync(join(SITE, `${IKEY}.txt`), IKEY);
if (existsSync(IMGDIR)) {
  const dst = join(SITE, "img"); mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const f of readdirSync(IMGDIR)) if (f.endsWith(".jpg")) { copyFileSync(join(IMGDIR, f), join(dst, f)); n++; }
  // image de partage social : réutilise une belle photo
  const og = readdirSync(dst).find((f) => f.endsWith(".jpg"));
  if (og) copyFileSync(join(dst, og), join(SITE, "og.jpg"));
  console.log(`Photos copiées : ${n}`);
}
if (process.env.SITE_DOMAIN) writeFileSync(join(SITE, "CNAME"), process.env.SITE_DOMAIN.trim() + "\n");
writeFileSync(join(SITE, "style.css"), CSS());

console.log(`Site généré : ${urls.size} pages (FR+NL) dans site/`);
console.log(`Base URL : ${BASE}${GA ? " · GA actif" : ""}`);

function CSS() { return `
:root{--bg:#0b1020;--ink:#0b1020;--muted:#5b6478;--line:#e6e8ef;--brand:#2563eb;--green:#059669;--card:#fff}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:var(--ink);background:#f6f7fb;line-height:1.55}
a{color:var(--brand);text-decoration:none}
.nav{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:14px 20px;background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
.brand{font-weight:800;font-size:20px;color:var(--ink)}
.tag{color:var(--muted);font-size:13px}
.lang{margin-left:auto;border:1px solid var(--line);border-radius:8px;padding:5px 12px;font-weight:700;font-size:13px;color:var(--brand)}
.lang:hover{background:#eef2ff}
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
.price small{font-weight:700;opacity:.7;font-size:.72em;letter-spacing:.3px}
.btn{display:inline-block;padding:13px 18px;border-radius:12px;font-weight:700;font-size:15px}
.btn-primary{background:#fff;color:var(--brand)}
.btn-ghost{background:rgba(255,255,255,.14);color:#fff;border:1px solid rgba(255,255,255,.5)}
.btn:hover{transform:translateY(-1px)}
.prose{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:22px 24px;margin:16px 0}
.prose h2{margin:0 0 14px;font-size:21px}
.prose p{margin:0 0 10px}
.todo{margin:6px 0 10px;padding-left:20px}
.meta{color:var(--muted)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:16px}
.card{display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);border-radius:16px;overflow:hidden;transition:.15s}
.card:hover{border-color:var(--brand);box-shadow:0 12px 30px rgba(37,99,235,.16);transform:translateY(-3px)}
.card-img{position:relative;display:block;height:130px;background-size:cover;background-position:center;background-color:#dde3ef}
.card-img-ph{background:linear-gradient(135deg,#c7d2fe,#93c5fd)}
.card-img .price{position:absolute;left:10px;bottom:10px;margin:0;box-shadow:0 4px 14px rgba(0,0,0,.25)}
.card-body{display:flex;flex-direction:column;gap:1px;padding:12px 14px 14px}
.card-city{font-weight:800;font-size:17px;color:var(--ink)}
.card-country{color:var(--muted);font-size:13px}
.card-from{color:var(--muted);font-size:12px;margin-top:3px}
table.info{width:100%;border-collapse:collapse}
table.info td{padding:9px 6px;border-bottom:1px solid var(--line);font-size:15px}
table.info td:first-child{color:var(--muted);width:42%}
details{border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin-bottom:8px}
summary{font-weight:600;cursor:pointer}
details p{margin:8px 0 0;color:#333}
.foot{max-width:980px;margin:30px auto;padding:20px;color:var(--muted);font-size:13px;border-top:1px solid var(--line)}
@media(max-width:560px){.hero h1{font-size:24px}.btn{width:100%;text-align:center}.lang{margin-left:0}}
`; }
