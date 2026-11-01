// Aéroports d'origine (bases Ryanair accessibles au public francophone).
// Ajouter une ligne = un nouvel aéroport de départ => des dizaines de pages en plus.
export const AIRPORTS = {
  CRL: { name: "Bruxelles-Charleroi", city: "Charleroi", slug: "charleroi", market: "fr-be", lang: "fr" },
  BVA: { name: "Paris-Beauvais",       city: "Paris",     slug: "paris-beauvais", market: "fr-fr", lang: "fr" },
  LIL: { name: "Lille",                city: "Lille",     slug: "lille",     market: "fr-fr", lang: "fr" },
  LUX: { name: "Luxembourg",           city: "Luxembourg", slug: "luxembourg", market: "fr-fr", lang: "fr" },
  EIN: { name: "Eindhoven",            city: "Eindhoven", slug: "eindhoven", market: "nl-nl", lang: "fr" },
  NRN: { name: "Weeze (Düsseldorf)",   city: "Weeze",     slug: "weeze",     market: "de-de", lang: "fr" },
};

export const ORIGIN_CODES = Object.keys(AIRPORTS);
