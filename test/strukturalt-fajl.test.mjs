import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  betoltStrukturaltFajl,
  mentStrukturaltFajl,
} from "../kozos/strukturalt-fajl.mjs";

test("strukturált fájl mentése és visszatöltése YAML-ban", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-yaml-"));
  const utvonal = path.join(ideiglenesKonyvtar, "minta.yaml");
  const adat = {
    version: 1,
    names: ["Ábel", "Fruzsina"],
  };

  await mentStrukturaltFajl(utvonal, adat);
  const visszatoltott = await betoltStrukturaltFajl(utvonal);

  assert.deepEqual(visszatoltott, adat);
});

test("strukturált fájl mentése és visszatöltése JSON-ban", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-json-"));
  const utvonal = path.join(ideiglenesKonyvtar, "minta.json");
  const adat = {
    version: 1,
    days: [{ monthDay: "01-01" }],
  };

  await mentStrukturaltFajl(utvonal, adat, "json");
  const visszatoltott = await betoltStrukturaltFajl(utvonal);

  assert.deepEqual(visszatoltott, adat);
});
