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

async function runGenerator(opciok = {}) {
  return generalIcsKimeneteket(
    {
      output: path.join(process.cwd(), "tmp", "ics-generalas-test.ics"),
      ...opciok,
    },
    {
      payload: createTestPayload(),
      writeFiles: false,
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
