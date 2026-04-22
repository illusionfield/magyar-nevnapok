/**
 * domainek/szolgaltatasok.mjs
 * A web GUI backend közös alkalmazásszintű szolgáltatásai.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { futtatHivatalosNevjegyzekAuditot } from "./auditok/hivatalos-nevjegyzek.mjs";
import { futtatLegacyPrimerAuditot } from "./auditok/legacy-primer-osszevetes.mjs";
import {
  alkalmazHelyiPrimerOverlaytPrimerAuditRiporton,
  buildPrimerAuditVeglegesitettPrimerPayload,
  futtatPrimerAuditMunkafolyamat,
} from "./auditok/primer-audit.mjs";
import { futtatPrimerNormalizaloAuditot } from "./auditok/primer-normalizalo-osszevetes.mjs";
import { futtatWikiVsLegacyAuditot } from "./auditok/wiki-vs-legacy.mjs";
import {
  alapertelmezettHelyiIcsBeallitasok,
  allitHelyiPrimerBlokkot,
  allitHelyiIcsBeallitasokat,
  betoltHelyiFelhasznaloiKonfigot,
  betoltHelyiIcsBeallitasokat,
} from "./helyi-konfig.mjs";
import { exportalCsv, exportalExcel } from "./kimenetek/tabularis-export.mjs";
import {
  buildNameMapFromSourceDays,
  buildSourceDaysFromPayload,
  epitIcsKimenetiTervet,
  splitSourceDaysByPreferredRegistry,
  vegrehajtIcsKimenetiTervet,
} from "./naptar/ics-generalas.mjs";
import {
  egyesitIcsBeallitasokat,
  epitIcsOutputProfilt,
  listazIcsMenedzseltKimeneteket,
  normalizalIcsBeallitasokat,
} from "./naptar/ics-beallitasok.mjs";
import { futtatPrimerNormalizaloRiportot } from "./primer/normalizalo-riport.mjs";
import {
  allitHelyiPrimerBeallitasokat,
  allitHelyiPrimerForrast,
  betoltHelyiPrimerBeallitasokat,
  betoltHelyiPrimerFelulirasokat,
  buildHelyiPrimerFelulirasMap,
  kapcsolHelyiPrimerKiegeszitest,
  tartalmazHelyiPrimerKiegeszitest,
  vanNemAlapertelmezettHelyiPrimerBeallitas,
} from "./primer/helyi-primer-felulirasok.mjs";
import { dedupeKeepOrder, parseMonthDay } from "./primer/alap.mjs";
import { letezik } from "../kozos/fajlrendszer.mjs";
import { createConsoleReporter, createReporter, withReporterConsole } from "../kozos/reporter.mjs";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../kozos/utvonalak.mjs";
import { futtatPipelineCelt, listazPipelineAllapot, listazPipelineCelokat } from "../pipeline/futtato.mjs";
import { listazGoogleNaptarakat, vegrehajtGoogleNaptarTorloMuveletet } from "./integraciok/google-naptar/web-szolgaltatas.mjs";

function resolveReporter(opciok = {}) {
  return opciok.reporter ?? createConsoleReporter();
}

async function runWithReporter(opciok, fn) {
  const reporter = resolveReporter(opciok);
  return withReporterConsole(reporter, () => fn(reporter));
}

function publikusAuditok() {
  return [
    "hivatalos-nevjegyzek",
    "legacy-primer",
    "wiki-vs-legacy",
    "primer-normalizalo",
    "primer-audit",
  ];
}

async function futtatPrimerAuditFrissitest(opciok = {}) {
  const reporter = resolveReporter(opciok);

  if (opciok.force === true || !(await letezik(kanonikusUtvonalak.adatbazis.nevnapok))) {
    await futtatPipelineCelt("portal-nevadatbazis-epites", {
      force: opciok.force === true,
      reporter,
    });
  }

  return withReporterConsole(reporter, async () => {
    await futtatWikiVsLegacyAuditot({
      legacy: kanonikusUtvonalak.primer.legacy,
      wiki: kanonikusUtvonalak.primer.wiki,
      report: kanonikusUtvonalak.riportok.wikiVsLegacy,
    });
    await futtatPrimerNormalizaloRiportot({
      input: kanonikusUtvonalak.adatbazis.nevnapok,
      diff: kanonikusUtvonalak.riportok.wikiVsLegacy,
      output: kanonikusUtvonalak.primer.normalizaloRiport,
    });
    await futtatPrimerNormalizaloAuditot({
      normalized: kanonikusUtvonalak.primer.normalizaloRiport,
      legacy: kanonikusUtvonalak.primer.legacy,
      wiki: kanonikusUtvonalak.primer.wiki,
      report: kanonikusUtvonalak.riportok.primerNormalizalo,
    });
    await futtatPrimerAuditMunkafolyamat({
      final: kanonikusUtvonalak.primer.vegso,
      legacy: kanonikusUtvonalak.primer.legacy,
      wiki: kanonikusUtvonalak.primer.wiki,
      normalized: kanonikusUtvonalak.primer.normalizaloRiport,
      input: kanonikusUtvonalak.adatbazis.nevnapok,
      overrides: kanonikusUtvonalak.kezi.primerFelulirasok,
      local: kanonikusUtvonalak.helyi.nevnapokKonfig,
      report: kanonikusUtvonalak.riportok.primerAudit,
    });

    return {
      audit: "primer-audit",
      sikeres: true,
      reportPath: kanonikusUtvonalak.riportok.primerAudit,
    };
  });
}

async function szinkronizalPrimerAuditSnapshotot() {
  const primerAuditUtvonal = kanonikusUtvonalak.riportok.primerAudit;

  if (!(await letezik(primerAuditUtvonal))) {
    return;
  }

  const [riport, helyiKonfig] = await Promise.all([
    betoltStrukturaltFajl(primerAuditUtvonal),
    betoltHelyiFelhasznaloiKonfigot(),
  ]);
  const frissitett = alkalmazHelyiPrimerOverlaytPrimerAuditRiporton(riport, {
    localSettings: helyiKonfig.payload?.personalPrimary,
    localOverridesPayload: helyiKonfig.payload?.personalPrimary,
  });

  await mentStrukturaltFajl(primerAuditUtvonal, frissitett);
}

async function torolIcsKimeneteket(utvonalak = []) {
  for (const utvonal of utvonalak) {
    await fs.rm(utvonal, { force: true });
  }
}

function alapertelmezettKozosPrimerFelulirasPayload() {
  return {
    version: 1,
    source: "manual legacy-wiki truth table",
    days: [],
  };
}

function normalizalKozosPrimerNapokat(days = []) {
  return (Array.isArray(days) ? days : [])
    .map((entry) => {
      const parsed = parseMonthDay(entry?.monthDay);

      if (!parsed) {
        return null;
      }

      const preferredNames = dedupeKeepOrder(entry?.preferredNames ?? []);

      if (preferredNames.length === 0) {
        return null;
      }

      return {
        month: Number.isInteger(entry?.month) ? entry.month : parsed.month,
        day: Number.isInteger(entry?.day) ? entry.day : parsed.day,
        monthDay: parsed.monthDay,
        preferredNames,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.monthDay.localeCompare(right.monthDay, "hu"));
}

function normalizalKozosPrimerFelulirasPayload(payload = {}) {
  return {
    version: Number.isInteger(payload?.version) ? payload.version : 1,
    source:
      String(payload?.source ?? alapertelmezettKozosPrimerFelulirasPayload().source).trim() ||
      alapertelmezettKozosPrimerFelulirasPayload().source,
    days: normalizalKozosPrimerNapokat(payload?.days),
  };
}

function uresHivatalosNevjegyzekKivetelPayload() {
  return {
    version: 1,
    forrasok: {
      hivatalosNevjegyzekDatum: null,
      elteAdatbazisDatum: null,
    },
    megjegyzes: "",
    genders: {
      male: {
        extraInJson: [],
        missingFromJson: [],
      },
      female: {
        extraInJson: [],
        missingFromJson: [],
      },
    },
  };
}

function normalizalHivatalosKivetelSorokat(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((entry) => {
      const name = String(entry?.name ?? "").trim();

      if (!name) {
        return null;
      }

      return {
        name,
        indoklas: String(entry?.indoklas ?? "").trim(),
        forrasDatum: String(entry?.forrasDatum ?? "").trim() || null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.name.localeCompare(right.name, "hu", { sensitivity: "base" }));
}

function normalizalHivatalosNevjegyzekKivetelPayload(payload = {}) {
  const alap = uresHivatalosNevjegyzekKivetelPayload();
  const hivatalosNevjegyzekDatum = payload?.forrasok?.hivatalosNevjegyzekDatum;
  const elteAdatbazisDatum = payload?.forrasok?.elteAdatbazisDatum;

  return {
    version: Number.isInteger(payload?.version) ? payload.version : alap.version,
    forrasok: {
      hivatalosNevjegyzekDatum:
        hivatalosNevjegyzekDatum == null ? null : String(hivatalosNevjegyzekDatum).trim() || null,
      elteAdatbazisDatum:
        elteAdatbazisDatum == null ? null : String(elteAdatbazisDatum).trim() || null,
    },
    megjegyzes: String(payload?.megjegyzes ?? alap.megjegyzes).trim(),
    genders: {
      male: {
        extraInJson: normalizalHivatalosKivetelSorokat(payload?.genders?.male?.extraInJson),
        missingFromJson: normalizalHivatalosKivetelSorokat(payload?.genders?.male?.missingFromJson),
      },
      female: {
        extraInJson: normalizalHivatalosKivetelSorokat(payload?.genders?.female?.extraInJson),
        missingFromJson: normalizalHivatalosKivetelSorokat(payload?.genders?.female?.missingFromJson),
      },
    },
  };
}

async function epitIcsFutasiTerveket(beallitasok = {}, reporter) {
  const helyiIcsBeallitasok = await betoltHelyiIcsBeallitasokat();
  const veglegesBeallitasok = normalizalIcsBeallitasokat(
    egyesitIcsBeallitasokat(helyiIcsBeallitasok.settings, beallitasok)
  );
  const outputProfil = epitIcsOutputProfilt(veglegesBeallitasok);
  const futasiTervek = [];

  if (outputProfil.partitionMode === "single") {
    const helyiSzemelyesPrimer = helyiIcsBeallitasok.payload?.personalPrimary ?? null;

    if (
      (helyiSzemelyesPrimer?.days?.length ?? 0) > 0 ||
      vanNemAlapertelmezettHelyiPrimerBeallitas(helyiSzemelyesPrimer)
    ) {
      reporter?.info(
        "Megjegyzés: az egyfájlos ICS-ben nincs primerbontás, ezért a Primer audit helyi overlaye most nem módosítja a kimenetet."
      );
    }

    futasiTervek.push(await epitIcsKimenetiTervet(outputProfil.single.generatorOptions));
  } else {
    await futtatPrimerAuditFrissitest({ reporter });

    const [nevadatbazisPayload, primerAuditRiport] = await Promise.all([
      betoltStrukturaltFajl(path.resolve(process.cwd(), veglegesBeallitasok.shared.input)),
      betoltStrukturaltFajl(kanonikusUtvonalak.riportok.primerAudit),
    ]);
    const primerAuditPayload = buildPrimerAuditVeglegesitettPrimerPayload(primerAuditRiport);
    const sourceDays = buildSourceDaysFromPayload(nevadatbazisPayload);
    const sourceNameMap = buildNameMapFromSourceDays(sourceDays);
    const splitDays = splitSourceDaysByPreferredRegistry(
      sourceDays,
      primerAuditPayload,
      nevadatbazisPayload
    );

    futasiTervek.push(
      await epitIcsKimenetiTervet(outputProfil.split.primary.generatorOptions, {
        payload: nevadatbazisPayload,
        sourceDays: splitDays.primaryDays,
        sourceNameMap,
      })
    );
    futasiTervek.push(
      await epitIcsKimenetiTervet(outputProfil.split.rest.generatorOptions, {
        payload: nevadatbazisPayload,
        sourceDays: splitDays.restDays,
        sourceNameMap,
      })
    );
  }

  const aktivKimenetek = new Set(
    futasiTervek.flatMap((terv) => terv.plannedOutputPaths).map((elem) => path.resolve(elem))
  );

  return {
    settings: veglegesBeallitasok,
    outputProfil,
    futasiTervek,
    torlendoKimenetek: listazIcsMenedzseltKimeneteket(veglegesBeallitasok).filter(
      (utvonal) => !aktivKimenetek.has(path.resolve(utvonal))
    ),
  };
}

async function futtatIcsKimenetiFolyamatot(beallitasok = {}, opciok = {}) {
  const reporter = resolveReporter(opciok);

  return withReporterConsole(reporter, async () => {
    const { settings, outputProfil, futasiTervek, torlendoKimenetek } = await epitIcsFutasiTerveket(
      beallitasok,
      reporter
    );
    const writtenPaths = [];
    const results = [];

    if (opciok.writeFiles !== false) {
      await torolIcsKimeneteket(torlendoKimenetek);
    }

    for (const terv of futasiTervek) {
      const eredmeny = await vegrehajtIcsKimenetiTervet(terv, {
        writeFiles: opciok.writeFiles,
      });

      for (const result of eredmeny.results) {
        if (opciok.writeFiles !== false) {
          reporter.info(`Mentve: ${result.eventCount} esemény ide: ${result.outputPath}`);
        } else {
          reporter.info(`Preview készült: ${result.eventCount} esemény innen: ${result.outputPath}`);
        }
      }

      writtenPaths.push(...eredmeny.writtenPaths);
      results.push(...eredmeny.results);
    }

    return {
      settings,
      outputProfil,
      results,
      writtenPaths,
      torlendoKimenetek,
    };
  });
}

/**
 * A `listazAuditokat` visszaadja az elérhető auditok listáját.
 */
