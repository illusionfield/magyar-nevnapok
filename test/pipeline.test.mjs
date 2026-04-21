import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";

const execFileAsync = promisify(execFile);
const gyoker = process.cwd();
const binUtvonal = path.join(gyoker, "bin", "nevnapok.mjs");

/**
 * A `masolMappat` tesztcélra előkészíti a szükséges könyvtárszerkezetet.
 */
async function masolMappat(forras, cel) {
  await fs.mkdir(path.dirname(cel), { recursive: true });
  await fs.copyFile(forras, cel);
}

function createIcsBeallitasok(overrides = {}) {
  return {
    partitionMode: overrides.partitionMode ?? "single",
    shared: {
      input: "output/adatbazis/nevnapok.yaml",
      leapProfile: "off",
      fromYear: 2026,
      untilYear: 2040,
      baseYear: 2024,
      ...(overrides.shared ?? {}),
    },
    single: {
      output: "output/naptar/nevnapok.ics",
      layout: "grouped",
      descriptionMode: "none",
      descriptionFormat: "text",
      ordinalDay: "none",
      includeOtherDays: false,
      calendarName: "Névnapok",
      ...(overrides.single ?? {}),
    },
    split: {
      primary: {
        output: "output/naptar/nevnapok-primary.ics",
        layout: "grouped",
        descriptionMode: "none",
        descriptionFormat: "text",
        ordinalDay: "none",
        includeOtherDays: false,
        calendarName: "Névnapok — elsődleges",
        ...(overrides.split?.primary ?? {}),
      },
      rest: {
        output: "output/naptar/nevnapok-rest.ics",
        layout: "grouped",
        descriptionMode: "none",
        descriptionFormat: "text",
        ordinalDay: "none",
        includeOtherDays: false,
        calendarName: "Névnapok — további",
        ...(overrides.split?.rest ?? {}),
      },
    },
  };
}

function createHelyiKonfig({ generatedAt = "2026-04-20T12:00:00.000Z", ics = {}, personalPrimary = {} } = {}) {
  return {
    version: 1,
    generatedAt,
    source: "helyi felhasználói beállítások",
    ics: createIcsBeallitasok(ics),
    personalPrimary: {
      primarySource: "default",
      modifiers: {
        normalized: false,
        ranking: false,
        ...(personalPrimary.modifiers ?? {}),
      },
      days: personalPrimary.days ?? [],
      ...Object.fromEntries(
        Object.entries(personalPrimary).filter(([kulcs]) => !["modifiers", "days"].includes(kulcs))
      ),
    },
  };
}

test("a legacy primer építés létrehozza az elsődleges YAML artifactot és a manifestet", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-pipeline-"));
  const legacyIcsForras = path.join(gyoker, "data", "nevnapok_tisztitott_regi_nevkeszlet.ics");
  const overridesForras = path.join(gyoker, "data", "primary-registry-overrides.yaml");

  await masolMappat(legacyIcsForras, path.join(ideiglenesKonyvtar, "data", "nevnapok_tisztitott_regi_nevkeszlet.ics"));
  await masolMappat(overridesForras, path.join(ideiglenesKonyvtar, "data", "primary-registry-overrides.yaml"));

  await execFileAsync(process.execPath, [binUtvonal, "pipeline", "futtat", "legacy-primer-epites"], {
    cwd: ideiglenesKonyvtar,
  });

  const primerUtvonal = path.join(ideiglenesKonyvtar, "output", "primer", "legacy-primer.yaml");
  const manifestUtvonal = path.join(ideiglenesKonyvtar, "output", "pipeline", "manifest.yaml");

  const primer = await betoltStrukturaltFajl(primerUtvonal);
  const manifest = await betoltStrukturaltFajl(manifestUtvonal);

  assert.equal(primer.version, 1);
  assert.equal(Array.isArray(primer.days), true);
  assert.equal(manifest.steps.some((lep) => lep.stepId === "legacy-primer-epites"), true);
});

test("az ICS generálás működik az elsődleges YAML adatbázisból", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-ics-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");

  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const icsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const ics = await fs.readFile(icsUtvonal, "utf8");
  const primerIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-primary.ics");
  const restIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-rest.ics");

  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /Ábel|Fruzsina/);
  await assert.rejects(fs.access(primerIcsUtvonal));
  await assert.rejects(fs.access(restIcsUtvonal));
});

