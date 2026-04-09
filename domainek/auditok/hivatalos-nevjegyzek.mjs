/**
 * domainek/auditok/hivatalos-nevjegyzek.mjs
 * A hivatalos névjegyzékkel való összevetés és kivétellista-kezelés folyamata.
 */
import path from "node:path";
import { printDataTable, printKeyValueTable, printValueGrid } from "../../kozos/terminal-tabla.mjs";
import {
  betoltStrukturaltFajl,
  mentStrukturaltFajl,
} from "../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";
import { letezik } from "../../kozos/fajlrendszer.mjs";

const DEFAULT_INPUT_PATH = kanonikusUtvonalak.adatbazis.nevnapok;
const DEFAULT_REPORT_PATH = kanonikusUtvonalak.riportok.hivatalosNevjegyzek;
const DEFAULT_EXCEPTIONS_PATH = kanonikusUtvonalak.kezi.hivatalosNevjegyzekKivetelek;
const OFFICIAL_SOURCES = {
  male: "https://file.nytud.hu/osszesffi.txt",
  female: "https://file.nytud.hu/osszesnoi.txt",
};

const args = parseArgs(process.argv.slice(2));

/**
 * A `main` a modul közvetlen futtatási belépési pontja.
 */
async function main() {
  const inputPath = path.resolve(process.cwd(), args.input ?? DEFAULT_INPUT_PATH);
  const reportPath = path.resolve(process.cwd(), args.report ?? DEFAULT_REPORT_PATH);
  const exceptionsPath = path.resolve(process.cwd(), args.exceptions ?? DEFAULT_EXCEPTIONS_PATH);
  const payload = await betoltStrukturaltFajl(inputPath);
  const names = Array.isArray(payload.names) ? payload.names : [];
  const exceptions = await betoltKivetellistat(exceptionsPath);

  const officialMale = await loadOfficialList("male", OFFICIAL_SOURCES.male);
  const officialFemale = await loadOfficialList("female", OFFICIAL_SOURCES.female);

  const jsonByGender = {
    male: buildNameSet(names, "male"),
    female: buildNameSet(names, "female"),
  };

  const comparison = {
    generatedAt: new Date().toISOString(),
    input: inputPath,
    reportPath,
    exceptionsPath,
    jsonVersion: payload.version ?? null,
    dataGeneratedAt: payload.generatedAt ?? null,
    exceptions,
    genders: {
      male: compareGenderLists({
        labelHu: "férfi",
        official: officialMale,
        jsonNames: jsonByGender.male,
        otherOfficialNames: officialFemale.names,
        exceptionsByGender: exceptions.genders?.male ?? {},
      }),
      female: compareGenderLists({
        labelHu: "női",
        official: officialFemale,
        jsonNames: jsonByGender.female,
        otherOfficialNames: officialMale.names,
        exceptionsByGender: exceptions.genders?.female ?? {},
      }),
    },
  };

  await mentStrukturaltFajl(reportPath, comparison);
  printComparison(comparison);

  if (hasDifferences(comparison)) {
    process.exitCode = 1;
  }
}

/**
 * A `betoltKivetellistat` betölti a szükséges adatot.
 */
async function betoltKivetellistat(exceptionsPath) {
  if (!(await letezik(exceptionsPath))) {
    return {
      version: 1,
      megjegyzes: "Nincs kivétellista.",
      genders: {
        male: { extraInJson: [], missingFromJson: [] },
        female: { extraInJson: [], missingFromJson: [] },
      },
    };
  }

  return betoltStrukturaltFajl(exceptionsPath);
}

/**
 * A `loadOfficialList` betölti a szükséges adatot.
 */
async function loadOfficialList(gender, url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "nevnapok-official-list-check/1.0",
    },
  });

  if (!response.ok) {
    const nemCimke = gender === "male" ? "férfi" : "női";
    throw new Error(
      `Nem sikerült lekérni a hivatalos ${nemCimke} listát innen: ${url}. HTTP státusz: ${response.status}`
    );
  }

  const text = await response.text();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const header = lines.shift() ?? "";

  return {
    gender,
    url,
    header,
    names: new Set(lines),
  };
}

/**
 * A `buildNameSet` felépíti a szükséges adatszerkezetet.
 */
function buildNameSet(names, gender) {
  return new Set(
    names
      .filter((entry) => entry?.gender === gender)
      .map((entry) => String(entry.name ?? "").trim())
      .filter(Boolean)
  );
}

/**
 * A `compareGenderLists` összeveti a hivatalos és az adatbázisbeli névlistát egy nemre vetítve.
 */
function compareGenderLists({
  labelHu,
  official,
  jsonNames,
  otherOfficialNames,
  exceptionsByGender,
}) {
  const missingFromJson = difference(official.names, jsonNames);
  const extraInJson = difference(jsonNames, official.names);
  const engedelyezettTobbletek = new Set(
    Array.isArray(exceptionsByGender.extraInJson)
      ? exceptionsByGender.extraInJson.map((entry) => entry.name)
      : []
  );
  const engedelyezettHianyok = new Set(
    Array.isArray(exceptionsByGender.missingFromJson)
      ? exceptionsByGender.missingFromJson.map((entry) => entry.name)
      : []
  );
  const extraAlsoInOtherOfficial = extraInJson.filter((name) => otherOfficialNames.has(name));
  const unapprovedExtraInJson = extraInJson.filter((name) => !engedelyezettTobbletek.has(name));
  const unapprovedMissingFromJson = missingFromJson.filter((name) => !engedelyezettHianyok.has(name));

  return {
    labelHu,
    official: {
      url: official.url,
      header: official.header,
      count: official.names.size,
    },
    json: {
      count: jsonNames.size,
    },
    differences: {
      missingFromJson,
      extraInJson,
      extraAlsoInOtherOfficial,
      unapprovedExtraInJson,
      unapprovedMissingFromJson,
      documentedExtraInJson: extraInJson.filter((name) => engedelyezettTobbletek.has(name)),
      documentedMissingFromJson: missingFromJson.filter((name) => engedelyezettHianyok.has(name)),
    },
  };
}

