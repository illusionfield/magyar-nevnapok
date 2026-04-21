/**
 * domainek/szolgaltatasok.mjs
 * A CLI és a TUI közös alkalmazásszintű szolgáltatásai.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { futtatPipelineCelt, listazPipelineAllapot, listazPipelineCelokat } from "../pipeline/futtato.mjs";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import { futtatNodeFolyamat } from "../kozos/parancs-futtatas.mjs";
import { kanonikusUtvonalak } from "../kozos/utvonalak.mjs";
import { letezik } from "../kozos/fajlrendszer.mjs";
import {
  alapertelmezettHelyiIcsBeallitasok,
  allitHelyiIcsBeallitasokat,
  betoltHelyiFelhasznaloiKonfigot,
  betoltHelyiIcsBeallitasokat,
} from "./helyi-konfig.mjs";
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
import {
  alkalmazHelyiPrimerOverlaytPrimerAuditRiporton,
  buildPrimerAuditVeglegesitettPrimerPayload,
} from "./auditok/primer-audit.mjs";

const aktualisKonyvtar = path.dirname(fileURLToPath(import.meta.url));

/**
 * A `modulUtvonal` a modul relatív útvonalát abszolút projektútvonallá alakítja.
 */
function modulUtvonal(relativ) {
  return path.resolve(aktualisKonyvtar, "..", relativ);
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
  const tukrozzStdout = opciok.tukrozzStdout ?? true;
  const tukrozzStderr = opciok.tukrozzStderr ?? true;
  const kozosFuttatasiOpciok = {
    tukrozzStdout,
    tukrozzStderr,
  };
  const primerAuditLepesek = [
    {
      modul: "domainek/auditok/wiki-vs-legacy.mjs",
      argumentumok: [
        "--legacy",
        kanonikusUtvonalak.primer.legacy,
        "--wiki",
        kanonikusUtvonalak.primer.wiki,
        "--report",
        kanonikusUtvonalak.riportok.wikiVsLegacy,
      ],
    },
    {
      modul: "domainek/primer/normalizalo-riport.mjs",
      argumentumok: [
        "--input",
        kanonikusUtvonalak.adatbazis.nevnapok,
        "--diff",
        kanonikusUtvonalak.riportok.wikiVsLegacy,
        "--output",
        kanonikusUtvonalak.primer.normalizaloRiport,
      ],
    },
    {
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
    },
    {
      modul: "domainek/auditok/primer-audit.mjs",
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
        "--local",
        kanonikusUtvonalak.helyi.nevnapokKonfig,
        "--report",
        kanonikusUtvonalak.riportok.primerAudit,
      ],
    },
  ];

  if (opciok.force === true || !(await letezik(kanonikusUtvonalak.adatbazis.nevnapok))) {
    await futtatPipelineCelt("portal-nevadatbazis-epites", {
      force: opciok.force === true,
    });
  }

  for (const lepes of primerAuditLepesek) {
    await futtatNodeFolyamat(modulUtvonal(lepes.modul), lepes.argumentumok, kozosFuttatasiOpciok);
  }

  return {
    audit: "primer-audit",
    sikeres: true,
    reportPath: kanonikusUtvonalak.riportok.primerAudit,
  };
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
  "primer-audit": {
    modul: "domainek/auditok/primer-audit.mjs",
    reportPath: kanonikusUtvonalak.riportok.primerAudit,
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
      "--local",
      kanonikusUtvonalak.helyi.nevnapokKonfig,
      "--report",
      kanonikusUtvonalak.riportok.primerAudit,
    ],
  },
};

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
 * A `generalKimenetet` lefuttatja a kiválasztott kimeneti generálást.
 */
export async function generalKimenetet(formatum, opciok = {}) {
  if (formatum === "ics") {
    const helyiIcsBeallitasok = await betoltHelyiIcsBeallitasokat();
    const helyiSzemelyesPrimer = helyiIcsBeallitasok.payload?.personalPrimary ?? null;
    const kozpontiBeallitasok = normalizalIcsBeallitasokat(
      egyesitIcsBeallitasokat(helyiIcsBeallitasok.settings, opciok)
    );
    const outputProfil = epitIcsOutputProfilt(kozpontiBeallitasok);
    const futasiTervek = [];

    if (outputProfil.partitionMode === "single") {
      if (
        (helyiSzemelyesPrimer?.days?.length ?? 0) > 0 ||
        vanNemAlapertelmezettHelyiPrimerBeallitas(helyiSzemelyesPrimer)
      ) {
        console.log(
          "Megjegyzés: az egyfájlos ICS-ben nincs primerbontás, ezért a Primer audit helyi overlaye most nem módosítja a kimenetet."
        );
      }

      futasiTervek.push(
        await epitIcsKimenetiTervet(outputProfil.single.generatorOptions)
      );
    } else {
      await futtatPrimerAuditFrissitest({
        tukrozzStdout: false,
        tukrozzStderr: false,
      });

      const [nevadatbazisPayload, primerAuditRiport] = await Promise.all([
        betoltStrukturaltFajl(path.resolve(process.cwd(), kozpontiBeallitasok.shared.input)),
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
      futasiTervek.flatMap((terv) => terv.plannedOutputPaths).map((utvonal) => path.resolve(utvonal))
    );
    const torlendoKimenetek = listazIcsMenedzseltKimeneteket(kozpontiBeallitasok).filter(
      (utvonal) => !aktivKimenetek.has(path.resolve(utvonal))
    );

    await torolIcsKimeneteket(torlendoKimenetek);
    const writtenPaths = [];

    for (const terv of futasiTervek) {
      const eredmeny = await vegrehajtIcsKimenetiTervet(terv);

      for (const result of eredmeny.results) {
        console.log(`Mentve: ${result.eventCount} esemény ide: ${result.outputPath}`);
      }

      writtenPaths.push(...eredmeny.writtenPaths);
    }

    return writtenPaths;
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
  if (ellenorzes === "mind") {
    return futtatPipelineCelt("audit-futtatas", opciok);
  }

  if (["vegso-primer", "primer-nelkul-marado-nevek"].includes(ellenorzes)) {
    throw new Error(
      `A ${ellenorzes} külön publikus audit megszűnt. Használd helyette a primer-audit felületet.`
    );
  }

  if (ellenorzes === "primer-audit") {
    return futtatPrimerAuditFrissitest(opciok);
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
 * A `betoltPrimerAuditAdata` az egységes primer auditot tölti be CLI-hez és TUI-hoz.
 */
export async function betoltPrimerAuditAdata(opciok = {}) {
  if (opciok.frissitRiport !== false) {
    await futtatPrimerAuditFrissitest({
      tukrozzStdout: false,
      tukrozzStderr: false,
    });
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