test("a JSON export parancs létrehozza a JSON testvérartifactot", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-export-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");

  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "json"], {
    cwd: ideiglenesKonyvtar,
  });

  const jsonUtvonal = path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.json");
  const json = JSON.parse(await fs.readFile(jsonUtvonal, "utf8"));

  assert.equal(json.version, 6);
  assert.equal(Array.isArray(json.names), true);
});

test("a CSV export parancs létrehozza a táblázatos CSV-t", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-csv-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");

  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "csv"], {
    cwd: ideiglenesKonyvtar,
  });

  const csvUtvonal = path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.csv");
  const csv = await fs.readFile(csvUtvonal, "utf8");

  assert.match(csv, /^\uFEFFNév;Nem;Hónap;Nap;Dátum;/u);
  assert.match(csv, /Ábel;male;1;2;01-02;igen;/u);
  assert.match(csv, /Fruzsina;female;1;1;01-01;igen;/u);
});

test("az Excel export parancs létrehozza a több munkalapos xlsx fájlt", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-excel-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");

  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "excel"], {
    cwd: ideiglenesKonyvtar,
  });

  const excelUtvonal = path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.xlsx");
  const excel = await fs.readFile(excelUtvonal);
  const excelLatin1 = excel.toString("latin1");

  assert.equal(excel.subarray(0, 2).toString("latin1"), "PK");
  assert.match(excelLatin1, /\[Content_Types\]\.xml/u);
  assert.match(excelLatin1, /xl\/workbook\.xml/u);
  assert.match(excelLatin1, /Nevnapok/u);
  assert.match(excelLatin1, /Meta/u);
});

