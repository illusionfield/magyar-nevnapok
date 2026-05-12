/**
 * domainek/primer/auditalt-primer-registry.mjs
 * Audited primary registry helpers.
 */

import { letezik } from "../../kozos/fajlrendszer.mjs";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";
import { dedupeKeepOrder, normalizeNameForMatch, parseMonthDay } from "./alap.mjs";

export const DEFAULT_AUDITED_PRIMARY_REGISTRY_PATH = kanonikusUtvonalak.kezi.auditaltPrimerRegistry;

function normalizeNullableTimestamp(value) {
  if (value == null || value === "") {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Érvénytelen auditált primer időbélyeg: ${value}`);
  }

  return date.toISOString();
}

function normalizeAuditedDay(entry) {
  const parsed = parseMonthDay(entry?.monthDay);

  if (!parsed) {
    throw new Error(`Érvénytelen auditált primer monthDay érték: ${entry?.monthDay}`);
  }

  const names = dedupeKeepOrder(entry?.names ?? []);
  const preferredNames = dedupeKeepOrder(entry?.preferredNames ?? []);
  const nameSet = new Set(names.map(normalizeNameForMatch));
  const invalidPreferredNames = preferredNames.filter((name) => !nameSet.has(normalizeNameForMatch(name)));

  if (invalidPreferredNames.length > 0) {
    throw new Error(
      `Az auditált primer név nincs benne a napi teljes névlistában: ${parsed.monthDay} / ${invalidPreferredNames.join(", ")}`
    );
  }

  return {
    month: parsed.month,
    day: parsed.day,
    monthDay: parsed.monthDay,
    names,
    preferredNames,
    auditedAt: normalizeNullableTimestamp(entry?.auditedAt),
  };
}

export function normalizalAuditaltPrimerRegistryPayload(payload = {}) {
  const dayMap = new Map();

  for (const entry of Array.isArray(payload?.days) ? payload.days : []) {
    const day = normalizeAuditedDay(entry);

    if (dayMap.has(day.monthDay)) {
      throw new Error(`Duplikált auditált primer nap: ${day.monthDay}`);
    }

    dayMap.set(day.monthDay, day);
  }

  return {
    version: Number.isInteger(payload?.version) ? payload.version : 1,
    generatedAt: normalizeNullableTimestamp(payload?.generatedAt) ?? new Date().toISOString(),
    source: String(payload?.source ?? "auditált primer source of truth").trim() || "auditált primer source of truth",
    days: Array.from(dayMap.values()).sort((left, right) => left.monthDay.localeCompare(right.monthDay, "hu")),
  };
}

export function buildAuditaltPrimerRegistryMap(payload = {}) {
  const normalized = normalizalAuditaltPrimerRegistryPayload(payload);
  return new Map(normalized.days.map((day) => [day.monthDay, day]));
}

export async function betoltAuditaltPrimerRegistryt(filePath = DEFAULT_AUDITED_PRIMARY_REGISTRY_PATH) {
  if (!(await letezik(filePath))) {
    throw new Error(`Az auditált primer registry nem található: ${filePath}`);
  }

  const payload = normalizalAuditaltPrimerRegistryPayload(await betoltStrukturaltFajl(filePath));

  return {
    path: filePath,
    payload,
  };
}

export async function mentAuditaltPrimerRegistryt(payload, filePath = DEFAULT_AUDITED_PRIMARY_REGISTRY_PATH) {
  const normalized = normalizalAuditaltPrimerRegistryPayload(payload);
  await mentStrukturaltFajl(filePath, normalized);

  return {
    path: filePath,
    payload: normalized,
  };
}

export async function allitAuditaltPrimerNapot({ monthDay, names, preferredNames, auditedAt = new Date().toISOString(), filePath = DEFAULT_AUDITED_PRIMARY_REGISTRY_PATH } = {}) {
  const parsed = parseMonthDay(monthDay);

  if (!parsed) {
    throw new Error("Az auditált primer nap mentéséhez érvényes monthDay szükséges.");
  }

  const current = await betoltAuditaltPrimerRegistryt(filePath);
  const dayMap = buildAuditaltPrimerRegistryMap(current.payload);
  const day = normalizeAuditedDay({
    month: parsed.month,
    day: parsed.day,
    monthDay: parsed.monthDay,
    names,
    preferredNames,
    auditedAt,
  });

  dayMap.set(parsed.monthDay, day);

  const nextPayload = normalizalAuditaltPrimerRegistryPayload({
    ...current.payload,
    generatedAt: new Date().toISOString(),
    days: Array.from(dayMap.values()),
  });

  await mentStrukturaltFajl(current.path, nextPayload);

  return {
    path: current.path,
    payload: nextPayload,
    day,
  };
}

export async function allitAuditaltPrimerNapokat({
  action,
  monthDays,
  auditedAt = new Date().toISOString(),
  filePath = DEFAULT_AUDITED_PRIMARY_REGISTRY_PATH,
} = {}) {
  const normalizedAction = String(action ?? "").trim();

  if (normalizedAction !== "approve" && normalizedAction !== "reset") {
    throw new Error("A tömeges auditált primer művelet csak approve vagy reset lehet.");
  }

  const parsedDays = [];
  const seen = new Set();

  for (const value of Array.isArray(monthDays) ? monthDays : []) {
    const parsed = parseMonthDay(value);

    if (!parsed) {
      throw new Error(`Érvénytelen auditált primer monthDay érték: ${value}`);
    }

    if (seen.has(parsed.monthDay)) {
      continue;
    }

    seen.add(parsed.monthDay);
    parsedDays.push(parsed);
  }

  if (parsedDays.length === 0) {
    throw new Error("A tömeges auditált primer művelethez legalább egy nap szükséges.");
  }

  const nextAuditedAt = normalizedAction === "approve" ? normalizeNullableTimestamp(auditedAt) : null;

  if (normalizedAction === "approve" && !nextAuditedAt) {
    throw new Error("A tömeges auditált primer jóváhagyáshoz érvényes audit időbélyeg szükséges.");
  }

  const current = await betoltAuditaltPrimerRegistryt(filePath);
  const dayMap = buildAuditaltPrimerRegistryMap(current.payload);
  const updatedDays = [];
  let changedCount = 0;

  for (const parsed of parsedDays) {
    const currentDay = dayMap.get(parsed.monthDay);

    if (!currentDay) {
      throw new Error(`Az auditált primer nap nem található: ${parsed.monthDay}`);
    }

    const nextDay = normalizeAuditedDay({
      ...currentDay,
      auditedAt: nextAuditedAt,
    });

    if (currentDay.auditedAt !== nextDay.auditedAt) {
      changedCount += 1;
      dayMap.set(parsed.monthDay, nextDay);
    }

    updatedDays.push(nextDay);
  }

  const nextPayload = changedCount > 0
    ? normalizalAuditaltPrimerRegistryPayload({
        ...current.payload,
        generatedAt: new Date().toISOString(),
        days: Array.from(dayMap.values()),
      })
    : current.payload;

  if (changedCount > 0) {
    await mentStrukturaltFajl(current.path, nextPayload);
  }

  return {
    path: current.path,
    payload: nextPayload,
    action: normalizedAction,
    changedCount,
    days: updatedDays,
  };
}
