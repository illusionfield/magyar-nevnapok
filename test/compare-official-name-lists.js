import fs from "node:fs/promises";
import path from "node:path";
import { printDataTable, printKeyValueTable, printValueGrid } from "./report-table.js";

const DEFAULT_INPUT_PATH = path.join(process.cwd(), "output", "nevnapok.json");
const OFFICIAL_SOURCES = {
  male: "https://file.nytud.hu/osszesffi.txt",
  female: "https://file.nytud.hu/osszesnoi.txt",
};

const args = parseArgs(process.argv.slice(2));

async function main() {
  const inputPath = path.resolve(process.cwd(), args.input ?? DEFAULT_INPUT_PATH);
  const payload = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const names = Array.isArray(payload.names) ? payload.names : [];

  const officialMale = await loadOfficialList("male", OFFICIAL_SOURCES.male);
  const officialFemale = await loadOfficialList("female", OFFICIAL_SOURCES.female);

  const jsonByGender = {
    male: buildNameSet(names, "male"),
    female: buildNameSet(names, "female"),
  };

  const comparison = {
    input: inputPath,
    jsonVersion: payload.version ?? null,
    generatedAt: payload.generatedAt ?? null,
    genders: {
      male: compareGenderLists({
        labelHu: "férfi",
        official: officialMale,
        jsonNames: jsonByGender.male,
        otherOfficialNames: officialFemale.names,
      }),
      female: compareGenderLists({
        labelHu: "női",
        official: officialFemale,
        jsonNames: jsonByGender.female,
        otherOfficialNames: officialMale.names,
      }),
    },
  };

  printComparison(comparison);

  if (hasDifferences(comparison)) {
    process.exitCode = 1;
  }
}

async function loadOfficialList(gender, url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "nevnapok-official-list-check/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch official ${gender} list from ${url}: ${response.status}`);
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

function buildNameSet(names, gender) {
  return new Set(
    names
      .filter((entry) => entry?.gender === gender)
      .map((entry) => String(entry.name ?? "").trim())
      .filter(Boolean)
  );
}

function compareGenderLists({ labelHu, official, jsonNames, otherOfficialNames }) {
  const missingFromJson = difference(official.names, jsonNames);
  const extraInJson = difference(jsonNames, official.names);
  const extraAlsoInOtherOfficial = extraInJson.filter((name) => otherOfficialNames.has(name));

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
    },
  };
}

function difference(left, right) {
  return Array.from(left)
    .filter((name) => !right.has(name))
    .sort((a, b) => a.localeCompare(b, "hu"));
}

function hasDifferences(comparison) {
  return Object.values(comparison.genders).some(
    (entry) =>
      entry.differences.missingFromJson.length > 0 || entry.differences.extraInJson.length > 0
  );
}

function printComparison(comparison) {
  printKeyValueTable("Források", [
    ["Összehasonlított fájl", comparison.input],
    ["JSON generálva", comparison.generatedAt ?? "—"],
    ["JSON verzió", comparison.jsonVersion ?? "—"],
  ], {
    keyWidth: 24,
    valueWidth: 92,
  });

  printDataTable(
    "Hivatalos névjegyzék-összevetés",
    [
      { key: "labelHu", title: "Nem", width: 8 },
      { key: "officialCount", title: "Hivatalos", width: 10, align: "right" },
      { key: "jsonCount", title: "JSON", width: 8, align: "right" },
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
        missingCount: entry.differences.missingFromJson.length,
        extraCount: entry.differences.extraInJson.length,
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
      ["JSON darabszám", entry.json.count],
      ["Hiányzó nevek", entry.differences.missingFromJson.length],
      ["Többletnevek", entry.differences.extraInJson.length],
      [
        "A többletből a másik listában",
        entry.differences.extraAlsoInOtherOfficial.length,
      ],
    ], {
      keyWidth: 24,
      valueWidth: 88,
    });

    printValueGrid(
      `${entry.labelHu.toUpperCase()} — hiányzik a JSON-ból`,
      entry.differences.missingFromJson,
      { columns: 4, cellWidth: 22, emptyMessage: "nincs" }
    );
    printValueGrid(
      `${entry.labelHu.toUpperCase()} — többlet a JSON-ban`,
      entry.differences.extraInJson,
      { columns: 4, cellWidth: 22, emptyMessage: "nincs" }
    );

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
      ? "Eltérés található a JSON és a hivatalos forrás között."
      : "Nincs eltérés a JSON és a hivatalos forrás között.",
  ]], {
    keyWidth: 12,
    valueWidth: 100,
  });
}

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
    }
  }

  return options;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
