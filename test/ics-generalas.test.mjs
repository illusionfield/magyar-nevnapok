import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";

import { generalIcsKimeneteket } from "../domainek/naptar/ics-generalas.mjs";

function createTestPayload() {
  return {
    version: 1,
    source: {
      provider: "Teszt adatbázis",
    },
    names: [
      {
        name: "Ábel",
        days: [
          {
            month: 1,
            day: 1,
            monthDay: "01-01",
            primaryLegacy: true,
          },
        ],
      },
      {
        name: "Béla",
        days: [
          {
            month: 1,
            day: 1,
            monthDay: "01-01",
          },
        ],
      },
    ],
  };
}

function createFinalPrimaryPayload(days) {
  return {
    version: 1,
    generatedAt: "2026-04-20T00:00:00.000Z",
    days,
  };
}

async function runGenerator(opciok = {}, runtime = {}) {
  return generalIcsKimeneteket(
    {
      output: path.join(process.cwd(), "tmp", "ics-generalas-test.ics"),
      ...opciok,
    },
    {
      payload: createTestPayload(),
      writeFiles: false,
      ...runtime,
    }
  );
}

test("az új all + grouped modell egy közös napi eseményt készít", async () => {
  const eredmeny = await runGenerator({
    scope: "all",
    layout: "grouped",
    restHandling: "hidden",
  });

  assert.equal(eredmeny.results.length, 1);
  assert.equal(eredmeny.results[0].eventCount, 1);
  assert.match(eredmeny.results[0].calendarText, /SUMMARY:Ábel\\, Béla/u);
});

test("az új primary + separate + daily-event modell külön primer és külön maradék eseményt készít", async () => {
  const eredmeny = await runGenerator({
    scope: "primary",
    layout: "separate",
    restHandling: "daily-event",
    primarySource: "legacy",
  });

  assert.equal(eredmeny.results.length, 1);
  assert.equal(eredmeny.results[0].eventCount, 2);
  assert.match(eredmeny.results[0].calendarText, /SUMMARY:Ábel/u);
  assert.match(eredmeny.results[0].calendarText, /SUMMARY:Béla/u);
});

test("az új split modell külön elsődleges és külön további naptárat készít", async () => {
  const eredmeny = await runGenerator({
    scope: "primary",
    layout: "grouped",
    restHandling: "split",
    restLayout: "separate",
    primarySource: "legacy",
  });

  assert.equal(eredmeny.results.length, 2);
  assert.match(eredmeny.results[0].outputPath, /-primary\.ics$/u);
  assert.match(eredmeny.results[1].outputPath, /-rest\.ics$/u);
  assert.equal(eredmeny.results[0].eventCount, 1);
  assert.equal(eredmeny.results[1].eventCount, 1);
});

test("a hungarian-both leap profile két külön változatot készít", async () => {
  const eredmeny = await runGenerator({
    leapProfile: "hungarian-both",
  });

  assert.equal(eredmeny.results.length, 2);
  assert.match(eredmeny.results[0].outputPath, /-A\.ics$/u);
  assert.match(eredmeny.results[1].outputPath, /-B\.ics$/u);
});

