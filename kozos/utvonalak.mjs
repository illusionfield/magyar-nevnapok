/**
 * kozos/utvonalak.mjs
 * A projekt elsődleges bemeneti és kimeneti útvonalai.
 */

import path from "node:path";

const gyoker = process.cwd();

export const kanonikusUtvonalak = {
  helyi: {
    nevnapokKonfig: path.join(gyoker, ".local", "nevnapok.local.yaml"),
    primerFelulirasokLegacy: path.join(gyoker, ".local", "primary-registry-overrides.local.yaml"),
  },
  kezi: {
    legacyIcs: path.join(gyoker, "data", "nevnapok_tisztitott_regi_nevkeszlet.ics"),
    primerFelulirasok: path.join(gyoker, "data", "primary-registry-overrides.yaml"),
    primerFelulirasokHelyi: path.join(gyoker, "data", "primary-registry-overrides.local.yaml"),
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
  exportok: {
    csv: path.join(gyoker, "output", "adatbazis", "nevnapok.csv"),
    excel: path.join(gyoker, "output", "adatbazis", "nevnapok.xlsx"),
  },
  naptar: {
    alap: path.join(gyoker, "output", "naptar", "nevnapok.ics"),
    sajat: path.join(gyoker, "output", "naptar", "nevnapok-sajat.ics"),
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
    primerNelkulMaradoNevek: path.join(
      gyoker,
      "output",
      "riportok",
      "primer-nelkul-marado-nevek-riport.yaml"
    ),
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

/**
 * A `gyokerKonyvtar` visszaadja az aktuális projektgyökeret.
 */
export function gyokerKonyvtar() {
  return gyoker;
}

/**
 * A `feloldProjektUtvonal` a projektgyökérből képez abszolút útvonalat.
 */
export function feloldProjektUtvonal(...szakaszok) {
  return path.join(gyoker, ...szakaszok);
}