test("az egységes primer audit riport tartalmazza a forrás, hiányzó és személyes nézetet", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-primer-nelkul-"));
  const vegsoPrimer = {
    version: 1,
    generatedAt: "2026-04-09T00:00:00.000Z",
    days: [
      {
        month: 1,
        day: 1,
        monthDay: "01-01",
        names: ["Álmos"],
        preferredNames: ["Álmos"],
      },
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        names: ["Bori", "Cecil"],
        preferredNames: ["Bori", "Cecil"],
      },
      {
        month: 1,
        day: 3,
        monthDay: "01-03",
        names: ["Dóra"],
        preferredNames: ["Dóra"],
      },
    ],
  };
  const legacyPrimer = {
    version: 1,
    generatedAt: "2026-04-09T00:00:00.000Z",
    days: [
      {
        month: 1,
        day: 1,
        monthDay: "01-01",
        names: ["Álmos"],
        preferredNames: ["Álmos"],
      },
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        names: ["Bori", "Cecil"],
        preferredNames: ["Bori", "Cecil"],
      },
      {
        month: 1,
        day: 3,
        monthDay: "01-03",
        names: ["Dóra"],
        preferredNames: ["Dóra"],
      },
    ],
  };
  const wikiPrimer = {
    version: 1,
    generatedAt: "2026-04-09T00:00:00.000Z",
    days: [
      {
        month: 1,
        day: 1,
        monthDay: "01-01",
        names: ["Álmos"],
        preferredNames: ["Álmos"],
      },
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        names: ["Bori", "Cecil"],
        preferredNames: ["Bori", "Cecil"],
      },
      {
        month: 1,
        day: 3,
        monthDay: "01-03",
        names: ["Dóra"],
        preferredNames: ["Dóra"],
      },
    ],
  };
  const normalizaloRiport = {
    generatedAt: "2026-04-09T00:00:00.000Z",
    days: [
      {
        month: 1,
        day: 1,
        monthDay: "01-01",
        names: ["Álmos", "Aladár", "Béla"],
        preferredNames: ["Aladár", "Béla"],
      },
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        names: ["Bori", "Cecil", "Bella"],
        preferredNames: ["Bella"],
      },
      {
        month: 1,
        day: 3,
        monthDay: "01-03",
        names: ["Dóra"],
        preferredNames: ["Dóra"],
      },
    ],
  };
  const nevadatbazis = {
    version: 6,
    generatedAt: "2026-04-09T00:00:00.000Z",
    names: [
      {
        name: "Álmos",
        relatedNames: ["Aladár"],
        nicknames: [],
        days: [{ month: 1, day: 1, monthDay: "01-01" }],
      },
      {
        name: "Bori",
        relatedNames: [],
        nicknames: ["Bella"],
        days: [{ month: 1, day: 2, monthDay: "01-02" }],
      },
      {
        name: "Cecil",
        relatedNames: [],
        nicknames: [],
        days: [{ month: 1, day: 2, monthDay: "01-02" }],
      },
      {
        name: "Aladár",
        relatedNames: ["Álmos"],
        nicknames: [],
        days: [{ month: 1, day: 1, monthDay: "01-01", primaryRanked: true }],
      },
      {
        name: "Béla",
        relatedNames: [],
        nicknames: [],
        days: [{ month: 1, day: 1, monthDay: "01-01", primaryRanked: true }],
      },
      {
        name: "Bella",
        relatedNames: [],
        nicknames: ["Bori"],
        days: [{ month: 1, day: 2, monthDay: "01-02", primaryRanked: true }],
      },
      {
        name: "Dóra",
        relatedNames: [],
        nicknames: [],
        days: [{ month: 1, day: 3, monthDay: "01-03", primaryLegacy: true }],
      },
    ],
  };
  const primerFelulirasok = {
    version: 1,
    generatedAt: "2026-04-09T00:00:00.000Z",
    days: [],
  };
  const helyiKonfig = createHelyiKonfig({
    generatedAt: "2026-04-09T00:00:00.000Z",
    personalPrimary: {
      primarySource: "legacy",
      modifiers: {
        normalized: true,
        ranking: false,
      },
      days: [
        {
          month: 1,
          day: 2,
          monthDay: "01-02",
          addedPreferredNames: ["Bella"],
        },
      ],
    },
  });

  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "vegso-primer.yaml"),
    vegsoPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "legacy-primer.yaml"),
    legacyPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "wiki-primer.yaml"),
    wikiPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "normalizalo-riport.yaml"),
    normalizaloRiport
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"),
    nevadatbazis
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "data", "primary-registry-overrides.yaml"),
    primerFelulirasok
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml"),
    helyiKonfig
  );

  await execFileAsync(
    process.execPath,
    [
      path.join(gyoker, "domainek", "auditok", "primer-audit.mjs"),
      "--final",
      path.join("output", "primer", "vegso-primer.yaml"),
      "--legacy",
      path.join("output", "primer", "legacy-primer.yaml"),
      "--wiki",
      path.join("output", "primer", "wiki-primer.yaml"),
      "--normalized",
      path.join("output", "primer", "normalizalo-riport.yaml"),
      "--input",
      path.join("output", "adatbazis", "nevnapok.yaml"),
      "--overrides",
      path.join("data", "primary-registry-overrides.yaml"),
      "--local",
      path.join(".local", "nevnapok.local.yaml"),
      "--report",
      path.join("output", "riportok", "primer-audit.yaml"),
    ],
    {
      cwd: ideiglenesKonyvtar,
    }
  );

  const riport = await betoltStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "riportok", "primer-audit.yaml")
  );
  const januar = riport.months.find((honap) => honap.month === 1);
  const elsoNap = januar.rows.find((sor) => sor.monthDay === "01-01");
  const masodikNap = januar.rows.find((sor) => sor.monthDay === "01-02");
  const harmadikNap = januar.rows.find((sor) => sor.monthDay === "01-03");

  assert.equal(riport.summary.rowCount, 3);
  assert.equal(riport.summary.combinedMissingCount, 3);
  assert.equal(riport.summary.uniqueMissingNameCount, 3);
  assert.equal(riport.personal.settingsSnapshot.primarySource, "legacy");
  assert.deepEqual(elsoNap.finalPrimaryNames, ["Álmos"]);
  assert.equal(elsoNap.combinedMissing[0].name, "Aladár");
  assert.deepEqual(elsoNap.combinedMissing[0].sources, ["normalized", "ranking"]);
  assert.equal(elsoNap.normalizedMissing[0].name, "Aladár");
  assert.equal(elsoNap.normalizedMissing[0].highlight, true);
  assert.deepEqual(
    elsoNap.normalizedMissing[0].similarPrimaries.map((entry) => entry.primaryName),
    ["Álmos"]
  );
  assert.equal(elsoNap.rankingMissing[1].name, "Béla");
  assert.equal(elsoNap.rankingMissing[1].highlight, false);
  assert.equal(masodikNap.finalPrimaryCount, 2);
  assert.equal(masodikNap.sections.szemelyes.selectedNames[0], "Bella");
  assert.equal(masodikNap.sections.szemelyes.entries[0].localSelected, true);
  assert.equal(masodikNap.normalizedMissing[0].name, "Bella");
  assert.equal(masodikNap.normalizedMissing[0].highlight, true);
  assert.deepEqual(harmadikNap.finalPrimaryNames, ["Dóra"]);
  assert.equal(harmadikNap.finalPrimaryCount, 1);
  assert.deepEqual(harmadikNap.combinedMissing, []);
  assert.deepEqual(Object.keys(masodikNap.sections).sort(), [
    "forrasok",
    "hianyzok",
    "osszefoglalo",
    "szemelyes",
  ]);
});

