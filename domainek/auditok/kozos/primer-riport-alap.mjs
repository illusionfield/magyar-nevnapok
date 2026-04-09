/**
 * domainek/auditok/kozos/primer-riport-alap.mjs
 * Közös primeraudit-segédek a végső primer és a primer nélkül maradó riportokhoz.
 */

import { normalizeNameForMatch } from "../../primer/alap.mjs";

export const AUDIT_HONAPNEVEK = [
  "Január",
  "Február",
  "Március",
  "Április",
  "Május",
  "Június",
  "Július",
  "Augusztus",
  "Szeptember",
  "Október",
  "November",
  "December",
];

export const auditCollator = new Intl.Collator("hu", {
  sensitivity: "base",
  numeric: true,
});

/**
 * A `compareMonthDays` a hónap-nap azonosítókat időrendben rendezi.
 */
export function compareMonthDays(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "hu");
}

/**
 * A `createEmptyDayEntry` üres napi primerbejegyzést ad a hiányzó napokhoz.
 */
export function createEmptyDayEntry(monthDay, options = {}) {
  const [month, day] = String(monthDay ?? "")
    .split("-")
    .map(Number);

  return {
    month,
    day,
    monthDay,
    names: [],
    preferredNames: [],
    source: options.includeMetadata ? null : undefined,
    warning: options.includeMetadata ? false : undefined,
    legacyNames: options.includeMetadata ? [] : undefined,
    wikiNames: options.includeMetadata ? [] : undefined,
    overrideNames: options.includeMetadata ? [] : undefined,
  };
}

/**
 * A `createRawEmptyDayEntry` üres nyers napi névlistát ad a hiányzó napokhoz.
 */
export function createRawEmptyDayEntry(monthDay) {
  const [month, day] = String(monthDay ?? "")
    .split("-")
    .map(Number);

  return {
    month,
    day,
    monthDay,
    names: [],
    primaryRanked: [],
  };
}

/**
 * A `uniqueKeepOrder` duplikátummentes listát ad vissza az első előfordulási sorrendben.
 */
export function uniqueKeepOrder(values) {
  const seen = new Set();
  const result = [];

  for (const value of values ?? []) {
    const normalized = normalizeNameForMatch(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(String(value));
  }

  return result;
}

/**
 * A `uniqueSorted` duplikátummentes, alfabetikus listát készít.
 */
export function uniqueSorted(values) {
  return uniqueKeepOrder(values).sort((left, right) => auditCollator.compare(left, right));
}

/**
 * A `buildRegistryMap` napi névnézetté alakítja a primerjellegű YAML-artifactot.
 */
export function buildRegistryMap(payload, options = {}) {
  if (!Array.isArray(payload?.days)) {
    throw new Error("A primerjegyzék payload nem tartalmaz érvényes days tömböt.");
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object" || typeof day.monthDay !== "string") {
      throw new Error("Érvénytelen napi primerjegyzék-bejegyzés.");
    }

    if (map.has(day.monthDay)) {
      throw new Error(`Duplikált primerjegyzék-nap: ${day.monthDay}`);
    }

    map.set(day.monthDay, {
      month: Number(day.month),
      day: Number(day.day),
      monthDay: day.monthDay,
      names: uniqueKeepOrder(day.names ?? []),
      preferredNames: uniqueKeepOrder(day.preferredNames ?? []),
      source: options.includeMetadata ? day.source ?? null : null,
      warning: options.includeMetadata ? Boolean(day.warning) : false,
      legacyNames: options.includeMetadata ? uniqueKeepOrder(day.legacyNames ?? []) : [],
      wikiNames: options.includeMetadata ? uniqueKeepOrder(day.wikiNames ?? []) : [],
      overrideNames: options.includeMetadata ? uniqueKeepOrder(day.overrideNames ?? []) : [],
    });
  }

  return map;
}

/**
 * A `buildRawDayMap` a teljes névadatbázisból napra lebontott nyers névnézetet állít elő.
 */
export function buildRawDayMap(payload) {
  if (!Array.isArray(payload?.names)) {
    throw new Error("A névadatbázis nem tartalmaz érvényes names tömböt.");
  }

  const map = new Map();

  for (const nameEntry of payload.names) {
    const name = String(nameEntry?.name ?? "").trim();

    if (!name || !Array.isArray(nameEntry?.days)) {
      continue;
    }

    for (const dayEntry of nameEntry.days) {
      const monthDay = String(dayEntry?.monthDay ?? "").trim();

      if (!monthDay) {
        continue;
      }

      const bucket = map.get(monthDay) ?? createRawEmptyDayEntry(monthDay);
      bucket.month = Number(dayEntry.month);
      bucket.day = Number(dayEntry.day);
      bucket.names.push(name);

      if (dayEntry.primaryRanked) {
        bucket.primaryRanked.push(name);
      }

      map.set(monthDay, bucket);
    }
  }

  for (const bucket of map.values()) {
    bucket.names = uniqueSorted(bucket.names);
    bucket.primaryRanked = uniqueSorted(bucket.primaryRanked);
  }

  return map;
}

/**
 * A `buildFinalPrimaryUniverse` felépíti a végső primerként valaha megjelenő nevek halmazát.
 */
export function buildFinalPrimaryUniverse(finalMap) {
  const universe = new Set();

  for (const day of finalMap.values()) {
    for (const name of day.preferredNames) {
      universe.add(normalizeNameForMatch(name));
    }
  }

  return universe;
}

/**
 * Az `epitHonapVazat` üres havi bontást készít a riportokhoz.
 */
export function epitHonapVazat() {
  return AUDIT_HONAPNEVEK.map((monthName, index) => ({
    month: index + 1,
    monthName,
    rows: [],
  }));
}
