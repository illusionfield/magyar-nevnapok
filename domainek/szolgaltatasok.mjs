/**
 * domainek/szolgaltatasok.mjs
 * A CLI és a TUI közös alkalmazásszintű szolgáltatásai.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { futtatPipelineCelt, listazPipelineAllapot, listazPipelineCelokat } from "../pipeline/futtato.mjs";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import { futtatNodeFolyamat } from "../kozos/parancs-futtatas.mjs";
import { kanonikusUtvonalak } from "../kozos/utvonalak.mjs";
import { letezik } from "../kozos/fajlrendszer.mjs";
import {
  allitHelyiPrimerForrast,
  betoltHelyiPrimerBeallitasokat,
  betoltHelyiPrimerFelulirasokat,
  buildHelyiPrimerFelulirasMap,
  kapcsolHelyiPrimerKiegeszitest,
  tartalmazHelyiPrimerKiegeszitest,
  vanHelyiPrimerFeluliras,
} from "./primer/helyi-primer-felulirasok.mjs";
import { buildCombinedMissingEntries } from "./auditok/primer-nelkul-marado-nevek.mjs";
import { exportalCsv, exportalExcel } from "./kimenetek/tabularis-export.mjs";

const aktualisKonyvtar = path.dirname(fileURLToPath(import.meta.url));

/**
 * A `modulUtvonal` a modul relatív útvonalát abszolút projektútvonallá alakítja.
 */
function modulUtvonal(relativ) {
  return path.resolve(aktualisKonyvtar, "..", relativ);
}

/**
 * A `szarmaztatottKimenetiUtvonal` utótagot illeszt a fájlnévhez.
 */
function szarmaztatottKimenetiUtvonal(utvonal, utotag) {
  const parsed = path.parse(utvonal);
  const ext = parsed.ext || ".ics";
  return path.join(parsed.dir, `${parsed.name}-${utotag}${ext}`);
}

/**
 * A `szamolIcsKimenetiUtvonalakat` előre kiszámolja a szolgáltatásszintű ICS generálás várható fájljait.
 */
function szamolIcsKimenetiUtvonalakat(opciok = {}) {
  const baseOutput = opciok.output ?? kanonikusUtvonalak.naptar.alap;
  const leapStrategies =
    opciok.leapMode === "hungarian-until-2050" && opciok.leapStrategy === "both"
      ? ["A", "B"]
      : [null];
  const baseOutputs = opciok.splitPrimaryRest
    ? [
        opciok.primaryOutput ?? szarmaztatottKimenetiUtvonal(baseOutput, "primary"),
        opciok.restOutput ?? szarmaztatottKimenetiUtvonal(baseOutput, "rest"),
      ]
    : [baseOutput];

  return baseOutputs.flatMap((output) =>
    leapStrategies.map((strategy) =>
      strategy ? szarmaztatottKimenetiUtvonal(output, strategy) : output
    )
  );
}

const auditWorkerTar = {
  "hivatalos-nevjegyzek": {
    modul: "domainek/auditok/hivatalos-nevjegyzek.mjs",
    reportPath: kanonikusUtvonalak.riportok.hivatalosNevjegyzek,
    argumentumok: [
      "--input",
      kanonikusUtvonalak.adatbazis.nevnapok,
      "--report",
      kanonikusUtvonalak.riportok.hivatalosNevjegyzek,
      "--exceptions",
      kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek,
    ],
  },
  "legacy-primer": {
    modul: "domainek/auditok/legacy-primer-osszevetes.mjs",
    reportPath: kanonikusUtvonalak.riportok.legacyPrimer,
    argumentumok: [
      "--input",
      kanonikusUtvonalak.adatbazis.nevnapok,
      "--registry",
      kanonikusUtvonalak.primer.legacy,
      "--report",
      kanonikusUtvonalak.riportok.legacyPrimer,
    ],
  },
  "wiki-vs-legacy": {
    modul: "domainek/auditok/wiki-vs-legacy.mjs",
    reportPath: kanonikusUtvonalak.riportok.wikiVsLegacy,
    argumentumok: [
      "--legacy",
      kanonikusUtvonalak.primer.legacy,
      "--wiki",
      kanonikusUtvonalak.primer.wiki,
      "--report",
      kanonikusUtvonalak.riportok.wikiVsLegacy,
    ],
  },
  "primer-normalizalo": {
    modul: "domainek/auditok/primer-normalizalo-osszevetes.mjs",
    reportPath: kanonikusUtvonalak.riportok.primerNormalizalo,
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
  },
  "vegso-primer": {
    modul: "domainek/auditok/vegso-primer-riport.mjs",
    reportPath: kanonikusUtvonalak.riportok.vegsoPrimer,
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
  },
  "primer-nelkul-marado-nevek": {
    modul: "domainek/auditok/primer-nelkul-marado-nevek.mjs",
    reportPath: kanonikusUtvonalak.riportok.primerNelkulMaradoNevek,
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
  },
};

