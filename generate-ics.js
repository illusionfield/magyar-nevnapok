import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_INPUT_PATH = path.join(process.cwd(), "output", "nevnapok.json");
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "output", "nevnapok.ics");
const DEFAULT_CALENDAR_NAME = "Névnapok";
const CURRENT_YEAR = new Date().getFullYear();
const PLAIN_DETAIL_LABEL_WIDTH = 19;

const args = parseArgs(process.argv.slice(2));
const options = normalizeOptions(args);

async function main() {
  const inputPath = path.resolve(process.cwd(), options.input);
  const outputPath = path.resolve(process.cwd(), options.output);

  const raw = await fs.readFile(inputPath, "utf8");
  const payload = JSON.parse(raw);
  const sourceDays = Array.isArray(payload.days)
    ? normalizeSourceDays(payload.days)
    : buildDaysFromNames(payload.names);
  const sourceNameMap = buildNameMapFromSourceDays(sourceDays);

  const events =
    options.leapMode === "hungarian-until-2050"
      ? buildLeapAwareRecurringEvents(sourceDays, sourceNameMap, options)
      : buildRecurringEvents(sourceDays, sourceNameMap, options);

  const calendarText = serializeCalendar(events, payload, options);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, calendarText, "utf8");

  console.log(`Saved ${events.length} event(s) to ${outputPath}`);
}

function normalizeSourceDays(days) {
  if (!Array.isArray(days)) {
    throw new Error("Input JSON does not contain a valid days array.");
  }

  return days
    .map((day) => ({
      monthDay: day.monthDay,
      month: Number(day.month),
      day: Number(day.day),
      names: Array.isArray(day.names) ? day.names : [],
    }))
    .sort((left, right) => left.monthDay.localeCompare(right.monthDay));
}

function buildDaysFromNames(names) {
  if (!Array.isArray(names)) {
    throw new Error("Input JSON does not contain a valid names or days array.");
  }

  const dayMap = new Map();

  for (const nameEntry of names) {
    const name = nameEntry?.name;
    const days = normalizeNamedayEntries(nameEntry?.days);

    for (const dayEntry of days) {
      const bucket = dayMap.get(dayEntry.monthDay) ?? {
        monthDay: dayEntry.monthDay,
        month: dayEntry.month,
        day: dayEntry.day,
        names: [],
      };

      bucket.names.push({
        name,
        gender: {
          label: nameEntry.gender ?? null,
        },
        origin: nameEntry.origin ?? null,
        meaning: nameEntry.meaning ?? null,
        nicknames: Array.isArray(nameEntry.nicknames) ? nameEntry.nicknames : [],
        relatedNames: Array.isArray(nameEntry.relatedNames) ? nameEntry.relatedNames : [],
        frequency: nameEntry.frequency ?? null,
        meta: nameEntry.meta ?? null,
      });

      dayMap.set(dayEntry.monthDay, bucket);
    }
  }

  return Array.from(dayMap.values())
    .map((day) => ({
      ...day,
      names: day.names.sort((left, right) => left.name.localeCompare(right.name, "hu")),
    }))
    .sort((left, right) => left.monthDay.localeCompare(right.monthDay));
}

function buildNameMapFromSourceDays(sourceDays) {
  const nameMap = new Map();

  for (const day of sourceDays) {
    for (const nameEntry of day.names) {
      const list = nameMap.get(nameEntry.name) ?? [];
      list.push(day.monthDay);
      nameMap.set(nameEntry.name, list);
    }
  }

  for (const [name, days] of nameMap.entries()) {
    nameMap.set(name, uniqueSorted(days));
  }

  return nameMap;
}

function buildExplicitEvents(sourceDays, sourceNameMap, options) {
  const events = [];

  for (let year = options.fromYear; year <= options.untilYear; year += 1) {
    const actualDays = sourceDays
      .map((sourceDay) => {
        const actualDate = resolveActualDate(year, sourceDay, options.leapMode);

        return {
          year,
          sourceDay,
          actualDate,
        };
      })
      .sort((left, right) => {
        const leftKey = formatMonthDay(left.actualDate.month, left.actualDate.day);
        const rightKey = formatMonthDay(right.actualDate.month, right.actualDate.day);
        return leftKey.localeCompare(rightKey);
      });

    const yearNameMap = buildYearNameMap(actualDays);

    for (const actualDay of actualDays) {
      if (options.mode === "together") {
        events.push(
          buildGroupedEvent({
            sourceDay: actualDay.sourceDay,
            actualDate: actualDay.actualDate,
            sourceNameMap,
            actualNameMap: yearNameMap,
            options,
            year,
          })
        );
        continue;
      }

      for (const nameEntry of actualDay.sourceDay.names) {
        events.push(
          buildSingleNameEvent({
            nameEntry,
            sourceDay: actualDay.sourceDay,
            actualDate: actualDay.actualDate,
            sourceNameMap,
            actualNameMap: yearNameMap,
            options,
            year,
          })
        );
      }
    }
  }

  return events;
}

function buildLeapAwareRecurringEvents(sourceDays, sourceNameMap, options) {
  const events = [];

  for (const sourceDay of sourceDays) {
    const actualDate = {
      year: options.fromYear,
      month: sourceDay.month,
      day: sourceDay.day,
      monthDay: sourceDay.monthDay,
      sourceMonthDay: sourceDay.monthDay,
      shifted: false,
      leapRule: buildLeapRuleForSourceDay(sourceDay),
    };

    const recurrence = buildLeapAwareRecurrence(sourceDay, options);

    if (options.mode === "together") {
      const event = buildGroupedEvent({
        sourceDay,
        actualDate,
        sourceNameMap,
        actualNameMap: sourceNameMap,
        options,
        year: null,
      });
      event.rrule = recurrence.rrule;
      event.rdates = recurrence.rdates;
      event.exdates = recurrence.exdates;
      events.push(event);
      continue;
    }

    for (const nameEntry of sourceDay.names) {
      const event = buildSingleNameEvent({
        nameEntry,
        sourceDay,
        actualDate,
        sourceNameMap,
        actualNameMap: sourceNameMap,
        options,
        year: null,
      });
      event.rrule = recurrence.rrule;
      event.rdates = recurrence.rdates;
      event.exdates = recurrence.exdates;
      events.push(event);
    }
  }

  return events;
}

