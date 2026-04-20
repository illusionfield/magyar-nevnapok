/**
 * domainek/naptar/ics-generalas.mjs
 * Az elsődleges névadatbázisból ICS naptárfájlokat generál.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { betoltStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";
import {
  buildPrimaryRegistryLookup,
  loadPrimaryRegistry,
  normalizeNameForMatch,
} from "../primer/alap.mjs";
import {
  betoltHelyiPrimerFelulirasokat,
  buildHelyiPrimerFelulirasMap,
} from "../primer/helyi-primer-felulirasok.mjs";

const DEFAULT_INPUT_PATH = kanonikusUtvonalak.adatbazis.nevnapok;
const DEFAULT_OUTPUT_PATH = kanonikusUtvonalak.naptar.alap;
const DEFAULT_CALENDAR_NAME = "Névnapok";
const DEFAULT_LOCAL_PRIMARY_OVERRIDES_PATH = kanonikusUtvonalak.kezi.primerFelulirasokHelyi;
const CURRENT_YEAR = new Date().getFullYear();
const collator = new Intl.Collator("hu", { sensitivity: "base", numeric: true });

/**
 * Az `epitIcsKimenetiTervet` a normalizált opciók alapján felépíti az összes generálandó kimenetet.
 */
export async function epitIcsKimenetiTervet(rawOptions = {}, runtime = {}) {
  const options = normalizeOptions(rawOptions);
  const inputPath = path.resolve(process.cwd(), options.input);
  const outputPath = path.resolve(process.cwd(), options.output);
  const payload = runtime.payload ?? (await betoltStrukturaltFajl(inputPath));
  const localPrimaryOverrideMap =
    runtime.localPrimaryOverrideMap instanceof Map
      ? runtime.localPrimaryOverrideMap
      : await loadLocalPrimaryOverrideMap(options.localPrimaryOverrides);
  const rawSourceDays = applyLocalPrimaryOverridesToSourceDays(
    Array.isArray(payload.days) ? normalizeSourceDays(payload.days) : buildDaysFromNames(payload.names),
    localPrimaryOverrideMap
  );
  const primarySelectionModeResolved = resolvePrimarySelectionMode(options);
  options.primarySelectionModeResolved = primarySelectionModeResolved;
  const finalPrimaryLookup =
    primarySelectionModeResolved === "canonical-final"
      ? await loadFinalPrimaryLookup(runtime)
      : null;
  const globalNameCatalog =
    primarySelectionModeResolved === "canonical-final"
      ? buildGlobalNameCatalogFromPayload(payload, rawSourceDays)
      : null;
  const sourceDays =
    primarySelectionModeResolved === "canonical-final"
      ? applyFinalPrimaryOverlayToSourceDays(rawSourceDays, finalPrimaryLookup, globalNameCatalog)
      : rawSourceDays;
  const sourceNameMap = buildNameMapFromSourceDays(sourceDays);
  const jobs = buildCalendarJobs(sourceDays, outputPath, options);

  return {
    inputPath,
    outputPath,
    options,
    payload,
    localPrimaryOverrideMap,
    finalPrimaryLookup,
    globalNameCatalog,
    sourceDays,
    sourceNameMap,
    jobs,
    plannedOutputPaths: jobs.map((job) => job.outputPath),
  };
}

/**
 * A `vegrehajtIcsKimenetiTervet` a korábban felépített terv alapján legenerálja az ICS-kimeneteket.
 */
export async function vegrehajtIcsKimenetiTervet(terv, runtime = {}) {
  const results = [];

  for (const job of terv.jobs) {
    const result = buildCalendarArtifact(job.sourceDays, terv.sourceNameMap, terv.payload, job.options);

    if (runtime.writeFiles !== false) {
      await writeCalendarFile(job.outputPath, result.calendarText);
    }

    results.push({
      outputPath: job.outputPath,
      sourceDays: job.sourceDays,
      skippedEmptyPrimaryDays: job.skippedEmptyPrimaryDays,
      options: job.options,
      events: result.events,
      eventCount: result.events.length,
      calendarText: result.calendarText,
    });
  }

  return {
    inputPath: terv.inputPath,
    outputPath: terv.outputPath,
    options: terv.options,
    payload: terv.payload,
    results,
    writtenPaths: results.map((entry) => entry.outputPath),
  };
}

/**
 * A `generalIcsKimeneteket` a normalizált opciók alapján legenerálja az összes érintett ICS-fájlt.
 */
export async function generalIcsKimeneteket(rawOptions = {}, runtime = {}) {
  const terv = await epitIcsKimenetiTervet(rawOptions, runtime);
  return vegrehajtIcsKimenetiTervet(terv, runtime);
}

/**
 * A `futtatCliModban` a modul közvetlen futtatási belépési pontja.
 */
async function futtatCliModban(argv = process.argv.slice(2)) {
  const { results } = await generalIcsKimeneteket(parseArgs(argv));

  for (const result of results) {
    console.log(`Mentve: ${result.eventCount} esemény ide: ${result.outputPath}`);

    if (result.skippedEmptyPrimaryDays > 0) {
      console.log(
        `${result.skippedEmptyPrimaryDays} nap kimaradt a(z) ${calendarPartitionLogLabel(result.options.calendarPartition)} részből, mert a kiválasztott primerforrás nem adott elsődleges neveket.`
      );
    }
  }
}

/**
 * A `loadLocalPrimaryOverrideMap` opcionálisan betölti a helyi primerkiegészítéseket.
 *
 * A hívó dönt arról, hogy ezt a réteget kéri-e. Így a közös, repo-szintű kimenetek és a
 * személyes naptárak ugyanazt a generátort használhatják eltérő override-forrással.
 */
async function loadLocalPrimaryOverrideMap(localPrimaryOverridesPath) {
  if (!localPrimaryOverridesPath) {
    return new Map();
  }

  const { payload } = await betoltHelyiPrimerFelulirasokat(localPrimaryOverridesPath);
  return buildHelyiPrimerFelulirasMap(payload);
}

async function loadFinalPrimaryLookup(runtime = {}) {
  if (runtime.finalPrimaryLookup instanceof Map) {
    return runtime.finalPrimaryLookup;
  }

  if (Array.isArray(runtime.finalPrimaryRegistryPayload?.days)) {
    return buildPrimaryRegistryLookup(runtime.finalPrimaryRegistryPayload.days);
  }

  const { payload } = await loadPrimaryRegistry(kanonikusUtvonalak.primer.vegso);
  return buildPrimaryRegistryLookup(payload.days);
}

/**
 * A `buildCalendarJobs` felépíti a szükséges adatszerkezetet.
 */
function buildCalendarJobs(sourceDays, outputPath, options) {
  const leapStrategies =
    options.leapProfile === "hungarian-both" ? ["a", "b"] : [options.leapStrategy];
  const baseJobs = [];

  if (options.restHandling === "split") {
    const splitDays = splitSourceDaysByPrimary(sourceDays, options);
    baseJobs.push({
      sourceDays: splitDays.primaryDays,
      outputPath: path.resolve(
        process.cwd(),
        options.primaryOutput ?? deriveSplitOutputPath(outputPath, "primary")
      ),
      skippedEmptyPrimaryDays: splitDays.skippedPrimaryDays,
      optionOverrides: {
        scope: "all",
        layout: options.layout,
        restHandling: "hidden",
        restLayout: null,
        calendarName: `${options.calendarName} — elsődleges`,
        calendarPartition: "primary",
      },
    });
    baseJobs.push({
      sourceDays: splitDays.restDays,
      outputPath: path.resolve(
        process.cwd(),
        options.restOutput ?? deriveSplitOutputPath(outputPath, "rest")
      ),
      skippedEmptyPrimaryDays: 0,
      optionOverrides: {
        scope: "all",
        layout: options.restLayout,
        restHandling: "hidden",
        restLayout: null,
        calendarName: `${options.calendarName} — további`,
        calendarPartition: "rest",
      },
    });
  } else {
    baseJobs.push({
      sourceDays,
      outputPath: path.resolve(process.cwd(), outputPath),
      skippedEmptyPrimaryDays: 0,
      optionOverrides: {
        calendarPartition: null,
      },
    });
  }

  const multipleLeapStrategies = leapStrategies.length > 1;
  const jobs = [];

  for (const baseJob of baseJobs) {
    for (const leapStrategy of leapStrategies) {
      const variantOutputPath = multipleLeapStrategies
        ? deriveLeapStrategyOutputPath(baseJob.outputPath, leapStrategy)
        : baseJob.outputPath;
      const variantOptions = createCalendarVariantOptions(options, {
        ...baseJob.optionOverrides,
        output: variantOutputPath,
        leapStrategy,
        calendarName: buildCalendarNameForJob(
          baseJob.optionOverrides.calendarName ?? options.calendarName,
          leapStrategy,
          multipleLeapStrategies
        ),
      });

      jobs.push({
        sourceDays: baseJob.sourceDays,
        outputPath: variantOutputPath,
        skippedEmptyPrimaryDays: baseJob.skippedEmptyPrimaryDays,
        options: variantOptions,
      });
    }
  }

  return jobs;
}

/**
 * A `buildCalendarNameForJob` felépíti a szükséges adatszerkezetet.
 */
function buildCalendarNameForJob(calendarName, leapStrategy, includeLeapStrategySuffix) {
  if (!includeLeapStrategySuffix) {
    return calendarName;
  }

  return `${calendarName} — ${leapStrategyFileSuffix(leapStrategy)}`;
}

/**
 * A `deriveLeapStrategyOutputPath` származtatott értéket képez a bemenetből.
 */
function deriveLeapStrategyOutputPath(outputPath, leapStrategy) {
  return deriveOutputPathWithSuffix(outputPath, leapStrategyFileSuffix(leapStrategy));
}

/**
 * A `deriveOutputPathWithSuffix` fájlnév-utótagot vagy rövid jelölést készít.
 */
function deriveOutputPathWithSuffix(outputPath, suffix) {
  const parsed = path.parse(outputPath);
  const extension = parsed.ext || ".ics";
  return path.join(parsed.dir, `${parsed.name}-${suffix}${extension}`);
}