export function listazAuditokat() {
  return ["mind", ...publikusAuditok()];
}

/**
 * A `listazKimenetiFormatumokat` visszaadja az elérhető exportformátumokat.
 */
export function listazKimenetiFormatumokat() {
  return ["ics", "json", "yaml", "csv", "excel"];
}

/**
 * A `betoltIcsBeallitasokat` az egységes helyi YAML ICS-blokkját tölti be a felületeknek.
 */
export async function betoltIcsBeallitasokat() {
  const eredmeny = await betoltHelyiIcsBeallitasokat();

  return {
    settings: eredmeny.settings,
    configPath: path.relative(process.cwd(), eredmeny.path),
    sourcePath: path.relative(process.cwd(), eredmeny.sourcePath),
  };
}

/**
 * Az `allitIcsBeallitasokat` az egységes helyi YAML ICS-blokkját menti.
 */
export async function allitIcsBeallitasokat(beallitasok = {}) {
  const eredmeny = await allitHelyiIcsBeallitasokat(beallitasok);

  return {
    settings: eredmeny.settings,
    configPath: path.relative(process.cwd(), eredmeny.path),
  };
}

/**
 * A `visszaallitIcsBeallitasokat` visszaállítja az egységes helyi YAML ICS-blokkját az alapértékekre.
 */
