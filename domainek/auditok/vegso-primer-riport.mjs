// domainek/auditok/vegso-primer-riport.mjs
// A végső primerjegyzék teljes diagnosztikai riportja.
import fs from "node:fs/promises";
import path from "node:path";
import {
  areNameListsExactlyEqual,
  areNameSetsEqual,
  DEFAULT_FINAL_PRIMARY_REGISTRY_PATH,
  DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH,
  DEFAULT_PRIMARY_REGISTRY_OVERRIDES_PATH,
  DEFAULT_WIKI_PRIMARY_REGISTRY_PATH,
  loadPrimaryRegistry,
  loadPrimaryRegistryOverrides,
  normalizeNameForMatch,
} from "../primer/alap.mjs";
import {
  formatNameList,
  printDataTable,
  printKeyValueTable,
  styleText,
} from "../../kozos/terminal-tabla.mjs";
import {
  betoltStrukturaltFajl,
  mentStrukturaltFajl,
} from "../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";

const DEFAULT_NORMALIZED_REGISTRY_PATH = kanonikusUtvonalak.primer.normalizaloRiport;
const DEFAULT_INPUT_PATH = kanonikusUtvonalak.adatbazis.nevnapok;
const DEFAULT_REPORT_PATH = kanonikusUtvonalak.riportok.vegsoPrimer;
const MONTH_NAMES = [
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
const EXPECTED_OVERRIDE_MONTH_DAYS = [
  "01-01",
  "01-02",
  "02-13",
  "02-21",
  "04-21",
  "04-27",
  "05-01",
  "05-09",
  "05-24",
  "06-03",
  "06-05",
  "06-07",
  "06-17",
  "07-28",
  "07-29",
  "08-26",
  "09-23",
  "10-07",
  "10-14",
  "10-20",
  "10-23",
  "11-02",
  "12-03",
  "12-11",
  "12-16",
];
const SAMPLE_EXPECTATIONS = new Map([
  ["01-01", ["Fruzsina"]],
  ["01-02", ["Ábel"]],
  ["02-13", ["Ella", "Linda", "Levente"]],
  ["10-23", ["Gyöngyvér", "Gyöngyi"]],
  ["11-02", ["Achillesz"]],
]);
const collator = new Intl.Collator("hu", { sensitivity: "base", numeric: true });
const args = parseArgs(process.argv.slice(2));

async function main() {
  const finalRegistryPath = path.resolve(
    process.cwd(),
    args.final ?? DEFAULT_FINAL_PRIMARY_REGISTRY_PATH
  );
  const legacyRegistryPath = path.resolve(
    process.cwd(),
    args.legacy ?? DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH
  );
  const wikiRegistryPath = path.resolve(
    process.cwd(),
    args.wiki ?? DEFAULT_WIKI_PRIMARY_REGISTRY_PATH
  );
  const normalizedRegistryPath = path.resolve(
    process.cwd(),
    args.normalized ?? DEFAULT_NORMALIZED_REGISTRY_PATH
  );
  const inputPath = path.resolve(process.cwd(), args.input ?? DEFAULT_INPUT_PATH);
  const overridesPath = path.resolve(
    process.cwd(),
    args.overrides ?? DEFAULT_PRIMARY_REGISTRY_OVERRIDES_PATH
  );
  const reportPath = path.resolve(process.cwd(), args.report ?? DEFAULT_REPORT_PATH);

  const [
    finalRegistry,
    legacyRegistry,
    wikiRegistry,
    normalizedRegistry,
    overridesRegistry,
    inputPayload,
  ] = await Promise.all([
    loadPrimaryRegistry(finalRegistryPath),
    loadPrimaryRegistry(legacyRegistryPath),
    loadPrimaryRegistry(wikiRegistryPath),
    loadPrimaryRegistry(normalizedRegistryPath),
    loadPrimaryRegistryOverrides(overridesPath),
    readJson(inputPath),
  ]);

  const report = buildFinalPrimaryRegistryReport({
    finalRegistryPayload: finalRegistry.payload,
    legacyRegistryPayload: legacyRegistry.payload,
    wikiRegistryPayload: wikiRegistry.payload,
    normalizedRegistryPayload: normalizedRegistry.payload,
    overridesPayload: overridesRegistry.payload,
    inputPayload,
    inputs: {
      finalRegistryPath,
      legacyRegistryPath,
      wikiRegistryPath,
      normalizedRegistryPath,
      inputPath,
      overridesPath,
    },
  });

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await mentStrukturaltFajl(reportPath, report);

  printReport(report);

  if (report.validations.hardFailureCount > 0) {
    process.exitCode = 1;
  }
}

function buildFinalPrimaryRegistryReport({
  finalRegistryPayload,
  legacyRegistryPayload,
  wikiRegistryPayload,
  normalizedRegistryPayload,
  overridesPayload,
  inputPayload,
  inputs,
}) {
  const finalMap = buildRegistryMap(finalRegistryPayload, { includeMetadata: true });
  const legacyMap = buildRegistryMap(legacyRegistryPayload);
  const wikiMap = buildRegistryMap(wikiRegistryPayload);
  const normalizedMap = buildRegistryMap(normalizedRegistryPayload, { includeMetadata: true });
  const overrideMap = buildOverrideMap(overridesPayload);
  const rawDayMap = buildRawDayMap(inputPayload);
  const allMonthDays = Array.from(new Set([...finalMap.keys(), ...legacyMap.keys(), ...wikiMap.keys()])).sort(
    compareMonthDays
  );
  const finalPrimaryUniverse = new Set();

  for (const day of finalMap.values()) {
    for (const name of day.preferredNames) {
      finalPrimaryUniverse.add(normalizeNameForMatch(name));
    }
  }

  const months = MONTH_NAMES.map((monthName, index) => ({
    month: index + 1,
    monthName,
    rows: [],
  }));

  for (const monthDay of allMonthDays) {
    const finalDay = finalMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const legacyDay = legacyMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const wikiDay = wikiMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const normalizedDay = normalizedMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const rawDay = rawDayMap.get(monthDay) ?? createRawEmptyDayEntry(monthDay);
    const overrideDay = overrideMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const hidden = rawDay.names.filter(
      (name) => !finalPrimaryUniverse.has(normalizeNameForMatch(name))
    );
    const row = {
      month: finalDay.month,
      day: finalDay.day,
      monthDay,
      names: [...finalDay.names],
      preferredNames: [...finalDay.preferredNames],
      legacy: [...legacyDay.preferredNames],
      wiki: [...wikiDay.preferredNames],
      override: [...overrideDay.preferredNames],
      normalized: [...normalizedDay.preferredNames],
      ranking: [...rawDay.primaryRanked],
      hidden: uniqueSorted(hidden),
      source: finalDay.source ?? null,
      warning: Boolean(finalDay.warning),
    };

    months[row.month - 1].rows.push(row);
  }

  const validations = buildValidations({
    finalPayload: finalRegistryPayload,
    finalMap,
    legacyMap,
    wikiMap,
    overridePayload: overridesPayload,
    overrideMap,
  });
  const neverPrimary = buildNeverPrimaryList({ inputPayload, finalPrimaryUniverse });
  const neverPrimarySimilarPrimary = buildNeverPrimarySimilarPrimaryReport({
    neverPrimary,
    inputPayload,
    finalMap,
    rawDayMap,
  });
  const summary = buildSummary({
    months,
    finalMap,
    legacyMap,
    wikiMap,
    normalizedMap,
    rawDayMap,
    neverPrimary,
    neverPrimarySimilarPrimary,
  });
  const neverPrimaryByMonth = buildNeverPrimaryByMonth(neverPrimary);

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      finalRegistryPath: path.relative(process.cwd(), inputs.finalRegistryPath),
      legacyRegistryPath: path.relative(process.cwd(), inputs.legacyRegistryPath),
      wikiRegistryPath: path.relative(process.cwd(), inputs.wikiRegistryPath),
      normalizedRegistryPath: path.relative(process.cwd(), inputs.normalizedRegistryPath),
      inputPath: path.relative(process.cwd(), inputs.inputPath),
      overridesPath: path.relative(process.cwd(), inputs.overridesPath),
    },
    finalRegistryStats: finalRegistryPayload.stats ?? null,
    validations,
    months,
    leapWindow: months[1].rows.filter((row) => row.monthDay >= "02-24" && row.monthDay <= "02-29"),
    summary,
    neverPrimaryByMonth,
    neverPrimarySimilarPrimary,
  };
}

