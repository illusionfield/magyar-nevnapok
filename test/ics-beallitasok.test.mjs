import test from "node:test";
import assert from "node:assert/strict";

import {
  epitIcsOutputProfilt,
  listazIcsMenedzseltKimeneteket,
  normalizalIcsBeallitasokat,
} from "../domainek/naptar/ics-beallitasok.mjs";

test("a common kimenet mód csak a közös ICS-t aktiválja", () => {
  const profil = epitIcsOutputProfilt(
    normalizalIcsBeallitasokat({
      outputMode: "common",
      output: "output/naptar/nevnapok.ics",
      scope: "all",
      restHandling: "hidden",
    })
  );

  assert.deepEqual(profil.activeBaseOutputs, ["output/naptar/nevnapok.ics"]);
  assert.equal(profil.usesPersonalPrimary, false);
  assert.equal(profil.generatorOptions.output, "output/naptar/nevnapok.ics");
  assert.equal(profil.generatorOptions.restHandling, "hidden");
});

test("a split kimenet mód primer és rest fájlokat aktivál", () => {
  const profil = epitIcsOutputProfilt(
    normalizalIcsBeallitasokat({
      outputMode: "split",
      output: "output/naptar/nevnapok.ics",
      layout: "grouped",
      restLayout: "separate",
    })
  );

  assert.deepEqual(profil.activeBaseOutputs, [
    "output/naptar/nevnapok-primary.ics",
    "output/naptar/nevnapok-rest.ics",
  ]);
  assert.equal(profil.usesPersonalPrimary, false);
  assert.equal(profil.generatorOptions.scope, "primary");
  assert.equal(profil.generatorOptions.restHandling, "split");
  assert.equal(profil.generatorOptions.restLayout, "separate");
});

test("a personal kimenet mód csak a személyes ICS-t aktiválja", () => {
  const profil = epitIcsOutputProfilt(
    normalizalIcsBeallitasokat({
      outputMode: "personal",
      output: "output/naptar/nevnapok.ics",
      personalOutput: "output/naptar/nevnapok-sajat.ics",
      scope: "all",
      restHandling: "hidden",
      calendarName: "Teszt naptár",
    }),
    {
      personalPrimarySettings: {
        primarySource: "legacy",
      },
    }
  );

  assert.deepEqual(profil.activeBaseOutputs, ["output/naptar/nevnapok-sajat.ics"]);
  assert.equal(profil.usesPersonalPrimary, true);
  assert.equal(profil.generatorOptions.output, "output/naptar/nevnapok-sajat.ics");
  assert.equal(profil.generatorOptions.scope, "primary");
  assert.equal(profil.generatorOptions.primarySource, "legacy");
  assert.equal(profil.generatorOptions.calendarName, "Teszt naptár — saját elsődleges");
});

test("a menedzselt ICS-kimenetek listája tartalmazza a common, split és personal változatokat", () => {
  const managed = listazIcsMenedzseltKimeneteket({
    output: "output/naptar/nevnapok.ics",
    personalOutput: "output/naptar/nevnapok-sajat.ics",
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
    managed.some((utvonal) => utvonal.endsWith("output/naptar/nevnapok-sajat.ics")),
    true
  );
  assert.equal(
    managed.some((utvonal) => utvonal.endsWith("output/naptar/nevnapok-sajat-A.ics")),
    true
  );
});
