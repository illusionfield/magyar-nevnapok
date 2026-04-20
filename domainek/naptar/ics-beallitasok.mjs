/**
 * domainek/naptar/ics-beallitasok.mjs
 * Közös ICS-beállításmodell a helyi YAML-hoz, a TUI-hoz és az alkalmazásszintű szolgáltatásokhoz.
 */

import path from "node:path";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";

const ERVENYES_ICS_OUTPUT_MODE_ERTEKEK = new Set(["common", "split", "personal"]);
const ERVENYES_ICS_SCOPE_ERTEKEK = new Set(["all", "primary"]);
const ERVENYES_ICS_LAYOUT_ERTEKEK = new Set(["grouped", "separate"]);
const ERVENYES_ICS_REST_HANDLING_ERTEKEK = new Set([
  "hidden",
  "description",
  "daily-event",
  "split",
]);
const ERVENYES_ICS_LEAP_PROFILE_ERTEKEK = new Set([
  "off",
  "hungarian-a",
  "hungarian-b",
  "hungarian-both",
]);
const ERVENYES_ICS_DESCRIPTION_MODE_ERTEKEK = new Set(["none", "compact", "detailed"]);
const ERVENYES_ICS_DESCRIPTION_FORMAT_ERTEKEK = new Set(["text", "html", "full"]);
const ERVENYES_ICS_ORDINAL_DAY_ERTEKEK = new Set(["none", "summary", "description"]);

/**
 * A `projektRelativUtvonal` projektgyökérhez viszonyított, stabilan menthető útvonalat készít.
 */
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

