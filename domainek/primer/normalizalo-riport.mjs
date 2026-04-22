import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import {
  betoltStrukturaltFajlSzinkron,
  mentStrukturaltFajl,
} from "../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";

const DEFAULT_INPUT_PATH = kanonikusUtvonalak.adatbazis.nevnapok;
const DEFAULT_DIFF_PATH = kanonikusUtvonalak.riportok.wikiVsLegacy;
const DEFAULT_OUTPUT_PATH = kanonikusUtvonalak.primer.normalizaloRiport;

const DEFAULT_CONFIG = {
  sourcePriority: ["legacy", "database"],
  canonicalOverrides: {
    achillesz: "Achilles",
    achilles: "Achilles",
    gyongyver: "Gyöngyvér",
    gyongyi: "Gyöngyi",
    fatime: "Fatime",
    fatima: "Fatima",
    marti: "Márti",
    marta: "Márta",
    amalia: "Amália",
    amelia: "Amélia",
  },
  orthographicAliases: {
    achillesz: "Achilles",
    achilles: "Achilles",
    agota: "Ágota",
    agata: "Agáta",
    zssofia: "Zsófia",
  },
  relatedButDistinct: {
    gyongyi: "Gyöngyvér",
    marti: "Márta",
    katinka: "Katalin",
    zsuzsa: "Zsuzsanna",
    viki: "Viktória",
  },
  manualDayPrimaryOverrides: {
    "02-24": ["Mátyás"],
    "02-25": ["Géza"],
    "02-26": ["Edina"],
    "02-27": ["Ákos", "Bátor"],
    "02-28": ["Elemér"],
    "02-29": ["Elemér"],
  },
  acceptRelatedAsAutomaticPrimary: false,
};

/**
 * A `futtatPrimerNormalizaloRiportot` felépíti a normalizált primer riportot.
 */
export async function futtatPrimerNormalizaloRiportot(opciok = {}) {
  const inputPath = path.resolve(process.cwd(), opciok.input ?? DEFAULT_INPUT_PATH);
  const diffPath = path.resolve(process.cwd(), opciok.diff ?? DEFAULT_DIFF_PATH);
  const outputPath = path.resolve(process.cwd(), opciok.output ?? DEFAULT_OUTPUT_PATH);

  const wikiData = readMaybeZippedJson(inputPath);
  const legacyDiff = readJson(diffPath);
  const report = buildUnifiedPrimary({
    wikiData,
    legacyDiff,
    config: DEFAULT_CONFIG,
    inputPath,
    diffPath,
  });

  await mentStrukturaltFajl(outputPath, report);

  console.log(`Mentve: ${outputPath}`);
  console.log(`Napok: ${report.summary.totalDays}`);
  console.log(`Primer napok: ${report.stats.preferredNameCount}`);
  console.log(`Kézi átnézést igényel: ${report.summary.unresolved}`);

  return {
    report,
    inputPath,
    diffPath,
    outputPath,
  };
}

/**
 * A `readJson` betölti a szükséges adatot.
 */
function readJson(filePath) {
  return betoltStrukturaltFajlSzinkron(filePath);
}

/**
 * A `readMaybeZippedJson` betölti a szükséges adatot.
 */
function readMaybeZippedJson(filePath) {
  if (filePath.endsWith(".zip")) {
    return readSingleJsonFromZip(filePath);
  }

  return readJson(filePath);
}

/**
 * A `readSingleJsonFromZip` betölti a szükséges adatot.
 */