test("a közös split primeres ICS a végső primerjegyzéket követi és overlayeli a hiányzó neveket", async () => {
  const payload = {
    version: 1,
    source: {
      provider: "Teszt adatbázis",
    },
    names: [
      {
        name: "Andrea",
        days: [
          {
            month: 2,
            day: 4,
            monthDay: "02-04",
            primary: true,
          },
        ],
      },
      {
        name: "Ilma",
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
  const vegsoPrimer = createFinalPrimaryPayload([
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
  ]);

  const eredmeny = await generalIcsKimeneteket(
    {
      output: path.join(process.cwd(), "tmp", "ics-generalas-test.ics"),
      scope: "primary",
      layout: "grouped",
      restHandling: "split",
      restLayout: "grouped",
    },
    {
      payload,
      finalPrimaryRegistryPayload: vegsoPrimer,
      writeFiles: false,
    }
  );

  assert.equal(eredmeny.results.length, 2);
  assert.match(eredmeny.results[0].outputPath, /-primary\.ics$/u);
  assert.match(eredmeny.results[1].outputPath, /-rest\.ics$/u);
  assert.match(eredmeny.results[0].calendarText, /DTSTART;VALUE=DATE:20240418[\s\S]*SUMMARY:Ilma\\, Andrea/u);
  assert.doesNotMatch(eredmeny.results[0].calendarText, /SUMMARY:Aladár/u);
  assert.doesNotMatch(eredmeny.results[0].calendarText, /SUMMARY:Hermina/u);
  assert.match(
    eredmeny.results[1].calendarText,
    /DTSTART;VALUE=DATE:20240418[\s\S]*SUMMARY:Aladár\\, Apolló\\, Hermina/u
  );
  assert.doesNotMatch(eredmeny.results[1].calendarText, /SUMMARY:Andrea/u);
});

test("a közös primeres leírásos mód is a végső primerjegyzéket használja", async () => {
  const payload = {
    version: 1,
    source: {
      provider: "Teszt adatbázis",
    },
    names: [
      {
        name: "Andrea",
        days: [
          {
            month: 2,
            day: 4,
            monthDay: "02-04",
            primary: true,
          },
        ],
      },
      {
        name: "Ilma",
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
        days: [
          {
            month: 4,
            day: 18,
            monthDay: "04-18",
            primaryRanked: true,
          },
        ],
      },
    ],
  };
  const vegsoPrimer = createFinalPrimaryPayload([
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
      names: ["Andrea", "Ilma", "Aladár", "Hermina"],
      preferredNames: ["Ilma", "Andrea"],
    },
  ]);

  const eredmeny = await generalIcsKimeneteket(
    {
      output: path.join(process.cwd(), "tmp", "ics-generalas-test.ics"),
      scope: "primary",
      layout: "grouped",
      restHandling: "description",
      descriptionMode: "compact",
      includeOtherDays: true,
    },
    {
      payload,
      finalPrimaryRegistryPayload: vegsoPrimer,
      writeFiles: false,
    }
  );

  assert.equal(eredmeny.results.length, 1);
  assert.match(eredmeny.results[0].calendarText, /DTSTART;VALUE=DATE:20240418[\s\S]*SUMMARY:Ilma\\, Andrea/u);
  assert.match(eredmeny.results[0].calendarText, /A nap további névnapjai\\n• Aladár • Hermina/u);
  assert.match(eredmeny.results[0].calendarText, /Elsődleges forrás: végső primerjegyzék/u);
});

test("a végső primer overlay a nap nélküli, de adatbázisban ismert neveket is fel tudja venni", async () => {
  const payload = {
    version: 1,
    source: {
      provider: "Teszt adatbázis",
    },
    names: [
      {
        name: "Aliz",
        gender: "female",
        meaning: "nemes",
        days: [],
      },
      {
        name: "Ágnes",
        gender: "female",
        days: [
          {
            month: 11,
            day: 14,
            monthDay: "11-14",
            primary: true,
          },
        ],
      },
    ],
  };
  const vegsoPrimer = createFinalPrimaryPayload([
    {
      month: 11,
      day: 14,
      monthDay: "11-14",
      names: ["Ágnes", "Aliz"],
      preferredNames: ["Aliz", "Ágnes"],
    },
  ]);

  const eredmeny = await generalIcsKimeneteket(
    {
      output: path.join(process.cwd(), "tmp", "ics-generalas-test.ics"),
      scope: "primary",
      layout: "grouped",
      restHandling: "hidden",
      descriptionMode: "compact",
    },
    {
      payload,
      finalPrimaryRegistryPayload: vegsoPrimer,
      writeFiles: false,
    }
  );

  assert.equal(eredmeny.results.length, 1);
  assert.match(eredmeny.results[0].calendarText, /DTSTART;VALUE=DATE:20241114[\s\S]*SUMMARY:Aliz\\, Ágnes/u);
  assert.match(eredmeny.results[0].calendarText, /Jelentés: nemes/u);
});