function buildValidations({ finalPayload, finalMap, legacyMap, wikiMap, overridePayload, overrideMap }) {
  const overrideDuplicates = findDuplicateMonthDays(overridePayload?.days ?? []);
  const mismatchMonthDays = [];

  for (const monthDay of Array.from(new Set([...legacyMap.keys(), ...wikiMap.keys()])).sort(compareMonthDays)) {
    const legacyDay = legacyMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const wikiDay = wikiMap.get(monthDay) ?? createEmptyDayEntry(monthDay);

    if (!areNameSetsEqual(legacyDay.preferredNames, wikiDay.preferredNames)) {
      mismatchMonthDays.push(monthDay);
    }
  }

  const overrideMonthDays = Array.from(overrideMap.keys()).sort(compareMonthDays);
  const invalidOverrideNames = [];

  for (const monthDay of overrideMonthDays) {
    const legacyDay = legacyMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const wikiDay = wikiMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const allowedNames = new Set(
      [...legacyDay.preferredNames, ...wikiDay.preferredNames].map(normalizeNameForMatch)
    );

    for (const name of overrideMap.get(monthDay)?.preferredNames ?? []) {
      if (!allowedNames.has(normalizeNameForMatch(name))) {
        invalidOverrideNames.push({ monthDay, name });
      }
    }
  }

  const missingOverrideDays = mismatchMonthDays.filter((monthDay) => !overrideMap.has(monthDay));
  const extraOverrideDays = overrideMonthDays.filter((monthDay) => !mismatchMonthDays.includes(monthDay));
  const unexpectedMismatchDays = mismatchMonthDays.filter(
    (monthDay) => !EXPECTED_OVERRIDE_MONTH_DAYS.includes(monthDay)
  );
  const missingExpectedOverrideDays = EXPECTED_OVERRIDE_MONTH_DAYS.filter(
    (monthDay) => !overrideMap.has(monthDay)
  );
  const sampleChecks = Array.from(SAMPLE_EXPECTATIONS.entries()).map(([monthDay, expectedNames]) => {
    const actualNames = finalMap.get(monthDay)?.preferredNames ?? [];
    const ok = areNameListsExactlyEqual(actualNames, expectedNames);

    return {
      monthDay,
      expectedNames,
      actualNames,
      ok,
    };
  });

  const hardFailures = [];

  if ((finalPayload?.stats?.dayCount ?? finalMap.size) !== 366) {
    hardFailures.push("A végső primer registry nem 366 napos.");
  }

  if ((finalPayload?.stats?.warningUnionDayCount ?? null) !== 0) {
    hardFailures.push("A warning-union napok száma nem nulla.");
  }

  if (overrideDuplicates.length > 0) {
    hardFailures.push("Duplikált override dátum található.");
  }

  if (invalidOverrideNames.length > 0) {
    hardFailures.push("Van olyan override név, amely nem szerepel a legacy/wiki primerforrásban.");
  }

  if (missingOverrideDays.length > 0 || extraOverrideDays.length > 0) {
    hardFailures.push("Az override dátumkészlet nem fedi pontosan a legacy–wiki primereltéréseket.");
  }

  if (unexpectedMismatchDays.length > 0 || missingExpectedOverrideDays.length > 0) {
    hardFailures.push("A jelenlegi primereltéréses napok listája eltér a rögzített 25 napos igazságtáblától.");
  }

  if (sampleChecks.some((entry) => !entry.ok)) {
    hardFailures.push("A kötelező mintanapok közül legalább egy nem a várt primereket adja.");
  }

  return {
    overrideDayCount: overrideMonthDays.length,
    overrideDuplicates,
    mismatchMonthDays,
    overrideMonthDays,
    invalidOverrideNames,
    missingOverrideDays,
    extraOverrideDays,
    unexpectedMismatchDays,
    missingExpectedOverrideDays,
    sampleChecks,
    hardFailures,
    hardFailureCount: hardFailures.length,
  };
}

