/**
 * domainek/primer/helyi-primer-felulirasok.mjs
 * Helyi, nem követett primerkiegészítések betöltése és mentése.
 *
 * Fontos különbség a közös, követett `primary-registry-overrides.yaml` fájlhoz képest:
 * itt a napi nevek nem lecserélik a közös primereket, hanem hozzáadódnak azokhoz.
 * Ezzel minden felhasználó előállíthat magának saját primeres naptárat anélkül,
 * hogy a közös, repo-követett döntési réteget módosítaná.
 */

import path from "node:path";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";
import { letezik } from "../../kozos/fajlrendszer.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";
import { dedupeKeepOrder, normalizeNameForMatch, parseMonthDay } from "./alap.mjs";

export const DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH =
  kanonikusUtvonalak.kezi.primerFelulirasokHelyi;
const ERVENYES_HELYI_PRIMER_FORRASOK = new Set(["default", "legacy", "ranked", "either"]);

/**
 * Az `alapertelmezettHelyiPrimerBeallitasok` a helyi, személyes primerbeállítások alapértékeit adja.
 */
export function alapertelmezettHelyiPrimerBeallitasok() {
  return {
    primarySource: "default",
  };
}

/**
 * Az `uresHelyiPrimerFelulirasPayload` létrehozza az üres, de érvényes helyi felülírási payloadot.
 */
export function uresHelyiPrimerFelulirasPayload(generatedAt = new Date().toISOString()) {
  return {
    version: 1,
    generatedAt,
    source: "helyi egyedi primerkiegészítések",
    settings: alapertelmezettHelyiPrimerBeallitasok(),
    days: [],
  };
}

/**
 * A `betoltHelyiPrimerFelulirasokat` betölti a helyi felülírási fájlt, vagy hiány esetén üres payloadot ad.
 */
export async function betoltHelyiPrimerFelulirasokat(
  filePath = DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH
) {
  const resolvedPath = path.resolve(process.cwd(), filePath);

  if (!(await letezik(resolvedPath))) {
    return {
      path: resolvedPath,
      payload: uresHelyiPrimerFelulirasPayload(),
    };
  }

  const payload = await betoltStrukturaltFajl(resolvedPath);

  if (!Array.isArray(payload?.days)) {
    throw new Error(
      `A helyi primerkiegészítések nem tartalmaznak érvényes days tömböt: ${resolvedPath}`
    );
  }

  return {
    path: resolvedPath,
    payload,
  };
}

/**
 * A `normalizalHelyiPrimerBeallitasokat` beolvasható, stabil szerkezetet ad a helyi beállításokhoz.
 */
function normalizalHelyiPrimerBeallitasokat(settings) {
  const alap = alapertelmezettHelyiPrimerBeallitasok();
  const primarySource = String(settings?.primarySource ?? alap.primarySource).trim();

  return {
    primarySource: ERVENYES_HELYI_PRIMER_FORRASOK.has(primarySource)
      ? primarySource
      : alap.primarySource,
  };
}

/**
 * A `betoltHelyiPrimerBeallitasokat` a helyi primerfájl beállítási részét tölti be.
 */
export async function betoltHelyiPrimerBeallitasokat(
  filePath = DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH
) {
  const { path: resolvedPath, payload } = await betoltHelyiPrimerFelulirasokat(filePath);

  return {
    path: resolvedPath,
    settings: normalizalHelyiPrimerBeallitasokat(payload?.settings),
    payload,
  };
}

/**
 * Az `allitHelyiPrimerForrast` a személyes naptár primerforrási profilját menti.
 */
export async function allitHelyiPrimerForrast({
  primarySource,
  filePath = DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH,
}) {
  const normalizedPrimarySource = String(primarySource ?? "").trim();

  if (!ERVENYES_HELYI_PRIMER_FORRASOK.has(normalizedPrimarySource)) {
    throw new Error("A helyi primerforrás ezek egyike lehet: default, legacy, ranked, either.");
  }

  const { path: resolvedPath, payload } = await betoltHelyiPrimerFelulirasokat(filePath);
  const nextPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: payload?.source ?? "helyi egyedi primerkiegészítések",
    settings: {
      ...normalizalHelyiPrimerBeallitasokat(payload?.settings),
      primarySource: normalizedPrimarySource,
    },
    days: Array.isArray(payload?.days) ? payload.days : [],
  };

  await mentStrukturaltFajl(resolvedPath, nextPayload);

  return {
    path: resolvedPath,
    payload: nextPayload,
    primarySource: normalizedPrimarySource,
  };
}

