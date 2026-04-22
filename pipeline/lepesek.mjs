/**
 * pipeline/lepesek.mjs
 * Az elsődleges pipeline konkrét lépései és futtatható admin csoportjai.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import { createConsoleReporter, withReporterConsole } from "../kozos/reporter.mjs";
import { kanonikusUtvonalak } from "../kozos/utvonalak.mjs";
import { futtatHivatalosNevjegyzekAuditot } from "../domainek/auditok/hivatalos-nevjegyzek.mjs";
import { futtatLegacyPrimerAuditot } from "../domainek/auditok/legacy-primer-osszevetes.mjs";
import { futtatPrimerAuditMunkafolyamat } from "../domainek/auditok/primer-audit.mjs";
import { futtatPrimerNormalizaloAuditot } from "../domainek/auditok/primer-normalizalo-osszevetes.mjs";
import { buildPrimaryNelkulMaradoNevekRiport } from "../domainek/auditok/primer-nelkul-marado-nevek.mjs";
import { buildFinalPrimaryRegistryReport } from "../domainek/auditok/vegso-primer-riport.mjs";
import { futtatWikiVsLegacyAuditot } from "../domainek/auditok/wiki-vs-legacy.mjs";
import { futtatHunrenNevadatbazisEpiteset } from "../domainek/forrasok/hunren-portal/munkafolyamat.mjs";
import { futtatWikipediaPrimerGyujtest } from "../domainek/forrasok/wikipedia/munkafolyamat.mjs";
import { futtatFormalizaltElekGeneralasat } from "../domainek/kapcsolatok/formalizalt-elek.mjs";
import {
  DEFAULT_FINAL_PRIMARY_REGISTRY_PATH,
  DEFAULT_PRIMARY_REGISTRY_OVERRIDES_PATH,
  DEFAULT_WIKI_PRIMARY_REGISTRY_PATH,
  DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH,
  loadPrimaryRegistry,
  loadPrimaryRegistryOverrides,
} from "../domainek/primer/alap.mjs";
import { futtatLegacyPrimerEpiteset } from "../domainek/primer/legacy-ics-atalakitas.mjs";
import { futtatPrimerNormalizaloRiportot } from "../domainek/primer/normalizalo-riport.mjs";
import { futtatVegsoPrimerEpiteset } from "../domainek/primer/vegso-primer-epites.mjs";
import { rogzitManifestLepes } from "./manifest.mjs";

function resolveReporter(opciok = {}) {
  return opciok.reporter ?? createConsoleReporter();
}

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

async function futtatVegsoPrimerAuditRiportot() {
  const finalRegistryPath = path.resolve(process.cwd(), DEFAULT_FINAL_PRIMARY_REGISTRY_PATH);
  const legacyRegistryPath = path.resolve(process.cwd(), DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH);
  const wikiRegistryPath = path.resolve(process.cwd(), DEFAULT_WIKI_PRIMARY_REGISTRY_PATH);
  const normalizedRegistryPath = path.resolve(process.cwd(), kanonikusUtvonalak.primer.normalizaloRiport);
  const inputPath = path.resolve(process.cwd(), kanonikusUtvonalak.adatbazis.nevnapok);
  const overridesPath = path.resolve(process.cwd(), DEFAULT_PRIMARY_REGISTRY_OVERRIDES_PATH);
  const reportPath = path.resolve(process.cwd(), kanonikusUtvonalak.riportok.vegsoPrimer);

  const [
    finalRegistry,
    legacyRegistry,
    wikiRegistry,
    normalizedRegistry,
    overridesRegistry,
    inputPayload,
  ] = await Promise.all([
    loadPrimaryRegistry(finalRegistryPath),
    loadPrimaryRegistry(legacyRegistryPath),
    loadPrimaryRegistry(wikiRegistryPath),
    loadPrimaryRegistry(normalizedRegistryPath),
    loadPrimaryRegistryOverrides(overridesPath),
    betoltStrukturaltFajl(inputPath),
  ]);

  const report = buildFinalPrimaryRegistryReport({
    finalRegistryPayload: finalRegistry.payload,
    legacyRegistryPayload: legacyRegistry.payload,
    wikiRegistryPayload: wikiRegistry.payload,
    normalizedRegistryPayload: normalizedRegistry.payload,
    overridesPayload: overridesRegistry.payload,
    inputPayload,
    inputs: {
      finalRegistryPath,
      legacyRegistryPath,
      wikiRegistryPath,
      normalizedRegistryPath,
      inputPath,
      overridesPath,
      reportPath,
    },
  });

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await mentStrukturaltFajl(reportPath, report);
  return report;
}

async function futtatPrimerNelkulMaradoNevekAuditRiportot() {
  const finalRegistryPath = path.resolve(process.cwd(), DEFAULT_FINAL_PRIMARY_REGISTRY_PATH);
  const normalizedRegistryPath = path.resolve(process.cwd(), kanonikusUtvonalak.primer.normalizaloRiport);
  const inputPath = path.resolve(process.cwd(), kanonikusUtvonalak.adatbazis.nevnapok);
  const reportPath = path.resolve(process.cwd(), kanonikusUtvonalak.riportok.primerNelkulMaradoNevek);

  const [finalRegistry, normalizedRegistry, inputPayload] = await Promise.all([
    loadPrimaryRegistry(finalRegistryPath),
    loadPrimaryRegistry(normalizedRegistryPath),
    betoltStrukturaltFajl(inputPath),
  ]);

  const report = buildPrimaryNelkulMaradoNevekRiport({
    finalRegistryPayload: finalRegistry.payload,
    normalizedRegistryPayload: normalizedRegistry.payload,
    inputPayload,
    inputs: {
      finalRegistryPath,
      normalizedRegistryPath,
      inputPath,
      reportPath,
    },
  });

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await mentStrukturaltFajl(reportPath, report);
  return report;
}

function konkretLepesek() {
  return [
    {
      azonosito: "legacy-primer-epites",
      leiras: "A régi ICS-ből felépíti a legacy primerjegyzéket.",
      csoport: "forrasok-es-alapadatok",
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
      csoport: "forrasok-es-alapadatok",
      safeMode: "crawler",
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
      csoport: "forrasok-es-alapadatok",
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
      csoport: "forrasok-es-alapadatok",
      safeMode: "crawler",
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
      azonosito: "audit-wiki-vs-legacy",
      leiras: "Összeveti a wiki és a legacy primerforrást.",
      csoport: "primer-audit",
      bemenetek: [kanonikusUtvonalak.primer.legacy, kanonikusUtvonalak.primer.wiki],
      kimenetek: [kanonikusUtvonalak.riportok.wikiVsLegacy],
      dependsOn: ["legacy-primer-epites", "wiki-primer-gyujtes"],
      futtat: (opciok = {}) =>
        futtatLepest({
          stepId: "audit-wiki-vs-legacy",
          vegrehajt: () =>
            futtatWikiVsLegacyAuditot({
              legacy: kanonikusUtvonalak.primer.legacy,
              wiki: kanonikusUtvonalak.primer.wiki,
              report: kanonikusUtvonalak.riportok.wikiVsLegacy,
            }),
          inputs: [kanonikusUtvonalak.primer.legacy, kanonikusUtvonalak.primer.wiki],
          outputs: [kanonikusUtvonalak.riportok.wikiVsLegacy],
          formatum: opciok.formatum ?? "yaml",
          reporter: resolveReporter(opciok),
        }),
    },
    {
      azonosito: "audit-primer-normalizalo-alap",
      leiras: "Előkészíti a normalizált primer audit alapriportját.",
      csoport: "primer-audit",
      bemenetek: [kanonikusUtvonalak.adatbazis.nevnapok, kanonikusUtvonalak.riportok.wikiVsLegacy],
      kimenetek: [kanonikusUtvonalak.primer.normalizaloRiport],
      dependsOn: ["portal-nevadatbazis-epites", "audit-wiki-vs-legacy"],
      futtat: (opciok = {}) =>
        futtatLepest({
          stepId: "audit-primer-normalizalo-alap",
          vegrehajt: () =>
            futtatPrimerNormalizaloRiportot({
              input: kanonikusUtvonalak.adatbazis.nevnapok,
              diff: kanonikusUtvonalak.riportok.wikiVsLegacy,
              output: kanonikusUtvonalak.primer.normalizaloRiport,
            }),
          inputs: [kanonikusUtvonalak.adatbazis.nevnapok, kanonikusUtvonalak.riportok.wikiVsLegacy],
          outputs: [kanonikusUtvonalak.primer.normalizaloRiport],
          formatum: opciok.formatum ?? "yaml",
          reporter: resolveReporter(opciok),
        }),
    },
    {
      azonosito: "audit-primer-normalizalo",
      leiras: "Ellenőrzi a normalizált primerjelölések eltéréseit.",
      csoport: "primer-audit",
      bemenetek: [
        kanonikusUtvonalak.primer.normalizaloRiport,
        kanonikusUtvonalak.primer.legacy,
        kanonikusUtvonalak.primer.wiki,
      ],
      kimenetek: [kanonikusUtvonalak.riportok.primerNormalizalo],
      dependsOn: ["audit-primer-normalizalo-alap"],
      futtat: (opciok = {}) =>
        futtatLepest({
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
          formatum: opciok.formatum ?? "yaml",
          reporter: resolveReporter(opciok),
        }),
    },
    {
      azonosito: "audit-vegso-primer",
      leiras: "Részletes riportot készít a végső primerállapotról.",
      csoport: "primer-audit",
      bemenetek: [
        kanonikusUtvonalak.primer.vegso,
        kanonikusUtvonalak.primer.legacy,
        kanonikusUtvonalak.primer.wiki,
        kanonikusUtvonalak.primer.normalizaloRiport,
        kanonikusUtvonalak.adatbazis.nevnapok,
        kanonikusUtvonalak.kezi.primerFelulirasok,
      ],
      kimenetek: [kanonikusUtvonalak.riportok.vegsoPrimer],
      dependsOn: ["vegso-primer-feloldas", "audit-primer-normalizalo-alap"],
      futtat: (opciok = {}) =>
        futtatLepest({
          stepId: "audit-vegso-primer",
          vegrehajt: () => futtatVegsoPrimerAuditRiportot(),
          inputs: [
            kanonikusUtvonalak.primer.vegso,
            kanonikusUtvonalak.primer.legacy,
            kanonikusUtvonalak.primer.wiki,
            kanonikusUtvonalak.primer.normalizaloRiport,
            kanonikusUtvonalak.adatbazis.nevnapok,
            kanonikusUtvonalak.kezi.primerFelulirasok,
          ],
          outputs: [kanonikusUtvonalak.riportok.vegsoPrimer],
          formatum: opciok.formatum ?? "yaml",
          reporter: resolveReporter(opciok),
        }),
    },
    {
      azonosito: "audit-primer-nelkul-marado-nevek",
      leiras: "Riportot készít a végső primerből kimaradó nevekről.",
      csoport: "primer-audit",
      bemenetek: [
        kanonikusUtvonalak.primer.vegso,
        kanonikusUtvonalak.primer.normalizaloRiport,
        kanonikusUtvonalak.adatbazis.nevnapok,
      ],
      kimenetek: [kanonikusUtvonalak.riportok.primerNelkulMaradoNevek],
      dependsOn: ["vegso-primer-feloldas", "audit-primer-normalizalo-alap"],
      futtat: (opciok = {}) =>
        futtatLepest({
          stepId: "audit-primer-nelkul-marado-nevek",
          vegrehajt: () => futtatPrimerNelkulMaradoNevekAuditRiportot(),
          inputs: [
            kanonikusUtvonalak.primer.vegso,
            kanonikusUtvonalak.primer.normalizaloRiport,
            kanonikusUtvonalak.adatbazis.nevnapok,
          ],
          outputs: [kanonikusUtvonalak.riportok.primerNelkulMaradoNevek],
          formatum: opciok.formatum ?? "yaml",
          reporter: resolveReporter(opciok),
        }),
    },
    {
      azonosito: "audit-primer-audit",
      leiras: "Frissíti az egységes primer audit szerkesztőriportját.",
      csoport: "primer-audit",
      bemenetek: [
        kanonikusUtvonalak.primer.vegso,
        kanonikusUtvonalak.primer.legacy,
        kanonikusUtvonalak.primer.wiki,
        kanonikusUtvonalak.primer.normalizaloRiport,
        kanonikusUtvonalak.adatbazis.nevnapok,
        kanonikusUtvonalak.kezi.primerFelulirasok,
        kanonikusUtvonalak.helyi.nevnapokKonfig,
      ],
      kimenetek: [kanonikusUtvonalak.riportok.primerAudit],
      dependsOn: [
        "vegso-primer-feloldas",
        "audit-primer-normalizalo-alap",
        "audit-vegso-primer",
        "audit-primer-nelkul-marado-nevek",
      ],
      futtat: (opciok = {}) =>
        futtatLepest({
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
          formatum: opciok.formatum ?? "yaml",
          reporter: resolveReporter(opciok),
        }),
    },
    {
      azonosito: "formalizalt-elek-generalasa",
      leiras: "A formalizált eredetleírásból él-listát készít.",
      csoport: "forrasok-es-alapadatok",
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
      azonosito: "audit-hivatalos-nevjegyzek",
      leiras: "Összeveti az adatbázist a hivatalos névjegyzékkel.",
      csoport: "auditok",
      bemenetek: [
        kanonikusUtvonalak.adatbazis.nevnapok,
        kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek,
      ],
      kimenetek: [kanonikusUtvonalak.riportok.hivatalosNevjegyzek],
      dependsOn: ["portal-nevadatbazis-epites"],
      futtat: (opciok = {}) =>
        futtatLepest({
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
          formatum: opciok.formatum ?? "yaml",
          reporter: resolveReporter(opciok),
        }),
    },
    {
      azonosito: "audit-legacy-primer",
      leiras: "Összeveti a legacy primerlistát a mostani adatbázissal.",
      csoport: "auditok",
      bemenetek: [kanonikusUtvonalak.adatbazis.nevnapok, kanonikusUtvonalak.primer.legacy],
      kimenetek: [kanonikusUtvonalak.riportok.legacyPrimer],
      dependsOn: ["portal-nevadatbazis-epites", "legacy-primer-epites"],
      futtat: (opciok = {}) =>
        futtatLepest({
          stepId: "audit-legacy-primer",
          vegrehajt: () =>
            futtatLegacyPrimerAuditot({
              input: kanonikusUtvonalak.adatbazis.nevnapok,
              registry: kanonikusUtvonalak.primer.legacy,
              report: kanonikusUtvonalak.riportok.legacyPrimer,
            }),
          inputs: [kanonikusUtvonalak.adatbazis.nevnapok, kanonikusUtvonalak.primer.legacy],
          outputs: [kanonikusUtvonalak.riportok.legacyPrimer],
          formatum: opciok.formatum ?? "yaml",
          reporter: resolveReporter(opciok),
        }),
    },
  ];
}

export const pipelineLepesek = konkretLepesek();

export const pipelineCsoportok = [
  {
    azonosito: "forrasok-es-alapadatok",
    cimke: "Források és alapadatok",
    leiras: "A források feldolgozása, a végső primerállapot és az alapadat-kimenetek előállítása.",
    lepesek: [
      "legacy-primer-epites",
      "wiki-primer-gyujtes",
      "vegso-primer-feloldas",
      "portal-nevadatbazis-epites",
      "formalizalt-elek-generalasa",
    ],
  },
  {
    azonosito: "primer-audit",
    cimke: "Primer audit",
    leiras: "A primerrel kapcsolatos auditok és szerkesztőriportok frissítése.",
    lepesek: [
      "audit-wiki-vs-legacy",
      "audit-primer-normalizalo-alap",
      "audit-primer-normalizalo",
      "audit-vegso-primer",
      "audit-primer-nelkul-marado-nevek",
      "audit-primer-audit",
    ],
  },
  {
    azonosito: "auditok",
    cimke: "Auditok",
    leiras: "Minden elérhető audit és admin riport egyben.",
    lepesek: [
      "audit-hivatalos-nevjegyzek",
      "audit-legacy-primer",
      "audit-wiki-vs-legacy",
      "audit-primer-normalizalo-alap",
      "audit-primer-normalizalo",
      "audit-vegso-primer",
      "audit-primer-nelkul-marado-nevek",
      "audit-primer-audit",
    ],
  },
];

export function keresLepest(azonosito) {
  return pipelineLepesek.find((lep) => lep.azonosito === azonosito) ?? null;
}

export function keresPipelineCsoportot(azonosito) {
  return pipelineCsoportok.find((csoport) => csoport.azonosito === azonosito) ?? null;
}