test("az audit primer CLI snapshot módban a meglévő unified riportból olvas", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-primer-audit-cli-"));
  const riport = {
    generatedAt: "2026-04-20T12:00:00.000Z",
    summary: {
      rowCount: 1,
      combinedMissingCount: 1,
      localSelectedCount: 1,
      warningDayCount: 0,
      hardFailureCount: 0,
    },
    personal: {
      settingsSnapshot: {
        primarySource: "legacy",
        modifiers: {
          normalized: true,
          ranking: false,
        },
      },
    },
    months: [
      {
        month: 4,
        monthName: "Április",
        rows: [
          {
            month: 4,
            day: 18,
            monthDay: "04-18",
            finalPrimaryNames: ["Ilma", "Andrea"],
            source: "manual-override",
            warning: false,
            hidden: [],
            combinedMissing: [
              {
                name: "Hermina",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
              },
            ],
            localSelectedCount: 1,
            sections: {
              osszefoglalo: {
                preferredNames: ["Ilma", "Andrea"],
                source: "manual-override",
                warning: false,
                hiddenCount: 0,
                combinedMissingCount: 1,
                localSelectedCount: 1,
                rawNameCount: 3,
              },
              forrasok: {
                preferredNames: ["Ilma", "Andrea"],
                legacy: ["Ilma"],
                wiki: ["Ilma", "Andrea"],
                normalized: ["Ilma", "Hermina"],
                ranking: ["Ilma"],
                hidden: [],
                rawNames: ["Ilma", "Hermina", "Aladár"],
                source: "manual-override",
                warning: false,
              },
              hianyzok: {
                combinedMissing: [
                  {
                    name: "Hermina",
                    sources: ["normalized"],
                    highlight: false,
                    similarPrimaries: [],
                  },
                ],
                normalizedMissing: [
                  {
                    name: "Hermina",
                    sources: ["normalized"],
                    highlight: false,
                    similarPrimaries: [],
                  },
                ],
                rankingMissing: [],
              },
              szemelyes: {
                settingsSnapshot: {
                  primarySource: "legacy",
                  modifiers: {
                    normalized: true,
                    ranking: false,
                  },
                },
                selectedNames: ["Hermina"],
                entries: [
                  {
                    name: "Hermina",
                    sources: ["normalized"],
                    localSelected: true,
                    localSelectable: true,
                    highlight: false,
                    similarPrimaries: [],
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  };

  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "riportok", "primer-audit.yaml"),
    riport
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [binUtvonal, "audit", "primer", "reszletek", "--nap", "04-18", "--resz", "forrasok", "--snapshot"],
    {
      cwd: ideiglenesKonyvtar,
    }
  );

  assert.match(stdout, /Primer audit – 04-18 – források/u);
  assert.match(stdout, /Ilma, Andrea/u);
  assert.match(stdout, /manual-override/u);
});

test("az audit primer CLI snapshot módban hiánytalan napnál is a helyes végső primereket mutatja", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-primer-audit-cli-clean-"));
  const riport = {
    generatedAt: "2026-04-20T12:00:00.000Z",
    summary: {
      rowCount: 1,
      combinedMissingCount: 0,
      localSelectedCount: 2,
      warningDayCount: 0,
      hardFailureCount: 0,
    },
    personal: {
      settingsSnapshot: {
        primarySource: "default",
        modifiers: {
          normalized: false,
          ranking: false,
        },
      },
    },
    months: [
      {
        month: 4,
        monthName: "Április",
        rows: [
          {
            month: 4,
            day: 19,
            monthDay: "04-19",
            finalPrimaryNames: ["Emma", "Noémi"],
            finalPrimaryCount: 2,
            source: "legacy-wiki-exact",
            warning: false,
            hidden: ["Elemér"],
            combinedMissing: [],
            localSelectedCount: 0,
            sections: {
              osszefoglalo: {
                preferredNames: ["Emma", "Noémi"],
                source: "legacy-wiki-exact",
                warning: false,
                hiddenCount: 1,
                combinedMissingCount: 0,
                localSelectedCount: 0,
                rawNameCount: 3,
              },
              forrasok: {
                preferredNames: ["Emma", "Noémi"],
                legacy: ["Emma", "Noémi"],
                wiki: ["Emma", "Noémi"],
                normalized: ["Emma"],
                ranking: ["Emma"],
                hidden: ["Elemér"],
                rawNames: ["Emma", "Noémi", "Elemér"],
                source: "legacy-wiki-exact",
                warning: false,
              },
              hianyzok: {
                combinedMissing: [],
                normalizedMissing: [],
                rankingMissing: [],
              },
              szemelyes: {
                settingsSnapshot: {
                  primarySource: "default",
                  modifiers: {
                    normalized: false,
                    ranking: false,
                  },
                },
                selectedNames: [],
                entries: [],
              },
            },
          },
        ],
      },
    ],
  };

  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "riportok", "primer-audit.yaml"),
    riport
  );

  const { stdout } = await execFileAsync(
    process.execPath,
    [binUtvonal, "audit", "primer", "reszletek", "--nap", "04-19", "--resz", "osszefoglalo", "--snapshot"],
    {
      cwd: ideiglenesKonyvtar,
    }
  );

  assert.match(stdout, /Primer audit – 04-19 – összkép/u);
  assert.match(stdout, /Emma, Noémi/u);
  assert.match(stdout, /Közös hiányzó[\s│]+0/u);
});

test("az audit primer helyi CLI műveletei csak a nem követett helyi konfigot írják", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-primer-audit-write-"));
  const helyiKonfig = createHelyiKonfig();
  const trackedOverrides = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [],
  };

  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml"),
    helyiKonfig
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "data", "primary-registry-overrides.yaml"),
    trackedOverrides
  );

  await execFileAsync(
    process.execPath,
    [binUtvonal, "audit", "primer", "helyi", "hozzaad", "04-18", "Andrea"],
    {
      cwd: ideiglenesKonyvtar,
    }
  );
  await execFileAsync(
    process.execPath,
    [binUtvonal, "audit", "primer", "helyi", "modosito", "normalized", "be"],
    {
      cwd: ideiglenesKonyvtar,
    }
  );

  const frissHelyiKonfig = await betoltStrukturaltFajl(
    path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml")
  );
  const frissTrackedOverrides = await betoltStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "data", "primary-registry-overrides.yaml")
  );

  assert.equal(frissHelyiKonfig.personalPrimary.days[0].monthDay, "04-18");
  assert.deepEqual(frissHelyiKonfig.personalPrimary.days[0].addedPreferredNames, ["Andrea"]);
  assert.equal(frissHelyiKonfig.personalPrimary.modifiers.normalized, true);
  assert.deepEqual(frissTrackedOverrides, trackedOverrides);
});