function buildRecurringEvents(sourceDays, sourceNameMap, options) {
  const events = [];

  for (const sourceDay of sourceDays) {
    const actualDate = {
      year: options.baseYear,
      month: sourceDay.month,
      day: sourceDay.day,
      monthDay: sourceDay.monthDay,
      sourceMonthDay: sourceDay.monthDay,
      shifted: false,
    };

    if (options.mode === "together") {
      events.push(
        buildGroupedEvent({
          sourceDay,
          actualDate,
          sourceNameMap,
          actualNameMap: sourceNameMap,
          options,
          year: null,
        })
      );
      continue;
    }

    for (const nameEntry of sourceDay.names) {
      events.push(
        buildSingleNameEvent({
          nameEntry,
          sourceDay,
          actualDate,
          sourceNameMap,
          actualNameMap: sourceNameMap,
          options,
          year: null,
        })
      );
    }
  }

  return events;
}

function buildYearNameMap(actualDays) {
  const nameMap = new Map();

  for (const actualDay of actualDays) {
    const monthDay = formatMonthDay(actualDay.actualDate.month, actualDay.actualDate.day);

    for (const nameEntry of actualDay.sourceDay.names) {
      const list = nameMap.get(nameEntry.name) ?? [];
      list.push(monthDay);
      nameMap.set(nameEntry.name, list);
    }
  }

  for (const [name, days] of nameMap.entries()) {
    nameMap.set(name, uniqueSorted(days));
  }

  return nameMap;
}

function buildLeapRuleForSourceDay(sourceDay) {
  const shiftedMap = new Map([
    ["02-24", "02-25"],
    ["02-25", "02-26"],
    ["02-26", "02-27"],
    ["02-27", "02-28"],
    ["02-28", "02-29"],
  ]);

  const shiftedMonthDay = shiftedMap.get(sourceDay.monthDay);

  if (!shiftedMonthDay) {
    return null;
  }

  const shifted = parseNamedayValue(shiftedMonthDay);

  if (!shifted) {
    return null;
  }

  return {
    sourceMonthDay: sourceDay.monthDay,
    shiftedMonthDay,
    shiftedMonth: shifted.month,
    shiftedDay: shifted.day,
  };
}

function buildLeapAwareRecurrence(sourceDay, options) {
  const rrule = buildYearlyRRule(sourceDay.month, sourceDay.day, options);
  const leapRule = buildLeapRuleForSourceDay(sourceDay);

  if (!leapRule) {
    return {
      rrule,
      rdates: [],
      exdates: [],
    };
  }

  const leapYears = [];

  for (let year = options.fromYear; year <= options.untilYear; year += 1) {
    if (isLeapYear(year)) {
      leapYears.push(year);
    }
  }

  return {
    rrule,
    exdates: leapYears.map((year) => formatDateValue(year, sourceDay.month, sourceDay.day)),
    rdates: leapYears.map((year) =>
      formatDateValue(year, leapRule.shiftedMonth, leapRule.shiftedDay)
    ),
  };
}

function buildGroupedEvent(context) {
  const { sourceDay, actualDate, options, year } = context;
  const summaryBase = sourceDay.names.map((entry) => entry.name).join(", ");
  const ordinalText =
    options.ordinalDay === "summary" ? buildOrdinalTextForEvent(actualDate, year) : null;

  return {
    uid: buildUid({
      type: "grouped",
      key: `${sourceDay.monthDay}|${year ?? "rrule"}|${actualDate.monthDay}`,
    }),
    summary: ordinalText ? `${summaryBase} (${ordinalText})` : summaryBase,
    startDate: formatDateValue(actualDate.year, actualDate.month, actualDate.day),
    endDate: formatDateValueFromDate(addDays(actualDate.year, actualDate.month, actualDate.day, 1)),
    rrule: year == null ? buildYearlyRRule(sourceDay.month, sourceDay.day, options) : null,
    description: buildGroupedDescription(context),
  };
}

function buildSingleNameEvent(context) {
  const { nameEntry, sourceDay, actualDate, options, year } = context;
  const ordinalText =
    options.ordinalDay === "summary" ? buildOrdinalTextForEvent(actualDate, year) : null;

  return {
    uid: buildUid({
      type: "single",
      key: `${nameEntry.name}|${sourceDay.monthDay}|${year ?? "rrule"}|${actualDate.monthDay}`,
    }),
    summary: ordinalText ? `${nameEntry.name} (${ordinalText})` : nameEntry.name,
    startDate: formatDateValue(actualDate.year, actualDate.month, actualDate.day),
    endDate: formatDateValueFromDate(addDays(actualDate.year, actualDate.month, actualDate.day, 1)),
    rrule: year == null ? buildYearlyRRule(sourceDay.month, sourceDay.day, options) : null,
    description: buildSingleNameDescription(context),
  };
}