/**
 * A `listazAuditokat` visszaadja az elérhető auditok listáját.
 */
export function listazAuditokat() {
  return ["mind", ...Object.keys(auditWorkerTar)];
}

/**
 * A `listazKimenetiFormatumokat` visszaadja az elérhető exportformátumokat.
 */
export function listazKimenetiFormatumokat() {
  return ["ics", "json", "yaml", "csv", "excel"];
}

/**
 * A `pipelineAllapot` szolgáltatásszinten visszaadja a pipeline állapotát.
 */
export async function pipelineAllapot() {
  return listazPipelineAllapot();
}

/**
 * A `futtatPipeline` szolgáltatásszinten lefuttat egy pipeline-célt.
 */
export async function futtatPipeline(cel, opciok = {}) {
  return futtatPipelineCelt(cel, opciok);
}

/**
 * A `listazPipelineCelLista` visszaadja a felületeken megjeleníthető pipeline-célokat.
 */
export function listazPipelineCelLista() {
  return listazPipelineCelokat();
}

/**
 * Az `epitIcsGeneratorArgumentumokat` a szolgáltatásszintű opciókat CLI-argumentumokká alakítja.
 */
function epitIcsGeneratorArgumentumokat(opciok = {}) {
  const args = [
    "--input",
    opciok.input ?? kanonikusUtvonalak.adatbazis.nevnapok,
    "--output",
    opciok.output ?? kanonikusUtvonalak.naptar.alap,
  ];

  if (opciok.primaryOutput) {
    args.push("--primary-output", opciok.primaryOutput);
  }

  if (opciok.restOutput) {
    args.push("--rest-output", opciok.restOutput);
  }

  if (opciok.splitPrimaryRest === true) {
    args.push("--split-primary-rest");
  }

  if (opciok.mode) {
    args.push("--mode", opciok.mode);
  }

  if (opciok.primarySource) {
    args.push("--primary-source", opciok.primarySource);
  }

  if (opciok.leapStrategy) {
    args.push("--leap-strategy", opciok.leapStrategy);
  }

  if (opciok.primaryCalendarMode) {
    args.push("--primary-calendar-mode", opciok.primaryCalendarMode);
  }

  if (opciok.restCalendarMode) {
    args.push("--rest-calendar-mode", opciok.restCalendarMode);
  }

  if (opciok.descriptionMode) {
    args.push("--description", opciok.descriptionMode);
  }

  if (opciok.descriptionFormat) {
    args.push("--description-format", opciok.descriptionFormat);
  }

  if (opciok.includeOtherDays === true) {
    args.push("--include-other-days");
  }

  if (opciok.includeOtherDays === false) {
    args.push("--no-other-days");
  }

  if (opciok.leapMode) {
    args.push("--leap-mode", opciok.leapMode);
  }

  if (opciok.ordinalDay) {
    args.push("--ordinal-day", opciok.ordinalDay);
  }

  if (opciok.calendarName) {
    args.push("--calendar-name", opciok.calendarName);
  }

  if (Number.isInteger(opciok.baseYear)) {
    args.push("--base-year", String(opciok.baseYear));
  }

  if (Number.isInteger(opciok.fromYear)) {
    args.push("--from-year", String(opciok.fromYear));
  }

  if (Number.isInteger(opciok.untilYear)) {
    args.push("--until-year", String(opciok.untilYear));
  }

  if (opciok.localPrimaryOverrides) {
    args.push(
      "--local-primary-overrides",
      opciok.localPrimaryOverrides === true
        ? kanonikusUtvonalak.kezi.primerFelulirasokHelyi
        : opciok.localPrimaryOverrides
    );
  }

  return args;
}