test("a bontott kimenet kézi helyi kijelöléssel külön elsődleges és külön további ICS-t készít", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-primer-"));
  const nevadatbazis = {
    version: 6,
    generatedAt: "2026-04-09T00:00:00.000Z",
    names: [
      {
        name: "Ábel",
        gender: "male",
        days: [
          {
            month: 1,
            day: 2,
            monthDay: "01-02",
            primary: true,
            primaryLegacy: true,
            primaryRanked: true,
          },
        ],
      },
      {
        name: "Alpár",
        gender: "male",
        days: [
          {
            month: 1,
            day: 2,
            monthDay: "01-02",
            primary: false,
            primaryLegacy: false,
            primaryRanked: false,
          },
        ],
      },
    ],
  };
  const legacyPrimer = {
    version: 1,
    days: [
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        names: ["Ábel"],
        preferredNames: ["Ábel"],
      },
    ],
  };
  const wikiPrimer = {
    version: 1,
    days: [
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        names: ["Ábel", "Alpár"],
        preferredNames: ["Ábel", "Alpár"],
      },
    ],
  };
  const vegsoPrimer = {
    version: 1,
    days: [
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        names: ["Ábel"],
        preferredNames: ["Ábel"],
      },
    ],
  };
  const primerFelulirasok = {
    version: 1,
    generatedAt: "2026-04-09T00:00:00.000Z",
    days: [],
  };
  const helyiFelulirasok = createHelyiKonfig({
    generatedAt: "2026-04-09T00:00:00.000Z",
    ics: {
      partitionMode: "split",
    },
    personalPrimary: {
      primarySource: "default",
      modifiers: {
        normalized: false,
        ranking: false,
      },
      days: [
        {
          month: 1,
          day: 2,
          monthDay: "01-02",
          addedPreferredNames: ["Alpár"],
        },
      ],
    },
  });

  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"),
    nevadatbazis
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "legacy-primer.yaml"),
    legacyPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "wiki-primer.yaml"),
    wikiPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "vegso-primer.yaml"),
    vegsoPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "data", "primary-registry-overrides.yaml"),
    primerFelulirasok
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml"),
    helyiFelulirasok
  );

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const kozosIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const primerIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-primary.ics");
  const restIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-rest.ics");
  const primerIcs = await fs.readFile(primerIcsUtvonal, "utf8");
  const restIcs = await fs.readFile(restIcsUtvonal, "utf8");

  assert.match(primerIcs, /X-WR-CALNAME:Névnapok — elsődleges/u);
  assert.match(primerIcs, /SUMMARY:Ábel\\, Alpár/u);
  assert.match(restIcs, /BEGIN:VCALENDAR/u);
  assert.doesNotMatch(restIcs, /SUMMARY:Ábel/u);
  await assert.rejects(fs.access(kozosIcsUtvonal));
});

