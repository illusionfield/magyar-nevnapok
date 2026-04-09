/**
 * pipeline/lepesek.mjs
 * Az elsődleges pipeline lépésregisztere és futtató segédei.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { futtatNodeFolyamat } from "../kozos/parancs-futtatas.mjs";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../kozos/utvonalak.mjs";
import { rogzitManifestLepes } from "./manifest.mjs";

const aktualisKonyvtar = path.dirname(fileURLToPath(import.meta.url));

/**
 * A `modulUtvonal` a modul relatív útvonalát abszolút projektútvonallá alakítja.
 */
function modulUtvonal(relativ) {
  return path.resolve(aktualisKonyvtar, "..", relativ);
}

/**
 * Az `exportalJsonValtozatokat` opcionális JSON testvérfájlokat készít a YAML artifactok mellé.
 */
async function exportalJsonValtozatokat(outputok = [], formatum = "yaml") {
  if (formatum !== "json") {
    return [];
  }

  const letrehozott = [];

  for (const kimenet of outputok) {
    if (!kimenet.endsWith(".yaml") && !kimenet.endsWith(".yml")) {
      continue;
    }

    const adat = await betoltStrukturaltFajl(kimenet);
    const jsonUtvonal = kimenet.replace(/\.(yaml|yml)$/u, ".json");
    await mentStrukturaltFajl(jsonUtvonal, adat, "json");
    letrehozott.push(jsonUtvonal);
  }

  return letrehozott;
}

/**
 * A `futtatLepest` lefuttat egy worker modult és rögzíti az eredményét a manifestben.
 */