/**
 * A `generalKimenetet` lefuttatja a kiválasztott kimeneti generálást.
 */
export async function generalKimenetet(formatum, opciok = {}) {
  if (formatum === "ics") {
    const letrehozott = szamolIcsKimenetiUtvonalakat(opciok);
    const sajatOutput =
      opciok.sajatOutput ??
      (opciok.output
        ? szarmaztatottKimenetiUtvonal(opciok.output, "sajat")
        : kanonikusUtvonalak.naptar.sajat);
    const helyiPrimerBeallitasok = await betoltHelyiPrimerBeallitasokat();

    await futtatNodeFolyamat(
      modulUtvonal("domainek/naptar/ics-generalas.mjs"),
      epitIcsGeneratorArgumentumokat({
        ...opciok,
        output: opciok.output ?? kanonikusUtvonalak.naptar.alap,
      }),
      {
        tukrozzStdout: true,
        tukrozzStderr: true,
      }
    );

    if (await vanHelyiPrimerFeluliras()) {
      await futtatNodeFolyamat(
        modulUtvonal("domainek/naptar/ics-generalas.mjs"),
        epitIcsGeneratorArgumentumokat({
          ...opciok,
          output: sajatOutput,
          mode: "primary-together",
          primarySource: opciok.primarySource ?? helyiPrimerBeallitasok.settings.primarySource,
          calendarName: `${opciok.calendarName ?? "Névnapok"} — saját elsődleges`,
          localPrimaryOverrides: kanonikusUtvonalak.kezi.primerFelulirasokHelyi,
        }),
        {
          tukrozzStdout: true,
          tukrozzStderr: true,
        }
      );

      letrehozott.push(sajatOutput);
    }

    return letrehozott;
  }

  if (formatum === "json") {
    return exportalLetezoArtifactokat("json");
  }

  if (formatum === "yaml") {
    return exportalLetezoArtifactokat("yaml");
  }

  if (formatum === "csv") {
    return exportalCsv(opciok);
  }

  if (formatum === "excel" || formatum === "xlsx") {
    return exportalExcel(opciok);
  }

  throw new Error(`Nem támogatott kimeneti formátum: ${formatum}`);
}

/**
 * Az `exportalLetezoArtifactokat` a már elkészült strukturált artifactokat exportálja.
 */
export async function exportalLetezoArtifactokat(formatum = "json") {
  const strukturaltUtvonalak = [
    kanonikusUtvonalak.primer.legacy,
    kanonikusUtvonalak.primer.wiki,
    kanonikusUtvonalak.primer.vegso,
    kanonikusUtvonalak.primer.normalizaloRiport,
    kanonikusUtvonalak.adatbazis.nevnapok,
    kanonikusUtvonalak.adatbazis.formalizaltElek,
    kanonikusUtvonalak.riportok.hivatalosNevjegyzek,
    kanonikusUtvonalak.riportok.legacyPrimer,
    kanonikusUtvonalak.riportok.wikiVsLegacy,
    kanonikusUtvonalak.riportok.primerNormalizalo,
    kanonikusUtvonalak.riportok.vegsoPrimer,
    kanonikusUtvonalak.riportok.primerNelkulMaradoNevek,
    kanonikusUtvonalak.pipeline.manifest,
  ];

  const letrehozott = [];

  for (const forras of strukturaltUtvonalak) {
    if (!(await letezik(forras))) {
      continue;
    }

    const adat = await betoltStrukturaltFajl(forras);
    const cel =
      formatum === "json"
        ? forras.replace(/\.(yaml|yml)$/u, ".json")
        : forras.replace(/\.json$/u, ".yaml");

    await mentStrukturaltFajl(cel, adat, formatum);
    letrehozott.push(cel);
  }

  return letrehozott;
}

