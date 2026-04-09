// kozos/strukturalt-fajl.mjs
// YAML az alapértelmezett, de olvasáskor JSON is támogatott.

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { letrehozSzuloKonyvtarat } from "./fajlrendszer.mjs";

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

export async function betoltStrukturaltFajl(utvonal) {
  const formatum = felismerFormatum(utvonal);
  const nyers = await fs.readFile(utvonal, "utf8");

  if (formatum === "json") {
    return JSON.parse(nyers);
  }

  return YAML.parse(nyers);
}

export function betoltStrukturaltFajlSzinkron(utvonal) {
  const formatum = felismerFormatum(utvonal);
  const nyers = fsSync.readFileSync(utvonal, "utf8");

  if (formatum === "json") {
    return JSON.parse(nyers);
  }

  return YAML.parse(nyers);
}

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

export async function mentStrukturaltFajl(utvonal, adat, formatum = null) {
  const celFormatum = felismerFormatum(utvonal, formatum);
  const szoveg = szerializalStrukturaltAdat(adat, celFormatum);
  await letrehozSzuloKonyvtarat(utvonal);
  await fs.writeFile(utvonal, szoveg, "utf8");
}
