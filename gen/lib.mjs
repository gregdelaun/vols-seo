// Helpers partagés : liens affiliés Travelpayouts, slugs, échappement HTML.
const MARKER = process.env.TRAVELPAYOUTS_MARKER || "";

// Slug propre pour les URLs (sans accents ni caractères spéciaux).
export const slugify = (s) =>
  (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Échappement HTML (texte injecté dans les pages).
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const ddmm = (iso) => { if (!iso) return ""; const [, m, d] = iso.split("-"); return d + m; };

// Lien de recherche de vol Aviasales (tracké). path = ORIGIN+DDMMaller+DEST+DDMMretour+pax
// sub = SubID Travelpayouts (rapport « Group by SubID ») : d'où vient le clic — site, tg (Telegram), yt (YouTube)
export function flightLink(origin, dest, depart, retour, sub = "site") {
  const path = retour
    ? `${origin}${ddmm(depart)}${dest}${ddmm(retour)}1`
    : `${origin}${ddmm(depart)}${dest}1`;
  const qs = new URLSearchParams({ currency: "eur" });
  const url = `https://www.aviasales.com/search/${path}?${qs}`;
  if (!MARKER) return url;
  // Redirection officielle Travelpayouts (p=4114 / campaign_id=100 = Aviasales) : c'est elle qui COMPTE le clic
  // dans le tableau de bord ; un lien direct aviasales.com?marker= attribue la réservation mais affiche 0 clic.
  return `https://tp.media/r?${new URLSearchParams({ marker: `${MARKER}.${sub}`, trs: "594223", p: "4114", u: url, campaign_id: "100" })}`;
}

// Lien de recherche d'hôtels Hotellook (tracké).
export function hotelLink(city, sub = "site") {
  const base = `https://search.hotellook.com/?destination=${encodeURIComponent(city)}`;
  return MARKER ? `${base}&marker=${MARKER}.${sub}` : base;
}

export const hasMarker = () => Boolean(MARKER);

export const euro = (n) => (n == null ? null : Math.round(n));

export const frDate = (iso) =>
  iso ? new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso)) : "";

export const frShort = (iso) =>
  iso ? new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short" }).format(new Date(iso)) : "";