test("a régi külön helyi override fájl önmagában már nem hat az ICS-generálásra", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-source-only-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");
  const legacyHelyiFelulirasok = {
    version: 1,
    generatedAt: "2026-04-09T00:00:00.000Z",
    source: "helyi egyedi primerkiegészítések",
    settings: {
      primarySource: "legacy",
      modifiers: {
        normalized: false,
        ranking: false,
      },
    },
    days: [],
  };

  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "data", "primary-registry-overrides.local.yaml"),
    legacyHelyiFelulirasok
  );

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const kozosIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const kozosIcs = await fs.readFile(kozosIcsUtvonal, "utf8");
  const primerIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-primary.ics");
  const restIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-rest.ics");

  assert.match(kozosIcs, /BEGIN:VCALENDAR/u);
  await assert.rejects(fs.access(primerIcsUtvonal));
  await assert.rejects(fs.access(restIcsUtvonal));
});

test("az ICS generálás az új unified helyi YAML ICS-blokkjából dolgozik", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-ics-unified-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");
  const vegsoPrimer = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [
      {
        month: 1,
        day: 1,
        monthDay: "01-01",
        names: ["Fruzsina"],
        preferredNames: ["Fruzsina"],
      },
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        names: ["Ábel"],
        preferredNames: ["Ábel"],
      },
    ],
  };
  const helyiKonfig = createHelyiKonfig({
    ics: {
      single: {
        calendarName: "Teszt helyi ICS",
      },
    },
  });
  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "vegso-primer.yaml"),
    vegsoPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml"),
    helyiKonfig
  );

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const icsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const ics = await fs.readFile(icsUtvonal, "utf8");

  assert.match(ics, /X-WR-CALNAME:Teszt helyi ICS/u);
});

