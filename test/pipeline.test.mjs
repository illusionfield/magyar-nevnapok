import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { betoltStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";

const execFileAsync = promisify(execFile);
const gyoker = process.cwd();
const binUtvonal = path.join(gyoker, "bin", "nevnapok.mjs");

async function masolMappat(forras, cel) {
  await fs.mkdir(path.dirname(cel), { recursive: true });
  await fs.copyFile(forras, cel);
}

test("a legacy primer építés létrehozza a kanonikus YAML artifactot és a manifestet", async () => {
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

test("az ICS generálás működik a kanonikus YAML adatbázisból", async () => {
  const ideiglenesKonyvtar = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-ics-"));
  const adatbazisForras = path.join(gyoker, "test", "fixtures", "nevadatbazis-minta.yaml");

  await masolMappat(adatbazisForras, path.join(ideiglenesKonyvtar, "output", "adatbazis", "nevnapok.yaml"));

  await execFileAsync(process.execPath, [binUtvonal, "kimenet", "general", "ics"], {
    cwd: ideiglenesKonyvtar,
  });

  const icsUtvonal = path.join(ideiglenesKonyvtar, "output", "naptar", "nevnapok.ics");
  const ics = await fs.readFile(icsUtvonal, "utf8");

  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /Ábel|Fruzsina/);
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
