/**
 * scripts/typecheck.mjs
 * Repo-szintű statikus ellenőrzés plain JavaScript / ESM projekthez.
 *
 * Mivel a projekt nem TypeScriptet használ, itt a `typecheck` a következőket jelenti:
 * - a fontos package entrypointok valóban léteznek,
 * - a saját forrásfájlok szintaktikailag érvényesek,
 * - és a teljes, verziózott kódfelület legalább `node --check` szinten konzisztens.
 */

import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json");
const projektGyoker = process.cwd();
const kihagyottKonyvtarak = new Set([
  ".git",
  ".local",
  "node_modules",
  "output",
  "tmp",
]);
const ellenorzottKiterjesztesek = new Set([".mjs", ".js"]);

/**
 * A `normalizaltRelativUtvonal` a felhasználói üzenetekhez stabil, rövid útvonalat készít.
 */
function normalizaltRelativUtvonal(utvonal) {
  return path.relative(projektGyoker, utvonal) || path.basename(utvonal);
}

/**
 * A `packageEntrypointok` összegyűjti a package-szintű belépési pontokat.
 *
 * Ezek külön ellenőrzést kapnak, mert ha a `package.json` kifelé hibás célfájlra mutat,
 * az a repó egyik legsúlyosabb kiadási regressziója lenne.
 */
function packageEntrypointok() {
  const entrypointok = new Set();

  if (typeof packageJson.main === "string") {
    entrypointok.add(packageJson.main);
  }

  if (typeof packageJson.exports === "string") {
    entrypointok.add(packageJson.exports);
  }

  if (packageJson.bin && typeof packageJson.bin === "object") {
    for (const cel of Object.values(packageJson.bin)) {
      if (typeof cel === "string") {
        entrypointok.add(cel);
      }
    }
  }

  return Array.from(entrypointok, (relativ) => path.resolve(projektGyoker, relativ));
}

/**
 * A `sajatKodfajlok` rekurzívan összegyűjti az ellenőrizendő lokális JS/MJS fájlokat.
 */
async function sajatKodfajlok(konyvtar) {
  const eredmeny = [];
  const bejegyzesek = await readdir(konyvtar, { withFileTypes: true });

  for (const bejegyzes of bejegyzesek) {
    const teljesUtvonal = path.join(konyvtar, bejegyzes.name);

    if (bejegyzes.isDirectory()) {
      if (kihagyottKonyvtarak.has(bejegyzes.name)) {
        continue;
      }

      eredmeny.push(...(await sajatKodfajlok(teljesUtvonal)));
      continue;
    }

    if (!bejegyzes.isFile()) {
      continue;
    }

    if (!ellenorzottKiterjesztesek.has(path.extname(bejegyzes.name))) {
      continue;
    }

    eredmeny.push(teljesUtvonal);
  }

  return eredmeny;
}

/**
 * A `futtatNodeChecket` a Node beépített szintaxisellenőrzőjét futtatja egy fájlon.
 */
function futtatNodeChecket(fajlUtvonal) {
  return spawnSync(process.execPath, ["--check", fajlUtvonal], {
    cwd: projektGyoker,
    encoding: "utf8",
  });
}

/**
 * A `letezoEntrypointok` ellenőrzi, hogy a package által hirdetett célfájlok valóban léteznek-e.
 */
async function letezoEntrypointok() {
  const hianyzo = [];

  for (const entrypoint of packageEntrypointok()) {
    try {
      const adat = await stat(entrypoint);

      if (!adat.isFile()) {
        hianyzo.push(`${normalizaltRelativUtvonal(entrypoint)} nem normál fájl.`);
      }
    } catch {
      hianyzo.push(`${normalizaltRelativUtvonal(entrypoint)} hiányzik.`);
    }
  }

  return hianyzo;
}

/**
 * A `main` lefuttatja a teljes typecheck kört.
 */
async function main() {
  const hianyzoEntrypointok = await letezoEntrypointok();

  if (hianyzoEntrypointok.length > 0) {
    for (const hiba of hianyzoEntrypointok) {
      console.error(`Entrypoint hiba: ${hiba}`);
    }

    process.exitCode = 1;
    return;
  }

  const ellenorzendoFajlok = await sajatKodfajlok(projektGyoker);
  const hibak = [];

  for (const fajl of ellenorzendoFajlok) {
    const eredmeny = futtatNodeChecket(fajl);

    if (eredmeny.status === 0) {
      continue;
    }

    hibak.push({
      fajl: normalizaltRelativUtvonal(fajl),
      stderr: (eredmeny.stderr ?? "").trim(),
      stdout: (eredmeny.stdout ?? "").trim(),
    });
  }

  if (hibak.length > 0) {
    console.error(`Typecheck hiba: ${hibak.length} fájl nem ment át a Node szintaxisellenőrzésén.`);

    for (const hiba of hibak) {
      console.error(`\n--- ${hiba.fajl} ---`);
      console.error(hiba.stderr || hiba.stdout || "Ismeretlen szintaxisellenőrzési hiba.");
    }

    process.exitCode = 1;
    return;
  }

  console.log(
    `Typecheck rendben: ${ellenorzendoFajlok.length} saját JS/MJS fájl és ${packageEntrypointok().length} package entrypoint ellenőrizve.`
  );
}

await main();
