/**
 * domainek/primer/helyi-primer-felulirasok.mjs
 * Helyi, nem követett primerkiegészítések betöltése és mentése.
 *
 * Fontos különbség a közös, követett `primary-registry-overrides.yaml` fájlhoz képest:
 * itt a napi nevek nem lecserélik a közös primereket, hanem hozzáadódnak azokhoz.
 * Ezzel minden felhasználó előállíthat magának saját primeres naptárat anélkül,
 * hogy a közös, repo-követett döntési réteget módosítaná.
 */

import {
  DEFAULT_LOCAL_CONFIG_PATH,
  allitHelyiPrimerBlokkot,
  alapertelmezettHelyiPrimerBeallitasok as alapertelmezettHelyiPrimerBeallitasBlokk,
  alapertelmezettHelyiPrimerModositok as alapertelmezettHelyiPrimerModositokBlokk,
  betoltHelyiFelhasznaloiKonfigot,
  normalizalHelyiPrimerBeallitasokat as normalizalHelyiPrimerBlokkot,
} from "../helyi-konfig.mjs";
import { dedupeKeepOrder, normalizeNameForMatch, parseMonthDay } from "./alap.mjs";

export const DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH =
  DEFAULT_LOCAL_CONFIG_PATH;
const ERVENYES_HELYI_PRIMER_FORRASOK = new Set(["default", "legacy", "ranked", "either"]);

/**
 * Az `egyesitHelyiPrimerNeveket` normalizált névazonosítással, sorrendtartó módon egyesíti a listákat.
 */
export function egyesitHelyiPrimerNeveket(...nameLists) {
  const merged = [];
  const seen = new Set();

  for (const lista of nameLists) {
    for (const value of lista ?? []) {
      const key = normalizeNameForMatch(value);

      if (!key || seen.has(key)) {
        continue;
      }

      seen.add(key);
      merged.push(value);
    }
  }

  return merged;
}

/**
 * Az `egyesitHelyiPrimerMapokat` több helyi primer-napmapot unióz.
 */
export function egyesitHelyiPrimerMapokat(...maps) {
  const merged = new Map();

  for (const currentMap of maps) {
    if (!(currentMap instanceof Map)) {
      continue;
    }

    for (const day of currentMap.values()) {
      const current = merged.get(day.monthDay) ?? {
        month: day.month,
        day: day.day,
        monthDay: day.monthDay,
        addedPreferredNames: [],
      };

      current.addedPreferredNames = egyesitHelyiPrimerNeveket(
        current.addedPreferredNames,
        day.addedPreferredNames ?? []
      );

      if (current.addedPreferredNames.length > 0) {
        merged.set(day.monthDay, current);
      }
    }
  }

  return merged;
}

/**
 * Az `epitModositoPrimerMapot` a primer audit snapshotból felépíti a helyi módosítók által kért napi overlayt.
 */
export function epitModositoPrimerMapot(primerAuditRiport, modifiers = {}) {
  const map = new Map();

  for (const month of primerAuditRiport?.months ?? []) {
    for (const row of month.rows ?? []) {
      const names = [];

      if (modifiers.normalized === true) {
        names.push(...(row.normalizedMissing ?? []).map((entry) => entry.name));
      }

      if (modifiers.ranking === true) {
        names.push(...(row.rankingMissing ?? []).map((entry) => entry.name));
      }

      const addedPreferredNames = egyesitHelyiPrimerNeveket(names);

      if (addedPreferredNames.length === 0) {
        continue;
      }

      map.set(row.monthDay, {
        month: row.month,
        day: row.day,
        monthDay: row.monthDay,
        addedPreferredNames,
      });
    }
  }

  return map;
}

function extractHelyiPrimerBlokk(payload) {
  if (payload?.personalPrimary) {
    return normalizalHelyiPrimerBlokkot(payload.personalPrimary);
  }

  if (payload?.primarySource || payload?.modifiers || Array.isArray(payload?.days)) {
    return normalizalHelyiPrimerBlokkot(payload);
  }

  return alapertelmezettHelyiPrimerBeallitasBlokk();
}

/**
 * Az `alapertelmezettHelyiPrimerModositok` a helyi primer módosítóinak alapértékeit adja.
 */
export function alapertelmezettHelyiPrimerModositok() {
  return alapertelmezettHelyiPrimerModositokBlokk();
}

/**
 * Az `alapertelmezettHelyiPrimerBeallitasok` a helyi primerbeállítások alapértékeit adja.
 */
export function alapertelmezettHelyiPrimerBeallitasok() {
  const alap = alapertelmezettHelyiPrimerBeallitasBlokk();

  return {
    primarySource: alap.primarySource,
    modifiers: alap.modifiers,
  };
}

/**
 * Az `uresHelyiPrimerFelulirasPayload` létrehozza az üres, de érvényes helyi felülírási payloadot.
 */
export function uresHelyiPrimerFelulirasPayload() {
  return alapertelmezettHelyiPrimerBeallitasBlokk();
}

