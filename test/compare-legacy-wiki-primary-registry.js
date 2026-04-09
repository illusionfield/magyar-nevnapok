import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_PRIMARY_REGISTRY_PATH,
  loadPrimaryRegistry,
  normalizeNameForMatch,
} from "../lib/primary-registry.js";
import { formatDiffNote, formatNameList, printDataTable, printKeyValueTable } from "./report-table.js";

const DEFAULT_WIKI_REGISTRY_PATH = path.join(process.cwd(), "output", "wiki-primary-registry.json");
const DEFAULT_REPORT_PATH = path.join(
  process.cwd(),
  "output",
  "legacy-vs-wiki-primary-registry-diff.json"
);
const collator = new Intl.Collator("hu", { sensitivity: "base", numeric: true });
const args = parseArgs(process.argv.slice(2));

async function main() {
  const legacyPath = path.resolve(process.cwd(), args.legacy ?? DEFAULT_PRIMARY_REGISTRY_PATH);
  const wikiPath = path.resolve(process.cwd(), args.wiki ?? DEFAULT_WIKI_REGISTRY_PATH);
  const reportPath = path.resolve(process.cwd(), args.report ?? DEFAULT_REPORT_PATH);

  const [{ payload: legacyPayload }, { payload: wikiPayload }] = await Promise.all([
    loadPrimaryRegistry(legacyPath),
    loadPrimaryRegistry(wikiPath),
  ]);

  const comparison = compareRegistries(legacyPayload, wikiPayload);
  const report = {
    generatedAt: new Date().toISOString(),
    legacyPath,
    wikiPath,
    reportPath,
    comparison,
  };

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  printReport(report);
}

function compareRegistries(legacyPayload, wikiPayload) {
  const legacyMap = buildRegistryMap(legacyPayload);
  const wikiMap = buildRegistryMap(wikiPayload);
  const allMonthDays = Array.from(new Set([...legacyMap.keys(), ...wikiMap.keys()])).sort();

  const summary = {
    legacyDayCount: legacyMap.size,
    wikiDayCount: wikiMap.size,
    sharedDayCount: 0,
    legacyOnlyDayCount: 0,
    wikiOnlyDayCount: 0,
    exactNameMatchDayCount: 0,
    overlapNameMatchDayCount: 0,
    disjointNameMatchDayCount: 0,
    exactPreferredMatchDayCount: 0,
    overlapPreferredMatchDayCount: 0,
    disjointPreferredMatchDayCount: 0,
    legacyNameCount: 0,
    wikiNameCount: 0,
    sharedNameCount: 0,
    legacyPreferredCount: 0,
    wikiPreferredCount: 0,
    sharedPreferredCount: 0,
    legacyNameCoverageRate: "0.00%",
    wikiNameCoverageRate: "0.00%",
    legacyPreferredCoverageRate: "0.00%",
    wikiPreferredCoverageRate: "0.00%",
  };

  const differences = {
    legacyOnlyDays: [],
    wikiOnlyDays: [],
    nameMismatchDays: [],
    preferredMismatchDays: [],
    topNameMismatchDays: [],
    topPreferredMismatchDays: [],
  };

  for (const monthDay of allMonthDays) {
    const legacyDay = legacyMap.get(monthDay) ?? null;
    const wikiDay = wikiMap.get(monthDay) ?? null;

    if (legacyDay && wikiDay) {
      summary.sharedDayCount += 1;
    } else if (legacyDay) {
      summary.legacyOnlyDayCount += 1;
      differences.legacyOnlyDays.push(buildMissingDayEntry("legacy", legacyDay));
      continue;
    } else if (wikiDay) {
      summary.wikiOnlyDayCount += 1;
      differences.wikiOnlyDays.push(buildMissingDayEntry("wiki", wikiDay));
      continue;
    }

    summary.legacyNameCount += legacyDay.names.length;
    summary.wikiNameCount += wikiDay.names.length;
    summary.legacyPreferredCount += legacyDay.preferredNames.length;
    summary.wikiPreferredCount += wikiDay.preferredNames.length;

    const nameMatch = compareNameSets(legacyDay.names, wikiDay.names);
    const preferredMatch = compareNameSets(legacyDay.preferredNames, wikiDay.preferredNames);

    summary.sharedNameCount += nameMatch.shared.length;
    summary.sharedPreferredCount += preferredMatch.shared.length;

    incrementMatchCounters(summary, nameMatch.type, "Name");
    incrementMatchCounters(summary, preferredMatch.type, "Preferred");

    if (nameMatch.type !== "exact") {
      differences.nameMismatchDays.push(
        buildMismatchEntry({
          monthDay,
          legacyDay,
          wikiDay,
          match: nameMatch,
          field: "names",
        })
      );
    }

    if (preferredMatch.type !== "exact") {
      differences.preferredMismatchDays.push(
        buildMismatchEntry({
          monthDay,
          legacyDay,
          wikiDay,
          match: preferredMatch,
          field: "preferredNames",
        })
      );
    }
  }

  summary.legacyNameCoverageRate = ratio(summary.sharedNameCount, summary.legacyNameCount);
  summary.wikiNameCoverageRate = ratio(summary.sharedNameCount, summary.wikiNameCount);
  summary.legacyPreferredCoverageRate = ratio(
    summary.sharedPreferredCount,
    summary.legacyPreferredCount
  );
  summary.wikiPreferredCoverageRate = ratio(summary.sharedPreferredCount, summary.wikiPreferredCount);

  differences.topNameMismatchDays = buildTopMismatchDays(differences.nameMismatchDays);
  differences.topPreferredMismatchDays = buildTopMismatchDays(differences.preferredMismatchDays);

  return {
    summary,
    differences,
  };
}

