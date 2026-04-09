import fs from "node:fs/promises";
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
} from "./lib/primary-registry.js";

const args = parseArgs(process.argv.slice(2));

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

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(`Saved ${payload.days.length} final primary day(s) to ${outputPath}`);
  console.log(`Pontos legacy–wiki egyezésű napok: ${payload.stats.exactAgreementDayCount}`);
  console.log(`Kézi override-os napok: ${payload.stats.overrideDayCount}`);
  console.log(`Warning-union napok: ${payload.stats.warningUnionDayCount}`);
}

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
      throw new Error(`Invalid monthDay while building final primary registry: ${monthDay}`);
    }

    const legacyNames = [...(legacyDay?.preferredNames ?? [])];
    const wikiNames = [...(wikiDay?.preferredNames ?? [])];
    const overrideNames = [...(overrideDay?.preferredNames ?? [])];

    let preferredNames;
    let source;
    let warning = false;

    if (overrideDay) {
      preferredNames = [...overrideNames];
      source = "manual-override";
      stats.overrideDayCount += 1;
    } else if (areNameSetsEqual(legacyNames, wikiNames)) {
      preferredNames = [...legacyNames];
      source = "legacy-wiki-exact";
      stats.exactAgreementDayCount += 1;
    } else {
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
    sourceFile: "legacy + wiki + manual override",
    inputs: {
      legacyPath: path.relative(process.cwd(), inputs.legacyPath),
      wikiPath: path.relative(process.cwd(), inputs.wikiPath),
      overridesPath: path.relative(process.cwd(), inputs.overridesPath),
    },
    stats,
    days,
  };
}

function buildRegistryMap(payload, label) {
  if (!Array.isArray(payload?.days)) {
    throw new Error(`Invalid ${label} registry payload: missing days array.`);
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object") {
      throw new Error(`Invalid ${label} registry day entry.`);
    }

    const parsed = parseMonthDay(day.monthDay);

    if (!parsed) {
      throw new Error(`Invalid ${label} registry monthDay: ${day.monthDay}`);
    }

    if (Number(day.month) !== parsed.month || Number(day.day) !== parsed.day) {
      throw new Error(`Inconsistent ${label} registry day coordinates: ${day.monthDay}`);
    }

    if (map.has(day.monthDay)) {
      throw new Error(`Duplicate ${label} registry day: ${day.monthDay}`);
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

function buildOverridesMap(payload) {
  if (!Array.isArray(payload?.days)) {
    throw new Error("Invalid primary registry override payload: missing days array.");
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object") {
      throw new Error("Invalid primary registry override day entry.");
    }

    const parsed = parseMonthDay(day.monthDay);

    if (!parsed) {
      throw new Error(`Invalid override monthDay: ${day.monthDay}`);
    }

    if (Number(day.month) !== parsed.month || Number(day.day) !== parsed.day) {
      throw new Error(`Inconsistent override day coordinates: ${day.monthDay}`);
    }

    if (map.has(day.monthDay)) {
      throw new Error(`Duplicate override day: ${day.monthDay}`);
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
      throw new Error(`Override day has no source names in legacy/wiki: ${overrideDay.monthDay}`);
    }

    for (const preferredName of overrideDay.preferredNames) {
      if (!sourceNameSet.has(normalizeNameForMatch(preferredName))) {
        throw new Error(
          `Override name is not present in legacy/wiki primary sources: ${overrideDay.monthDay} / ${preferredName}`
        );
      }
    }
  }
}

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
