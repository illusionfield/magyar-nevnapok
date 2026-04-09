// kozos/utvonalak.mjs
// A projekt kanonikus bemeneti és kimeneti útvonalai.

import path from "node:path";

const gyoker = process.cwd();

export const kanonikusUtvonalak = {
  kezi: {
    legacyIcs: path.join(gyoker, "data", "nevnapok_tisztitott_regi_nevkeszlet.ics"),
    primerFelulirasok: path.join(gyoker, "data", "primary-registry-overrides.yaml"),
    hivatalosNevjegyzekKivetelek: path.join(
      gyoker,
      "data",
      "hivatalos-nevjegyzek-kivetelek.yaml"
    ),
  },
  primer: {
    legacy: path.join(gyoker, "output", "primer", "legacy-primer.yaml"),
    wiki: path.join(gyoker, "output", "primer", "wiki-primer.yaml"),
    vegso: path.join(gyoker, "output", "primer", "vegso-primer.yaml"),
    normalizaloRiport: path.join(gyoker, "output", "primer", "normalizalo-riport.yaml"),
  },
  adatbazis: {
    nevnapok: path.join(gyoker, "output", "adatbazis", "nevnapok.yaml"),
    formalizaltElek: path.join(gyoker, "output", "adatbazis", "formalizalt-elek.yaml"),
  },
  naptar: {
    alap: path.join(gyoker, "output", "naptar", "nevnapok.ics"),
    appleKompat: path.join(gyoker, "output", "naptar", "apple-calendar-compat"),
  },
  riportok: {
    legacyPrimer: path.join(gyoker, "output", "riportok", "legacy-primer-osszevetes.yaml"),
    wikiVsLegacy: path.join(gyoker, "output", "riportok", "wiki-vs-legacy.yaml"),
    primerNormalizalo: path.join(
      gyoker,
      "output",
      "riportok",
      "primer-normalizalo-osszevetes.yaml"
    ),
    vegsoPrimer: path.join(gyoker, "output", "riportok", "vegso-primer-riport.yaml"),
    hivatalosNevjegyzek: path.join(
      gyoker,
      "output",
      "riportok",
      "hivatalos-nevjegyzek-riport.yaml"
    ),
  },
  pipeline: {
    manifest: path.join(gyoker, "output", "pipeline", "manifest.yaml"),
  },
};

export function gyokerKonyvtar() {
  return gyoker;
}

export function feloldProjektUtvonal(...szakaszok) {
  return path.join(gyoker, ...szakaszok);
}

