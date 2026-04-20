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
  const sajatIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-sajat.ics");

  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /Ábel|Fruzsina/);
  await assert.rejects(fs.access(sajatIcsUtvonal));
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

test("a primer nélkül maradó nevek audit havi bontású riportot készít", async () => {
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
    ],
  };

  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "vegso-primer.yaml"),
    vegsoPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "normalizalo-riport.yaml"),
    normalizaloRiport
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"),
    nevadatbazis
  );

  await execFileAsync(
    process.execPath,
    [binUtvonal, "audit", "futtat", "primer-nelkul-marado-nevek"],
    {
      cwd: ideiglenesKonyvtar,
    }
  );

  const riport = await betoltStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "riportok", "primer-nelkul-marado-nevek-riport.yaml")
  );
  const januar = riport.months.find((honap) => honap.month === 1);
  const elsoNap = januar.rows.find((sor) => sor.monthDay === "01-01");
  const masodikNap = januar.rows.find((sor) => sor.monthDay === "01-02");

  assert.equal(riport.summary.rowCount, 2);
  assert.equal(riport.summary.combinedMissingCount, 3);
  assert.equal(riport.summary.uniqueMissingNameCount, 3);
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
  assert.equal(masodikNap.combinedMissing[0].localSelected, undefined);
  assert.equal(masodikNap.normalizedMissing[0].name, "Bella");
  assert.equal(masodikNap.normalizedMissing[0].highlight, true);
});

test("a személyes kimenet mód kézi helyi kijelöléssel csak a saját ICS-t készíti el", async () => {
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
  const helyiFelulirasok = {
    version: 1,
    generatedAt: "2026-04-09T00:00:00.000Z",
    source: "helyi felhasználói beállítások",
    ics: {
      input: "output/adatbazis/nevnapok.yaml",
      output: "output/naptar/nevnapok.ics",
      primaryOutput: null,
      restOutput: null,
      personalOutput: "output/naptar/nevnapok-sajat.ics",
      outputMode: "personal",
      scope: "primary",
      layout: "grouped",
      restHandling: "hidden",
      restLayout: null,
      leapProfile: "off",
      fromYear: 2026,
      untilYear: 2040,
      baseYear: 2024,
      descriptionMode: "none",
      descriptionFormat: "text",
      ordinalDay: "none",
      includeOtherDays: false,
      calendarName: "Névnapok",
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
  };

  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"),
    nevadatbazis
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml"),
    helyiFelulirasok
  );

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const kozosIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const sajatIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-sajat.ics");
  const sajatIcs = await fs.readFile(sajatIcsUtvonal, "utf8");

  assert.match(sajatIcs, /X-WR-CALNAME:Névnapok — saját elsődleges/u);
  assert.match(sajatIcs, /SUMMARY:Ábel\\, Alpár/u);
  await assert.rejects(fs.access(kozosIcsUtvonal));
});

test("a legacy személyes profil önmagában már nem készít saját ICS-t", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-source-only-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");
  const helyiFelulirasok = {
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
    helyiFelulirasok
  );

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const kozosIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const kozosIcs = await fs.readFile(kozosIcsUtvonal, "utf8");
  const sajatIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-sajat.ics");

  assert.match(kozosIcs, /BEGIN:VCALENDAR/u);
  await assert.rejects(fs.access(sajatIcsUtvonal));
});

