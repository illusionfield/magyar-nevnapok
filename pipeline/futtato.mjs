/**
 * pipeline/futtato.mjs
 * Az elsődleges pipeline futtatása és állapotvizsgálata.
 */

import fs from "node:fs/promises";
import { pipelineLepesek, keresLepest } from "./lepesek.mjs";
import { betoltManifest } from "./manifest.mjs";
import { letezik } from "../kozos/fajlrendszer.mjs";

/**
 * A `fajlIdo` a megadott fájl utolsó módosítási idejét adja vissza.
 */
async function fajlIdo(utvonal) {
  try {
    const stat = await fs.stat(utvonal);
    return stat.mtimeMs;
  } catch {
    return null;
  }
}

/**
 * A `meghatarozLepesAllapot` eldönti, hogy egy pipeline-lépés kész, hiányzó vagy elavult állapotban van-e.
 */
async function meghatarozLepesAllapot(lep, mindenLepes) {
  const hianyzikKimenet = !(await Promise.all(lep.kimenetek.map((ut) => letezik(ut)))).every(Boolean);

  if (hianyzikKimenet) {
    // Ha a lépés kimenete még nem létezik, két esetet különböztetünk meg:
    // vagy a futtatás hiányzik, vagy még a bemeneti előfeltételei sem állnak rendelkezésre.
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

    // A legregebbi kimenetet hasonlítjuk a legfrissebb bemenethez, mert egy többfájlos lépés
    // csak akkor tekinthető valóban frissnek, ha minden kimenete újabb minden releváns bemenetnél.
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
    // A lépés saját fájlszintű frissessége önmagában nem elég: ha bármelyik függősége elavult,
    // ezt a lépést is várakozó állapotúnak mutatjuk, hogy a webes állapotnézetben tiszta maradjon a teendősor.
    if (fuggAllapot !== "kesz") {
      return "fuggoseg-frissitesre-var";
    }
  }

  return "kesz";
}

/**
 * A `kibontCel` feloldja a kért pipeline-célt a teljes végrehajtási sorrendre.
 */
function kibontCel(cel) {
  if (cel === "teljes") {
    return pipelineLepesek.map((lep) => lep.azonosito);
  }

  const lep = keresLepest(cel);
  if (!lep) {
    throw new Error(`Ismeretlen pipeline-cél: ${cel}`);
  }

  const felhalmozott = new Set();

  /**
   * A `bejar` rekurzívan összegyűjti a célhoz szükséges függőségi lépéseket.
   */
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

/**
 * A `listazPipelineAllapot` elkészíti a lépések aktuális állapotnézetét.
 */
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

/**
 * A `futtatPipelineCelt` lefuttatja a kért pipeline-célt és annak függőségeit.
 */
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

/**
 * A `listazPipelineCelokat` visszaadja az összes választható pipeline-célt.
 */
export function listazPipelineCelokat() {
  return ["teljes", ...pipelineLepesek.map((lep) => lep.azonosito)];
}