function readSingleJsonFromZip(zipPath) {
  const buffer = fs.readFileSync(zipPath);
  const eocdSig = 0x06054b50;
  let eocdOffset = -1;

  for (let index = buffer.length - 22; index >= Math.max(0, buffer.length - 65557); index -= 1) {
    if (buffer.readUInt32LE(index) === eocdSig) {
      eocdOffset = index;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error(`Az EOCD rekord nem található a zip fájlban: ${zipPath}`);
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let ptr = centralDirOffset;

  for (let index = 0; index < entryCount; index += 1) {
    const sig = buffer.readUInt32LE(ptr);

    if (sig !== 0x02014b50) {
      throw new Error(`Érvénytelen központi könyvtárfejléc ennél az eltolásnál ${ptr}`);
    }

    const compressionMethod = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const fileNameLength = buffer.readUInt16LE(ptr + 28);
    const extraLength = buffer.readUInt16LE(ptr + 30);
    const commentLength = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const fileName = buffer.slice(ptr + 46, ptr + 46 + fileNameLength).toString("utf8");

    entries.push({
      fileName,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    ptr += 46 + fileNameLength + extraLength + commentLength;
  }

  const jsonEntry = entries.find((entry) => entry.fileName.endsWith(".json"));

  if (!jsonEntry) {
    throw new Error(`Nem található JSON fájl a zip állományban: ${zipPath}`);
  }

  const localSig = buffer.readUInt32LE(jsonEntry.localHeaderOffset);

  if (localSig !== 0x04034b50) {
    throw new Error(`Érvénytelen lokális fejléc ennél a fájlnál ${jsonEntry.fileName}`);
  }

  const fileNameLength = buffer.readUInt16LE(jsonEntry.localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(jsonEntry.localHeaderOffset + 28);
  const dataStart = jsonEntry.localHeaderOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.slice(dataStart, dataStart + jsonEntry.compressedSize);

  let content;

  if (jsonEntry.compressionMethod === 0) {
    content = compressed;
  } else if (jsonEntry.compressionMethod === 8) {
    content = zlib.inflateRawSync(compressed);
  } else {
    throw new Error(`Nem támogatott zip tömörítési eljárás: ${jsonEntry.compressionMethod}`);
  }

  return JSON.parse(content.toString("utf8"));
}

/**
 * A `normalizeAscii` normalizálja a megadott értéket.
 */
function normalizeAscii(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * A `removeParenContent` eltávolítja a zárójelezett részeket az összehasonlításhoz.
 */
function removeParenContent(value) {
  return String(value ?? "")
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A `buildNameIndex` felépíti a szükséges adatszerkezetet.
 */
function buildNameIndex(names) {
  const index = new Map();

  for (const entry of names) {
    const variants = new Set([
      entry.name,
      normalizeAscii(entry.name),
      removeParenContent(entry.name),
      removeParenContent(normalizeAscii(entry.name)),
    ]);

    for (const variant of variants) {
      if (!variant) {
        continue;
      }

      index.set(variant, entry);
    }
  }

  return index;
}

/**
 * A `buildRelatedMap` felépíti a szükséges adatszerkezetet.
 */
function buildRelatedMap(names) {
  const related = new Map();

  for (const entry of names) {
    const canonical = entry.name;
    const variants = new Set([...(entry.nicknames ?? []), ...(entry.relatedNames ?? [])]);

    for (const variant of variants) {
      const normalizedVariant = normalizeAscii(variant);

      if (!normalizedVariant) {
        continue;
      }

      if (!related.has(normalizedVariant)) {
        related.set(normalizedVariant, new Set());
      }

      related.get(normalizedVariant).add(canonical);
    }
  }

  return related;
}

/**
 * A `makeDayKey` egységes hónap-nap kulcsot képez a napi rekordhoz.
 */
function makeDayKey(month, day) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A `parseMonthDay` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
function parseMonthDay(monthDay) {
  const match = String(monthDay).match(/^(\d{2})-(\d{2})$/);

  if (!match) {
    return {
      month: null,
      day: null,
    };
  }

  return {
    month: Number(match[1]),
    day: Number(match[2]),
  };
}

/**
 * A `isLeapSensitiveDay` ellenőrzi a kapcsolódó feltételt.
 */
function isLeapSensitiveDay(monthDay) {
  return ["02-24", "02-25", "02-26", "02-27", "02-28", "02-29"].includes(monthDay);
}

/**
 * A `monthDaySort` hónap-nap kulcsokat rendez időrendbe.
 */
function monthDaySort(left, right) {
  return left.localeCompare(right, "hu");
}

/**
 * A `resolveCanonicalName` a névváltozatból irányadó névalakot vezet le.
 */
function resolveCanonicalName(name, config) {
  const clean = removeParenContent(name).trim();
  const ascii = normalizeAscii(clean);

  if (config.canonicalOverrides[ascii]) {
    return {
      canonicalName: config.canonicalOverrides[ascii],
      normalizationType: "manual-canonical-override",
    };
  }

  if (config.orthographicAliases[ascii]) {
    return {
      canonicalName: config.orthographicAliases[ascii],
      normalizationType: "orthographic",
    };
  }

  return {
    canonicalName: clean,
    normalizationType: "exact",
  };
}

/**
 * A `convertRegistryDayNames` a napi primerneveket összehasonlítható irányadó alakra hozza.
 */
function convertRegistryDayNames(dayNames, config) {
  return (dayNames ?? []).map((name) => {
    const resolved = resolveCanonicalName(name, config);

    return {
      originalName: name,
      canonicalName: resolved.canonicalName,
      normalizationType: resolved.normalizationType,
      source: "registry",
    };
  });
}

/**
 * A `buildNameDayRegistry` felépíti a szükséges adatszerkezetet.
 */
function buildNameDayRegistry(names, config) {
  const byDay = new Map();

  for (const entry of names ?? []) {
    const resolved = resolveCanonicalName(entry.name, config);

    for (const day of entry.days ?? []) {
      const monthDay = day.monthDay || makeDayKey(day.month, day.day);

      if (!byDay.has(monthDay)) {
        byDay.set(monthDay, []);
      }

      byDay.get(monthDay).push({
        originalName: entry.name,
        canonicalName: resolved.canonicalName,
        normalizationType: resolved.normalizationType,
        currentPrimary: Boolean(day.primary),
        primaryRanked: Boolean(day.primaryRanked),
        primaryLegacy: Boolean(day.primaryLegacy),
        rankingScore: day.ranking?.score ?? 0,
        overallRank: day.ranking?.overallRank ?? entry.frequency?.overall?.rank ?? 0,
        newbornRank: day.ranking?.newbornRank ?? entry.frequency?.newborns?.rank ?? 0,
        gender: entry.gender ?? null,
        frequency: entry.frequency ?? null,
        nicknames: entry.nicknames ?? [],
        relatedNames: entry.relatedNames ?? [],
        source: "database",
      });
    }
  }

  return byDay;
}

/**
 * A `scoreCandidate` pontszámot ad egy lehetséges primerjelöltnek.
 */
function scoreCandidate(candidate) {
  const rankingScore = Number(candidate.rankingScore ?? 0);
  const overallRank = Number(candidate.overallRank ?? 0);
  const newbornRank = Number(candidate.newbornRank ?? 0);

  return (
    (candidate.primaryRanked ? 5000 : 0) +
    rankingScore * 100 +
    overallRank * 10 +
    newbornRank * 12 +
    (candidate.currentPrimary ? 5 : 0)
  );
}

/**
 * A `selectDatabasePrimaryCandidates` kiválasztja az adatbázis alapján legerősebb primerjelölteket.
 */
function selectDatabasePrimaryCandidates(candidates) {
  const grouped = new Map();

  for (const candidate of candidates) {
    const key = candidate.canonicalName;

    if (!grouped.has(key)) {
      grouped.set(key, []);
    }

    grouped.get(key).push(candidate);
  }

  const normalized = [];

  for (const [canonicalName, group] of grouped.entries()) {
    const best = group.slice().sort((left, right) => scoreCandidate(right) - scoreCandidate(left))[0];

    normalized.push({
      canonicalName,
      source: "database",
      currentPrimary: group.some((item) => item.currentPrimary),
      primaryRanked: group.some((item) => item.primaryRanked),
      primaryLegacy: group.some((item) => item.primaryLegacy),
      bestScore: scoreCandidate(best),
      bestRankingScore: best.rankingScore,
      bestOverallRank: best.overallRank,
      bestNewbornRank: best.newbornRank,
      raw: group,
    });
  }

  normalized.sort((left, right) => {
    if (right.bestScore !== left.bestScore) {
      return right.bestScore - left.bestScore;
    }

    return left.canonicalName.localeCompare(right.canonicalName, "hu");
  });

  const rankedOnly = normalized.filter((item) => item.primaryRanked);
  return rankedOnly.length > 0 ? rankedOnly : normalized.slice(0, 2);
}

/**
 * A `buildUnifiedPrimary` felépíti a szükséges adatszerkezetet.
 */
function buildUnifiedPrimary({ wikiData, legacyDiff, config, inputPath, diffPath }) {
  const names = wikiData.names ?? [];
  const databaseByDay = buildNameDayRegistry(names, config);
  const nameIndex = buildNameIndex(names);
  const relatedMap = buildRelatedMap(names);
  const preferredMismatchDays = legacyDiff.comparison?.differences?.preferredMismatchDays ?? [];
  const legacyOnlyDays = legacyDiff.comparison?.differences?.legacyOnlyDays ?? [];
  const mismatchMap = new Map(preferredMismatchDays.map((item) => [item.monthDay, item]));
  const legacyOnlyMap = new Map(legacyOnlyDays.map((item) => [item.monthDay, item]));
  const allDays = new Set([...databaseByDay.keys()]);

  for (const mismatch of preferredMismatchDays) {
    allDays.add(mismatch.monthDay);
  }

  for (const extra of legacyOnlyDays) {
    allDays.add(extra.monthDay);
  }

  for (const monthDay of Object.keys(config.manualDayPrimaryOverrides)) {
    allDays.add(monthDay);
  }

  const days = [];
  const reviewQueue = [];
  const summary = {
    totalDays: 0,
    directFromLegacy: 0,
    directFromDatabase: 0,
    manualLeapOverride: 0,
    manualConflictReview: 0,
    unresolved: 0,
  };

  for (const monthDay of Array.from(allDays).sort(monthDaySort)) {
    const databaseRawCandidates = databaseByDay.get(monthDay) ?? [];
    const databaseCandidates = selectDatabasePrimaryCandidates(databaseRawCandidates);
    const databaseNames = uniqueSorted(databaseRawCandidates.map((item) => item.canonicalName));
    const mismatch = mismatchMap.get(monthDay) ?? null;
    const legacyOnly = legacyOnlyMap.get(monthDay) ?? null;
    const legacyResolved = mismatch ? convertRegistryDayNames(mismatch.legacy, config) : [];
    const legacyCanonical = uniqueSorted(legacyResolved.map((item) => item.canonicalName));
    const databaseResolved = databaseCandidates.map((item) => item.canonicalName);

    let decision;

    if (config.manualDayPrimaryOverrides[monthDay]) {
      decision = {
        preferredNames: uniqueSorted(config.manualDayPrimaryOverrides[monthDay]),
        source: "manual-day-override",
        confidence: "high",
        reason: isLeapSensitiveDay(monthDay) ? "leap-sensitive-day" : "manual-override",
      };
      summary.manualLeapOverride += 1;
    } else if (legacyOnly) {
      const registryPreferred = legacyOnly.preferredNames?.length
        ? legacyOnly.preferredNames
        : legacyOnly.names ?? [];

      decision = {
        preferredNames: uniqueSorted(
          convertRegistryDayNames(registryPreferred, config).map((item) => item.canonicalName)
        ),
        source: "legacy-only-day",
        confidence: "medium",
        reason: "day-missing-from-database-comparison",
      };
      summary.directFromLegacy += 1;
    } else if (!mismatch) {
      decision = {
        preferredNames: uniqueSorted(databaseResolved),
        source: "database-ranking",
        confidence: "high",
        reason: "no-preferred-mismatch",
      };
      summary.directFromDatabase += 1;
    } else {
      const shared = legacyCanonical.filter((name) => databaseResolved.includes(name));

      if (shared.length > 0) {
        decision = {
          preferredNames: uniqueSorted(shared),
          source: "intersection",
          confidence: "medium",
          reason:
            mismatch.type === "overlap"
              ? "preferred-overlap-after-normalization"
              : "normalized-overlap",
        };
        summary.directFromLegacy += 1;
      } else {
        const suggestions = collectSuggestions({
          legacyCanonical,
          nameIndex,
          relatedMap,
          config,
        });

        decision = {
          preferredNames: uniqueSorted(legacyCanonical),
          source: "legacy-preferred-fallback",
          confidence: "low",
          reason:
            mismatch.type === "disjoint"
              ? "preferred-disjoint-manual-review-needed"
              : "preferred-partial-conflict",
        };

        summary.manualConflictReview += 1;
        reviewQueue.push({
          monthDay,
          reason: decision.reason,
          legacy: mismatch.legacy,
          wiki: mismatch.wiki,
          normalizedLegacy: legacyCanonical,
          normalizedWiki: uniqueSorted(
            convertRegistryDayNames(mismatch.wiki ?? [], config).map((item) => item.canonicalName)
          ),
          normalizedDatabase: databaseResolved,
          nameIndexSuggestions: suggestions.nameIndexSuggestions,
          relatedSuggestions: suggestions.relatedSuggestions,
        });
      }
    }

    const { month, day } = parseMonthDay(monthDay);
    const namesForDay = uniqueSorted([
      ...databaseNames,
      ...decision.preferredNames,
      ...legacyCanonical,
    ]);

    days.push({
      month,
      day,
      monthDay,
      names: namesForDay,
      preferredNames: decision.preferredNames,
      source: decision.source,
      confidence: decision.confidence,
      reason: decision.reason,
      leapSensitive: isLeapSensitiveDay(monthDay),
      databaseCandidates: databaseCandidates.map((item) => ({
        canonicalName: item.canonicalName,
        currentPrimary: item.currentPrimary,
        primaryRanked: item.primaryRanked,
        primaryLegacy: item.primaryLegacy,
        bestScore: item.bestScore,
        rankingScore: item.bestRankingScore,
        overallRank: item.bestOverallRank,
        newbornRank: item.bestNewbornRank,
      })),
      preferredMismatch: mismatch
        ? {
            type: mismatch.type,
            legacy: mismatch.legacy,
            wiki: mismatch.wiki,
            normalizedLegacy: legacyCanonical,
            normalizedDatabase: databaseResolved,
          }
        : null,
    });
  }

  summary.totalDays = days.length;
  summary.unresolved = reviewQueue.length;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    inputs: {
      inputPath,
      diffPath,
    },
    config,
    stats: buildRegistryStats(days),
    summary,
    days,
    reviewQueue,
  };
}

/**
 * A `collectSuggestions` összegyűjti a szükséges elemeket.
 */
function collectSuggestions({ legacyCanonical, nameIndex, relatedMap, config }) {
  const nameIndexSuggestions = new Set();
  const relatedSuggestions = new Set();

  for (const name of legacyCanonical) {
    const variants = [
      name,
      normalizeAscii(name),
      removeParenContent(name),
      removeParenContent(normalizeAscii(name)),
    ].filter(Boolean);

    for (const variant of variants) {
      const direct = nameIndex.get(variant);

      if (direct?.name) {
        nameIndexSuggestions.add(direct.name);
      }

      const related = relatedMap.get(normalizeAscii(variant));

      if (related) {
        for (const item of related) {
          relatedSuggestions.add(item);
        }
      }
    }

    const distinct = config.relatedButDistinct[normalizeAscii(name)];

    if (distinct) {
      relatedSuggestions.add(distinct);
    }
  }

  return {
    nameIndexSuggestions: uniqueSorted(Array.from(nameIndexSuggestions)),
    relatedSuggestions: uniqueSorted(Array.from(relatedSuggestions)),
  };
}

/**
 * A `buildRegistryStats` felépíti a szükséges adatszerkezetet.
 */
function buildRegistryStats(days) {
  return {
    dayCount: days.length,
    preferredNameCount: days.reduce((sum, entry) => sum + entry.preferredNames.length, 0),
    oneNameDays: days.filter((entry) => entry.preferredNames.length === 1).length,
    twoNameDays: days.filter((entry) => entry.preferredNames.length === 2).length,
    threeOrMoreNameDays: days.filter((entry) => entry.preferredNames.length >= 3).length,
  };
}

/**
 * A `uniqueSorted` duplikátummentes, rendezett tömböt ad vissza.
 */
function uniqueSorted(values) {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) =>
    left.localeCompare(right, "hu")
  );
}

/**
 * A `parseArgs` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
function parseArgs(argv) {
  const options = {};
  const positional = [];

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

    if (arg === "--diff" && argv[index + 1]) {
      options.diff = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--diff=")) {
      options.diff = arg.slice("--diff=".length);
      continue;
    }

    if (arg === "--output" && argv[index + 1]) {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    positional.push(arg);
  }

  if (!options.input && positional[0]) {
    options.input = positional[0];
  }

  if (!options.diff && positional[1]) {
    options.diff = positional[1];
  }

  if (!options.output && positional[2]) {
    options.output = positional[2];
  }

  return options;
}

const kozvetlenFuttatas =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (kozvetlenFuttatas) {
  futtatPrimerNormalizaloRiportot(parseArgs(process.argv.slice(2))).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