/**
 * A `futtatAuditot` lefuttatja a kiválasztott auditot vagy auditcsomagot.
 */
export async function futtatAuditot(ellenorzes, opciok = {}) {
  if (ellenorzes === "mind") {
    return futtatPipelineCelt("audit-futtatas", opciok);
  }

  const worker = auditWorkerTar[ellenorzes];

  if (!worker) {
    throw new Error(`Ismeretlen audit: ${ellenorzes}`);
  }

  await futtatNodeFolyamat(modulUtvonal(worker.modul), worker.argumentumok, {
    tukrozzStdout: opciok.tukrozzStdout ?? true,
    tukrozzStderr: opciok.tukrozzStderr ?? true,
  });

  return {
    audit: ellenorzes,
    sikeres: true,
    reportPath: worker.reportPath,
  };
}

/**
 * A `betoltVegsoPrimerAuditInspectorAdata` a végső primer riportot TUI-böngészhető formában tölti be.
 */
export async function betoltVegsoPrimerAuditInspectorAdata(opciok = {}) {
  if (opciok.frissitRiport !== false) {
    await futtatAuditot("vegso-primer", {
      tukrozzStdout: false,
      tukrozzStderr: false,
    });
  }

  const riport = await betoltStrukturaltFajl(kanonikusUtvonalak.riportok.vegsoPrimer);
  const rows = (riport.months ?? []).reduce((sum, month) => sum + (month.rows?.length ?? 0), 0);

  return {
    audit: "vegso-primer",
    generatedAt: riport.generatedAt ?? null,
    reportPath: path.relative(process.cwd(), kanonikusUtvonalak.riportok.vegsoPrimer),
    summary: {
      rowCount: rows,
      hardFailureCount: riport.validations?.hardFailureCount ?? 0,
      mismatchDayCount: riport.validations?.mismatchMonthDays?.length ?? 0,
      overrideDayCount: riport.validations?.overrideDayCount ?? 0,
      neverPrimaryCount: riport.summary?.neverPrimaryCount ?? 0,
      neverPrimaryWithSimilarPrimaryCount:
        riport.summary?.neverPrimaryWithSimilarPrimaryCount ?? 0,
      neverPrimaryWithoutSimilarPrimaryCount:
        riport.summary?.neverPrimaryWithoutSimilarPrimaryCount ?? 0,
    },
    validations: riport.validations ?? {},
    months: riport.months ?? [],
    leapWindow: riport.leapWindow ?? [],
    neverPrimaryByMonth: riport.neverPrimaryByMonth ?? [],
    neverPrimarySimilarPrimary: riport.neverPrimarySimilarPrimary ?? {},
  };
}

/**
 * A `betoltPrimerNelkulAuditInspectorAdata` a primer nélkül maradó nevek riportját TUI-böngészhető formában tölti be.
 */
export async function betoltPrimerNelkulAuditInspectorAdata(opciok = {}) {
  const adat = await betoltPrimerNelkulMaradoNevekSzerkesztoAdata(opciok);
  const helyiBeallitasok = await betoltHelyiPrimerBeallitasokat();

  return {
    audit: "primer-nelkul-marado-nevek",
    ...adat,
    localSettings: helyiBeallitasok.settings,
  };
}

/**
 * A `betoltAuditInspectorAdata` a kiválasztott auditot egységes TUI-inspector formában tölti be.
 */