export async function visszaallitIcsBeallitasokat() {
  return allitIcsBeallitasokat(alapertelmezettHelyiIcsBeallitasok());
}

/**
 * A `epitIcsPreviewt` nem perzisztens ICS previewt készít az aktuális vagy draft beállításokból.
 */
export async function epitIcsPreviewt(beallitasok = {}, opciok = {}) {
  const eredmeny = await futtatIcsKimenetiFolyamatot(beallitasok, {
    ...opciok,
    reporter: opciok.reporter ?? createReporter(),
    writeFiles: false,
  });

  return {
    settings: eredmeny.settings,
    outputProfil: eredmeny.outputProfil,
    results: eredmeny.results,
  };
}

/**
 * A `betoltKozosPrimerFelulirasokat` a követett primer-felülírási fájlt tölti be.
 */
export async function betoltKozosPrimerFelulirasokat() {
  const utvonal = kanonikusUtvonalak.kezi.primerFelulirasok;
  const payload = (await letezik(utvonal))
    ? normalizalKozosPrimerFelulirasPayload(await betoltStrukturaltFajl(utvonal))
    : alapertelmezettKozosPrimerFelulirasPayload();

  return {
    path: utvonal,
    payload,
  };
}

/**
 * Az `allitKozosPrimerNapot` felülírja vagy törli a követett primer döntést egy napra.
 */
