import fs from "node:fs/promises";
import path from "node:path";

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
  console.log(`Összehasonlított fájl: ${comparison.input}`);

  if (comparison.generatedAt) {
    console.log(`JSON generálva: ${comparison.generatedAt}`);
  }

  if (comparison.jsonVersion != null) {
    console.log(`JSON verzió: ${comparison.jsonVersion}`);
  }

  for (const genderKey of ["male", "female"]) {
    const entry = comparison.genders[genderKey];

    console.log("");
    console.log(`=== ${entry.labelHu.toUpperCase()} NEVEK ===`);
    console.log(`Hivatalos forrás: ${entry.official.url}`);
    console.log(`Hivatalos fejléc: ${entry.official.header}`);
    console.log(`Hivatalos darabszám: ${entry.official.count}`);
    console.log(`JSON darabszám: ${entry.json.count}`);

    printDifferenceBlock("Hiányzik a JSON-ból", entry.differences.missingFromJson);
    printDifferenceBlock("Többlet a JSON-ban", entry.differences.extraInJson);

    if (entry.differences.extraAlsoInOtherOfficial.length > 0) {
      printDifferenceBlock(
        "A többletből a másik hivatalos listában megtalálható",
        entry.differences.extraAlsoInOtherOfficial
      );
    }
  }

  console.log("");
  console.log(
    hasDifferences(comparison)
      ? "Eltérés található a JSON és a hivatalos forrás között."
      : "Nincs eltérés a JSON és a hivatalos forrás között."
  );
}

function printDifferenceBlock(title, values) {
  if (values.length === 0) {
    console.log(`${title}: nincs`);
    return;
  }

  console.log(`${title} (${values.length}): ${values.join(", ")}`);
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