function buildGroupedDescription(context) {
  const { sourceDay, actualDate, sourceNameMap, actualNameMap, options, year } = context;
  const needsMetadata = options.descriptionMode !== "none";
  const needsOtherDays = options.includeOtherDays;
  const needsOrdinal = options.ordinalDay === "description";
  const needsShiftNote = actualDate.shifted && options.descriptionMode !== "none";
  const wantsHtml = options.descriptionFormat === "html" || options.descriptionFormat === "full";

  if (!needsMetadata && !needsOtherDays && !needsOrdinal && !needsShiftNote) {
    return null;
  }

  const plainLines = [];
  const htmlParts = wantsHtml ? [] : null;

  if (needsMetadata || needsOtherDays) {
    if (options.descriptionMode === "detailed") {
      const header = buildDetailedDateHeader(actualDate, year, needsOrdinal || year != null);

      if (header) {
        plainLines.push(header);
        plainLines.push("-------------------------------------");
        if (htmlParts) {
          htmlParts.push(`<p><strong>${escapeHtml(header)}</strong></p><hr>`);
        }
      } else if (needsShiftNote) {
        const shiftOverview = buildLeapShiftOverview(actualDate, year);
        if (shiftOverview) {
          plainLines.push(shiftOverview);
          if (htmlParts) {
            htmlParts.push(`<p><strong>${escapeHtml(shiftOverview)}</strong></p>`);
          }
        }
      }

      if (htmlParts) {
        htmlParts.push("<ul>");
      }

      for (const nameEntry of sourceDay.names) {
        const otherDays = buildOtherDaysList(
          actualNameMap.get(nameEntry.name) ?? sourceNameMap.get(nameEntry.name) ?? [],
          actualDate.monthDay
        );
        const decoratedNameEntry = decorateNameEntryForDescription(nameEntry, actualDate, year);

        plainLines.push(...buildDetailedPlainLines(decoratedNameEntry, otherDays, 0));
        if (nameEntry !== sourceDay.names[sourceDay.names.length - 1]) {
          plainLines.push("");
        }
        if (htmlParts) {
          htmlParts.push(buildDetailedHtmlItem(decoratedNameEntry, otherDays));
        }
      }

      if (htmlParts) {
        htmlParts.push("</ul>");
      }
    } else {
      if (needsShiftNote) {
        const shiftOverview = buildLeapShiftOverview(actualDate, year);
        if (shiftOverview) {
          plainLines.push(shiftOverview);
          if (htmlParts) {
            htmlParts.push(`<p><strong>${escapeHtml(shiftOverview)}</strong></p>`);
          }
        }
      }

      if (needsOrdinal) {
        const ordinalText = buildOrdinalTextForEvent(actualDate, year);
        plainLines.push(`Az év napja: ${ordinalText}.`);
        if (htmlParts) {
          htmlParts.push(`<p><strong>Az év napja:</strong> ${escapeHtml(ordinalText)}.</p>`);
        }
      }

      plainLines.push("Névnapok:");
      if (htmlParts) {
        htmlParts.push("<p><strong>Névnapok:</strong></p><ul>");
      }

      for (const nameEntry of sourceDay.names) {
        const otherDays = buildOtherDaysList(
          actualNameMap.get(nameEntry.name) ?? sourceNameMap.get(nameEntry.name) ?? [],
          actualDate.monthDay
        );

        const plainLine = buildCompactPlainLine(nameEntry, otherDays);
        plainLines.push(`- ${plainLine}`);
        if (htmlParts) {
          htmlParts.push(`<li>${buildCompactHtmlLine(nameEntry, otherDays)}</li>`);
        }
      }

      if (htmlParts) {
        htmlParts.push("</ul>");
      }
    }
  }

  return {
    plain: plainLines.join("\n"),
    html: htmlParts ? htmlParts.join("") : null,
  };
}

function buildSingleNameDescription(context) {
  const { nameEntry, actualDate, sourceNameMap, actualNameMap, options, year } = context;
  const needsMetadata = options.descriptionMode !== "none";
  const needsOtherDays = options.includeOtherDays;
  const needsOrdinal = options.ordinalDay === "description";
  const needsShiftNote = actualDate.shifted && options.descriptionMode !== "none";
  const wantsHtml = options.descriptionFormat === "html" || options.descriptionFormat === "full";

  if (!needsMetadata && !needsOtherDays && !needsOrdinal && !needsShiftNote) {
    return null;
  }

  const otherDays = buildOtherDaysList(
    actualNameMap.get(nameEntry.name) ?? sourceNameMap.get(nameEntry.name) ?? [],
    actualDate.monthDay
  );

  const plainLines = [];
  const htmlParts = wantsHtml ? [] : null;

  if (needsMetadata || needsOtherDays) {
    if (options.descriptionMode === "detailed") {
      const header = buildDetailedDateHeader(actualDate, year, needsOrdinal || year != null);

      if (header) {
        plainLines.push(header);
        plainLines.push("-------------------------------------");
        if (htmlParts) {
          htmlParts.push(`<p><strong>${escapeHtml(header)}</strong></p><hr>`);
        }
      } else if (needsShiftNote) {
        const shiftOverview = buildLeapShiftOverview(actualDate, year);
        if (shiftOverview) {
          plainLines.push(shiftOverview);
          if (htmlParts) {
            htmlParts.push(`<p><strong>${escapeHtml(shiftOverview)}</strong></p>`);
          }
        }
      }

      const decoratedNameEntry = decorateNameEntryForDescription(nameEntry, actualDate, year);
      plainLines.push(...buildDetailedPlainLines(decoratedNameEntry, otherDays, 0));
      if (htmlParts) {
        htmlParts.push(`<ul>${buildDetailedHtmlItem(decoratedNameEntry, otherDays)}</ul>`);
      }
    } else {
      if (needsShiftNote) {
        const shiftOverview = buildLeapShiftOverview(actualDate, year);
        if (shiftOverview) {
          plainLines.push(shiftOverview);
          if (htmlParts) {
            htmlParts.push(`<p><strong>${escapeHtml(shiftOverview)}</strong></p>`);
          }
        }
      }

      if (needsOrdinal) {
        const ordinalText = buildOrdinalTextForEvent(actualDate, year);
        plainLines.push(`Az év napja: ${ordinalText}.`);
        if (htmlParts) {
          htmlParts.push(`<p><strong>Az év napja:</strong> ${escapeHtml(ordinalText)}.</p>`);
        }
      }

      plainLines.push(buildCompactPlainLine(nameEntry, otherDays));
      if (htmlParts) {
        htmlParts.push(`<p>${buildCompactHtmlLine(nameEntry, otherDays)}</p>`);
      }
    }
  }

  return {
    plain: plainLines.join("\n"),
    html: htmlParts ? htmlParts.join("") : null,
  };
}