export async function allitKozosPrimerNapot({ monthDay, preferredNames } = {}) {
  const parsed = parseMonthDay(monthDay);

  if (!parsed) {
    throw new Error("A közös primer nap mentéséhez érvényes monthDay szükséges.");
  }

  const { path: filePath, payload } = await betoltKozosPrimerFelulirasokat();
  const dayMap = new Map((payload.days ?? []).map((entry) => [entry.monthDay, entry]));
  const nextNames = dedupeKeepOrder(preferredNames ?? []);

  if (nextNames.length === 0) {
    dayMap.delete(parsed.monthDay);
  } else {
    dayMap.set(parsed.monthDay, {
      month: parsed.month,
      day: parsed.day,
      monthDay: parsed.monthDay,
      preferredNames: nextNames,
    });
  }

  const nextPayload = normalizalKozosPrimerFelulirasPayload({
    ...payload,
    days: Array.from(dayMap.values()),
  });

  await mentStrukturaltFajl(filePath, nextPayload);

  return {
    path: filePath,
    payload: nextPayload,
    monthDay: parsed.monthDay,
    preferredNames: nextNames,
  };
}

/**
 * A `betoltHivatalosNevjegyzekKiveteleket` a követett audit-kivétellistát tölti be.
 */
export async function betoltHivatalosNevjegyzekKiveteleket() {
  const utvonal = kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek;
  const payload = (await letezik(utvonal))
    ? normalizalHivatalosNevjegyzekKivetelPayload(await betoltStrukturaltFajl(utvonal))
    : uresHivatalosNevjegyzekKivetelPayload();

  return {
    path: utvonal,
    payload,
  };
}

