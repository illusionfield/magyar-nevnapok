import test from "node:test";
import assert from "node:assert/strict";

import {
  epitPuppeteerInditasiBeallitasokat,
  PUPPETEER_HTTP_KOMPATIBILITASI_KAPCSOLOK,
} from "../kozos/puppeteer-inditas.mjs";

test("a Puppeteer indítási beállítások tartalmazzák a HTTP-kompatibilitási kapcsolókat", () => {
  const beallitasok = epitPuppeteerInditasiBeallitasokat();

  assert.equal(beallitasok.headless, true);
  assert.deepEqual(beallitasok.args, PUPPETEER_HTTP_KOMPATIBILITASI_KAPCSOLOK);
  assert.match(beallitasok.args[0], /HttpsFirstBalancedModeAutoEnable/);
  assert.match(beallitasok.args[0], /HttpsUpgrades/);
});

test("headful módban a Puppeteer látható böngészővel indul", () => {
  const beallitasok = epitPuppeteerInditasiBeallitasokat({ headful: true });

  assert.equal(beallitasok.headless, false);
  assert.deepEqual(beallitasok.args, PUPPETEER_HTTP_KOMPATIBILITASI_KAPCSOLOK);
});

test("az extra Puppeteer kapcsolók a közös kompatibilitási kapcsolók mögé kerülnek", () => {
  const beallitasok = epitPuppeteerInditasiBeallitasokat({
    extraArgs: ["--lang=hu-HU"],
  });

  assert.deepEqual(beallitasok.args, [
    ...PUPPETEER_HTTP_KOMPATIBILITASI_KAPCSOLOK,
    "--lang=hu-HU",
  ]);
});
