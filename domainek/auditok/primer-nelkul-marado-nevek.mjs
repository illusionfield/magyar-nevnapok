/**
 * domainek/auditok/primer-nelkul-marado-nevek.mjs
 * Külön audit a végső primerjegyzékből teljesen kimaradó normalizált és rangsorolt nevekre.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FINAL_PRIMARY_REGISTRY_PATH,
  loadPrimaryRegistry,
  normalizeNameForMatch,
} from "../primer/alap.mjs";
import {
  betoltStrukturaltFajl,
  mentStrukturaltFajl,
} from "../../kozos/strukturalt-fajl.mjs";
import {
  printKeyValueTable,
  printDataTable,
  styleText,
} from "../../kozos/terminal-tabla.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";
import {
  buildNameRecordMap,
  buildReverseLinkMap,
  gyujtKapcsolodoPrimereket,
} from "./kozos/primer-kapcsolatok.mjs";

const DEFAULT_NORMALIZED_REGISTRY_PATH = kanonikusUtvonalak.primer.normalizaloRiport;
const DEFAULT_INPUT_PATH = kanonikusUtvonalak.adatbazis.nevnapok;
const DEFAULT_REPORT_PATH = kanonikusUtvonalak.riportok.primerNelkulMaradoNevek;
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
const collator = new Intl.Collator("hu", { sensitivity: "base", numeric: true });
const args = parseArgs(process.argv.slice(2));

/**
 * A `main` a modul közvetlen futtatási belépési pontja.
 */
async function main() {
  const finalRegistryPath = path.resolve(
    process.cwd(),
    args.final ?? DEFAULT_FINAL_PRIMARY_REGISTRY_PATH
  );
  const normalizedRegistryPath = path.resolve(
    process.cwd(),
    args.normalized ?? DEFAULT_NORMALIZED_REGISTRY_PATH
  );
  const inputPath = path.resolve(process.cwd(), args.input ?? DEFAULT_INPUT_PATH);
  const reportPath = path.resolve(process.cwd(), args.report ?? DEFAULT_REPORT_PATH);

  const [finalRegistry, normalizedRegistry, inputPayload] = await Promise.all([
    loadPrimaryRegistry(finalRegistryPath),
    loadPrimaryRegistry(normalizedRegistryPath),
    betoltStrukturaltFajl(inputPath),
  ]);

  const report = buildPrimaryNelkulMaradoNevekRiport({
    finalRegistryPayload: finalRegistry.payload,
    normalizedRegistryPayload: normalizedRegistry.payload,
    inputPayload,
    inputs: {
      finalRegistryPath,
      normalizedRegistryPath,
      inputPath,
      reportPath,
    },
  });

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await mentStrukturaltFajl(reportPath, report);
  printReport(report);
}

/**
 * A `buildPrimaryNelkulMaradoNevekRiport` összeállítja a külön audit YAML-riportját.
 */
