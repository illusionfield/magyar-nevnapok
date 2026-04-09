import fs from "node:fs/promises";
import path from "node:path";

export const DEFAULT_LEGACY_ICS_PATH = path.join(
  process.cwd(),
  "data",
  "nevnapok_tisztitott_regi_nevkeszlet.ics"
);
export const DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH = path.join(
  process.cwd(),
  "output",
  "legacy-primary-registry.json"
);
export const DEFAULT_PRIMARY_REGISTRY_PATH = DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH;
export const DEFAULT_WIKI_PRIMARY_REGISTRY_PATH = path.join(
  process.cwd(),
  "output",
  "wiki-primary-registry.json"
);
export const DEFAULT_FINAL_PRIMARY_REGISTRY_PATH = path.join(
  process.cwd(),
  "output",
  "primary-registry.json"
);
export const DEFAULT_PRIMARY_REGISTRY_OVERRIDES_PATH = path.join(
  process.cwd(),
  "data",
  "primary-registry-overrides.json"
);

export async function loadPrimaryRegistry(filePath = DEFAULT_PRIMARY_REGISTRY_PATH) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(resolvedPath, "utf8");
  const payload = JSON.parse(raw);

  if (!Array.isArray(payload.days)) {
    throw new Error(`Primary registry does not contain a valid days array: ${resolvedPath}`);
  }

  return {
    path: resolvedPath,
    payload,
  };
}

export async function loadPrimaryRegistryOverrides(
  filePath = DEFAULT_PRIMARY_REGISTRY_OVERRIDES_PATH
) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  const raw = await fs.readFile(resolvedPath, "utf8");
  const payload = JSON.parse(raw);

  if (!Array.isArray(payload.days)) {
    throw new Error(`Primary registry overrides do not contain a valid days array: ${resolvedPath}`);
  }

  return {
    path: resolvedPath,
    payload,
  };
}

export async function buildPrimaryRegistryPayload({
  inputPath = DEFAULT_LEGACY_ICS_PATH,
  generatedAt = new Date().toISOString(),
} = {}) {
  const resolvedInputPath = path.resolve(process.cwd(), inputPath);
  const raw = await fs.readFile(resolvedInputPath, "utf8");
  const days = parseLegacyPrimaryRegistryIcs(raw, resolvedInputPath);

  const stats = {
    dayCount: days.length,
    preferredNameCount: days.reduce((sum, entry) => sum + entry.preferredNames.length, 0),
    oneNameDays: days.filter((entry) => entry.names.length === 1).length,
    twoNameDays: days.filter((entry) => entry.names.length === 2).length,
    threeOrMoreNameDays: days.filter((entry) => entry.names.length >= 3).length,
  };

  return {
    version: 1,
    generatedAt,
    sourceFile: path.basename(inputPath),
    stats,
    days,
  };
}

export function parseLegacyPrimaryRegistryIcs(text, sourceFile) {
  const unfoldedLines = unfoldIcsLines(text);
  const dayMap = new Map();
  let current = null;

  for (const line of unfoldedLines) {
    if (line === "BEGIN:VEVENT") {
      current = {
        summary: null,
        dateValue: null,
      };
      continue;
    }

    if (line === "END:VEVENT") {
      if (current?.summary && current?.dateValue) {
        const parsedDate = parseDateValue(current.dateValue);

        if (parsedDate) {
          const names = splitSummaryNames(current.summary);
          const existing = dayMap.get(parsedDate.monthDay);
          const mergedNames = dedupeKeepOrder([...(existing?.names ?? []), ...names]);

          dayMap.set(parsedDate.monthDay, {
            month: parsedDate.month,
            day: parsedDate.day,
            monthDay: parsedDate.monthDay,
            names: mergedNames,
            preferredNames: mergedNames.slice(0, 2),
          });
        }
      }

      current = null;
      continue;
    }

    if (!current) {
      continue;
    }

    if (line.startsWith("SUMMARY:")) {
      current.summary = unescapeIcsText(line.slice("SUMMARY:".length));
      continue;
    }

    if (line.startsWith("DTSTART")) {
      const separatorIndex = line.indexOf(":");

      if (separatorIndex !== -1) {
        current.dateValue = line.slice(separatorIndex + 1);
      }
    }
  }

  const days = Array.from(dayMap.values()).sort((left, right) => left.monthDay.localeCompare(right.monthDay));

  return applyLegacyLeapDayExceptions(days);
}

