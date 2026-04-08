import fs from "node:fs/promises";
import path from "node:path";
import puppeteer from "puppeteer";
import {
  buildPrimaryRegistryLookup,
  loadPrimaryRegistry,
  normalizeNameForMatch,
} from "./lib/primary-registry.js";

const FEMALE_INDEX_URL = "http://corpus.nytud.hu/utonevportal/html/nem_n%C5%91i.html";
const MALE_INDEX_URL = "http://corpus.nytud.hu/utonevportal/html/nem_f%C3%A9rfi.html";
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "output", "nevnapok.json");
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_PRIMARY_REGISTRY = path.join(process.cwd(), "data", "legacy-primary-registry.json");
const collator = new Intl.Collator("hu", { sensitivity: "base", numeric: true });
const FREQUENCY_SCALE = [
  { labelHu: "néhány előfordulás", rank: 1, tag: "1-few" },
  { labelHu: "rendkívül ritka", rank: 2, tag: "2-extremely-rare" },
  { labelHu: "nagyon ritka", rank: 3, tag: "3-very-rare" },
  { labelHu: "elég ritka", rank: 4, tag: "4-rare" },
  { labelHu: "közepesen gyakori", rank: 5, tag: "5-medium" },
  { labelHu: "nagyon gyakori", rank: 6, tag: "6-very-common" },
  { labelHu: "rendkívül gyakori", rank: 7, tag: "7-extremely-common" },
  { labelHu: "első tízben", rank: 8, tag: "8-top-ten" },
];
const FREQUENCY_SCALE_MAP = new Map(
  FREQUENCY_SCALE.map((entry) => [entry.labelHu, { ...entry }])
);

const args = parseArgs(process.argv.slice(2));
const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_OUTPUT_PATH);
const primaryRegistryPath = path.resolve(
  process.cwd(),
  args.primaryRegistry ?? DEFAULT_PRIMARY_REGISTRY
);
const concurrency = args.concurrency ?? DEFAULT_CONCURRENCY;
const limit = args.limit ?? null;

async function main() {
  console.log("Starting scrape from gender index pages.");

  const primaryRegistry = await loadPrimaryRegistryOrThrow(primaryRegistryPath);
  const primaryRegistryLookup = buildPrimaryRegistryLookup(primaryRegistry.payload.days);
  const browser = await puppeteer.launch({
    headless: args.headful ? false : true,
  });

  try {
    const discoveredNames = await discoverNames(browser);
    const sortedDiscoveredNames = discoveredNames.sort((left, right) => {
      const byName = collator.compare(left.name, right.name);
      if (byName !== 0) {
        return byName;
      }

      return left.detailUrl.localeCompare(right.detailUrl);
    });

    const selectedNames = limit ? sortedDiscoveredNames.slice(0, limit) : sortedDiscoveredNames;

    console.log(
      `Discovered ${sortedDiscoveredNames.length} names, scraping ${selectedNames.length} detail page(s) with concurrency ${concurrency}.`
    );

    const scrapedNames = await scrapeNames(browser, selectedNames, concurrency);
    const names = applyPrimaryAssignments(scrapedNames, primaryRegistryLookup);
    const namedayAssignmentCount = names.reduce((sum, entry) => sum + entry.days.length, 0);
    const primaryAssignmentStats = collectPrimaryAssignmentStats(names);

    const payload = {
      version: 5,
      generatedAt: new Date().toISOString(),
      source: {
        provider: "HUN-REN Nyelvtudományi Kutatóközpont Utónévportál",
        indexes: {
          female: FEMALE_INDEX_URL,
          male: MALE_INDEX_URL,
        },
        primaryRegistry: {
          path: path.relative(process.cwd(), primaryRegistry.path),
          sourceFile: primaryRegistry.payload.sourceFile ?? null,
          generatedAt: primaryRegistry.payload.generatedAt ?? null,
          version: primaryRegistry.payload.version ?? null,
        },
      },
      stats: {
        nameCount: names.length,
        femaleCount: names.filter((entry) => entry.gender === "female").length,
        maleCount: names.filter((entry) => entry.gender === "male").length,
        namedayAssignmentCount,
        ...primaryAssignmentStats,
      },
      names,
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

    console.log(`Saved ${names.length} name record(s) to ${outputPath}`);
  } finally {
    await browser.close();
  }
}

async function discoverNames(browser) {
  const indexes = [
    { gender: "female", url: FEMALE_INDEX_URL },
    { gender: "male", url: MALE_INDEX_URL },
  ];

  const discovered = [];

  for (const index of indexes) {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);

    try {
      await page.goto(index.url, { waitUntil: "domcontentloaded" });
      const pageNames = await page.$$eval(
        "a.nev_span",
        (links, gender) =>
          links.map((link) => ({
            name: link.textContent?.trim() ?? "",
            detailUrl: link.href,
            gender,
          })),
        index.gender
      );

      discovered.push(...pageNames);
      console.log(`Discovered ${pageNames.length} ${index.gender} name(s) from ${index.url}`);
    } finally {
      await page.close();
    }
  }

  const deduped = new Map();

  for (const item of discovered) {
    if (!deduped.has(item.detailUrl)) {
      deduped.set(item.detailUrl, item);
    }
  }

  return Array.from(deduped.values());
}