/**
 * A `difference` a bal oldali halmazból kiszűri a jobb oldalról hiányzó elemeket.
 */
function difference(left, right) {
  return Array.from(left)
    .filter((name) => !right.has(name))
    .sort((a, b) => a.localeCompare(b, "hu"));
}

/**
 * A `hasDifferences` kiszűri a hiányzó vagy eltérő elemeket a két oldal között.
 */
function hasDifferences(comparison) {
  return Object.values(comparison.genders).some(
    (entry) =>
      entry.differences.unapprovedMissingFromJson.length > 0 ||
      entry.differences.unapprovedExtraInJson.length > 0
  );
}

/**
 * A `printComparison` terminálra írja az emberileg olvasható összegzést.
 */
function printComparison(comparison) {
  printKeyValueTable("Források", [
    ["Összehasonlított fájl", comparison.input],
    ["Adat generálva", comparison.dataGeneratedAt ?? "—"],
    ["Adatverzió", comparison.jsonVersion ?? "—"],
    ["Riport", comparison.reportPath],
    ["Kivétellista", comparison.exceptionsPath],
  ], {
    keyWidth: 24,
    valueWidth: 92,
  });

  printDataTable(
    "Hivatalos névjegyzék-összevetés",
    [
      { key: "labelHu", title: "Nem", width: 8 },
      { key: "officialCount", title: "Hivatalos", width: 10, align: "right" },
      { key: "jsonCount", title: "Adatbázis", width: 8, align: "right" },
      { key: "missingCount", title: "Hiányzik", width: 10, align: "right" },
      { key: "extraCount", title: "Többlet", width: 8, align: "right" },
      { key: "crossCount", title: "Másik listában", width: 15, align: "right" },
    ],
    ["male", "female"].map((genderKey) => {
      const entry = comparison.genders[genderKey];
      return {
        labelHu: entry.labelHu,
        officialCount: entry.official.count,
        jsonCount: entry.json.count,
        missingCount: entry.differences.unapprovedMissingFromJson.length,
        extraCount: entry.differences.unapprovedExtraInJson.length,
        crossCount: entry.differences.extraAlsoInOtherOfficial.length,
      };
    })
  );

  for (const genderKey of ["male", "female"]) {
    const entry = comparison.genders[genderKey];

    printKeyValueTable(`${entry.labelHu.toUpperCase()} NEVEK`, [
      ["Hivatalos forrás", entry.official.url],
      ["Hivatalos fejléc", entry.official.header],
      ["Hivatalos darabszám", entry.official.count],
      ["Adatbázis darabszám", entry.json.count],
      ["Nem dokumentált hiányzó nevek", entry.differences.unapprovedMissingFromJson.length],
      ["Nem dokumentált többletnevek", entry.differences.unapprovedExtraInJson.length],
      ["Dokumentált kivételként kezelt többletek", entry.differences.documentedExtraInJson.length],
      [
        "A többletből a másik listában",
        entry.differences.extraAlsoInOtherOfficial.length,
      ],
    ], {
      keyWidth: 24,
      valueWidth: 88,
    });

    printValueGrid(
      `${entry.labelHu.toUpperCase()} — hiányzik az adatbázisból`,
      entry.differences.unapprovedMissingFromJson,
      { columns: 4, cellWidth: 22, emptyMessage: "nincs" }
    );
    printValueGrid(
      `${entry.labelHu.toUpperCase()} — többlet az adatbázisban`,
      entry.differences.unapprovedExtraInJson,
      { columns: 4, cellWidth: 22, emptyMessage: "nincs" }
    );

    if (entry.differences.documentedExtraInJson.length > 0) {
      printValueGrid(
        `${entry.labelHu.toUpperCase()} — dokumentált kivételek`,
        entry.differences.documentedExtraInJson,
        { columns: 4, cellWidth: 22, emptyMessage: "nincs" }
      );
    }

    if (entry.differences.extraAlsoInOtherOfficial.length > 0) {
      printValueGrid(
        `${entry.labelHu.toUpperCase()} — a többletből a másik hivatalos listában`,
        entry.differences.extraAlsoInOtherOfficial,
        { columns: 4, cellWidth: 22, emptyMessage: "nincs" }
      );
    }
  }

  printKeyValueTable("Eredmény", [[
    "Állapot",
    hasDifferences(comparison)
      ? "Eltérés található az adatbázis és a hivatalos forrás között."
      : "Nincs eltérés az adatbázis és a hivatalos forrás között.",
  ]], {
    keyWidth: 12,
    valueWidth: 100,
  });
}

/**
 * A `parseArgs` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input" && argv[index + 1]) {
      options.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--report" && argv[index + 1]) {
      options.report = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--report=")) {
      options.report = arg.slice("--report=".length);
      continue;
    }

    if (arg === "--exceptions" && argv[index + 1]) {
      options.exceptions = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--exceptions=")) {
      options.exceptions = arg.slice("--exceptions=".length);
    }
  }

  return options;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