function buildCompactPlainLine(nameEntry, otherDays) {
  const segments = [`Név: ${nameEntry.name}`];

  if (nameEntry.gender?.label) {
    segments.push(`Nem: ${prettifyGender(nameEntry.gender.label)}`);
  }

  if (nameEntry.origin) {
    segments.push(`Eredet: ${normalizeInlineDisplayText(nameEntry.origin)}`);
  }

  if (nameEntry.meaning) {
    segments.push(`Jelentés: ${normalizeInlineDisplayText(nameEntry.meaning)}`);
  }

  const frequencyText = buildFrequencyText(nameEntry.frequency);
  if (frequencyText) {
    segments.push(`Gyakoriság: ${capitalizeSentence(frequencyText)}`);
  }

  const otherDaysText = formatOtherDaysHu(otherDays);
  if (otherDaysText) {
    segments.push(`További névnapok: ${otherDaysText}`);
  }

  return segments.join("; ");
}

function buildCompactHtmlLine(nameEntry, otherDays) {
  const parts = [`<strong>${escapeHtml(nameEntry.name)}</strong>`];
  const metadata = [];

  if (nameEntry.gender?.label) {
    metadata.push(`<strong>Nem:</strong> ${escapeHtml(prettifyGender(nameEntry.gender.label))}`);
  }

  if (nameEntry.origin) {
    metadata.push(
      `<strong>Eredet:</strong> ${escapeHtml(normalizeInlineDisplayText(nameEntry.origin))}`
    );
  }

  if (nameEntry.meaning) {
    metadata.push(
      `<strong>Jelentés:</strong> ${escapeHtml(normalizeInlineDisplayText(nameEntry.meaning))}`
    );
  }

  const frequencyText = buildFrequencyText(nameEntry.frequency);
  if (frequencyText) {
    metadata.push(`<strong>Gyakoriság:</strong> ${escapeHtml(capitalizeSentence(frequencyText))}`);
  }

  const otherDaysText = formatOtherDaysHu(otherDays);
  if (otherDaysText) {
    metadata.push(`<strong>További névnapok:</strong> ${escapeHtml(otherDaysText)}`);
  }

  if (metadata.length > 0) {
    parts.push(` — ${metadata.join("; ")}`);
  }

  return parts.join("");
}

function buildDetailedPlainLines(nameEntry, otherDays, indentLevel) {
  const indent = "  ".repeat(indentLevel);
  const lines = [`${indent}${buildDetailedNameTitle(nameEntry)}`];

  const leapShiftText = buildLeapShiftLine(nameEntry);
  if (leapShiftText) {
    lines.push(...buildPlainDetailFieldLines(indent, "Szökőévben", leapShiftText));
  }

  const otherDayLines = formatOtherDaysHuLines(otherDays);
  if (otherDayLines.length > 0) {
    lines.push(
      ...buildPlainDetailFieldLines(
        indent,
        "További napjai",
        otherDayLines[0],
        otherDayLines.slice(1)
      )
    );
  }

  if (nameEntry.origin) {
    lines.push(...buildPlainDetailFieldLines(indent, "Eredete", nameEntry.origin));
  }

  if (nameEntry.meaning) {
    lines.push(...buildPlainDetailFieldLines(indent, "Jelentése", nameEntry.meaning));
  }

  const nicknameLines = buildNicknamesLines(nameEntry);
  if (nicknameLines.length > 0) {
    lines.push(
      ...buildPlainDetailFieldLines(indent, "Becézései", nicknameLines[0], nicknameLines.slice(1))
    );
  }

  const relatedNameLines = buildRelatedNamesLines(nameEntry);
  if (relatedNameLines.length > 0) {
    lines.push(
      ...buildPlainDetailFieldLines(
        indent,
        "Rokon nevek",
        relatedNameLines[0],
        relatedNameLines.slice(1)
      )
    );
  }

  const frequencyLines = buildDetailedFrequencyLines(nameEntry);
  if (frequencyLines.length > 0) {
    lines.push(
      ...buildPlainDetailFieldLines(indent, "Gyakoriság", frequencyLines[0], frequencyLines.slice(1))
    );
  }

  return lines;
}

