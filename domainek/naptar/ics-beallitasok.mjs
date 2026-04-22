/**
 * domainek/naptar/ics-beallitasok.mjs
 * Egységes ICS-beállításmodell a helyi YAML-hoz, a webes beállításnézethez és az alkalmazásszintű szolgáltatásokhoz.
 */

import path from "node:path";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";

const ERVENYES_ICS_PARTITION_MODE_ERTEKEK = new Set(["single", "split"]);
const ERVENYES_ICS_LAYOUT_ERTEKEK = new Set(["grouped", "separate"]);
const ERVENYES_ICS_LEAP_PROFILE_ERTEKEK = new Set([
  "off",
  "hungarian-a",
  "hungarian-b",
  "hungarian-both",
]);
const ERVENYES_ICS_DESCRIPTION_MODE_ERTEKEK = new Set(["none", "compact", "detailed"]);
const ERVENYES_ICS_DESCRIPTION_FORMAT_ERTEKEK = new Set(["text", "html", "full"]);
const ERVENYES_ICS_ORDINAL_DAY_ERTEKEK = new Set(["none", "summary", "description"]);
const ERVENYES_ICS_OUTPUT_MODE_ERTEKEK = new Set(["common", "split", "personal"]);

function projektRelativUtvonal(utvonal) {
  const normalizalt = path.normalize(String(utvonal ?? "").trim());

  if (!normalizalt) {
    return null;
  }

  if (!path.isAbsolute(normalizalt)) {
    return normalizalt;
  }

  const relativ = path.relative(process.cwd(), normalizalt);

  if (relativ && !relativ.startsWith("..") && !path.isAbsolute(relativ)) {
    return relativ;
  }

  return normalizalt;
}

function normalizalBeallitasiUtvonal(ertek, alapertelmezett) {
  if (ertek == null || String(ertek).trim() === "") {
    return alapertelmezett;
  }

  return projektRelativUtvonal(ertek);
}

function normalizalSzamErteket(ertek, alapertelmezett) {
  return Number.isInteger(ertek) ? ertek : alapertelmezett;
}

function normalizalEnumErteket(ertek, ervenyesErtekek, alapertelmezett) {
  return ervenyesErtekek.has(ertek) ? ertek : alapertelmezett;
}

export function szarmaztatottKimenetiUtvonal(utvonal, utotag) {
  const parsed = path.parse(utvonal);
  const ext = parsed.ext || ".ics";
  return path.join(parsed.dir, `${parsed.name}-${utotag}${ext}`);
}

function alapertelmezettIcsNaptarBeallitasok({
  output,
  calendarName,
  layout = "grouped",
  descriptionMode = "none",
  descriptionFormat = "text",
  ordinalDay = "none",
  includeOtherDays = false,
} = {}) {
  return {
    output,
    layout,
    descriptionMode,
    descriptionFormat,
    ordinalDay,
    includeOtherDays,
    calendarName,
  };
}

function alapertelmezettMegosztottIcsBeallitasok() {
  return {
    input: projektRelativUtvonal(kanonikusUtvonalak.adatbazis.nevnapok),
    leapProfile: "off",
    fromYear: new Date().getFullYear(),
    untilYear: 2040,
    baseYear: 2024,
  };
}

export function alapertelmezettIcsBeallitasok() {
  const singleOutput = projektRelativUtvonal(kanonikusUtvonalak.naptar.alap);
  const splitPrimaryOutput = szarmaztatottKimenetiUtvonal(singleOutput, "primary");
  const splitRestOutput = szarmaztatottKimenetiUtvonal(singleOutput, "rest");

  return {
    partitionMode: "single",
    shared: alapertelmezettMegosztottIcsBeallitasok(),
    single: alapertelmezettIcsNaptarBeallitasok({
      output: singleOutput,
      calendarName: "Névnapok",
    }),
    split: {
      primary: alapertelmezettIcsNaptarBeallitasok({
        output: splitPrimaryOutput,
        calendarName: "Névnapok — elsődleges",
      }),
      rest: alapertelmezettIcsNaptarBeallitasok({
        output: splitRestOutput,
        calendarName: "Névnapok — további",
      }),
    },
  };
}

