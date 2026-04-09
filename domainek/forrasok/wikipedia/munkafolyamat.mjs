/**
 * domainek/forrasok/wikipedia/munkafolyamat.mjs
 * A Wikipédia napi oldalairól primer névnapokat gyűjtő folyamat.
 */
import path from "node:path";
import puppeteer from "puppeteer";
import { normalizeNameForMatch } from "../../primer/alap.mjs";
import { epitPuppeteerInditasiBeallitasokat } from "../../../kozos/puppeteer-inditas.mjs";
import { mentStrukturaltFajl } from "../../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../../kozos/utvonalak.mjs";

const WIKIPEDIA_CATEGORY_URL = "https://hu.wikipedia.org/wiki/Kategória:Az_év_napjai";
const DEFAULT_OUTPUT_PATH = kanonikusUtvonalak.primer.wiki;
const DEFAULT_CONCURRENCY = 8;
const DEFAULT_TIMEOUT_MS = 60_000;
const DAY_LINK_SELECTORS = [
  "table:not(.toccolours) tr .toccolours tbody tr:nth-child(n+3) td:not([colspan]) a",
  "table.toccolours tbody tr:nth-child(n+3) td:not([colspan]) a",
  "table.toccolours td:not([colspan]) a",
];
const MONTH_NAME_TO_NUMBER = new Map([
  ["január", 1],
  ["február", 2],
  ["március", 3],
  ["április", 4],
  ["május", 5],
  ["június", 6],
  ["július", 7],
  ["augusztus", 8],
  ["szeptember", 9],
  ["október", 10],
  ["november", 11],
  ["december", 12],
]);

const args = parseArgs(process.argv.slice(2));
const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_OUTPUT_PATH);
const concurrency = args.concurrency ?? DEFAULT_CONCURRENCY;
const limit = args.limit ?? null;

/**
 * A `main` a modul közvetlen futtatási belépési pontja.
 */
async function main() {
  console.log("A Wikipédia-névnapgyűjtés elindult.");

  const browser = await puppeteer.launch(epitPuppeteerInditasiBeallitasokat(args));

  try {
    const discoveredDays = await discoverDayPages(browser);
    const selectedDays = limit ? discoveredDays.slice(0, limit) : discoveredDays;

    console.log(
      `Összesen ${discoveredDays.length} Wikipédia-napi oldal került felderítésre, ezek közül ${selectedDays.length} oldal kerül feldolgozásra ${concurrency} párhuzamos feldolgozóval.`
    );

    const scrapedDays = await scrapeDayPages(browser, selectedDays, concurrency);
    const days = applyWikipediaLeapDayExceptions(scrapedDays);
    const payload = buildPayload(days);

    await mentStrukturaltFajl(outputPath, payload);

    console.log(`Mentve: ${days.length} Wikipédia-primer nap ide: ${outputPath}`);
  } finally {
    await browser.close();
  }
}

/**
 * A `discoverDayPages` összegyűjti a szükséges elemeket.
 */
async function discoverDayPages(browser) {
  const page = await createPage(browser);

  try {
    await page.goto(WIKIPEDIA_CATEGORY_URL, { waitUntil: "domcontentloaded" });

    const selection = await page.evaluate((selectors) => {
      for (const selector of selectors) {
        const links = Array.from(document.querySelectorAll(selector)).map((link) => ({
          href: link.href,
          title: link.getAttribute("title") ?? "",
          text: link.textContent?.trim() ?? "",
        }));

        if (links.length > 0) {
          return {
            selector,
            links,
          };
        }
      }

      return {
        selector: null,
        links: [],
      };
    }, DAY_LINK_SELECTORS);

    if (!selection.links.length) {
      throw new Error("A Wikipédia kategóriaoldalán nem találhatók napi oldalakra mutató linkek.");
    }

    const deduped = new Map();

    for (const candidate of selection.links) {
      const parsed = parseWikipediaDayLink(candidate);

      if (!parsed) {
        continue;
      }

      deduped.set(parsed.monthDay, parsed);
    }

    const days = Array.from(deduped.values()).sort((left, right) => {
      if (left.month !== right.month) {
        return left.month - right.month;
      }

      return left.day - right.day;
    });

    console.log(`Használt kategóriaszelektor: ${selection.selector}`);
    console.log(`Összesen ${days.length} különálló Wikipédia-napi link került felderítésre.`);

    return days;
  } finally {
    await safeClosePage(page);
  }
}