/**
 * A `calendarPartitionLogLabel` rövid naplózási címkét ad a naptárpartícióhoz.
 */
function calendarPartitionLogLabel(value) {
  if (value === "primary") {
    return "elsődleges naptár";
  }

  if (value === "rest") {
    return "további névnapok naptára";
  }

  return "naptár";
}

/**
 * A `buildCalendarArtifact` felépíti a szükséges adatszerkezetet.
 */
function buildCalendarArtifact(sourceDays, referenceNameMap, payload, options) {
  const eventBuildResult =
    options.leapMode === "hungarian-until-2050"
      ? buildLeapAwareEvents(sourceDays, referenceNameMap, options)
      : buildRecurringEvents(sourceDays, referenceNameMap, options);
  const events = eventBuildResult.events;

  return {
    events,
    skippedEmptyPrimaryDays: eventBuildResult.skippedEmptyPrimaryDays,
    calendarText: serializeCalendar(events, payload, options),
  };
}

/**
 * A `writeCalendarFile` elmenti vagy kiírja a kapcsolódó adatot.
 */
async function writeCalendarFile(outputPath, calendarText) {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, calendarText, "utf8");
}

/**
 * A `createCalendarVariantOptions` előállítja az összes generálandó naptárváltozat beállításait.
 */
function createCalendarVariantOptions(options, overrides) {
  return {
    ...options,
    ...overrides,
  };
}

/**
 * A `deriveSplitOutputPath` származtatott értéket képez a bemenetből.
 */
function deriveSplitOutputPath(outputPath, suffix) {
  return deriveOutputPathWithSuffix(outputPath, suffix);
}

/**
 * A `splitSourceDaysByPrimary` felbontja a megadott szöveget vagy listát.
 */
function splitSourceDaysByPrimary(sourceDays, options) {
  const primaryDays = [];
  const restDays = [];
  let skippedPrimaryDays = 0;

  for (const sourceDay of sourceDays) {
    const selection = splitPrimaryNamesForSourceDay(sourceDay, options);

    if (selection.primaryNames.length > 0) {
      primaryDays.push({
        ...sourceDay,
        names: selection.primaryNames,
      });
    } else {
      skippedPrimaryDays += 1;
    }

    if (selection.restNames.length > 0) {
      restDays.push({
        ...sourceDay,
        names: selection.restNames,
      });
    }
  }

  return {
    primaryDays,
    restDays,
    skippedPrimaryDays,
  };
}

function resolvePrimarySelectionMode(options) {
  if (options.primarySelectionMode === "canonical-final") {
    return "canonical-final";
  }

  if (options.primarySelectionMode === "configured") {
    return "configured";
  }

  if (options.primarySourceConfigured === true) {
    return "configured";
  }

  if (options.scope === "primary") {
    return "canonical-final";
  }

  return "configured";
}

function applyFinalPrimaryOverlayToSourceDays(sourceDays, finalPrimaryLookup, globalNameCatalog) {
  const dayMap = new Map(
    sourceDays.map((sourceDay) => [sourceDay.monthDay, cloneSourceDay(sourceDay)])
  );
  const monthDays = uniqueSorted([...dayMap.keys(), ...finalPrimaryLookup.keys()]);

  for (const monthDay of monthDays) {
    const finalDay = finalPrimaryLookup.get(monthDay) ?? null;
    const bucket = dayMap.get(monthDay) ?? buildEmptySourceDay(monthDay, finalDay);
    const preferredNames = Array.isArray(finalDay?.preferredNames) ? [...finalDay.preferredNames] : [];
    const normalizedPreferredNames = Array.isArray(finalDay?.normalizedPreferredNames)
      ? [...finalDay.normalizedPreferredNames]
      : preferredNames.map((name) => normalizeNameForMatch(name));

    for (const [index, normalizedPreferredName] of normalizedPreferredNames.entries()) {
      const preferredName = preferredNames[index];
      const existingIndex = bucket.names.findIndex(
        (entry) => normalizeNameForMatch(entry?.name) === normalizedPreferredName
      );

      if (existingIndex !== -1) {
        bucket.names[existingIndex] = markEntryAsFinalPrimary(
          bucket.names[existingIndex],
          bucket,
          preferredName
        );
        continue;
      }

      const template = globalNameCatalog.get(normalizedPreferredName) ?? null;

      if (!template) {
        throw new Error(
          `A végső primerjegyzékben szereplő név nem található a névadatbázisban: ${preferredName} (${monthDay}).`
        );
      }

      bucket.names.push(buildFinalPrimaryOverlayEntry(template, bucket, preferredName));
    }

    bucket.primaryRegistry = {
      preferredNames,
      normalizedPreferredNames,
      preferredNameOrder:
        finalDay?.preferredNameOrder instanceof Map
          ? new Map(finalDay.preferredNameOrder)
          : new Map(normalizedPreferredNames.map((name, index) => [name, index + 1])),
    };
    dayMap.set(monthDay, bucket);
  }

  return Array.from(dayMap.values()).sort((left, right) => left.monthDay.localeCompare(right.monthDay));
}

function buildGlobalNameCatalog(sourceDays) {
  const catalog = new Map();

  for (const sourceDay of sourceDays) {
    for (const nameEntry of sourceDay.names) {
      const normalized = normalizeNameForMatch(nameEntry?.name);

      if (!normalized || catalog.has(normalized)) {
        continue;
      }

      catalog.set(normalized, cloneNameEntry(nameEntry));
    }
  }

  return catalog;
}

function buildGlobalNameCatalogFromPayload(payload, sourceDays) {
  const catalog = buildGlobalNameCatalog(sourceDays);

  if (!Array.isArray(payload?.names)) {
    return catalog;
  }

  for (const nameEntry of payload.names) {
    const normalized = normalizeNameForMatch(nameEntry?.name);

    if (!normalized || catalog.has(normalized)) {
      continue;
    }

    const normalizedDays = normalizeNamedayEntries(nameEntry?.days);
    const firstDay = normalizedDays[0] ?? null;

    catalog.set(normalized, {
      name: nameEntry.name,
      gender: {
        label: nameEntry.gender ?? null,
      },
      origin: nameEntry.origin ?? null,
      meaning: nameEntry.meaning ?? null,
      nicknames: Array.isArray(nameEntry.nicknames) ? [...nameEntry.nicknames] : [],
      relatedNames: Array.isArray(nameEntry.relatedNames) ? [...nameEntry.relatedNames] : [],
      frequency: nameEntry.frequency ?? null,
      meta: nameEntry.meta ?? null,
      dayMeta: {
        month: firstDay?.month ?? null,
        day: firstDay?.day ?? null,
        monthDay: firstDay?.monthDay ?? null,
        primary: firstDay?.primary === true,
        primaryLocal: firstDay?.primaryLocal === true,
        primaryLegacy: firstDay?.primaryLegacy === true,
        primaryRanked: firstDay?.primaryRanked === true,
        legacyOrder: Number.isInteger(firstDay?.legacyOrder) ? firstDay.legacyOrder : null,
        ranking: normalizeRanking(firstDay?.ranking),
      },
    });
  }

  return catalog;
}

function buildEmptySourceDay(monthDay, finalDay) {
  const parsed = parseNamedayValue(monthDay);

  return {
    monthDay,
    month: Number(finalDay?.month ?? parsed?.month ?? 0),
    day: Number(finalDay?.day ?? parsed?.day ?? 0),
    names: [],
  };
}

function cloneSourceDay(sourceDay) {
  return {
    ...sourceDay,
    names: Array.isArray(sourceDay?.names) ? sourceDay.names.map(cloneNameEntry) : [],
    primaryRegistry:
      sourceDay?.primaryRegistry && typeof sourceDay.primaryRegistry === "object"
        ? {
            preferredNames: [...(sourceDay.primaryRegistry.preferredNames ?? [])],
            normalizedPreferredNames: [
              ...(sourceDay.primaryRegistry.normalizedPreferredNames ?? []),
            ],
            preferredNameOrder:
              sourceDay.primaryRegistry.preferredNameOrder instanceof Map
                ? new Map(sourceDay.primaryRegistry.preferredNameOrder)
                : new Map(),
          }
        : null,
  };
}

function cloneNameEntry(entry) {
  return {
    ...entry,
    gender:
      entry?.gender && typeof entry.gender === "object"
        ? {
            ...entry.gender,
          }
        : entry?.gender ?? null,
    nicknames: Array.isArray(entry?.nicknames) ? [...entry.nicknames] : [],
    relatedNames: Array.isArray(entry?.relatedNames) ? [...entry.relatedNames] : [],
    dayMeta: {
      ...(entry?.dayMeta ?? {}),
      ranking: normalizeRanking(entry?.dayMeta?.ranking),
    },
  };
}

function markEntryAsFinalPrimary(entry, sourceDay, preferredName) {
  const cloned = cloneNameEntry(entry);

  return {
    ...cloned,
    name: preferredName ?? cloned.name,
    dayMeta: {
      ...cloned.dayMeta,
      month: sourceDay.month,
      day: sourceDay.day,
      monthDay: sourceDay.monthDay,
      primary: true,
      primaryRegistry: true,
      primaryOverlay: false,
    },
  };
}

function buildFinalPrimaryOverlayEntry(template, sourceDay, preferredName) {
  const cloned = cloneNameEntry(template);

  return {
    ...cloned,
    name: preferredName ?? cloned.name,
    dayMeta: {
      month: sourceDay.month,
      day: sourceDay.day,
      monthDay: sourceDay.monthDay,
      primary: true,
      primaryLocal: false,
      primaryLegacy: false,
      primaryRanked: false,
      legacyOrder: null,
      ranking: null,
      primaryRegistry: true,
      primaryOverlay: true,
      sourceMonthDay: template?.dayMeta?.monthDay ?? null,
    },
  };
}

function splitPrimaryNamesForSourceDay(sourceDay, options) {
  if (options?.primarySelectionModeResolved === "canonical-final") {
    return splitFinalPrimaryNames(sourceDay);
  }

  return splitPrimaryNames(sourceDay.names, options?.primarySource);
}

