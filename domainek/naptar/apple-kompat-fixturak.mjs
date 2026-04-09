/**
 * domainek/naptar/apple-kompat-fixturak.mjs
 * Apple Calendar kompatibilitási kísérleti fixture-öket állít elő.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { mentStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";

const DEFAULT_OUTPUT_DIR = path.join(process.cwd(), "output", "apple-calendar-compat");
const DEFAULT_FROM_YEAR = 2026;
const DEFAULT_UNTIL_YEAR = 2032;
const CALENDAR_TIMEZONE = "Europe/Budapest";
const SOURCE_DAYS = ["02-24", "02-25", "02-26", "02-27", "02-28"];
const SHIFT_MAP = new Map([
  ["02-24", "02-25"],
  ["02-25", "02-26"],
  ["02-26", "02-27"],
  ["02-27", "02-28"],
  ["02-28", "02-29"],
]);

const args = parseArgs(process.argv.slice(2));
const options = normalizeOptions(args);

/**
 * A `main` a modul közvetlen futtatási belépési pontja.
 */
async function main() {
  const outputDir = path.resolve(process.cwd(), options.outputDir);
  const leapYears = buildLeapYears(options.fromYear, options.untilYear);
  const fixtures = buildFixtures(options, leapYears);

  await fs.mkdir(outputDir, { recursive: true });

  const writes = fixtures.map(async (fixture) => {
    const filePath = path.join(outputDir, fixture.filename);
    await fs.writeFile(filePath, serializeCalendar(fixture.calendar), "utf8");
    return {
      id: fixture.id,
      filePath,
      eventCount: fixture.calendar.events.length,
      strategy: fixture.strategy,
    };
  });

  const results = await Promise.all(writes);
  const manifest = {
    generatedAt: new Date().toISOString(),
    fromYear: options.fromYear,
    untilYear: options.untilYear,
    leapYears,
    sourceDays: SOURCE_DAYS.map((monthDay) => ({
      sourceMonthDay: monthDay,
      leapMonthDay: SHIFT_MAP.get(monthDay),
    })),
    files: results,
  };

  await mentStrukturaltFajl(path.join(outputDir, "manifest.yaml"), manifest);

  console.log(`Mentve: ${fixtures.length} kompatibilitási fixture naptár ide: ${outputDir}`);
  for (const result of results) {
    console.log(`- ${result.id}: ${path.basename(result.filePath)} (${result.eventCount} esemény)`);
  }
  console.log(`Szökőévek a tartományban: ${leapYears.join(", ") || "nincs"}`);
}

/**
 * A `buildFixtures` felépíti a szükséges adatszerkezetet.
 */
function buildFixtures(options, leapYears) {
  return [
    {
      id: "A",
      filename: "A-rrule-exdate-rdate.ics",
      strategy: "rrule-exdate-rdate",
      calendar: buildCalendar({
        name: "Apple kompat A — RRULE EXDATE RDATE",
        description:
          "Diagnosztikai fixture: ismétlődő események RRULE + EXDATE + RDATE stratégiával a szökőéves februári eltolásokhoz.",
        events: buildRRuleExdateRdateEvents(options, leapYears),
      }),
    },
    {
      id: "B",
      filename: "B-rrule-recurrence-id.ics",
      strategy: "rrule-recurrence-id-overrides",
      calendar: buildCalendar({
        name: "Apple kompat B — RRULE RECURRENCE-ID",
        description:
          "Diagnosztikai fixture: ismétlődő főesemények és leválasztott RECURRENCE-ID felülírások a szökőéves februári eltolásokhoz.",
        events: buildRecurrenceIdEvents(options, leapYears),
      }),
    },
    {
      id: "C",
      filename: "C-explicit-yearly.ics",
      strategy: "explicit-yearly-events",
      calendar: buildCalendar({
        name: "Apple kompat C — explicit éves",
        description:
          "Diagnosztikai fixture: évente egy explicit esemény a szökőéves februári eltolásokhoz. Kontrollcsoport.",
        events: buildExplicitYearlyEvents(options),
      }),
    },
  ];
}

/**
 * A `buildCalendar` felépíti a szükséges adatszerkezetet.
 */
function buildCalendar({ name, description, events }) {
  return {
    name,
    description,
    events,
  };
}

/**
 * A `buildRRuleExdateRdateEvents` felépíti a szükséges adatszerkezetet.
 */