/**
 * A `parseWikipediaDayLink` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
function parseWikipediaDayLink(candidate) {
  const href = toAbsoluteUrl(candidate.href, WIKIPEDIA_CATEGORY_URL);
  const titleCandidate = normalizeWhitespace(candidate.title || candidate.text || deriveTitleFromHref(href));
  const match = titleCandidate.match(/^(.*)\s+(\d{1,2})\.$/u);

  if (!match) {
    return null;
  }

  const monthName = normalizeWhitespace(match[1]).toLocaleLowerCase("hu-HU");
  const month = MONTH_NAME_TO_NUMBER.get(monthName);
  const day = Number(match[2]);

  if (!month || !Number.isInteger(day) || day < 1 || day > 31) {
    return null;
  }

  return {
    month,
    day,
    monthDay: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    url: href,
    title: titleCandidate,
  };
}

/**
 * A `scrapeDayPages` kinyeri a szükséges adatokat a forrásoldalról.
 */
async function scrapeDayPages(browser, dayPages, concurrencyLimit) {
  const results = new Array(dayPages.length);
  let cursor = 0;
  const workerCount = Math.max(1, Math.min(concurrencyLimit, dayPages.length || 1));

  const workers = Array.from({ length: workerCount }, async () => {
    let page = await createPage(browser);

    try {
      while (cursor < dayPages.length) {
        const currentIndex = cursor;
        cursor += 1;

        const dayMeta = dayPages[currentIndex];
        const result = await retryScrapeDay(browser, page, dayMeta);
        page = result.page;
        results[currentIndex] = result.data;

        console.log(
          `[${String(currentIndex + 1).padStart(String(dayPages.length).length, "0")}/${dayPages.length}] ${dayMeta.monthDay} (${result.data.preferredNames.length} primary / ${result.data.names.length} total)`
        );
      }
    } finally {
      await safeClosePage(page);
    }
  });

  await Promise.all(workers);

  return results.sort((left, right) => {
    if (left.month !== right.month) {
      return left.month - right.month;
    }

    return left.day - right.day;
  });
}

/**
 * A `retryScrapeDay` újrapróbálásokkal futtatja a kapcsolódó műveletet.
 */
async function retryScrapeDay(browser, page, dayMeta) {
  const retries = 3;
  let currentPage = page;
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const data = await scrapeDay(currentPage, dayMeta);
      return {
        data,
        page: currentPage,
      };
    } catch (error) {
      lastError = error;
      console.warn(`${attempt}/${retries}. kísérlet sikertelen ennél a napnál: ${dayMeta.monthDay}. ${error.message}`);

      await safeClosePage(currentPage);
      currentPage = await createPage(browser);

      if (attempt < retries) {
        await sleep(500 * attempt);
      }
    }
  }

  throw lastError;
}

/**
 * A `scrapeDay` kinyeri a szükséges adatokat a forrásoldalról.
 */
async function scrapeDay(page, dayMeta) {
  await page.goto(dayMeta.url, { waitUntil: "domcontentloaded" });

  const pairs = await page.evaluate(() => {
    const normalize = (value) =>
      String(value ?? "")
        .replace(/\s+/g, " ")
        .replace(/^[,;+.:\s]+|[,;+.:\s]+$/g, "")
        .trim();
    const allowedTags = new Set(["a", "b"]);

    const extractNamesFromElement = (element, isPrimary) => {
      const anchorTexts = Array.from(element.querySelectorAll("a"))
        .map((anchor) => normalize(anchor.innerText))
        .filter(Boolean);

      if (anchorTexts.length > 0) {
        return anchorTexts.map((name) => [name, isPrimary]);
      }

      return normalize(element.innerText)
        .split(/\s*(?:,|\+)\s*/)
        .map((name) => normalize(name))
        .filter(Boolean)
        .map((name) => [name, isPrimary]);
    };

    const collectPairs = (labelElement) => {
      const result = [];
      let sibling = labelElement?.nextElementSibling ?? null;

      while (sibling) {
        const tagName = sibling.tagName.toLowerCase();
        const siblingText = normalize(sibling.innerText);

        if (siblingText === "Szökőévben") {
          break;
        }

        if (allowedTags.has(tagName)) {
          result.push(...extractNamesFromElement(sibling, tagName === "b"));
        }

        sibling = sibling.nextElementSibling;
      }

      return result;
    };

    const exactLabel = document.evaluate(
      "//*[normalize-space(text())='Névnapok']",
      document,
      null,
      XPathResult.FIRST_ORDERED_NODE_TYPE,
      null
    ).singleNodeValue;

    if (exactLabel) {
      return collectPairs(exactLabel);
    }

    const labelLink = Array.from(document.querySelectorAll("a")).find(
      (anchor) => normalize(anchor.textContent) === "Névnapok"
    );

    if (labelLink) {
      return collectPairs(labelLink);
    }

    const paragraph = Array.from(document.querySelectorAll("p")).find((element) =>
      normalize(element.textContent).startsWith("Névnapok")
    );

    if (!paragraph) {
      return [];
    }

    return Array.from(paragraph.children)
      .filter((element) => allowedTags.has(element.tagName.toLowerCase()))
      .map((element) => [normalize(element.innerText), element.tagName.toLowerCase() === "b"])
      .filter(([text]) => Boolean(text) && text !== "Névnapok");
  });

  const names = dedupeKeepOrder(pairs.map(([name]) => name));
  const preferredNames = dedupeKeepOrder(
    pairs.filter(([, isPrimary]) => isPrimary).map(([name]) => name)
  );

  if (names.length === 0) {
    console.warn(`Nem található Wikipédia-névnap ennél a napnál: ${dayMeta.monthDay} (${dayMeta.url}).`);
  }

  return {
    month: dayMeta.month,
    day: dayMeta.day,
    monthDay: dayMeta.monthDay,
    names,
    preferredNames,
  };
}