function normalizalOpcionisBeallitasiUtvonal(ertek, alapertelmezett = null) {
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

/**
 * A `szarmaztatottKimenetiUtvonal` utótagot illeszt a fájlnévhez.
 */
export function szarmaztatottKimenetiUtvonal(utvonal, utotag) {
  const parsed = path.parse(utvonal);
  const ext = parsed.ext || ".ics";
  return path.join(parsed.dir, `${parsed.name}-${utotag}${ext}`);
}

/**
 * Az `alapertelmezettIcsBeallitasok` a teljes, közös ICS-blokk alapértékeit adja.
 */
export function alapertelmezettIcsBeallitasok() {
  return {
    input: projektRelativUtvonal(kanonikusUtvonalak.adatbazis.nevnapok),
    output: projektRelativUtvonal(kanonikusUtvonalak.naptar.alap),
    primaryOutput: null,
    restOutput: null,
    personalOutput: projektRelativUtvonal(kanonikusUtvonalak.naptar.sajat),
    outputMode: "common",
    scope: "all",
    layout: "grouped",
    restHandling: "hidden",
    restLayout: null,
    leapProfile: "off",
    fromYear: new Date().getFullYear(),
    untilYear: 2040,
    baseYear: 2024,
    descriptionMode: "none",
    descriptionFormat: "text",
    ordinalDay: "none",
    includeOtherDays: false,
    calendarName: "Névnapok",
  };
}

/**
 * A `normalizalIcsBeallitasokat` stabil, menthető és felhasználóbarát ICS-profilt ad vissza.
 */
export function normalizalIcsBeallitasokat(beallitasok = {}) {
  const alap = alapertelmezettIcsBeallitasok();
  const normalizalt = {
    input: normalizalBeallitasiUtvonal(beallitasok?.input, alap.input),
    output: normalizalBeallitasiUtvonal(beallitasok?.output, alap.output),
    primaryOutput: normalizalOpcionisBeallitasiUtvonal(beallitasok?.primaryOutput),
    restOutput: normalizalOpcionisBeallitasiUtvonal(beallitasok?.restOutput),
    personalOutput: normalizalBeallitasiUtvonal(
      beallitasok?.personalOutput,
      alap.personalOutput
    ),
    outputMode: normalizalEnumErteket(
      beallitasok?.outputMode,
      ERVENYES_ICS_OUTPUT_MODE_ERTEKEK,
      alap.outputMode
    ),
    scope: normalizalEnumErteket(beallitasok?.scope, ERVENYES_ICS_SCOPE_ERTEKEK, alap.scope),
    layout: normalizalEnumErteket(
      beallitasok?.layout,
      ERVENYES_ICS_LAYOUT_ERTEKEK,
      alap.layout
    ),
    restHandling: normalizalEnumErteket(
      beallitasok?.restHandling,
      ERVENYES_ICS_REST_HANDLING_ERTEKEK,
      alap.restHandling
    ),
    restLayout:
      beallitasok?.restLayout == null || String(beallitasok.restLayout).trim() === ""
        ? null
        : normalizalEnumErteket(
            beallitasok.restLayout,
            ERVENYES_ICS_LAYOUT_ERTEKEK,
            alap.layout
          ),
    leapProfile: normalizalEnumErteket(
      beallitasok?.leapProfile,
      ERVENYES_ICS_LEAP_PROFILE_ERTEKEK,
      alap.leapProfile
    ),
    fromYear: normalizalSzamErteket(beallitasok?.fromYear, alap.fromYear),
    untilYear: normalizalSzamErteket(beallitasok?.untilYear, alap.untilYear),
    baseYear: normalizalSzamErteket(beallitasok?.baseYear, alap.baseYear),
    descriptionMode: normalizalEnumErteket(
      beallitasok?.descriptionMode,
      ERVENYES_ICS_DESCRIPTION_MODE_ERTEKEK,
      alap.descriptionMode
    ),
    descriptionFormat: normalizalEnumErteket(
      beallitasok?.descriptionFormat,
      ERVENYES_ICS_DESCRIPTION_FORMAT_ERTEKEK,
      alap.descriptionFormat
    ),
    ordinalDay: normalizalEnumErteket(
      beallitasok?.ordinalDay,
      ERVENYES_ICS_ORDINAL_DAY_ERTEKEK,
      alap.ordinalDay
    ),
    includeOtherDays: beallitasok?.includeOtherDays === true,
    calendarName: String(beallitasok?.calendarName ?? alap.calendarName).trim() || alap.calendarName,
  };

  if (normalizalt.outputMode === "split") {
    normalizalt.scope = "primary";
    normalizalt.restHandling = "split";
    normalizalt.restLayout = normalizalt.restLayout ?? normalizalt.layout;
    return normalizalt;
  }

  if (normalizalt.outputMode === "personal") {
    normalizalt.scope = "primary";
  }

  if (normalizalt.scope === "all") {
    normalizalt.restHandling = "hidden";
  } else if (normalizalt.restHandling === "split") {
    normalizalt.restHandling = "hidden";
  }

  return normalizalt;
}

function listazLeapValtozatokat(utvonal) {
  if (!utvonal) {
    return [];
  }

  return [
    utvonal,
    szarmaztatottKimenetiUtvonal(utvonal, "A"),
    szarmaztatottKimenetiUtvonal(utvonal, "B"),
  ];
}

/**
 * Az `epitIcsOutputProfilt` a mentett settingsből egységes generálási profilt készít.
 */
export function epitIcsOutputProfilt(beallitasok = {}, opciok = {}) {
  const settings = normalizalIcsBeallitasokat(beallitasok);
  const splitPrimaryOutput =
    settings.primaryOutput ?? szarmaztatottKimenetiUtvonal(settings.output, "primary");
  const splitRestOutput =
    settings.restOutput ?? szarmaztatottKimenetiUtvonal(settings.output, "rest");
  const personalPrimarySource = opciok?.personalPrimarySettings?.primarySource ?? "default";

  if (settings.outputMode === "split") {
    return {
      settings,
      activeBaseOutputs: [splitPrimaryOutput, splitRestOutput],
      usesPersonalPrimary: false,
      generatorOptions: {
        ...settings,
        output: settings.output,
        primaryOutput: splitPrimaryOutput,
        restOutput: splitRestOutput,
        scope: "primary",
        restHandling: "split",
        restLayout: settings.restLayout ?? settings.layout,
      },
    };
  }

  if (settings.outputMode === "personal") {
    return {
      settings,
      activeBaseOutputs: [settings.personalOutput],
      usesPersonalPrimary: true,
      generatorOptions: {
        ...settings,
        output: settings.personalOutput,
        primaryOutput: null,
        restOutput: null,
        scope: "primary",
        restHandling: settings.restHandling === "split" ? "hidden" : settings.restHandling,
        restLayout: null,
        primarySource: personalPrimarySource,
        calendarName: `${settings.calendarName} — saját elsődleges`,
      },
    };
  }

  return {
    settings,
    activeBaseOutputs: [settings.output],
    usesPersonalPrimary: false,
    generatorOptions: {
      ...settings,
      output: settings.output,
      primaryOutput: null,
      restOutput: null,
      restHandling: settings.restHandling === "split" ? "hidden" : settings.restHandling,
      restLayout: settings.restHandling === "split" ? null : settings.restLayout,
    },
  };
}

/**
 * A `listazIcsMenedzseltKimeneteket` felsorolja a settings által menedzselt összes lehetséges ICS-kimenetet.
 */
export function listazIcsMenedzseltKimeneteket(beallitasok = {}) {
  const settings = normalizalIcsBeallitasokat(beallitasok);
  const splitPrimaryOutput =
    settings.primaryOutput ?? szarmaztatottKimenetiUtvonal(settings.output, "primary");
  const splitRestOutput =
    settings.restOutput ?? szarmaztatottKimenetiUtvonal(settings.output, "rest");
  const managed = new Set();

  for (const utvonal of [
    settings.output,
    splitPrimaryOutput,
    splitRestOutput,
    settings.personalOutput,
  ]) {
    for (const valtozat of listazLeapValtozatokat(utvonal)) {
      managed.add(path.resolve(process.cwd(), valtozat));
    }
  }

  return Array.from(managed);
}

export function icsErtekCimke(kulcs, ertek) {
  const cimkek = {
    outputMode: {
      common: "közös ICS",
      split: "primer + további külön",
      personal: "személyes ICS",
    },
    includeOtherDays: ertek ? "igen" : "nem",
    scope: {
      all: "összes névnap",
      primary: "csak elsődleges",
    },
    layout: {
      grouped: "naponta együtt",
      separate: "külön",
    },
    restHandling: {
      hidden: "elrejtve",
      description: "leírásban",
      "daily-event": "külön napi esemény",
      split: "külön naptár",
    },
    restLayout: {
      grouped: "naponta együtt",
      separate: "külön",
    },
    leapProfile: {
      off: "kikapcsolva",
      "hungarian-a": "magyar A",
      "hungarian-b": "magyar B",
      "hungarian-both": "magyar A + B",
    },
    descriptionMode: {
      none: "nincs",
      compact: "tömör",
      detailed: "részletes",
    },
    descriptionFormat: {
      text: "szöveg",
      html: "HTML",
      full: "szöveg + HTML",
    },
    ordinalDay: {
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
    kulcs: "outputMode",
    cimke: "Kimenet mód",
    tipus: "enum",
    ertekek: ["common", "split", "personal"],
    rovidLeiras:
      "Azt szabályozza, hogy egy közös ICS készüljön, primer és további névnapok külön naptárba kerüljenek, vagy csak a személyes ICS jöjjön létre.",
    ertekLeirasok: {
      common:
        "Pontosan egy közös ICS készül. Ez a legegyszerűbb, alapértelmezett működés.",
      split:
        "Két ICS készül: külön az elsődleges neveknek és külön a további névnapoknak. Akkor hasznos, ha ezeket külön akarod importálni.",
      personal:
        "Csak a személyes ICS készül el. Ilyenkor a személyes primerforrás, a Normalizált és a Rangsor módosító, valamint a kézi helyi kiegészítések is beleszólnak a tartalomba.",
    },
  },
  {
    kulcs: "scope",
    cimke: "Hatókör",
    tipus: "enum",
    ertekek: ["all", "primary"],
    lathato: (beallitasok) => beallitasok?.outputMode !== "split",
    rovidLeiras:
      "Azt szabályozza, hogy minden névnap kerüljön be, vagy csak az elsődleges nevek.",
    ertekLeirasok: {
      all: "Minden névnap a kiválasztott elrendezésben jelenik meg. Egyszerű, teljes naptárnézet.",
      primary:
        "Csak az elsődleges nevek kerülnek fókuszba. A többi név külön szabállyal rejthető, leírásba tehető vagy külön napi eseménybe kerülhet.",
    },
  },
  {
    kulcs: "layout",
    cimke: "Elrendezés",
    tipus: "enum",
    ertekek: ["grouped", "separate"],
    rovidLeiras:
      "Meghatározza, hogy naponta egy esemény készüljön, vagy névenként külön események.",
    ertekLeirasok: {
      grouped:
        "Naponta egyetlen esemény készül. Ez a legletisztultabb, kevésbé zajos naptárnézet.",
      separate:
        "Minden név külön eseményt kap. Akkor jó, ha részletesebben akarsz szűrni vagy feldolgozni.",
    },
  },
  {
    kulcs: "restHandling",
    cimke: "További nevek kezelése",
    tipus: "enum",
    ertekek: ["hidden", "description", "daily-event"],
    lathato: (beallitasok) =>
      beallitasok?.outputMode !== "split" && beallitasok?.scope === "primary",
    rovidLeiras:
      "Csak elsődleges hatókörnél számít: a nem elsődleges nevek eltűnjenek, leírásba kerüljenek vagy külön napi eseménybe menjenek.",
    ertekLeirasok: {
      hidden:
        "A nem elsődleges nevek nem jelennek meg. Ez adja a legtisztább primerfókuszú naptárat.",
      description:
        "A nem elsődleges nevek az eseményleírásba kerülnek. Jó kompromisszum a tisztaság és az információ között.",
      "daily-event":
        "A nem elsődleges nevek ugyanarra a napra külön eseményben jelennek meg. Részletesebb, zajosabb nézet.",
    },
  },
  {
    kulcs: "restLayout",
    cimke: "További naptár elrendezése",
    tipus: "enum",
    ertekek: ["grouped", "separate"],
    lathato: (beallitasok) => beallitasok?.outputMode === "split",
    rovidLeiras:
      "Csak külön naptárba bontásnál számít: a további névnapok naponta együtt vagy névenként külön jelenjenek meg.",
    ertekLeirasok: {
      grouped:
        "A további névnapok naponta csoportosítva jelennek meg a külön naptárban.",
      separate:
        "A további névnapok külön eseményekké válnak a külön naptárban.",
    },
  },
  {
    kulcs: "leapProfile",
    cimke: "Szökőéves profil",
    tipus: "enum",
    ertekek: ["off", "hungarian-a", "hungarian-b", "hungarian-both"],
    rovidLeiras:
      "A február végi mozgó névnapok kezelését szabályozza. A magyar eltolási modellek egy kapcsoló mögé kerültek.",
    ertekLeirasok: {
      off: "Nincs külön szökőéves eltolás. Az ismétlődő események egyszerű mintában készülnek el.",
      "hungarian-a": "A magyar február végi eltolás A változatát alkalmazza 2050-ig.",
      "hungarian-b": "A magyar február végi eltolás B változatát alkalmazza 2050-ig.",
      "hungarian-both":
        "Mindkét szökőéves változat külön fájlban elkészül. Összehasonlításhoz és ellenőrzéshez hasznos.",
    },
  },
  {
    kulcs: "fromYear",
    cimke: "Szökőéves tartomány kezdete",
    tipus: "number",
    min: 1900,
    max: 2050,
    step: 1,
    rovidLeiras:
      "A szökőéves, konkrét évre szóló események kezdőéve. Csak a magyar szökőéves mód mellett lényeges.",
  },
  {
    kulcs: "untilYear",
    cimke: "Szökőéves tartomány vége",
    tipus: "number",
    min: 1900,
    max: 2050,
    step: 1,
    rovidLeiras:
      "A szökőéves, konkrét évre szóló események utolsó éve. Ha növeled, hosszabb időhorizontra készülnek el az eltolt februári napok.",
  },
  {
    kulcs: "baseYear",
    cimke: "Bázisév",
    tipus: "number",
    min: 1900,
    max: 2100,
    step: 1,
    rovidLeiras:
      "A nem szökőéves ismétlődő események technikai báziséve. Naptárimport-kompatibilitási célra szolgál, ritkán kell módosítani.",
  },
  {
    kulcs: "descriptionMode",
    cimke: "Leírásmód",
    tipus: "enum",
    ertekek: ["none", "compact", "detailed"],
    rovidLeiras: "Megadja, mennyi kiegészítő szöveg kerüljön az eseményleírásba.",
    ertekLeirasok: {
      none: "Nem kerül külön leírás az eseményekbe. A legminimalistább naptárkimenet.",
      compact:
        "Rövid, tömör leírás készül a legfontosabb adatokkal. Áttekinthető marad, de ad kontextust.",
      detailed:
        "Részletes eseményleírás készül. Akkor hasznos, ha a naptár legyen önmagában is informatív referencia.",
    },
  },
  {
    kulcs: "descriptionFormat",
    cimke: "Leírásformátum",
    tipus: "enum",
    ertekek: ["text", "html", "full"],
    rovidLeiras:
      "A leírás technikai formátumát szabályozza, hogy a cél naptáralkalmazás milyen gazdag tartalmat tud megjeleníteni.",
    ertekLeirasok: {
      text: "Csak egyszerű szöveges leírás készül. Ez a legszélesebb körben kompatibilis forma.",
      html: "HTML-leírás készül, gazdagabb megjelenítéshez. Olyan klienseknél hasznos, amelyek ezt ténylegesen kirajzolják.",
      full:
        "A szöveges és a gazdagabb leírás együtt készül el. Akkor jó, ha vegyes klienskörnyezetre exportálsz.",
    },
  },
  {
    kulcs: "ordinalDay",
    cimke: "Év napja",
    tipus: "enum",
    ertekek: ["none", "summary", "description"],
    rovidLeiras:
      "Az év sorszámozott napjának megjelenítését szabályozza. Ez inkább információs extra, mint kötelező névnapadat.",
    ertekLeirasok: {
      none: "Az év napja egyáltalán nem jelenik meg.",
      summary: "Az év napja rövid, kiemelt formában kerül be az esemény összefoglaló részébe.",
      description: "Az év napja a leírás részeként jelenik meg, így kevésbé hangsúlyos, de visszakereshető.",
    },
  },
  {
    kulcs: "includeOtherDays",
    cimke: "További névnapok a leírásban",
    tipus: "boolean",
    rovidLeiras:
      "Az elsődleges fókuszú események leírásába beemeli a nem elsődleges, ugyanarra a napra eső neveket is.",
    ertekLeirasok: {
      true:
        "A leírásban megjelennek a további névnapok is. Ettől informatívabb lesz a naptár, de hosszabb leírásokat kapsz.",
      false:
        "Csak az adott név saját metaadatai látszanak. Rövidebb és tisztább marad a kimenet.",
    },
  },
];