function buildRegistryMap(payload) {
  if (!Array.isArray(payload.days)) {
    throw new Error("Registry payload does not contain a valid days array.");
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object" || typeof day.monthDay !== "string") {
      throw new Error("Registry day entry is missing a valid monthDay field.");
    }

    if (!Array.isArray(day.names) || !Array.isArray(day.preferredNames)) {
      throw new Error(`Registry day entry is missing names or preferredNames: ${day.monthDay}`);
    }

    map.set(day.monthDay, {
      monthDay: day.monthDay,
      month: day.month ?? null,
      day: day.day ?? null,
      names: uniqueSorted(day.names),
      preferredNames: uniqueSorted(day.preferredNames),
    });
  }

  return map;
}

function compareNameSets(leftValues, rightValues) {
  const leftSet = new Set(leftValues.map(normalizeNameForMatch));
  const rightSet = new Set(rightValues.map(normalizeNameForMatch));
  const shared = leftValues.filter((name) => rightSet.has(normalizeNameForMatch(name)));
  const onlyLeft = leftValues.filter((name) => !rightSet.has(normalizeNameForMatch(name)));
  const onlyRight = rightValues.filter((name) => !leftSet.has(normalizeNameForMatch(name)));
  const type = getMatchType(leftValues, rightValues, shared, onlyLeft, onlyRight);

  return {
    type,
    shared,
    onlyLeft,
    onlyRight,
    mismatchCount: onlyLeft.length + onlyRight.length,
  };
}

function getMatchType(leftValues, rightValues, shared, onlyLeft, onlyRight) {
  if (onlyLeft.length === 0 && onlyRight.length === 0) {
    return "exact";
  }

  if (shared.length > 0) {
    return "overlap";
  }

  if (leftValues.length > 0 && rightValues.length > 0) {
    return "disjoint";
  }

  if (leftValues.length > 0) {
    return "left-only";
  }

  return "right-only";
}

function incrementMatchCounters(summary, type, prefix) {
  if (type === "exact") {
    summary[`exact${prefix}MatchDayCount`] += 1;
    return;
  }

  if (type === "overlap") {
    summary[`overlap${prefix}MatchDayCount`] += 1;
    return;
  }

  summary[`disjoint${prefix}MatchDayCount`] += 1;
}

function buildMismatchEntry({ monthDay, legacyDay, wikiDay, match, field }) {
  return {
    monthDay,
    type: match.type,
    typeLabel: formatMatchType(match.type),
    mismatchCount: match.mismatchCount,
    legacy: legacyDay[field],
    wiki: wikiDay[field],
    shared: match.shared,
    onlyLegacy: match.onlyLeft,
    onlyWiki: match.onlyRight,
  };
}

function buildMissingDayEntry(source, day) {
  return {
    source,
    monthDay: day.monthDay,
    names: day.names,
    preferredNames: day.preferredNames,
  };
}

