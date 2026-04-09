import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

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

  await fs.writeFile(
    path.join(outputDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8"
  );

  console.log(`Saved ${fixtures.length} compatibility fixture calendars to ${outputDir}`);
  for (const result of results) {
    console.log(`- ${result.id}: ${path.basename(result.filePath)} (${result.eventCount} event(s))`);
  }
  console.log(`Leap years in range: ${leapYears.join(", ") || "none"}`);
}

function buildFixtures(options, leapYears) {
  return [
    {
      id: "A",
      filename: "A-rrule-exdate-rdate.ics",
      strategy: "rrule-exdate-rdate",
      calendar: buildCalendar({
        name: "Apple Compat A — RRULE EXDATE RDATE",
        description:
          "Diagnostic fixture: recurring events with RRULE + EXDATE + RDATE for leap-year February shifts.",
        events: buildRRuleExdateRdateEvents(options, leapYears),
      }),
    },
    {
      id: "B",
      filename: "B-rrule-recurrence-id.ics",
      strategy: "rrule-recurrence-id-overrides",
      calendar: buildCalendar({
        name: "Apple Compat B — RRULE RECURRENCE-ID",
        description:
          "Diagnostic fixture: recurring master events plus detached RECURRENCE-ID overrides for leap-year February shifts.",
        events: buildRecurrenceIdEvents(options, leapYears),
      }),
    },
    {
      id: "C",
      filename: "C-explicit-yearly.ics",
      strategy: "explicit-yearly-events",
      calendar: buildCalendar({
        name: "Apple Compat C — explicit yearly",
        description:
          "Diagnostic fixture: one explicit event per year for leap-year February shifts. Control group.",
        events: buildExplicitYearlyEvents(options),
      }),
    },
  ];
}

function buildCalendar({ name, description, events }) {
  return {
    name,
    description,
    events,
  };
}

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
      summary: `Compat ${monthDay}`,
      description: `Source day ${monthDay}. Leap-year target: ${leapTarget}. Strategy: RRULE + EXDATE + RDATE.`,
      rrule: buildYearlyRRule(month, day, options.untilYear),
      exdates,
      rdates,
    };
  });
}

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
      summary: `Compat ${monthDay}`,
      description: `Source day ${monthDay}. Leap-year target: ${leapTarget}. Strategy: RRULE + RECURRENCE-ID override.`,
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
        summary: `Compat ${monthDay}`,
        description: `Detached override for ${monthDay} in leap year ${year}.`,
        sequence: 1,
      });
    }
  }

  return events;
}

function buildExplicitYearlyEvents(options) {
  const events = [];

  for (let year = options.fromYear; year <= options.untilYear; year += 1) {
    for (const monthDay of SOURCE_DAYS) {
      const actual = resolveActualMonthDay(monthDay, year);
      events.push({
        uid: buildUid(`C|${monthDay}|${year}`),
        dtstart: formatDateValue(year, actual.month, actual.day),
        dtend: formatDateValueFromDate(addDays(year, actual.month, actual.day, 1)),
        summary: `Compat ${monthDay}`,
        description: `Explicit yearly event for source day ${monthDay} in ${year}.`,
      });
    }
  }

  return events;
}

function serializeCalendar(calendar) {
  const dtstamp = formatDateTimeUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//illusionfield//Apple Calendar Compatibility Fixture//EN",
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
    lines.push(formatTextProperty("CATEGORIES", "Compatibility Test"));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n").concat("\r\n");
}

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

function normalizeOptions(options) {
  const normalized = {
    outputDir: options.outputDir ?? DEFAULT_OUTPUT_DIR,
    fromYear: options.fromYear ?? DEFAULT_FROM_YEAR,
    untilYear: options.untilYear ?? DEFAULT_UNTIL_YEAR,
  };

  if (!Number.isInteger(normalized.fromYear) || normalized.fromYear < 1900) {
    throw new Error("--from-year must be a valid integer year.");
  }

  if (!Number.isInteger(normalized.untilYear) || normalized.untilYear < normalized.fromYear) {
    throw new Error("--until-year must be an integer year greater than or equal to --from-year.");
  }

  return normalized;
}

function buildLeapYears(fromYear, untilYear) {
  const years = [];

  for (let year = fromYear; year <= untilYear; year += 1) {
    if (isLeapYear(year)) {
      years.push(year);
    }
  }

  return years;
}

function resolveActualMonthDay(sourceMonthDay, year) {
  const shiftedMonthDay = isLeapYear(year) ? SHIFT_MAP.get(sourceMonthDay) : null;
  return parseMonthDay(shiftedMonthDay ?? sourceMonthDay);
}

function buildYearlyRRule(month, day, untilYear) {
  return `FREQ=YEARLY;BYMONTH=${month};BYMONTHDAY=${day};UNTIL=${formatUntilDateTime(untilYear)}`;
}

function buildUid(seed) {
  const hash = crypto.createHash("sha1").update(seed).digest("hex");
  return `compat-${hash.slice(0, 24)}@nevnapok.local`;
}

function parseMonthDay(monthDay) {
  const match = String(monthDay).match(/^(\d{2})-(\d{2})$/);

  if (!match) {
    throw new Error(`Invalid month-day value: ${monthDay}`);
  }

  return {
    month: Number(match[1]),
    day: Number(match[2]),
  };
}

function addDays(year, month, day, amount) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);

  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function formatDateValue(year, month, day) {
  return `${String(year).padStart(4, "0")}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}`;
}

function formatDateValueFromDate(date) {
  return formatDateValue(date.year, date.month, date.day);
}

function formatUntilDateTime(year) {
  return `${String(year).padStart(4, "0")}1231T235959Z`;
}

function formatDateTimeUtc(date) {
  return `${String(date.getUTCFullYear()).padStart(4, "0")}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}T${String(date.getUTCHours()).padStart(2, "0")}${String(date.getUTCMinutes()).padStart(2, "0")}${String(date.getUTCSeconds()).padStart(2, "0")}Z`;
}

function formatTextProperty(name, value) {
  return `${name}:${escapeText(value)}`;
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

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

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
