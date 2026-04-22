/**
 * pipeline/futtato.mjs
 * Az elsődleges pipeline futtatása és admin állapotvizsgálata.
 */

import fs from "node:fs/promises";
import { parseMonthDay } from "../domainek/primer/alap.mjs";
import { betoltStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import {
  pipelineCsoportok,
  pipelineLepesek,
  keresLepest,
  keresPipelineCsoportot,
} from "./lepesek.mjs";
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

async function resolveArtifacts(lep) {
  const bemenetek = typeof lep.getBemenetek === "function" ? await lep.getBemenetek() : lep.bemenetek ?? [];
  const kimenetek = typeof lep.getKimenetek === "function" ? await lep.getKimenetek() : lep.kimenetek ?? [];

  return {
    bemenetek,
    kimenetek,
  };
}

function parseIsoToMs(value) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function buildResolvedArtifactsMap(mindenLepes = []) {
  const resolved = new Map();

  for (const lep of mindenLepes) {
    resolved.set(lep.azonosito, await resolveArtifacts(lep));
  }

  return resolved;
}

function buildManagedOutputPathSet(resolvedArtifacts = new Map()) {
  const managed = new Set();

  for (const artifacts of resolvedArtifacts.values()) {
    for (const kimenet of artifacts.kimenetek ?? []) {
      managed.add(kimenet);
    }
  }

  return managed;
}

function crawlerSafeLepes(lep) {
  return lep?.safeMode === "crawler";
}

function buildCrawlerSafetyPolicyLabel() {
  return "Web crawleres lépés: normál frissítésnél csak hiány vagy anomália esetén fut.";
}

function createPipelineConfirmationError(cel, steps = []) {
  const error = new Error("A kiválasztott pipeline-futás web crawleres lépést is indítana.");
  error.code = "pipeline_confirmation_required";
  error.statusCode = 409;
  error.details = {
    target: cel,
    steps,
  };
  return error;
}

function addSanityReason(reasons, message) {
  if (reasons.length >= 6) {
    return;
  }

  reasons.push(message);
}

async function vizsgalCrawlerSanityt(lep, resolvedArtifacts = new Map()) {
  if (!crawlerSafeLepes(lep)) {
    return null;
  }

  const { kimenetek = [] } = resolvedArtifacts.get(lep.azonosito) ?? (await resolveArtifacts(lep));
  const outputPath = kimenetek[0] ?? null;

  if (!outputPath || !(await letezik(outputPath))) {
    return {
      state: "missing",
      outputPath,
      reasons: ["Hiányzik a kimeneti fájl."],
    };
  }

  let payload = null;

  try {
    payload = await betoltStrukturaltFajl(outputPath);
  } catch (error) {
    return {
      state: "anomaly",
      outputPath,
      reasons: [`A kimenet nem tölthető be: ${error.message}`],
    };
  }

  const reasons = [];

  if (lep.azonosito === "wiki-primer-gyujtes") {
    const days = Array.isArray(payload?.days) ? payload.days : null;

    if (!days) {
      addSanityReason(reasons, "A days tömb hiányzik.");
    } else {
      if (days.length !== 366) {
        addSanityReason(reasons, `A days tömb hossza nem 366, hanem ${days.length}.`);
      }

      const seenMonthDays = new Set();

      for (const day of days) {
        if (!parseMonthDay(day?.monthDay)) {
          addSanityReason(reasons, `Érvénytelen monthDay: ${String(day?.monthDay ?? "—")}.`);
          continue;
        }

        if (seenMonthDays.has(day.monthDay)) {
          addSanityReason(reasons, `Duplikált monthDay: ${day.monthDay}.`);
        }

        seenMonthDays.add(day.monthDay);

        if (!Array.isArray(day?.names)) {
          addSanityReason(reasons, `A ${day.monthDay} nap names tömbje hiányzik.`);
        }

        if (reasons.length >= 6) {
          break;
        }
      }
    }
  } else if (lep.azonosito === "portal-nevadatbazis-epites") {
    const names = Array.isArray(payload?.names) ? payload.names : null;
    const stats = payload?.stats ?? {};

    if (!names) {
      addSanityReason(reasons, "A names tömb hiányzik.");
    } else {
      if (names.length === 0) {
        addSanityReason(reasons, "A names tömb üres.");
      }

      if (stats?.nameCount !== names.length) {
        addSanityReason(
          reasons,
          `A stats.nameCount (${stats?.nameCount ?? "—"}) nem egyezik a names tömb hosszával (${names.length}).`
        );
      }

      if ((stats?.namedayAssignmentCount ?? 0) <= 0) {
        addSanityReason(reasons, "A stats.namedayAssignmentCount nem pozitív.");
      }

      for (const entry of names) {
        if (!String(entry?.name ?? "").trim()) {
          addSanityReason(reasons, "Van olyan névrekord, amelyből hiányzik a name.");
        }

        if (!Array.isArray(entry?.days)) {
          addSanityReason(
            reasons,
            `A ${String(entry?.name ?? "névtelen rekord")} days tömbje hiányzik.`
          );
        }

        if (reasons.length >= 6) {
          break;
        }
      }
    }
  }

  return {
    state: reasons.length === 0 ? "ok" : "anomaly",
    outputPath,
    reasons,
  };
}

async function meghatarozLepesReszleteit(
  lep,
  mindenLepes,
  {
    manifestMap = new Map(),
    resolvedArtifacts = new Map(),
    managedOutputPaths = new Set(),
    cache = new Map(),
  } = {}
) {
  if (cache.has(lep.azonosito)) {
    return cache.get(lep.azonosito);
  }

  const promise = (async () => {
    const { bemenetek, kimenetek } =
      resolvedArtifacts.get(lep.azonosito) ?? (await resolveArtifacts(lep));
    const safety = crawlerSafeLepes(lep)
      ? await vizsgalCrawlerSanityt(lep, resolvedArtifacts)
      : null;
    const hianyzikKimenet = !(await Promise.all(kimenetek.map((ut) => letezik(ut)))).every(Boolean);

    if (hianyzikKimenet) {
      const hianyoznakBemenetek = (await Promise.all(bemenetek.map((ut) => letezik(ut)))).some(
        (ertek) => !ertek
      );
      return {
        status: hianyoznakBemenetek ? "blokkolt" : "hianyzik",
        safety,
      };
    }

    if (crawlerSafeLepes(lep) && safety?.state === "ok") {
      return {
        status: "kesz",
        safety,
      };
    }

    if (crawlerSafeLepes(lep) && safety?.state === "anomaly") {
      return {
        status: "elavult",
        safety,
      };
    }

    const dependencyGeneratedAt = [];

    for (const fuggoseg of lep.dependsOn ?? []) {
      const fuggLep = mindenLepes.find((elem) => elem.azonosito === fuggoseg);

      if (!fuggLep) {
        continue;
      }

      const fuggAllapot = await meghatarozLepesReszleteit(fuggLep, mindenLepes, {
        manifestMap,
        resolvedArtifacts,
        managedOutputPaths,
        cache,
      });

      if (fuggAllapot.status !== "kesz") {
        return {
          status: "fuggoseg-frissitesre-var",
          safety,
        };
      }

      const fuggManifest = manifestMap.get(fuggoseg) ?? null;
      const fuggGeneratedAt = parseIsoToMs(fuggManifest?.generatedAt);

      if (fuggGeneratedAt != null) {
        dependencyGeneratedAt.push(fuggGeneratedAt);
      }
    }

    const manifestLepes = manifestMap.get(lep.azonosito) ?? null;
    const lepGeneratedAt = parseIsoToMs(manifestLepes?.generatedAt);

    if (lepGeneratedAt != null) {
      if (manifestLepes?.status !== "sikeres") {
        return {
          status: "elavult",
          safety,
        };
      }

      if (dependencyGeneratedAt.some((idopont) => idopont > lepGeneratedAt)) {
        return {
          status: "elavult",
          safety,
        };
      }

      const kulsoBemenetek = bemenetek.filter((utvonal) => !managedOutputPaths.has(utvonal));
      const kulsoBemenetIdok = (await Promise.all(kulsoBemenetek.map((ut) => fajlIdo(ut)))).filter(Boolean);

      if (kulsoBemenetIdok.some((idopont) => idopont > lepGeneratedAt)) {
        return {
          status: "elavult",
          safety,
        };
      }

      return {
        status: "kesz",
        safety,
      };
    }

    const bemenetIdok = (await Promise.all(bemenetek.map((ut) => fajlIdo(ut)))).filter(Boolean);
    const kimenetIdok = (await Promise.all(kimenetek.map((ut) => fajlIdo(ut)))).filter(Boolean);

    if (bemenetIdok.length > 0 && kimenetIdok.length > 0) {
      const legujabbBemenet = Math.max(...bemenetIdok);
      const legregebbiKimenet = Math.min(...kimenetIdok);

      if (legujabbBemenet > legregebbiKimenet) {
        return {
          status: "elavult",
          safety,
        };
      }
    }

    return {
      status: safety?.state === "anomaly" ? "elavult" : "kesz",
      safety,
    };
  })();

  cache.set(lep.azonosito, promise);
  return promise;
}

function kibontCel(cel) {
  if (cel === "teljes") {
    return pipelineLepesek.map((lep) => lep.azonosito);
  }

  const csoport = keresPipelineCsoportot(cel);

  if (csoport) {
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

    for (const azonosito of csoport.lepesek) {
      bejar(azonosito);
    }

    return pipelineLepesek
      .map((lep) => lep.azonosito)
      .filter((azonosito) => felhalmozott.has(azonosito));
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

async function buildPipelineFuttatasiElonezet(cel, opciok = {}) {
  const sorrend = kibontCel(cel);
  const manifest = await betoltManifest();
  const manifestMap = new Map(manifest.steps.map((step) => [step.stepId, step]));
  const resolvedArtifacts = await buildResolvedArtifactsMap(pipelineLepesek);
  const managedOutputPaths = buildManagedOutputPathSet(resolvedArtifacts);
  const cache = new Map();
  const stepDetails = new Map();

  for (const azonosito of sorrend) {
    const lep = keresLepest(azonosito);

    if (!lep) {
      continue;
    }

    stepDetails.set(
      azonosito,
      await meghatarozLepesReszleteit(lep, pipelineLepesek, {
        manifestMap,
        resolvedArtifacts,
        managedOutputPaths,
        cache,
      })
    );
  }

  return {
    sorrend,
    manifestMap,
    resolvedArtifacts,
    managedOutputPaths,
    cache,
    stepDetails,
    crawlerStepsNeedingConfirmation: sorrend
      .map((azonosito) => {
        const lep = keresLepest(azonosito);
        const details = stepDetails.get(azonosito) ?? null;
        const shouldRun = opciok.force === true || details?.status !== "kesz";

        if (!lep || !crawlerSafeLepes(lep) || !shouldRun) {
          return null;
        }

        return {
          stepId: azonosito,
          title: lep.leiras,
          requestedByForce: opciok.force === true,
          sanityState: details?.safety?.state ?? "unknown",
          reasons:
            details?.safety?.state === "missing"
              ? ["Hiányzik a kimeneti fájl."]
              : details?.safety?.reasons ?? [],
          outputPath: details?.safety?.outputPath ?? null,
        };
      })
      .filter(Boolean),
  };
}

export async function ellenorizPipelineFuttatasiIgenyt(cel, opciok = {}) {
  const elonezet = await buildPipelineFuttatasiElonezet(cel, opciok);

  if (opciok.confirmCrawlerRun !== true && elonezet.crawlerStepsNeedingConfirmation.length > 0) {
    throw createPipelineConfirmationError(cel, elonezet.crawlerStepsNeedingConfirmation);
  }

  return elonezet;
}

export async function listazPipelineAllapot() {
  const manifest = await betoltManifest();
  const manifestMap = new Map(manifest.steps.map((step) => [step.stepId, step]));
  const sorok = [];
  const cache = new Map();
  const resolvedArtifacts = await buildResolvedArtifactsMap(pipelineLepesek);
  const managedOutputPaths = buildManagedOutputPathSet(resolvedArtifacts);

  for (const lep of pipelineLepesek) {
    const reszletek = await meghatarozLepesReszleteit(lep, pipelineLepesek, {
      manifestMap,
      resolvedArtifacts,
      managedOutputPaths,
      cache,
    });
    const manifestLepes = manifestMap.get(lep.azonosito) ?? null;
    const { bemenetek, kimenetek } = resolvedArtifacts.get(lep.azonosito) ?? (await resolveArtifacts(lep));

    sorok.push({
      azonosito: lep.azonosito,
      leiras: lep.leiras,
      csoport: lep.csoport ?? null,
      status: reszletek.status,
      bemenetek,
      kimenetek,
      dependsOn: lep.dependsOn ?? [],
      safeMode: lep.safeMode ?? null,
      safety:
        lep.safeMode === "crawler"
          ? {
              policyLabel: buildCrawlerSafetyPolicyLabel(),
              sanityState: reszletek.safety?.state ?? null,
              reasons: reszletek.safety?.reasons ?? [],
              outputPath: reszletek.safety?.outputPath ?? null,
            }
          : null,
      utolsoFutas: manifestLepes?.generatedAt ?? null,
      utolsoStatus: manifestLepes?.status ?? null,
    });
  }

  return sorok;
}

export async function futtatPipelineCelt(cel, opciok = {}) {
  const reporter = opciok.reporter ?? null;
  const eredmenyek = [];
  const {
    sorrend,
    manifestMap,
    resolvedArtifacts,
    managedOutputPaths,
    cache: allapotCache,
    crawlerStepsNeedingConfirmation,
  } = await buildPipelineFuttatasiElonezet(cel, opciok);

  if (opciok.confirmCrawlerRun !== true && crawlerStepsNeedingConfirmation.length > 0) {
    throw createPipelineConfirmationError(cel, crawlerStepsNeedingConfirmation);
  }

  const szekciok = sorrend.map((azonosito) => ({
    id: azonosito,
    label: keresLepest(azonosito)?.leiras ?? azonosito,
    status: "pending",
  }));

  reporter?.sections(szekciok);
  reporter?.progress(0, sorrend.length, {
    stageLabel: "A pipeline előkészítése",
  });

  let kesz = 0;

  for (const azonosito of sorrend) {
    const lep = keresLepest(azonosito);
    const aktualisReszletek = await meghatarozLepesReszleteit(lep, pipelineLepesek, {
      manifestMap,
      resolvedArtifacts,
      managedOutputPaths,
      cache: allapotCache,
    });
    const aktualisAllapot = aktualisReszletek.status;
    const szekcio = szekciok.find((entry) => entry.id === azonosito);

    if (szekcio) {
      szekcio.status = "running";
    }

    reporter?.sections(szekciok);
    reporter?.stage(`Fut: ${lep.leiras.replace(/\.$/u, "")}`);

    if (!opciok.force && aktualisAllapot === "kesz") {
      if (szekcio) {
        szekcio.status = "skipped";
        szekcio.meta = "Már friss.";
      }

      kesz += 1;
      reporter?.sections(szekciok);
      reporter?.progress(kesz, sorrend.length, {
        stageLabel: `Kihagyva: ${lep.leiras.replace(/\.$/u, "")}`,
      });
      eredmenyek.push({
        azonosito,
        kihagyva: true,
        indok: "A lépés kimenetei már frissek.",
      });
      continue;
    }

    try {
      const eredmeny = await lep.futtat(opciok);
      const manifestFriss = await betoltManifest();
      manifestMap.set(
        azonosito,
        manifestFriss.steps.find((step) => step.stepId === azonosito) ?? manifestMap.get(azonosito) ?? null
      );
      allapotCache.clear();

      if (szekcio) {
        szekcio.status = "completed";
        szekcio.meta = "Frissítve.";
      }

      kesz += 1;
      reporter?.sections(szekciok);
      reporter?.progress(kesz, sorrend.length, {
        stageLabel: `Kész: ${lep.leiras.replace(/\.$/u, "")}`,
      });
      eredmenyek.push({
        azonosito,
        eredmeny,
      });
    } catch (error) {
      if (szekcio) {
        szekcio.status = "failed";
        szekcio.meta = error?.message ?? "Ismeretlen hiba.";
      }

      reporter?.sections(szekciok);
      reporter?.state({
        stageLabel: `Hiba: ${lep.leiras.replace(/\.$/u, "")}`,
      });
      throw error;
    }
  }

  reporter?.progress(sorrend.length, sorrend.length, {
    stageLabel: "A pipeline futása befejeződött",
  });

  return eredmenyek;
}

export function listazPipelineCelokat() {
  return [
    "teljes",
    ...pipelineCsoportok.map((csoport) => csoport.azonosito),
    ...pipelineLepesek.map((lep) => lep.azonosito),
  ];
}
