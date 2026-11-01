# VolsMalins — site SEO de vols pas chers (100% auto)

Site statique généré automatiquement : une page par route (origine → destination)
au départ des bases Ryanair accessibles depuis la Belgique et la frontière.
Trafic SEO → liens affiliés Travelpayouts (vols Aviasales + hôtels Hotellook).

## Comment ça marche
1. `gen/catalog.mjs` — récupère toutes les routes Ryanair + le prix réel "dès X€" par route (cache dans `data/catalog.json`).
2. `gen/blurbs.mjs` — génère un contenu éditorial **unique** par ville via Gemini (cache dans `data/blurbs.json`, jamais régénéré). C'est ce qui évite les pages "thin content" pénalisées par Google.
3. `gen/build.mjs` — génère le site statique dans `site/` : accueil, page par aéroport, page par route, page par destination, `sitemap.xml`, `robots.txt`.
4. GitHub Actions (`.github/workflows/deploy.yml`) refait tout chaque jour à 05:30 UTC et déploie sur GitHub Pages.

## Lancer en local
```bash
npm run all          # catalog + blurbs + build  (GEMINI_API_KEY + TRAVELPAYOUTS_MARKER requis)
npm run serve        # aperçu sur http://localhost:8099
```

## Secrets / variables GitHub
- Secret `GEMINI_API_KEY` — contenu éditorial.
- Secret `TRAVELPAYOUTS_MARKER` — tracking affilié (ex: 798969).
- Variable `SITE_BASE_URL` — URL canonique finale (ex: `https://volsmalins.be`). **Indispensable pour le SEO** (canoniques + sitemap).
- Variable `SITE_NAME` — nom affiché (ex: `VolsMalins`).

## À savoir (honnête)
- Le SEO met **3 à 6 mois** à ranker. Zéro revenu immédiat : c'est un actif qui se construit.
- Un **nom de domaine propre** (pas `github.io`) accélère beaucoup. ~10€/an.
- La pub display (Ezoic/Mediavine) ne devient intéressante qu'avec du trafic ; au début on monétise uniquement l'affiliation.