async function scrapeNames(browser, names, concurrencyLimit) {
  const results = new Array(names.length);
  let cursor = 0;

  const workerCount = Math.max(1, Math.min(concurrencyLimit, names.length));

  const workers = Array.from({ length: workerCount }, async () => {
    let page = await createPage(browser);

    try {
      while (cursor < names.length) {
        const currentIndex = cursor;
        cursor += 1;

        const nameMeta = names[currentIndex];
        const result = await retryScrapeName(browser, page, nameMeta);
        page = result.page;

        results[currentIndex] = result.data;
        console.log(
          `[${String(currentIndex + 1).padStart(String(names.length).length, "0")}/${names.length}] ${result.data.name} (${result.data.days.length} day(s))`
        );
      }
    } finally {
      await safeClosePage(page);
    }
  });

  await Promise.all(workers);

  return results.sort((left, right) => {
    const byName = collator.compare(left.name, right.name);
    if (byName !== 0) {
      return byName;
    }

    return left.detailUrl.localeCompare(right.detailUrl);
  });
}

async function retryScrapeName(browser, page, nameMeta) {
  const retries = 3;
  let currentPage = page;
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const data = await scrapeName(currentPage, nameMeta);
      return {
        data,
        page: currentPage,
      };
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt}/${retries} failed for ${nameMeta.name}: ${error.message}`);

      await safeClosePage(currentPage);

      if (attempt < retries) {
        currentPage = await createPage(browser);
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError;
}

async function scrapeName(page, nameMeta) {
  await page.goto(nameMeta.detailUrl, { waitUntil: "domcontentloaded" });

  const pageData = await page.evaluate((fallbackGender) => {
    const normalizeLabel = (value) =>
      (value ?? "")
        .replace(/:/g, "")
        .trim()
        .toLowerCase();

    const rows = Array.from(document.querySelectorAll("body > div"));

    const findRowByPrimaryLabel = (label) =>
      rows.find((row) => normalizeLabel(row.querySelector("a.kis")?.textContent) === label);

    const extractRowText = (row) => {
      if (!row) {
        return "";
      }

      const parts = [];

      for (const node of row.childNodes) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node instanceof HTMLElement &&
          node.matches("a.kis")
        ) {
          continue;
        }

        parts.push(node.textContent ?? "");
      }

      return parts.join("");
    };

    const extractFormalizedTokens = (row) => {
      if (!row) {
        return [];
      }

      const tokens = [];

      for (const node of row.childNodes) {
        if (
          node.nodeType === Node.ELEMENT_NODE &&
          node instanceof HTMLElement &&
          node.matches("a.kis")
        ) {
          continue;
        }

        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent ?? "";

          if (text.trim()) {
            tokens.push({
              kind: "text",
              text,
            });
          }

          continue;
        }

        if (node.nodeType !== Node.ELEMENT_NODE || !(node instanceof HTMLElement)) {
          continue;
        }

        const text = node.textContent ?? "";

        if (!text.trim()) {
          continue;
        }

        tokens.push({
          kind: node.matches("a.nev_szovegkoz") ? "reference" : "text",
          text,
        });
      }

      return tokens;
    };

    const languageRow = rows.find((row) => row.querySelector("a.szt, a.hgr, a.mgk")) ?? null;
    const frequencyRow = findRowByPrimaryLabel("gyakoriság");
    const formalizedRow = findRowByPrimaryLabel("formalizálva");
    const frequencyLinks = Array.from(frequencyRow?.querySelectorAll("a.kkh") ?? []).slice(0, 2);
    const genderLink = document.querySelector("a.nem_div, a.nem_span");

    return {
      name: document.querySelector(".nev_div")?.textContent?.trim() ?? "",
      genderUrl: genderLink?.href ?? null,
      fallbackGender,
      origin: extractRowText(findRowByPrimaryLabel("eredet")),
      formalized: extractRowText(formalizedRow),
      formalizedTokens: extractFormalizedTokens(formalizedRow),
      meaning: extractRowText(findRowByPrimaryLabel("jelentés")),
      days: Array.from(findRowByPrimaryLabel("névnap")?.querySelectorAll("a.nnp") ?? []).map((link) =>
        link.textContent?.trim() ?? ""
      ),
      nicknames: Array.from(findRowByPrimaryLabel("becézés")?.querySelectorAll("a.bec") ?? []).map(
        (link) => link.textContent?.trim() ?? ""
      ),
      relatedNames: Array.from(
        findRowByPrimaryLabel("rokon nevek")?.querySelectorAll("a.nev_szovegkoz") ?? []
      ).map((link) => link.textContent?.trim() ?? ""),
      languageFeatures: {
        syllableCount: languageRow?.querySelector("a.szt")?.textContent?.trim() ?? "",
        vowelHarmony: languageRow?.querySelector("a.hgr")?.textContent?.trim() ?? "",
        vowels: languageRow?.querySelector("a.mgk")?.textContent?.trim() ?? "",
      },
      frequency: {
        overall: frequencyLinks[0]?.textContent ?? "",
        newborns: frequencyLinks[1]?.textContent ?? "",
      },
    };
  }, nameMeta.gender);

  return {
    name: normalizeText(pageData.name || nameMeta.name),
    detailUrl: nameMeta.detailUrl,
    gender: genderFromUrl(pageData.genderUrl) ?? pageData.fallbackGender ?? nameMeta.gender ?? null,
    origin: normalizeNullableText(pageData.origin),
    meaning: normalizeNullableText(pageData.meaning),
    frequency: buildFrequency(pageData.frequency),
    days: normalizeNamedays(pageData.days),
    nicknames: uniqueNames(pageData.nicknames),
    relatedNames: uniqueNames(pageData.relatedNames),
    languageFeatures: {
      syllableCount: normalizeInteger(pageData.languageFeatures?.syllableCount),
      vowelHarmony: normalizeNullableText(pageData.languageFeatures?.vowelHarmony),
      vowels: normalizeNullableText(pageData.languageFeatures?.vowels),
    },
    formalized: buildFormalized(pageData.formalized, pageData.formalizedTokens),
    meta: {
      frequency: buildFrequencyMeta(pageData.frequency),
    },
  };
}

function normalizeNamedays(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const value of values) {
    const parsed = parseMonthDayValue(value);

    if (!parsed || seen.has(parsed.monthDay)) {
      continue;
    }

    normalized.push({
      month: parsed.month,
      day: parsed.day,
      monthDay: parsed.monthDay,
    });
    seen.add(parsed.monthDay);
  }

  return normalized;
}

async function loadPrimaryRegistryOrThrow(filePath) {
  try {
    return await loadPrimaryRegistry(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(
        `Primary registry not found at ${filePath}. Run: npm run build-primary-registry`
      );
    }

    throw error;
  }
}

function applyPrimaryAssignments(names, primaryRegistryLookup) {
  const decoratedNames = names.map((entry) => ({
    ...entry,
    days: Array.isArray(entry.days) ? entry.days.map((day) => ({ ...day })) : [],
  }));
  const dayBuckets = buildDayBuckets(decoratedNames);

  for (const [monthDay, bucket] of dayBuckets.entries()) {
    const legacyEntry = primaryRegistryLookup.get(monthDay) ?? null;
    const rankingData = buildDayRankingData(bucket, legacyEntry);
    for (const bucketEntry of bucket) {
      const ranking = rankingData.byKey.get(bucketEntry.key);
      const legacyOrder = rankingData.legacyOrderByKey.get(bucketEntry.key) ?? null;
      const primaryLegacy = Number.isInteger(legacyOrder);
      const primaryRanked = rankingData.primaryRankedKeys.has(bucketEntry.key);

      bucketEntry.nameEntry.days[bucketEntry.dayIndex] = {
        ...bucketEntry.nameEntry.days[bucketEntry.dayIndex],
        primary: primaryLegacy || primaryRanked,
        primaryLegacy,
        primaryRanked,
        legacyOrder,
        ranking,
      };
    }
  }

  return decoratedNames;
}

function buildDayBuckets(names) {
  const buckets = new Map();

  for (const nameEntry of names) {
    const overallRank = getFrequencyRank(nameEntry.frequency?.overall);
    const newbornRank = getFrequencyRank(nameEntry.frequency?.newborns);

    for (const [dayIndex, dayEntry] of nameEntry.days.entries()) {
      const bucket = buckets.get(dayEntry.monthDay) ?? [];
      bucket.push({
        key: `${nameEntry.name}|${dayEntry.monthDay}`,
        matchName: normalizeNameForMatch(nameEntry.name),
        nameEntry,
        dayIndex,
        overallRank,
        newbornRank,
      });
      buckets.set(dayEntry.monthDay, bucket);
    }
  }

  return buckets;
}

function buildDayRankingData(dayEntries, legacyEntry) {
  const byKey = new Map();
  const legacyOrderByKey = new Map();
  const overallSorted = [...dayEntries].sort(compareByOverallRanking);
  const newbornSorted = [...dayEntries].sort(compareByNewbornRanking);
  const combinedSorted = [...dayEntries].sort(compareByCombinedRanking);
  const total = dayEntries.length;

  for (const [index, entry] of overallSorted.entries()) {
    const current = byKey.get(entry.key) ?? {
      dayOrder: null,
      overallRank: entry.overallRank,
      newbornRank: entry.newbornRank,
      overallWeight: 0,
      newbornWeight: 0,
      score: 0,
    };

    current.overallWeight = total - index;
    current.overallRank = entry.overallRank;
    current.newbornRank = entry.newbornRank;
    byKey.set(entry.key, current);
  }

  for (const [index, entry] of newbornSorted.entries()) {
    const current = byKey.get(entry.key) ?? {
      dayOrder: null,
      overallRank: entry.overallRank,
      newbornRank: entry.newbornRank,
      overallWeight: 0,
      newbornWeight: 0,
      score: 0,
    };

    current.newbornWeight = total - index;
    current.overallRank = entry.overallRank;
    current.newbornRank = entry.newbornRank;
    byKey.set(entry.key, current);
  }

  for (const [index, entry] of combinedSorted.entries()) {
    const current = byKey.get(entry.key) ?? {
      dayOrder: null,
      overallRank: entry.overallRank,
      newbornRank: entry.newbornRank,
      overallWeight: 0,
      newbornWeight: 0,
      score: 0,
    };

    current.dayOrder = index + 1;
    current.score = current.overallWeight + current.newbornWeight;
    byKey.set(entry.key, current);
  }

  if (legacyEntry?.preferredNameOrder instanceof Map) {
    for (const entry of dayEntries) {
      const legacyOrder = legacyEntry.preferredNameOrder.get(entry.matchName);

      if (Number.isInteger(legacyOrder)) {
        legacyOrderByKey.set(entry.key, legacyOrder);
      }
    }
  }

  const rankedPrimaryCount = legacyEntry?.preferredNames?.length >= 2 ? 2 : 1;
  const primaryRankedKeys = new Set(
    combinedSorted.slice(0, Math.min(rankedPrimaryCount, combinedSorted.length)).map((entry) => entry.key)
  );

  return {
    byKey,
    legacyOrderByKey,
    primaryRankedKeys,
  };
}

function collectPrimaryAssignmentStats(names) {
  const stats = {
    primaryAssignmentCount: 0,
    primaryLegacyAssignmentCount: 0,
    primaryRankedAssignmentCount: 0,
    primaryDayCount: 0,
    primaryLegacyDayCount: 0,
    primaryRankedDayCount: 0,
  };
  const primaryDays = new Set();
  const legacyDays = new Set();
  const rankedDays = new Set();

  for (const nameEntry of names) {
    for (const dayEntry of nameEntry.days) {
      if (dayEntry.primary) {
        stats.primaryAssignmentCount += 1;
        primaryDays.add(dayEntry.monthDay);
      }

      if (dayEntry.primaryLegacy) {
        stats.primaryLegacyAssignmentCount += 1;
        legacyDays.add(dayEntry.monthDay);
      }

      if (dayEntry.primaryRanked) {
        stats.primaryRankedAssignmentCount += 1;
        rankedDays.add(dayEntry.monthDay);
      }
    }
  }

  stats.primaryDayCount = primaryDays.size;
  stats.primaryLegacyDayCount = legacyDays.size;
  stats.primaryRankedDayCount = rankedDays.size;

  return stats;
}

function compareByCombinedRanking(left, right) {
  return (
    compareWeightedCombinedRanking(left, right) ||
    compareRankDesc(left.newbornRank, right.newbornRank) ||
    compareRankDesc(left.overallRank, right.overallRank) ||
    collator.compare(left.nameEntry.name, right.nameEntry.name)
  );
}

function compareWeightedCombinedRanking(left, right) {
  return weightedCombinedRank(right) - weightedCombinedRank(left);
}

function weightedCombinedRank(entry) {
  const overall = Number.isInteger(entry?.overallRank) ? entry.overallRank : 0;
  const newborn = Number.isInteger(entry?.newbornRank) ? entry.newbornRank : 0;
  return overall * 3 + newborn * 5;
}

function compareByOverallRanking(left, right) {
  return (
    compareRankDesc(left.overallRank, right.overallRank) ||
    compareRankDesc(left.newbornRank, right.newbornRank) ||
    collator.compare(left.nameEntry.name, right.nameEntry.name)
  );
}

function compareByNewbornRanking(left, right) {
  return (
    compareRankDesc(left.newbornRank, right.newbornRank) ||
    compareRankDesc(left.overallRank, right.overallRank) ||
    collator.compare(left.nameEntry.name, right.nameEntry.name)
  );
}

function compareRankDesc(left, right) {
  const leftValue = Number.isInteger(left) ? left : Number.NEGATIVE_INFINITY;
  const rightValue = Number.isInteger(right) ? right : Number.NEGATIVE_INFINITY;

  return rightValue - leftValue;
}

function getFrequencyRank(entry) {
  return Number.isInteger(entry?.rank) ? entry.rank : null;
}

function uniqueNames(values) {
  return Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean))).sort(
    (left, right) => collator.compare(left, right)
  );
}

function normalizeInteger(value) {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizeFrequencyText(value) {
  const normalized = normalizeText(value)
    .replace(/[„”"]/g, "")
    .replace(/[▁▂▃▄▅▆▇█]/g, "")
    .replace(/\s*→\s*$/g, "")
    .trim();

  return normalized || null;
}

function buildFrequency(frequency) {
  return {
    overall: normalizeFrequencyEntry(frequency?.overall),
    newborns: normalizeFrequencyEntry(frequency?.newborns),
  };
}

function normalizeFrequencyEntry(value) {
  const labelHu = normalizeFrequencyText(value);

  if (!labelHu) {
    return null;
  }

  const known = FREQUENCY_SCALE_MAP.get(labelHu);

  if (!known) {
    return {
      labelHu,
      rank: null,
      tag: "unknown",
    };
  }

  return {
    labelHu,
    rank: known.rank,
    tag: known.tag,
  };
}

function buildFrequencyMeta(frequency) {
  const overall = normalizeFrequencyEntry(frequency?.overall);
  const newborns = normalizeFrequencyEntry(frequency?.newborns);
  const overallRank = overall?.rank;
  const newbornRank = newborns?.rank;

  if (!Number.isInteger(overallRank) || !Number.isInteger(newbornRank)) {
    return null;
  }

  const delta = newbornRank - overallRank;

  return {
    delta,
    absoluteDelta: Math.abs(delta),
    direction: frequencyDeltaDirection(delta),
    tag: frequencyDeltaTag(delta),
    labelHu: frequencyDeltaLabelHu(delta),
  };
}

function frequencyDeltaDirection(delta) {
  if (delta === 0) {
    return "flat";
  }

  return delta > 0 ? "up" : "down";
}

function frequencyDeltaTag(delta) {
  if (delta === 0) {
    return "same";
  }

  return delta > 0 ? `up-${delta}` : `down-${Math.abs(delta)}`;
}

function frequencyDeltaLabelHu(delta) {
  if (delta === 0) {
    return "hasonló az újszülötteknél";
  }

  const direction = delta > 0 ? "gyakoribb" : "ritkább";
  const magnitude = Math.abs(delta);

  if (magnitude === 1) {
    return `kissé ${direction} az újszülötteknél`;
  }

  if (magnitude === 2) {
    return `${direction} az újszülötteknél`;
  }

  return `jóval ${direction} az újszülötteknél`;
}

function normalizeFormalizedText(value) {
  const normalized = normalizeText(value)
    .replace(/:"/g, ': "')
    .replace(/\s+"/g, ' "')
    .replace(/"\[/g, '" [')
    .trim();

  return normalized || null;
}

function buildFormalized(value, tokens) {
  const raw = normalizeFormalizedText(value);

  if (!raw) {
    return null;
  }

  const normalizedTokens = normalizeFormalizedTokens(tokens);
  const parsed = parseFormalizedTokens(normalizedTokens);
  const references = uniqueNames(parsed.elements.flatMap((element) => element.references));
  const normalized = normalizeFormalizedText(
    parsed.sequence
      .map((item) => {
        if (item.kind === "element") {
          return parsed.elements[item.index]?.normalized ?? "";
        }

        const operation = parsed.operations[item.index];
        return operation ? `[${operation.normalized}]` : "";
      })
      .filter(Boolean)
      .join(" ")
  );

  return {
    raw,
    normalized: normalized ?? raw,
    references,
    elements: parsed.elements,
    operations: parsed.operations,
    sequence: parsed.sequence,
    steps: parsed.steps,
  };
}

function normalizeFormalizedTokens(tokens) {
  if (!Array.isArray(tokens)) {
    return [];
  }

  return tokens
    .map((token) => {
      const text = normalizeText(token?.text);

      if (!text) {
        return null;
      }

      return {
        kind: token?.kind === "reference" ? "reference" : "text",
        text,
      };
    })
    .filter(Boolean);
}

function parseFormalizedTokens(tokens) {
  const elements = [];
  const operations = [];
  const sequence = [];
  const steps = [];
  let buffer = [];

  const flushElement = () => {
    if (buffer.length === 0) {
      return null;
    }

    const element = createFormalizedElement(elements.length, buffer);
    elements.push(element);
    sequence.push({ kind: "element", index: element.index });
    buffer = [];
    return element;
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token.kind === "text" && token.text === "[") {
      flushElement();

      const operationTokens = [];
      index += 1;

      while (index < tokens.length) {
        const current = tokens[index];

        if (current.kind === "text" && current.text === "]") {
          break;
        }

        operationTokens.push(current);
        index += 1;
      }

      const operation = createFormalizedOperation(operations.length, operationTokens);

      if (operation) {
        operations.push(operation);
        sequence.push({ kind: "operation", index: operation.index });
      }

      continue;
    }

    if (token.kind === "text" && token.text === "]") {
      continue;
    }

    buffer.push(token);
  }

  flushElement();

  for (let index = 0; index < sequence.length; index += 1) {
    const item = sequence[index];

    if (item.kind !== "operation") {
      continue;
    }

    steps.push({
      index: steps.length,
      from: findNearestFormalizedElementIndex(sequence, index, -1),
      operation: item.index,
      to: findNearestFormalizedElementIndex(sequence, index, 1),
    });
  }

  return {
    elements,
    operations,
    sequence,
    steps,
  };
}

function findNearestFormalizedElementIndex(sequence, startIndex, direction) {
  for (
    let index = startIndex + direction;
    index >= 0 && index < sequence.length;
    index += direction
  ) {
    if (sequence[index]?.kind === "element") {
      return sequence[index].index;
    }
  }

  return null;
}

function createFormalizedElement(index, tokens) {
  const raw = normalizeFormalizedText(tokens.map((token) => token.text).join(" ")) ?? "";
  const normalized = normalizeFormalizedElementText(raw) ?? raw;
  const references = uniqueNames(
    tokens.filter((token) => token.kind === "reference").map((token) => token.text)
  );

  return {
    index,
    raw,
    normalized,
    kind: formalizedElementKind(tokens, normalized, references),
    uncertain: raw.includes("?"),
    references,
  };
}

function formalizedElementKind(tokens, normalized, references) {
  if (normalized === "~") {
    return "self";
  }

  if (references.length === 0) {
    return "expression";
  }

  const nonReferenceTokens = tokens
    .filter((token) => token.kind !== "reference")
    .map((token) => token.text)
    .filter((text) => text && text !== "‣" && text !== "|");

  if (nonReferenceTokens.length === 0) {
    return "reference_set";
  }

  return "expression";
}

function normalizeFormalizedElementText(value) {
  const normalized = normalizeFormalizedText(value)?.replace(/\s*‣\s*/g, " ") ?? "";
  return normalizeFormalizedText(normalized);
}

function createFormalizedOperation(index, tokens) {
  const raw = normalizeText(tokens.map((token) => token.text).join(" "));

  if (!raw) {
    return null;
  }

  const { label, normalized, qualifiers, attributes, code } = parseFormalizedOperation(raw);

  return {
    index,
    raw,
    normalized,
    label,
    code,
    qualifiers,
    attributes,
    canonicalized: raw !== normalized,
  };
}

function parseFormalizedOperation(raw) {
  const compact = normalizeText(raw).replace(/\s*=\s*/g, " ").trim();
  const firstParenIndex = compact.indexOf("(");
  const baseRaw = firstParenIndex === -1 ? compact : compact.slice(0, firstParenIndex).trim();
  const qualifierSource = firstParenIndex === -1 ? "" : compact.slice(firstParenIndex);
  const label = canonicalizeOperationLabel(baseRaw);
  const qualifiers = extractTopLevelParentheticalContents(qualifierSource).map(normalizeText);
  const attributes = qualifiers.flatMap((qualifier) => parseFormalizedQualifierAttributes(qualifier));
  const normalized = [label, ...qualifiers.map((qualifier) => `(${qualifier})`)]
    .filter(Boolean)
    .join(" ")
    .trim();

  return {
    label,
    normalized: normalized || label,
    qualifiers,
    attributes,
    code: operationCodeFromLabel(label),
  };
}

function canonicalizeOperationLabel(value) {
  const compact = normalizeText(value).replace(/\s*=\s*/g, " ").trim();
  const slug = operationSlug(compact);

  if (slug === ">") {
    return ">";
  }

  if (["megfeleloje", "megfeloje", "megfeleoje", "mefeleloje"].includes(slug)) {
    return "megfelelője";
  }

  if (["noi parja", "noi valtozata", "noi alakvaltozata"].includes(slug)) {
    return "női párja";
  }

  if (["alakvalt", "alavalt", "alkvalt"].includes(slug)) {
    return "alakvált";
  }

  if (slug === "becezoje") {
    return "becézője";
  }

  if (slug === "rovidulese") {
    return "rövidülése";
  }

  if (slug === "nevalkotas") {
    return "névalkotás";
  }

  if (slug === "formaja") {
    return "formája";
  }

  return compact;
}

function operationCodeFromLabel(label) {
  switch (label) {
    case ">":
      return "derived_from";
    case "megfelelője":
      return "equivalent_of";
    case "női párja":
      return "female_pair_of";
    case "alakvált":
      return "shape_variant";
    case "becézője":
      return "diminutive_of";
    case "rövidülése":
      return "shortening_of";
    case "névalkotás":
      return "name_coinage";
    case "formája":
      return "form_of";
    default:
      return "other";
  }
}

function parseFormalizedQualifierAttributes(value) {
  return splitTopLevel(value, ",")
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^([^()]+?)\s*\((.*)\)$/);

      if (!match) {
        return {
          key: null,
          value: normalizeFormalizedElementText(part) ?? part,
        };
      }

      return {
        key: normalizeText(match[1]),
        value: normalizeFormalizedElementText(match[2]) ?? normalizeText(match[2]),
      };
    });
}

function extractTopLevelParentheticalContents(value) {
  const results = [];
  let depth = 0;
  let buffer = "";

  for (const character of value) {
    if (character === "(") {
      if (depth > 0) {
        buffer += character;
      }

      depth += 1;
      continue;
    }

    if (character === ")") {
      if (depth > 1) {
        buffer += character;
      }

      if (depth > 0) {
        depth -= 1;
      }

      if (depth === 0 && buffer.trim()) {
        results.push(buffer.trim());
        buffer = "";
      }

      continue;
    }

    if (depth > 0) {
      buffer += character;
    }
  }

  if (buffer.trim()) {
    results.push(buffer.trim());
  }

  return results;
}

function splitTopLevel(value, separator) {
  const parts = [];
  let depth = 0;
  let buffer = "";

  for (const character of value) {
    if (character === "(") {
      depth += 1;
      buffer += character;
      continue;
    }

    if (character === ")") {
      if (depth > 0) {
        depth -= 1;
      }

      buffer += character;
      continue;
    }

    if (character === separator && depth === 0) {
      parts.push(buffer);
      buffer = "";
      continue;
    }

    buffer += character;
  }

  parts.push(buffer);
  return parts;
}

function operationSlug(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/=/g, " ")
    .replace(/[^a-z0-9>]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function genderFromUrl(url) {
  if (typeof url !== "string") {
    return null;
  }

  if (url.includes("nem_n%C5%91i")) {
    return "female";
  }

  if (url.includes("nem_f%C3%A9rfi")) {
    return "male";
  }

  return null;
}

function normalizeNullableText(value) {
  const normalized = normalizeText(value);
  return normalized || null;
}

function parseMonthDayValue(value) {
  if (typeof value === "string") {
    const normalized = normalizeText(value);
    const match = normalized.match(/^(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const month = Number(match[1]);
    const day = Number(match[2]);

    if (!isValidMonthDay(month, day)) {
      return null;
    }

    return {
      month,
      day,
      monthDay: formatMonthDay(month, day),
    };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const month =
    Number.isInteger(value.month) && value.month > 0
      ? value.month
      : Number.parseInt(String(value.month ?? ""), 10);
  const day =
    Number.isInteger(value.day) && value.day > 0
      ? value.day
      : Number.parseInt(String(value.day ?? ""), 10);

  if (!isValidMonthDay(month, day)) {
    const monthDay = normalizeText(value.monthDay ?? "");
    const match = monthDay.match(/^(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const parsedMonth = Number(match[1]);
    const parsedDay = Number(match[2]);

    if (!isValidMonthDay(parsedMonth, parsedDay)) {
      return null;
    }

    return {
      month: parsedMonth,
      day: parsedDay,
      monthDay: formatMonthDay(parsedMonth, parsedDay),
    };
  }

  return {
    month,
    day,
    monthDay: formatMonthDay(month, day),
  };
}

function isValidMonthDay(month, day) {
  return Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

function formatMonthDay(month, day) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*→\s*/g, " → ")
    .replace(/\s*‣\s*/g, " ‣ ")
    .replace(/\s+([,.;:!?)\]])/g, "$1")
    .replace(/([([„"])\s+/g, "$1")
    .replace(/\s+([)”"\]])/g, "$1")
    .trim();
}

async function withRetries(task, options) {
  const retries = options?.retries ?? 1;
  const label = options?.label ?? "task";

  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt}/${retries} failed for ${label}: ${error.message}`);

      if (attempt < retries) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError;
}

async function createPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
  return page;
}

async function safeClosePage(page) {
  if (!page) {
    return;
  }

  try {
    await page.close();
  } catch {
    // Ignore close errors from already-closed pages.
  }
}

function sleep(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--headful") {
      options.headful = true;
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

    if (arg === "--primary-registry" && argv[index + 1]) {
      options.primaryRegistry = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--primary-registry=")) {
      options.primaryRegistry = arg.slice("--primary-registry=".length);
      continue;
    }

    if (arg === "--limit" && argv[index + 1]) {
      options.limit = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length));
      continue;
    }

    if (arg === "--concurrency" && argv[index + 1]) {
      options.concurrency = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--concurrency=")) {
      options.concurrency = Number(arg.slice("--concurrency=".length));
    }
  }

  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }

  if (
    options.concurrency != null &&
    (!Number.isInteger(options.concurrency) || options.concurrency < 1)
  ) {
    throw new Error("--concurrency must be a positive integer.");
  }

  return options;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
