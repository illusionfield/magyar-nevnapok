import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  allitHelyiPrimerBeallitasokat,
  allitHelyiPrimerForrast,
  betoltHelyiPrimerBeallitasokat,
  kapcsolHelyiPrimerKiegeszitest,
} from "../domainek/primer/helyi-primer-felulirasok.mjs";
import { betoltStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";

test("a helyi primerbeállítások hiányzó fájlnál is alapértékkel töltődnek", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-settings-"));
  const fajl = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");

  const eredmeny = await betoltHelyiPrimerBeallitasokat(fajl);

  assert.equal(eredmeny.settings.primarySource, "default");
  assert.equal(eredmeny.settings.modifiers.normalized, false);
  assert.equal(eredmeny.settings.modifiers.ranking, false);
});

test("a helyi primerforrás mentése megmarad a napi kijelölések mellett is", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-source-"));
  const fajl = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");

  await allitHelyiPrimerForrast({
    primarySource: "ranked",
    filePath: fajl,
  });
  await kapcsolHelyiPrimerKiegeszitest({
    month: 1,
    day: 2,
    monthDay: "01-02",
    name: "Alpár",
    filePath: fajl,
  });

  const payload = await betoltStrukturaltFajl(fajl);

  assert.equal(payload.personalPrimary.primarySource, "ranked");
  assert.equal(payload.personalPrimary.modifiers.normalized, false);
  assert.equal(payload.personalPrimary.modifiers.ranking, false);
  assert.deepEqual(payload.personalPrimary.days[0].addedPreferredNames, ["Alpár"]);
  assert.equal(typeof payload.ics.single.output, "string");
});

test("a személyes módosítók mentése is megmarad a napi kijelölések mellett", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-modifiers-"));
  const fajl = path.join(ideiglenesKonyvtar, ".local", "nevnapok.local.yaml");

  await allitHelyiPrimerBeallitasokat({
    primarySource: "legacy",
    modifiers: {
      normalized: true,
      ranking: false,
    },
    filePath: fajl,
  });
  await kapcsolHelyiPrimerKiegeszitest({
    month: 1,
    day: 2,
    monthDay: "01-02",
    name: "Alpár",
    filePath: fajl,
  });

  const payload = await betoltStrukturaltFajl(fajl);

  assert.equal(payload.personalPrimary.primarySource, "legacy");
  assert.equal(payload.personalPrimary.modifiers.normalized, true);
  assert.equal(payload.personalPrimary.modifiers.ranking, false);
  assert.deepEqual(payload.personalPrimary.days[0].addedPreferredNames, ["Alpár"]);
});
