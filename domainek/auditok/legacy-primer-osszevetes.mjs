// domainek/auditok/legacy-primer-osszevetes.mjs
// Legacy primer vs. aktuális adatbázis összevető audit.
import fs from "node:fs/promises";
import path from "node:path";
import {
  buildPrimaryRegistryLookup,
  DEFAULT_PRIMARY_REGISTRY_PATH,
  loadPrimaryRegistry,
  normalizeNameForMatch,
} from "../primer/alap.mjs";
import { formatDiffNote, formatNameList, printDataTable, printKeyValueTable } from "../../kozos/terminal-tabla.mjs";
import {
  betoltStrukturaltFajl,
  mentStrukturaltFajl,
} from "../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";

const DEFAULT_INPUT_PATH = kanonikusUtvonalak.adatbazis.nevnapok;
const DEFAULT_REPORT_PATH = kanonikusUtvonalak.riportok.legacyPrimer;
//const TOP_MISMATCH_LIMIT = 15;
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

  await mentStrukturaltFajl(reportPath, comparison);

  printComparison(comparison);
}

async function readJson(filePath) {
  return betoltStrukturaltFajl(filePath);
}

function buildCurrentDayMap(payload) {
  if (!Array.isArray(payload.names)) {
    throw new Error("A bemeneti adatbázis nem tartalmaz érvényes names tömböt.");
  }

  const dayMap = new Map();

  for (const nameEntry of payload.names) {
    const name = String(nameEntry?.name ?? "").trim();

    if (!name) {
      continue;
    }

    if (!Array.isArray(nameEntry.days)) {
      throw new Error(`A névbejegyzés nem tartalmaz érvényes days tömböt: ${name}`);
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
    throw new Error(`Érvénytelen napi bejegyzés ennél a névnél: ${name}`);
  }

  if (typeof dayEntry.monthDay !== "string") {
    throw new Error(`A napi bejegyzésből hiányzik a monthDay ennél a névnél: ${name}`);
  }

  if (typeof dayEntry.primary !== "boolean") {
    throw new Error(`A napi bejegyzésből hiányzik a primary logikai érték ennél ${name} / ${dayEntry.monthDay}`);
  }

  if (typeof dayEntry.primaryLegacy !== "boolean") {
    throw new Error(
      `A napi bejegyzésből hiányzik a primaryLegacy logikai érték ennél ${name} / ${dayEntry.monthDay}`
    );
  }

  if (typeof dayEntry.primaryRanked !== "boolean") {
    throw new Error(
      `A napi bejegyzésből hiányzik a primaryRanked logikai érték ennél ${name} / ${dayEntry.monthDay}`
    );
  }

  if (!dayEntry.ranking || typeof dayEntry.ranking !== "object") {
    throw new Error(`A napi bejegyzésből hiányzik a ranking objektum ennél ${name} / ${dayEntry.monthDay}`);
  }

  if (!Number.isInteger(dayEntry.ranking.score)) {
    throw new Error(`A napi bejegyzésből hiányzik a ranking.score ennél ${name} / ${dayEntry.monthDay}`);
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
  return mismatchDays.slice().sort((left, right) => {
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
  });
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
  printKeyValueTable("Források", [
    ["Összehasonlított adatbázis", comparison.inputPath],
    ["Primer registry", comparison.registryPath],
    ["Riport", comparison.reportPath],
    ["Adatbázis generálva", comparison.generatedAt ?? "—"],
    ["Adatverzió", comparison.jsonVersion ?? "—"],
  ], {
    keyWidth: 22,
    valueWidth: 90,
  });

  printKeyValueTable("LEGACY REGISTRY VS. ADATBÁZIS", [
    ["Primerjegyzék napjai", comparison.registryComparison.summary.registryDayCount],
    ["Aktuális adatbázis napok", comparison.registryComparison.summary.currentDayCount],
    ["Teljes részhalmaz-egyezés", comparison.registryComparison.summary.subsetCount],
    ["Ebből pontos napi egyezés", comparison.registryComparison.summary.exactSubsetCount],
    ["Részleges egyezés", comparison.registryComparison.summary.partialCount],
    ["Nincs egyezés", comparison.registryComparison.summary.noneCount],
    [
      "Legacy névegyezés",
      `${comparison.registryComparison.summary.registryMatchedNameCount}/${comparison.registryComparison.summary.registryNameCount} (${comparison.registryComparison.summary.nameMatchRate})`,
    ],
    [
      "Legacy primer egyezés",
      `${comparison.registryComparison.summary.preferredMatchedCount}/${comparison.registryComparison.summary.preferredNameCount} (${comparison.registryComparison.summary.preferredMatchRate})`,
    ],
    ["Hiányzó legacy nevek", comparison.registryComparison.summary.registryMissingNameCount],
    [
      "Legacy primer hiányos napok",
      comparison.registryComparison.differences.preferredShortfallDays.length,
    ],
  ], {
    keyWidth: 42,
    valueWidth: 64,
  });

  printDataTable(
    "Legacy primerhiányos napok",
    [
      { key: "monthDay", title: "Nap", width: 7 },
      {
        key: "registryPreferredNames",
        title: "Legacy primer",
        width: 26,
        value: (row) => formatNameList(row.registryPreferredNames, { maxItems: 4, maxLength: 26 }),
      },
      {
        key: "currentPrimaryLegacy",
        title: "Adatbázis legacy",
        width: 26,
        value: (row) => formatNameList(row.currentPrimaryLegacy, { maxItems: 4, maxLength: 26 }),
      },
      {
        key: "preferredMissing",
        title: "Hiányzik",
        width: 26,
        value: (row) => formatNameList(row.preferredMissing, { maxItems: 4, maxLength: 26 }),
      },
    ],
    comparison.registryComparison.differences.preferredShortfallDays
  );

  printKeyValueTable("LEGACY PRIMARY VS. SZÁMÍTOTT PRIMARY (RANKING)", [
    ["Összehasonlított napok", comparison.primaryComparison.summary.dayCount],
    ["Pontos egyezés", comparison.primaryComparison.summary.exactDayCount],
    ["Részleges átfedés", comparison.primaryComparison.summary.overlapDayCount],
    ["Teljes eltérés", comparison.primaryComparison.summary.disjointDayCount],
    ["Csak legacy van", comparison.primaryComparison.summary.legacyOnlyDayCount],
    ["Csak számított ranking van", comparison.primaryComparison.summary.rankedOnlyDayCount],
    [
      "Közös primary nevek legacyhoz képest",
      `${comparison.primaryComparison.summary.sharedPrimaryCount}/${comparison.primaryComparison.summary.legacyPrimaryCount} (${comparison.primaryComparison.summary.legacyCoverageRate})`,
    ],
    [
      "Közös primary nevek rankinghez képest",
      `${comparison.primaryComparison.summary.sharedPrimaryCount}/${comparison.primaryComparison.summary.rankedPrimaryCount} (${comparison.primaryComparison.summary.rankedCoverageRate})`,
    ],
    ["Eltérő napok", comparison.primaryComparison.differences.mismatchDays.length],
  ], {
    keyWidth: 42,
    valueWidth: 64,
  });

  printDataTable(
    "Legacy primary vs. ranking — eltérő napok",
    [
      { key: "monthDay", title: "Nap", width: 7 },
      { key: "typeLabel", title: "Eltérés", width: 18 },
      {
        key: "legacyPrimary",
        title: "Legacy",
        width: 26,
        value: (row) => formatNameList(row.legacyPrimary, { maxItems: 4, maxLength: 26 }),
      },
      {
        key: "rankedPrimary",
        title: "Ranking",
        width: 26,
        value: (row) => formatNameList(row.rankedPrimary, { maxItems: 4, maxLength: 26 }),
      },
      {
        key: "note",
        title: "Részletek",
        width: 48,
        value: (row) =>
          formatDiffNote({
            shared: row.sharedPrimary,
            onlyLeft: row.onlyLegacyPrimary,
            onlyRight: row.onlyRankedPrimary,
            leftLabel: "legacy",
            rightLabel: "ranking",
          }),
      },
    ],
    comparison.primaryComparison.differences.topMismatchDays
  );
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