function alapertelmezettLegacyIcsBeallitasok() {
  const alap = alapertelmezettIcsBeallitasok();

  return {
    input: alap.shared.input,
    output: alap.single.output,
    primaryOutput: null,
    restOutput: null,
    personalOutput: projektRelativUtvonal(kanonikusUtvonalak.naptar.sajat),
    outputMode: "common",
    scope: "all",
    layout: alap.single.layout,
    restHandling: "hidden",
    restLayout: null,
    leapProfile: alap.shared.leapProfile,
    fromYear: alap.shared.fromYear,
    untilYear: alap.shared.untilYear,
    baseYear: alap.shared.baseYear,
    descriptionMode: alap.single.descriptionMode,
    descriptionFormat: alap.single.descriptionFormat,
    ordinalDay: alap.single.ordinalDay,
    includeOtherDays: alap.single.includeOtherDays,
    calendarName: alap.single.calendarName,
  };
}

function normalizalIcsNaptarBeallitasokat(naptarBeallitasok = {}, alap = {}) {
  return {
    output: normalizalBeallitasiUtvonal(naptarBeallitasok?.output, alap.output),
    layout: normalizalEnumErteket(
      naptarBeallitasok?.layout,
      ERVENYES_ICS_LAYOUT_ERTEKEK,
      alap.layout
    ),
    descriptionMode: normalizalEnumErteket(
      naptarBeallitasok?.descriptionMode,
      ERVENYES_ICS_DESCRIPTION_MODE_ERTEKEK,
      alap.descriptionMode
    ),
    descriptionFormat: normalizalEnumErteket(
      naptarBeallitasok?.descriptionFormat,
      ERVENYES_ICS_DESCRIPTION_FORMAT_ERTEKEK,
      alap.descriptionFormat
    ),
    ordinalDay: normalizalEnumErteket(
      naptarBeallitasok?.ordinalDay,
      ERVENYES_ICS_ORDINAL_DAY_ERTEKEK,
      alap.ordinalDay
    ),
    includeOtherDays: naptarBeallitasok?.includeOtherDays === true,
    calendarName:
      String(naptarBeallitasok?.calendarName ?? alap.calendarName).trim() || alap.calendarName,
  };
}

