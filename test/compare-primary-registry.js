import fs from "node:fs/promises";
import path from "node:path";
import {
  buildPrimaryRegistryLookup,
  DEFAULT_PRIMARY_REGISTRY_PATH,
  loadPrimaryRegistry,
  normalizeNameForMatch,
} from "../lib/primary-registry.js";

const DEFAULT_INPUT_PATH = path.join(process.cwd(), "output", "nevnapok.json");
const DEFAULT_REPORT_PATH = path.join(process.cwd(), "output", "primary-registry-diff.json");
const TOP_MISMATCH_LIMIT = 15;
const collator = new Intl.Collator("hu", { sensitivity: "base", numeric: true });
const args = parseArgs(process.argv.slice(2));

async function main() {
  const inputPath = path.resolve(process.cwd(), args.input ?? DEFAULT_INPUT_PATH);
  const reportPath = path.resolve(process.cwd(), args.report ?? DEFAULT_REPORT_PATH);
  const registryPath = path.resolve(process.cwd(), args.registry ?? DEFAULT_PRIMARY_REGISTRY_PATH);

  const [{ payload: registryPayload }, jsonPayload] = await Promise.all([
    loadPrimaryRegistry(registryPath),
    readJson(inputPath),
  ]);

  const registryLookup = buildPrimaryRegistryLookup(registryPayload.days);
  const currentDayMap = buildCurrentDayMap(jsonPayload);
  const registryComparison = compareRegistry(registryLookup, currentDayMap);
  const primaryComparison = compareLegacyPrimaryVsRankedPrimary(currentDayMap);
  const comparison = {
    inputPath,
    registryPath,
    reportPath,
    jsonVersion: jsonPayload.version ?? null,
    generatedAt: jsonPayload.generatedAt ?? null,
    registryComparison,
    primaryComparison,
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(comparison, null, 2)}\n`, "utf8");

  printComparison(comparison);
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function buildCurrentDayMap(payload) {
  if (!Array.isArray(payload.names)) {
    throw new Error("Input JSON does not contain a valid names array.");
  }

  const dayMap = new Map();

  for (const nameEntry of payload.names) {
    const name = String(nameEntry?.name ?? "").trim();

    if (!name) {
      continue;
    }

    if (!Array.isArray(nameEntry.days)) {
      throw new Error(`Name entry does not contain a valid days array: ${name}`);
    }

    for (const dayEntry of nameEntry.days) {
      validateDayEntry(name, dayEntry);

      const bucket = dayMap.get(dayEntry.monthDay) ?? {
        monthDay: dayEntry.monthDay,
        names: [],
        primary: [],
        primaryLegacy: [],
        primaryRanked: [],
      };

      bucket.names.push(name);

      if (dayEntry.primary) {
        bucket.primary.push(name);
      }

      if (dayEntry.primaryLegacy) {
        bucket.primaryLegacy.push(name);
      }

      if (dayEntry.primaryRanked) {
        bucket.primaryRanked.push(name);
      }

      dayMap.set(dayEntry.monthDay, bucket);
    }
  }

  for (const bucket of dayMap.values()) {
    bucket.names = uniqueSorted(bucket.names);
    bucket.primary = uniqueSorted(bucket.primary);
    bucket.primaryLegacy = uniqueSorted(bucket.primaryLegacy);
    bucket.primaryRanked = uniqueSorted(bucket.primaryRanked);
    bucket.normalizedNameSet = new Set(bucket.names.map(normalizeNameForMatch));
    bucket.normalizedPrimaryLegacySet = new Set(bucket.primaryLegacy.map(normalizeNameForMatch));
    bucket.normalizedPrimaryRankedSet = new Set(bucket.primaryRanked.map(normalizeNameForMatch));
  }

  return dayMap;
}

function validateDayEntry(name, dayEntry) {
  if (!dayEntry || typeof dayEntry !== "object") {
    throw new Error(`Invalid day entry on name: ${name}`);
  }

  if (typeof dayEntry.monthDay !== "string") {
    throw new Error(`Day entry is missing monthDay on name: ${name}`);
  }

  if (typeof dayEntry.primary !== "boolean") {
    throw new Error(`Day entry is missing primary boolean on ${name} / ${dayEntry.monthDay}`);
  }

  if (typeof dayEntry.primaryLegacy !== "boolean") {
    throw new Error(
      `Day entry is missing primaryLegacy boolean on ${name} / ${dayEntry.monthDay}`
    );
  }

  if (typeof dayEntry.primaryRanked !== "boolean") {
    throw new Error(
      `Day entry is missing primaryRanked boolean on ${name} / ${dayEntry.monthDay}`
    );
  }

  if (!dayEntry.ranking || typeof dayEntry.ranking !== "object") {
    throw new Error(`Day entry is missing ranking object on ${name} / ${dayEntry.monthDay}`);
  }

  if (!Number.isInteger(dayEntry.ranking.score)) {
    throw new Error(`Day entry is missing ranking.score on ${name} / ${dayEntry.monthDay}`);
  }
}

function compareRegistry(registryLookup, currentDayMap) {
  const summary = {
    registryDayCount: registryLookup.size,
    currentDayCount: currentDayMap.size,
    exactSubsetCount: 0,
    subsetCount: 0,
    partialCount: 0,
    noneCount: 0,
    registryNameCount: 0,
    registryMatchedNameCount: 0,
    registryMissingNameCount: 0,
    preferredNameCount: 0,
    preferredMatchedCount: 0,
    preferredMissingCount: 0,
  };
  const differences = {
    partialDays: [],
    missingDays: [],
    preferredShortfallDays: [],
    missingNames: [],
  };

  for (const registryDay of registryLookup.values()) {
    const currentDay = currentDayMap.get(registryDay.monthDay) ?? null;
    const hits = [];
    const missing = [];

    for (const name of registryDay.names) {
      if (currentDay?.normalizedNameSet.has(normalizeNameForMatch(name))) {
        hits.push(name);
      } else {
        missing.push(name);
      }
    }

    const preferredHits = [];
    const preferredMissing = [];

    for (const name of registryDay.preferredNames) {
      if (currentDay?.normalizedPrimaryLegacySet.has(normalizeNameForMatch(name))) {
        preferredHits.push(name);
      } else {
        preferredMissing.push(name);
      }
    }

    summary.registryNameCount += registryDay.names.length;
    summary.registryMatchedNameCount += hits.length;
    summary.registryMissingNameCount += missing.length;
    summary.preferredNameCount += registryDay.preferredNames.length;
    summary.preferredMatchedCount += preferredHits.length;
    summary.preferredMissingCount += preferredMissing.length;

    if (missing.length === 0) {
      summary.subsetCount += 1;

      if ((currentDay?.names.length ?? 0) === registryDay.names.length) {
        summary.exactSubsetCount += 1;
      }
    } else if (hits.length > 0) {
      summary.partialCount += 1;
      differences.partialDays.push(
        buildRegistryDifferenceEntry(
          registryDay,
          currentDay,
          hits,
          missing,
          preferredHits,
          preferredMissing
        )
      );
    } else {
      summary.noneCount += 1;
      differences.missingDays.push(
        buildRegistryDifferenceEntry(
          registryDay,
          currentDay,
          hits,
          missing,
          preferredHits,
          preferredMissing
        )
      );
    }

    if (preferredMissing.length > 0) {
      differences.preferredShortfallDays.push(
        buildRegistryDifferenceEntry(
          registryDay,
          currentDay,
          hits,
          missing,
          preferredHits,
          preferredMissing
        )
      );
    }

    for (const name of missing) {
      differences.missingNames.push({
        monthDay: registryDay.monthDay,
        name,
      });
    }
  }

  summary.nameMatchRate = ratio(summary.registryMatchedNameCount, summary.registryNameCount);
  summary.preferredMatchRate = ratio(summary.preferredMatchedCount, summary.preferredNameCount);

  return {
    summary,
    differences,
  };
}

function compareLegacyPrimaryVsRankedPrimary(currentDayMap) {
  const summary = {
    dayCount: 0,
    exactDayCount: 0,
    overlapDayCount: 0,
    disjointDayCount: 0,
    legacyOnlyDayCount: 0,
    rankedOnlyDayCount: 0,
    legacyPrimaryCount: 0,
    rankedPrimaryCount: 0,
    sharedPrimaryCount: 0,
    legacyCoverageRate: "0.00%",
    rankedCoverageRate: "0.00%",
  };
  const differences = {
    mismatchDays: [],
    topMismatchDays: [],
  };

  for (const currentDay of Array.from(currentDayMap.values()).sort((left, right) =>
    left.monthDay.localeCompare(right.monthDay)
  )) {
    const legacy = currentDay.primaryLegacy;
    const ranked = currentDay.primaryRanked;
    const legacySet = new Set(legacy.map(normalizeNameForMatch));
    const rankedSet = new Set(ranked.map(normalizeNameForMatch));
    const shared = legacy.filter((name) => rankedSet.has(normalizeNameForMatch(name)));
    const onlyLegacy = legacy.filter((name) => !rankedSet.has(normalizeNameForMatch(name)));
    const onlyRanked = ranked.filter((name) => !legacySet.has(normalizeNameForMatch(name)));

    summary.dayCount += 1;
    summary.legacyPrimaryCount += legacy.length;
    summary.rankedPrimaryCount += ranked.length;
    summary.sharedPrimaryCount += shared.length;

    if (onlyLegacy.length === 0 && onlyRanked.length === 0) {
      summary.exactDayCount += 1;
      continue;
    }

    const type = getPrimaryMismatchType(legacy, ranked, shared);

    if (type === "overlap") {
      summary.overlapDayCount += 1;
    } else if (type === "disjoint") {
      summary.disjointDayCount += 1;
    } else if (type === "legacy-only") {
      summary.legacyOnlyDayCount += 1;
    } else if (type === "ranked-only") {
      summary.rankedOnlyDayCount += 1;
    }

    differences.mismatchDays.push({
      monthDay: currentDay.monthDay,
      type,
      typeLabel: formatPrimaryMismatchType(type),
      mismatchCount: onlyLegacy.length + onlyRanked.length,
      sharedCount: shared.length,
      legacyPrimary: legacy,
      rankedPrimary: ranked,
      sharedPrimary: shared,
      onlyLegacyPrimary: onlyLegacy,
      onlyRankedPrimary: onlyRanked,
    });
  }

  summary.legacyCoverageRate = ratio(summary.sharedPrimaryCount, summary.legacyPrimaryCount);
  summary.rankedCoverageRate = ratio(summary.sharedPrimaryCount, summary.rankedPrimaryCount);
  differences.topMismatchDays = buildTopMismatchDays(differences.mismatchDays);

  return {
    summary,
    differences,
  };
}

function buildRegistryDifferenceEntry(
  registryDay,
  currentDay,
  hits,
  missing,
  preferredHits,
  preferredMissing
) {
  return {
    monthDay: registryDay.monthDay,
    registryNames: registryDay.names,
    registryPreferredNames: registryDay.preferredNames,
    currentNames: currentDay?.names ?? [],
    currentPrimaryLegacy: currentDay?.primaryLegacy ?? [],
    currentPrimaryRanked: currentDay?.primaryRanked ?? [],
    hits,
    missing,
    preferredHits,
    preferredMissing,
  };
}

function getPrimaryMismatchType(legacy, ranked, shared) {
  if (legacy.length > 0 && ranked.length > 0 && shared.length > 0) {
    return "overlap";
  }

  if (legacy.length > 0 && ranked.length > 0) {
    return "disjoint";
  }

  if (legacy.length > 0) {
    return "legacy-only";
  }

  return "ranked-only";
}

function formatPrimaryMismatchType(type) {
  if (type === "disjoint") {
    return "teljes eltérés";
  }

  if (type === "overlap") {
    return "részleges átfedés";
  }

  if (type === "legacy-only") {
    return "csak legacy";
  }

  return "csak ranking";
}

function buildTopMismatchDays(mismatchDays) {
  return mismatchDays
    .slice()
    .sort((left, right) => {
      const typeDifference =
        getPrimaryMismatchPriority(left.type) - getPrimaryMismatchPriority(right.type);

      if (typeDifference !== 0) {
        return typeDifference;
      }

      if (right.mismatchCount !== left.mismatchCount) {
        return right.mismatchCount - left.mismatchCount;
      }

      if (left.sharedCount !== right.sharedCount) {
        return left.sharedCount - right.sharedCount;
      }

      return left.monthDay.localeCompare(right.monthDay);
    })
    .slice(0, TOP_MISMATCH_LIMIT);
}

function getPrimaryMismatchPriority(type) {
  if (type === "disjoint") {
    return 0;
  }

  if (type === "legacy-only") {
    return 1;
  }

  if (type === "ranked-only") {
    return 2;
  }

  return 3;
}


function printComparison(comparison) {
  console.log(`Összehasonlított JSON: ${comparison.inputPath}`);
  console.log(`Primer registry: ${comparison.registryPath}`);
  console.log(`Riport: ${comparison.reportPath}`);

  if (comparison.generatedAt) {
    console.log(`JSON generálva: ${comparison.generatedAt}`);
  }

  if (comparison.jsonVersion != null) {
    console.log(`JSON verzió: ${comparison.jsonVersion}`);
  }

  console.log("");
  console.log("=== LEGACY REGISTRY VS. JSON ===");
  console.log(`Registry napok: ${comparison.registryComparison.summary.registryDayCount}`);
  console.log(`Aktuális JSON napok: ${comparison.registryComparison.summary.currentDayCount}`);
  console.log(`Teljes részhalmaz-egyezés: ${comparison.registryComparison.summary.subsetCount}`);
  console.log(
    `Ebből pontos napi egyezés: ${comparison.registryComparison.summary.exactSubsetCount}`
  );
  console.log(`Részleges egyezés: ${comparison.registryComparison.summary.partialCount}`);
  console.log(`Nincs egyezés: ${comparison.registryComparison.summary.noneCount}`);
  console.log(
    `Legacy névegyezés: ${comparison.registryComparison.summary.registryMatchedNameCount}/${comparison.registryComparison.summary.registryNameCount} (${comparison.registryComparison.summary.nameMatchRate})`
  );
  console.log(
    `Legacy primer egyezés: ${comparison.registryComparison.summary.preferredMatchedCount}/${comparison.registryComparison.summary.preferredNameCount} (${comparison.registryComparison.summary.preferredMatchRate})`
  );
  console.log(
    `Hiányzó legacy nevek: ${comparison.registryComparison.summary.registryMissingNameCount}`
  );
  console.log(
    `Legacy primer hiányos napok: ${comparison.registryComparison.differences.preferredShortfallDays.length}`
  );

  console.log("");
  console.log("=== LEGACY PRIMARY VS. SZÁMÍTOTT PRIMARY (RANKING) ===");
  console.log(`Összehasonlított napok: ${comparison.primaryComparison.summary.dayCount}`);
  console.log(`Pontos egyezés: ${comparison.primaryComparison.summary.exactDayCount}`);
  console.log(`Részleges átfedés: ${comparison.primaryComparison.summary.overlapDayCount}`);
  console.log(`Teljes eltérés: ${comparison.primaryComparison.summary.disjointDayCount}`);
  console.log(`Csak legacy van: ${comparison.primaryComparison.summary.legacyOnlyDayCount}`);
  console.log(`Csak számított ranking van: ${comparison.primaryComparison.summary.rankedOnlyDayCount}`);
  console.log(
    `Közös primary nevek legacyhoz képest: ${comparison.primaryComparison.summary.sharedPrimaryCount}/${comparison.primaryComparison.summary.legacyPrimaryCount} (${comparison.primaryComparison.summary.legacyCoverageRate})`
  );
  console.log(
    `Közös primary nevek rankinghez képest: ${comparison.primaryComparison.summary.sharedPrimaryCount}/${comparison.primaryComparison.summary.rankedPrimaryCount} (${comparison.primaryComparison.summary.rankedCoverageRate})`
  );
  console.log(
    `Eltérő napok: ${comparison.primaryComparison.differences.mismatchDays.length}`
  );

  if (comparison.primaryComparison.differences.topMismatchDays.length > 0) {
    console.log("");
    console.log(
      `Legnagyobb eltérésű napok (top ${comparison.primaryComparison.differences.topMismatchDays.length}):`
    );

    for (const mismatch of comparison.primaryComparison.differences.topMismatchDays) {
      console.log(`- ${mismatch.monthDay} — ${mismatch.typeLabel}`);
      console.log(`  Legacy : ${joinNamesForConsole(mismatch.legacyPrimary)}`);
      console.log(`  Ranking: ${joinNamesForConsole(mismatch.rankedPrimary)}`);

      if (mismatch.sharedPrimary.length > 0) {
        console.log(`  Közös  : ${joinNamesForConsole(mismatch.sharedPrimary)}`);
      }

      if (mismatch.onlyLegacyPrimary.length > 0) {
        console.log(`  Csak legacy : ${joinNamesForConsole(mismatch.onlyLegacyPrimary)}`);
      }

      if (mismatch.onlyRankedPrimary.length > 0) {
        console.log(`  Csak ranking: ${joinNamesForConsole(mismatch.onlyRankedPrimary)}`);
      }
    }
  }
}

function ratio(part, whole) {
  if (!whole) {
    return "0.00%";
  }

  return `${((part / whole) * 100).toFixed(2)}%`;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((left, right) => collator.compare(left, right));
}

function joinNamesForConsole(names) {
  if (!Array.isArray(names) || names.length === 0) {
    return "—";
  }

  return names.join(" • ");
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input" && argv[index + 1]) {
      options.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--registry" && argv[index + 1]) {
      options.registry = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--registry=")) {
      options.registry = arg.slice("--registry=".length);
      continue;
    }

    if (arg === "--report" && argv[index + 1]) {
      options.report = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--report=")) {
      options.report = arg.slice("--report=".length);
    }
  }

  return options;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