export function buildPrimaryNelkulMaradoNevekRiport({
  finalRegistryPayload,
  normalizedRegistryPayload,
  inputPayload,
  inputs,
}) {
  const finalMap = buildRegistryMap(finalRegistryPayload);
  const normalizedMap = buildRegistryMap(normalizedRegistryPayload);
  const rawDayMap = buildRawDayMap(inputPayload);
  const finalPrimaryUniverse = buildFinalPrimaryUniverse(finalMap);
  const nameRecords = buildNameRecordMap(inputPayload);
  const reverseLinks = buildReverseLinkMap(nameRecords);
  const allMonthDays = Array.from(
    new Set([...finalMap.keys(), ...normalizedMap.keys(), ...rawDayMap.keys()])
  ).sort(compareMonthDays);
  const months = MONTH_NAMES.map((monthName, index) => ({
    month: index + 1,
    monthName,
    rows: [],
  }));
  const uniqueMissingNames = new Set();
  const summary = {
    monthCount: 0,
    rowCount: 0,
    combinedMissingCount: 0,
    normalizedMissingCount: 0,
    rankingMissingCount: 0,
    combinedHighlightedCount: 0,
    normalizedHighlightedCount: 0,
    rankingHighlightedCount: 0,
    finalPrimaryDayBuckets: {
      zero: 0,
      one: 0,
      two: 0,
      threeOrMore: 0,
    },
  };

  for (const monthDay of allMonthDays) {
    const finalDay = finalMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const normalizedDay = normalizedMap.get(monthDay) ?? createEmptyDayEntry(monthDay);
    const rawDay = rawDayMap.get(monthDay) ?? createRawEmptyDayEntry(monthDay);
    const finalPrimaryNames = uniqueSorted(finalDay.preferredNames);
    const missingNormalized = collectMissingNames({
      names: normalizedDay.preferredNames,
      finalPrimaryUniverse,
      dayPrimaryNames: finalPrimaryNames,
      nameRecords,
      reverseLinks,
    });
    const missingRanking = collectMissingNames({
      names: rawDay.primaryRanked,
      finalPrimaryUniverse,
      dayPrimaryNames: finalPrimaryNames,
      nameRecords,
      reverseLinks,
    });
    const combinedMissing = buildCombinedMissingEntries(missingNormalized, missingRanking);

    if (combinedMissing.length === 0) {
      continue;
    }

    const row = {
      month: finalDay.month,
      day: finalDay.day,
      monthDay,
      finalPrimaryNames,
      finalPrimaryCount: finalPrimaryNames.length,
      combinedMissing,
      normalizedMissing: missingNormalized,
      rankingMissing: missingRanking,
    };

    months[row.month - 1].rows.push(row);
    summary.rowCount += 1;
    summary.combinedMissingCount += combinedMissing.length;
    summary.normalizedMissingCount += missingNormalized.length;
    summary.rankingMissingCount += missingRanking.length;
    summary.combinedHighlightedCount += combinedMissing.filter((entry) => entry.highlight).length;
    summary.normalizedHighlightedCount += missingNormalized.filter((entry) => entry.highlight).length;
    summary.rankingHighlightedCount += missingRanking.filter((entry) => entry.highlight).length;
    novelUniqueNames(uniqueMissingNames, combinedMissing);
    novelBucket(summary.finalPrimaryDayBuckets, row.finalPrimaryCount);
  }

  for (const month of months) {
    if (month.rows.length > 0) {
      summary.monthCount += 1;
    }
  }

  summary.uniqueMissingNameCount = uniqueMissingNames.size;

  return {
    generatedAt: new Date().toISOString(),
    inputs: {
      finalRegistryPath: path.relative(process.cwd(), inputs.finalRegistryPath),
      normalizedRegistryPath: path.relative(process.cwd(), inputs.normalizedRegistryPath),
      inputPath: path.relative(process.cwd(), inputs.inputPath),
      reportPath: path.relative(process.cwd(), inputs.reportPath),
    },
    summary,
    months,
  };
}

/**
 * A `buildCombinedMissingEntries` a normalizált és rangsorolt hiánylisták egyesített, név szerinti nézetét adja.
 *
 * A sorrend szándékosan a normalizált lista elsőbbségét követi, majd a csak rangsorban szereplő elemeket
 * fűzi hozzá. Így a közös oszlop olvasható marad, miközben a két eredeti oszlop továbbra is külön látható.
 */
export function buildCombinedMissingEntries(normalizedMissing, rankingMissing) {
  const merged = new Map();

  for (const entry of normalizedMissing ?? []) {
    const normalizedName = normalizeNameForMatch(entry.name);

    if (!normalizedName) {
      continue;
    }

    merged.set(normalizedName, {
      name: entry.name,
      sources: ["normalized"],
      highlight: entry.highlight === true,
      similarPrimaries: dedupeSimilarPrimaries(entry.similarPrimaries ?? []),
    });
  }

  for (const entry of rankingMissing ?? []) {
    const normalizedName = normalizeNameForMatch(entry.name);

    if (!normalizedName) {
      continue;
    }

    const current = merged.get(normalizedName);

    if (!current) {
      merged.set(normalizedName, {
        name: entry.name,
        sources: ["ranking"],
        highlight: entry.highlight === true,
        similarPrimaries: dedupeSimilarPrimaries(entry.similarPrimaries ?? []),
      });
      continue;
    }

    current.highlight ||= entry.highlight === true;
    current.sources = uniqueKeepOrder([...current.sources, "ranking"]);
    current.similarPrimaries = dedupeSimilarPrimaries([
      ...current.similarPrimaries,
      ...(entry.similarPrimaries ?? []),
    ]);
  }

  return Array.from(merged.values());
}