function migralLegacyIcsBeallitasokat(beallitasok = {}) {
  const legacyAlap = alapertelmezettLegacyIcsBeallitasok();
  const sharedAlap = alapertelmezettMegosztottIcsBeallitasok();
  const outputMode = normalizalEnumErteket(
    beallitasok?.outputMode,
    ERVENYES_ICS_OUTPUT_MODE_ERTEKEK,
    legacyAlap.outputMode
  );
  const baseOutput = normalizalBeallitasiUtvonal(beallitasok?.output, legacyAlap.output);
  const baseCalendarName =
    String(beallitasok?.calendarName ?? legacyAlap.calendarName).trim() || legacyAlap.calendarName;
  const baseLayout = normalizalEnumErteket(
    beallitasok?.layout,
    ERVENYES_ICS_LAYOUT_ERTEKEK,
    legacyAlap.layout
  );
  const baseDescriptionMode = normalizalEnumErteket(
    beallitasok?.descriptionMode,
    ERVENYES_ICS_DESCRIPTION_MODE_ERTEKEK,
    legacyAlap.descriptionMode
  );
  const baseDescriptionFormat = normalizalEnumErteket(
    beallitasok?.descriptionFormat,
    ERVENYES_ICS_DESCRIPTION_FORMAT_ERTEKEK,
    legacyAlap.descriptionFormat
  );
  const baseOrdinalDay = normalizalEnumErteket(
    beallitasok?.ordinalDay,
    ERVENYES_ICS_ORDINAL_DAY_ERTEKEK,
    legacyAlap.ordinalDay
  );
  const includeOtherDays = beallitasok?.includeOtherDays === true;
  const restLayout = normalizalEnumErteket(
    beallitasok?.restLayout,
    ERVENYES_ICS_LAYOUT_ERTEKEK,
    baseLayout
  );
  const derivedSplitPrimaryOutput =
    normalizalBeallitasiUtvonal(beallitasok?.primaryOutput, null) ??
    szarmaztatottKimenetiUtvonal(baseOutput, "primary");
  const derivedSplitRestOutput =
    normalizalBeallitasiUtvonal(beallitasok?.restOutput, null) ??
    szarmaztatottKimenetiUtvonal(baseOutput, "rest");
  const migratedPersonalPrimaryOutput =
    normalizalBeallitasiUtvonal(beallitasok?.personalOutput, null) ??
    szarmaztatottKimenetiUtvonal(baseOutput, "primary");

  return {
    partitionMode: outputMode === "common" ? "single" : "split",
    shared: {
      input: normalizalBeallitasiUtvonal(beallitasok?.input, sharedAlap.input),
      leapProfile: normalizalEnumErteket(
        beallitasok?.leapProfile,
        ERVENYES_ICS_LEAP_PROFILE_ERTEKEK,
        sharedAlap.leapProfile
      ),
      fromYear: normalizalSzamErteket(beallitasok?.fromYear, sharedAlap.fromYear),
      untilYear: normalizalSzamErteket(beallitasok?.untilYear, sharedAlap.untilYear),
      baseYear: normalizalSzamErteket(beallitasok?.baseYear, sharedAlap.baseYear),
    },
    single: alapertelmezettIcsNaptarBeallitasok({
      output: baseOutput,
      layout: baseLayout,
      descriptionMode: baseDescriptionMode,
      descriptionFormat: baseDescriptionFormat,
      ordinalDay: baseOrdinalDay,
      includeOtherDays,
      calendarName: baseCalendarName,
    }),
    split: {
      primary: alapertelmezettIcsNaptarBeallitasok({
        output: outputMode === "personal" ? migratedPersonalPrimaryOutput : derivedSplitPrimaryOutput,
        layout: baseLayout,
        descriptionMode: baseDescriptionMode,
        descriptionFormat: baseDescriptionFormat,
        ordinalDay: baseOrdinalDay,
        includeOtherDays,
        calendarName: `${baseCalendarName} — elsődleges`,
      }),
      rest: alapertelmezettIcsNaptarBeallitasok({
        output:
          outputMode === "personal"
            ? szarmaztatottKimenetiUtvonal(migratedPersonalPrimaryOutput, "rest")
            : derivedSplitRestOutput,
        layout: restLayout,
        descriptionMode: baseDescriptionMode,
        descriptionFormat: baseDescriptionFormat,
        ordinalDay: baseOrdinalDay,
        includeOtherDays,
        calendarName: `${baseCalendarName} — további`,
      }),
    },
  };
}

export function egyesitIcsBeallitasokat(alap, felulirasok = {}) {
  return {
    ...(alap ?? {}),
    ...(felulirasok ?? {}),
    shared: {
      ...(alap?.shared ?? {}),
      ...(felulirasok?.shared ?? {}),
    },
    single: {
      ...(alap?.single ?? {}),
      ...(felulirasok?.single ?? {}),
    },
    split: {
      primary: {
        ...(alap?.split?.primary ?? {}),
        ...(felulirasok?.split?.primary ?? {}),
      },
      rest: {
        ...(alap?.split?.rest ?? {}),
        ...(felulirasok?.split?.rest ?? {}),
      },
    },
  };
}