function splitFinalPrimaryNames(sourceDay) {
  const normalizedPreferredNames = Array.isArray(sourceDay?.primaryRegistry?.normalizedPreferredNames)
    ? sourceDay.primaryRegistry.normalizedPreferredNames
    : [];

  if (normalizedPreferredNames.length === 0) {
    return {
      primaryNames: [],
      restNames: [...(sourceDay?.names ?? [])],
    };
  }

  const entryMap = new Map();

  for (const entry of sourceDay.names ?? []) {
    const normalized = normalizeNameForMatch(entry?.name);

    if (normalized && !entryMap.has(normalized)) {
      entryMap.set(normalized, entry);
    }
  }

  const primaryNames = normalizedPreferredNames.map((normalizedPreferredName) => {
    const entry = entryMap.get(normalizedPreferredName) ?? null;

    if (!entry) {
      throw new Error(
        `A végső primer név hiányzik a futásidejű ICS-forrásnapból: ${normalizedPreferredName} (${sourceDay.monthDay}).`
      );
    }

    return entry;
  });
  const selected = new Set(primaryNames);

  return {
    primaryNames,
    restNames: (sourceDay.names ?? []).filter((entry) => !selected.has(entry)),
  };
}

/**
 * A `normalizeSourceDays` normalizálja a megadott értéket.
 */
function normalizeSourceDays(days) {
  if (!Array.isArray(days)) {
    throw new Error("A bemeneti adatfájl nem tartalmaz érvényes days tömböt.");
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

/**
 * A `buildDaysFromNames` felépíti a szükséges adatszerkezetet.
 */
function buildDaysFromNames(names) {
  if (!Array.isArray(names)) {
    throw new Error("A bemeneti adatfájl nem tartalmaz érvényes names vagy days tömböt.");
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
        dayMeta: {
          month: dayEntry.month,
          day: dayEntry.day,
          monthDay: dayEntry.monthDay,
          primary: dayEntry.primary === true,
          primaryLocal: dayEntry.primaryLocal === true,
          primaryLegacy: dayEntry.primaryLegacy === true,
          primaryRanked: dayEntry.primaryRanked === true,
          legacyOrder: Number.isInteger(dayEntry.legacyOrder) ? dayEntry.legacyOrder : null,
          ranking: normalizeRanking(dayEntry.ranking),
        },
      });

      dayMap.set(dayEntry.monthDay, bucket);
    }
  }

  return Array.from(dayMap.values())
    .map((day) => ({
      ...day,
      names: day.names.sort((left, right) => collator.compare(left.name, right.name)),
    }))
    .sort((left, right) => left.monthDay.localeCompare(right.monthDay));
}

/**
 * Az `applyLocalPrimaryOverridesToSourceDays` a helyi primerkiegészítéseket rájelöli a napi névbejegyzésekre.
 *
 * Itt nem mozgatunk neveket másik napra és nem írjuk át a közös adatbázist sem:
 * kizárólag egy futásidejű jelölést adunk (`primaryLocal`), amelyet később a primer-szétválasztó
 * logika figyelembe vesz. Így ugyanabból a bemeneti YAML-ból készülhet közös és személyes naptár is.
 */
function applyLocalPrimaryOverridesToSourceDays(sourceDays, localPrimaryOverrideMap) {
  if (!(localPrimaryOverrideMap instanceof Map) || localPrimaryOverrideMap.size === 0) {
    return sourceDays;
  }

  return sourceDays.map((sourceDay) => {
    const localOverrideDay = localPrimaryOverrideMap.get(sourceDay.monthDay) ?? null;

    if (!localOverrideDay || !Array.isArray(sourceDay.names)) {
      return sourceDay;
    }

    const localNameSet = new Set(
      (localOverrideDay.addedPreferredNames ?? []).map((name) => normalizeNameForMatch(name))
    );

    if (localNameSet.size === 0) {
      return sourceDay;
    }

    return {
      ...sourceDay,
      names: sourceDay.names.map((entry) => {
        if (!entry || typeof entry !== "object" || typeof entry.name !== "string") {
          return entry;
        }

        return {
          ...entry,
          dayMeta: {
            ...(entry.dayMeta ?? {}),
            primaryLocal: localNameSet.has(normalizeNameForMatch(entry.name)),
          },
        };
      }),
    };
  });
}

/**
 * A `buildNameMapFromSourceDays` felépíti a szükséges adatszerkezetet.
 */
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

/**
 * A `buildLeapAwareEvents` felépíti a szükséges adatszerkezetet.
 */
function buildLeapAwareEvents(sourceDays, referenceNameMap, options) {
  if (options.leapStrategy === "b") {
    return buildLeapAwareRecurringEventsRecurrenceId(sourceDays, referenceNameMap, options);
  }

  return buildLeapAwareRecurringEvents(sourceDays, referenceNameMap, options);
}

/**
 * A `buildLeapAwareRecurringEventsRecurrenceId` felépíti a szükséges adatszerkezetet.
 */
function buildLeapAwareRecurringEventsRecurrenceId(sourceDays, referenceNameMap, options) {
  const events = [];
  let skippedEmptyPrimaryDays = 0;
  const leapYears = buildLeapYearsInRange(options.fromYear, options.untilYear);
  const leapYearNameMaps = buildLeapYearNameMaps(sourceDays, leapYears, options.leapMode);

  for (const sourceDay of sourceDays) {
    const masterActualDate = {
      year: options.fromYear,
      month: sourceDay.month,
      day: sourceDay.day,
      monthDay: sourceDay.monthDay,
      sourceMonthDay: sourceDay.monthDay,
      shifted: false,
      leapRule: buildLeapRuleForSourceDay(sourceDay),
    };
    const masterResult = buildEventsForContext({
      sourceDay,
      actualDate: masterActualDate,
      sourceNameMap: referenceNameMap,
      actualNameMap: referenceNameMap,
      options,
      year: null,
    });

    for (const event of masterResult.events) {
      event.rrule = buildYearlyRRule(sourceDay.month, sourceDay.day, options);
      event.sequence = 0;
      events.push(event);
    }

    skippedEmptyPrimaryDays += masterResult.skippedEmptyPrimaryDays;

    if (!masterActualDate.leapRule || leapYears.length === 0 || masterResult.events.length === 0) {
      continue;
    }

    for (const year of leapYears) {
      const actualDate = {
        ...resolveActualDate(year, sourceDay, options.leapMode),
        leapRule: masterActualDate.leapRule,
      };
      const overrideResult = buildEventsForContext({
        sourceDay,
        actualDate,
        sourceNameMap: referenceNameMap,
        actualNameMap: leapYearNameMaps.get(year) ?? referenceNameMap,
        options,
        year,
      });

      if (overrideResult.events.length !== masterResult.events.length) {
        throw new Error(
          `A szökőéves felülírás eseményszáma eltér ennél a napnál: ${sourceDay.monthDay}. Várt: ${masterResult.events.length}, kapott: ${overrideResult.events.length}.`
        );
      }

      for (const [index, overrideEvent] of overrideResult.events.entries()) {
        const masterEvent = masterResult.events[index];
        events.push({
          ...overrideEvent,
          uid: masterEvent.uid,
          recurrenceId: formatDateValue(year, sourceDay.month, sourceDay.day),
          rrule: null,
          rdates: [],
          exdates: [],
          sequence: 1,
        });
      }
    }
  }

  return {
    events,
    skippedEmptyPrimaryDays,
  };
}

/**
 * A `buildLeapYearsInRange` felépíti a szükséges adatszerkezetet.
 */
function buildLeapYearsInRange(fromYear, untilYear) {
  const years = [];

  for (let year = fromYear; year <= untilYear; year += 1) {
    if (isLeapYear(year)) {
      years.push(year);
    }
  }

  return years;
}

/**
 * A `buildLeapYearNameMaps` felépíti a szükséges adatszerkezetet.
 */
function buildLeapYearNameMaps(sourceDays, leapYears, leapMode) {
  const maps = new Map();

  for (const year of leapYears) {
    const actualDays = sourceDays
      .map((sourceDay) => ({
        sourceDay,
        actualDate: resolveActualDate(year, sourceDay, leapMode),
      }))
      .sort((left, right) => left.actualDate.monthDay.localeCompare(right.actualDate.monthDay));
    maps.set(year, buildYearNameMap(actualDays));
  }

  return maps;
}

/**
 * A `buildLeapAwareRecurringEvents` felépíti a szükséges adatszerkezetet.
 */
function buildLeapAwareRecurringEvents(sourceDays, referenceNameMap, options) {
  const events = [];
  let skippedEmptyPrimaryDays = 0;

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
    const dayResult = buildEventsForContext({
      sourceDay,
      actualDate,
      sourceNameMap: referenceNameMap,
      actualNameMap: referenceNameMap,
      options,
      year: null,
    });

    for (const event of dayResult.events) {
      event.rrule = recurrence.rrule;
      event.rdates = recurrence.rdates;
      event.exdates = recurrence.exdates;
      events.push(event);
    }

    skippedEmptyPrimaryDays += dayResult.skippedEmptyPrimaryDays;
  }

  return {
    events,
    skippedEmptyPrimaryDays,
  };
}

/**
 * A `buildRecurringEvents` felépíti a szükséges adatszerkezetet.
 */
function buildRecurringEvents(sourceDays, referenceNameMap, options) {
  const events = [];
  let skippedEmptyPrimaryDays = 0;

  for (const sourceDay of sourceDays) {
    const actualDate = {
      year: options.baseYear,
      month: sourceDay.month,
      day: sourceDay.day,
      monthDay: sourceDay.monthDay,
      sourceMonthDay: sourceDay.monthDay,
      shifted: false,
    };

    const dayResult = buildEventsForContext({
      sourceDay,
      actualDate,
      sourceNameMap: referenceNameMap,
      actualNameMap: referenceNameMap,
      options,
      year: null,
    });

    events.push(...dayResult.events);
    skippedEmptyPrimaryDays += dayResult.skippedEmptyPrimaryDays;
  }

  return {
    events,
    skippedEmptyPrimaryDays,
  };
}

/**
 * A `buildEventsForContext` felépíti a szükséges adatszerkezetet.
 */