function buildRRuleExdateRdateEvents(options, leapYears) {
  return SOURCE_DAYS.map((monthDay) => {
    const { month, day } = parseMonthDay(monthDay);
    const leapTarget = SHIFT_MAP.get(monthDay);
    const exdates = leapYears.map((year) => formatDateValue(year, month, day));
    const rdates = leapYears.map((year) => {
      const actual = resolveActualMonthDay(monthDay, year);
      return formatDateValue(year, actual.month, actual.day);
    });

    return {
      uid: buildUid(`A|${monthDay}`),
      dtstart: formatDateValue(options.fromYear, month, day),
      dtend: formatDateValueFromDate(addDays(options.fromYear, month, day, 1)),
      summary: `Kompat ${monthDay}`,
      description: `Forrásnap: ${monthDay}. Szökőéves cél: ${leapTarget}. Stratégia: RRULE + EXDATE + RDATE.`,
      rrule: buildYearlyRRule(month, day, options.untilYear),
      exdates,
      rdates,
    };
  });
}

/**
 * A `buildRecurrenceIdEvents` felépíti a szükséges adatszerkezetet.
 */
function buildRecurrenceIdEvents(options, leapYears) {
  const events = [];

  for (const monthDay of SOURCE_DAYS) {
    const { month, day } = parseMonthDay(monthDay);
    const leapTarget = SHIFT_MAP.get(monthDay);
    const uid = buildUid(`B|${monthDay}`);

    events.push({
      uid,
      dtstart: formatDateValue(options.fromYear, month, day),
      dtend: formatDateValueFromDate(addDays(options.fromYear, month, day, 1)),
      summary: `Kompat ${monthDay}`,
      description: `Forrásnap: ${monthDay}. Szökőéves cél: ${leapTarget}. Stratégia: RRULE + RECURRENCE-ID felülírás.`,
      rrule: buildYearlyRRule(month, day, options.untilYear),
      exdates: [],
      rdates: [],
      sequence: 0,
    });

    for (const year of leapYears) {
      const actual = resolveActualMonthDay(monthDay, year);
      events.push({
        uid,
        recurrenceId: formatDateValue(year, month, day),
        dtstart: formatDateValue(year, actual.month, actual.day),
        dtend: formatDateValueFromDate(addDays(year, actual.month, actual.day, 1)),
        summary: `Kompat ${monthDay}`,
        description: `Leválasztott felülírás ehhez a forrásnaphoz: ${monthDay}, szökőév: ${year}.`,
        sequence: 1,
      });
    }
  }

  return events;
}

/**
 * A `buildExplicitYearlyEvents` felépíti a szükséges adatszerkezetet.
 */
function buildExplicitYearlyEvents(options) {
  const events = [];

  for (let year = options.fromYear; year <= options.untilYear; year += 1) {
    for (const monthDay of SOURCE_DAYS) {
      const actual = resolveActualMonthDay(monthDay, year);
      events.push({
        uid: buildUid(`C|${monthDay}|${year}`),
        dtstart: formatDateValue(year, actual.month, actual.day),
        dtend: formatDateValueFromDate(addDays(year, actual.month, actual.day, 1)),
        summary: `Kompat ${monthDay}`,
        description: `Explicit éves esemény a(z) ${monthDay} forrásnaphoz ${year} évben.`,
      });
    }
  }

  return events;
}

/**
 * A `serializeCalendar` ICS szöveggé alakítja a naptárstruktúrát.
 */
