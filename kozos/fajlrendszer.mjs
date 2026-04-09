/**
 * kozos/fajlrendszer.mjs
 * Kis fájlrendszer-segédek az elsődleges pipeline-hoz.
 */

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * A `letrehozSzuloKonyvtarat` biztosítja, hogy a célfájl szülőkönyvtára létezzen.
 */
export async function letrehozSzuloKonyvtarat(fajlUtvonal) {
  await fs.mkdir(path.dirname(fajlUtvonal), { recursive: true });
}

/**
 * A `letezik` megmondja, hogy a megadott útvonal jelenleg elérhető-e.
 */
export async function letezik(utvonal) {
  try {
    await fs.access(utvonal);
    return true;
  } catch {
    return false;
  }
}

/**
 * A `sha256Fajl` a megadott fájl SHA-256 ujjlenyomatát számolja ki.
 */
export async function sha256Fajl(utvonal) {
  const adat = await fs.readFile(utvonal);
  return crypto.createHash("sha256").update(adat).digest("hex");
}

/**
 * A `fajlMeret` a megadott fájl méretét adja vissza bájtban.
 */
export async function fajlMeret(utvonal) {
  const stat = await fs.stat(utvonal);
  return stat.size;
}