export async function betoltAuditInspectorAdata(ellenorzes, opciok = {}) {
  if (ellenorzes === "vegso-primer") {
    return betoltVegsoPrimerAuditInspectorAdata(opciok);
  }

  if (ellenorzes === "primer-nelkul-marado-nevek") {
    return betoltPrimerNelkulAuditInspectorAdata(opciok);
  }

  throw new Error(`Ehhez az audit-azonosítóhoz még nincs inspector nézet: ${ellenorzes}`);
}

/**
 * A `betoltPrimerNelkulMaradoNevekSzerkesztoAdata` a TUI szerkesztőhöz készít egyesített nézetet.
 *
 * A riportot alapértelmezés szerint frissítjük, hogy a szerkesztő ne egy elavult snapshotot mutasson.
 */
export async function betoltPrimerNelkulMaradoNevekSzerkesztoAdata(opciok = {}) {
  if (opciok.frissitRiport !== false) {
    await futtatAuditot("primer-nelkul-marado-nevek", {
      tukrozzStdout: false,
      tukrozzStderr: false,
    });
  }

  const riport = await betoltStrukturaltFajl(kanonikusUtvonalak.riportok.primerNelkulMaradoNevek);
  const helyiFelulirasok = await betoltHelyiPrimerFelulirasokat();
  const helyiBeallitasok = await betoltHelyiPrimerBeallitasokat();
  const helyiMap = buildHelyiPrimerFelulirasMap(helyiFelulirasok.payload);
  let helyiKijelolesDarab = 0;

  const months = (riport.months ?? []).map((month) => ({
    ...month,
    rows: (month.rows ?? []).map((row) => {
      const combinedMissing = Array.isArray(row.combinedMissing)
        ? row.combinedMissing
        : buildCombinedMissingEntries(row.normalizedMissing ?? [], row.rankingMissing ?? []);
      const combinedWithLocalState = combinedMissing.map((entry) => {
        const localSelected = tartalmazHelyiPrimerKiegeszitest(
          helyiMap,
          row.monthDay,
          entry.name
        );

        if (localSelected) {
          helyiKijelolesDarab += 1;
        }

        return {
          ...entry,
          localSelected,
        };
      });

      return {
        ...row,
        combinedMissing: combinedWithLocalState,
      };
    }),
  }));

  return {
    generatedAt: riport.generatedAt ?? null,
    reportPath: path.relative(process.cwd(), kanonikusUtvonalak.riportok.primerNelkulMaradoNevek),
    localOverridesPath: path.relative(process.cwd(), helyiFelulirasok.path),
    summary: {
      ...(riport.summary ?? {}),
      localSelectedCount: helyiKijelolesDarab,
    },
    localSettings: helyiBeallitasok.settings,
    months,
  };
}

/**
 * Az `allitSajatPrimerForrast` a személyes naptár primerforrási profilját módosítja.
 */
export async function allitSajatPrimerForrast(primarySource) {
  const eredmeny = await allitHelyiPrimerForrast({ primarySource });

  return {
    primarySource: eredmeny.primarySource,
    localOverridesPath: path.relative(process.cwd(), eredmeny.path),
  };
}

/**
 * A `kapcsolPrimerNelkuliHelyiKiegeszitest` a szerkesztőből ki-be kapcsol egy napi helyi primernevet.
 */
export async function kapcsolPrimerNelkuliHelyiKiegeszitest(adat) {
  const eredmeny = await kapcsolHelyiPrimerKiegeszitest(adat);

  return {
    ...eredmeny,
    localOverridesPath: eredmeny.path,
  };
}

/**
 * A `torolGoogleNaptarat` továbbadja a vezérlést a Google Naptár adminisztrációs modulnak.
 */
export async function torolGoogleNaptarat(tovabbiArgumentumok = []) {
  return futtatNodeFolyamat(
    modulUtvonal("domainek/integraciok/google-naptar/torles.mjs"),
    tovabbiArgumentumok,
    {
      tukrozzStdout: true,
      tukrozzStderr: true,
    }
  );
}