function buildDetailedHtmlItem(nameEntry, otherDays) {
  const items = [];

  const leapShiftText = buildLeapShiftLine(nameEntry);
  if (leapShiftText) {
    items.push(`<li><strong>Szökőévben:</strong> ${escapeHtml(leapShiftText)}</li>`);
  }

  const otherDaysText = formatOtherDaysHu(otherDays);
  if (otherDaysText) {
    items.push(`<li><strong>További napjai:</strong> ${escapeHtml(otherDaysText)}</li>`);
  }

  if (nameEntry.origin) {
    items.push(
      `<li><strong>Eredete:</strong> ${escapeHtml(normalizeInlineDisplayText(nameEntry.origin))}</li>`
    );
  }

  if (nameEntry.meaning) {
    items.push(
      `<li><strong>Jelentése:</strong> ${escapeHtml(normalizeInlineDisplayText(nameEntry.meaning))}</li>`
    );
  }

  const nicknamesText = buildNicknamesText(nameEntry);
  if (nicknamesText) {
    items.push(`<li><strong>Becézései:</strong> ${escapeHtml(nicknamesText)}</li>`);
  }

  const relatedNamesText = buildRelatedNamesText(nameEntry);
  if (relatedNamesText) {
    items.push(`<li><strong>Rokon nevek:</strong> ${escapeHtml(relatedNamesText)}</li>`);
  }

  const frequencyHtml = buildDetailedFrequencyHtml(nameEntry);
  if (frequencyHtml) {
    items.push(`<li><strong>Gyakoriság:</strong> ${frequencyHtml}</li>`);
  }

  return `<li><strong>${escapeHtml(buildDetailedNameTitle(nameEntry).slice(2))}</strong>${items.length > 0 ? `<ul>${items.join("")}</ul>` : ""}</li>`;
}

