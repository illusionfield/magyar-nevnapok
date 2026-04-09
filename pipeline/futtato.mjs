// pipeline/futtato.mjs
// A kanonikus pipeline futtatása és állapotvizsgálata.

import fs from "node:fs/promises";
import { pipelineLepesek, keresLepest } from "./lepesek.mjs";
import { betoltManifest } from "./manifest.mjs";
import { letezik } from "../kozos/fajlrendszer.mjs";

async function fajlIdo(utvonal) {
  try {
    const stat = await fs.stat(utvonal);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

function egyedi(lista) {
  return [...new Set(lista)];
}

async function meghatarozLepesAllapot(lep, mindenLepes) {
  const hianyzikKimenet = !(await Promise.all(lep.kimenetek.map((ut) => letezik(ut)))).every(Boolean);

  if (hianyzikKimenet) {
    const hianyoznakBemenetek = (await Promise.all(lep.bemenetek.map((ut) => letezik(ut)))).some(
      (ertek) => !ertek
    );
    return hianyoznakBemenetek ? "blokkolt" : "hianyzik";
  }

  const bemenetIdok = (await Promise.all(lep.bemenetek.map((ut) => fajlIdo(ut)))).filter(Boolean);
  const kimenetIdok = (await Promise.all(lep.kimenetek.map((ut) => fajlIdo(ut)))).filter(Boolean);

  if (bemenetIdok.length > 0 && kimenetIdok.length > 0) {
    const legujabbBemenet = Math.max(...bemenetIdok);
    const legregebbiKimenet = Math.min(...kimenetIdok);

    if (legujabbBemenet > legregebbiKimenet) {
      return "elavult";
    }
  }

  for (const fuggoseg of lep.dependsOn ?? []) {
    const fuggLep = mindenLepes.find((elem) => elem.azonosito === fuggoseg);
    if (!fuggLep) {
      continue;
    }

    const fuggAllapot = await meghatarozLepesAllapot(fuggLep, mindenLepes);
    if (fuggAllapot !== "kesz") {
      return "fuggoseg-frissitesre-var";
    }
  }

  return "kesz";
}

function kibontCel(cel) {
  if (cel === "teljes") {
    return pipelineLepesek.map((lep) => lep.azonosito);
  }

  const lep = keresLepest(cel);
  if (!lep) {
    throw new Error(`Ismeretlen pipeline-cél: ${cel}`);
  }

  const felhalmozott = new Set();

  function bejar(azonosito) {
    const aktualis = keresLepest(azonosito);
    if (!aktualis || felhalmozott.has(azonosito)) {
      return;
    }

    for (const fuggoseg of aktualis.dependsOn ?? []) {
      bejar(fuggoseg);
    }

    felhalmozott.add(azonosito);
  }

  bejar(cel);
  return pipelineLepesek
    .map((lep) => lep.azonosito)
    .filter((azonosito) => felhalmozott.has(azonosito));
}

export async function listazPipelineAllapot() {
  const manifest = await betoltManifest();
  const sorok = [];

  for (const lep of pipelineLepesek) {
    const status = await meghatarozLepesAllapot(lep, pipelineLepesek);
    const manifestLepes = manifest.steps.find((elem) => elem.stepId === lep.azonosito) ?? null;
    sorok.push({
      azonosito: lep.azonosito,
      leiras: lep.leiras,
      status,
      bemenetek: lep.bemenetek,
      kimenetek: lep.kimenetek,
      utolsoFutas: manifestLepes?.generatedAt ?? null,
      utolsoStatus: manifestLepes?.status ?? null,
    });
  }

  return sorok;
}

export async function futtatPipelineCelt(cel, opciok = {}) {
  const sorrend = kibontCel(cel);
  const eredmenyek = [];

  for (const azonosito of sorrend) {
    const lep = keresLepest(azonosito);
    const aktualisAllapot = await meghatarozLepesAllapot(lep, pipelineLepesek);

    if (!opciok.force && aktualisAllapot === "kesz") {
      eredmenyek.push({
        azonosito,
        kihagyva: true,
        indok: "A lépés kimenetei már frissek.",
      });
      continue;
    }

    const eredmeny = await lep.futtat(opciok);
    eredmenyek.push({
      azonosito,
      eredmeny,
    });
  }

  return eredmenyek;
}

export function listazPipelineCelokat() {
  return ["teljes", ...pipelineLepesek.map((lep) => lep.azonosito)];
}