export function normalizalIcsBeallitasokat(beallitasok = {}) {
  const alap = alapertelmezettIcsBeallitasok();
  const legacyLike =
    !beallitasok?.shared &&
    !beallitasok?.single &&
    !beallitasok?.split &&
    (Object.prototype.hasOwnProperty.call(beallitasok ?? {}, "outputMode") ||
      Object.prototype.hasOwnProperty.call(beallitasok ?? {}, "scope") ||
      Object.prototype.hasOwnProperty.call(beallitasok ?? {}, "personalOutput") ||
      Object.prototype.hasOwnProperty.call(beallitasok ?? {}, "restHandling"));
  const migrated = legacyLike ? migralLegacyIcsBeallitasokat(beallitasok) : beallitasok;
  const merged = egyesitIcsBeallitasokat(alap, migrated);
  const normalizedSingleOutput = normalizalBeallitasiUtvonal(
    merged?.single?.output,
    alap.single.output
  );
  const normalizedSplitPrimaryOutput = normalizalBeallitasiUtvonal(
    merged?.split?.primary?.output,
    szarmaztatottKimenetiUtvonal(normalizedSingleOutput, "primary")
  );
  const normalizedSplitRestOutput = normalizalBeallitasiUtvonal(
    merged?.split?.rest?.output,
    szarmaztatottKimenetiUtvonal(normalizedSingleOutput, "rest")
  );

  return {
    partitionMode: normalizalEnumErteket(
      merged?.partitionMode,
      ERVENYES_ICS_PARTITION_MODE_ERTEKEK,
      alap.partitionMode
    ),
    shared: {
      input: normalizalBeallitasiUtvonal(merged?.shared?.input, alap.shared.input),
      leapProfile: normalizalEnumErteket(
        merged?.shared?.leapProfile,
        ERVENYES_ICS_LEAP_PROFILE_ERTEKEK,
        alap.shared.leapProfile
      ),
      fromYear: normalizalSzamErteket(merged?.shared?.fromYear, alap.shared.fromYear),
      untilYear: normalizalSzamErteket(merged?.shared?.untilYear, alap.shared.untilYear),
      baseYear: normalizalSzamErteket(merged?.shared?.baseYear, alap.shared.baseYear),
    },
    single: normalizalIcsNaptarBeallitasokat(
      {
        ...merged.single,
        output: normalizedSingleOutput,
      },
      {
        ...alap.single,
        output: normalizedSingleOutput,
      }
    ),
    split: {
      primary: normalizalIcsNaptarBeallitasokat(
        {
          ...merged?.split?.primary,
          output: normalizedSplitPrimaryOutput,
        },
        {
          ...alap.split.primary,
          output: normalizedSplitPrimaryOutput,
        }
      ),
      rest: normalizalIcsNaptarBeallitasokat(
        {
          ...merged?.split?.rest,
          output: normalizedSplitRestOutput,
        },
        {
          ...alap.split.rest,
          output: normalizedSplitRestOutput,
        }
      ),
    },
  };
}

function listazLeapValtozatokat(utvonal, leapProfile) {
  if (!utvonal) {
    return [];
  }

  if (leapProfile !== "hungarian-both") {
    return [utvonal];
  }

  return [
    utvonal,
    szarmaztatottKimenetiUtvonal(utvonal, "A"),
    szarmaztatottKimenetiUtvonal(utvonal, "B"),
  ];
}

function buildGeneratorOptions(shared, calendarSettings) {
  return {
    input: shared.input,
    output: calendarSettings.output,
    scope: "all",
    layout: calendarSettings.layout,
    restHandling: "hidden",
    restLayout: null,
    leapProfile: shared.leapProfile,
    fromYear: shared.fromYear,
    untilYear: shared.untilYear,
    baseYear: shared.baseYear,
    descriptionMode: calendarSettings.descriptionMode,
    descriptionFormat: calendarSettings.descriptionFormat,
    ordinalDay: calendarSettings.ordinalDay,
    includeOtherDays: calendarSettings.includeOtherDays,
    calendarName: calendarSettings.calendarName,
  };
}

export function epitIcsOutputProfilt(beallitasok = {}) {
  const settings = normalizalIcsBeallitasokat(beallitasok);

  if (settings.partitionMode === "split") {
    return {
      settings,
      partitionMode: "split",
      activeBaseOutputs: [settings.split.primary.output, settings.split.rest.output],
      split: {
        primary: {
          generatorOptions: buildGeneratorOptions(settings.shared, settings.split.primary),
        },
        rest: {
          generatorOptions: buildGeneratorOptions(settings.shared, settings.split.rest),
        },
      },
    };
  }

  return {
    settings,
    partitionMode: "single",
    activeBaseOutputs: [settings.single.output],
    single: {
      generatorOptions: buildGeneratorOptions(settings.shared, settings.single),
    },
  };
}

export function listazIcsMenedzseltKimeneteket(beallitasok = {}) {
  const settings = normalizalIcsBeallitasokat(beallitasok);
  const managed = new Set();

  for (const utvonal of [
    settings.single.output,
    settings.split.primary.output,
    settings.split.rest.output,
  ]) {
    for (const valtozat of listazLeapValtozatokat(utvonal, settings.shared.leapProfile)) {
      managed.add(path.resolve(process.cwd(), valtozat));
    }
  }

  return Array.from(managed);
}