async function futtatLepest({ stepId, modul, argumentumok, inputs, outputs, formatum }) {
  const kezdes = Date.now();

  try {
    await futtatNodeFolyamat(modulUtvonal(modul), argumentumok, {
      tukrozzStdout: true,
      tukrozzStderr: true,
    });

    const exportalt = await exportalJsonValtozatokat(outputs, formatum);
    const durationMs = Date.now() - kezdes;
    await rogzitManifestLepes({
      stepId,
      status: "sikeres",
      inputs,
      outputs: [...outputs, ...exportalt],
      durationMs,
      error: null,
    });

    return {
      stepId,
      outputs: [...outputs, ...exportalt],
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - kezdes;
    await rogzitManifestLepes({
      stepId,
      status: "hiba",
      inputs,
      outputs,
      durationMs,
      error: error.message,
    });
    throw error;
  }
}

/**
 * A `futtatAuditokat` sorban lefuttatja az összes fő auditmodult.
 */
async function futtatAuditokat(formatum = "yaml") {
  const futasok = [];

  futasok.push(
    await futtatLepest({
      stepId: "audit-hivatalos-nevjegyzek",
      modul: "domainek/auditok/hivatalos-nevjegyzek.mjs",
      argumentumok: [
        "--input",
        kanonikusUtvonalak.adatbazis.nevnapok,
        "--report",
        kanonikusUtvonalak.riportok.hivatalosNevjegyzek,
        "--exceptions",
        kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek,
      ],
      inputs: [
        kanonikusUtvonalak.adatbazis.nevnapok,
        kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek,
      ],
      outputs: [kanonikusUtvonalak.riportok.hivatalosNevjegyzek],
      formatum,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-legacy-primer",
      modul: "domainek/auditok/legacy-primer-osszevetes.mjs",
      argumentumok: [
        "--input",
        kanonikusUtvonalak.adatbazis.nevnapok,
        "--registry",
        kanonikusUtvonalak.primer.legacy,
        "--report",
        kanonikusUtvonalak.riportok.legacyPrimer,
      ],
      inputs: [kanonikusUtvonalak.adatbazis.nevnapok, kanonikusUtvonalak.primer.legacy],
      outputs: [kanonikusUtvonalak.riportok.legacyPrimer],
      formatum,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-wiki-vs-legacy",
      modul: "domainek/auditok/wiki-vs-legacy.mjs",
      argumentumok: [
        "--legacy",
        kanonikusUtvonalak.primer.legacy,
        "--wiki",
        kanonikusUtvonalak.primer.wiki,
        "--report",
        kanonikusUtvonalak.riportok.wikiVsLegacy,
      ],
      inputs: [kanonikusUtvonalak.primer.legacy, kanonikusUtvonalak.primer.wiki],
      outputs: [kanonikusUtvonalak.riportok.wikiVsLegacy],
      formatum,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-primer-normalizalo-alap",
      modul: "domainek/primer/normalizalo-riport.mjs",
      argumentumok: [
        "--input",
        kanonikusUtvonalak.adatbazis.nevnapok,
        "--diff",
        kanonikusUtvonalak.riportok.wikiVsLegacy,
        "--output",
        kanonikusUtvonalak.primer.normalizaloRiport,
      ],
      inputs: [kanonikusUtvonalak.adatbazis.nevnapok, kanonikusUtvonalak.riportok.wikiVsLegacy],
      outputs: [kanonikusUtvonalak.primer.normalizaloRiport],
      formatum,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-primer-normalizalo",
      modul: "domainek/auditok/primer-normalizalo-osszevetes.mjs",
      argumentumok: [
        "--normalized",
        kanonikusUtvonalak.primer.normalizaloRiport,
        "--legacy",
        kanonikusUtvonalak.primer.legacy,
        "--wiki",
        kanonikusUtvonalak.primer.wiki,
        "--report",
        kanonikusUtvonalak.riportok.primerNormalizalo,
      ],
      inputs: [
        kanonikusUtvonalak.primer.normalizaloRiport,
        kanonikusUtvonalak.primer.legacy,
        kanonikusUtvonalak.primer.wiki,
      ],
      outputs: [kanonikusUtvonalak.riportok.primerNormalizalo],
      formatum,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-vegso-primer",
      modul: "domainek/auditok/vegso-primer-riport.mjs",
      argumentumok: [
        "--final",
        kanonikusUtvonalak.primer.vegso,
        "--legacy",
        kanonikusUtvonalak.primer.legacy,
        "--wiki",
        kanonikusUtvonalak.primer.wiki,
        "--normalized",
        kanonikusUtvonalak.primer.normalizaloRiport,
        "--input",
        kanonikusUtvonalak.adatbazis.nevnapok,
        "--overrides",
        kanonikusUtvonalak.kezi.primerFelulirasok,
        "--report",
        kanonikusUtvonalak.riportok.vegsoPrimer,
      ],
      inputs: [
        kanonikusUtvonalak.primer.vegso,
        kanonikusUtvonalak.primer.legacy,
        kanonikusUtvonalak.primer.wiki,
        kanonikusUtvonalak.primer.normalizaloRiport,
        kanonikusUtvonalak.adatbazis.nevnapok,
        kanonikusUtvonalak.kezi.primerFelulirasok,
      ],
      outputs: [kanonikusUtvonalak.riportok.vegsoPrimer],
      formatum,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-primer-nelkul-marado-nevek",
      modul: "domainek/auditok/primer-nelkul-marado-nevek.mjs",
      argumentumok: [
        "--final",
        kanonikusUtvonalak.primer.vegso,
        "--normalized",
        kanonikusUtvonalak.primer.normalizaloRiport,
        "--input",
        kanonikusUtvonalak.adatbazis.nevnapok,
        "--report",
        kanonikusUtvonalak.riportok.primerNelkulMaradoNevek,
      ],
      inputs: [
        kanonikusUtvonalak.primer.vegso,
        kanonikusUtvonalak.primer.normalizaloRiport,
        kanonikusUtvonalak.adatbazis.nevnapok,
      ],
      outputs: [kanonikusUtvonalak.riportok.primerNelkulMaradoNevek],
      formatum,
    })
  );

  return futasok;
}

export const pipelineLepesek = [
  {
    azonosito: "legacy-primer-epites",
    leiras: "A régi ICS-ből felépíti a legacy primerjegyzéket.",
    bemenetek: [kanonikusUtvonalak.kezi.legacyIcs],
    kimenetek: [kanonikusUtvonalak.primer.legacy],
    dependsOn: [],
    futtat: (opciok = {}) =>
      futtatLepest({
        stepId: "legacy-primer-epites",
        modul: "domainek/primer/legacy-ics-atalakitas.mjs",
        argumentumok: [
          "--input",
          kanonikusUtvonalak.kezi.legacyIcs,
          "--output",
          kanonikusUtvonalak.primer.legacy,
        ],
        inputs: [kanonikusUtvonalak.kezi.legacyIcs],
        outputs: [kanonikusUtvonalak.primer.legacy],
        formatum: opciok.formatum ?? "yaml",
      }),
  },
  {
    azonosito: "wiki-primer-gyujtes",
    leiras: "A Wikipédia napi oldalairól kigyűjti a primer névnapokat.",
    bemenetek: [],
    kimenetek: [kanonikusUtvonalak.primer.wiki],
    dependsOn: [],
    futtat: (opciok = {}) =>
      futtatLepest({
        stepId: "wiki-primer-gyujtes",
        modul: "domainek/forrasok/wikipedia/munkafolyamat.mjs",
        argumentumok: ["--output", kanonikusUtvonalak.primer.wiki],
        inputs: [],
        outputs: [kanonikusUtvonalak.primer.wiki],
        formatum: opciok.formatum ?? "yaml",
      }),
  },
  {
    azonosito: "vegso-primer-feloldas",
    leiras: "Legacy, wiki és kézi felülírás alapján elkészíti a végső primerjegyzéket.",
    bemenetek: [
      kanonikusUtvonalak.primer.legacy,
      kanonikusUtvonalak.primer.wiki,
      kanonikusUtvonalak.kezi.primerFelulirasok,
    ],
    kimenetek: [kanonikusUtvonalak.primer.vegso],
    dependsOn: ["legacy-primer-epites", "wiki-primer-gyujtes"],
    futtat: (opciok = {}) =>
      futtatLepest({
        stepId: "vegso-primer-feloldas",
        modul: "domainek/primer/vegso-primer-epites.mjs",
        argumentumok: [
          "--legacy",
          kanonikusUtvonalak.primer.legacy,
          "--wiki",
          kanonikusUtvonalak.primer.wiki,
          "--overrides",
          kanonikusUtvonalak.kezi.primerFelulirasok,
          "--output",
          kanonikusUtvonalak.primer.vegso,
        ],
        inputs: [
          kanonikusUtvonalak.primer.legacy,
          kanonikusUtvonalak.primer.wiki,
          kanonikusUtvonalak.kezi.primerFelulirasok,
        ],
        outputs: [kanonikusUtvonalak.primer.vegso],
        formatum: opciok.formatum ?? "yaml",
      }),
  },
  {
    azonosito: "portal-nevadatbazis-epites",
    leiras: "A HUN-REN portálról felépíti a teljes névadatbázist.",
    bemenetek: [kanonikusUtvonalak.primer.vegso, kanonikusUtvonalak.primer.legacy],
    kimenetek: [kanonikusUtvonalak.adatbazis.nevnapok],
    dependsOn: ["vegso-primer-feloldas"],
    futtat: (opciok = {}) =>
      futtatLepest({
        stepId: "portal-nevadatbazis-epites",
        modul: "domainek/forrasok/hunren-portal/munkafolyamat.mjs",
        argumentumok: [
          "--primary-registry",
          kanonikusUtvonalak.primer.vegso,
          "--legacy-primary-registry",
          kanonikusUtvonalak.primer.legacy,
          "--output",
          kanonikusUtvonalak.adatbazis.nevnapok,
        ],
        inputs: [kanonikusUtvonalak.primer.vegso, kanonikusUtvonalak.primer.legacy],
        outputs: [kanonikusUtvonalak.adatbazis.nevnapok],
        formatum: opciok.formatum ?? "yaml",
      }),
  },
  {
    azonosito: "formalizalt-elek-generalasa",
    leiras: "A formalizált eredetleírásból él-listát készít.",
    bemenetek: [kanonikusUtvonalak.adatbazis.nevnapok],
    kimenetek: [kanonikusUtvonalak.adatbazis.formalizaltElek],
    dependsOn: ["portal-nevadatbazis-epites"],
    futtat: (opciok = {}) =>
      futtatLepest({
        stepId: "formalizalt-elek-generalasa",
        modul: "domainek/kapcsolatok/formalizalt-elek.mjs",
        argumentumok: [
          "--input",
          kanonikusUtvonalak.adatbazis.nevnapok,
          "--output",
          kanonikusUtvonalak.adatbazis.formalizaltElek,
        ],
        inputs: [kanonikusUtvonalak.adatbazis.nevnapok],
        outputs: [kanonikusUtvonalak.adatbazis.formalizaltElek],
        formatum: opciok.formatum ?? "yaml",
      }),
  },
  {
    azonosito: "naptar-generalas",
    leiras: "ICS naptárfájlokat generál az elsődleges adatbázisból.",
    bemenetek: [kanonikusUtvonalak.adatbazis.nevnapok],
    kimenetek: [kanonikusUtvonalak.naptar.alap],
    dependsOn: ["portal-nevadatbazis-epites"],
    futtat: (opciok = {}) =>
      futtatLepest({
        stepId: "naptar-generalas",
        modul: "domainek/naptar/ics-generalas.mjs",
        argumentumok: [
          "--input",
          kanonikusUtvonalak.adatbazis.nevnapok,
          "--output",
          kanonikusUtvonalak.naptar.alap,
        ],
        inputs: [kanonikusUtvonalak.adatbazis.nevnapok],
        outputs: [kanonikusUtvonalak.naptar.alap],
        formatum: opciok.formatum ?? "yaml",
      }),
  },
  {
    azonosito: "audit-futtatas",
    leiras: "Lefuttatja az összes fő auditot és riportot.",
    bemenetek: [
      kanonikusUtvonalak.adatbazis.nevnapok,
      kanonikusUtvonalak.primer.legacy,
      kanonikusUtvonalak.primer.wiki,
      kanonikusUtvonalak.primer.vegso,
      kanonikusUtvonalak.kezi.primerFelulirasok,
      kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek,
    ],
    kimenetek: [
      kanonikusUtvonalak.riportok.hivatalosNevjegyzek,
      kanonikusUtvonalak.riportok.legacyPrimer,
      kanonikusUtvonalak.riportok.wikiVsLegacy,
      kanonikusUtvonalak.primer.normalizaloRiport,
      kanonikusUtvonalak.riportok.primerNormalizalo,
      kanonikusUtvonalak.riportok.vegsoPrimer,
      kanonikusUtvonalak.riportok.primerNelkulMaradoNevek,
    ],
    dependsOn: ["vegso-primer-feloldas", "portal-nevadatbazis-epites"],
    futtat: (opciok = {}) => futtatAuditokat(opciok.formatum ?? "yaml"),
  },
];

/**
 * A `keresLepest` az azonosítója alapján visszaadja a pipeline-lépést.
 */
export function keresLepest(azonosito) {
  return pipelineLepesek.find((lep) => lep.azonosito === azonosito) ?? null;
}