test("az ICS generálás az új unified helyi YAML ICS-blokkjából dolgozik", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-ics-unified-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");
  const helyiKonfig = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    source: "helyi felhasználói beállítások",
    ics: {
      input: "output/adatbazis/nevnapok.yaml",
      output: "output/naptar/nevnapok.ics",
      primaryOutput: null,
      restOutput: null,
      personalOutput: "output/naptar/nevnapok-sajat.ics",
      outputMode: "common",
      scope: "primary",
      layout: "grouped",
      restHandling: "hidden",
      restLayout: null,
      leapProfile: "off",
      fromYear: 2026,
      untilYear: 2040,
      baseYear: 2024,
      descriptionMode: "none",
      descriptionFormat: "text",
      ordinalDay: "none",
      includeOtherDays: false,
      calendarName: "Teszt helyi ICS",
    },
    personalPrimary: {
      primarySource: "default",
      modifiers: {
        normalized: false,
        ranking: false,
      },
      days: [],
    },
  };

  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));
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
  const helyiKonfig = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    source: "helyi felhasználói beállítások",
    ics: {
      input: "output/adatbazis/nevnapok.yaml",
      output: "output/naptar/nevnapok.ics",
      primaryOutput: null,
      restOutput: null,
      personalOutput: "output/naptar/nevnapok-sajat.ics",
      outputMode: "split",
      scope: "primary",
      layout: "grouped",
      restHandling: "split",
      restLayout: "grouped",
      leapProfile: "off",
      fromYear: 2026,
      untilYear: 2040,
      baseYear: 2024,
      descriptionMode: "none",
      descriptionFormat: "text",
      ordinalDay: "none",
      includeOtherDays: false,
      calendarName: "Teszt cleanup",
    },
    personalPrimary: {
      primarySource: "default",
      modifiers: {
        normalized: false,
        ranking: false,
      },
      days: [],
    },
  };

  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));
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

  helyiKonfig.ics.outputMode = "common";
  helyiKonfig.ics.scope = "all";
  helyiKonfig.ics.restHandling = "hidden";
  helyiKonfig.ics.restLayout = null;

  await mentStrukturaltFajl(helyiKonfigUtvonal, helyiKonfig);
  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  await fs.access(kozosIcsUtvonal);
  await assert.rejects(fs.access(primerIcsUtvonal));
  await assert.rejects(fs.access(restIcsUtvonal));
});

test("a személyes módosítók személyes kimenet módban érvényesülnek", async () => {
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
            month: 1,
            day: 2,
            monthDay: "01-02",
            primary: true,
            primaryLegacy: true,
            primaryRanked: false,
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
      {
        name: "Béla",
        gender: "male",
        days: [
          {
            month: 1,
            day: 2,
            monthDay: "01-02",
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
        month: 1,
        day: 2,
        monthDay: "01-02",
        preferredNames: ["Ábel"],
      },
    ],
  };
  const normalizaloRiport = {
    version: 1,
    days: [
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        preferredNames: ["Ábel", "Alpár"],
      },
    ],
  };
  const helyiFelulirasok = {
    version: 1,
    generatedAt: "2026-04-09T00:00:00.000Z",
    source: "helyi felhasználói beállítások",
    ics: {
      input: "output/adatbazis/nevnapok.yaml",
      output: "output/naptar/nevnapok.ics",
      primaryOutput: null,
      restOutput: null,
      personalOutput: "output/naptar/nevnapok-sajat.ics",
      outputMode: "personal",
      scope: "primary",
      layout: "grouped",
      restHandling: "hidden",
      restLayout: null,
      leapProfile: "off",
      fromYear: 2026,
      untilYear: 2040,
      baseYear: 2024,
      descriptionMode: "none",
      descriptionFormat: "text",
      ordinalDay: "none",
      includeOtherDays: false,
      calendarName: "Névnapok",
    },
    personalPrimary: {
      primarySource: "legacy",
      modifiers: {
        normalized: true,
        ranking: true,
      },
      days: [],
    },
  };

  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"),
    nevadatbazis
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "vegso-primer.yaml"),
    vegsoPrimer
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, "output", "primer", "normalizalo-riport.yaml"),
    normalizaloRiport
  );
  await mentStrukturaltFajl(
    path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml"),
    helyiFelulirasok
  );

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const kozosIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const sajatIcsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok-sajat.ics");
  const sajatIcs = await fs.readFile(sajatIcsUtvonal, "utf8");

  assert.match(sajatIcs, /SUMMARY:Ábel\\, Alpár\\, Béla/u);
  await assert.rejects(fs.access(kozosIcsUtvonal));
});