/**
 * Az `allitHivatalosNevjegyzekKiveteleket` menti a szerkeszthető audit-kivétellistát.
 */
export async function allitHivatalosNevjegyzekKiveteleket(payload = {}) {
  const jelenlegi = await betoltHivatalosNevjegyzekKiveteleket();
  const nextPayload = normalizalHivatalosNevjegyzekKivetelPayload({
    ...jelenlegi.payload,
    ...payload,
    forrasok: {
      ...(jelenlegi.payload?.forrasok ?? {}),
      ...(payload?.forrasok ?? {}),
    },
    genders: {
      male: {
        ...(jelenlegi.payload?.genders?.male ?? {}),
        ...(payload?.genders?.male ?? {}),
      },
      female: {
        ...(jelenlegi.payload?.genders?.female ?? {}),
        ...(payload?.genders?.female ?? {}),
      },
    },
  });

  await mentStrukturaltFajl(jelenlegi.path, nextPayload);

  return {
    path: jelenlegi.path,
    payload: nextPayload,
  };
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
  return futtatPipelineCelt(cel, {
    ...opciok,
    reporter: resolveReporter(opciok),
  });
}

/**
 * A `listazPipelineCelLista` visszaadja a felületeken megjeleníthető pipeline-célokat.
 */
export function listazPipelineCelLista() {
  return listazPipelineCelokat();
}

/**
 * A `generalKimenetet` lefuttatja a kiválasztott kimeneti generálást.
 */