/**
 * A `dedupeSimilarPrimaries` a hasonló primer-listában összevonja a duplikált primerkapcsolatokat.
 */
function dedupeSimilarPrimaries(entries) {
  const map = new Map();

  for (const entry of entries) {
    const normalizedName = normalizeNameForMatch(entry?.primaryName);

    if (!normalizedName) {
      continue;
    }

    const current = map.get(normalizedName) ?? {
      primaryName: entry.primaryName,
      relations: new Set(),
    };

    const relationText = String(entry?.relation ?? "")
      .split("•")
      .map((value) => value.trim())
      .filter(Boolean);

    for (const relation of relationText) {
      current.relations.add(relation);
    }

    map.set(normalizedName, current);
  }

  return Array.from(map.values())
    .map((entry) => ({
      primaryName: entry.primaryName,
      relation: Array.from(entry.relations)
        .sort((left, right) => collator.compare(left, right))
        .join(" • "),
    }))
    .sort((left, right) => collator.compare(left.primaryName, right.primaryName));
}

/**
 * A `novelUniqueNames` összegyűjti az érintett hiányzó neveket egy halmazba.
 */
function novelUniqueNames(target, entries) {
  for (const entry of entries) {
    target.add(normalizeNameForMatch(entry.name));
  }
}

/**
 * A `novelBucket` a végső primerdarab szerinti napi eloszlást számolja.
 */
function novelBucket(buckets, finalPrimaryCount) {
  if (finalPrimaryCount <= 0) {
    buckets.zero += 1;
    return;
  }

  if (finalPrimaryCount === 1) {
    buckets.one += 1;
    return;
  }

  if (finalPrimaryCount === 2) {
    buckets.two += 1;
    return;
  }

  buckets.threeOrMore += 1;
}

/**
 * A `collectMissingNames` kiszűri azokat a neveket, amelyek a teljes végső primerkészletből hiányoznak.
 */
function collectMissingNames({
  names,
  finalPrimaryUniverse,
  dayPrimaryNames,
  nameRecords,
  reverseLinks,
}) {
  return uniqueSorted(names)
    .filter((name) => !finalPrimaryUniverse.has(normalizeNameForMatch(name)))
    .map((name) => {
      const similarPrimaries = collectDaySimilarPrimaries({
        hiddenName: name,
        dayPrimaryNames,
        nameRecords,
        reverseLinks,
      });

      return {
        name,
        highlight: similarPrimaries.length > 0,
        similarPrimaries,
      };
    });
}

/**
 * A `collectDaySimilarPrimaries` megkeresi, hogy a hiányzó név kapcsolódik-e az adott nap végső primereihez.
 */
function collectDaySimilarPrimaries({ hiddenName, dayPrimaryNames, nameRecords, reverseLinks }) {
  const dayPrimaryMap = new Map(
    uniqueKeepOrder(dayPrimaryNames)
      .map((name) => [normalizeNameForMatch(name), name])
      .filter(([normalized]) => Boolean(normalized))
  );
  return gyujtKapcsolodoPrimereket({
    hiddenName,
    primerNevMap: dayPrimaryMap,
    nameRecords,
    reverseLinks,
    collator,
  });
}

/**
 * A `buildRegistryMap` egyszerű napi névnézetté alakítja a primerjellegű YAML-artifactot.
 */
function buildRegistryMap(payload) {
  if (!Array.isArray(payload?.days)) {
    throw new Error("A primerjegyzék payload nem tartalmaz érvényes days tömböt.");
  }

  const map = new Map();

  for (const day of payload.days) {
    if (!day || typeof day !== "object" || typeof day.monthDay !== "string") {
      throw new Error("Érvénytelen napi primerjegyzék-bejegyzés.");
    }

    map.set(day.monthDay, {
      month: Number(day.month),
      day: Number(day.day),
      monthDay: day.monthDay,
      names: uniqueKeepOrder(day.names ?? []),
      preferredNames: uniqueKeepOrder(day.preferredNames ?? []),
    });
  }

  return map;
}

/**
 * A `buildRawDayMap` a teljes névadatbázisból napra lebontott rangsorolt névlistát állít elő.
 */
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
        primaryRanked: [],
      };

      if (dayEntry.primaryRanked) {
        bucket.primaryRanked.push(name);
      }

      map.set(monthDay, bucket);
    }
  }

  for (const bucket of map.values()) {
    bucket.primaryRanked = uniqueSorted(bucket.primaryRanked);
  }

  return map;
}