export function icsErtekCimke(kulcs, ertek) {
  const cimkek = {
    partitionMode: {
      single: "egy naptár, minden névnap",
      split: "elsődleges + további külön",
    },
    "shared.leapProfile": {
      off: "kikapcsolva",
      "hungarian-a": "magyar A",
      "hungarian-b": "magyar B",
      "hungarian-both": "magyar A + B",
    },
    "single.layout": {
      grouped: "naponta együtt",
      separate: "külön",
    },
    "split.primary.layout": {
      grouped: "naponta együtt",
      separate: "külön",
    },
    "split.rest.layout": {
      grouped: "naponta együtt",
      separate: "külön",
    },
    "single.descriptionMode": {
      none: "nincs",
      compact: "tömör",
      detailed: "részletes",
    },
    "split.primary.descriptionMode": {
      none: "nincs",
      compact: "tömör",
      detailed: "részletes",
    },
    "split.rest.descriptionMode": {
      none: "nincs",
      compact: "tömör",
      detailed: "részletes",
    },
    "single.descriptionFormat": {
      text: "szöveg",
      html: "HTML",
      full: "szöveg + HTML",
    },
    "split.primary.descriptionFormat": {
      text: "szöveg",
      html: "HTML",
      full: "szöveg + HTML",
    },
    "split.rest.descriptionFormat": {
      text: "szöveg",
      html: "HTML",
      full: "szöveg + HTML",
    },
    "single.ordinalDay": {
      none: "nincs",
      summary: "címben",
      description: "leírásban",
    },
    "split.primary.ordinalDay": {
      none: "nincs",
      summary: "címben",
      description: "leírásban",
    },
    "split.rest.ordinalDay": {
      none: "nincs",
      summary: "címben",
      description: "leírásban",
    },
  };

  if (typeof ertek === "boolean") {
    return ertek ? "igen" : "nem";
  }

  if (typeof ertek === "number") {
    return String(ertek);
  }

  const tabla = cimkek[kulcs];

  if (tabla && typeof tabla === "object") {
    return tabla[ertek] ?? String(ertek);
  }

  return String(ertek);
}