function buildEventsForContext(context) {
  const { sourceDay, actualDate, sourceNameMap, actualNameMap, options, year } = context;
  const modeBehavior = getRenderBehavior(options);

  if (!modeBehavior.isPrimaryMode) {
    if (modeBehavior.grouped) {
      return {
        events: [
          buildGroupedEvent({
            sourceDay,
            actualDate,
            sourceNameMap,
            actualNameMap,
            options,
            year,
            eventNames: sourceDay.names,
            restNames: [],
          }),
        ],
        skippedEmptyPrimaryDays: 0,
      };
    }

    return {
      events: sourceDay.names.map((nameEntry) =>
        buildSingleNameEvent({
          nameEntry,
          sourceDay,
          actualDate,
          sourceNameMap,
          actualNameMap,
          options,
          year,
        })
      ),
      skippedEmptyPrimaryDays: 0,
    };
  }

  const selection = splitPrimaryNamesForSourceDay(sourceDay, options);

  if (selection.primaryNames.length === 0) {
    return {
      events: [],
      skippedEmptyPrimaryDays: 1,
    };
  }

  if (modeBehavior.grouped) {
    return {
      events: [
        buildGroupedEvent({
          sourceDay,
          actualDate,
          sourceNameMap,
          actualNameMap,
          options,
          year,
          eventNames: selection.primaryNames,
          restNames: modeBehavior.withRestDescription ? selection.restNames : [],
        }),
      ],
      skippedEmptyPrimaryDays: 0,
    };
  }

  const events = selection.primaryNames.map((nameEntry) =>
    buildSingleNameEvent({
      nameEntry,
      sourceDay,
      actualDate,
      sourceNameMap,
      actualNameMap,
      options,
      year,
    })
  );

  if (modeBehavior.withRemainderGrouped && selection.restNames.length > 0) {
    events.push(
      buildGroupedEvent({
        sourceDay,
        actualDate,
        sourceNameMap,
        actualNameMap,
        options,
        year,
        eventNames: selection.restNames,
        restNames: [],
      })
    );
  }

  return {
    events,
    skippedEmptyPrimaryDays: 0,
  };
}

/**
 * A `getRenderBehavior` visszaadja az aktuális futási modellhez tartozó viselkedési szabályokat.
 */
function getRenderBehavior(options) {
  const grouped = options.layout === "grouped";
  const isPrimaryMode = options.scope === "primary";

  return {
    grouped,
    isPrimaryMode,
    withRestDescription: isPrimaryMode && options.restHandling === "description",
    withRemainderGrouped: isPrimaryMode && options.restHandling === "daily-event",
  };
}

/**
 * A `splitPrimaryNames` felbontja a megadott szöveget vagy listát.
 */
function splitPrimaryNames(nameEntries, primarySource) {
  const localNames = nameEntries
    .filter((entry) => entry.dayMeta?.primaryLocal)
    .sort(compareByRankedPrimaryOrder);
  const legacyNames = nameEntries
    .filter((entry) => entry.dayMeta?.primaryLegacy)
    .sort(compareByLegacyPrimaryOrder);
  const rankedNames = nameEntries
    .filter((entry) => entry.dayMeta?.primaryRanked)
    .sort(compareByRankedPrimaryOrder);

  let primaryNames = [];

  if (primarySource === "legacy") {
    primaryNames = legacyNames;
  } else if (primarySource === "ranked") {
    primaryNames = rankedNames;
  } else if (primarySource === "either") {
    primaryNames = mergePrimarySelections(legacyNames, rankedNames, 2);
  } else {
    primaryNames = mergePrimarySelections(legacyNames, rankedNames);
  }

  primaryNames = mergeForcedLocalPrimarySelections(primaryNames, localNames);

  const selected = new Set(primaryNames);

  return {
    primaryNames,
    restNames: nameEntries.filter((entry) => !selected.has(entry)),
  };
}

/**
 * A `mergeForcedLocalPrimarySelections` a helyi, felhasználói primereket hozzáfűzi az alap kiválasztáshoz.
 *
 * A helyi jelölés nem helyettesíti a közös primerforrásokat, hanem kiegészíti őket. Ezért az alap,
 * közös primernevek sorrendjét meghagyjuk, és csak utána vesszük fel a még nem szereplő, helyben
 * kijelölt neveket.
 */
function mergeForcedLocalPrimarySelections(basePrimaryNames, localPrimaryNames) {
  const merged = [];
  const seen = new Set();

  for (const entry of [...basePrimaryNames, ...localPrimaryNames]) {
    const key = normalizeNameForMatch(entry?.name);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(entry);
  }

  return merged;
}

/**
 * A `mergePrimarySelections` összevonja a különböző primerforrásokból érkező jelöléseket.
 */
function mergePrimarySelections(primaryLegacy, primaryRanked, limit = Number.POSITIVE_INFINITY) {
  const merged = [];
  const seen = new Set();

  for (const entry of [...primaryLegacy, ...primaryRanked]) {
    const key = entry.name;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(entry);

    if (merged.length >= limit) {
      break;
    }
  }

  return merged;
}

/**
 * A `compareByLegacyPrimaryOrder` a legacy primer-sorrend alapján rendezi a neveket.
 */
function compareByLegacyPrimaryOrder(left, right) {
  const leftOrder = Number.isInteger(left.dayMeta?.legacyOrder)
    ? left.dayMeta.legacyOrder
    : Number.MAX_SAFE_INTEGER;
  const rightOrder = Number.isInteger(right.dayMeta?.legacyOrder)
    ? right.dayMeta.legacyOrder
    : Number.MAX_SAFE_INTEGER;

  return leftOrder - rightOrder || compareByRankedPrimaryOrder(left, right);
}

/**
 * A `compareByRankedPrimaryOrder` a rangsorolt primer-sorrend alapján rendezi a neveket.
 */
function compareByRankedPrimaryOrder(left, right) {
  const leftOrder = Number.isInteger(left.dayMeta?.ranking?.dayOrder)
    ? left.dayMeta.ranking.dayOrder
    : Number.MAX_SAFE_INTEGER;
  const rightOrder = Number.isInteger(right.dayMeta?.ranking?.dayOrder)
    ? right.dayMeta.ranking.dayOrder
    : Number.MAX_SAFE_INTEGER;

  return leftOrder - rightOrder || collator.compare(left.name, right.name);
}

/**
 * A `buildYearNameMap` felépíti a szükséges adatszerkezetet.
 */
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

/**
 * A `buildLeapRuleForSourceDay` felépíti a szükséges adatszerkezetet.
 */
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

/**
 * A `buildLeapAwareRecurrence` felépíti a szükséges adatszerkezetet.
 */
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

/**
 * A `buildGroupedEvent` felépíti a szükséges adatszerkezetet.
 */
function buildGroupedEvent(context) {
  const { sourceDay, actualDate, options, year } = context;
  const eventNames = Array.isArray(context.eventNames) ? context.eventNames : sourceDay.names;
  const summaryBase = eventNames.map((entry) => entry.name).join(", ");
  const ordinalText =
    options.ordinalDay === "summary" ? buildOrdinalTextForEvent(actualDate, year) : null;

  return {
    uid: buildUid({
      type: "grouped",
      key: buildGroupedEventUidKey(sourceDay, eventNames, options),
    }),
    summary: ordinalText ? `${summaryBase} (${ordinalText})` : summaryBase,
    startDate: formatDateValue(actualDate.year, actualDate.month, actualDate.day),
    endDate: formatDateValueFromDate(addDays(actualDate.year, actualDate.month, actualDate.day, 1)),
    rrule: year == null ? buildYearlyRRule(sourceDay.month, sourceDay.day, options) : null,
    description: buildGroupedDescription({
      ...context,
      eventNames,
      restNames: Array.isArray(context.restNames) ? context.restNames : [],
    }),
  };
}

/**
 * A `buildSingleNameEvent` felépíti a szükséges adatszerkezetet.
 */
function buildSingleNameEvent(context) {
  const { nameEntry, sourceDay, actualDate, options, year } = context;
  const ordinalText =
    options.ordinalDay === "summary" ? buildOrdinalTextForEvent(actualDate, year) : null;

  return {
    uid: buildUid({
      type: "single",
      key: buildSingleNameEventUidKey(nameEntry, sourceDay, options),
    }),
    summary: ordinalText ? `${nameEntry.name} (${ordinalText})` : nameEntry.name,
    startDate: formatDateValue(actualDate.year, actualDate.month, actualDate.day),
    endDate: formatDateValueFromDate(addDays(actualDate.year, actualDate.month, actualDate.day, 1)),
    rrule: year == null ? buildYearlyRRule(sourceDay.month, sourceDay.day, options) : null,
    description: buildSingleNameDescription(context),
  };
}

/**
 * A `buildGroupedDescription` felépíti a szükséges adatszerkezetet.
 */