function formatMatchType(type) {
  if (type === "exact") {
    return "pontos egyezés";
  }

  if (type === "overlap") {
    return "részleges átfedés";
  }

  if (type === "left-only") {
    return "csak legacy";
  }

  if (type === "right-only") {
    return "csak wiki";
  }

  return "teljes eltérés";
}

function buildTopMismatchDays(entries) {
  return entries
    .slice()
    .sort((left, right) => {
      const priority = getMismatchPriority(left.type) - getMismatchPriority(right.type);

      if (priority !== 0) {
        return priority;
      }

      if (right.mismatchCount !== left.mismatchCount) {
        return right.mismatchCount - left.mismatchCount;
      }

      if (left.shared.length !== right.shared.length) {
        return left.shared.length - right.shared.length;
      }

      return left.monthDay.localeCompare(right.monthDay);
    })
    ;
}

function getMismatchPriority(type) {
  if (type === "disjoint") {
    return 0;
  }

  if (type === "left-only") {
    return 1;
  }

  if (type === "right-only") {
    return 2;
  }

  return 3;
}

function printReport(report) {
  const { comparison } = report;

  printKeyValueTable("Források", [
    ["Legacy registry", report.legacyPath],
    ["Wiki registry", report.wikiPath],
    ["Riport", report.reportPath],
  ], {
    keyWidth: 18,
    valueWidth: 92,
  });

  printKeyValueTable("LEGACY VS. WIKI REGISTRY", [
    ["Legacy napok", comparison.summary.legacyDayCount],
    ["Wiki napok", comparison.summary.wikiDayCount],
    ["Közös napok", comparison.summary.sharedDayCount],
    ["Csak legacy napok", comparison.summary.legacyOnlyDayCount],
    ["Csak wiki napok", comparison.summary.wikiOnlyDayCount],
    ["Pontos névegyezésű napok", comparison.summary.exactNameMatchDayCount],
    ["Részleges névátfedésű napok", comparison.summary.overlapNameMatchDayCount],
    ["Teljes néveltérésű napok", comparison.summary.disjointNameMatchDayCount],
    [
      "Legacy névfedés wikihez képest",
      `${comparison.summary.sharedNameCount}/${comparison.summary.legacyNameCount} (${comparison.summary.legacyNameCoverageRate})`,
    ],
    [
      "Wiki névfedés legacyhoz képest",
      `${comparison.summary.sharedNameCount}/${comparison.summary.wikiNameCount} (${comparison.summary.wikiNameCoverageRate})`,
    ],
    ["Pontos primer-egyezésű napok", comparison.summary.exactPreferredMatchDayCount],
    ["Részleges primerátfedésű napok", comparison.summary.overlapPreferredMatchDayCount],
    ["Teljes primereltérésű napok", comparison.summary.disjointPreferredMatchDayCount],
    [
      "Legacy primerfedés wikihez képest",
      `${comparison.summary.sharedPreferredCount}/${comparison.summary.legacyPreferredCount} (${comparison.summary.legacyPreferredCoverageRate})`,
    ],
    [
      "Wiki primerfedés legacyhoz képest",
      `${comparison.summary.sharedPreferredCount}/${comparison.summary.wikiPreferredCount} (${comparison.summary.wikiPreferredCoverageRate})`,
    ],
  ], {
    keyWidth: 42,
    valueWidth: 64,
  });

  printDataTable(
    "Primereltérésű napok",
    [
      { key: "monthDay", title: "Nap", width: 7 },
      { key: "typeLabel", title: "Eltérés", width: 18 },
      { key: "legacy", title: "Legacy", width: 26, value: (row) => formatNameList(row.legacy, { maxItems: 4, maxLength: 26 }) },
      { key: "wiki", title: "Wiki", width: 26, value: (row) => formatNameList(row.wiki, { maxItems: 4, maxLength: 26 }) },
      {
        key: "note",
        title: "Részletek",
        width: 48,
        value: (row) =>
          formatDiffNote({
            shared: row.shared,
            onlyLeft: row.onlyLegacy,
            onlyRight: row.onlyWiki,
            leftLabel: "legacy",
            rightLabel: "wiki",
          }),
      },
    ],
    comparison.differences.topPreferredMismatchDays
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

function joinNamesForConsole(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return "—";
  }

  return values.join(" • ");
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
