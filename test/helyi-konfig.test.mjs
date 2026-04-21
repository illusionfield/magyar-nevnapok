import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  allitHelyiIcsBeallitasokat,
  betoltHelyiFelhasznaloiKonfigot,
} from "../domainek/helyi-konfig.mjs";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";

test("a hiányzó unified helyi YAML stabil default ICS- és személyes blokkot ad", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-konfig-"));
  const fajl = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");

  const eredmeny = await betoltHelyiFelhasznaloiKonfigot(fajl);

  assert.equal(eredmeny.payload.ics.partitionMode, "single");
  assert.equal(eredmeny.payload.ics.shared.input, "output/adatbazis/nevnapok.yaml");
  assert.equal(eredmeny.payload.ics.single.layout, "grouped");
  assert.equal(eredmeny.payload.ics.single.output, "output/naptar/nevnapok.ics");
  assert.equal(eredmeny.payload.ics.split.primary.output, "output/naptar/nevnapok-primary.ics");
  assert.equal(eredmeny.payload.ics.split.rest.output, "output/naptar/nevnapok-rest.ics");
  assert.equal(eredmeny.payload.ics.single.calendarName, "Névnapok");
  assert.equal(eredmeny.payload.personalPrimary.primarySource, "default");
  assert.equal(eredmeny.payload.personalPrimary.modifiers.normalized, false);
  assert.equal(eredmeny.payload.personalPrimary.modifiers.ranking, false);
  assert.deepEqual(eredmeny.payload.personalPrimary.days, []);
});

test("az ICS blokk mentése unified helyi YAML-ba írja a teljes profilt", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-ics-"));
  const fajl = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");

  await allitHelyiIcsBeallitasokat(
    {
      partitionMode: "split",
      shared: {
        leapProfile: "hungarian-b",
        fromYear: 2027,
        untilYear: 2040,
      },
      split: {
        primary: {
          layout: "separate",
          descriptionMode: "detailed",
          descriptionFormat: "full",
          ordinalDay: "description",
          includeOtherDays: true,
          calendarName: "Teszt naptár — elsődleges",
          output: "output/naptar/nevnapok-primary.ics",
        },
        rest: {
          layout: "grouped",
          descriptionMode: "compact",
          descriptionFormat: "text",
          ordinalDay: "summary",
          includeOtherDays: false,
          calendarName: "Teszt naptár — további",
          output: "output/naptar/nevnapok-rest.ics",
        },
      },
    },
    fajl
  );

  const payload = await betoltStrukturaltFajl(fajl);

  assert.equal(payload.ics.partitionMode, "split");
  assert.equal(payload.ics.shared.leapProfile, "hungarian-b");
  assert.equal(payload.ics.shared.fromYear, 2027);
  assert.equal(payload.ics.split.primary.layout, "separate");
  assert.equal(payload.ics.split.primary.descriptionMode, "detailed");
  assert.equal(payload.ics.split.primary.output, "output/naptar/nevnapok-primary.ics");
  assert.equal(payload.ics.split.rest.layout, "grouped");
  assert.equal(payload.ics.split.rest.descriptionMode, "compact");
  assert.equal(payload.ics.split.rest.output, "output/naptar/nevnapok-rest.ics");
  assert.equal(payload.personalPrimary.primarySource, "default");
  assert.deepEqual(payload.personalPrimary.days, []);
});

test("a legacy flat ICS-blokkot a loader visszafelé kompatibilisen az új sémára migrálja", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-migracio-"));
  const fajl = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");

  await mentStrukturaltFajl(fajl, {
    version: 1,
    generatedAt: "2026-04-21T09:00:00.000Z",
    source: "helyi felhasználói beállítások",
    ics: {
      input: "output/adatbazis/nevnapok.yaml",
      output: "output/naptar/nevnapok.ics",
      personalOutput: "output/naptar/nevnapok-sajat.ics",
      outputMode: "personal",
      layout: "separate",
      descriptionMode: "detailed",
      descriptionFormat: "full",
      ordinalDay: "description",
      includeOtherDays: true,
      leapProfile: "hungarian-b",
      fromYear: 2027,
      untilYear: 2040,
      baseYear: 2024,
      calendarName: "Teszt migráció",
    },
    personalPrimary: {
      primarySource: "default",
      modifiers: {
        normalized: false,
        ranking: false,
      },
      days: [],
    },
  });

  const eredmeny = await betoltHelyiFelhasznaloiKonfigot(fajl);

  assert.equal(eredmeny.payload.ics.partitionMode, "split");
  assert.equal(eredmeny.payload.ics.shared.leapProfile, "hungarian-b");
  assert.equal(eredmeny.payload.ics.split.primary.output, "output/naptar/nevnapok-sajat.ics");
  assert.equal(eredmeny.payload.ics.split.primary.layout, "separate");
  assert.equal(eredmeny.payload.ics.split.rest.output, "output/naptar/nevnapok-sajat-rest.ics");
});

test("a régi külön helyi override fájlokat a loader figyelmen kívül hagyja", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-legacy-ignore-"));
  const legacyHelyiFajl = path.join(
    ideiglenesKonyvtar,
    ".local",
    "primary-registry-overrides.local.yaml"
  );
  const legacyDataFajl = path.join(
    ideiglenesKonyvtar,
    "data",
    "primary-registry-overrides.local.yaml"
  );
  const ujFajl = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");

  const legacyPayload = {
    version: 1,
    generatedAt: "2026-04-20T12:00:00.000Z",
    source: "helyi egyedi primerkiegészítések",
    settings: {
      primarySource: "legacy",
      modifiers: {
        normalized: true,
        ranking: false,
      },
    },
    days: [
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        addedPreferredNames: ["Alpár"],
      },
    ],
  };

  await mentStrukturaltFajl(legacyHelyiFajl, legacyPayload);
  await mentStrukturaltFajl(legacyDataFajl, legacyPayload);

  const betoltott = await betoltHelyiFelhasznaloiKonfigot(ujFajl);

  assert.equal(betoltott.sourcePath, ujFajl);
  assert.equal(betoltott.payload.personalPrimary.primarySource, "default");
  assert.deepEqual(betoltott.payload.personalPrimary.days, []);
});
