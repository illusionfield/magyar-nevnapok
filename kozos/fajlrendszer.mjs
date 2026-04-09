// kozos/fajlrendszer.mjs
// Kis fájlrendszer-segédek a kanonikus pipeline-hoz.

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function letrehozSzuloKonyvtarat(fajlUtvonal) {
  await fs.mkdir(path.dirname(fajlUtvonal), { recursive: true });
}

export async function letezik(utvonal) {
  try {
    await fs.access(utvonal);
    return true;
  } catch {
    return false;
  }
}

export async function sha256Fajl(utvonal) {
  const adat = await fs.readFile(utvonal);
  return crypto.createHash("sha256").update(adat).digest("hex");
}

export async function fajlMeret(utvonal) {
  const stat = await fs.stat(utvonal);
  return stat.size;
}