function buildNeverPrimarySimilarPrimaryReport({ neverPrimary, inputPayload, finalMap, rawDayMap }) {
  const nameRecords = buildNameRecordMap(inputPayload);
  const reverseLinks = buildReverseLinkMap(nameRecords);
  const finalPrimaryByName = buildFinalPrimaryByNameMap(finalMap);
  const finalPrimaryNameSet = new Set(finalPrimaryByName.keys());
  const matched = [];
  const unmatched = [];

  for (const entry of neverPrimary) {
    const normalizedHidden = normalizeNameForMatch(entry.name);
    const record = nameRecords.get(normalizedHidden) ?? null;
    const directLinks = uniqueKeepOrder([
      ...(record?.relatedNames ?? []),
      ...(record?.nicknames ?? []),
    ]);
    const reverseLinksForName = Array.from(reverseLinks.get(normalizedHidden) ?? []);
    const candidateMap = new Map();

    for (const candidateName of directLinks) {
      const normalizedCandidate = normalizeNameForMatch(candidateName);

      if (!finalPrimaryNameSet.has(normalizedCandidate)) {
        continue;
      }

      const current = candidateMap.get(normalizedCandidate) ?? createSimilarPrimaryCandidate(candidateName);
      current.reasons.add("saját rokon/becézés");
      candidateMap.set(normalizedCandidate, current);
    }

    for (const candidateName of reverseLinksForName) {
      const normalizedCandidate = normalizeNameForMatch(candidateName);

      if (!finalPrimaryNameSet.has(normalizedCandidate)) {
        continue;
      }

      const current = candidateMap.get(normalizedCandidate) ?? createSimilarPrimaryCandidate(candidateName);
      current.reasons.add("visszahivatkozás");
      candidateMap.set(normalizedCandidate, current);
    }

    const candidates = Array.from(candidateMap.entries())
      .map(([normalizedCandidate, candidate]) => {
        const primaryDays = finalPrimaryByName.get(normalizedCandidate) ?? [];
        const dayDetails = primaryDays.map((monthDay) => {
          const finalDay = finalMap.get(monthDay);
          const rawDay = rawDayMap.get(monthDay) ?? { names: [] };
          const totalNamedays = rawDay.names.length;
          const primaryCount = finalDay?.preferredNames?.length ?? 0;
          const otherNamedayCount = Math.max(0, totalNamedays - 1);

          return {
            monthDay,
            primaryCount,
            totalNamedayCount: totalNamedays,
            otherNamedayCount,
            primaryNames: [...(finalDay?.preferredNames ?? [])],
          };
        });
        const singlePrimaryDayCount = dayDetails.filter((detail) => detail.primaryCount === 1).length;
        const primaryCountSummary = summarizePrimaryCounts(dayDetails);
        const otherNamedaySummary = summarizeOtherNamedays(dayDetails);

        return {
          primaryName: candidate.primaryName,
          relation: Array.from(candidate.reasons).sort((left, right) => collator.compare(left, right)).join(" • "),
          primaryMonthDays: primaryDays,
          primaryDateCount: primaryDays.length,
          singlePrimaryDayCount,
          primaryCountSummary,
          otherNamedaySummary,
          dayDetails,
        };
      })
      .sort((left, right) => {
        if (right.singlePrimaryDayCount != left.singlePrimaryDayCount) {
          return right.singlePrimaryDayCount - left.singlePrimaryDayCount;
        }

        if (left.primaryDateCount != right.primaryDateCount) {
          return left.primaryDateCount - right.primaryDateCount;
        }

        return collator.compare(left.primaryName, right.primaryName);
      });

    if (candidates.length > 0) {
      matched.push({
        name: entry.name,
        dayCount: entry.dayCount,
        monthDays: entry.monthDays,
        candidates,
      });
    } else {
      unmatched.push(entry);
    }
  }

  return {
    matched,
    unmatched,
    flattenedRows: matched.flatMap((entry) =>
      entry.candidates.map((candidate) => ({
        hiddenName: entry.name,
        hiddenDayCount: entry.dayCount,
        hiddenMonthDays: entry.monthDays,
        primaryName: candidate.primaryName,
        relation: candidate.relation,
        primaryMonthDays: candidate.primaryMonthDays,
        primaryDateCount: candidate.primaryDateCount,
        singlePrimaryDayCount: candidate.singlePrimaryDayCount,
        primaryCountSummary: candidate.primaryCountSummary,
        otherNamedaySummary: candidate.otherNamedaySummary,
        dayDetails: candidate.dayDetails,
      }))
    ),
  };
}