/**
 * A `applyWikipediaLeapDayExceptions` alkalmazza a kapcsolódó szabályt vagy módosítást.
 */
function applyWikipediaLeapDayExceptions(days) {
  const clonedDays = days.map((entry) => ({
    ...entry,
    names: entry.names.filter((name) => name !== "Szökőévben"),
    preferredNames: entry.preferredNames.filter((name) => name !== "Szökőévben"),
  }));
  const dayMap = new Map(clonedDays.map((entry) => [entry.monthDay, entry]));
  const februaryTwentyEighth = dayMap.get("02-28");

  if (februaryTwentyEighth && !dayMap.has("02-29")) {
    dayMap.set("02-29", {
      month: 2,
      day: 29,
      monthDay: "02-29",
      names: [...februaryTwentyEighth.names],
      preferredNames: [...februaryTwentyEighth.preferredNames],
    });
  }

  return Array.from(dayMap.values()).sort((left, right) => {
    if (left.month !== right.month) {
      return left.month - right.month;
    }

    return left.day - right.day;
  });
}

/**
 * A `buildPayload` felépíti a szükséges adatszerkezetet.
 */
function buildPayload(days) {
  const stats = {
    dayCount: days.length,
    preferredNameCount: days.reduce((sum, entry) => sum + entry.preferredNames.length, 0),
    oneNameDays: days.filter((entry) => entry.names.length === 1).length,
    twoNameDays: days.filter((entry) => entry.names.length === 2).length,
    threeOrMoreNameDays: days.filter((entry) => entry.names.length >= 3).length,
  };

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceFile: WIKIPEDIA_CATEGORY_URL,
    stats,
    days,
  };
}

/**
 * A `dedupeKeepOrder` eltávolítja a duplikátumokat az első előfordulások sorrendjét megtartva.
 */
function dedupeKeepOrder(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeNameForMatch(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

/**
 * A `deriveTitleFromHref` származtatott értéket képez a bemenetből.
 */
function deriveTitleFromHref(href) {
  try {
    const url = new URL(href, WIKIPEDIA_CATEGORY_URL);
    return decodeURIComponent(url.pathname.replace(/^\/wiki\//, "")).replace(/_/g, " ");
  } catch {
    return "";
  }
}

/**
 * A `toAbsoluteUrl` átalakítja az értéket a kívánt formára.
 */
function toAbsoluteUrl(value, baseUrl) {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return value;
  }
}

/**
 * A `normalizeWhitespace` normalizálja a megadott értéket.
 */
function normalizeWhitespace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A `createPage` új, előkonfigurált böngészőoldalt hoz létre.
 */
async function createPage(browser) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(DEFAULT_TIMEOUT_MS);
  return page;
}

/**
 * A `safeClosePage` csendben bezárja az oldalt, ha az még nyitva van.
 */
async function safeClosePage(page) {
  if (!page) {
    return;
  }

  try {
    await page.close();
  } catch {
    // A már bezárt oldalak zárási hibáit figyelmen kívül hagyjuk.
  }
}

/**
 * A `sleep` egyszerű várakozó Promise-t ad vissza.
 */
function sleep(timeoutMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}

/**
 * A `parseArgs` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
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
    throw new Error("A --limit kapcsoló értékének pozitív egésznek kell lennie.");
  }

  if (
    options.concurrency != null &&
    (!Number.isInteger(options.concurrency) || options.concurrency < 1)
  ) {
    throw new Error("A --concurrency kapcsoló értékének pozitív egésznek kell lennie.");
  }

  return options;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