test("a kimenet mód váltása eltakarítja az inaktív, menedzselt ICS-fájlokat", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-ics-cleanup-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");
  const vegsoPrimer = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [
      {
        month: 1,
        day: 1,
        monthDay: "01-01",
        names: ["Fruzsina"],
        preferredNames: ["Fruzsina"],
      },
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        names: ["Ábel"],
        preferredNames: ["Ábel"],
      },
    ],
  };
  const legacyPrimer = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [...vegsoPrimer.days],
  };
  const wikiPrimer = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [...vegsoPrimer.days],
  };
  const primerFelulirasok = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [],
  };
  const helyiKonfig = createHelyiKonfig({
    ics: {
      partitionMode: "split",
      split: {
        primary: {
          calendarName: "Teszt cleanup — elsődleges",
        },
        rest: {
          calendarName: "Teszt cleanup — további",
        },
      },
    },
  });

  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "vegso-primer.yaml"),
    vegsoPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "legacy-primer.yaml"),
    legacyPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "wiki-primer.yaml"),
    wikiPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "data", "primary-registry-overrides.yaml"),
    primerFelulirasok
  );
  const helyiKonfigUtvonal = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");

  await mentStrukturaltFajl(helyiKonfigUtvonal, helyiKonfig);
  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const kozosIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const primerIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-primary.ics");
  const restIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-rest.ics");

  await fs.access(primerIcsUtvonal);
  await fs.access(restIcsUtvonal);
  await assert.rejects(fs.access(kozosIcsUtvonal));

  helyiKonfig.ics.partitionMode = "single";

  await mentStrukturaltFajl(helyiKonfigUtvonal, helyiKonfig);
  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  await fs.access(kozosIcsUtvonal);
  await assert.rejects(fs.access(primerIcsUtvonal));
  await assert.rejects(fs.access(restIcsUtvonal));
});

test("a bontott pipeline kimenet a Primer audit véglegesített elsődlegeseihez igazodik", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-ics-final-primary-"));
  const nevadatbazis = {
    version: 6,
    generatedAt: "2026-04-20T12:00:00.000Z",
    names: [
      {
        name: "Andrea",
        gender: "female",
        days: [
          {
            month: 2,
            day: 4,
            monthDay: "02-04",
            primary: true,
          },
          {
            month: 4,
            day: 18,
            monthDay: "04-18",
            primary: false,
          },
        ],
      },
      {
        name: "Ilma",
        gender: "female",
        days: [
          {
            month: 4,
            day: 18,
            monthDay: "04-18",
            primary: true,
          },
        ],
      },
      {
        name: "Aladár",
        gender: "male",
        days: [
          {
            month: 4,
            day: 18,
            monthDay: "04-18",
            primaryRanked: true,
          },
        ],
      },
      {
        name: "Hermina",
        gender: "female",
        days: [
          {
            month: 4,
            day: 18,
            monthDay: "04-18",
            primaryRanked: true,
          },
        ],
      },
      {
        name: "Apolló",
        gender: "male",
        days: [
          {
            month: 4,
            day: 18,
            monthDay: "04-18",
          },
        ],
      },
    ],
  };
  const vegsoPrimer = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [
      {
        month: 2,
        day: 4,
        monthDay: "02-04",
        names: ["Andrea"],
        preferredNames: ["Andrea"],
      },
      {
        month: 4,
        day: 18,
        monthDay: "04-18",
        names: ["Andrea", "Ilma", "Aladár", "Hermina", "Apolló"],
        preferredNames: ["Ilma", "Andrea"],
      },
    ],
  };
  const legacyPrimer = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [...vegsoPrimer.days],
  };
  const wikiPrimer = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [...vegsoPrimer.days],
  };
  const primerFelulirasok = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    days: [],
  };
  const helyiKonfig = createHelyiKonfig({
    ics: {
      partitionMode: "split",
      split: {
        primary: {
          calendarName: "Teszt végső primer — elsődleges",
        },
        rest: {
          calendarName: "Teszt végső primer — további",
        },
      },
    },
  });
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"),
    nevadatbazis
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "vegso-primer.yaml"),
    vegsoPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "legacy-primer.yaml"),
    legacyPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "wiki-primer.yaml"),
    wikiPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "data", "primary-registry-overrides.yaml"),
    primerFelulirasok
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml"),
    helyiKonfig
  );

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const primerIcs = await fs.readFile(
    path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-primary.ics"),
    "utf8"
  );
  const restIcs = await fs.readFile(
    path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-rest.ics"),
    "utf8"
  );

  assert.match(primerIcs, /DTSTART;VALUE=DATE:20240418[\s\S]*SUMMARY:Ilma\\, Andrea/u);
  assert.doesNotMatch(primerIcs, /SUMMARY:Aladár/u);
  assert.doesNotMatch(primerIcs, /SUMMARY:Hermina/u);
  assert.match(restIcs, /DTSTART;VALUE=DATE:20240418[\s\S]*SUMMARY:Aladár\\, Apolló\\, Hermina/u);
  assert.doesNotMatch(restIcs, /SUMMARY:Andrea/u);
});

