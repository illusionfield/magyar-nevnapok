/**
 * domainek/helyi-konfig.mjs
 * Egységes, nem követett helyi YAML-konfig az ICS-profilhoz és a személyes primerhez.
 */

import path from "node:path";
import { betoltStrukturaltFajl, mentStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import { letezik } from "../kozos/fajlrendszer.mjs";
import { kanonikusUtvonalak } from "../kozos/utvonalak.mjs";
import {
  alapertelmezettIcsBeallitasok,
  normalizalIcsBeallitasokat,
} from "./naptar/ics-beallitasok.mjs";
import { dedupeKeepOrder, parseMonthDay } from "./primer/alap.mjs";

export const DEFAULT_LOCAL_CONFIG_PATH = kanonikusUtvonalak.helyi.nevnapokKonfig;

const ERVENYES_HELYI_PRIMER_FORRASOK = new Set(["default", "legacy", "ranked", "either"]);
/**
 * Az `alapertelmezettHelyiIcsBeallitasok` az egységes helyi YAML ICS-blokkjának alapértékeit adja.
 */
export function alapertelmezettHelyiIcsBeallitasok() {
  return alapertelmezettIcsBeallitasok();
}

/**
 * Az `alapertelmezettHelyiPrimerModositok` a személyes primer módosítóinak alapértékeit adja.
 */
export function alapertelmezettHelyiPrimerModositok() {
  return {
    normalized: false,
    ranking: false,
  };
}

/**
 * Az `alapertelmezettHelyiPrimerBeallitasok` a személyes primerblokk alapértékeit adja.
 */
export function alapertelmezettHelyiPrimerBeallitasok() {
  return {
    primarySource: "default",
    modifiers: alapertelmezettHelyiPrimerModositok(),
    days: [],
  };
}

/**
 * Az `uresHelyiFelhasznaloiKonfigPayload` létrehozza az üres, de érvényes helyi YAML-konfigot.
 */
export function uresHelyiFelhasznaloiKonfigPayload(generatedAt = new Date().toISOString()) {
  return {
    version: 1,
    generatedAt,
    source: "helyi felhasználói beállítások",
    ics: alapertelmezettHelyiIcsBeallitasok(),
    personalPrimary: alapertelmezettHelyiPrimerBeallitasok(),
  };
}

/**
 * A `normalizalHelyiIcsBeallitasokat` stabil, menthető és beolvasható ICS-blokkot ad.
 */
export function normalizalHelyiIcsBeallitasokat(beallitasok) {
  return normalizalIcsBeallitasokat(beallitasok);
}

/**
 * A `normalizalHelyiPrimerNapokat` stabil napi listává alakítja a személyes primernapokat.
 */
export function normalizalHelyiPrimerNapokat(days) {
  if (!Array.isArray(days)) {
    return [];
  }

  return days
    .map((day) => {
      const parsed = parseMonthDay(day?.monthDay);

      if (!parsed) {
        return null;
      }

      const addedPreferredNames = dedupeKeepOrder(day?.addedPreferredNames ?? []);

      if (addedPreferredNames.length === 0) {
        return null;
      }

      return {
        month: Number.isInteger(day?.month) ? day.month : parsed.month,
        day: Number.isInteger(day?.day) ? day.day : parsed.day,
        monthDay: day.monthDay,
        addedPreferredNames,
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.monthDay.localeCompare(right.monthDay, "hu"));
}

/**
 * A `normalizalHelyiPrimerBeallitasokat` stabil személyes primerblokkot ad.
 */
export function normalizalHelyiPrimerBeallitasokat(beallitasok) {
  const alap = alapertelmezettHelyiPrimerBeallitasok();
  const primarySource = String(beallitasok?.primarySource ?? alap.primarySource).trim();
  const modifiers = beallitasok?.modifiers ?? {};

  return {
    primarySource: ERVENYES_HELYI_PRIMER_FORRASOK.has(primarySource)
      ? primarySource
      : alap.primarySource,
    modifiers: {
      normalized: modifiers?.normalized === true,
      ranking: modifiers?.ranking === true,
    },
    days: normalizalHelyiPrimerNapokat(beallitasok?.days),
  };
}

/**
 * A `normalizalHelyiFelhasznaloiKonfigPayloadot` egységes helyi konfigpayloadot ad vissza.
 */
export function normalizalHelyiFelhasznaloiKonfigPayloadot(rawPayload) {
  if (rawPayload?.ics || rawPayload?.personalPrimary) {
    return {
      version: 1,
      generatedAt: rawPayload?.generatedAt ?? new Date().toISOString(),
      source: rawPayload?.source ?? "helyi felhasználói beállítások",
      ics: normalizalHelyiIcsBeallitasokat(rawPayload?.ics),
      personalPrimary: normalizalHelyiPrimerBeallitasokat(rawPayload?.personalPrimary),
    };
  }

  return uresHelyiFelhasznaloiKonfigPayload(rawPayload?.generatedAt ?? new Date().toISOString());
}

/**
 * A `betoltHelyiFelhasznaloiKonfigot` az egységes helyi YAML-konfigot tölti be.
 */
export async function betoltHelyiFelhasznaloiKonfigot(filePath = DEFAULT_LOCAL_CONFIG_PATH) {
  const resolvedPath = path.resolve(process.cwd(), filePath);

  if (await letezik(resolvedPath)) {
    const rawPayload = await betoltStrukturaltFajl(resolvedPath);

    return {
      path: resolvedPath,
      payload: normalizalHelyiFelhasznaloiKonfigPayloadot(rawPayload),
      sourcePath: resolvedPath,
    };
  }

  return {
    path: resolvedPath,
    payload: uresHelyiFelhasznaloiKonfigPayload(),
    sourcePath: resolvedPath,
  };
}

/**
 * A `mentHelyiFelhasznaloiKonfigot` az egységes helyi YAML-konfigot írja ki.
 */
export async function mentHelyiFelhasznaloiKonfigot(
  payload,
  filePath = DEFAULT_LOCAL_CONFIG_PATH
) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const normalizalt = normalizalHelyiFelhasznaloiKonfigPayloadot(payload);

  await mentStrukturaltFajl(resolvedPath, normalizalt);

  return {
    path: resolvedPath,
    payload: normalizalt,
  };
}

/**
 * A `betoltHelyiIcsBeallitasokat` az egységes helyi YAML ICS-blokkját tölti be.
 */
export async function betoltHelyiIcsBeallitasokat(filePath = DEFAULT_LOCAL_CONFIG_PATH) {
  const { path: resolvedPath, payload, sourcePath } = await betoltHelyiFelhasznaloiKonfigot(filePath);

  return {
    path: resolvedPath,
    sourcePath,
    settings: payload.ics,
    payload,
  };
}

/**
 * Az `allitHelyiIcsBeallitasokat` az egységes helyi YAML ICS-blokkját menti.
 */
export async function allitHelyiIcsBeallitasokat(
  beallitasok = {},
  filePath = DEFAULT_LOCAL_CONFIG_PATH
) {
  const { path: resolvedPath, payload } = await betoltHelyiFelhasznaloiKonfigot(filePath);
  const nextPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: payload?.source ?? "helyi felhasználói beállítások",
    ics: normalizalHelyiIcsBeallitasokat({
      ...payload?.ics,
      ...beallitasok,
    }),
    personalPrimary: normalizalHelyiPrimerBeallitasokat(payload?.personalPrimary),
  };

  await mentStrukturaltFajl(resolvedPath, nextPayload);

  return {
    path: resolvedPath,
    payload: nextPayload,
    settings: nextPayload.ics,
  };
}

/**
 * Az `allitHelyiPrimerBlokkot` az egységes helyi YAML személyes primerblokkját menti.
 */
export async function allitHelyiPrimerBlokkot(
  { primarySource, modifiers, days } = {},
  filePath = DEFAULT_LOCAL_CONFIG_PATH
) {
  const { path: resolvedPath, payload } = await betoltHelyiFelhasznaloiKonfigot(filePath);
  const nextPayload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: payload?.source ?? "helyi felhasználói beállítások",
    ics: normalizalHelyiIcsBeallitasokat(payload?.ics),
    personalPrimary: normalizalHelyiPrimerBeallitasokat({
      ...payload?.personalPrimary,
      ...(primarySource != null ? { primarySource } : {}),
      ...(modifiers != null
        ? {
            modifiers: {
              ...(payload?.personalPrimary?.modifiers ?? {}),
              ...modifiers,
            },
          }
        : {}),
      ...(days != null ? { days } : {}),
    }),
  };

  await mentStrukturaltFajl(resolvedPath, nextPayload);

  return {
    path: resolvedPath,
    payload: nextPayload,
    settings: nextPayload.personalPrimary,
  };
}
