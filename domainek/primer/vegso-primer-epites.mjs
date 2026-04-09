/**
 * domainek/primer/vegso-primer-epites.mjs
 * Legacy, wiki és kézi felülírás alapján végső primerjegyzéket épít.
 */
import path from "node:path";
import {
  areNameSetsEqual,
  DEFAULT_FINAL_PRIMARY_REGISTRY_PATH,
  DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH,
  DEFAULT_PRIMARY_REGISTRY_OVERRIDES_PATH,
  DEFAULT_WIKI_PRIMARY_REGISTRY_PATH,
  dedupeKeepOrder,
  loadPrimaryRegistry,
  loadPrimaryRegistryOverrides,
  normalizeNameForMatch,
  orderedUniqueNameUnion,
  parseMonthDay,
} from "./alap.mjs";
import { mentStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";

const args = parseArgs(process.argv.slice(2));

/**
 * A `main` a modul közvetlen futtatási belépési pontja.
 */
async function main() {
  const legacyPath = path.resolve(
    process.cwd(),
    args.legacy ?? DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH
  );
  const wikiPath = path.resolve(process.cwd(), args.wiki ?? DEFAULT_WIKI_PRIMARY_REGISTRY_PATH);
  const overridesPath = path.resolve(
    process.cwd(),
    args.overrides ?? DEFAULT_PRIMARY_REGISTRY_OVERRIDES_PATH
  );
  const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_FINAL_PRIMARY_REGISTRY_PATH);

  const [legacyRegistry, wikiRegistry, overridesRegistry] = await Promise.all([
    loadPrimaryRegistry(legacyPath),
    loadPrimaryRegistry(wikiPath),
    loadPrimaryRegistryOverrides(overridesPath),
  ]);

  const payload = buildFinalPrimaryRegistryPayload({
    legacyPayload: legacyRegistry.payload,
    wikiPayload: wikiRegistry.payload,
    overridesPayload: overridesRegistry.payload,
    inputs: {
      legacyPath,
      wikiPath,
      overridesPath,
    },
  });

  await mentStrukturaltFajl(outputPath, payload);

  console.log(`Mentve: ${payload.days.length} végső primer nap ide: ${outputPath}`);
  console.log(`Pontos legacy–wiki egyezésű napok: ${payload.stats.exactAgreementDayCount}`);
  console.log(`Kézi felülírásos napok: ${payload.stats.overrideDayCount}`);
  console.log(`Figyelmeztetéses unió napok: ${payload.stats.warningUnionDayCount}`);
}

/**
 * A `buildFinalPrimaryRegistryPayload` felépíti a szükséges adatszerkezetet.
 */
export function buildFinalPrimaryRegistryPayload({
  legacyPayload,
  wikiPayload,
  overridesPayload,
  inputs,
  generatedAt = new Date().toISOString(),
}) {
  const legacyMap = buildRegistryMap(legacyPayload, "legacy");
  const wikiMap = buildRegistryMap(wikiPayload, "wiki");
  const overrideMap = buildOverridesMap(overridesPayload);
  validateOverridesAgainstSources(overrideMap, legacyMap, wikiMap);

  const allMonthDays = Array.from(
    new Set([...legacyMap.keys(), ...wikiMap.keys(), ...overrideMap.keys()])
  ).sort();
  const days = [];
  const stats = {
    dayCount: 0,
    preferredNameCount: 0,
    oneNameDays: 0,
    twoNameDays: 0,
    threeOrMoreNameDays: 0,
    exactAgreementDayCount: 0,
    overrideDayCount: 0,
    warningUnionDayCount: 0,
  };

  for (const monthDay of allMonthDays) {
    const legacyDay = legacyMap.get(monthDay) ?? null;
    const wikiDay = wikiMap.get(monthDay) ?? null;
    const overrideDay = overrideMap.get(monthDay) ?? null;
    const parsed = parseMonthDay(monthDay);

    if (!parsed) {
      throw new Error(`Érvénytelen monthDay érték a végső primerjegyzék építésekor: ${monthDay}`);
    }

    const legacyNames = [...(legacyDay?.preferredNames ?? [])];
    const wikiNames = [...(wikiDay?.preferredNames ?? [])];
    const overrideNames = [...(overrideDay?.preferredNames ?? [])];

    let preferredNames;
    let source;
    let warning = false;

    if (overrideDay) {
      // A kézi felülírás elsőbbséget élvez, mert ez a projekt tudatos, dokumentált döntési pontja.
      preferredNames = [...overrideNames];
      source = "manual-override";
      stats.overrideDayCount += 1;
    } else if (areNameSetsEqual(legacyNames, wikiNames)) {
      // Ha a két gépi forrás ugyanarra jut, nem tartjuk meg mesterségesen mindkét oldalt:
      // a cél itt egy egyértelmű, irányadó napi primerlista előállítása.
      preferredNames = [...legacyNames];
      source = "legacy-wiki-exact";
      stats.exactAgreementDayCount += 1;
    } else {
      // Az eltérő napok nem vesznek el: warning-union forrással mindkét oldal jelöltjei megmaradnak,
      // és az auditok külön is láthatóvá teszik, hogy itt kézi döntés vagy további vizsgálat jöhet szóba.
      preferredNames = orderedUniqueNameUnion(legacyNames, wikiNames);
      source = "warning-union";
      warning = true;
      stats.warningUnionDayCount += 1;
    }

    const names = orderedUniqueNameUnion(overrideNames, legacyNames, wikiNames);

    days.push({
      month: parsed.month,
      day: parsed.day,
      monthDay,
      names,
      preferredNames,
      legacyNames,
      wikiNames,
      overrideNames,
      source,
      warning,
    });

    stats.dayCount += 1;
    stats.preferredNameCount += preferredNames.length;

    if (preferredNames.length === 1) {
      stats.oneNameDays += 1;
    } else if (preferredNames.length === 2) {
      stats.twoNameDays += 1;
    } else if (preferredNames.length >= 3) {
      stats.threeOrMoreNameDays += 1;
    }
  }

  return {
    version: 1,
    generatedAt,
    sourceFile: "legacy + wiki + kézi felülírás",
    inputs: {
      legacyPath: path.relative(process.cwd(), inputs.legacyPath),
      wikiPath: path.relative(process.cwd(), inputs.wikiPath),
      overridesPath: path.relative(process.cwd(), inputs.overridesPath),
    },
    stats,
    days,
  };
}

