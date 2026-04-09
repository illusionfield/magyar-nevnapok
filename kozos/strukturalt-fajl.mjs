/**
 * kozos/strukturalt-fajl.mjs
 * YAML az alapértelmezett, de olvasáskor JSON is támogatott.
 */

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { letrehozSzuloKonyvtarat } from "./fajlrendszer.mjs";

/**
 * A `felismerFormatum` a fájlnévből vagy a kényszerített opcióból meghatározza a formátumot.
 */
export function felismerFormatum(utvonal, kenyszeritettFormatum = null) {
  if (kenyszeritettFormatum) {
    return normalizalFormatum(kenyszeritettFormatum);
  }

  const kiterjesztes = path.extname(utvonal).toLowerCase();

  if (kiterjesztes === ".json") {
    return "json";
  }

  if (kiterjesztes === ".yaml" || kiterjesztes === ".yml") {
    return "yaml";
  }

  return "yaml";
}

/**
 * A `normalizalFormatum` egységes belső formára hozza a kért fájlformátumot.
 */
export function normalizalFormatum(ertek) {
  const normalizalt = String(ertek ?? "").trim().toLowerCase();

  if (normalizalt === "json") {
    return "json";
  }

  if (normalizalt === "yaml" || normalizalt === "yml") {
    return "yaml";
  }

  throw new Error(`Nem támogatott strukturált fájlformátum: ${ertek}`);
}

/**
 * A `betoltStrukturaltFajl` YAML vagy JSON fájlból olvas be strukturált adatot.
 */
export async function betoltStrukturaltFajl(utvonal) {
  const formatum = felismerFormatum(utvonal);
  const nyers = await fs.readFile(utvonal, "utf8");

  if (formatum === "json") {
    return JSON.parse(nyers);
  }

  return YAML.parse(nyers);
}

/**
 * A `betoltStrukturaltFajlSzinkron` szinkron módon olvas be YAML vagy JSON adatot.
 */
export function betoltStrukturaltFajlSzinkron(utvonal) {
  const formatum = felismerFormatum(utvonal);
  const nyers = fsSync.readFileSync(utvonal, "utf8");

  if (formatum === "json") {
    return JSON.parse(nyers);
  }

  return YAML.parse(nyers);
}

/**
 * A `szerializalStrukturaltAdat` YAML vagy JSON szöveggé alakítja az adatot.
 */
export function szerializalStrukturaltAdat(adat, formatum = "yaml") {
  const normalizalt = normalizalFormatum(formatum);

  if (normalizalt === "json") {
    return `${JSON.stringify(adat, null, 2)}\n`;
  }

  return YAML.stringify(adat, {
    indent: 2,
    lineWidth: 0,
    minContentWidth: 0,
  });
}

/**
 * A `mentStrukturaltFajl` a megfelelő formátumban kiírja a strukturált adatot.
 */
export async function mentStrukturaltFajl(utvonal, adat, formatum = null) {
  const celFormatum = felismerFormatum(utvonal, formatum);
  const szoveg = szerializalStrukturaltAdat(adat, celFormatum);
  await letrehozSzuloKonyvtarat(utvonal);
  await fs.writeFile(utvonal, szoveg, "utf8");
}