function createSimilarPrimaryCandidate(primaryName) {
  return {
    primaryName,
    reasons: new Set(),
  };
}

function buildNameRecordMap(inputPayload) {
  const map = new Map();

  for (const entry of inputPayload?.names ?? []) {
    const name = String(entry?.name ?? "").trim();

    if (!name) {
      continue;
    }

    map.set(normalizeNameForMatch(name), {
      name,
      relatedNames: sanitizeLinkedNames(entry.relatedNames ?? []),
      nicknames: sanitizeLinkedNames(entry.nicknames ?? []),
    });
  }

  return map;
}

function buildReverseLinkMap(nameRecords) {
  const reverse = new Map();

  for (const record of nameRecords.values()) {
    const allLinks = uniqueKeepOrder([...(record.relatedNames ?? []), ...(record.nicknames ?? [])]);

    for (const linkedName of allLinks) {
      const normalizedLinked = normalizeNameForMatch(linkedName);

      if (!normalizedLinked) {
        continue;
      }

      if (!reverse.has(normalizedLinked)) {
        reverse.set(normalizedLinked, new Set());
      }

      reverse.get(normalizedLinked).add(record.name);
    }
  }

  return reverse;
}

function buildFinalPrimaryByNameMap(finalMap) {
  const map = new Map();

  for (const day of finalMap.values()) {
    for (const name of day.preferredNames) {
      const normalized = normalizeNameForMatch(name);

      if (!map.has(normalized)) {
        map.set(normalized, []);
      }

      map.get(normalized).push(day.monthDay);
    }
  }

  for (const [normalized, monthDays] of map.entries()) {
    map.set(normalized, uniqueKeepOrder(monthDays).sort(compareMonthDays));
  }

  return map;
}

function sanitizeLinkedNames(values) {
  return uniqueKeepOrder(
    (Array.isArray(values) ? values : []).filter((value) => /[\p{L}\p{N}]/u.test(String(value ?? "")))
  );
}