export async function generalKimenetet(formatum, opciok = {}) {
  return runWithReporter(opciok, async (reporter) => {
    if (formatum === "ics") {
      const eredmeny = await futtatIcsKimenetiFolyamatot({}, {
        reporter,
        writeFiles: true,
      });
      return eredmeny.writtenPaths;
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
  });
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
    kanonikusUtvonalak.riportok.primerAudit,
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
  const reporter = resolveReporter(opciok);

  if (ellenorzes === "mind") {
    return futtatPipelineCelt("audit-futtatas", {
      ...opciok,
      reporter,
    });
  }

  if (["vegso-primer", "primer-nelkul-marado-nevek"].includes(ellenorzes)) {
    throw new Error(
      `A ${ellenorzes} külön publikus audit megszűnt. Használd helyette a primer-audit felületet.`
    );
  }

  if (ellenorzes === "primer-audit") {
    return futtatPrimerAuditFrissitest({ ...opciok, reporter });
  }

  return withReporterConsole(reporter, async () => {
    if (ellenorzes === "hivatalos-nevjegyzek") {
      const report = await futtatHivatalosNevjegyzekAuditot({
        input: kanonikusUtvonalak.adatbazis.nevnapok,
        report: kanonikusUtvonalak.riportok.hivatalosNevjegyzek,
        exceptions: kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek,
      });

      return {
        audit: ellenorzes,
        sikeres: true,
        reportPath: report.reportPath ?? kanonikusUtvonalak.riportok.hivatalosNevjegyzek,
      };
    }

    if (ellenorzes === "legacy-primer") {
      const report = await futtatLegacyPrimerAuditot({
        input: kanonikusUtvonalak.adatbazis.nevnapok,
        registry: kanonikusUtvonalak.primer.legacy,
        report: kanonikusUtvonalak.riportok.legacyPrimer,
      });

      return {
        audit: ellenorzes,
        sikeres: true,
        reportPath: report.reportPath ?? kanonikusUtvonalak.riportok.legacyPrimer,
      };
    }

    if (ellenorzes === "wiki-vs-legacy") {
      const report = await futtatWikiVsLegacyAuditot({
        legacy: kanonikusUtvonalak.primer.legacy,
        wiki: kanonikusUtvonalak.primer.wiki,
        report: kanonikusUtvonalak.riportok.wikiVsLegacy,
      });

      return {
        audit: ellenorzes,
        sikeres: true,
        reportPath: report.reportPath ?? kanonikusUtvonalak.riportok.wikiVsLegacy,
      };
    }

    if (ellenorzes === "primer-normalizalo") {
      const report = await futtatPrimerNormalizaloAuditot({
        normalized: kanonikusUtvonalak.primer.normalizaloRiport,
        legacy: kanonikusUtvonalak.primer.legacy,
        wiki: kanonikusUtvonalak.primer.wiki,
        report: kanonikusUtvonalak.riportok.primerNormalizalo,
      });

      return {
        audit: ellenorzes,
        sikeres: true,
        reportPath: report.reportPath ?? kanonikusUtvonalak.riportok.primerNormalizalo,
      };
    }

    throw new Error(`Ismeretlen audit: ${ellenorzes}`);
  });
}

/**
 * A `betoltPrimerAuditAdata` az egységes primer auditot tölti be a web GUI számára.
 */
export async function betoltPrimerAuditAdata(opciok = {}) {
  if (opciok.frissitRiport !== false) {
    await futtatPrimerAuditFrissitest({ reporter: resolveReporter(opciok) });
  }

  const [riport, helyiKonfig] = await Promise.all([
    betoltStrukturaltFajl(kanonikusUtvonalak.riportok.primerAudit),
    betoltHelyiFelhasznaloiKonfigot(),
  ]);
  const szemelyesSnapshot = alkalmazHelyiPrimerOverlaytPrimerAuditRiporton(riport, {
    localSettings: helyiKonfig.payload?.personalPrimary,
    localOverridesPayload: helyiKonfig.payload?.personalPrimary,
  });

  return {
    audit: "primer-audit",
    generatedAt: szemelyesSnapshot.generatedAt ?? null,
    reportPath: path.relative(process.cwd(), kanonikusUtvonalak.riportok.primerAudit),
    inputs: szemelyesSnapshot.inputs ?? {},
    summary: szemelyesSnapshot.summary ?? {},
    validations: szemelyesSnapshot.validations ?? {},
    personal: szemelyesSnapshot.personal ?? {},
    months: szemelyesSnapshot.months ?? [],
  };
}

/**
 * Az `allitSajatPrimerForrast` a helyi primerforrás profilját módosítja.
 */
export async function allitSajatPrimerForrast(primarySource) {
  const eredmeny = await allitHelyiPrimerForrast({ primarySource });
  await szinkronizalPrimerAuditSnapshotot();

  return {
    primarySource: eredmeny.primarySource,
    localOverridesPath: path.relative(process.cwd(), eredmeny.path),
  };
}

/**
 * Az `allitSajatPrimerBeallitasokat` a teljes helyi primerprofilt menti.
 */
export async function allitSajatPrimerBeallitasokat(beallitasok = {}) {
  const eredmeny = await allitHelyiPrimerBeallitasokat(beallitasok);
  await szinkronizalPrimerAuditSnapshotot();

  return {
    settings: eredmeny.settings,
    localOverridesPath: path.relative(process.cwd(), eredmeny.path),
  };
}

/**
 * Az `allitSajatPrimerModositot` a helyi primer egyik módosítóját kapcsolja.
 */
export async function allitSajatPrimerModositot(modosito, aktiv) {
  if (!["normalized", "ranking"].includes(modosito)) {
    throw new Error("A helyi primer módosító csak normalized vagy ranking lehet.");
  }

  const jelenlegi = await betoltHelyiPrimerBeallitasokat();
  const eredmeny = await allitHelyiPrimerBeallitasokat({
    primarySource: jelenlegi.settings.primarySource,
    modifiers: {
      ...jelenlegi.settings.modifiers,
      [modosito]: aktiv === true,
    },
  });
  await szinkronizalPrimerAuditSnapshotot();

  return {
    modifier: modosito,
    enabled: eredmeny.settings.modifiers[modosito] === true,
    settings: eredmeny.settings,
    localOverridesPath: path.relative(process.cwd(), eredmeny.path),
  };
}

/**
 * Az `allitHelyiPrimerNapot` egy teljes napi helyi primerkiegészítés-listát ment.
 */
export async function allitHelyiPrimerNapot({ monthDay, addedPreferredNames } = {}) {
  const parsed = parseMonthDay(monthDay);

  if (!parsed) {
    throw new Error("A helyi primer nap mentéséhez érvényes monthDay szükséges.");
  }

  const [helyiFelulirasok, jelenlegiBeallitasok] = await Promise.all([
    betoltHelyiPrimerFelulirasokat(),
    betoltHelyiPrimerBeallitasokat(),
  ]);
  const helyiMap = buildHelyiPrimerFelulirasMap(helyiFelulirasok.payload);
  const nextNames = dedupeKeepOrder(addedPreferredNames ?? []);

  if (nextNames.length === 0) {
    helyiMap.delete(parsed.monthDay);
  } else {
    helyiMap.set(parsed.monthDay, {
      month: parsed.month,
      day: parsed.day,
      monthDay: parsed.monthDay,
      addedPreferredNames: nextNames,
    });
  }

  const eredmeny = await allitHelyiPrimerBlokkot({
    primarySource: jelenlegiBeallitasok.settings.primarySource,
    modifiers: jelenlegiBeallitasok.settings.modifiers,
    days: Array.from(helyiMap.values()),
  });
  await szinkronizalPrimerAuditSnapshotot();

  return {
    path: eredmeny.path,
    settings: eredmeny.settings,
    monthDay: parsed.monthDay,
    addedPreferredNames: nextNames,
  };
}

async function allitHelyiPrimerKiegeszitest({ monthDay, name, selected }) {
  const helyiFelulirasok = await betoltHelyiPrimerFelulirasokat();
  const helyiMap = buildHelyiPrimerFelulirasMap(helyiFelulirasok.payload);
  const marKijelolt = tartalmazHelyiPrimerKiegeszitest(helyiMap, monthDay, name);

  if (marKijelolt === selected) {
    return {
      selected,
      changed: false,
      monthDay,
      name,
      localOverridesPath: path.relative(process.cwd(), helyiFelulirasok.path),
    };
  }

  const eredmeny = await kapcsolHelyiPrimerKiegeszitest({ monthDay, name });
  await szinkronizalPrimerAuditSnapshotot();

  return {
    selected: eredmeny.selected,
    changed: true,
    monthDay: eredmeny.monthDay,
    name: eredmeny.name,
    localOverridesPath: path.relative(process.cwd(), eredmeny.path),
  };
}

/**
 * A `hozzaadHelyiPrimerKiegeszitest` hozzáad egy nevet a helyi primerhez az adott napon.
 */
export async function hozzaadHelyiPrimerKiegeszitest({ monthDay, name }) {
  return allitHelyiPrimerKiegeszitest({
    monthDay,
    name,
    selected: true,
  });
}

/**
 * A `torolHelyiPrimerKiegeszitest` töröl egy nevet a helyi primerből az adott napon.
 */
export async function torolHelyiPrimerKiegeszitest({ monthDay, name }) {
  return allitHelyiPrimerKiegeszitest({
    monthDay,
    name,
    selected: false,
  });
}

/**
 * A `listazGoogleNaptarokat` a webes beállítási felületnek adja vissza az elérhető naptárakat.
 */
export async function listazGoogleNaptarokat(opciok = {}) {
  return listazGoogleNaptarakat({
    reporter: resolveReporter(opciok),
  });
}

/**
 * A `torolGoogleNaptarat` a Google Naptár admin művelet webes backendje.
 */
export async function torolGoogleNaptarat(opciok = {}) {
  return vegrehajtGoogleNaptarTorloMuveletet({
    ...opciok,
    reporter: resolveReporter(opciok),
  });
}
