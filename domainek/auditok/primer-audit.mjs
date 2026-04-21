/**
 * domainek/auditok/primer-audit.mjs
 * Egységes, felhasználóbarát primer audit a források, hiányzók és személyes állapot közös nézetéhez.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_FINAL_PRIMARY_REGISTRY_PATH,
  DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH,
  DEFAULT_PRIMARY_REGISTRY_OVERRIDES_PATH,
  DEFAULT_WIKI_PRIMARY_REGISTRY_PATH,
  loadPrimaryRegistry,
  loadPrimaryRegistryOverrides,
  normalizeNameForMatch,
  parseMonthDay,
} from "../primer/alap.mjs";
import {
  betoltHelyiPrimerBeallitasokat,
  betoltHelyiPrimerFelulirasokat,
  buildHelyiPrimerFelulirasMap,
  egyesitHelyiPrimerMapokat,
  egyesitHelyiPrimerNeveket,
  epitModositoPrimerMapot,
} from "../primer/helyi-primer-felulirasok.mjs";
import {
  betoltStrukturaltFajl,
  mentStrukturaltFajl,
} from "../../kozos/strukturalt-fajl.mjs";
import {
  printDataTable,
  printKeyValueTable,
} from "../../kozos/terminal-tabla.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";
import {
  buildRawDayMap,
  compareMonthDays,
  createEmptyDayEntry,
  createRawEmptyDayEntry,
  epitHonapVazat,
} from "./kozos/primer-riport-alap.mjs";
import { buildPrimaryNelkulMaradoNevekRiport } from "./primer-nelkul-marado-nevek.mjs";
import { buildFinalPrimaryRegistryReport } from "./vegso-primer-riport.mjs";

const DEFAULT_NORMALIZED_REGISTRY_PATH = kanonikusUtvonalak.primer.normalizaloRiport;
const DEFAULT_INPUT_PATH = kanonikusUtvonalak.adatbazis.nevnapok;
const DEFAULT_REPORT_PATH = kanonikusUtvonalak.riportok.primerAudit;
const DEFAULT_LOCAL_CONFIG_PATH = kanonikusUtvonalak.helyi.nevnapokKonfig;

const args = parseArgs(process.argv.slice(2));

export async function buildPrimerAuditReport({
  finalRegistryPayload,
  legacyRegistryPayload,
  wikiRegistryPayload,
  normalizedRegistryPayload,
  overridesPayload,
  inputPayload,
  localSettings,
  localOverridesPayload,
  inputs,
}) {
  const finalReport = buildFinalPrimaryRegistryReport({
    finalRegistryPayload,
    legacyRegistryPayload,
    wikiRegistryPayload,
    normalizedRegistryPayload,
    overridesPayload,
    inputPayload,
    inputs,
  });
  const missingReport = buildPrimaryNelkulMaradoNevekRiport({
    finalRegistryPayload,
    normalizedRegistryPayload,
    inputPayload,
    inputs: {
      ...inputs,
      reportPath: inputs.reportPath ?? DEFAULT_REPORT_PATH,
    },
  });
  const finalRowMap = indexRowsByMonthDay(finalReport.months);
  const missingRowMap = indexRowsByMonthDay(missingReport.months);
  const rawDayMap = buildRawDayMap(inputPayload);
  const months = epitHonapVazat();
  const allMonthDays = Array.from(
    new Set([...finalRowMap.keys(), ...missingRowMap.keys(), ...rawDayMap.keys()])
  ).sort(compareMonthDays);

  for (const monthDay of allMonthDays) {
    const finalRow = finalRowMap.get(monthDay) ?? createEmptyFinalRow(monthDay);
    const missingRow = missingRowMap.get(monthDay) ?? createEmptyMissingRow(monthDay);
    const rawDay = rawDayMap.get(monthDay) ?? createRawEmptyDayEntry(monthDay);
    const finalPrimaryNames =
      finalRow.preferredNames?.length > 0
        ? [...finalRow.preferredNames]
        : [...(missingRow.finalPrimaryNames ?? [])];
    const row = {
      month: finalRow.month,
      day: finalRow.day,
      monthDay,
      preferredNames: finalPrimaryNames,
      finalPrimaryNames,
      finalPrimaryCount: finalPrimaryNames.length,
      commonPreferredNames: finalPrimaryNames,
      source: finalRow.source ?? null,
      warning: Boolean(finalRow.warning),
      names: [...(finalRow.names ?? [])],
      rawNames: [...(rawDay.names ?? [])],
      legacy: [...(finalRow.legacy ?? [])],
      wiki: [...(finalRow.wiki ?? [])],
      normalized: [...(finalRow.normalized ?? [])],
      ranking: [...(finalRow.ranking ?? [])],
      hidden: [...(finalRow.hidden ?? [])],
      combinedMissing: [...(missingRow.combinedMissing ?? [])],
      normalizedMissing: [...(missingRow.normalizedMissing ?? [])],
      rankingMissing: [...(missingRow.rankingMissing ?? [])],
      localSelectedNames: [],
      localSelectedCount: 0,
      personalEntries: buildPersonalEntries(missingRow.combinedMissing ?? [], []),
      sections: {
        osszefoglalo: {
          preferredNames: finalPrimaryNames,
          commonPreferredNames: finalPrimaryNames,
          localAddedPreferredNames: [],
          effectivePreferredNames: finalPrimaryNames,
          effectivePreferredCount: finalPrimaryNames.length,
          source: finalRow.source ?? null,
          warning: Boolean(finalRow.warning),
          hiddenCount: (finalRow.hidden ?? []).length,
          combinedMissingCount: (missingRow.combinedMissing ?? []).length,
          locallyResolvedMissingCount: 0,
          effectiveMissingCount: (missingRow.combinedMissing ?? []).length,
          localSelectedCount: 0,
          rawNameCount: (rawDay.names ?? []).length,
        },
        forrasok: {
          preferredNames: finalPrimaryNames,
          commonPreferredNames: finalPrimaryNames,
          localAddedPreferredNames: [],
          effectivePreferredNames: finalPrimaryNames,
          legacy: [...(finalRow.legacy ?? [])],
          wiki: [...(finalRow.wiki ?? [])],
          normalized: [...(finalRow.normalized ?? [])],
          ranking: [...(finalRow.ranking ?? [])],
          hidden: [...(finalRow.hidden ?? [])],
          rawNames: [...(rawDay.names ?? [])],
          source: finalRow.source ?? null,
          warning: Boolean(finalRow.warning),
        },
        hianyzok: {
          combinedMissing: [...(missingRow.combinedMissing ?? [])],
          normalizedMissing: [...(missingRow.normalizedMissing ?? [])],
          rankingMissing: [...(missingRow.rankingMissing ?? [])],
          locallyResolvedMissing: [],
          effectiveMissing: [...(missingRow.combinedMissing ?? [])],
        },
        szemelyes: {
          settingsSnapshot: localSettings,
          selectedNames: [],
          entries: buildPersonalEntries(missingRow.combinedMissing ?? [], []),
        },
      },
    };

    months[row.month - 1].rows.push(row);
  }

  const baseReport = {
    version: 1,
    generatedAt: new Date().toISOString(),
    report: "primer-audit",
    inputs: {
      finalRegistryPath: path.relative(process.cwd(), inputs.finalRegistryPath),
      legacyRegistryPath: path.relative(process.cwd(), inputs.legacyRegistryPath),
      wikiRegistryPath: path.relative(process.cwd(), inputs.wikiRegistryPath),
      normalizedRegistryPath: path.relative(process.cwd(), inputs.normalizedRegistryPath),
      inputPath: path.relative(process.cwd(), inputs.inputPath),
      overridesPath: path.relative(process.cwd(), inputs.overridesPath),
      localConfigPath: path.relative(process.cwd(), inputs.localConfigPath),
      localConfigSourcePath: path.relative(process.cwd(), inputs.localConfigSourcePath),
    },
    summary: {
      rowCount: allMonthDays.length,
      warningDayCount: months.reduce(
        (sum, month) => sum + month.rows.filter((row) => row.warning === true).length,
        0
      ),
      hiddenNameCount: months.reduce(
        (sum, month) => sum + month.rows.reduce((monthSum, row) => monthSum + row.hidden.length, 0),
        0
      ),
      combinedMissingCount: missingReport.summary?.combinedMissingCount ?? 0,
      normalizedMissingCount: missingReport.summary?.normalizedMissingCount ?? 0,
      rankingMissingCount: missingReport.summary?.rankingMissingCount ?? 0,
      uniqueMissingNameCount: missingReport.summary?.uniqueMissingNameCount ?? 0,
      combinedMissingDayCount: months.reduce(
        (sum, month) => sum + month.rows.filter((row) => row.combinedMissing.length > 0).length,
        0
      ),
      locallyResolvedMissingCount: 0,
      effectiveMissingCount: missingReport.summary?.combinedMissingCount ?? 0,
      effectiveMissingDayCount: months.reduce(
        (sum, month) => sum + month.rows.filter((row) => row.combinedMissing.length > 0).length,
        0
      ),
      localSelectedCount: 0,
      localSelectedDayCount: 0,
      localOnlySelectedCount: 0,
      hardFailureCount: finalReport.validations?.hardFailureCount ?? 0,
      mismatchDayCount: finalReport.validations?.mismatchMonthDays?.length ?? 0,
      overrideDayCount: finalReport.validations?.overrideDayCount ?? 0,
      neverPrimaryCount: finalReport.summary?.neverPrimaryCount ?? 0,
      neverPrimaryWithSimilarPrimaryCount:
        finalReport.summary?.neverPrimaryWithSimilarPrimaryCount ?? 0,
      neverPrimaryWithoutSimilarPrimaryCount:
        finalReport.summary?.neverPrimaryWithoutSimilarPrimaryCount ?? 0,
    },
    validations: finalReport.validations ?? {},
    personal: {
      settingsSnapshot: localSettings,
    },
    months,
  };

  return alkalmazHelyiPrimerOverlaytPrimerAuditRiporton(baseReport, {
    localSettings,
    localOverridesPayload,
  });
}

function indexRowsByMonthDay(months) {
  const map = new Map();

  for (const month of months ?? []) {
    for (const row of month.rows ?? []) {
      map.set(row.monthDay, {
        ...row,
        monthName: month.monthName,
      });
    }
  }

  return map;
}

function createEmptyFinalRow(monthDay) {
  const day = createEmptyDayEntry(monthDay, { includeMetadata: true });

  return {
    month: day.month,
    day: day.day,
    monthDay,
    names: [],
    preferredNames: [],
    legacy: [],
    wiki: [],
    normalized: [],
    ranking: [],
    hidden: [],
    source: null,
    warning: false,
  };
}

function createEmptyMissingRow(monthDay) {
  const parsed = parseMonthDay(monthDay);

  return {
    month: parsed?.month ?? 0,
    day: parsed?.day ?? 0,
    monthDay,
    finalPrimaryNames: [],
    finalPrimaryCount: 0,
    combinedMissing: [],
    normalizedMissing: [],
    rankingMissing: [],
  };
}

function normalizeMissingEntries(entries) {
  return (entries ?? []).map((entry) => ({
    ...entry,
    sources: [...(entry.sources ?? [])],
    similarPrimaries: [...(entry.similarPrimaries ?? [])],
  }));
}

function withLocalSelection(entries, selectedNameSet) {
  return (entries ?? []).map((entry) => ({
    ...entry,
    localSelected: selectedNameSet.has(normalizeNameForMatch(entry.name)),
  }));
}

function buildNameSet(values = []) {
  return new Set(
    values
      .map((value) => normalizeNameForMatch(value))
      .filter(Boolean)
  );
}

function pickCommonPreferredNames(row) {
  return [
    ...(row.commonPreferredNames ??
      row.finalPrimaryNames ??
      row.preferredNames ??
      row.sections?.osszefoglalo?.commonPreferredNames ??
      row.sections?.osszefoglalo?.preferredNames ??
      []),
  ];
}

function pickRequestedLocalNames(row, effectiveLocalMap) {
  const localDay = effectiveLocalMap.get(row.monthDay) ?? null;

  if (localDay) {
    return [...(localDay.addedPreferredNames ?? [])];
  }

  return [
    ...(row.localRequestedNames ??
      row.sections?.szemelyes?.selectedNames ??
      row.localSelectedNames ??
      []),
  ];
}

function buildAvailableNameSetForRow(row) {
  return buildNameSet(
    egyesitHelyiPrimerNeveket(
      pickCommonPreferredNames(row),
      row.names ?? [],
      row.rawNames ?? row.sections?.forrasok?.rawNames ?? [],
      row.legacy ?? row.sections?.forrasok?.legacy ?? [],
      row.wiki ?? row.sections?.forrasok?.wiki ?? [],
      row.normalized ?? row.sections?.forrasok?.normalized ?? [],
      row.ranking ?? row.sections?.forrasok?.ranking ?? [],
      row.hidden ?? row.sections?.forrasok?.hidden ?? [],
      (row.combinedMissing ?? row.sections?.hianyzok?.combinedMissing ?? []).map((entry) => entry.name),
      (row.normalizedMissing ?? row.sections?.hianyzok?.normalizedMissing ?? []).map(
        (entry) => entry.name
      ),
      (row.rankingMissing ?? row.sections?.hianyzok?.rankingMissing ?? []).map(
        (entry) => entry.name
      )
    )
  );
}

function splitRequestedLocalNames(row, requestedLocalNames) {
  const availableNameSet = buildAvailableNameSetForRow(row);
  const commonNameSet = buildNameSet(pickCommonPreferredNames(row));
  const localAddedPreferredNames = [];
  const unresolvedLocalNames = [];
  const seenAdded = new Set();
  const seenUnresolved = new Set();

  for (const name of requestedLocalNames ?? []) {
    const normalized = normalizeNameForMatch(name);

    if (!normalized) {
      continue;
    }

    if (!availableNameSet.has(normalized)) {
      if (!seenUnresolved.has(normalized)) {
        seenUnresolved.add(normalized);
        unresolvedLocalNames.push(name);
      }
      continue;
    }

    if (commonNameSet.has(normalized) || seenAdded.has(normalized)) {
      continue;
    }

    seenAdded.add(normalized);
    localAddedPreferredNames.push(name);
  }

  return {
    localAddedPreferredNames,
    unresolvedLocalNames,
  };
}

function splitMissingByEffectiveSelection(entries, effectivePreferredNames) {
  const effectiveNameSet = buildNameSet(effectivePreferredNames);
  const locallyResolvedMissing = [];
  const effectiveMissing = [];

  for (const entry of entries ?? []) {
    if (effectiveNameSet.has(normalizeNameForMatch(entry.name))) {
      locallyResolvedMissing.push(entry);
      continue;
    }

    effectiveMissing.push(entry);
  }

  return {
    locallyResolvedMissing,
    effectiveMissing,
  };
}

function cloneReportMonthWithRows(month, rows) {
  return {
    ...month,
    rows,
  };
}

export function buildVeglegesitettHelyiPrimerMapotPrimerAuditRiportbol(report) {
  const map = new Map();

  for (const month of report?.months ?? []) {
    for (const row of month.rows ?? []) {
      const addedPreferredNames = [
        ...(row.localAddedPreferredNames ??
          row.sections?.osszefoglalo?.localAddedPreferredNames ??
          []),
      ];

      if (addedPreferredNames.length === 0) {
        continue;
      }

      map.set(row.monthDay, {
        month: row.month,
        day: row.day,
        monthDay: row.monthDay,
        addedPreferredNames,
      });
    }
  }

  return map;
}

export function buildPrimerAuditVeglegesitettPrimerPayload(report, opciok = {}) {
  const mezokulcs = opciok.useCommon === true ? "commonPreferredNames" : "effectivePreferredNames";
  const days = [];

  for (const month of report?.months ?? []) {
    for (const row of month.rows ?? []) {
      const preferredNames = [
        ...(row[mezokulcs] ??
          row.sections?.osszefoglalo?.[mezokulcs] ??
          row.finalPrimaryNames ??
          row.preferredNames ??
          []),
      ];

      days.push({
        month: row.month,
        day: row.day,
        monthDay: row.monthDay,
        names: preferredNames,
        preferredNames,
      });
    }
  }

  return {
    version: 1,
    generatedAt: report?.generatedAt ?? new Date().toISOString(),
    source:
      mezokulcs === "commonPreferredNames"
        ? "primer audit közös primer snapshot"
        : "primer audit véglegesített primer snapshot",
    days,
  };
}

export function alkalmazHelyiPrimerOverlaytPrimerAuditRiporton(
  report,
  { localSettings, localOverridesPayload } = {}
) {
  const settings = localSettings ?? report?.personal?.settingsSnapshot ?? {
    primarySource: "default",
    modifiers: {
      normalized: false,
      ranking: false,
    },
  };
  const manualMap = localOverridesPayload
    ? buildHelyiPrimerFelulirasMap(localOverridesPayload)
    : new Map();
  const modifierMap =
    settings?.modifiers?.normalized === true || settings?.modifiers?.ranking === true
      ? epitModositoPrimerMapot(report, settings.modifiers)
      : new Map();
  const effectiveLocalMap = egyesitHelyiPrimerMapokat(modifierMap, manualMap);

  let localSelectedCount = 0;
  let localSelectedDayCount = 0;
  let localOnlySelectedCount = 0;
  let locallyResolvedMissingCount = 0;
  let effectiveMissingCount = 0;
  let effectiveMissingDayCount = 0;

  const nextMonths = (report?.months ?? []).map((month) => {
    const nextRows = (month.rows ?? []).map((row) => {
      const commonPreferredNames = pickCommonPreferredNames(row);
      const requestedLocalNames = pickRequestedLocalNames(row, effectiveLocalMap);
      const { localAddedPreferredNames, unresolvedLocalNames } = splitRequestedLocalNames(
        row,
        requestedLocalNames
      );
      const combinedMissing = withLocalSelection(
        normalizeMissingEntries(row.combinedMissing ?? row.sections?.hianyzok?.combinedMissing ?? []),
        buildNameSet(requestedLocalNames)
      );
      const normalizedMissing = withLocalSelection(
        normalizeMissingEntries(
          row.normalizedMissing ?? row.sections?.hianyzok?.normalizedMissing ?? []
        ),
        buildNameSet(requestedLocalNames)
      );
      const rankingMissing = withLocalSelection(
        normalizeMissingEntries(row.rankingMissing ?? row.sections?.hianyzok?.rankingMissing ?? []),
        buildNameSet(requestedLocalNames)
      );
      const effectivePreferredNames = egyesitHelyiPrimerNeveket(
        commonPreferredNames,
        localAddedPreferredNames
      );
      const { locallyResolvedMissing, effectiveMissing } = splitMissingByEffectiveSelection(
        combinedMissing,
        effectivePreferredNames
      );
      const personalEntries = buildPersonalEntries(combinedMissing, requestedLocalNames);

      localSelectedCount += localAddedPreferredNames.length;
      localSelectedDayCount += localAddedPreferredNames.length > 0 ? 1 : 0;
      localOnlySelectedCount += unresolvedLocalNames.length;
      locallyResolvedMissingCount += locallyResolvedMissing.length;
      effectiveMissingCount += effectiveMissing.length;
      effectiveMissingDayCount += effectiveMissing.length > 0 ? 1 : 0;

      return {
        ...row,
        preferredNames: commonPreferredNames,
        finalPrimaryNames: commonPreferredNames,
        finalPrimaryCount: commonPreferredNames.length,
        commonPreferredNames,
        localRequestedNames: requestedLocalNames,
        localAddedPreferredNames,
        unresolvedLocalNames,
        effectivePreferredNames,
        effectivePreferredCount: effectivePreferredNames.length,
        combinedMissing,
        normalizedMissing,
        rankingMissing,
        locallyResolvedMissing,
        effectiveMissing,
        localSelectedNames: localAddedPreferredNames,
        localSelectedCount: localAddedPreferredNames.length,
        personalEntries,
        sections: {
          ...(row.sections ?? {}),
          osszefoglalo: {
            ...(row.sections?.osszefoglalo ?? {}),
            preferredNames: commonPreferredNames,
            commonPreferredNames,
            localAddedPreferredNames,
            effectivePreferredNames,
            effectivePreferredCount: effectivePreferredNames.length,
            combinedMissingCount: combinedMissing.length,
            locallyResolvedMissingCount: locallyResolvedMissing.length,
            effectiveMissingCount: effectiveMissing.length,
            localSelectedCount: localAddedPreferredNames.length,
          },
          forrasok: {
            ...(row.sections?.forrasok ?? {}),
            preferredNames: commonPreferredNames,
            commonPreferredNames,
            localAddedPreferredNames,
            effectivePreferredNames,
          },
          hianyzok: {
            ...(row.sections?.hianyzok ?? {}),
            combinedMissing,
            normalizedMissing,
            rankingMissing,
            locallyResolvedMissing,
            effectiveMissing,
          },
          szemelyes: {
            ...(row.sections?.szemelyes ?? {}),
            settingsSnapshot: settings,
            selectedNames: requestedLocalNames,
            localAddedPreferredNames,
            unresolvedLocalNames,
            entries: personalEntries,
          },
        },
      };
    });

    return cloneReportMonthWithRows(month, nextRows);
  });

  return {
    ...report,
    summary: {
      ...(report?.summary ?? {}),
      localSelectedCount,
      localSelectedDayCount,
      localOnlySelectedCount,
      locallyResolvedMissingCount,
      effectiveMissingCount,
      effectiveMissingDayCount,
    },
    personal: {
      ...(report?.personal ?? {}),
      settingsSnapshot: settings,
    },
    months: nextMonths,
  };
}

function buildPersonalEntries(combinedMissing, selectedNames) {
  const entries = [];
  const seen = new Set();

  for (const entry of combinedMissing ?? []) {
    const normalized = normalizeNameForMatch(entry.name);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    entries.push({
      ...entry,
      localSelectable: true,
    });
  }

  for (const name of selectedNames ?? []) {
    const normalized = normalizeNameForMatch(name);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    entries.push({
      name,
      sources: [],
      highlight: false,
      similarPrimaries: [],
      localSelected: true,
      localSelectable: true,
      manualOnly: true,
    });
  }

  return entries;
}

function printReport(report) {
  printKeyValueTable(
    "Primer audit összegzés",
    [
      ["Riport", "primer-audit"],
      ["Napok", report.summary?.rowCount ?? 0],
      ["Figyelmeztetéses napok", report.summary?.warningDayCount ?? 0],
      ["Rejtett nevek összesen", report.summary?.hiddenNameCount ?? 0],
      ["Közös hiányzó nevek", report.summary?.combinedMissingCount ?? 0],
      ["Helyben feloldott hiányzók", report.summary?.locallyResolvedMissingCount ?? 0],
      ["Helyben nyitott hiányzók", report.summary?.effectiveMissingCount ?? 0],
      ["Helyi overlay nevek", report.summary?.localSelectedCount ?? 0],
      ["Kemény hibák", report.summary?.hardFailureCount ?? 0],
    ],
    {
      keyWidth: 28,
      valueWidth: 20,
    }
  );

  const mintaSorok = (report.months ?? [])
    .flatMap((month) => month.rows ?? [])
    .filter(
      (row) =>
        row.warning ||
        (row.effectiveMissing ?? row.combinedMissing ?? []).length > 0 ||
        row.localSelectedCount > 0
    )
    .slice(0, 12)
    .map((row) => ({
      nap: row.monthDay,
      primerek: (row.effectivePreferredNames ?? row.preferredNames ?? []).join(", ") || "—",
      forras: row.source ?? "—",
      hianyzo: (row.effectiveMissing ?? row.combinedMissing ?? []).length,
      helyi: row.localSelectedCount,
    }));

  if (mintaSorok.length > 0) {
    printDataTable(
      "Kiemelt napok",
      [
        { key: "nap", title: "Nap", width: 8 },
        { key: "primerek", title: "Végső primerek", width: 28 },
        { key: "forras", title: "Forrás", width: 20 },
        { key: "hianyzo", title: "Hiányzó", width: 10 },
        { key: "helyi", title: "Helyi", width: 10 },
      ],
      mintaSorok
    );
  }
}

async function main() {
  const finalRegistryPath = path.resolve(process.cwd(), args.final ?? DEFAULT_FINAL_PRIMARY_REGISTRY_PATH);
  const legacyRegistryPath = path.resolve(
    process.cwd(),
    args.legacy ?? DEFAULT_LEGACY_PRIMARY_REGISTRY_PATH
  );
  const wikiRegistryPath = path.resolve(process.cwd(), args.wiki ?? DEFAULT_WIKI_PRIMARY_REGISTRY_PATH);
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
  const localConfigPath = path.resolve(process.cwd(), args.local ?? DEFAULT_LOCAL_CONFIG_PATH);
  const [finalRegistry, legacyRegistry, wikiRegistry, normalizedRegistry, overridesRegistry, inputPayload, localSettings, localOverrides] =
    await Promise.all([
      loadPrimaryRegistry(finalRegistryPath),
      loadPrimaryRegistry(legacyRegistryPath),
      loadPrimaryRegistry(wikiRegistryPath),
      loadPrimaryRegistry(normalizedRegistryPath),
      loadPrimaryRegistryOverrides(overridesPath),
      betoltStrukturaltFajl(inputPath),
      betoltHelyiPrimerBeallitasokat(localConfigPath),
      betoltHelyiPrimerFelulirasokat(localConfigPath),
    ]);

  const report = await buildPrimerAuditReport({
    finalRegistryPayload: finalRegistry.payload,
    legacyRegistryPayload: legacyRegistry.payload,
    wikiRegistryPayload: wikiRegistry.payload,
    normalizedRegistryPayload: normalizedRegistry.payload,
    overridesPayload: overridesRegistry.payload,
    inputPayload,
    localSettings: localSettings.settings,
    localOverridesPayload: localOverrides.payload,
    inputs: {
      finalRegistryPath,
      legacyRegistryPath,
      wikiRegistryPath,
      normalizedRegistryPath,
      inputPath,
      overridesPath,
      localConfigPath,
      localConfigSourcePath: localOverrides.sourcePath,
      reportPath,
    },
  });

  await fs.mkdir(path.dirname(reportPath), { recursive: true });
  await mentStrukturaltFajl(reportPath, report);
  printReport(report);
}

function parseArgs(argv = []) {
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

    if (arg === "--local" && argv[index + 1]) {
      options.local = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--local=")) {
      options.local = arg.slice("--local=".length);
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
