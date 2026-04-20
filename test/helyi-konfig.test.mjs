import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import {
  allitHelyiIcsBeallitasokat,
  betoltHelyiFelhasznaloiKonfigot,
} from "../domainek/helyi-konfig.mjs";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";

const execFileAsync = promisify(execFile);
const gyoker = process.cwd();

test("a hiányzó unified helyi YAML stabil default ICS- és személyes blokkot ad", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-konfig-"));
  const fajl = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");

  const eredmeny = await betoltHelyiFelhasznaloiKonfigot(fajl);

  assert.equal(eredmeny.payload.ics.outputMode, "common");
  assert.equal(eredmeny.payload.ics.scope, "all");
  assert.equal(eredmeny.payload.ics.layout, "grouped");
  assert.equal(eredmeny.payload.ics.personalOutput, "output/naptar/nevnapok-sajat.ics");
  assert.equal(eredmeny.payload.ics.calendarName, "Névnapok");
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
      outputMode: "split",
      scope: "primary",
      layout: "separate",
      restHandling: "split",
      restLayout: "grouped",
      leapProfile: "hungarian-b",
      fromYear: 2027,
      untilYear: 2040,
      descriptionMode: "detailed",
      descriptionFormat: "full",
      ordinalDay: "description",
      includeOtherDays: true,
      calendarName: "Teszt naptár",
      primaryOutput: "output/naptar/nevnapok-primary.ics",
      restOutput: "output/naptar/nevnapok-rest.ics",
    },
    fajl
  );

  const payload = await betoltStrukturaltFajl(fajl);

  assert.equal(payload.ics.outputMode, "split");
  assert.equal(payload.ics.scope, "primary");
  assert.equal(payload.ics.layout, "separate");
  assert.equal(payload.ics.restHandling, "split");
  assert.equal(payload.ics.restLayout, "grouped");
  assert.equal(payload.ics.leapProfile, "hungarian-b");
  assert.equal(payload.ics.calendarName, "Teszt naptár");
  assert.equal(payload.ics.primaryOutput, "output/naptar/nevnapok-primary.ics");
  assert.equal(payload.ics.restOutput, "output/naptar/nevnapok-rest.ics");
  assert.equal(payload.ics.personalOutput, "output/naptar/nevnapok-sajat.ics");
  assert.equal(payload.personalPrimary.primarySource, "default");
  assert.deepEqual(payload.personalPrimary.days, []);
});

test("legacy helyi override fallbackből töltődik, és első íráskor már az új unified YAML frissül", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-migracio-"));
  const legacyFajl = path.join(
    ideiglenesKonyvtar,
    ".local",
    "primary-registry-overrides.local.yaml"
  );
  const ujFajl = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");
  const moduleUrl = pathToFileURL(path.join(gyoker, "domainek", "helyi-konfig.mjs")).href;
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

  await mentStrukturaltFajl(legacyFajl, legacyPayload);
  await execFileAsync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `import { betoltHelyiFelhasznaloiKonfigot, allitHelyiIcsBeallitasokat } from ${JSON.stringify(moduleUrl)};
       const betoltott = await betoltHelyiFelhasznaloiKonfigot();
       if (betoltott.payload.personalPrimary.primarySource !== "legacy") {
         throw new Error("A legacy fallback nem töltődött be.");
       }
       await allitHelyiIcsBeallitasokat({ calendarName: "Teszt migráció" });`,
    ],
    {
      cwd: ideiglenesKonyvtar,
    }
  );

  const ujPayload = await betoltStrukturaltFajl(ujFajl);
  const megmaradtLegacyPayload = await betoltStrukturaltFajl(legacyFajl);

  assert.equal(ujPayload.ics.calendarName, "Teszt migráció");
  assert.equal(ujPayload.personalPrimary.primarySource, "legacy");
  assert.equal(ujPayload.personalPrimary.modifiers.normalized, true);
  assert.deepEqual(ujPayload.personalPrimary.days[0].addedPreferredNames, ["Alpár"]);
  assert.equal(megmaradtLegacyPayload.settings.primarySource, "legacy");
  assert.equal(megmaradtLegacyPayload.ics, undefined);
});
