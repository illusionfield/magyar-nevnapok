import test from "node:test";
import assert from "node:assert/strict";

import {
  epitIcsOutputProfilt,
  listazIcsMenedzseltKimeneteket,
  normalizalIcsBeallitasokat,
} from "../domainek/naptar/ics-beallitasok.mjs";

test("az egyfájlos ICS mód csak az egyetlen, minden nevet tartalmazó naptárat aktiválja", () => {
  const profil = epitIcsOutputProfilt(
    normalizalIcsBeallitasokat({
      partitionMode: "single",
      single: {
        output: "output/naptar/nevnapok.ics",
        layout: "grouped",
      },
    })
  );

  assert.equal(profil.partitionMode, "single");
  assert.deepEqual(profil.activeBaseOutputs, ["output/naptar/nevnapok.ics"]);
  assert.equal(profil.single.generatorOptions.output, "output/naptar/nevnapok.ics");
  assert.equal(profil.single.generatorOptions.scope, "all");
  assert.equal(profil.single.generatorOptions.restHandling, "hidden");
});

test("a bontott ICS mód primer és további fájlokat aktivál külön beállításokkal", () => {
  const profil = epitIcsOutputProfilt(
    normalizalIcsBeallitasokat({
      partitionMode: "split",
      split: {
        primary: {
          output: "output/naptar/nevnapok-primary.ics",
          layout: "separate",
          descriptionMode: "detailed",
        },
        rest: {
          output: "output/naptar/nevnapok-rest.ics",
          layout: "grouped",
          descriptionMode: "compact",
        },
      },
    })
  );

  assert.equal(profil.partitionMode, "split");
  assert.deepEqual(profil.activeBaseOutputs, [
    "output/naptar/nevnapok-primary.ics",
    "output/naptar/nevnapok-rest.ics",
  ]);
  assert.equal(profil.split.primary.generatorOptions.output, "output/naptar/nevnapok-primary.ics");
  assert.equal(profil.split.primary.generatorOptions.layout, "separate");
  assert.equal(profil.split.primary.generatorOptions.descriptionMode, "detailed");
  assert.equal(profil.split.rest.generatorOptions.output, "output/naptar/nevnapok-rest.ics");
  assert.equal(profil.split.rest.generatorOptions.layout, "grouped");
  assert.equal(profil.split.rest.generatorOptions.descriptionMode, "compact");
});

test("a legacy personal kimenet mód visszafelé kompatibilisen bontott módra migrál", () => {
  const normalizalt = normalizalIcsBeallitasokat({
    output: "output/naptar/nevnapok.ics",
    personalOutput: "output/naptar/nevnapok-sajat.ics",
    outputMode: "personal",
    layout: "separate",
    descriptionMode: "detailed",
    calendarName: "Teszt naptár",
  });

  assert.equal(normalizalt.partitionMode, "split");
  assert.equal(normalizalt.split.primary.output, "output/naptar/nevnapok-sajat.ics");
  assert.equal(normalizalt.split.primary.layout, "separate");
  assert.equal(normalizalt.split.primary.descriptionMode, "detailed");
  assert.equal(normalizalt.split.rest.output, "output/naptar/nevnapok-sajat-rest.ics");
});

test("a menedzselt ICS-kimenetek listája tartalmazza az egyfájlos és a bontott változatokat", () => {
  const managed = listazIcsMenedzseltKimeneteket({
    partitionMode: "single",
    shared: {
      leapProfile: "hungarian-both",
    },
    single: {
      output: "output/naptar/nevnapok.ics",
    },
    split: {
      primary: {
        output: "output/naptar/nevnapok-primary.ics",
      },
      rest: {
        output: "output/naptar/nevnapok-rest.ics",
      },
    },
  });

  assert.equal(managed.some((utvonal) => utvonal.endsWith("output/naptar/nevnapok.ics")), true);
  assert.equal(
    managed.some((utvonal) => utvonal.endsWith("output/naptar/nevnapok-primary.ics")),
    true
  );
  assert.equal(
    managed.some((utvonal) => utvonal.endsWith("output/naptar/nevnapok-rest.ics")),
    true
  );
  assert.equal(
    managed.some((utvonal) => utvonal.endsWith("output/naptar/nevnapok-primary-A.ics")),
    true
  );
  assert.equal(
    managed.some((utvonal) => utvonal.endsWith("output/naptar/nevnapok-rest-B.ics")),
    true
  );
});
