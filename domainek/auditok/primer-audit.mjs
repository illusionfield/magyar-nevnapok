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
  const localOverrideMap = buildHelyiPrimerFelulirasMap(localOverridesPayload);
  const finalRowMap = indexRowsByMonthDay(finalReport.months);
  const missingRowMap = indexRowsByMonthDay(missingReport.months);
  const rawDayMap = buildRawDayMap(inputPayload);
  const months = epitHonapVazat();
  const allMonthDays = Array.from(
    new Set([...finalRowMap.keys(), ...missingRowMap.keys(), ...rawDayMap.keys(), ...localOverrideMap.keys()])
  ).sort(compareMonthDays);
  let rowCount = 0;
  let warningDayCount = 0;
  let hiddenNameCount = 0;
  let localSelectedCount = 0;
  let localSelectedDayCount = 0;
  let localOnlySelectedCount = 0;

  for (const monthDay of allMonthDays) {
    const finalRow = finalRowMap.get(monthDay) ?? createEmptyFinalRow(monthDay);
    const missingRow = missingRowMap.get(monthDay) ?? createEmptyMissingRow(monthDay);
    const rawDay = rawDayMap.get(monthDay) ?? createRawEmptyDayEntry(monthDay);
    const localDay = localOverrideMap.get(monthDay) ?? null;
    const selectedNames = [...(localDay?.addedPreferredNames ?? [])];
    const selectedNameSet = new Set(selectedNames.map((name) => normalizeNameForMatch(name)));
    const combinedMissing = withLocalSelection(missingRow.combinedMissing ?? [], selectedNameSet);
    const normalizedMissing = withLocalSelection(missingRow.normalizedMissing ?? [], selectedNameSet);
    const rankingMissing = withLocalSelection(missingRow.rankingMissing ?? [], selectedNameSet);
    const personalEntries = buildPersonalEntries(combinedMissing, selectedNames);
    const finalPrimaryNames = [...(missingRow.finalPrimaryNames ?? finalRow.preferredNames ?? [])];
    const row = {
      month: finalRow.month,
      day: finalRow.day,
      monthDay,
      preferredNames: finalPrimaryNames,
      finalPrimaryNames,
      finalPrimaryCount: finalPrimaryNames.length,
      source: finalRow.source ?? null,
      warning: Boolean(finalRow.warning),
      names: [...(finalRow.names ?? [])],
      rawNames: [...(rawDay.names ?? [])],
      legacy: [...(finalRow.legacy ?? [])],
      wiki: [...(finalRow.wiki ?? [])],
      normalized: [...(finalRow.normalized ?? [])],
      ranking: [...(finalRow.ranking ?? [])],
      hidden: [...(finalRow.hidden ?? [])],
      combinedMissing,
      normalizedMissing,
      rankingMissing,
      localSelectedNames: selectedNames,
      localSelectedCount: selectedNames.length,
      personalEntries,
      sections: {
        osszefoglalo: {
          preferredNames: finalPrimaryNames,
          source: finalRow.source ?? null,
          warning: Boolean(finalRow.warning),
          hiddenCount: (finalRow.hidden ?? []).length,
          combinedMissingCount: combinedMissing.length,
          localSelectedCount: selectedNames.length,
          rawNameCount: (rawDay.names ?? []).length,
        },
        forrasok: {
          preferredNames: finalPrimaryNames,
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
          combinedMissing,
          normalizedMissing,
          rankingMissing,
        },
        szemelyes: {
          settingsSnapshot: localSettings,
          selectedNames,
          entries: personalEntries,
        },
      },
    };

    months[row.month - 1].rows.push(row);
    rowCount += 1;
    warningDayCount += row.warning ? 1 : 0;
    hiddenNameCount += row.hidden.length;
    localSelectedCount += selectedNames.length;
    localSelectedDayCount += selectedNames.length > 0 ? 1 : 0;
    localOnlySelectedCount += personalEntries.filter((entry) => entry.localSelected && entry.sources.length === 0).length;
  }

  return {
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
      rowCount,
      warningDayCount,
      hiddenNameCount,
      combinedMissingCount: missingReport.summary?.combinedMissingCount ?? 0,
      normalizedMissingCount: missingReport.summary?.normalizedMissingCount ?? 0,
      rankingMissingCount: missingReport.summary?.rankingMissingCount ?? 0,
      uniqueMissingNameCount: missingReport.summary?.uniqueMissingNameCount ?? 0,
      combinedMissingDayCount: months.reduce(
        (sum, month) => sum + month.rows.filter((row) => row.combinedMissing.length > 0).length,
        0
      ),
      localSelectedCount,
      localSelectedDayCount,
      localOnlySelectedCount,
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

function withLocalSelection(entries, selectedNameSet) {
  return (entries ?? []).map((entry) => ({
    ...entry,
    localSelected: selectedNameSet.has(normalizeNameForMatch(entry.name)),
  }));
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
      ["Helyi kijelölt nevek", report.summary?.localSelectedCount ?? 0],
      ["Kemény hibák", report.summary?.hardFailureCount ?? 0],
    ],
    {
      keyWidth: 28,
      valueWidth: 20,
    }
  );

  const mintaSorok = (report.months ?? [])
    .flatMap((month) => month.rows ?? [])
    .filter((row) => row.warning || row.combinedMissing.length > 0 || row.localSelectedCount > 0)
    .slice(0, 12)
    .map((row) => ({
      nap: row.monthDay,
      primerek: row.preferredNames.join(", ") || "—",
      forras: row.source ?? "—",
      hianyzo: row.combinedMissing.length,
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
