/**
 * pipeline/lepesek.mjs
 * Az elsődleges pipeline lépésregisztere és futtató segédei.
 */

import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import { createConsoleReporter, withReporterConsole } from "../kozos/reporter.mjs";
import { kanonikusUtvonalak } from "../kozos/utvonalak.mjs";
import { futtatHivatalosNevjegyzekAuditot } from "../domainek/auditok/hivatalos-nevjegyzek.mjs";
import { futtatLegacyPrimerAuditot } from "../domainek/auditok/legacy-primer-osszevetes.mjs";
import { futtatPrimerAuditMunkafolyamat } from "../domainek/auditok/primer-audit.mjs";
import { futtatPrimerNormalizaloAuditot } from "../domainek/auditok/primer-normalizalo-osszevetes.mjs";
import { futtatWikiVsLegacyAuditot } from "../domainek/auditok/wiki-vs-legacy.mjs";
import { futtatHunrenNevadatbazisEpiteset } from "../domainek/forrasok/hunren-portal/munkafolyamat.mjs";
import { futtatWikipediaPrimerGyujtest } from "../domainek/forrasok/wikipedia/munkafolyamat.mjs";
import { futtatFormalizaltElekGeneralasat } from "../domainek/kapcsolatok/formalizalt-elek.mjs";
import { generalIcsKimeneteket } from "../domainek/naptar/ics-generalas.mjs";
import { futtatLegacyPrimerEpiteset } from "../domainek/primer/legacy-ics-atalakitas.mjs";
import { futtatPrimerNormalizaloRiportot } from "../domainek/primer/normalizalo-riport.mjs";
import { futtatVegsoPrimerEpiteset } from "../domainek/primer/vegso-primer-epites.mjs";
import { rogzitManifestLepes } from "./manifest.mjs";

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

function resolveReporter(opciok = {}) {
  return opciok.reporter ?? createConsoleReporter();
}

/**
 * A `futtatLepest` lefuttat egy in-process worker műveletet és rögzíti az eredményét a manifestben.
 */