function buildGroupedDescription(context) {
  const {
    actualDate,
    sourceNameMap,
    actualNameMap,
    options,
    year,
    eventNames = [],
    restNames = [],
  } = context;
  const displayYear = resolveDescriptionYear(options, year);
  const needsMetadata = options.descriptionMode !== "none";
  const needsOtherDays = options.includeOtherDays;
  const needsOrdinal = options.ordinalDay === "description";
  const needsShiftNote = actualDate.shifted && options.descriptionMode !== "none";
  const wantsHtml = options.descriptionFormat === "html" || options.descriptionFormat === "full";
  const needsRestSection = restNames.length > 0;

  if (!needsMetadata && !needsOtherDays && !needsOrdinal && !needsShiftNote && !needsRestSection) {
    return null;
  }

  const plainLines = [];
  const htmlParts = wantsHtml ? [] : null;

  if (needsMetadata || needsOtherDays) {
    if (options.descriptionMode === "detailed") {
      const header = buildDetailedDateHeader(
        actualDate,
        displayYear,
        needsOrdinal || displayYear != null
      );

      if (header) {
        plainLines.push(header);
        plainLines.push("-------------------------------------");
        if (htmlParts) {
          htmlParts.push(`<p><strong>${escapeHtml(header)}</strong></p><hr>`);
        }
      } else {
        if (needsShiftNote) {
          const shiftOverview = buildLeapShiftOverview(actualDate, displayYear);
          if (shiftOverview) {
            plainLines.push(shiftOverview);
            if (htmlParts) {
              htmlParts.push(`<p><strong>${escapeHtml(shiftOverview)}</strong></p>`);
            }
          }
        }

        if (needsOrdinal) {
          appendPlainDetailSection(
            plainLines,
            "Az év napja",
            buildOrdinalDescriptionLines(actualDate, displayYear)
          );
          if (htmlParts) {
            htmlParts.push(buildOrdinalDescriptionHtml(actualDate, displayYear));
          }
        }
      }

      if (htmlParts) {
        htmlParts.push("<ul>");
      }

      for (const nameEntry of eventNames) {
        const otherDays = buildOtherDaysList(
          actualNameMap.get(nameEntry.name) ?? sourceNameMap.get(nameEntry.name) ?? [],
          actualDate.monthDay
        );
        const decoratedNameEntry = decorateNameEntryForDescription(nameEntry, actualDate, year);

        plainLines.push(...buildDetailedPlainLines(decoratedNameEntry, otherDays, 0));
        if (nameEntry !== eventNames[eventNames.length - 1]) {
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

      for (const nameEntry of eventNames) {
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
  } else {
    if (needsShiftNote) {
      const shiftOverview = buildLeapShiftOverview(actualDate, displayYear);
      if (shiftOverview) {
        plainLines.push(shiftOverview);
        if (htmlParts) {
          htmlParts.push(`<p><strong>${escapeHtml(shiftOverview)}</strong></p>`);
        }
      }
    }

    if (needsOrdinal) {
      appendPlainDetailSection(
        plainLines,
        "Az év napja",
        buildOrdinalDescriptionLines(actualDate, displayYear)
      );
      if (htmlParts) {
        htmlParts.push(buildOrdinalDescriptionHtml(actualDate, displayYear));
      }
    }
  }

  if (needsRestSection) {
    appendRestNamesSectionPlain(plainLines, restNames);
    if (htmlParts) {
      htmlParts.push(buildRestNamesSectionHtml(restNames));
    }
  }

  while (plainLines[plainLines.length - 1] === "") {
    plainLines.pop();
  }

  return {
    plain: plainLines.join("\n"),
    html: htmlParts ? htmlParts.join("") : null,
  };
}

/**
 * A `buildSingleNameDescription` felépíti a szükséges adatszerkezetet.
 */
function buildSingleNameDescription(context) {
  const { nameEntry, actualDate, sourceNameMap, actualNameMap, options, year } = context;
  const displayYear = resolveDescriptionYear(options, year);
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
      const header = buildDetailedDateHeader(
        actualDate,
        displayYear,
        needsOrdinal || displayYear != null
      );

      if (header) {
        plainLines.push(header);
        plainLines.push("-------------------------------------");
        if (htmlParts) {
          htmlParts.push(`<p><strong>${escapeHtml(header)}</strong></p><hr>`);
        }
      } else {
        if (needsShiftNote) {
          const shiftOverview = buildLeapShiftOverview(actualDate, displayYear);
          if (shiftOverview) {
            plainLines.push(shiftOverview);
            if (htmlParts) {
              htmlParts.push(`<p><strong>${escapeHtml(shiftOverview)}</strong></p>`);
            }
          }
        }

        if (needsOrdinal) {
          appendPlainDetailSection(
            plainLines,
            "Az év napja",
            buildOrdinalDescriptionLines(actualDate, displayYear)
          );
          if (htmlParts) {
            htmlParts.push(buildOrdinalDescriptionHtml(actualDate, displayYear));
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
  } else {
    if (needsShiftNote) {
      const shiftOverview = buildLeapShiftOverview(actualDate, displayYear);
      if (shiftOverview) {
        plainLines.push(shiftOverview);
        if (htmlParts) {
          htmlParts.push(`<p><strong>${escapeHtml(shiftOverview)}</strong></p>`);
        }
      }
    }

    if (needsOrdinal) {
      appendPlainDetailSection(
        plainLines,
        "Az év napja",
        buildOrdinalDescriptionLines(actualDate, displayYear)
      );
      if (htmlParts) {
        htmlParts.push(buildOrdinalDescriptionHtml(actualDate, displayYear));
      }
    }
  }

  while (plainLines[plainLines.length - 1] === "") {
    plainLines.pop();
  }

  return {
    plain: plainLines.join("\n"),
    html: htmlParts ? htmlParts.join("") : null,
  };
}

/**
 * A `buildCompactPlainLine` felépíti a szükséges adatszerkezetet.
 */
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

/**
 * A `buildCompactHtmlLine` felépíti a szükséges adatszerkezetet.
 */
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

/**
 * A `buildDetailedPlainLines` részletes, sima szöveges leírássorokat állít elő egy névhez.
 */
function buildDetailedPlainLines(nameEntry, otherDays, _indentLevel) {
  const lines = [buildDetailedNameBanner(nameEntry)];

  const leapShiftText = buildLeapShiftLine(nameEntry);
  if (leapShiftText) {
    appendPlainDetailSection(lines, "Szökőévben", [leapShiftText]);
  }

  const otherDayLines = formatOtherDaysHuLines(otherDays);
  if (otherDayLines.length > 0) {
    appendPlainDetailSection(lines, "További napjai", otherDayLines);
  }

  if (nameEntry.origin) {
    appendPlainDetailSection(lines, "Eredete", [normalizeInlineDisplayText(nameEntry.origin)]);
  }

  if (nameEntry.meaning) {
    appendPlainDetailSection(lines, "Jelentése", [normalizeInlineDisplayText(nameEntry.meaning)]);
  }

  const nicknameLines = buildNicknamesLines(nameEntry);
  if (nicknameLines.length > 0) {
    appendPlainDetailSection(lines, "Becézései", nicknameLines);
  }

  const relatedNameLines = buildRelatedNamesLines(nameEntry);
  if (relatedNameLines.length > 0) {
    appendPlainDetailSection(lines, "Rokon nevek", relatedNameLines);
  }

  const frequencyLines = buildDetailedFrequencyLines(nameEntry);
  if (frequencyLines.length > 0) {
    appendPlainDetailSection(lines, "Gyakoriság", frequencyLines);
  }

  while (lines[lines.length - 1] === "") {
    lines.pop();
  }

  return lines;
}

/**
 * A `buildDetailedHtmlItem` felépíti a szükséges adatszerkezetet.
 */
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

  return `<li><strong>${escapeHtml(buildDetailedNameTitle(nameEntry))}</strong>${items.length > 0 ? `<ul>${items.join("")}</ul>` : ""}</li>`;
}

/**
 * A `buildFrequencyText` felépíti a szükséges adatszerkezetet.
 */
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

/**
 * A `describeFrequency` emberileg olvasható gyakoriságleírást készít.
 */
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

/**
 * A `frequencyLabelHu` magyar címkévé alakítja a gyakorisági kategóriát.
 */
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

/**
 * A `normalizeNamedayEntries` normalizálja a megadott értéket.
 */
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

/**
 * A `parseNamedayValue` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
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
      primaryLocal: false,
      primaryLegacy: false,
      primaryRanked: false,
      legacyOrder: null,
      ranking: null,
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
    primaryLocal: value.primaryLocal === true,
    primaryLegacy: value.primaryLegacy === true,
    primaryRanked: value.primaryRanked === true,
    legacyOrder: Number.isInteger(value.legacyOrder) ? value.legacyOrder : null,
    ranking: normalizeRanking(value.ranking),
  };
}

/**
 * A `normalizeRanking` normalizálja a megadott értéket.
 */
function normalizeRanking(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const dayOrder = Number.isInteger(value.dayOrder) ? value.dayOrder : null;
  const overallRank = Number.isInteger(value.overallRank) ? value.overallRank : null;
  const newbornRank = Number.isInteger(value.newbornRank) ? value.newbornRank : null;
  const overallWeight = Number.isInteger(value.overallWeight) ? value.overallWeight : 0;
  const newbornWeight = Number.isInteger(value.newbornWeight) ? value.newbornWeight : 0;
  const score = Number.isInteger(value.score) ? value.score : overallWeight + newbornWeight;

  if (dayOrder == null && overallRank == null && newbornRank == null && score === 0) {
    return null;
  }

  return {
    dayOrder,
    overallRank,
    newbornRank,
    overallWeight,
    newbornWeight,
    score,
  };
}

/**
 * A `buildOtherDaysList` felépíti a szükséges adatszerkezetet.
 */
function buildOtherDaysList(monthDays, currentMonthDay) {
  return monthDays.filter((monthDay) => monthDay !== currentMonthDay);
}

/**
 * A `formatOtherDaysHu` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatOtherDaysHu(monthDays) {
  const formatted = monthDays.map(formatMonthDayHuFromMonthDay).filter(Boolean);
  return formatted.length > 0 ? joinDisplayValues(formatted) : null;
}

/**
 * A `formatOtherDaysHuLines` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatOtherDaysHuLines(monthDays) {
  const formatted = monthDays.map(formatMonthDayHuFromMonthDay).filter(Boolean);
  return wrapDisplayValues(formatted, 22);
}

/**
 * A `decorateNameEntryForDescription` leíráskészítéshez dúsítja a névrekordot.
 */
function decorateNameEntryForDescription(nameEntry, actualDate, year) {
  return {
    ...nameEntry,
    leapShift: buildLeapShiftData(actualDate, year),
  };
}

/**
 * A `buildLeapShiftData` felépíti a szükséges adatszerkezetet.
 */
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

/**
 * A `resolveDescriptionYear` kiválasztja, melyik évhez készüljön a dátumfüggő leírás.
 */
function resolveDescriptionYear(options, year) {
  if (year != null) {
    return year;
  }

  if (options?.fromYear === options?.untilYear) {
    return options.fromYear;
  }

  return null;
}

/**
 * A `resolveOrdinalDate` feloldja a sorszámhoz tartozó tényleges dátumot.
 */
function resolveOrdinalDate(actualDate, year) {
  if (year == null) {
    return {
      month: actualDate.month,
      day: actualDate.day,
    };
  }

  if (actualDate?.shifted) {
    return {
      month: actualDate.month,
      day: actualDate.day,
    };
  }

  if (isLeapYear(year) && actualDate?.leapRule) {
    return {
      month: actualDate.leapRule.shiftedMonth,
      day: actualDate.leapRule.shiftedDay,
    };
  }

  return {
    month: actualDate.month,
    day: actualDate.day,
  };
}

/**
 * A `buildDetailedDateHeader` felépíti a szükséges adatszerkezetet.
 */
function buildDetailedDateHeader(actualDate, year, enabled) {
  if (!enabled || year == null) {
    return null;
  }

  const ordinalDate = resolveOrdinalDate(actualDate, year);
  const week = getIsoWeek(year, ordinalDate.month, ordinalDate.day);
  const dayOfYear = getDayOfYear(year, ordinalDate.month, ordinalDate.day);
  const leapLabel = shouldShowLeapYearBadge({ ...actualDate, ...ordinalDate }, year) ? " (szökőév)" : "";

  return `${year}. év ${week}. hete és ${dayOfYear}. napja${leapLabel}.`;
}

/**
 * A `buildLeapShiftOverview` felépíti a szükséges adatszerkezetet.
 */
function buildLeapShiftOverview(actualDate, year) {
  const leapShift = buildLeapShiftData(actualDate, year);

  if (!leapShift) {
    return null;
  }

  return `Ezen a napon szökőévben eltér a névnap szokásos dátuma.`;
}

/**
 * A `shouldShowLeapYearBadge` eldönti, hogy meg kell-e jeleníteni a szökőéves jelölést.
 */
function shouldShowLeapYearBadge(actualDate, year) {
  return isLeapYear(year) && actualDate.month === 2 && actualDate.day >= 20 && actualDate.day <= 29;
}

/**
 * A `buildDetailedNameTitle` felépíti a szükséges adatszerkezetet.
 */
function buildDetailedNameTitle(nameEntry) {
  const gender = prettifyGender(nameEntry.gender?.label);
  return gender ? `${nameEntry.name} (${gender})` : nameEntry.name;
}

/**
 * A `buildDetailedNameBanner` felépíti a szükséges adatszerkezetet.
 */
function buildDetailedNameBanner(nameEntry) {
  return `----[ ${buildDetailedNameTitle(nameEntry)} ]----`;
}

/**
 * A `buildLeapShiftLine` felépíti a szükséges adatszerkezetet.
 */
function buildLeapShiftLine(nameEntry) {
  if (!nameEntry?.leapShift) {
    return null;
  }

  return `${formatMonthDayHu(nameEntry.leapShift.actual.month, nameEntry.leapShift.actual.day)}; egyébként ${formatMonthDayHu(nameEntry.leapShift.regular.month, nameEntry.leapShift.regular.day)}`;
}

/**
 * A `buildNicknamesText` felépíti a szükséges adatszerkezetet.
 */
function buildNicknamesText(nameEntry) {
  const values = sanitizeDisplayValues(nameEntry?.nicknames);
  return values.length > 0 ? joinDisplayValues(values) : null;
}

/**
 * A `buildNicknamesLines` felépíti a szükséges adatszerkezetet.
 */
function buildNicknamesLines(nameEntry) {
  return wrapDisplayValues(sanitizeDisplayValues(nameEntry?.nicknames), 28);
}

/**
 * A `buildRelatedNamesText` felépíti a szükséges adatszerkezetet.
 */
function buildRelatedNamesText(nameEntry) {
  const values = sanitizeDisplayValues(nameEntry?.relatedNames);
  return values.length > 0 ? joinDisplayValues(values) : null;
}

/**
 * A `buildRelatedNamesLines` felépíti a szükséges adatszerkezetet.
 */
function buildRelatedNamesLines(nameEntry) {
  return wrapDisplayValues(sanitizeDisplayValues(nameEntry?.relatedNames), 28);
}

/**
 * A `buildDetailedFrequencyLines` felépíti a szükséges adatszerkezetet.
 */
function buildDetailedFrequencyLines(nameEntry) {
  const overall = frequencyLabelHu(nameEntry.frequency?.overall);
  const newborns = frequencyLabelHu(nameEntry.frequency?.newborns);
  const metaLabel = polishFrequencyMetaLabel(nameEntry.meta?.frequency?.labelHu);

  if (!overall && !newborns && !metaLabel) {
    return [];
  }

  const lines = [];

  if (metaLabel) {
    lines.push(ensureTrailingSentence(capitalizeSentence(metaLabel)));
  }

  if (overall) {
    lines.push(`Össznépesség: ${ensureTrailingSentence(describeFrequencyValue(overall))}`);
  }

  if (newborns) {
    lines.push(`Újszülöttek: ${ensureTrailingSentence(describeFrequencyValue(newborns))}`);
  }

  return lines;
}

/**
 * A `buildDetailedFrequencyHtml` felépíti a szükséges adatszerkezetet.
 */
function buildDetailedFrequencyHtml(nameEntry) {
  const lines = buildDetailedFrequencyLines(nameEntry);

  if (lines.length === 0) {
    return null;
  }

  return lines.map((line) => escapeHtml(line)).join("<br>");
}

/**
 * Az `appendPlainDetailSection` új szöveges részblokkot fűz a leíráshoz.
 */
function appendPlainDetailSection(lines, label, values) {
  const cleanValues = values.map(normalizeInlineDisplayText).filter(Boolean);

  if (cleanValues.length === 0) {
    return;
  }

  lines.push(label);

  for (const value of cleanValues) {
    lines.push(`• ${value}`);
  }

  lines.push("");
}

/**
 * Az `appendRestNamesSectionPlain` a nem primer nevek szakaszát fűzi a sima szöveghez.
 */
function appendRestNamesSectionPlain(lines, restNames) {
  const wrappedNames = wrapDisplayValues(
    restNames.map((entry) => entry.name).filter(Boolean),
    22
  );

  if (wrappedNames.length === 0) {
    return;
  }

  if (lines.length > 0 && lines[lines.length - 1] !== "") {
    lines.push("");
  }

  lines.push("A nap további névnapjai");

  for (const row of wrappedNames) {
    lines.push(`• ${row}`);
  }

  lines.push("");
}

/**
 * A `buildRestNamesSectionHtml` felépíti a szükséges adatszerkezetet.
 */
function buildRestNamesSectionHtml(restNames) {
  const values = sanitizeDisplayValues(restNames.map((entry) => entry.name));

  if (values.length === 0) {
    return "";
  }

  const items = values.map((value) => `<li>${escapeHtml(value)}</li>`).join("");
  return `<p><strong>A nap további névnapjai</strong></p><ul>${items}</ul>`;
}

/**
 * A `describeFrequencyValue` emberileg olvasható alakra hozza a gyakorisági értéket.
 */
function describeFrequencyValue(label) {
  if (label === "néhány előfordulás") {
    return "csak néhány előfordulás ismert";
  }

  if (label === "első tízben") {
    return "az első tízben van";
  }

  return label;
}

/**
 * A `normalizeInlineDisplayText` normalizálja a megadott értéket.
 */
function normalizeInlineDisplayText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/\s*‣\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A `joinDisplayValues` összefűzi a kapcsolódó értékeket.
 */
function joinDisplayValues(values) {
  return values.join(" • ");
}

/**
 * A `sanitizeDisplayValues` kiszűri vagy megtisztítja a zajos bemenetet.
 */
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

/**
 * A `wrapDisplayValues` megjelenítésbarát sorokra töri a hosszú értéklistát.
 */
function wrapDisplayValues(values, maxLength = 44) {
  if (!Array.isArray(values) || values.length === 0) {
    return [];
  }

  const rows = [];
  let current = "";

  for (const value of values) {
    const cleanValue = normalizeInlineDisplayText(value);

    if (!cleanValue) {
      continue;
    }

    const next = current ? `${current} • ${cleanValue}` : cleanValue;

    if (current && next.length > maxLength) {
      rows.push(current);
      current = cleanValue;
      continue;
    }

    current = next;
  }

  if (current) {
    rows.push(current);
  }

  return rows;
}

/**
 * A `capitalizeSentence` nagybetűssé teszi a mondat első karakterét.
 */
function capitalizeSentence(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  return value.charAt(0).toLocaleUpperCase("hu-HU") + value.slice(1);
}

/**
 * Az `ensureTrailingSentence` gondoskodik a mondatzáró írásjelről.
 */
function ensureTrailingSentence(value) {
  if (typeof value !== "string" || value.length === 0) {
    return "";
  }

  return /[.!?]$/.test(value) ? value : `${value}.`;
}

/**
 * A `polishFrequencyMetaLabel` végleges, magyar címkét készít a gyakorisági metaadathoz.
 */
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

/**
 * A `buildOrdinalDescriptionLines` felépíti a szükséges adatszerkezetet.
 */
function buildOrdinalDescriptionLines(actualDate, year) {
  if (year != null) {
    const ordinalDate = resolveOrdinalDate(actualDate, year);
    const week = getIsoWeek(year, ordinalDate.month, ordinalDate.day);
    const dayOfYear = getDayOfYear(year, ordinalDate.month, ordinalDate.day);
    const leapLabel = shouldShowLeapYearBadge({ ...actualDate, ...ordinalDate }, year) ? " (szökőév)" : "";
    return [`${year}. év ${week}. hete és ${dayOfYear}. napja${leapLabel}.`];
  }

  const regular = getDayOfYear(2025, actualDate.month, actualDate.day);
  const leapMonth = actualDate.leapRule?.shiftedMonth ?? actualDate.month;
  const leapDay = actualDate.leapRule?.shiftedDay ?? actualDate.day;
  const leap = getDayOfYear(2024, leapMonth, leapDay);

  if (regular === leap) {
    return [`${regular}. nap.`];
  }

  return [`${regular}. nap.`, `Szökőévben: ${leap}. nap.`];
}

/**
 * A `buildOrdinalDescriptionHtml` felépíti a szükséges adatszerkezetet.
 */
function buildOrdinalDescriptionHtml(actualDate, year) {
  const lines = buildOrdinalDescriptionLines(actualDate, year);
  const items = lines.map((line) => `<li>${escapeHtml(line)}</li>`).join("");
  return `<p><strong>Az év napja</strong></p><ul>${items}</ul>`;
}

/**
 * A `buildOrdinalTextForEvent` felépíti a szükséges adatszerkezetet.
 */
function buildOrdinalTextForEvent(actualDate, year) {
  if (year != null) {
    const ordinalDate = resolveOrdinalDate(actualDate, year);
    return `${getDayOfYear(year, ordinalDate.month, ordinalDate.day)}. nap`;
  }

  const regular = getDayOfYear(2025, actualDate.month, actualDate.day);
  const leapMonth = actualDate.leapRule?.shiftedMonth ?? actualDate.month;
  const leapDay = actualDate.leapRule?.shiftedDay ?? actualDate.day;
  const leap = getDayOfYear(2024, leapMonth, leapDay);

  if (regular === leap) {
    return `${regular}. nap`;
  }

  return `${regular}. nap (szökőévben: ${leap}.)`;
}

/**
 * A `buildGroupedEventUidKey` felépíti a szükséges adatszerkezetet.
 */
function buildGroupedEventUidKey(sourceDay, eventNames, options) {
  const summaryBase = eventNames.map((entry) => entry.name).join(", ");
  return [
    options.calendarPartition ?? "all",
    options.leapStrategy ?? "a",
    sourceDay.monthDay,
    summaryBase,
  ].join("|");
}

/**
 * A `buildSingleNameEventUidKey` felépíti a szükséges adatszerkezetet.
 */
function buildSingleNameEventUidKey(nameEntry, sourceDay, options) {
  return [
    options.calendarPartition ?? "all",
    options.leapStrategy ?? "a",
    nameEntry.name,
    sourceDay.monthDay,
  ].join("|");
}

/**
 * A `buildUid` felépíti a szükséges adatszerkezetet.
 */
function buildUid(parts) {
  const hash = crypto.createHash("sha1").update(`${parts.type}|${parts.key}`).digest("hex");
  return `nevnap-${hash.slice(0, 24)}@nevnapok.local`;
}

/**
 * A `buildYearlyRRule` felépíti a szükséges adatszerkezetet.
 */
function buildYearlyRRule(month, day, options) {
  const parts = [`FREQ=YEARLY`, `BYMONTH=${month}`, `BYMONTHDAY=${day}`];

  if (options.rruleUntil) {
    parts.push(`UNTIL=${options.rruleUntil}`);
  }

  return parts.join(";");
}

/**
 * A `resolveActualDate` a szökőéves szabályokkal együtt meghatározza a tényleges eseménydátumot.
 */
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

/**
 * A `serializeCalendar` ICS szöveggé alakítja a naptárstruktúrát.
 */
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

/**
 * A `buildCalendarDescription` felépíti a szükséges adatszerkezetet.
 */
function buildCalendarDescription(payload, options, eventCount) {
  const parts = [];
  const renderBehavior = getRenderBehavior(options);

  parts.push(`Forrás: ${payload?.source?.provider ?? "nevnapok.yaml"}`);
  parts.push(`Események: ${eventCount}`);

  if (options.calendarPartition) {
    parts.push(`Naptár-rész: ${calendarPartitionLabelHu(options.calendarPartition)}`);
  }

  parts.push(`Hatókör: ${scopeLabelHu(options.scope)}`);
  parts.push(`Elrendezés: ${layoutLabelHu(options.layout)}`);
  parts.push(`További nevek kezelése: ${restHandlingLabelHu(options.restHandling)}`);

  if (options.restHandling === "split") {
    parts.push(`További naptár elrendezése: ${layoutLabelHu(options.restLayout)}`);
  }

  if (renderBehavior.isPrimaryMode) {
    parts.push(`Elsődleges forrás: ${primarySelectionLabelHu(options)}`);
  }

  parts.push(`Leírás: ${descriptionModeLabelHu(options.descriptionMode)}`);
  parts.push(`Leírás formátuma: ${descriptionFormatLabelHu(options.descriptionFormat)}`);
  parts.push(`További névnapok: ${options.includeOtherDays ? "bekapcsolva" : "kikapcsolva"}`);
  parts.push(`Év napja: ${ordinalModeLabelHu(options.ordinalDay)}`);

  if (options.leapProfile !== "off") {
    parts.push(`Szökőéves profil: ${leapProfileLabelHu(options.leapProfile)}`);
    parts.push(`Szökőéves tartomány vége: ${options.untilYear}`);
  } else {
    parts.push("Szökőéves profil: kikapcsolva");
  }

  return parts.join("; ");
}

/**
 * A `normalizeOptions` normalizálja a megadott értéket.
 */
export function normalizeOptions(options = {}) {
  const hasExplicitPrimarySource = Object.prototype.hasOwnProperty.call(options, "primarySource");
  const normalized = {
    input: options.input ?? DEFAULT_INPUT_PATH,
    output: options.output ?? DEFAULT_OUTPUT_PATH,
    primaryOutput: options.primaryOutput ?? null,
    restOutput: options.restOutput ?? null,
    scope: options.scope ?? "all",
    layout: options.layout ?? "grouped",
    restHandling: options.restHandling ?? "hidden",
    restLayout: options.restLayout ?? null,
    primarySource: options.primarySource ?? "default",
    primarySourceConfigured: hasExplicitPrimarySource,
    primarySelectionMode: options.primarySelectionMode ?? "auto",
    primarySelectionModeResolved: null,
    leapProfile: options.leapProfile ?? "off",
    leapStrategy: "b",
    descriptionMode: options.descriptionMode ?? "none",
    descriptionFormat: options.descriptionFormat ?? "text",
    includeOtherDays: options.includeOtherDays ?? false,
    leapMode: "none",
    ordinalDay: options.ordinalDay ?? "none",
    calendarName: options.calendarName ?? DEFAULT_CALENDAR_NAME,
    localPrimaryOverrides: options.localPrimaryOverrides ?? null,
    calendarPartition: options.calendarPartition ?? null,
    baseYear: options.baseYear ?? 2024,
    fromYear: options.fromYear ?? CURRENT_YEAR,
    untilYear: options.untilYear ?? 2040,
    rruleUntil: null,
  };

  const validScopes = new Set(["all", "primary"]);
  const validLayouts = new Set(["grouped", "separate"]);
  const validRestHandling = new Set(["hidden", "description", "daily-event", "split"]);
  const validPrimarySources = new Set(["default", "legacy", "ranked", "either"]);
  const validPrimarySelectionModes = new Set(["auto", "configured", "canonical-final"]);
  const validDescriptionModes = new Set(["none", "compact", "detailed"]);
  const validDescriptionFormats = new Set(["text", "html", "full"]);
  const validLeapProfiles = new Set(["off", "hungarian-a", "hungarian-b", "hungarian-both"]);
  const validOrdinalModes = new Set(["none", "summary", "description"]);

  if (!validScopes.has(normalized.scope)) {
    throw new Error("A --scope kapcsoló értéke ezek egyike lehet: all, primary.");
  }

  if (!validLayouts.has(normalized.layout)) {
    throw new Error("A --layout kapcsoló értéke ezek egyike lehet: grouped, separate.");
  }

  if (!validRestHandling.has(normalized.restHandling)) {
    throw new Error(
      "A --rest-handling kapcsoló értéke ezek egyike lehet: hidden, description, daily-event, split."
    );
  }

  if (!validPrimarySources.has(normalized.primarySource)) {
    throw new Error("A személyes primerforrás ezek egyike lehet: default, legacy, ranked, either.");
  }

  if (!validPrimarySelectionModes.has(normalized.primarySelectionMode)) {
    throw new Error(
      "A belső primarySelectionMode értéke ezek egyike lehet: auto, configured, canonical-final."
    );
  }

  if (!validDescriptionModes.has(normalized.descriptionMode)) {
    throw new Error("A --description kapcsoló értéke ezek egyike lehet: none, compact, detailed.");
  }

  if (normalized.descriptionFormat === "both") {
    throw new Error("A --description-format=both megszűnt. Használd helyette a full értéket.");
  }

  if (!validDescriptionFormats.has(normalized.descriptionFormat)) {
    throw new Error("A --description-format kapcsoló értéke ezek egyike lehet: text, html, full.");
  }

  if (!validLeapProfiles.has(normalized.leapProfile)) {
    throw new Error(
      "A --leap-profile kapcsoló értéke ezek egyike lehet: off, hungarian-a, hungarian-b, hungarian-both."
    );
  }

  if (!validOrdinalModes.has(normalized.ordinalDay)) {
    throw new Error("A --ordinal-day kapcsoló értéke ezek egyike lehet: none, summary, description.");
  }

  if (normalized.scope === "all" && normalized.restHandling !== "hidden") {
    throw new Error(
      "A --rest-handling csak --scope primary mellett lehet description, daily-event vagy split."
    );
  }

  if (normalized.restHandling === "split") {
    normalized.restLayout = normalized.restLayout ?? normalized.layout;

    if (!validLayouts.has(normalized.restLayout)) {
      throw new Error("A --rest-layout kapcsoló értéke ezek egyike lehet: grouped, separate.");
    }
  } else {
    if (normalized.restLayout != null) {
      throw new Error("A --rest-layout csak --rest-handling split mellett használható.");
    }

    normalized.restLayout = null;
  }

  if (normalized.restHandling !== "split") {
    if (normalized.primaryOutput != null) {
      throw new Error("A --primary-output csak --rest-handling split mellett használható.");
    }

    if (normalized.restOutput != null) {
      throw new Error("A --rest-output csak --rest-handling split mellett használható.");
    }
  }

  if (!Number.isInteger(normalized.baseYear) || normalized.baseYear < 1900) {
    throw new Error("A --base-year kapcsoló értékének egész évszámnak kell lennie.");
  }

  if (!Number.isInteger(normalized.fromYear) || normalized.fromYear < 1900) {
    throw new Error("A --from-year kapcsoló értékének egész évszámnak kell lennie.");
  }

  if (!Number.isInteger(normalized.untilYear) || normalized.untilYear < normalized.fromYear) {
    throw new Error("A --until-year kapcsoló értékének egész évszámnak kell lennie, és nem lehet kisebb a --from-year értékénél.");
  }

  if (normalized.leapProfile !== "off" && normalized.untilYear > 2050) {
    throw new Error("A --until-year értéke nem lehet nagyobb 2050-nél, ha a --leap-profile engedélyezve van.");
  }

  if (normalized.leapProfile === "hungarian-a") {
    normalized.leapMode = "hungarian-until-2050";
    normalized.leapStrategy = "a";
    normalized.rruleUntil = formatUntilDateTime(normalized.untilYear);
  } else if (normalized.leapProfile === "hungarian-b") {
    normalized.leapMode = "hungarian-until-2050";
    normalized.leapStrategy = "b";
    normalized.rruleUntil = formatUntilDateTime(normalized.untilYear);
  } else if (normalized.leapProfile === "hungarian-both") {
    normalized.leapMode = "hungarian-until-2050";
    normalized.leapStrategy = "both";
    normalized.rruleUntil = formatUntilDateTime(normalized.untilYear);
  }

  return normalized;
}

/**
 * A `parseArgs` feldolgozza a bemenetet és strukturált eredményt ad vissza.
 */
export function parseArgs(argv = []) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--split-primary-rest" || arg.startsWith("--split-primary-rest=")) {
      throw new Error(
        "A --split-primary-rest megszűnt. Használd a --scope primary --rest-handling split kapcsolókat."
      );
    }

    if (arg === "--mode" || arg.startsWith("--mode=")) {
      throw new Error(
        "A --mode megszűnt. Használd a --scope, --layout és --rest-handling kapcsolókat."
      );
    }

    if (arg === "--primary-calendar-mode" || arg.startsWith("--primary-calendar-mode=")) {
      throw new Error(
        "A --primary-calendar-mode megszűnt. Használd a --layout kapcsolót, split esetén pedig a --rest-layout kapcsolót."
      );
    }

    if (arg === "--rest-calendar-mode" || arg.startsWith("--rest-calendar-mode=")) {
      throw new Error(
        "A --rest-calendar-mode megszűnt. Használd helyette a --rest-layout kapcsolót."
      );
    }

    if (arg === "--primary-source" || arg.startsWith("--primary-source=")) {
      throw new Error(
        "A --primary-source megszűnt a publikus ICS-felületen. A személyes primerforrást a helyi beállítások kezelik."
      );
    }

    if (arg === "--leap-mode" || arg.startsWith("--leap-mode=")) {
      throw new Error(
        "A --leap-mode megszűnt. Használd helyette a --leap-profile kapcsolót."
      );
    }

    if (arg === "--leap-strategy" || arg.startsWith("--leap-strategy=")) {
      throw new Error(
        "A --leap-strategy megszűnt. Használd helyette a --leap-profile kapcsolót."
      );
    }

    if (arg === "--include-other-days") {
      options.includeOtherDays = true;
      continue;
    }

    if (arg === "--no-other-days") {
      throw new Error("A --no-other-days megszűnt. Egyszerűen hagyd el az --include-other-days kapcsolót.");
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

    if (arg === "--primary-output" && argv[index + 1]) {
      options.primaryOutput = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--primary-output=")) {
      options.primaryOutput = arg.slice("--primary-output=".length);
      continue;
    }

    if (arg === "--rest-output" && argv[index + 1]) {
      options.restOutput = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--rest-output=")) {
      options.restOutput = arg.slice("--rest-output=".length);
      continue;
    }

    if (arg === "--scope" && argv[index + 1]) {
      options.scope = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--scope=")) {
      options.scope = arg.slice("--scope=".length);
      continue;
    }

    if (arg === "--layout" && argv[index + 1]) {
      options.layout = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--layout=")) {
      options.layout = arg.slice("--layout=".length);
      continue;
    }

    if (arg === "--rest-handling" && argv[index + 1]) {
      options.restHandling = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--rest-handling=")) {
      options.restHandling = arg.slice("--rest-handling=".length);
      continue;
    }

    if (arg === "--rest-layout" && argv[index + 1]) {
      options.restLayout = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--rest-layout=")) {
      options.restLayout = arg.slice("--rest-layout=".length);
      continue;
    }

    if (arg === "--leap-profile" && argv[index + 1]) {
      options.leapProfile = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--leap-profile=")) {
      options.leapProfile = arg.slice("--leap-profile=".length);
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
      if (arg.slice("--description-format=".length) === "both") {
        throw new Error("A --description-format=both megszűnt. Használd helyette a full értéket.");
      }

      options.descriptionFormat = arg.slice("--description-format=".length);
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

    if (arg === "--local-primary-overrides") {
      const kovetkezo = argv[index + 1];

      if (!kovetkezo || kovetkezo.startsWith("--")) {
        options.localPrimaryOverrides = DEFAULT_LOCAL_PRIMARY_OVERRIDES_PATH;
      } else {
        options.localPrimaryOverrides = kovetkezo;
        index += 1;
      }

      continue;
    }

    if (arg.startsWith("--local-primary-overrides=")) {
      const value = arg.slice("--local-primary-overrides=".length);
      options.localPrimaryOverrides = value || DEFAULT_LOCAL_PRIMARY_OVERRIDES_PATH;
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

    if (arg.startsWith("--")) {
      throw new Error(`Ismeretlen ICS-kapcsoló: ${arg}`);
    }
  }

  return options;
}

/**
 * A `prettifyGender` emberileg olvasható nemmegnevezést ad vissza.
 */
function prettifyGender(value) {
  if (value === "female") {
    return "női";
  }

  if (value === "male") {
    return "férfi";
  }

  return value;
}

function leapStrategyFileSuffix(value) {
  if (value === "b") {
    return "B";
  }

  return "A";
}

/**
 * A `leapProfileLabelHu` magyar címkét ad a szökőéves profilhoz.
 */
function leapProfileLabelHu(value) {
  if (value === "off") {
    return "kikapcsolva";
  }

  if (value === "hungarian-a") {
    return "magyar eltolás A";
  }

  if (value === "hungarian-b") {
    return "magyar eltolás B";
  }

  if (value === "hungarian-both") {
    return "magyar eltolás A + B";
  }

  return value;
}

/**
 * A `calendarPartitionLabelHu` magyar címkét ad a naptárpartícióhoz.
 */
function calendarPartitionLabelHu(value) {
  if (value === "primary") {
    return "elsődleges névnapok";
  }

  if (value === "rest") {
    return "további névnapok";
  }

  return value;
}

/**
 * A `descriptionModeLabelHu` magyar címkét ad a leírásmódhoz.
 */
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

/**
 * A `descriptionFormatLabelHu` magyar címkét ad a leírásformátumhoz.
 */
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

/**
 * A `ordinalModeLabelHu` magyar címkét ad a sorszám-megjelenítési módhoz.
 */
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

/**
 * A `scopeLabelHu` magyar címkét ad a hatókörhöz.
 */
function scopeLabelHu(value) {
  if (value === "all") {
    return "összes névnap";
  }

  if (value === "primary") {
    return "csak elsődleges nevek";
  }

  return value;
}

/**
 * A `layoutLabelHu` magyar címkét ad az eseményelrendezéshez.
 */
function layoutLabelHu(value) {
  if (value === "grouped") {
    return "naponként együtt";
  }

  if (value === "separate") {
    return "névenként külön";
  }

  return value;
}

/**
 * A `restHandlingLabelHu` magyar címkét ad a nem elsődleges nevek kezeléséhez.
 */
function restHandlingLabelHu(value) {
  if (value === "hidden") {
    return "elrejtve";
  }

  if (value === "description") {
    return "a leírásban";
  }

  if (value === "daily-event") {
    return "külön napi eseményben";
  }

  if (value === "split") {
    return "külön naptárban";
  }

  return value;
}

/**
 * A `primarySourceLabelHu` magyar címkét ad a primerforrás típusához.
 */
function primarySourceLabelHu(value) {
  if (value === "default") {
    return "alapértelmezett (legacy + ranking kiegészítés)";
  }

  if (value === "legacy") {
    return "legacy elsődleges nevek";
  }

  if (value === "ranked") {
    return "ranking elsődleges nevek";
  }

  if (value === "either") {
    return "legacy vagy ranking uniója";
  }

  return value;
}

function primarySelectionLabelHu(options) {
  if (options?.primarySelectionModeResolved === "canonical-final") {
    return "végső primerjegyzék";
  }

  return primarySourceLabelHu(options?.primarySource);
}

/**
 * A `uniqueSorted` duplikátummentes, rendezett tömböt ad vissza.
 */
function uniqueSorted(values) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
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
 * A `formatDateTimeUtc` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatDateTimeUtc(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  const seconds = String(date.getUTCSeconds()).padStart(2, "0");

  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

/**
 * A `formatUntilDateTime` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatUntilDateTime(year) {
  return `${String(year).padStart(4, "0")}1231T235959Z`;
}

/**
 * A `formatMonthDay` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatMonthDay(month, day) {
  return `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A `formatMonthDayHu` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
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

/**
 * A `formatMonthDayHuFromMonthDay` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatMonthDayHuFromMonthDay(monthDay) {
  const parsed = parseNamedayValue(monthDay);
  return parsed ? formatMonthDayHu(parsed.month, parsed.day) : null;
}

/**
 * A `getIsoWeek` visszaadja a dátum ISO-hetszámát.
 */
function getIsoWeek(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dayNumber = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
}

/**
 * A `isLeapYear` ellenőrzi a kapcsolódó feltételt.
 */
function isLeapYear(year) {
  if (year % 400 === 0) {
    return true;
  }

  if (year % 100 === 0) {
    return false;
  }

  return year % 4 === 0;
}

/**
 * A `getDayOfYear` visszaadja az év naptári sorszámát.
 */
function getDayOfYear(year, month, day) {
  const current = Date.UTC(year, month - 1, day);
  const start = Date.UTC(year, 0, 1);
  const diff = current - start;
  return Math.floor(diff / 86_400_000) + 1;
}

/**
 * A `formatTextProperty` megjelenítésre alkalmas alakra formázza a megadott értéket.
 */
function formatTextProperty(name, value) {
  return `${name}:${escapeIcsText(value)}`;
}

/**
 * A `escapeIcsText` kimenetbiztos alakra escape-eli a szöveget.
 */
function escapeIcsText(value) {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/**
 * A `escapeHtml` kimenetbiztos alakra escape-eli a szöveget.
 */
function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A `foldLine` a célformátum szabályai szerint tördel egy sort.
 */
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  futtatCliModban().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