/**
 * A `buildFinalPrimaryUniverse` felépíti a végső primerként valaha megjelenő nevek halmazát.
 */
function buildFinalPrimaryUniverse(finalMap) {
  const universe = new Set();

  for (const day of finalMap.values()) {
    for (const name of day.preferredNames) {
      universe.add(normalizeNameForMatch(name));
    }
  }

  return universe;
}

/**
 * A `createEmptyDayEntry` üres napi primerbejegyzést ad a hiányzó napokhoz.
 */
function createEmptyDayEntry(monthDay) {
  const [month, day] = monthDay.split("-").map(Number);

  return {
    month,
    day,
    monthDay,
    names: [],
    preferredNames: [],
  };
}

/**
 * A `createRawEmptyDayEntry` üres napi rangsorolt névlistát ad a hiányzó napokhoz.
 */
function createRawEmptyDayEntry(monthDay) {
  const [month, day] = monthDay.split("-").map(Number);

  return {
    month,
    day,
    monthDay,
    primaryRanked: [],
  };
}

/**
 * A `compareMonthDays` a hónap-nap azonosítókat időrendben rendezi.
 */
function compareMonthDays(left, right) {
  return left.localeCompare(right, "hu");
}

/**
 * A `uniqueKeepOrder` duplikátummentes listát ad vissza az első előfordulási sorrendben.
 */
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

/**
 * A `uniqueSorted` duplikátummentes, alfabetikus listát készít.
 */
function uniqueSorted(values) {
  return uniqueKeepOrder(values).sort((left, right) => collator.compare(left, right));
}

/**
 * A `printReport` terminálra írja az audit emberileg olvasható nézetét.
 */
function printReport(report) {
  printKeyValueTable(
    "Primer nélkül maradó nevek – források",
    [
      ["Végső primerjegyzék", report.inputs.finalRegistryPath],
      ["Normalizált primerjegyzék", report.inputs.normalizedRegistryPath],
      ["Névadatbázis", report.inputs.inputPath],
      ["Riport", report.inputs.reportPath],
    ],
    { titleStyle: ["bold", "magenta"] }
  );

  printKeyValueTable(
    "Összegzés",
    [
      ["Érintett hónapok", report.summary.monthCount],
      ["Érintett napok", report.summary.rowCount],
      ["Közös hiányzó nevek", report.summary.combinedMissingCount],
      ["Normalizált hiányzó nevek", report.summary.normalizedMissingCount],
      ["Rangsorolt hiányzó nevek", report.summary.rankingMissingCount],
      ["Közös, jelölt hiányok", report.summary.combinedHighlightedCount],
      ["Normalizált, jelölt hiányok", report.summary.normalizedHighlightedCount],
      ["Rangsorolt, jelölt hiányok", report.summary.rankingHighlightedCount],
      ["Egyedi primer nélkül maradó nevek", report.summary.uniqueMissingNameCount],
      ["0 primeres nap", report.summary.finalPrimaryDayBuckets.zero],
      ["1 primeres nap", report.summary.finalPrimaryDayBuckets.one],
      ["2 primeres nap", report.summary.finalPrimaryDayBuckets.two],
      ["3+ primeres nap", report.summary.finalPrimaryDayBuckets.threeOrMore],
    ],
    { titleStyle: ["bold", "magenta"] }
  );

  printLegend();

  for (const month of report.months) {
    if (month.rows.length === 0) {
      continue;
    }

    printMonthTable(month);
  }
}

/**
 * A `printLegend` röviden elmagyarázza a dátum- és névszínezés jelentését.
 */
function printLegend() {
  console.log("");
  console.log(styleText("Jelmagyarázat", ["bold", "magenta"]));
  console.log(`- ${styleText("zöld dátum", ["green"])} = 1 végső primer`);
  console.log(`- ${styleText("sárga dátum", ["yellow"])} = 2 végső primer`);
  console.log(`- ${styleText("piros dátum", ["red"])} = 3 vagy több végső primer`);
  console.log(
    `- ${styleText("kék név", ["bold", "blue"])} = a közös oszlopban jelölt hiányzó név, amely aznapi végső primerhez kapcsolódik`
  );
  console.log(
    `- ${styleText("cián név", ["bold", "cyan"])} = normalizált hiányzó név, amely aznapi végső primerhez kapcsolódik`
  );
  console.log(
    `- ${styleText("bíbor név", ["bold", "magenta"])} = rangsorolt hiányzó név, amely aznapi végső primerhez kapcsolódik`
  );
  console.log("- [N] = csak a normalizált listában szerepel");
  console.log("- [R] = csak a rangsorolt listában szerepel");
  console.log("- [N+R] = mindkét listában szerepel");
}