function buildFrequencyText(frequency) {
  if (!frequency) {
    return null;
  }

  const parts = [];

  const overall = frequencyLabelHu(frequency.overall);
  const newborns = frequencyLabelHu(frequency.newborns);

  if (overall) {
    parts.push(describeFrequency("overall", overall));
  }

  if (newborns) {
    parts.push(describeFrequency("newborns", newborns));
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

function describeFrequency(scope, label) {
  const prefix = scope === "overall" ? "össznépesség alapján" : "újszülötteknél";

  if (label === "néhány előfordulás") {
    return `${prefix} csak néhány előfordulás ismert`;
  }

  if (label === "első tízben") {
    return `${prefix} az első tízben van`;
  }

  return `${prefix} ${label}`;
}

function frequencyLabelHu(value) {
  if (!value) {
    return null;
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object" && typeof value.labelHu === "string") {
    return value.labelHu;
  }

  return null;
}

function normalizeNamedayEntries(days) {
  if (!Array.isArray(days)) {
    return [];
  }

  const normalized = [];
  const seen = new Set();

  for (const value of days) {
    const parsed = parseNamedayValue(value);

    if (!parsed || seen.has(parsed.monthDay)) {
      continue;
    }

    normalized.push(parsed);
    seen.add(parsed.monthDay);
  }

  return normalized;
}

function parseNamedayValue(value) {
  if (typeof value === "string") {
    const match = value.match(/^(\d{2})-(\d{2})$/);

    if (!match) {
      return null;
    }

    const month = Number(match[1]);
    const day = Number(match[2]);

    return {
      month,
      day,
      monthDay: `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      primary: false,
    };
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const month = Number(value.month);
  const day = Number(value.day);
  const monthDay =
    typeof value.monthDay === "string" && /^\d{2}-\d{2}$/.test(value.monthDay)
      ? value.monthDay
      : Number.isInteger(month) && Number.isInteger(day)
        ? `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
        : null;

  if (!monthDay || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return {
    month,
    day,
    monthDay,
    primary: value.primary === true,
  };
}

function buildOtherDaysList(monthDays, currentMonthDay) {
  return monthDays.filter((monthDay) => monthDay !== currentMonthDay);
}

function formatOtherDaysHu(monthDays) {
  const formatted = monthDays.map(formatMonthDayHuFromMonthDay).filter(Boolean);
  return formatted.length > 0 ? joinDisplayValues(formatted) : null;
}

function formatOtherDaysHuLines(monthDays) {
  const formatted = monthDays.map(formatMonthDayHuFromMonthDay).filter(Boolean);
  return wrapDisplayValues(formatted);
}

function decorateNameEntryForDescription(nameEntry, actualDate, year) {
  return {
    ...nameEntry,
    leapShift: buildLeapShiftData(actualDate, year),
  };
}

function buildLeapShiftData(actualDate, year) {
  if (year == null && actualDate?.leapRule) {
    return {
      actual: {
        month: actualDate.leapRule.shiftedMonth,
        day: actualDate.leapRule.shiftedDay,
      },
      regular: {
        month: actualDate.month,
        day: actualDate.day,
      },
      generic: true,
    };
  }

  if (!actualDate?.shifted || year == null) {
    return null;
  }

  const regular = parseNamedayValue(actualDate.sourceMonthDay);

  if (!regular) {
    return null;
  }

  return {
    actual: {
      month: actualDate.month,
      day: actualDate.day,
    },
    regular: {
      month: regular.month,
      day: regular.day,
    },
  };
}

function buildDetailedDateHeader(actualDate, year, enabled) {
  if (!enabled || year == null) {
    return null;
  }

  const week = getIsoWeek(year, actualDate.month, actualDate.day);
  const dayOfYear = getDayOfYear(year, actualDate.month, actualDate.day);
  const leapLabel = shouldShowLeapYearBadge(actualDate, year) ? " (szökőév)" : "";

  return `${year}. év, ${week}. hét — az év ${dayOfYear}. napja${leapLabel}.`;
}

function buildLeapShiftOverview(actualDate, year) {
  const leapShift = buildLeapShiftData(actualDate, year);

  if (!leapShift) {
    return null;
  }

  return `Ezen a napon szökőévben eltér a névnap szokásos dátuma.`;
}

function shouldShowLeapYearBadge(actualDate, year) {
  return isLeapYear(year) && actualDate.month === 2 && actualDate.day >= 20 && actualDate.day <= 29;
}

function buildDetailedNameTitle(nameEntry) {
  const gender = prettifyGender(nameEntry.gender?.label);
  const genderLabel = gender ? `${gender} név` : null;
  return genderLabel ? `- ${nameEntry.name} (${genderLabel})` : `- ${nameEntry.name}`;
}

function buildLeapShiftLine(nameEntry) {
  if (!nameEntry?.leapShift) {
    return null;
  }

  return `${formatMonthDayHu(nameEntry.leapShift.actual.month, nameEntry.leapShift.actual.day)}; egyébként ${formatMonthDayHu(nameEntry.leapShift.regular.month, nameEntry.leapShift.regular.day)}`;
}

function buildOriginMeaningText(nameEntry) {
  const parts = [];

  if (nameEntry.origin) {
    parts.push(`Eredete: ${nameEntry.origin}`);
  }

  if (nameEntry.meaning) {
    parts.push(`Jelentése: ${nameEntry.meaning}`);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

function buildOriginMeaningHtml(nameEntry) {
  const parts = [];

  if (nameEntry.origin) {
    parts.push(`<strong>Eredete:</strong> ${escapeHtml(nameEntry.origin)}`);
  }

  if (nameEntry.meaning) {
    parts.push(`<strong>Jelentése:</strong> ${escapeHtml(nameEntry.meaning)}`);
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

function buildNicknamesText(nameEntry) {
  const values = sanitizeDisplayValues(nameEntry?.nicknames);
  return values.length > 0 ? joinDisplayValues(values) : null;
}

function buildNicknamesLines(nameEntry) {
  return wrapDisplayValues(sanitizeDisplayValues(nameEntry?.nicknames));
}

function buildRelatedNamesText(nameEntry) {
  const values = sanitizeDisplayValues(nameEntry?.relatedNames);
  return values.length > 0 ? joinDisplayValues(values) : null;
}

function buildRelatedNamesLines(nameEntry) {
  return wrapDisplayValues(sanitizeDisplayValues(nameEntry?.relatedNames));
}

function buildDetailedFrequencyLines(nameEntry) {
  const frequencyText = buildFrequencyText(nameEntry.frequency);

  if (!frequencyText) {
    return [];
  }

  const metaLabel = nameEntry.meta?.frequency?.labelHu;
  const lines = [];

  if (metaLabel) {
    lines.push(ensureTrailingSentence(capitalizeSentence(polishFrequencyMetaLabel(metaLabel))));
  }

  lines.push(ensureTrailingSentence(capitalizeSentence(frequencyText)));

  return lines;
}

function buildDetailedFrequencyHtml(nameEntry) {
  const lines = buildDetailedFrequencyLines(nameEntry);

  if (lines.length === 0) {
    return null;
  }

  if (lines.length === 1) {
    return escapeHtml(lines[0]);
  }

  return `${escapeHtml(lines[0])}<br>${escapeHtml(lines[1])}`;
}

function buildPlainDetailFieldLines(indent, label, value, extraLines = []) {
  const cleanValue = normalizeInlineDisplayText(value);

  if (!cleanValue) {
    return [];
  }

  const baseLabel = `${label.padEnd(PLAIN_DETAIL_LABEL_WIDTH)} : `;
  const continuationPrefix = `${indent}  ${" ".repeat(PLAIN_DETAIL_LABEL_WIDTH)}   `;
  const lines = [`${indent}  ${baseLabel}${cleanValue}`];

  for (const extraLine of extraLines.map(normalizeInlineDisplayText).filter(Boolean)) {
    lines.push(`${continuationPrefix}${extraLine}`);
  }

  return lines;
}

function normalizeInlineDisplayText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s*‣\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function joinDisplayValues(values) {
  return values.join(" • ");
}

function sanitizeDisplayValues(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  for (const value of values) {
    const text = normalizeInlineDisplayText(value);

    if (!text || text === "‣" || text === "|" || text === "•" || seen.has(text)) {
      continue;
    }

    seen.add(text);
    normalized.push(text);
  }

  return normalized;
}

function wrapDisplayValues(values, maxLength = 44) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const rows = [];
  let current = "";
  let isContinuationRow = false;

  for (const value of values) {
    const cleanValue = normalizeInlineDisplayText(value);

    if (!cleanValue) {
      continue;
    }

    const rowStart = isContinuationRow ? "• " : "";
    const next = current ? `${current} • ${cleanValue}` : `${rowStart}${cleanValue}`;

    if (current && next.length > maxLength) {
      rows.push(current);
      current = `• ${cleanValue}`;
      isContinuationRow = true;
      continue;
    }

    current = next;
  }

  if (current) {
    rows.push(current);
  }

  return rows;
}

function capitalizeSentence(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  return value.charAt(0).toLocaleUpperCase("hu-HU") + value.slice(1);
}

function ensureTrailingSentence(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function polishFrequencyMetaLabel(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  if (value === "hasonló az újszülötteknél") {
    return "az újszülötteknél hasonlóan gyakori";
  }

  const match = value.match(/^(kissé |jóval )?(gyakoribb|ritkább) az újszülötteknél$/);

  if (!match) {
    return value;
  }

  const modifier = match[1] ?? "";
  const adjective = match[2];
  return `az újszülötteknél ${modifier}${adjective}`.trim();
}

function buildOrdinalTextForEvent(actualDate, year) {
  if (year != null) {
    return `${getDayOfYear(year, actualDate.month, actualDate.day)}. nap`;
  }

  const regular = getDayOfYear(2025, actualDate.month, actualDate.day);
  const leap = getDayOfYear(2024, actualDate.month, actualDate.day);

  if (regular === leap) {
    return `${regular}. nap`;
  }

  return `${regular}. nap (szökőévben: ${leap}.)`;
}

function buildUid(parts) {
  const hash = crypto.createHash("sha1").update(`${parts.type}|${parts.key}`).digest("hex");
  return `nevnap-${hash.slice(0, 24)}@nevnapok.local`;
}

function buildYearlyRRule(month, day, options) {
  const parts = [`FREQ=YEARLY`, `BYMONTH=${month}`, `BYMONTHDAY=${day}`];

  if (options.rruleUntil) {
    parts.push(`UNTIL=${options.rruleUntil}`);
  }

  return parts.join(";");
}

function resolveActualDate(year, sourceDay, leapMode) {
  const sourceMonthDay = sourceDay.monthDay;

  if (leapMode !== "hungarian-until-2050" || !isLeapYear(year)) {
    return {
      year,
      month: sourceDay.month,
      day: sourceDay.day,
      monthDay: sourceMonthDay,
      sourceMonthDay,
      shifted: false,
    };
  }

  const shiftedMap = new Map([
    ["02-24", "02-25"],
    ["02-25", "02-26"],
    ["02-26", "02-27"],
    ["02-27", "02-28"],
    ["02-28", "02-29"],
  ]);

  const resolvedMonthDay = shiftedMap.get(sourceMonthDay) ?? sourceMonthDay;
  const [monthText, dayText] = resolvedMonthDay.split("-");

  return {
    year,
    month: Number(monthText),
    day: Number(dayText),
    monthDay: resolvedMonthDay,
    sourceMonthDay,
    shifted: resolvedMonthDay !== sourceMonthDay,
  };
}

function serializeCalendar(events, payload, options) {
  const dtstamp = formatDateTimeUtc(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//illusionfield//Névnapok ICS Generátor//HU",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    formatTextProperty("NAME", options.calendarName),
    formatTextProperty("X-WR-CALNAME", options.calendarName),
    "X-WR-TIMEZONE:Europe/Budapest",
  ];

  const calendarDescription = buildCalendarDescription(payload, options, events.length);
  if (calendarDescription) {
    lines.push(formatTextProperty("X-WR-CALDESC", calendarDescription));
  }

  for (const event of events) {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${event.uid}`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;VALUE=DATE:${event.startDate}`);
    lines.push(`DTEND;VALUE=DATE:${event.endDate}`);

    if (event.rrule) {
      lines.push(`RRULE:${event.rrule}`);
    }

    if (Array.isArray(event.exdates) && event.exdates.length > 0) {
      lines.push(`EXDATE;VALUE=DATE:${event.exdates.join(",")}`);
    }

    if (Array.isArray(event.rdates) && event.rdates.length > 0) {
      lines.push(`RDATE;VALUE=DATE:${event.rdates.join(",")}`);
    }

    lines.push(formatTextProperty("SUMMARY", event.summary));

    if (
      event.description?.plain &&
      (options.descriptionFormat === "text" || options.descriptionFormat === "full")
    ) {
      lines.push(formatTextProperty("DESCRIPTION", event.description.plain));
    }

    if (
      event.description?.html &&
      (options.descriptionFormat === "html" || options.descriptionFormat === "full")
    ) {
      lines.push(formatTextProperty("X-ALT-DESC;FMTTYPE=text/html", event.description.html));
    }

    lines.push("STATUS:CONFIRMED");
    lines.push("TRANSP:TRANSPARENT");
    lines.push(formatTextProperty("CATEGORIES", "Névnap"));
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  return lines.map(foldLine).join("\r\n").concat("\r\n");
}

function buildCalendarDescription(payload, options, eventCount) {
  const parts = [];

  parts.push(`Forrás: ${payload?.source?.provider ?? "nevnapok.json"}`);
  parts.push(`Események: ${eventCount}`);
  parts.push(`Csoportosítás: ${options.mode === "together" ? "naponként együtt" : "névenként külön"}`);
  parts.push(`Leírás: ${descriptionModeLabelHu(options.descriptionMode)}`);
  parts.push(`Leírás formátuma: ${descriptionFormatLabelHu(options.descriptionFormat)}`);
  parts.push(`További névnapok: ${options.includeOtherDays ? "bekapcsolva" : "kikapcsolva"}`);
  parts.push(`Év napja: ${ordinalModeLabelHu(options.ordinalDay)}`);

  if (options.leapMode === "hungarian-until-2050") {
    parts.push(`Szökőéves mód: magyar február 24–29. eltolás ${options.untilYear}-ig`);
  } else {
    parts.push("Szökőéves mód: kikapcsolva");
  }

  return parts.join("; ");
}

function normalizeOptions(options) {
  const normalized = {
    input: options.input ?? DEFAULT_INPUT_PATH,
    output: options.output ?? DEFAULT_OUTPUT_PATH,
    mode: options.mode ?? "together",
    descriptionMode: options.descriptionMode ?? "none",
    descriptionFormat: options.descriptionFormat ?? "text",
    includeOtherDays: options.includeOtherDays ?? false,
    leapMode: options.leapMode ?? "none",
    ordinalDay: options.ordinalDay ?? "none",
    calendarName: options.calendarName ?? DEFAULT_CALENDAR_NAME,
    baseYear: options.baseYear ?? 2000,
    fromYear: options.fromYear ?? CURRENT_YEAR,
    untilYear: options.untilYear ?? 2050,
    rruleUntil: null,
  };

  const validModes = new Set(["together", "separate"]);
  const validDescriptionModes = new Set(["none", "compact", "detailed"]);
  const validDescriptionFormats = new Set(["text", "html", "full", "both"]);
  const validLeapModes = new Set(["none", "hungarian-until-2050"]);
  const validOrdinalModes = new Set(["none", "summary", "description"]);

  if (!validModes.has(normalized.mode)) {
    throw new Error("--mode must be one of: together, separate.");
  }

  if (!validDescriptionModes.has(normalized.descriptionMode)) {
    throw new Error("--description must be one of: none, compact, detailed.");
  }

  if (!validDescriptionFormats.has(normalized.descriptionFormat)) {
    throw new Error("--description-format must be one of: text, html, full.");
  }

  if (normalized.descriptionFormat === "both") {
    normalized.descriptionFormat = "full";
  }

  if (!validLeapModes.has(normalized.leapMode)) {
    throw new Error("--leap-mode must be one of: none, hungarian-until-2050.");
  }

  if (!validOrdinalModes.has(normalized.ordinalDay)) {
    throw new Error("--ordinal-day must be one of: none, summary, description.");
  }

  if (!Number.isInteger(normalized.baseYear) || normalized.baseYear < 1900) {
    throw new Error("--base-year must be an integer year.");
  }

  if (!Number.isInteger(normalized.fromYear) || normalized.fromYear < 1900) {
    throw new Error("--from-year must be an integer year.");
  }

  if (!Number.isInteger(normalized.untilYear) || normalized.untilYear < normalized.fromYear) {
    throw new Error("--until-year must be an integer year greater than or equal to --from-year.");
  }

  if (normalized.leapMode === "hungarian-until-2050" && normalized.untilYear > 2050) {
    throw new Error("--until-year cannot be greater than 2050 when --leap-mode is enabled.");
  }

  if (normalized.leapMode === "hungarian-until-2050") {
    normalized.rruleUntil = formatUntilDateTime(normalized.untilYear);
  }

  return normalized;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--include-other-days") {
      options.includeOtherDays = true;
      continue;
    }

    if (arg === "--no-other-days") {
      options.includeOtherDays = false;
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

    if (arg === "--output" && argv[index + 1]) {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--mode" && argv[index + 1]) {
      options.mode = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--mode=")) {
      options.mode = arg.slice("--mode=".length);
      continue;
    }

    if (arg === "--description" && argv[index + 1]) {
      options.descriptionMode = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--description=")) {
      options.descriptionMode = arg.slice("--description=".length);
      continue;
    }

    if (arg === "--description-format" && argv[index + 1]) {
      options.descriptionFormat = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--description-format=")) {
      options.descriptionFormat = arg.slice("--description-format=".length);
      continue;
    }

    if (arg === "--leap-mode" && argv[index + 1]) {
      options.leapMode = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--leap-mode=")) {
      options.leapMode = arg.slice("--leap-mode=".length);
      continue;
    }

    if (arg === "--ordinal-day" && argv[index + 1]) {
      options.ordinalDay = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--ordinal-day=")) {
      options.ordinalDay = arg.slice("--ordinal-day=".length);
      continue;
    }

    if (arg === "--calendar-name" && argv[index + 1]) {
      options.calendarName = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--calendar-name=")) {
      options.calendarName = arg.slice("--calendar-name=".length);
      continue;
    }

    if (arg === "--base-year" && argv[index + 1]) {
      options.baseYear = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--base-year=")) {
      options.baseYear = Number(arg.slice("--base-year=".length));
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
      continue;
    }
  }

  return options;
}

function prettifyGender(value) {
  if (value === "female") {
    return "női";
  }

  if (value === "male") {
    return "férfi";
  }

  return value;
}

function capitalizeFirst(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function descriptionModeLabelHu(value) {
  if (value === "none") {
    return "nincs";
  }

  if (value === "compact") {
    return "tömör";
  }

  if (value === "detailed") {
    return "részletes";
  }

  return value;
}

function descriptionFormatLabelHu(value) {
  if (value === "text") {
    return "csak szöveg";
  }

  if (value === "html") {
    return "csak HTML";
  }

  if (value === "full") {
    return "szöveg és HTML";
  }

  return value;
}

function ordinalModeLabelHu(value) {
  if (value === "none") {
    return "nincs";
  }

  if (value === "summary") {
    return "cím végén";
  }

  if (value === "description") {
    return "leírásban";
  }

  return value;
}

function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
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

function formatDateTimeUtc(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function formatUntilDateTime(year) {
  return `${String(year).padStart(4, "0")}1231T235959Z`;
}

function formatMonthDay(month, day) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function formatMonthDayHu(month, day) {
  const monthLabels = [
    null,
    "jan.",
    "febr.",
    "márc.",
    "ápr.",
    "máj.",
    "jún.",
    "júl.",
    "aug.",
    "szept.",
    "okt.",
    "nov.",
    "dec.",
  ];

  return `${monthLabels[month] ?? String(month)} ${day}.`;
}

function formatMonthDayHuFromMonthDay(monthDay) {
  const parsed = parseNamedayValue(monthDay);
  return parsed ? formatMonthDayHu(parsed.month, parsed.day) : null;
}

function getIsoWeek(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

function isLeapYear(year) {
  if (year % 400 === 0) {
    return true;
  }

  if (year % 100 === 0) {
    return false;
  }

  return year % 4 === 0;
}

function getDayOfYear(year, month, day) {
  const current = Date.UTC(year, month - 1, day);
  const start = Date.UTC(year, 0, 1);
  const diff = current - start;
  return Math.floor(diff / 86_400_000) + 1;
}

function formatTextProperty(name, value) {
  return `${name}:${escapeIcsText(value)}`;
}

function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function foldLine(line) {
  const maxBytes = 75;

  if (Buffer.byteLength(line, "utf8") <= maxBytes) {
    return line;
  }

  const segments = [];
  let current = "";

  for (const char of line) {
    const next = current + char;
    const limit = segments.length === 0 ? maxBytes : maxBytes - 1;

    if (Buffer.byteLength(next, "utf8") > limit) {
      segments.push(current);
      current = char;
      continue;
    }

    current = next;
  }

  if (current) {
    segments.push(current);
  }

  return segments.map((segment, index) => (index === 0 ? segment : ` ${segment}`)).join("\r\n");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