function applyLegacyLeapDayExceptions(days) {
  const clonedDays = days.map((entry) => ({
    ...entry,
    names: [...entry.names],
    preferredNames: [...entry.preferredNames],
  }));
  const dayMap = new Map(clonedDays.map((entry) => [entry.monthDay, entry]));
  const leapWindow = ["02-25", "02-26", "02-27", "02-28"];

  for (const monthDay of leapWindow) {
    const currentDay = dayMap.get(monthDay);
    const previousDay = dayMap.get(previousMonthDay(monthDay));

    if (!currentDay || !previousDay) {
      continue;
    }

    const previousNames = new Set(previousDay.names.map(normalizeNameForMatch));
    const preferredNames = currentDay.names.filter(
      (name) => !previousNames.has(normalizeNameForMatch(name))
    );

    if (preferredNames.length > 0) {
      currentDay.preferredNames = preferredNames.slice(0, 2);
    }
  }

  return clonedDays;
}

function previousMonthDay(monthDay) {
  const parsed = parseMonthDay(monthDay);

  if (!parsed) {
    return null;
  }

  const date = new Date(Date.UTC(2025, parsed.month - 1, parsed.day));
  date.setUTCDate(date.getUTCDate() - 1);

  return formatMonthDay(date.getUTCMonth() + 1, date.getUTCDate());
}

export function buildPrimaryRegistryLookup(registryDays) {
  const lookup = new Map();

  for (const day of registryDays) {
    const normalizedNames = day.names.map(normalizeNameForMatch);
    const normalizedPreferredNames = day.preferredNames.map(normalizeNameForMatch);
    const preferredNameOrder = new Map(
      normalizedPreferredNames.map((name, index) => [name, index + 1])
    );

    lookup.set(day.monthDay, {
      ...day,
      normalizedNames,
      normalizedPreferredNames,
      preferredNameOrder,
    });
  }

  return lookup;
}

export function normalizeNameForMatch(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim();
}

export function formatMonthDay(month, day) {
  if (!Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseMonthDay(monthDay) {
  const match = String(monthDay).match(/^(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  return {
    month: Number(match[1]),
    day: Number(match[2]),
    monthDay: `${match[1]}-${match[2]}`,
  };
}

export function areNameListsExactlyEqual(leftValues, rightValues) {
  if (!Array.isArray(leftValues) || !Array.isArray(rightValues)) {
    return false;
  }

  if (leftValues.length !== rightValues.length) {
    return false;
  }

  for (let index = 0; index < leftValues.length; index += 1) {
    if (normalizeNameForMatch(leftValues[index]) !== normalizeNameForMatch(rightValues[index])) {
      return false;
    }
  }

  return true;
}

export function areNameSetsEqual(leftValues, rightValues) {
  const left = dedupeKeepOrder(leftValues).map(normalizeNameForMatch).sort();
  const right = dedupeKeepOrder(rightValues).map(normalizeNameForMatch).sort();

  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

export function orderedUniqueNameUnion(...lists) {
  return dedupeKeepOrder(lists.flatMap((values) => (Array.isArray(values) ? values : [])));
}

function unfoldIcsLines(text) {
  const lines = String(text).split(/\r?\n/);
  const unfolded = [];

  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
      continue;
    }

    unfolded.push(line);
  }

  return unfolded;
}

function parseDateValue(value) {
  const match = String(value).match(/^(\d{4})(\d{2})(\d{2})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);
  const day = Number(match[3]);

  return {
    month,
    day,
    monthDay: formatMonthDay(month, day),
  };
}

function splitSummaryNames(value) {
  return dedupeKeepOrder(
    String(value)
      .split(",")
      .map((entry) => normalizeNameForMatch(entry))
      .filter(Boolean)
  );
}

export function dedupeKeepOrder(values) {
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

function unescapeIcsText(value) {
  return String(value ?? "")
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}