export const ICS_BEALLITAS_DEFINICIOK = [
  {
    kulcs: "partitionMode",
    cimke: "Naptárfelosztás",
    tipus: "enum",
    ertekek: ["single", "split"],
    rovidLeiras:
      "Azt szabályozza, hogy egyetlen, minden nevet tartalmazó naptár készüljön, vagy külön elsődleges és külön további naptár jöjjön létre.",
    ertekLeirasok: {
      single:
        "Pontosan egy ICS készül, és abba minden névnap bekerül. Ebben a módban nincs primerbontás.",
      split:
        "Két ICS készül: külön az auditban véglegesített elsődleges nevekkel, és külön a maradék nevekkel.",
    },
  },
  {
    kulcs: "shared.leapProfile",
    cimke: "Szökőéves profil",
    tipus: "enum",
    ertekek: ["off", "hungarian-a", "hungarian-b", "hungarian-both"],
    rovidLeiras:
      "Minden generált naptárra közösen vonatkozik. Meghatározza a szökőnap körüli magyar kompatibilitási viselkedést.",
    ertekLeirasok: {
      off: "Nincs külön szökőéves eltolási profil.",
      "hungarian-a": "A magyar A változat szerinti kompatibilis eltolás érvényesül.",
      "hungarian-b": "A magyar B változat szerinti kompatibilis eltolás érvényesül.",
      "hungarian-both":
        "Mindkét magyar változat külön fájlváltozatban készül el, -A és -B utótaggal.",
    },
  },
  {
    kulcs: "shared.fromYear",
    cimke: "Kezdő év",
    tipus: "number",
    min: 1900,
    max: 2100,
    step: 1,
    rovidLeiras: "A generált naptárak első éve.",
  },
  {
    kulcs: "shared.untilYear",
    cimke: "Utolsó év",
    tipus: "number",
    min: 1900,
    max: 2100,
    step: 1,
    rovidLeiras: "A generált naptárak utolsó éve.",
  },
  {
    kulcs: "single.layout",
    cimke: "Egyfájlos elrendezés",
    tipus: "enum",
    ertekek: ["grouped", "separate"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "single",
    rovidLeiras:
      "Az egyetlen, minden nevet tartalmazó naptár eseményszerkezete: naponta együtt vagy névenként külön.",
    ertekLeirasok: {
      grouped: "Naponta egy közös esemény készül az adott nap összes nevével.",
      separate: "Minden név külön eseményt kap ugyanabban az egyetlen naptárban.",
    },
  },
  {
    kulcs: "single.descriptionMode",
    cimke: "Egyfájlos leírás",
    tipus: "enum",
    ertekek: ["none", "compact", "detailed"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "single",
    rovidLeiras: "Az egyetlen naptár eseményleírásainak részletessége.",
  },
  {
    kulcs: "single.descriptionFormat",
    cimke: "Egyfájlos leírásformátum",
    tipus: "enum",
    ertekek: ["text", "html", "full"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "single",
    rovidLeiras: "Az egyetlen naptár eseményleírásainak formátuma.",
  },
  {
    kulcs: "single.ordinalDay",
    cimke: "Egyfájlos évnapja",
    tipus: "enum",
    ertekek: ["none", "summary", "description"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "single",
    rovidLeiras: "Az év napja információ megjelenítése az egyetlen naptárban.",
  },
  {
    kulcs: "single.includeOtherDays",
    cimke: "Egyfájlos további napok",
    tipus: "boolean",
    lathato: (beallitasok) => beallitasok?.partitionMode === "single",
    rovidLeiras:
      "Az egyetlen naptár eseményleírása tartalmazza-e az adott név további névnapjait is.",
  },
  {
    kulcs: "split.primary.layout",
    cimke: "Elsődleges elrendezés",
    tipus: "enum",
    ertekek: ["grouped", "separate"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras: "Az elsődleges naptár eseményszerkezete.",
  },
  {
    kulcs: "split.primary.descriptionMode",
    cimke: "Elsődleges leírás",
    tipus: "enum",
    ertekek: ["none", "compact", "detailed"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras: "Az elsődleges naptár eseményleírásainak részletessége.",
  },
  {
    kulcs: "split.primary.descriptionFormat",
    cimke: "Elsődleges leírásformátum",
    tipus: "enum",
    ertekek: ["text", "html", "full"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras: "Az elsődleges naptár eseményleírásainak formátuma.",
  },
  {
    kulcs: "split.primary.ordinalDay",
    cimke: "Elsődleges évnapja",
    tipus: "enum",
    ertekek: ["none", "summary", "description"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras: "Az év napja információ megjelenítése az elsődleges naptárban.",
  },
  {
    kulcs: "split.primary.includeOtherDays",
    cimke: "Elsődleges további napok",
    tipus: "boolean",
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras:
      "Az elsődleges naptár eseményleírása tartalmazza-e az adott név további névnapjait is.",
  },
  {
    kulcs: "split.rest.layout",
    cimke: "További elrendezés",
    tipus: "enum",
    ertekek: ["grouped", "separate"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras: "A további naptár eseményszerkezete.",
  },
  {
    kulcs: "split.rest.descriptionMode",
    cimke: "További leírás",
    tipus: "enum",
    ertekek: ["none", "compact", "detailed"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras: "A további naptár eseményleírásainak részletessége.",
  },
  {
    kulcs: "split.rest.descriptionFormat",
    cimke: "További leírásformátum",
    tipus: "enum",
    ertekek: ["text", "html", "full"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras: "A további naptár eseményleírásainak formátuma.",
  },
  {
    kulcs: "split.rest.ordinalDay",
    cimke: "További évnapja",
    tipus: "enum",
    ertekek: ["none", "summary", "description"],
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras: "Az év napja információ megjelenítése a további naptárban.",
  },
  {
    kulcs: "split.rest.includeOtherDays",
    cimke: "További napok listája",
    tipus: "boolean",
    lathato: (beallitasok) => beallitasok?.partitionMode === "split",
    rovidLeiras:
      "A további naptár eseményleírása tartalmazza-e az adott név további névnapjait is.",
  },
];
