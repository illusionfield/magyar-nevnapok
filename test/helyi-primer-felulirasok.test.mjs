import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  allitHelyiPrimerForrast,
  betoltHelyiPrimerBeallitasokat,
  kapcsolHelyiPrimerKiegeszitest,
} from "../domainek/primer/helyi-primer-felulirasok.mjs";
import { betoltStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";

test("a helyi primerbeállítások hiányzó fájlnál is alapértékkel töltődnek", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-settings-"));
  const fajl = path.join(ideiglenesKonyvtar, "primary-registry-overrides.local.yaml");

  const eredmeny = await betoltHelyiPrimerBeallitasokat(fajl);

  assert.equal(eredmeny.settings.primarySource, "default");
});

test("a helyi primerforrás mentése megmarad a napi kijelölések mellett is", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-helyi-source-"));
  const fajl = path.join(ideiglenesKonyvtar, "primary-registry-overrides.local.yaml");

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

  assert.equal(payload.settings.primarySource, "ranked");
  assert.deepEqual(payload.days[0].addedPreferredNames, ["Alpár"]);
});