/**
 * A `buildRegistryMap` felépíti a szükséges adatszerkezetet.
 */
function buildRegistryMap(payload, label) {
  if (!Array.isArray(payload?.days)) {
    throw new Error(`A(z) ${label} primerjegyzék payloadból hiányzik a days tömb.`);
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object") {
      throw new Error(`Érvénytelen napi bejegyzés a(z) ${label} primerjegyzékben.`);
    }

    const parsed = parseMonthDay(day.monthDay);

    if (!parsed) {
      throw new Error(`Érvénytelen ${label} monthDay érték: ${day.monthDay}`);
    }

    if (Number(day.month) !== parsed.month || Number(day.day) !== parsed.day) {
      throw new Error(`Ellentmondásos ${label} napi koordináták: ${day.monthDay}`);
    }

    if (map.has(day.monthDay)) {
      throw new Error(`Duplikált ${label} nap a primerjegyzékben: ${day.monthDay}`);
    }

    map.set(day.monthDay, {
      month: parsed.month,
      day: parsed.day,
      monthDay: day.monthDay,
      names: dedupeKeepOrder(day.names ?? []),
      preferredNames: dedupeKeepOrder(day.preferredNames ?? []),
    });
  }

  return map;
}

/**
 * A `buildOverridesMap` felépíti a szükséges adatszerkezetet.
 */
function buildOverridesMap(payload) {
  if (!Array.isArray(payload?.days)) {
    throw new Error("A primerjegyzék-felülírás payloadból hiányzik a days tömb.");
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object") {
      throw new Error("Érvénytelen napi bejegyzés a primerjegyzék-felülírásban.");
    }

    const parsed = parseMonthDay(day.monthDay);

    if (!parsed) {
      throw new Error(`Érvénytelen felülírás monthDay érték: ${day.monthDay}`);
    }

    if (Number(day.month) !== parsed.month || Number(day.day) !== parsed.day) {
      throw new Error(`Ellentmondásos felülírási napi koordináták: ${day.monthDay}`);
    }

    if (map.has(day.monthDay)) {
      throw new Error(`Duplikált felülírási nap: ${day.monthDay}`);
    }

    map.set(day.monthDay, {
      month: parsed.month,
      day: parsed.day,
      monthDay: day.monthDay,
      preferredNames: dedupeKeepOrder(day.preferredNames ?? []),
    });
  }

  return map;
}

/**
 * A `validateOverridesAgainstSources` ellenőrzi, hogy a kézi felülírások forrásnevei tényleg léteznek-e.
 */
function validateOverridesAgainstSources(overrideMap, legacyMap, wikiMap) {
  for (const overrideDay of overrideMap.values()) {
    const legacyDay = legacyMap.get(overrideDay.monthDay) ?? null;
    const wikiDay = wikiMap.get(overrideDay.monthDay) ?? null;
    const sourceNames = orderedUniqueNameUnion(
      legacyDay?.preferredNames ?? [],
      wikiDay?.preferredNames ?? []
    );
    const sourceNameSet = new Set(sourceNames.map(normalizeNameForMatch));

    if (sourceNameSet.size === 0) {
      throw new Error(`A felülírt naphoz nincs forrásnév a legacy/wiki primerforrásokban: ${overrideDay.monthDay}`);
    }

    for (const preferredName of overrideDay.preferredNames) {
      if (!sourceNameSet.has(normalizeNameForMatch(preferredName))) {
        throw new Error(
          `A felülírt név nem szerepel a legacy/wiki primerforrásokban: ${overrideDay.monthDay} / ${preferredName}`
        );
      }
    }
  }
}

/**
 * A `parseArgs` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--legacy" && argv[index + 1]) {
      options.legacy = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--legacy=")) {
      options.legacy = arg.slice("--legacy=".length);
      continue;
    }

    if (arg === "--wiki" && argv[index + 1]) {
      options.wiki = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--wiki=")) {
      options.wiki = arg.slice("--wiki=".length);
      continue;
    }

    if (arg === "--overrides" && argv[index + 1]) {
      options.overrides = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--overrides=")) {
      options.overrides = arg.slice("--overrides=".length);
      continue;
    }

    if (arg === "--output" && argv[index + 1]) {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    }
  }

  return options;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
