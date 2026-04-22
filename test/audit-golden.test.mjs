import test from "node:test";
import assert from "node:assert/strict";

import { buildPrimerAuditReport } from "../domainek/auditok/primer-audit.mjs";
import { buildPrimaryNelkulMaradoNevekRiport } from "../domainek/auditok/primer-nelkul-marado-nevek.mjs";
import { buildFinalPrimaryRegistryReport } from "../domainek/auditok/vegso-primer-riport.mjs";
import {
  alapertelmezettHelyiPrimerBeallitasok,
  uresHelyiPrimerFelulirasPayload,
} from "../domainek/primer/helyi-primer-felulirasok.mjs";
import {
  loadPrimaryRegistry,
  loadPrimaryRegistryOverrides,
} from "../domainek/primer/alap.mjs";
import { betoltStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../kozos/utvonalak.mjs";

const EXPECTED_MISMATCH_DAYS = [
  "01-01",
  "01-02",
  "02-13",
  "02-21",
  "04-21",
  "04-27",
  "05-01",
  "05-09",
  "05-24",
  "06-03",
  "06-05",
  "06-07",
  "06-17",
  "07-28",
  "07-29",
  "08-26",
  "09-23",
  "10-07",
  "10-14",
  "10-20",
  "10-23",
  "11-02",
  "12-03",
  "12-11",
  "12-16",
];

const fixturePromise = loadAuditGoldenFixture();

function findRow(months, monthDay) {
  for (const month of months ?? []) {
    for (const row of month.rows ?? []) {
      if (row.monthDay === monthDay) {
        return row;
      }
    }
  }

  return null;
}

async function loadAuditGoldenFixture() {
  const [
    finalRegistry,
    legacyRegistry,
    wikiRegistry,
    normalizedRegistry,
    overridesRegistry,
    inputPayload,
    trackedWikiVsLegacy,
    trackedPrimerNormalizalo,
  ] = await Promise.all([
    loadPrimaryRegistry(kanonikusUtvonalak.primer.vegso),
    loadPrimaryRegistry(kanonikusUtvonalak.primer.legacy),
    loadPrimaryRegistry(kanonikusUtvonalak.primer.wiki),
    loadPrimaryRegistry(kanonikusUtvonalak.primer.normalizaloRiport),
    loadPrimaryRegistryOverrides(kanonikusUtvonalak.kezi.primerFelulirasok),
    betoltStrukturaltFajl(kanonikusUtvonalak.adatbazis.nevnapok),
    betoltStrukturaltFajl(kanonikusUtvonalak.riportok.wikiVsLegacy),
    betoltStrukturaltFajl(kanonikusUtvonalak.riportok.primerNormalizalo),
  ]);

  const inputs = {
    finalRegistryPath: kanonikusUtvonalak.primer.vegso,
    legacyRegistryPath: kanonikusUtvonalak.primer.legacy,
    wikiRegistryPath: kanonikusUtvonalak.primer.wiki,
    normalizedRegistryPath: kanonikusUtvonalak.primer.normalizaloRiport,
    inputPath: kanonikusUtvonalak.adatbazis.nevnapok,
    overridesPath: kanonikusUtvonalak.kezi.primerFelulirasok,
    reportPath: kanonikusUtvonalak.riportok.primerAudit,
    localConfigPath: kanonikusUtvonalak.helyi.nevnapokKonfig,
    localConfigSourcePath: kanonikusUtvonalak.helyi.nevnapokKonfig,
  };

  const finalReport = buildFinalPrimaryRegistryReport({
    finalRegistryPayload: finalRegistry.payload,
    legacyRegistryPayload: legacyRegistry.payload,
    wikiRegistryPayload: wikiRegistry.payload,
    normalizedRegistryPayload: normalizedRegistry.payload,
    overridesPayload: overridesRegistry.payload,
    inputPayload,
    inputs,
  });
  const missingReport = buildPrimaryNelkulMaradoNevekRiport({
    finalRegistryPayload: finalRegistry.payload,
    normalizedRegistryPayload: normalizedRegistry.payload,
    inputPayload,
    inputs,
  });
  const primerAuditReport = await buildPrimerAuditReport({
    finalRegistryPayload: finalRegistry.payload,
    legacyRegistryPayload: legacyRegistry.payload,
    wikiRegistryPayload: wikiRegistry.payload,
    normalizedRegistryPayload: normalizedRegistry.payload,
    overridesPayload: overridesRegistry.payload,
    inputPayload,
    localSettings: alapertelmezettHelyiPrimerBeallitasok(),
    localOverridesPayload: uresHelyiPrimerFelulirasPayload(),
    inputs,
  });

  return {
    finalReport,
    missingReport,
    primerAuditReport,
    trackedWikiVsLegacy,
    trackedPrimerNormalizalo,
  };
}

test("a wiki-vs-legacy audit golden baseline-ja stabil marad", async () => {
  const { trackedWikiVsLegacy } = await fixturePromise;
  const summary = trackedWikiVsLegacy.comparison?.summary ?? {};
  const differences = trackedWikiVsLegacy.comparison?.differences ?? {};

  assert.equal(summary.exactPreferredMatchDayCount, 341);
  assert.equal(summary.overlapPreferredMatchDayCount, 23);
  assert.equal(summary.disjointPreferredMatchDayCount, 2);
  assert.equal((differences.nameMismatchDays ?? []).length, 366);
  assert.equal((differences.preferredMismatchDays ?? []).length, 25);
});

test("a primer normalizáló audit golden baseline-ja stabil marad", async () => {
  const { trackedPrimerNormalizalo } = await fixturePromise;
  const normalizerSummary = trackedPrimerNormalizalo.normalizer?.summary ?? {};
  const comparisons = trackedPrimerNormalizalo.comparisons ?? {};

  assert.equal(normalizerSummary.manualConflictReview, 16);
  assert.equal(normalizerSummary.unresolved, 16);
  assert.equal((comparisons.legacy?.differences?.preferredMismatchDays ?? []).length, 272);
  assert.equal((comparisons.wiki?.differences?.preferredMismatchDays ?? []).length, 284);
});

test("a végső primer riport megtartja a rögzített audit-first igazságtáblát", async () => {
  const { finalReport } = await fixturePromise;
  const row0102 = findRow(finalReport.months, "01-02");
  const row1023 = findRow(finalReport.months, "10-23");

  assert.deepEqual(finalReport.validations.mismatchMonthDays, EXPECTED_MISMATCH_DAYS);
  assert.equal(finalReport.validations.overrideDayCount, 25);
  assert.equal(finalReport.validations.hardFailureCount, 0);
  assert.deepEqual(finalReport.validations.hardFailures, []);
  assert.equal(finalReport.validations.sampleChecks.every((entry) => entry.ok), true);
  assert.equal(finalReport.summary.neverPrimaryCount, 3232);
  assert.equal(finalReport.summary.neverPrimaryWithSimilarPrimaryCount, 956);
  assert.equal(finalReport.summary.neverPrimaryWithoutSimilarPrimaryCount, 2276);
  assert.deepEqual(row0102?.preferredNames, ["Ábel"]);
  assert.equal(row0102?.source, "manual-override");
  assert.deepEqual(row1023?.preferredNames, ["Gyöngyvér", "Gyöngyi"]);
});

test("a primer nélkül maradó nevek audit kiemeli a fontos, primerhez kapcsolódó hiányokat", async () => {
  const { missingReport } = await fixturePromise;
  const row0103 = findRow(missingReport.months, "01-03");
  const benjamin = row0103?.combinedMissing?.find((entry) => entry.name === "Benjamin") ?? null;

  assert.equal(missingReport.summary.monthCount, 12);
  assert.equal(missingReport.summary.rowCount, 40);
  assert.equal(missingReport.summary.combinedMissingCount, 42);
  assert.equal(missingReport.summary.normalizedMissingCount, 37);
  assert.equal(missingReport.summary.rankingMissingCount, 40);
  assert.equal(missingReport.summary.combinedHighlightedCount, 12);
  assert.equal(missingReport.summary.uniqueMissingNameCount, 28);
  assert.deepEqual(missingReport.summary.finalPrimaryDayBuckets, {
    zero: 0,
    one: 15,
    two: 24,
    threeOrMore: 1,
  });
  assert.equal(benjamin?.highlight, true);
  assert.deepEqual(benjamin?.sources, ["normalized", "ranking"]);
  assert.equal(benjamin?.similarPrimaries?.[0]?.primaryName, "Benjámin");
});

test("a primer-audit snapshot külön marad a forrásauditoktól, és üres helyi overlaynél nem torzítja a képet", async () => {
  const { finalReport, missingReport, primerAuditReport } = await fixturePromise;
  const row0102 = findRow(primerAuditReport.months, "01-02");
  const row0103 = findRow(primerAuditReport.months, "01-03");

  assert.equal(primerAuditReport.summary.combinedMissingCount, missingReport.summary.combinedMissingCount);
  assert.equal(primerAuditReport.summary.effectiveMissingCount, missingReport.summary.combinedMissingCount);
  assert.equal(primerAuditReport.summary.locallyResolvedMissingCount, 0);
  assert.equal(primerAuditReport.summary.localSelectedCount, 0);
  assert.equal(primerAuditReport.summary.overrideDayCount, finalReport.validations.overrideDayCount);
  assert.equal(primerAuditReport.summary.mismatchDayCount, finalReport.validations.mismatchMonthDays.length);
  assert.deepEqual(row0102?.commonPreferredNames, ["Ábel"]);
  assert.deepEqual(row0102?.effectivePreferredNames, ["Ábel"]);
  assert.deepEqual(row0102?.localAddedPreferredNames, []);
  assert.deepEqual(row0103?.commonPreferredNames, ["Genovéva", "Benjámin"]);
  assert.deepEqual(
    (row0103?.effectiveMissing ?? []).map((entry) => entry.name),
    ["Benjamin"]
  );
  assert.equal(row0103?.sections?.hianyzok?.effectiveMissing?.[0]?.similarPrimaries?.[0]?.primaryName, "Benjámin");
});