/**
 * A `printMonthTable` havi bontásban jeleníti meg az érintett napokat.
 */
function printMonthTable(month) {
  printDataTable(
    `${month.monthName} (${String(month.month).padStart(2, "0")})`,
    [
      { key: "date", title: "Dátum", width: 7 },
      { key: "names", title: "Nevek", width: 24 },
      { key: "combined", title: "Közös", width: 36 },
      { key: "normalized", title: "Normalizált", width: 34 },
      { key: "ranking", title: "Rangsor", width: 34 },
    ],
    month.rows.map((row) => ({
      date: styleDateCell(row.monthDay, row.finalPrimaryCount),
      names: formatPlainNameEntries(row.finalPrimaryNames, 5),
      combined: formatCombinedMissingEntries(row.combinedMissing),
      normalized: formatMissingNameEntries(row.normalizedMissing, ["bold", "cyan"]),
      ranking: formatMissingNameEntries(row.rankingMissing, ["bold", "magenta"]),
    })),
    {
      titleStyle: ["bold", "magenta"],
    }
  );
}

/**
 * A `styleDateCell` a végső primerdarab alapján színezi a dátumcellát.
 */
function styleDateCell(monthDay, finalPrimaryCount) {
  if (finalPrimaryCount === 1) {
    return styleText(monthDay, ["green", "bold"]);
  }

  if (finalPrimaryCount === 2) {
    return styleText(monthDay, ["yellow", "bold"]);
  }

  if (finalPrimaryCount >= 3) {
    return styleText(monthDay, ["red", "bold"]);
  }

  return styleText(monthDay, ["dim"]);
}

/**
 * A `formatPlainNameEntries` rövid, olvasható névlistát készít a végső primercellához.
 */
function formatPlainNameEntries(names, maxItems = 4) {
  const normalized = uniqueSorted(names);

  if (normalized.length === 0) {
    return "—";
  }

  const visible = normalized.slice(0, maxItems).join(" • ");
  const suffix = normalized.length > maxItems ? ` … (+${normalized.length - maxItems})` : "";
  return `${visible}${suffix}`;
}

/**
 * A `formatMissingNameEntries` a hiányzó névlistát részleges színezéssel jeleníti meg.
 */
function formatMissingNameEntries(entries, highlightStyles) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "—";
  }

  const maxItems = 4;
  const visible = entries.slice(0, maxItems).map((entry) =>
    entry.highlight ? styleText(entry.name, highlightStyles) : entry.name
  );
  const suffix = entries.length > maxItems ? ` … (+${entries.length - maxItems})` : "";
  return `${visible.join(" • ")}${suffix}`;
}

/**
 * A `formatCombinedMissingEntries` a közös hiányzó névlistát forrásjelöléssel jeleníti meg.
 */
function formatCombinedMissingEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return "—";
  }

  const maxItems = 4;
  const visible = entries.slice(0, maxItems).map((entry) => {
    const label = `${entry.name} ${formatCombinedSourceBadge(entry.sources)}`.trim();
    return entry.highlight ? styleText(label, ["bold", "blue"]) : label;
  });
  const suffix = entries.length > maxItems ? ` … (+${entries.length - maxItems})` : "";
  return `${visible.join(" • ")}${suffix}`;
}

/**
 * A `formatCombinedSourceBadge` rövid forrásjelölést készít a közös oszlop számára.
 */
function formatCombinedSourceBadge(sources) {
  const normalizedSources = uniqueKeepOrder(sources ?? []);

  if (
    normalizedSources.includes("normalized") &&
    normalizedSources.includes("ranking")
  ) {
    return "[N+R]";
  }

  if (normalizedSources.includes("normalized")) {
    return "[N]";
  }

  if (normalizedSources.includes("ranking")) {
    return "[R]";
  }

  return "";
}

/**
 * A `parseArgs` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
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

const kozvetlenFuttatas =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (kozvetlenFuttatas) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