function summarizePrimaryCounts(dayDetails) {
  const counts = new Map();

  for (const detail of dayDetails) {
    counts.set(detail.primaryCount, (counts.get(detail.primaryCount) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort((left, right) => left[0] - right[0])
    .map(([primaryCount, dayCount]) => `${primaryCount}p×${dayCount}`)
    .join(" • ");
}

function summarizeOtherNamedays(dayDetails) {
  if (dayDetails.length === 0) {
    return "—";
  }

  const values = dayDetails.map((detail) => detail.otherNamedayCount);
  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return `${min}`;
  }

  return `${min}–${max}`;
}

function buildSummary({
  months,
  finalMap,
  legacyMap,
  wikiMap,
  normalizedMap,
  rawDayMap,
  neverPrimary,
  neverPrimarySimilarPrimary,
}) {
  const rows = months.flatMap((month) => month.rows);
  const finalPrimaryCounts = buildNameCountMap(rows.map((row) => row.preferredNames));
  const legacyPrimaryCounts = buildNameCountMap(rows.map((row) => row.legacy));
  const wikiPrimaryCounts = buildNameCountMap(rows.map((row) => row.wiki));
  const normalizedPrimaryCounts = buildNameCountMap(rows.map((row) => row.normalized));
  const rankingPrimaryCounts = buildNameCountMap(rows.map((row) => row.ranking));
  const hiddenCounts = buildNameCountMap(rows.map((row) => row.hidden));
  const allNamedayCounts = buildNameCountMap(
    rows.map((row) => rawDayMap.get(row.monthDay)?.names ?? [])
  );

  const metricExtremes = {
    namedays: buildCountExtremes(allNamedayCounts),
    primaryRegistry: buildCountExtremes(finalPrimaryCounts),
    legacy: buildCountExtremes(legacyPrimaryCounts),
    wiki: buildCountExtremes(wikiPrimaryCounts),
    normalized: buildCountExtremes(normalizedPrimaryCounts),
    ranking: buildCountExtremes(rankingPrimaryCounts),
    hidden: buildCountExtremes(hiddenCounts),
  };

  const dailyDistributions = {
    "primary-registry": buildDailyDistribution(rows.map((row) => row.preferredNames.length)),
    legacy: buildDailyDistribution(rows.map((row) => row.legacy.length)),
    wiki: buildDailyDistribution(rows.map((row) => row.wiki.length)),
    normalized: buildDailyDistribution(rows.map((row) => row.normalized.length)),
    ranking: buildDailyDistribution(rows.map((row) => row.ranking.length)),
    hidden: buildDailyDistribution(rows.map((row) => row.hidden.length)),
  };

  return {
    metricExtremes,
    dailyDistributions,
    neverPrimaryCount: neverPrimary.length,
    neverPrimary,
    neverPrimaryWithSimilarPrimaryCount: neverPrimarySimilarPrimary.matched.length,
    neverPrimaryWithoutSimilarPrimaryCount: neverPrimarySimilarPrimary.unmatched.length,
  };
}

function buildRegistryMap(payload, options = {}) {
  if (!Array.isArray(payload?.days)) {
    throw new Error("A primer registry payload nem tartalmaz érvényes days tömböt.");
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object" || typeof day.monthDay !== "string") {
      throw new Error("Érvénytelen napi primer registry bejegyzés.");
    }

    if (map.has(day.monthDay)) {
      throw new Error(`Duplikált primer registry nap: ${day.monthDay}`);
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

function buildOverrideMap(payload) {
  if (!Array.isArray(payload?.days)) {
    throw new Error("Az override payload nem tartalmaz érvényes days tömböt.");
  }

  const map = new Map();

  for (const day of payload.days) {
    map.set(day.monthDay, {
      month: Number(day.month),
      day: Number(day.day),
      monthDay: day.monthDay,
      preferredNames: uniqueKeepOrder(day.preferredNames ?? []),
    });
  }

  return map;
}

function buildRawDayMap(payload) {
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

      const bucket = map.get(monthDay) ?? {
        month: Number(dayEntry.month),
        day: Number(dayEntry.day),
        monthDay,
        names: [],
        primaryRanked: [],
      };

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

function buildNeverPrimaryList({ inputPayload, finalPrimaryUniverse }) {
  const entries = [];

  for (const nameEntry of inputPayload?.names ?? []) {
    const name = String(nameEntry?.name ?? "").trim();
    const days = Array.isArray(nameEntry?.days)
      ? nameEntry.days
          .map((dayEntry) => String(dayEntry?.monthDay ?? "").trim())
          .filter(Boolean)
      : [];

    if (!name || days.length === 0) {
      continue;
    }

    if (finalPrimaryUniverse.has(normalizeNameForMatch(name))) {
      continue;
    }

    entries.push({
      name,
      dayCount: days.length,
      monthDays: uniqueKeepOrder(days).sort(compareMonthDays),
    });
  }

  return entries.sort((left, right) => {
    if (right.dayCount !== left.dayCount) {
      return right.dayCount - left.dayCount;
    }

    return collator.compare(left.name, right.name);
  });
}

function buildNeverPrimaryByMonth(neverPrimary) {
  return MONTH_NAMES.map((monthName, index) => {
    const month = index + 1;
    const monthPrefix = `${String(month).padStart(2, "0")}-`;
    const entries = neverPrimary
      .map((entry) => {
        const monthDays = entry.monthDays.filter((monthDay) => monthDay.startsWith(monthPrefix));

        if (monthDays.length === 0) {
          return null;
        }

        return {
          name: entry.name,
          dayCount: monthDays.length,
          monthDays,
        };
      })
      .filter(Boolean)
      .sort((left, right) => {
        if (right.dayCount !== left.dayCount) {
          return right.dayCount - left.dayCount;
        }

        return collator.compare(left.name, right.name);
      });

    return {
      month,
      monthName,
      entryCount: entries.length,
      entries,
    };
  });
}

function buildNameCountMap(dayLists) {
  const counts = new Map();

  for (const dayList of dayLists) {
    for (const name of dayList) {
      const normalized = normalizeNameForMatch(name);
      const current = counts.get(normalized);

      if (current) {
        current.count += 1;
      } else {
        counts.set(normalized, {
          name,
          count: 1,
        });
      }
    }
  }

  return counts;
}

function buildCountExtremes(countMap) {
  const entries = Array.from(countMap.values()).sort((left, right) => {
    if (left.count !== right.count) {
      return right.count - left.count;
    }

    return collator.compare(left.name, right.name);
  });

  if (entries.length === 0) {
    return {
      totalNames: 0,
      maxCount: 0,
      maxNames: [],
      minPositiveCount: 0,
      minPositiveNames: [],
    };
  }

  const maxCount = entries[0].count;
  const minPositiveCount = entries[entries.length - 1].count;

  return {
    totalNames: entries.length,
    maxCount,
    maxNames: entries.filter((entry) => entry.count === maxCount).map((entry) => entry.name),
    minPositiveCount,
    minPositiveNames: entries
      .filter((entry) => entry.count === minPositiveCount)
      .map((entry) => entry.name),
  };
}

function buildDailyDistribution(lengths) {
  const distribution = new Map();

  for (const length of lengths) {
    distribution.set(length, (distribution.get(length) ?? 0) + 1);
  }

  return Array.from(distribution.entries())
    .map(([size, dayCount]) => ({
      size,
      dayCount,
    }))
    .sort((left, right) => left.size - right.size);
}

function createEmptyDayEntry(monthDay) {
  const [month, day] = monthDay.split("-").map(Number);

  return {
    month,
    day,
    monthDay,
    names: [],
    preferredNames: [],
    source: null,
    warning: false,
    legacyNames: [],
    wikiNames: [],
    overrideNames: [],
  };
}

function createRawEmptyDayEntry(monthDay) {
  const [month, day] = monthDay.split("-").map(Number);

  return {
    month,
    day,
    monthDay,
    names: [],
    primaryRanked: [],
  };
}

function compareMonthDays(left, right) {
  return left.localeCompare(right, "hu");
}

function uniqueKeepOrder(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeNameForMatch(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(String(value));
  }

  return result;
}

function uniqueSorted(values) {
  return uniqueKeepOrder(values).sort((left, right) => collator.compare(left, right));
}

function findDuplicateMonthDays(days) {
  const seen = new Set();
  const duplicates = [];

  for (const day of days) {
    const monthDay = String(day?.monthDay ?? "").trim();

    if (!monthDay) {
      continue;
    }

    if (seen.has(monthDay)) {
      duplicates.push(monthDay);
      continue;
    }

    seen.add(monthDay);
  }

  return uniqueSorted(duplicates);
}

function printReport(report) {
  printKeyValueTable(
    "Végső primer registry – források",
    [
      ["Végső primer registry", report.inputs.finalRegistryPath],
      ["Legacy registry", report.inputs.legacyRegistryPath],
      ["Wiki registry", report.inputs.wikiRegistryPath],
      ["Normalized registry", report.inputs.normalizedRegistryPath],
      ["Névadatbázis", report.inputs.inputPath],
      ["Override fájl", report.inputs.overridesPath],
    ],
    { titleStyle: ["bold", "cyan"] }
  );

  printKeyValueTable(
    "Validációs összegzés",
    [
      ["Végső napok száma", report.finalRegistryStats?.dayCount ?? report.months.flatMap((m) => m.rows).length],
      ["Warning-union napok", report.finalRegistryStats?.warningUnionDayCount ?? "—"],
      ["Override napok", report.validations.overrideDayCount],
      ["Legacy–wiki primereltéréses napok", report.validations.mismatchMonthDays.length],
      ["Duplikált override napok", formatNameList(report.validations.overrideDuplicates, { maxItems: 8, maxLength: 48 })],
      ["Hiányzó override napok", formatNameList(report.validations.missingOverrideDays, { maxItems: 8, maxLength: 48 })],
      ["Extra override napok", formatNameList(report.validations.extraOverrideDays, { maxItems: 8, maxLength: 48 })],
      ["Érvénytelen override nevek", report.validations.invalidOverrideNames.length],
      ["Primary nélkül maradó nevek", report.summary.neverPrimaryCount],
      ["Ebből hasonló primerrel", report.summary.neverPrimaryWithSimilarPrimaryCount],
      ["Ebből hasonló primer nélkül", report.summary.neverPrimaryWithoutSimilarPrimaryCount],
      ["Kemény hibák", report.validations.hardFailureCount],
    ],
    { titleStyle: ["bold", "cyan"] }
  );

  printDataTable(
    "Kötelező mintanapok",
    [
      { key: "monthDay", title: "Dátum", width: 7 },
      { key: "expected", title: "Elvárt", width: 26 },
      { key: "actual", title: "Tényleges", width: 26 },
      { key: "status", title: "Állapot", width: 10 },
    ],
    report.validations.sampleChecks.map((entry) => ({
      monthDay: entry.monthDay,
      expected: formatNameList(entry.expectedNames, { maxItems: 6, maxLength: 26 }),
      actual: formatNameList(entry.actualNames, { maxItems: 6, maxLength: 26 }),
      status: entry.ok ? "ok" : "hiba",
      _ok: entry.ok,
    })),
    {
      titleStyle: ["bold", "cyan"],
      rowStyle: (row) => (row._ok ? ["green"] : ["red", "bold"]),
    }
  );

  for (const month of report.months) {
    printMonthTable(month);

    if (month.month === 2) {
      printMonthTable(
        {
          month: 2,
          monthName: "Február 24–29 külön nézet",
          rows: report.leapWindow,
        },
        { compactTitle: true }
      );
    }
  }

  printSummary(report.summary);
  printNeverPrimary(report.summary);
  printNeverPrimaryByMonth(report.neverPrimaryByMonth);
  printNeverPrimarySimilarPrimary(report.neverPrimarySimilarPrimary);

  if (report.validations.hardFailures.length > 0) {
    console.log("");
    console.log(styleText("Kemény hibák:", ["bold", "red"]));

    for (const failure of report.validations.hardFailures) {
      console.log(styleText(`- ${failure}`, ["red"]));
    }
  }
}

function printMonthTable(month, options = {}) {
  printDataTable(
    options.compactTitle
      ? month.monthName
      : `${month.monthName} (${String(month.month).padStart(2, "0")})`,
    [
      { key: "date", title: "Dátum", width: 7 },
      { key: "names", title: "Nevek", width: 24 },
      { key: "legacy", title: "Legacy", width: 18 },
      { key: "wiki", title: "Wiki", width: 18 },
      { key: "normalized", title: "Normalized", width: 18 },
      { key: "ranking", title: "Ranking", width: 18 },
      { key: "hidden", title: "Rejtett", width: 24 },
    ],
    month.rows.map((row) => ({
      date: row.monthDay,
      names: formatNameList(row.names, { maxItems: 5, maxLength: 24 }),
      legacy: formatNameList(row.legacy, { maxItems: 4, maxLength: 18 }),
      wiki: formatNameList(row.wiki, { maxItems: 4, maxLength: 18 }),
      normalized: formatNameList(row.normalized, { maxItems: 4, maxLength: 18 }),
      ranking: formatNameList(row.ranking, { maxItems: 4, maxLength: 18 }),
      hidden: formatNameList(row.hidden, { maxItems: 5, maxLength: 24 }),
      _row: row,
    })),
    {
      titleStyle: ["bold", "cyan"],
      rowStyle: (row) => getMonthRowStyle(row._row),
    }
  );
}

function getMonthRowStyle(row) {
  if (!row.names.length && !row.legacy.length && !row.wiki.length) {
    return ["dim"];
  }

  if (row.source === "manual-override") {
    return ["yellow"];
  }

  if (row.source === "warning-union") {
    return ["red"];
  }

  if (
    row.source === "legacy-wiki-exact" &&
    areNameSetsEqual(row.preferredNames, row.legacy) &&
    areNameSetsEqual(row.preferredNames, row.wiki)
  ) {
    return ["green"];
  }

  return null;
}

function printSummary(summary) {
  printDataTable(
    "Névfrekvenciás szélsőértékek",
    [
      { key: "metric", title: "Metrika", width: 20 },
      { key: "maxCount", title: "Max", width: 5, align: "right" },
      { key: "maxNames", title: "Legtöbb nap", width: 30 },
      { key: "minCount", title: "Min", width: 5, align: "right" },
      { key: "minNames", title: "Legkevesebb nap", width: 30 },
    ],
    [
      ["Összes névnap", summary.metricExtremes.namedays],
      ["Végső primer", summary.metricExtremes.primaryRegistry],
      ["Legacy primer", summary.metricExtremes.legacy],
      ["Wiki primer", summary.metricExtremes.wiki],
      ["Normalized primer", summary.metricExtremes.normalized],
      ["Ranking primer", summary.metricExtremes.ranking],
      ["Rejtett", summary.metricExtremes.hidden],
    ].map(([metric, entry]) => ({
      metric,
      maxCount: entry.maxCount,
      maxNames: formatNameList(entry.maxNames, { maxItems: 5, maxLength: 30 }),
      minCount: entry.minPositiveCount,
      minNames: formatNameList(entry.minPositiveNames, { maxItems: 5, maxLength: 30 }),
    })),
    { titleStyle: ["bold", "cyan"] }
  );

  printDataTable(
    "Napi elemszám-eloszlás",
    [
      { key: "variant", title: "Variáció", width: 18 },
      { key: "size", title: "Napi elemszám", width: 12, align: "right" },
      { key: "dayCount", title: "Napok száma", width: 12, align: "right" },
    ],
    Object.entries(summary.dailyDistributions)
      .flatMap(([variant, rows]) =>
        rows.map((row) => ({
          variant,
          size: row.size,
          dayCount: row.dayCount,
        }))
      )
      .sort((left, right) => {
        const byVariant = collator.compare(left.variant, right.variant);

        if (byVariant !== 0) {
          return byVariant;
        }

        return left.size - right.size;
      }),
    { titleStyle: ["bold", "cyan"] }
  );
}

function printNeverPrimary(summary) {
  printDataTable(
    "Primary nélkül maradó nevek",
    [
      { key: "name", title: "Név", width: 22 },
      { key: "dayCount", title: "Napok", width: 7, align: "right" },
      { key: "monthDays", title: "Névnapjai", width: 42 },
    ],
    summary.neverPrimary.map((entry) => ({
      name: entry.name,
      dayCount: entry.dayCount,
      monthDays: formatNameList(entry.monthDays, { maxItems: 8, maxLength: 42 }),
    })),
    {
      titleStyle: ["bold", "magenta"],
      emptyMessage: "nincs",
    }
  );
}

function printNeverPrimarySimilarPrimary(report) {
  printKeyValueTable(
    "Primary nélkül maradó nevek – hasonló primer összegzés",
    [
      ["Hasonló primerrel rendelkező rejtett nevek", report.matched.length],
      ["Hasonló primer nélkül maradó rejtett nevek", report.unmatched.length],
      ["Összes hidden→primary kapcsolat", report.flattenedRows.length],
    ],
    { titleStyle: ["bold", "magenta"] }
  );

  printDataTable(
    "Primary nélkül maradó nevek – hasonló primerek",
    [
      { key: "hiddenName", title: "Rejtett név", width: 20 },
      { key: "hiddenDays", title: "Saját napok", width: 9, align: "right" },
      { key: "primaryName", title: "Hasonló primary", width: 20 },
      { key: "relation", title: "Kapcsolat", width: 18 },
      { key: "primaryDays", title: "Primary napjai", width: 24 },
      { key: "singlePrimary", title: "1 primeres", width: 10 },
      { key: "primaryCounts", title: "Primer darab", width: 16 },
      { key: "otherNamedays", title: "Egyéb névnap", width: 14 },
    ],
    report.flattenedRows.map((row) => ({
      hiddenName: row.hiddenName,
      hiddenDays: row.hiddenDayCount,
      primaryName: row.primaryName,
      relation: row.relation,
      primaryDays: formatNameList(row.primaryMonthDays, { maxItems: 6, maxLength: 24 }),
      singlePrimary: `${row.singlePrimaryDayCount}/${row.primaryDateCount}`,
      primaryCounts: row.primaryCountSummary,
      otherNamedays: row.otherNamedaySummary,
      _row: row,
    })),
    {
      titleStyle: ["bold", "magenta"],
      emptyMessage: "nincs hasonló primerkapcsolat",
      rowStyle: (row) => {
        if (row._row.singlePrimaryDayCount > 0) {
          return ["green"];
        }

        if (row._row.primaryDateCount <= 2) {
          return ["yellow"];
        }

        return null;
      },
    }
  );
}

function printNeverPrimaryByMonth(months) {
  for (const month of months) {
    if (month.entries.length === 0) {
      continue;
    }

    printDataTable(
      `Primary nélkül maradó nevek — ${month.monthName}`,
      [
        { key: "name", title: "Név", width: 22 },
        { key: "dayCount", title: "Napok", width: 7, align: "right" },
        { key: "monthDays", title: "Havi napok", width: 32 },
      ],
      month.entries.map((entry) => ({
        name: entry.name,
        dayCount: entry.dayCount,
        monthDays: formatNameList(entry.monthDays, { maxItems: 8, maxLength: 32 }),
      })),
      {
        titleStyle: ["bold", "magenta"],
      }
    );
  }
}

async function readJson(filePath) {
  return betoltStrukturaltFajl(filePath);
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--final" && argv[index + 1]) {
      options.final = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--final=")) {
      options.final = arg.slice("--final=".length);
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

    if (arg === "--normalized" && argv[index + 1]) {
      options.normalized = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--normalized=")) {
      options.normalized = arg.slice("--normalized=".length);
      continue;
    }

    if (arg === "--input" && argv[index + 1]) {
      options.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
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
