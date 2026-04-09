// domainek/auditok/primer-normalizalo-osszevetes.mjs
// A normalizáló riport és a primerforrások összevetése.
import fs from "node:fs/promises";
import path from "node:path";
import {
  DEFAULT_PRIMARY_REGISTRY_PATH,
  loadPrimaryRegistry,
  normalizeNameForMatch,
} from "../primer/alap.mjs";
import { formatDiffNote, formatNameList, printDataTable, printKeyValueTable } from "../../kozos/terminal-tabla.mjs";
import { mentStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";

const DEFAULT_NORMALIZED_REGISTRY_PATH = kanonikusUtvonalak.primer.normalizaloRiport;
const DEFAULT_WIKI_REGISTRY_PATH = kanonikusUtvonalak.primer.wiki;
const DEFAULT_REPORT_PATH = kanonikusUtvonalak.riportok.primerNormalizalo;
const collator = new Intl.Collator("hu", { sensitivity: "base", numeric: true });
const args = parseArgs(process.argv.slice(2));

async function main() {
  const normalizedPath = path.resolve(
    process.cwd(),
    args.normalized ?? DEFAULT_NORMALIZED_REGISTRY_PATH
  );
  const legacyPath = path.resolve(process.cwd(), args.legacy ?? DEFAULT_PRIMARY_REGISTRY_PATH);
  const wikiPath = path.resolve(process.cwd(), args.wiki ?? DEFAULT_WIKI_REGISTRY_PATH);
  const reportPath = path.resolve(process.cwd(), args.report ?? DEFAULT_REPORT_PATH);

  const [normalizedRegistry, legacyRegistry, wikiRegistry] = await Promise.all([
    loadPrimaryRegistry(normalizedPath),
    loadPrimaryRegistry(legacyPath),
    loadPrimaryRegistry(wikiPath),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    normalizedPath,
    legacyPath,
    wikiPath,
    reportPath,
    normalizer: summarizeNormalizer(normalizedRegistry.payload),
    comparisons: {
      legacy: compareRegistries(normalizedRegistry.payload, legacyRegistry.payload, {
        leftLabel: "normalizált",
        rightLabel: "legacy",
      }),
      wiki: compareRegistries(normalizedRegistry.payload, wikiRegistry.payload, {
        leftLabel: "normalizált",
        rightLabel: "wiki",
      }),
    },
  };

  await mentStrukturaltFajl(reportPath, report);

  printReport(report);
}

function summarizeNormalizer(payload) {
  return {
    stats: payload?.stats ?? null,
    summary: payload?.summary ?? null,
    reviewQueueLength: Array.isArray(payload?.reviewQueue) ? payload.reviewQueue.length : 0,
  };
}

function compareRegistries(leftPayload, rightPayload, labels) {
  const leftMap = buildRegistryMap(leftPayload);
  const rightMap = buildRegistryMap(rightPayload);
  const allMonthDays = Array.from(new Set([...leftMap.keys(), ...rightMap.keys()])).sort();

  const summary = {
    leftDayCount: leftMap.size,
    rightDayCount: rightMap.size,
    sharedDayCount: 0,
    leftOnlyDayCount: 0,
    rightOnlyDayCount: 0,
    exactNameMatchDayCount: 0,
    overlapNameMatchDayCount: 0,
    disjointNameMatchDayCount: 0,
    exactPreferredMatchDayCount: 0,
    overlapPreferredMatchDayCount: 0,
    disjointPreferredMatchDayCount: 0,
    leftNameCount: 0,
    rightNameCount: 0,
    sharedNameCount: 0,
    leftPreferredCount: 0,
    rightPreferredCount: 0,
    sharedPreferredCount: 0,
    leftNameCoverageRate: "0.00%",
    rightNameCoverageRate: "0.00%",
    leftPreferredCoverageRate: "0.00%",
    rightPreferredCoverageRate: "0.00%",
  };

  const differences = {
    leftOnlyDays: [],
    rightOnlyDays: [],
    nameMismatchDays: [],
    preferredMismatchDays: [],
    sortedNameMismatchDays: [],
    sortedPreferredMismatchDays: [],
  };

  for (const monthDay of allMonthDays) {
    const leftDay = leftMap.get(monthDay) ?? null;
    const rightDay = rightMap.get(monthDay) ?? null;

    if (leftDay && rightDay) {
      summary.sharedDayCount += 1;
    } else if (leftDay) {
      summary.leftOnlyDayCount += 1;
      differences.leftOnlyDays.push(buildMissingDayEntry(labels.leftLabel, leftDay));
      continue;
    } else if (rightDay) {
      summary.rightOnlyDayCount += 1;
      differences.rightOnlyDays.push(buildMissingDayEntry(labels.rightLabel, rightDay));
      continue;
    }

    summary.leftNameCount += leftDay.names.length;
    summary.rightNameCount += rightDay.names.length;
    summary.leftPreferredCount += leftDay.preferredNames.length;
    summary.rightPreferredCount += rightDay.preferredNames.length;

    const nameMatch = compareNameSets(leftDay.names, rightDay.names);
    const preferredMatch = compareNameSets(leftDay.preferredNames, rightDay.preferredNames);

    summary.sharedNameCount += nameMatch.shared.length;
    summary.sharedPreferredCount += preferredMatch.shared.length;

    incrementMatchCounters(summary, nameMatch.type, "Name");
    incrementMatchCounters(summary, preferredMatch.type, "Preferred");

    if (nameMatch.type !== "exact") {
      differences.nameMismatchDays.push(
        buildMismatchEntry({
          monthDay,
          leftDay,
          rightDay,
          match: nameMatch,
          field: "names",
          labels,
        })
      );
    }

    if (preferredMatch.type !== "exact") {
      differences.preferredMismatchDays.push(
        buildMismatchEntry({
          monthDay,
          leftDay,
          rightDay,
          match: preferredMatch,
          field: "preferredNames",
          labels,
        })
      );
    }
  }

  summary.leftNameCoverageRate = ratio(summary.sharedNameCount, summary.leftNameCount);
  summary.rightNameCoverageRate = ratio(summary.sharedNameCount, summary.rightNameCount);
  summary.leftPreferredCoverageRate = ratio(
    summary.sharedPreferredCount,
    summary.leftPreferredCount
  );
  summary.rightPreferredCoverageRate = ratio(
    summary.sharedPreferredCount,
    summary.rightPreferredCount
  );

  differences.sortedNameMismatchDays = buildSortedMismatchDays(differences.nameMismatchDays);
  differences.sortedPreferredMismatchDays = buildSortedMismatchDays(
    differences.preferredMismatchDays
  );

  return {
    labels,
    summary,
    differences,
  };
}

function buildRegistryMap(payload) {
  if (!Array.isArray(payload.days)) {
    throw new Error("A primerjegyzék payload nem tartalmaz érvényes days tömböt.");
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object" || typeof day.monthDay !== "string") {
      throw new Error("A primerjegyzék napi bejegyzéséből hiányzik egy érvényes monthDay mező.");
    }

    if (!Array.isArray(day.names) || !Array.isArray(day.preferredNames)) {
      throw new Error(`A primerjegyzék napi bejegyzéséből hiányzik a names vagy a preferredNames: ${day.monthDay}`);
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

function buildMismatchEntry({ monthDay, leftDay, rightDay, match, field, labels }) {
  return {
    monthDay,
    type: match.type,
    typeLabel: formatMatchType(match.type, labels),
    mismatchCount: match.mismatchCount,
    left: leftDay[field],
    right: rightDay[field],
    shared: match.shared,
    onlyLeft: match.onlyLeft,
    onlyRight: match.onlyRight,
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

function formatMatchType(type, labels) {
  if (type === "exact") {
    return "pontos egyezés";
  }

  if (type === "overlap") {
    return "részleges átfedés";
  }

  if (type === "left-only") {
    return `csak ${labels.leftLabel}`;
  }

  if (type === "right-only") {
    return `csak ${labels.rightLabel}`;
  }

  return "teljes eltérés";
}

function buildSortedMismatchDays(entries) {
  return entries.slice().sort((left, right) => {
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
  });
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
  printKeyValueTable("Források", [
    ["Normalizált registry", report.normalizedPath],
    ["Legacy registry", report.legacyPath],
    ["Wiki registry", report.wikiPath],
    ["Riport", report.reportPath],
  ], {
    keyWidth: 20,
    valueWidth: 90,
  });

  if (report.normalizer.summary || report.normalizer.stats) {
    printKeyValueTable("PRIMER NORMALIZÁLÓ", [
      ["Napok", report.normalizer.stats?.dayCount ?? "—"],
      ["Primer nevek", report.normalizer.stats?.preferredNameCount ?? "—"],
      ["Legacyből közvetlenül", report.normalizer.summary?.directFromLegacy ?? "—"],
      ["Adatbázisból közvetlenül", report.normalizer.summary?.directFromDatabase ?? "—"],
      ["Kézi szökőéves felülbírálás", report.normalizer.summary?.manualLeapOverride ?? "—"],
      ["Kézi átnézésre vár", report.normalizer.summary?.manualConflictReview ?? "—"],
      ["Függőben maradt", report.normalizer.summary?.unresolved ?? "—"],
      ["Review queue", report.normalizer.reviewQueueLength],
    ], {
      keyWidth: 42,
      valueWidth: 64,
    });
  }

  printComparisonSection(
    "NORMALIZÁLT VS. LEGACY REGISTRY",
    report.comparisons.legacy,
    "Normalizált",
    "Legacy"
  );
  printComparisonSection(
    "NORMALIZÁLT VS. WIKI REGISTRY",
    report.comparisons.wiki,
    "Normalizált",
    "Wiki"
  );
}

function printComparisonSection(title, comparison, leftLabel, rightLabel) {
  printKeyValueTable(title, [
    [`${leftLabel} napok`, comparison.summary.leftDayCount],
    [`${rightLabel} napok`, comparison.summary.rightDayCount],
    ["Közös napok", comparison.summary.sharedDayCount],
    [`Csak ${comparison.labels.leftLabel} napok`, comparison.summary.leftOnlyDayCount],
    [`Csak ${comparison.labels.rightLabel} napok`, comparison.summary.rightOnlyDayCount],
    ["Pontos névegyezésű napok", comparison.summary.exactNameMatchDayCount],
    ["Részleges névátfedésű napok", comparison.summary.overlapNameMatchDayCount],
    ["Teljes néveltérésű napok", comparison.summary.disjointNameMatchDayCount],
    [
      `${leftLabel} névfedés ${comparison.labels.rightLabel}hez képest`,
      `${comparison.summary.sharedNameCount}/${comparison.summary.leftNameCount} (${comparison.summary.leftNameCoverageRate})`,
    ],
    [
      `${rightLabel} névfedés ${comparison.labels.leftLabel}hoz képest`,
      `${comparison.summary.sharedNameCount}/${comparison.summary.rightNameCount} (${comparison.summary.rightNameCoverageRate})`,
    ],
    ["Pontos primer-egyezésű napok", comparison.summary.exactPreferredMatchDayCount],
    ["Részleges primerátfedésű napok", comparison.summary.overlapPreferredMatchDayCount],
    ["Teljes primereltérésű napok", comparison.summary.disjointPreferredMatchDayCount],
    [
      `${leftLabel} primerfedés ${comparison.labels.rightLabel}hez képest`,
      `${comparison.summary.sharedPreferredCount}/${comparison.summary.leftPreferredCount} (${comparison.summary.leftPreferredCoverageRate})`,
    ],
    [
      `${rightLabel} primerfedés ${comparison.labels.leftLabel}hoz képest`,
      `${comparison.summary.sharedPreferredCount}/${comparison.summary.rightPreferredCount} (${comparison.summary.rightPreferredCoverageRate})`,
    ],
  ], {
    keyWidth: 42,
    valueWidth: 64,
  });

  printDataTable(
    `${title} — primereltérésű napok`,
    [
      { key: "monthDay", title: "Nap", width: 7 },
      { key: "typeLabel", title: "Eltérés", width: 18 },
      { key: "left", title: leftLabel, width: 26, value: (row) => formatNameList(row.left, { maxItems: 4, maxLength: 26 }) },
      { key: "right", title: rightLabel, width: 26, value: (row) => formatNameList(row.right, { maxItems: 4, maxLength: 26 }) },
      {
        key: "note",
        title: "Részletek",
        width: 48,
        value: (row) =>
          formatDiffNote({
            shared: row.shared,
            onlyLeft: row.onlyLeft,
            onlyRight: row.onlyRight,
            leftLabel: comparison.labels.leftLabel,
            rightLabel: comparison.labels.rightLabel,
          }),
      },
    ],
    comparison.differences.sortedPreferredMismatchDays
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

    if (arg === "--normalized" && argv[index + 1]) {
      options.normalized = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--normalized=")) {
      options.normalized = arg.slice("--normalized=".length);
      continue;
    }

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