function serializeCalendar(calendar) {
  const dtstamp = formatDateTimeUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//illusionfield//Apple Calendar Kompatibilitási Fixture//HU",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    formatTextProperty("NAME", calendar.name),
    formatTextProperty("X-WR-CALNAME", calendar.name),
    `X-WR-TIMEZONE:${CALENDAR_TIMEZONE}`,
    formatTextProperty("X-WR-CALDESC", calendar.description),
  ];

  for (const event of calendar.events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${event.dtstart}`);
    lines.push(`DTEND;VALUE=DATE:${event.dtend}`);

    if (event.rrule) {
      lines.push(`RRULE:${event.rrule}`);
    }

    if (event.recurrenceId) {
      lines.push(`RECURRENCE-ID;VALUE=DATE:${event.recurrenceId}`);
    }

    if (Array.isArray(event.exdates) && event.exdates.length > 0) {
      lines.push(`EXDATE;VALUE=DATE:${event.exdates.join(",")}`);
    }

    if (Array.isArray(event.rdates) && event.rdates.length > 0) {
      lines.push(`RDATE;VALUE=DATE:${event.rdates.join(",")}`);
    }

    if (Number.isInteger(event.sequence)) {
      lines.push(`SEQUENCE:${event.sequence}`);
    }

    lines.push(formatTextProperty("SUMMARY", event.summary));
    lines.push(formatTextProperty("DESCRIPTION", event.description));
    lines.push("STATUS:CONFIRMED");
    lines.push("TRANSP:TRANSPARENT");
    lines.push(formatTextProperty("CATEGORIES", "Kompatibilitási teszt"));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n").concat("\r\n");
}

/**
 * A `parseArgs` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--output-dir" && argv[index + 1]) {
      options.outputDir = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      continue;
    }

    if (arg === "--from-year" && argv[index + 1]) {
      options.fromYear = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--from-year=")) {
      options.fromYear = Number(arg.slice("--from-year=".length));
      continue;
    }

    if (arg === "--until-year" && argv[index + 1]) {
      options.untilYear = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--until-year=")) {
      options.untilYear = Number(arg.slice("--until-year=".length));
    }
  }

  return options;
}

/**
 * A `normalizeOptions` normalizálja a megadott értéket.
 */
function normalizeOptions(options) {
  const normalized = {
    outputDir: options.outputDir ?? DEFAULT_OUTPUT_DIR,
    fromYear: options.fromYear ?? DEFAULT_FROM_YEAR,
    untilYear: options.untilYear ?? DEFAULT_UNTIL_YEAR,
  };

  if (!Number.isInteger(normalized.fromYear) || normalized.fromYear < 1900) {
    throw new Error("A --from-year kapcsoló értékének érvényes egész évszámnak kell lennie.");
  }

  if (!Number.isInteger(normalized.untilYear) || normalized.untilYear < normalized.fromYear) {
    throw new Error("A --until-year kapcsoló értékének egész évszámnak kell lennie, és nem lehet kisebb a --from-year értékénél.");
  }

  return normalized;
}

/**
 * A `buildLeapYears` felépíti a szükséges adatszerkezetet.
 */
function buildLeapYears(fromYear, untilYear) {
  const years = [];

  for (let year = fromYear; year <= untilYear; year += 1) {
    if (isLeapYear(year)) {
      years.push(year);
    }
  }

  return years;
}

/**
 * A `resolveActualMonthDay` feloldja, hogy egy forrásnap adott évben melyik tényleges napra essen.
 */
function resolveActualMonthDay(sourceMonthDay, year) {
  const shiftedMonthDay = isLeapYear(year) ? SHIFT_MAP.get(sourceMonthDay) : null;
  return parseMonthDay(shiftedMonthDay ?? sourceMonthDay);
}

/**
 * A `buildYearlyRRule` felépíti a szükséges adatszerkezetet.
 */
function buildYearlyRRule(month, day, untilYear) {
  return `FREQ=YEARLY;BYMONTH=${month};BYMONTHDAY=${day};UNTIL=${formatUntilDateTime(untilYear)}`;
}

/**
 * A `buildUid` felépíti a szükséges adatszerkezetet.
 */
function buildUid(seed) {
  const hash = crypto.createHash("sha1").update(seed).digest("hex");
  return `compat-${hash.slice(0, 24)}@nevnapok.local`;
}

/**
 * A `parseMonthDay` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
function parseMonthDay(monthDay) {
  const match = String(monthDay).match(/^(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Érvénytelen hónap-nap érték: ${monthDay}`);
  }

  return {
    month: Number(match[1]),
    day: Number(match[2]),
  };
}

/**
 * Az `addDays` a megadott dátumhoz naptári napokat ad hozzá.
 */
function addDays(year, month, day, amount) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

/**
 * A `formatDateValue` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatDateValue(year, month, day) {
  return `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

/**
 * A `formatDateValueFromDate` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatDateValueFromDate(date) {
  return formatDateValue(date.year, date.month, date.day);
}

/**
 * A `formatUntilDateTime` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatUntilDateTime(year) {
  return `${String(year).padStart(4, "0")}1231T235959Z`;
}

/**
 * A `formatDateTimeUtc` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatDateTimeUtc(date) {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}Z`;
}

/**
 * A `formatTextProperty` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatTextProperty(name, value) {
  return `${name}:${escapeText(value)}`;
}

/**
 * A `escapeText` kimenetbiztos alakra escape-eli a szöveget.
 */
function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * A `foldLine` a célformátum szabályai szerint tördel egy sort.
 */
function foldLine(line) {
  if (line.length <= 75) {
    return line;
  }

  const chunks = [];
  let current = line;

  while (current.length > 75) {
    chunks.push(current.slice(0, 75));
    current = ` ${current.slice(75)}`;
  }

  chunks.push(current);
  return chunks.join("\r\n");
}

/**
 * A `isLeapYear` ellenőrzi a kapcsolódó feltételt.
 */
function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
