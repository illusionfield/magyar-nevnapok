/**
 * kozos/puppeteer-inditas.mjs
 * Közös Puppeteer-indítási segédek a scraper munkafolyamatokhoz.
 */

/**
 * A HUN-REN utónévportál továbbra is sima HTTP-n érhető el.
 *
 * Puppeteer 24 alatt a Chromium fej nélküli módja hajlamos HTTPS-first
 * automatikus felülbírálással blokkolni ezt a forrást `ERR_BLOCKED_BY_CLIENT`
 * hibával. Ezeket a kapcsolókat központilag tartjuk karban, hogy a scraper
 * mind a Wikipédia, mind a HUN-REN oldalak esetén stabilan működjön.
 */
export const PUPPETEER_HTTP_KOMPATIBILITASI_KAPCSOLOK = [
  "--disable-features=HttpsFirstBalancedModeAutoEnable,HttpsUpgrades",
];

/**
 * Az `epitPuppeteerInditasiBeallitasokat` egységes launch-opciót ad vissza.
 */
export function epitPuppeteerInditasiBeallitasokat(opciok = {}) {
  return {
    headless: opciok.headful ? false : (opciok.headless ?? true),
    args: [
      ...PUPPETEER_HTTP_KOMPATIBILITASI_KAPCSOLOK,
      ...(opciok.extraArgs ?? []),
    ],
  };
}