test("a Normalizált és Rangsor módosítók a bontott kimenet elsődleges naptárában érvényesülnek", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-modifiers-"));
  const nevadatbazis = {
    version: 6,
    generatedAt: "2026-04-09T00:00:00.000Z",
    names: [
      {
        name: "Ábel",
        gender: "male",
        days: [
          {
            month: 2,
            day: 24,
            monthDay: "02-24",
            primary: true,
            primaryLegacy: true,
            primaryRanked: false,
          },
        ],
      },
      {
        name: "Mátyás",
        gender: "male",
        days: [
          {
            month: 2,
            day: 24,
            monthDay: "02-24",
            primary: false,
            primaryLegacy: false,
            primaryRanked: false,
          },
        ],
      },
      {
        name: "Béla",
        gender: "male",
        days: [
          {
            month: 2,
            day: 24,
            monthDay: "02-24",
            primary: false,
            primaryLegacy: false,
            primaryRanked: true,
          },
        ],
      },
    ],
  };
  const vegsoPrimer = {
    version: 1,
    days: [
      {
        month: 2,
        day: 24,
        monthDay: "02-24",
        preferredNames: ["Ábel"],
      },
    ],
  };
  const legacyPrimer = {
    version: 1,
    days: [
      {
        month: 2,
        day: 24,
        monthDay: "02-24",
        names: ["Ábel"],
        preferredNames: ["Ábel"],
      },
    ],
  };
  const wikiPrimer = {
    version: 1,
    days: [
      {
        month: 2,
        day: 24,
        monthDay: "02-24",
        names: ["Ábel", "Mátyás"],
        preferredNames: ["Ábel", "Mátyás"],
      },
    ],
  };
  const primerFelulirasok = {
    version: 1,
    generatedAt: "2026-04-09T00:00:00.000Z",
    days: [],
  };
  const helyiFelulirasok = createHelyiKonfig({
    generatedAt: "2026-04-09T00:00:00.000Z",
    ics: {
      partitionMode: "split",
    },
    personalPrimary: {
      primarySource: "legacy",
      modifiers: {
        normalized: true,
        ranking: true,
      },
      days: [],
    },
  });

  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"),
    nevadatbazis
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "legacy-primer.yaml"),
    legacyPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "wiki-primer.yaml"),
    wikiPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "vegso-primer.yaml"),
    vegsoPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "data", "primary-registry-overrides.yaml"),
    primerFelulirasok
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml"),
    helyiFelulirasok
  );
  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const kozosIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const primerIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-primary.ics");
  const restIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-rest.ics");
  const primerIcs = await fs.readFile(primerIcsUtvonal, "utf8");
  const restIcs = await fs.readFile(restIcsUtvonal, "utf8");

  assert.match(primerIcs, /SUMMARY:Ábel\\, Mátyás\\, Béla/u);
  assert.doesNotMatch(restIcs, /SUMMARY:Ábel/u);
  await assert.rejects(fs.access(kozosIcsUtvonal));
});