/**
 * A `betoltHelyiPrimerFelulirasokat` betölti a helyi felülírási fájlt, vagy hiány esetén üres payloadot ad.
 */
export async function betoltHelyiPrimerFelulirasokat(
  filePath = DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH
) {
  const { path: resolvedPath, payload, sourcePath } = await betoltHelyiFelhasznaloiKonfigot(filePath);

  return {
    path: resolvedPath,
    sourcePath,
    payload: extractHelyiPrimerBlokk(payload),
  };
}

/**
 * A `normalizalHelyiPrimerBeallitasokat` beolvasható, stabil szerkezetet ad a helyi beállításokhoz.
 */
function normalizalHelyiPrimerBeallitasokat(settings) {
  const alap = alapertelmezettHelyiPrimerBeallitasok();
  const normalizalt = normalizalHelyiPrimerBlokkot({
    ...alap,
    ...settings,
  });

  return {
    primarySource: normalizalt.primarySource,
    modifiers: normalizalt.modifiers,
  };
}

/**
 * A `vanNemAlapertelmezettHelyiPrimerBeallitas` megmondja, hogy a helyi primerprofil eltér-e az alaphelyzettől.
 */
export function vanNemAlapertelmezettHelyiPrimerBeallitas(settings) {
  const normalized = normalizalHelyiPrimerBeallitasokat(settings);

  return (
    normalized.primarySource !== "default" ||
    normalized.modifiers.normalized === true ||
    normalized.modifiers.ranking === true
  );
}

/**
 * A `betoltHelyiPrimerBeallitasokat` a helyi primerfájl beállítási részét tölti be.
 */
export async function betoltHelyiPrimerBeallitasokat(
  filePath = DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH
) {
  const { path: resolvedPath, payload, sourcePath } = await betoltHelyiPrimerFelulirasokat(filePath);

  return {
    path: resolvedPath,
    sourcePath,
    settings: normalizalHelyiPrimerBeallitasokat(payload),
    payload,
  };
}

/**
 * Az `allitHelyiPrimerForrast` a helyi primerforrás profilját menti.
 */
export async function allitHelyiPrimerForrast({
  primarySource,
  filePath = DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH,
}) {
  const eredmeny = await allitHelyiPrimerBeallitasokat({
    primarySource,
    filePath,
  });

  return {
    path: eredmeny.path,
    payload: eredmeny.payload,
    primarySource: eredmeny.settings.primarySource,
  };
}

/**
 * Az `allitHelyiPrimerBeallitasokat` a teljes helyi primerbeállítás-profilt menti.
 */
export async function allitHelyiPrimerBeallitasokat({
  primarySource,
  modifiers,
  filePath = DEFAULT_LOCAL_PRIMARY_REGISTRY_OVERRIDES_PATH,
}) {
  if (primarySource != null) {
    const normalizedPrimarySource = String(primarySource).trim();

    if (!ERVENYES_HELYI_PRIMER_FORRASOK.has(normalizedPrimarySource)) {
      throw new Error("A helyi primerforrás ezek egyike lehet: default, legacy, ranked, either.");
    }
  }

  const eredmeny = await allitHelyiPrimerBlokkot(
    {
      primarySource,
      modifiers,
    },
    filePath
  );
  const nextPayload = extractHelyiPrimerBlokk(eredmeny.payload);

  return {
    path: eredmeny.path,
    payload: nextPayload,
    settings: normalizalHelyiPrimerBeallitasokat(nextPayload),
  };
}

/**
 * A `buildHelyiPrimerFelulirasMap` gyors lookup formára alakítja a helyi kiegészítéseket.
 */
export function buildHelyiPrimerFelulirasMap(payload) {
  const primerBlokk = extractHelyiPrimerBlokk(payload);

  if (!Array.isArray(primerBlokk?.days)) {
    throw new Error("A helyi primerkiegészítések payloadból hiányzik a days tömb.");
  }

  const map = new Map();

  for (const day of primerBlokk.days) {
    if (!day || typeof day !== "object") {
      throw new Error("Érvénytelen napi bejegyzés a helyi primerkiegészítésekben.");
    }

    const parsed = parseMonthDay(day.monthDay);

    if (!parsed) {
      throw new Error(`Érvénytelen helyi felülírás monthDay érték: ${day.monthDay}`);
    }

    const addedPreferredNames = dedupeKeepOrder(day.addedPreferredNames ?? []);

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

  const nextDays = Array.from(overrideMap.values()).sort((left, right) =>
    left.monthDay.localeCompare(right.monthDay, "hu")
  );
  const eredmeny = await allitHelyiPrimerBlokkot(
    {
      primarySource: payload?.primarySource,
      modifiers: payload?.modifiers,
      days: nextDays,
    },
    filePath
  );
  const nextPayload = extractHelyiPrimerBlokk(eredmeny.payload);

  return {
    path: resolvedPath,
    payload: nextPayload,
    selected: !alreadySelected,
    monthDay: normalizedMonthDay,
    name: normalizedName,
  };
}