/**
 * A `buildHelyiPrimerFelulirasMap` gyors lookup formára alakítja a helyi kiegészítéseket.
 *
 * A kézi szerkeszthetőség miatt két kulcsot is elfogadunk:
 * - `addedPreferredNames` az ajánlott, egyértelmű új séma
 * - `preferredNames` kompatibilitási okból továbbra is beolvasható
 */
export function buildHelyiPrimerFelulirasMap(payload) {
  if (!Array.isArray(payload?.days)) {
    throw new Error("A helyi primerkiegészítések payloadból hiányzik a days tömb.");
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object") {
      throw new Error("Érvénytelen napi bejegyzés a helyi primerkiegészítésekben.");
    }

    const parsed = parseMonthDay(day.monthDay);

    if (!parsed) {
      throw new Error(`Érvénytelen helyi felülírás monthDay érték: ${day.monthDay}`);
    }

    const addedPreferredNames = dedupeKeepOrder(
      day.addedPreferredNames ?? day.preferredNames ?? []
    );

    if (addedPreferredNames.length === 0) {
      continue;
    }

    map.set(day.monthDay, {
      month: parsed.month,
      day: parsed.day,
      monthDay: day.monthDay,
      addedPreferredNames,
    });
  }

  return map;
}

/**
 * A `vanHelyiPrimerFeluliras` megmondja, hogy van-e ténylegesen legalább egy helyi primerkiegészítés.
 */
export async function vanHelyiPrimerFeluliras(
  filePath = DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH
) {
  const { payload } = await betoltHelyiPrimerFelulirasokat(filePath);
  return buildHelyiPrimerFelulirasMap(payload).size > 0;
}

/**
 * A `tartalmazHelyiPrimerKiegeszitest` gyorsan ellenőrzi, hogy egy név be van-e jelölve helyileg.
 */
export function tartalmazHelyiPrimerKiegeszitest(overrideMap, monthDay, name) {
  const day = overrideMap.get(monthDay) ?? null;

  if (!day) {
    return false;
  }

  const normalizedName = normalizeNameForMatch(name);
  return day.addedPreferredNames.some(
    (candidate) => normalizeNameForMatch(candidate) === normalizedName
  );
}

/**
 * A `kapcsolHelyiPrimerKiegeszitest` név szerint ki-be kapcsol egy helyi primerkiegészítést.
 */
export async function kapcsolHelyiPrimerKiegeszitest({
  month,
  day,
  monthDay,
  name,
  filePath = DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH,
}) {
  const normalizedMonthDay = String(monthDay ?? "").trim();
  const normalizedName = String(name ?? "").trim();

  if (!normalizedMonthDay || !normalizedName) {
    throw new Error("A helyi primerkiegészítés kapcsolásához monthDay és name szükséges.");
  }

  const parsed = parseMonthDay(normalizedMonthDay);

  if (!parsed) {
    throw new Error(`Érvénytelen monthDay a helyi primerkiegészítéshez: ${normalizedMonthDay}`);
  }

  const { path: resolvedPath, payload } = await betoltHelyiPrimerFelulirasokat(filePath);
  const overrideMap = buildHelyiPrimerFelulirasMap(payload);
  const currentDay = overrideMap.get(normalizedMonthDay) ?? {
    month: Number.isInteger(month) ? month : parsed.month,
    day: Number.isInteger(day) ? day : parsed.day,
    monthDay: normalizedMonthDay,
    addedPreferredNames: [],
  };
  const alreadySelected = tartalmazHelyiPrimerKiegeszitest(
    overrideMap,
    normalizedMonthDay,
    normalizedName
  );

  currentDay.addedPreferredNames = alreadySelected
    ? currentDay.addedPreferredNames.filter(
        (candidate) => normalizeNameForMatch(candidate) !== normalizeNameForMatch(normalizedName)
      )
    : dedupeKeepOrder([...currentDay.addedPreferredNames, normalizedName]);

  if (currentDay.addedPreferredNames.length === 0) {
    overrideMap.delete(normalizedMonthDay);
  } else {
    overrideMap.set(normalizedMonthDay, currentDay);
  }

  const nextPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: payload?.source ?? "helyi egyedi primerkiegészítések",
    settings: normalizalHelyiPrimerBeallitasokat(payload?.settings),
    days: Array.from(overrideMap.values()).sort((left, right) =>
      left.monthDay.localeCompare(right.monthDay, "hu")
    ),
  };

  await mentStrukturaltFajl(resolvedPath, nextPayload);

  return {
    path: resolvedPath,
    payload: nextPayload,
    selected: !alreadySelected,
    monthDay: normalizedMonthDay,
    name: normalizedName,
  };
}