async function futtatLepest({ stepId, vegrehajt, inputs, outputs, formatum, reporter }) {
  const kezdes = Date.now();

  try {
    await withReporterConsole(reporter, () => vegrehajt());

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
async function futtatAuditokat(opciok = {}) {
  const reporter = resolveReporter(opciok);
  const formatum = opciok.formatum ?? "yaml";
  const futasok = [];

  futasok.push(
    await futtatLepest({
      stepId: "audit-hivatalos-nevjegyzek",
      vegrehajt: () =>
        futtatHivatalosNevjegyzekAuditot({
          input: kanonikusUtvonalak.adatbazis.nevnapok,
          report: kanonikusUtvonalak.riportok.hivatalosNevjegyzek,
          exceptions: kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek,
        }),
      inputs: [
        kanonikusUtvonalak.adatbazis.nevnapok,
        kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek,
      ],
      outputs: [kanonikusUtvonalak.riportok.hivatalosNevjegyzek],
      formatum,
      reporter,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-legacy-primer",
      vegrehajt: () =>
        futtatLegacyPrimerAuditot({
          input: kanonikusUtvonalak.adatbazis.nevnapok,
          registry: kanonikusUtvonalak.primer.legacy,
          report: kanonikusUtvonalak.riportok.legacyPrimer,
        }),
      inputs: [kanonikusUtvonalak.adatbazis.nevnapok, kanonikusUtvonalak.primer.legacy],
      outputs: [kanonikusUtvonalak.riportok.legacyPrimer],
      formatum,
      reporter,
    })
  );

  return futasok;
}

async function futtatPrimerAuditFrissitest(opciok = {}) {
  const reporter = resolveReporter(opciok);
  const formatum = opciok.formatum ?? "yaml";
  const futasok = [];

  futasok.push(
    await futtatLepest({
      stepId: "audit-wiki-vs-legacy",
      vegrehajt: () =>
        futtatWikiVsLegacyAuditot({
          legacy: kanonikusUtvonalak.primer.legacy,
          wiki: kanonikusUtvonalak.primer.wiki,
          report: kanonikusUtvonalak.riportok.wikiVsLegacy,
        }),
      inputs: [kanonikusUtvonalak.primer.legacy, kanonikusUtvonalak.primer.wiki],
      outputs: [kanonikusUtvonalak.riportok.wikiVsLegacy],
      formatum,
      reporter,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-primer-normalizalo-alap",
      vegrehajt: () =>
        futtatPrimerNormalizaloRiportot({
          input: kanonikusUtvonalak.adatbazis.nevnapok,
          diff: kanonikusUtvonalak.riportok.wikiVsLegacy,
          output: kanonikusUtvonalak.primer.normalizaloRiport,
        }),
      inputs: [kanonikusUtvonalak.adatbazis.nevnapok, kanonikusUtvonalak.riportok.wikiVsLegacy],
      outputs: [kanonikusUtvonalak.primer.normalizaloRiport],
      formatum,
      reporter,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-primer-normalizalo",
      vegrehajt: () =>
        futtatPrimerNormalizaloAuditot({
          normalized: kanonikusUtvonalak.primer.normalizaloRiport,
          legacy: kanonikusUtvonalak.primer.legacy,
          wiki: kanonikusUtvonalak.primer.wiki,
          report: kanonikusUtvonalak.riportok.primerNormalizalo,
        }),
      inputs: [
        kanonikusUtvonalak.primer.normalizaloRiport,
        kanonikusUtvonalak.primer.legacy,
        kanonikusUtvonalak.primer.wiki,
      ],
      outputs: [kanonikusUtvonalak.riportok.primerNormalizalo],
      formatum,
      reporter,
    })
  );

  futasok.push(
    await futtatLepest({
      stepId: "audit-primer-audit",
      vegrehajt: () =>
        futtatPrimerAuditMunkafolyamat({
          final: kanonikusUtvonalak.primer.vegso,
          legacy: kanonikusUtvonalak.primer.legacy,
          wiki: kanonikusUtvonalak.primer.wiki,
          normalized: kanonikusUtvonalak.primer.normalizaloRiport,
          input: kanonikusUtvonalak.adatbazis.nevnapok,
          overrides: kanonikusUtvonalak.kezi.primerFelulirasok,
          local: kanonikusUtvonalak.helyi.nevnapokKonfig,
          report: kanonikusUtvonalak.riportok.primerAudit,
        }),
      inputs: [
        kanonikusUtvonalak.primer.vegso,
        kanonikusUtvonalak.primer.legacy,
        kanonikusUtvonalak.primer.wiki,
        kanonikusUtvonalak.primer.normalizaloRiport,
        kanonikusUtvonalak.adatbazis.nevnapok,
        kanonikusUtvonalak.kezi.primerFelulirasok,
        kanonikusUtvonalak.helyi.nevnapokKonfig,
      ],
      outputs: [kanonikusUtvonalak.riportok.primerAudit],
      formatum,
      reporter,
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
        vegrehajt: () =>
          futtatLegacyPrimerEpiteset({
            input: kanonikusUtvonalak.kezi.legacyIcs,
            output: kanonikusUtvonalak.primer.legacy,
          }),
        inputs: [kanonikusUtvonalak.kezi.legacyIcs],
        outputs: [kanonikusUtvonalak.primer.legacy],
        formatum: opciok.formatum ?? "yaml",
        reporter: resolveReporter(opciok),
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
        vegrehajt: () =>
          futtatWikipediaPrimerGyujtest({
            output: kanonikusUtvonalak.primer.wiki,
          }),
        inputs: [],
        outputs: [kanonikusUtvonalak.primer.wiki],
        formatum: opciok.formatum ?? "yaml",
        reporter: resolveReporter(opciok),
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
        vegrehajt: () =>
          futtatVegsoPrimerEpiteset({
            legacy: kanonikusUtvonalak.primer.legacy,
            wiki: kanonikusUtvonalak.primer.wiki,
            overrides: kanonikusUtvonalak.kezi.primerFelulirasok,
            output: kanonikusUtvonalak.primer.vegso,
          }),
        inputs: [
          kanonikusUtvonalak.primer.legacy,
          kanonikusUtvonalak.primer.wiki,
          kanonikusUtvonalak.kezi.primerFelulirasok,
        ],
        outputs: [kanonikusUtvonalak.primer.vegso],
        formatum: opciok.formatum ?? "yaml",
        reporter: resolveReporter(opciok),
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
        vegrehajt: () =>
          futtatHunrenNevadatbazisEpiteset({
            primaryRegistry: kanonikusUtvonalak.primer.vegso,
            legacyPrimaryRegistry: kanonikusUtvonalak.primer.legacy,
            output: kanonikusUtvonalak.adatbazis.nevnapok,
          }),
        inputs: [kanonikusUtvonalak.primer.vegso, kanonikusUtvonalak.primer.legacy],
        outputs: [kanonikusUtvonalak.adatbazis.nevnapok],
        formatum: opciok.formatum ?? "yaml",
        reporter: resolveReporter(opciok),
      }),
  },
  {
    azonosito: "primer-audit-frissites",
    leiras: "Frissíti az egységes primer audit előfeltételeit és a primer audit riportot.",
    bemenetek: [
      kanonikusUtvonalak.primer.legacy,
      kanonikusUtvonalak.primer.wiki,
      kanonikusUtvonalak.primer.vegso,
      kanonikusUtvonalak.adatbazis.nevnapok,
      kanonikusUtvonalak.kezi.primerFelulirasok,
    ],
    kimenetek: [
      kanonikusUtvonalak.riportok.wikiVsLegacy,
      kanonikusUtvonalak.primer.normalizaloRiport,
      kanonikusUtvonalak.riportok.primerNormalizalo,
      kanonikusUtvonalak.riportok.primerAudit,
    ],
    dependsOn: ["vegso-primer-feloldas", "portal-nevadatbazis-epites"],
    futtat: (opciok = {}) => futtatPrimerAuditFrissitest(opciok),
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
        vegrehajt: () =>
          futtatFormalizaltElekGeneralasat({
            input: kanonikusUtvonalak.adatbazis.nevnapok,
            output: kanonikusUtvonalak.adatbazis.formalizaltElek,
          }),
        inputs: [kanonikusUtvonalak.adatbazis.nevnapok],
        outputs: [kanonikusUtvonalak.adatbazis.formalizaltElek],
        formatum: opciok.formatum ?? "yaml",
        reporter: resolveReporter(opciok),
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
        vegrehajt: () =>
          generalIcsKimeneteket({
            input: kanonikusUtvonalak.adatbazis.nevnapok,
            output: kanonikusUtvonalak.naptar.alap,
          }),
        inputs: [kanonikusUtvonalak.adatbazis.nevnapok],
        outputs: [kanonikusUtvonalak.naptar.alap],
        formatum: opciok.formatum ?? "yaml",
        reporter: resolveReporter(opciok),
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
      kanonikusUtvonalak.riportok.primerAudit,
    ],
    dependsOn: ["primer-audit-frissites"],
    futtat: (opciok = {}) => futtatAuditokat(opciok),
  },
];

/**
 * A `keresLepest` az azonosítója alapján visszaadja a pipeline-lépést.
 */
export function keresLepest(azonosito) {
  return pipelineLepesek.find((lep) => lep.azonosito === azonosito) ?? null;
}
