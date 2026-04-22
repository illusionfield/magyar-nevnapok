import path from "node:path";
import {
  betoltHelyiPrimerBeallitasokat,
} from "../../domainek/primer/helyi-primer-felulirasok.mjs";
import {
  betoltHivatalosNevjegyzekKiveteleket,
  betoltIcsBeallitasokat,
  betoltKozosPrimerFelulirasokat,
  betoltPrimerAuditAdata,
  epitIcsPreviewt,
  pipelineAllapot,
} from "../../domainek/szolgaltatasok.mjs";
import {
  ICS_BEALLITAS_DEFINICIOK,
  icsErtekCimke,
  normalizalIcsBeallitasokat,
} from "../../domainek/naptar/ics-beallitasok.mjs";
import { parseMonthDay } from "../../domainek/primer/alap.mjs";
import { letezik } from "../../kozos/fajlrendszer.mjs";
import { betoltStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";
import { pipelineLepesek } from "../../pipeline/lepesek.mjs";
import {
  PRIMER_AUDIT_NAP_SZUROK,
  PRIMER_AUDIT_NEV_SZUROK,
  PRIMER_AUDIT_RENDEZESEK,
  SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK,
  buildPrimerAuditViewModel,
  dayMatchesFilter,
  nameMatchesFilter,
  sajatPrimerForrasCimke,
  sajatPrimerForrasLeiras,
  sortPrimerAuditNevek,
  szemelyesBeallitasCimke,
  szemelyesBeallitasLeiras,
} from "../shared/primer-audit/view-model.mjs";

const monthFormatter = new Intl.DateTimeFormat("hu-HU", {
  month: "long",
});

const AUDIT_META = {
  "hivatalos-nevjegyzek": {
    title: "Hivatalos névjegyzék",
    purpose: "A hivatalos névjegyzék és a jelenlegi adatbázis dokumentált eltéréseit mutatja.",
  },
  "wiki-vs-legacy": {
    title: "Wiki vs legacy",
    purpose: "A wiki és a legacy primer közötti napi név- és primereltérések részletes nézete.",
  },
  "legacy-primer": {
    title: "Legacy primer",
    purpose: "A legacy primerjegyzék és a jelenlegi adatbázis, valamint a rangsorolt primerek összevetése.",
  },
  "primer-normalizalo": {
    title: "Primer normalizáló",
    purpose: "A normalizált primerjelölések eltérései a legacy és a wiki forrásokhoz képest.",
  },
};

const EXTRA_ICS_FIELD_DEFS = {
  "shared.input": {
    kulcs: "shared.input",
    cimke: "Bemeneti adatbázis",
    tipus: "text",
    rovidLeiras: "A generálás ehhez a névadatbázis-fájlhoz igazodik.",
  },
  "shared.baseYear": {
    kulcs: "shared.baseYear",
    cimke: "Bázisév",
    tipus: "number",
    min: 1900,
    max: 2100,
    step: 1,
    rovidLeiras: "A visszatérő események alapéve. A preview és a generálás dátumlogikája ehhez igazodik.",
  },
  "single.output": {
    kulcs: "single.output",
    cimke: "Egyfájlos kimenet",
    tipus: "text",
    rovidLeiras: "Az egyetlen ICS kimeneti útvonala.",
  },
  "single.calendarName": {
    kulcs: "single.calendarName",
    cimke: "Egyfájlos naptárnév",
    tipus: "text",
    rovidLeiras: "Ez lesz a naptár megjelenő neve az importáló alkalmazásokban.",
  },
  "split.primary.output": {
    kulcs: "split.primary.output",
    cimke: "Elsődleges kimenet",
    tipus: "text",
    rovidLeiras: "Az elsődleges neveket tartalmazó ICS kimeneti útvonala.",
  },
  "split.primary.calendarName": {
    kulcs: "split.primary.calendarName",
    cimke: "Elsődleges naptárnév",
    tipus: "text",
    rovidLeiras: "Ez lesz az elsődleges naptár megjelenő neve.",
  },
  "split.rest.output": {
    kulcs: "split.rest.output",
    cimke: "További kimenet",
    tipus: "text",
    rovidLeiras: "A további neveket tartalmazó ICS kimeneti útvonala.",
  },
  "split.rest.calendarName": {
    kulcs: "split.rest.calendarName",
    cimke: "További naptárnév",
    tipus: "text",
    rovidLeiras: "Ez lesz a további nevek naptárának megjelenő neve.",
  },
};

function capitalize(value) {
  const text = String(value ?? "");

  if (!text) {
    return "";
  }

  return text.charAt(0).toLocaleUpperCase("hu") + text.slice(1);
}

function getMonthName(month) {
  if (!Number.isInteger(month)) {
    return "—";
  }

  return capitalize(monthFormatter.format(new Date(Date.UTC(2024, month - 1, 1))));
}

function formatMonthDayLabel(monthDay) {
  const parsed = parseMonthDay(monthDay);

  if (!parsed) {
    return monthDay ?? "—";
  }

  return `${getMonthName(parsed.month)} ${parsed.day}.`;
}

function getNestedValue(object, keyPath) {
  return String(keyPath)
    .split(".")
    .reduce((current, key) => current?.[key], object);
}

function listPreview(values = [], maxItems = 4) {
  const list = (Array.isArray(values) ? values : []).filter(Boolean);

  if (list.length === 0) {
    return "—";
  }

  if (list.length <= maxItems) {
    return list.join(" • ");
  }

  return `${list.slice(0, maxItems).join(" • ")} … (+${list.length - maxItems})`;
}

function summarizePathList(paths = []) {
  const items = (Array.isArray(paths) ? paths : []).map((item) => path.basename(item)).filter(Boolean);

  if (items.length === 0) {
    return "Nincs megadva.";
  }

  if (items.length === 1) {
    return items[0];
  }

  return `${items.length} fájl: ${listPreview(items, 3)}`;
}

function buildPipelineStatusTone(status) {
  if (status === "kesz") {
    return "ok";
  }

  if (status === "hianyzik" || status === "elavult" || status === "fuggoseg-frissitesre-var") {
    return "warning";
  }

  if (status === "blokkolt") {
    return "danger";
  }

  return "neutral";
}

function pipelineStatusLabel(status) {
  const labels = {
    kesz: "Kész",
    hianyzik: "Hiányzik",
    elavult: "Elavult",
    blokkolt: "Blokkolt",
    "fuggoseg-frissitesre-var": "Függőségre vár",
  };

  return labels[status] ?? status ?? "ismeretlen";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

async function loadStructuredIfExists(filePath) {
  if (!(await letezik(filePath))) {
    return null;
  }

  return betoltStrukturaltFajl(filePath);
}

function buildMonthGroups(items = [], getMonthNumber) {
  const groups = new Map();

  for (const item of items) {
    const month = Number(getMonthNumber(item));

    if (!Number.isInteger(month)) {
      continue;
    }

    if (!groups.has(month)) {
      groups.set(month, {
        month,
        monthName: getMonthName(month),
        items: [],
      });
    }

    groups.get(month).items.push(item);
  }

  return Array.from(groups.values()).sort((left, right) => left.month - right.month);
}

function buildGroupSummary(rows = []) {
  return {
    total: rows.length,
    missing: rows.filter((row) => row.flags?.hasMissing).length,
    local: rows.filter((row) => row.flags?.hasLocal).length,
    overrides: rows.filter((row) => row.flags?.isManualOverride).length,
    mismatches: rows.filter((row) => row.flags?.isValidationMismatch).length,
  };
}

function buildSimpleTotalSummary(items = []) {
  return {
    total: items.length,
  };
}

function matchesFreeText(query, values = []) {
  const normalizedQuery = String(query ?? "").trim().toLocaleLowerCase("hu");

  if (!normalizedQuery) {
    return true;
  }

  return values
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("hu")
    .includes(normalizedQuery);
}

function buildPrimerCandidateNames(day) {
  return Array.from(
    new Set(
      [
        ...safeArray(day.rawNames),
        ...safeArray(day.legacy),
        ...safeArray(day.wiki),
        ...safeArray(day.normalized),
        ...safeArray(day.ranking),
        ...safeArray(day.commonPreferredNames),
        ...safeArray(day.effectivePreferredNames),
        ...safeArray(day.localAddedPreferredNames),
      ].filter(Boolean)
    )
  ).sort((left, right) => left.localeCompare(right, "hu", { sensitivity: "base" }));
}

function buildPrimerDayRow(day, trackedMap = new Map()) {
  const candidateNames = buildPrimerCandidateNames(day);

  return {
    month: day.month,
    day: day.day,
    monthDay: day.monthDay,
    dateLabel: formatMonthDayLabel(day.monthDay),
    commonPreferredNames: safeArray(day.commonPreferredNames),
    trackedPreferredNames: safeArray(trackedMap.get(day.monthDay)?.preferredNames),
    effectivePreferredNames: safeArray(day.effectivePreferredNames),
    effectiveMissingNames: safeArray(day.effectiveMissing).map((entry) => entry.name),
    localAddedPreferredNames: safeArray(day.localAddedPreferredNames),
    rawNames: safeArray(day.rawNames),
    hiddenNames: safeArray(day.hidden),
    legacyNames: safeArray(day.legacy),
    wikiNames: safeArray(day.wiki),
    normalizedNames: safeArray(day.normalized),
    rankingNames: safeArray(day.ranking),
    finalSource: day.source,
    warning: day.warning === true,
    flags: day.flags,
    counts: day.counts,
    sourceSummary: {
      legacy: listPreview(day.legacy),
      wiki: listPreview(day.wiki),
      normalized: listPreview(day.normalized),
      ranking: listPreview(day.ranking),
    },
    candidateNames,
  };
}

function primerDayMatchesQuery(row, query) {
  return matchesFreeText(query, [
    row.monthDay,
    row.dateLabel,
    ...(row.candidateNames ?? []),
    ...(row.effectivePreferredNames ?? []),
    ...(row.effectiveMissingNames ?? []),
  ]);
}

function buildMonthResponse(month, rows = []) {
  return {
    month,
    monthName: getMonthName(month),
    summary: buildGroupSummary(rows),
    rows,
  };
}

function buildOfficialAuditStatus(report) {
  const male = report?.genders?.male?.differences ?? {};
  const female = report?.genders?.female?.differences ?? {};
  const unresolvedCount =
    safeArray(male.unapprovedExtraInJson).length +
    safeArray(male.unapprovedMissingFromJson).length +
    safeArray(female.unapprovedExtraInJson).length +
    safeArray(female.unapprovedMissingFromJson).length;

  return unresolvedCount > 0 ? "warning" : "ok";
}

function buildAuditCatalogCardFromOfficial(report) {
  const male = report?.genders?.male?.differences ?? {};
  const female = report?.genders?.female?.differences ?? {};

  return {
    id: "hivatalos-nevjegyzek",
    title: AUDIT_META["hivatalos-nevjegyzek"].title,
    purpose: AUDIT_META["hivatalos-nevjegyzek"].purpose,
    status: buildOfficialAuditStatus(report),
    generatedAt: report?.generatedAt ?? null,
    kpis: [
      {
        label: "Dokumentált eltérések",
        value:
          safeArray(male.documentedExtraInJson).length +
          safeArray(male.documentedMissingFromJson).length +
          safeArray(female.documentedExtraInJson).length +
          safeArray(female.documentedMissingFromJson).length,
      },
      {
        label: "Tisztázandó eltérések",
        value:
          safeArray(male.unapprovedExtraInJson).length +
          safeArray(male.unapprovedMissingFromJson).length +
          safeArray(female.unapprovedExtraInJson).length +
          safeArray(female.unapprovedMissingFromJson).length,
      },
      {
        label: "Összes vizsgált név",
        value: (report?.genders?.male?.json?.count ?? 0) + (report?.genders?.female?.json?.count ?? 0),
      },
    ],
  };
}

function buildAuditCatalogCardFromWiki(report) {
  const summary = report?.comparison?.summary ?? {};
  const issueCount =
    (summary.disjointNameMatchDayCount ?? 0) +
    (summary.disjointPreferredMatchDayCount ?? 0) +
    (summary.overlapPreferredMatchDayCount ?? 0);

  return {
    id: "wiki-vs-legacy",
    title: AUDIT_META["wiki-vs-legacy"].title,
    purpose: AUDIT_META["wiki-vs-legacy"].purpose,
    status: issueCount > 0 ? "warning" : "ok",
    generatedAt: report?.generatedAt ?? null,
    kpis: [
      { label: "Napi néveltérések", value: safeArray(report?.comparison?.differences?.nameMismatchDays).length },
      {
        label: "Primereltérések",
        value: safeArray(report?.comparison?.differences?.preferredMismatchDays).length,
      },
      { label: "Pontos primer egyezések", value: summary.exactPreferredMatchDayCount ?? 0 },
    ],
  };
}

function buildAuditCatalogCardFromLegacy(report) {
  const registrySummary = report?.registryComparison?.summary ?? {};
  const primarySummary = report?.primaryComparison?.summary ?? {};
  const issueCount = (registrySummary.partialCount ?? 0) + (primarySummary.disjointDayCount ?? 0);

  return {
    id: "legacy-primer",
    title: AUDIT_META["legacy-primer"].title,
    purpose: AUDIT_META["legacy-primer"].purpose,
    status: issueCount > 0 ? "warning" : "ok",
    generatedAt: report?.generatedAt ?? null,
    kpis: [
      { label: "Registry részleges napok", value: registrySummary.partialCount ?? 0 },
      { label: "Registry hiányzó nevek", value: registrySummary.registryMissingNameCount ?? 0 },
      { label: "Primer mismatch napok", value: safeArray(report?.primaryComparison?.differences?.mismatchDays).length },
    ],
  };
}

function buildAuditCatalogCardFromNormalizer(report) {
  const summary = report?.normalizer?.summary ?? {};
  const issueCount =
    safeArray(report?.comparisons?.legacy?.differences?.preferredMismatchDays).length +
    safeArray(report?.comparisons?.wiki?.differences?.preferredMismatchDays).length;

  return {
    id: "primer-normalizalo",
    title: AUDIT_META["primer-normalizalo"].title,
    purpose: AUDIT_META["primer-normalizalo"].purpose,
    status: issueCount > 0 ? "warning" : "ok",
    generatedAt: report?.generatedAt ?? null,
    kpis: [
      { label: "Kézi felülvizsgálat", value: summary.manualConflictReview ?? 0 },
      { label: "Feloldatlan napok", value: summary.unresolved ?? 0 },
      { label: "Legacy primer mismatch", value: safeArray(report?.comparisons?.legacy?.differences?.preferredMismatchDays).length },
    ],
  };
}

function mergeDayDiffMap(baseRows = [], key) {
  const map = new Map();

  for (const row of baseRows) {
    if (!row?.monthDay) {
      continue;
    }

    if (!map.has(row.monthDay)) {
      map.set(row.monthDay, {
        monthDay: row.monthDay,
        month: parseMonthDay(row.monthDay)?.month ?? null,
        dateLabel: formatMonthDayLabel(row.monthDay),
      });
    }

    map.get(row.monthDay)[key] = row;
  }

  return map;
}

function buildWikiRows(report) {
  const nameDiffMap = mergeDayDiffMap(report?.comparison?.differences?.nameMismatchDays, "nameDiff");
  const preferredDiffMap = mergeDayDiffMap(
    report?.comparison?.differences?.preferredMismatchDays,
    "preferredDiff"
  );
  const combined = new Map();

  for (const map of [nameDiffMap, preferredDiffMap]) {
    for (const [monthDay, value] of map.entries()) {
      combined.set(monthDay, {
        ...(combined.get(monthDay) ?? {}),
        ...value,
      });
    }
  }

  return Array.from(combined.values())
    .map((row) => ({
      ...row,
      mismatchCount: (row.nameDiff?.mismatchCount ?? 0) + (row.preferredDiff?.mismatchCount ?? 0),
      hasNameMismatch: Boolean(row.nameDiff),
      hasPreferredMismatch: Boolean(row.preferredDiff),
    }))
    .sort((left, right) => left.monthDay.localeCompare(right.monthDay, "hu", { numeric: true }));
}

function filterWikiRows(rows = [], query = "") {
  return rows.filter((row) =>
    matchesFreeText(query, [
      row.monthDay,
      row.dateLabel,
      ...(row.nameDiff?.onlyLegacy ?? []),
      ...(row.nameDiff?.onlyWiki ?? []),
      ...(row.preferredDiff?.onlyLegacy ?? []),
      ...(row.preferredDiff?.onlyWiki ?? []),
    ])
  );
}

function buildWikiDetail(report) {
  const rows = buildWikiRows(report);

  return {
    id: "wiki-vs-legacy",
    title: AUDIT_META["wiki-vs-legacy"].title,
    kind: "wiki-vs-legacy",
    purpose: AUDIT_META["wiki-vs-legacy"].purpose,
    generatedAt: report?.generatedAt ?? null,
    summary: report?.comparison?.summary ?? {},
    groups: buildMonthGroups(rows, (row) => row.month),
  };
}

function buildLegacyRows(report) {
  const registryRows = mergeDayDiffMap(report?.registryComparison?.differences?.partialDays, "registryDiff");
  const primaryRows = mergeDayDiffMap(report?.primaryComparison?.differences?.mismatchDays, "primaryDiff");
  const combined = new Map();

  for (const map of [registryRows, primaryRows]) {
    for (const [monthDay, value] of map.entries()) {
      combined.set(monthDay, {
        ...(combined.get(monthDay) ?? {}),
        ...value,
      });
    }
  }

  return Array.from(combined.values())
    .map((row) => ({
      ...row,
      mismatchCount: (row.registryDiff?.missing?.length ?? 0) + (row.primaryDiff?.mismatchCount ?? 0),
      hasRegistryDiff: Boolean(row.registryDiff),
      hasPrimaryDiff: Boolean(row.primaryDiff),
    }))
    .sort((left, right) => left.monthDay.localeCompare(right.monthDay, "hu", { numeric: true }));
}

function filterLegacyRows(rows = [], query = "") {
  return rows.filter((row) =>
    matchesFreeText(query, [
      row.monthDay,
      row.dateLabel,
      ...(row.registryDiff?.missing ?? []),
      ...(row.registryDiff?.hits ?? []),
      ...(row.primaryDiff?.onlyLegacyPrimary ?? []),
      ...(row.primaryDiff?.onlyRankedPrimary ?? []),
    ])
  );
}

function buildLegacyDetail(report) {
  const rows = buildLegacyRows(report);

  return {
    id: "legacy-primer",
    title: AUDIT_META["legacy-primer"].title,
    kind: "legacy-primer",
    purpose: AUDIT_META["legacy-primer"].purpose,
    generatedAt: report?.generatedAt ?? null,
    registrySummary: report?.registryComparison?.summary ?? {},
    primarySummary: report?.primaryComparison?.summary ?? {},
    groups: buildMonthGroups(rows, (row) => row.month),
  };
}

function buildComparisonRows(comparison = {}) {
  const nameRows = mergeDayDiffMap(comparison?.differences?.nameMismatchDays, "nameDiff");
  const preferredRows = mergeDayDiffMap(comparison?.differences?.preferredMismatchDays, "preferredDiff");
  const combined = new Map();

  for (const map of [nameRows, preferredRows]) {
    for (const [monthDay, value] of map.entries()) {
      combined.set(monthDay, {
        ...(combined.get(monthDay) ?? {}),
        ...value,
      });
    }
  }

  return Array.from(combined.values())
    .map((row) => ({
      ...row,
      mismatchCount: (row.nameDiff?.mismatchCount ?? 0) + (row.preferredDiff?.mismatchCount ?? 0),
    }))
    .sort((left, right) => left.monthDay.localeCompare(right.monthDay, "hu", { numeric: true }));
}

function filterComparisonRows(rows = [], query = "") {
  return rows.filter((row) =>
    matchesFreeText(query, [
      row.monthDay,
      row.dateLabel,
      ...(row.nameDiff?.onlyLeft ?? []),
      ...(row.nameDiff?.onlyRight ?? []),
      ...(row.preferredDiff?.onlyLeft ?? []),
      ...(row.preferredDiff?.onlyRight ?? []),
    ])
  );
}

function buildNormalizerDetail(report) {
  return {
    id: "primer-normalizalo",
    title: AUDIT_META["primer-normalizalo"].title,
    kind: "primer-normalizalo",
    purpose: AUDIT_META["primer-normalizalo"].purpose,
    generatedAt: report?.generatedAt ?? null,
    normalizer: report?.normalizer ?? {},
    comparisons: ["legacy", "wiki"].map((key) => ({
      id: key,
      title: key === "legacy" ? "Normalizált vs legacy" : "Normalizált vs wiki",
      labels: report?.comparisons?.[key]?.labels ?? {},
      summary: report?.comparisons?.[key]?.summary ?? {},
      groups: buildMonthGroups(buildComparisonRows(report?.comparisons?.[key]), (row) => row.month),
    })),
  };
}

function buildOfficialDetail(report, exceptionsPayload) {
  const genderOrder = [
    { id: "male", label: "Férfi nevek" },
    { id: "female", label: "Női nevek" },
  ];

  return {
    id: "hivatalos-nevjegyzek",
    title: AUDIT_META["hivatalos-nevjegyzek"].title,
    kind: "official",
    purpose: AUDIT_META["hivatalos-nevjegyzek"].purpose,
    generatedAt: report?.generatedAt ?? null,
    notes: exceptionsPayload?.megjegyzes ?? "",
    sources: exceptionsPayload?.forrasok ?? {},
    genders: genderOrder.map((gender) => {
      const summary = report?.genders?.[gender.id] ?? {};
      const differences = summary?.differences ?? {};
      const exceptionGroup = exceptionsPayload?.genders?.[gender.id] ?? {};

      return {
        id: gender.id,
        label: gender.label,
        officialCount: summary?.official?.count ?? 0,
        jsonCount: summary?.json?.count ?? 0,
        documentedExtraCount: safeArray(differences.documentedExtraInJson).length,
        documentedMissingCount: safeArray(differences.documentedMissingFromJson).length,
        unresolvedExtraCount: safeArray(differences.unapprovedExtraInJson).length,
        unresolvedMissingCount: safeArray(differences.unapprovedMissingFromJson).length,
        lists: [
          {
            id: `${gender.id}.extraInJson`,
            title: `${gender.label} – többlet az adatbázisban`,
            rows: safeArray(exceptionGroup.extraInJson),
          },
          {
            id: `${gender.id}.missingFromJson`,
            title: `${gender.label} – hiányzik az adatbázisból`,
            rows: safeArray(exceptionGroup.missingFromJson),
          },
        ],
      };
    }),
  };
}

function buildMonthSummariesFromGroups(groups = []) {
  return groups.map((group) => ({
    month: group.month,
    monthName: group.monthName,
    summary: buildSimpleTotalSummary(group.items ?? group.rows ?? []),
  }));
}

export async function buildAuditDetailSummaryModel(auditId) {
  if (auditId === "hivatalos-nevjegyzek") {
    const [report, exceptions] = await Promise.all([
      loadStructuredIfExists(kanonikusUtvonalak.riportok.hivatalosNevjegyzek),
      betoltHivatalosNevjegyzekKiveteleket(),
    ]);

    return buildOfficialDetail(report, exceptions.payload);
  }

  if (auditId === "wiki-vs-legacy") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.wikiVsLegacy);
    const rows = buildWikiRows(report);

    return {
      id: "wiki-vs-legacy",
      title: AUDIT_META["wiki-vs-legacy"].title,
      kind: "wiki-vs-legacy",
      purpose: AUDIT_META["wiki-vs-legacy"].purpose,
      generatedAt: report?.generatedAt ?? null,
      summary: report?.comparison?.summary ?? {},
      monthSummaries: buildMonthSummariesFromGroups(buildMonthGroups(rows, (row) => row.month)),
    };
  }

  if (auditId === "legacy-primer") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.legacyPrimer);
    const rows = buildLegacyRows(report);

    return {
      id: "legacy-primer",
      title: AUDIT_META["legacy-primer"].title,
      kind: "legacy-primer",
      purpose: AUDIT_META["legacy-primer"].purpose,
      generatedAt: report?.generatedAt ?? null,
      registrySummary: report?.registryComparison?.summary ?? {},
      primarySummary: report?.primaryComparison?.summary ?? {},
      monthSummaries: buildMonthSummariesFromGroups(buildMonthGroups(rows, (row) => row.month)),
    };
  }

  if (auditId === "primer-normalizalo") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNormalizalo);
    const comparisonSummaries = ["legacy", "wiki"].map((key) => {
      const rows = buildComparisonRows(report?.comparisons?.[key]);

      return {
        id: key,
        title: key === "legacy" ? "Normalizált vs legacy" : "Normalizált vs wiki",
        labels: report?.comparisons?.[key]?.labels ?? {},
        summary: report?.comparisons?.[key]?.summary ?? {},
        monthSummaries: buildMonthSummariesFromGroups(buildMonthGroups(rows, (row) => row.month)),
      };
    });
    const monthSummaryMap = new Map();

    for (const comparison of comparisonSummaries) {
      for (const monthSummary of comparison.monthSummaries) {
        if (!monthSummaryMap.has(monthSummary.month)) {
          monthSummaryMap.set(monthSummary.month, {
            month: monthSummary.month,
            monthName: monthSummary.monthName,
            summary: {
              total: 0,
            },
          });
        }

        monthSummaryMap.get(monthSummary.month).summary.total += monthSummary.summary.total ?? 0;
      }
    }

    return {
      id: "primer-normalizalo",
      title: AUDIT_META["primer-normalizalo"].title,
      kind: "primer-normalizalo",
      purpose: AUDIT_META["primer-normalizalo"].purpose,
      generatedAt: report?.generatedAt ?? null,
      normalizer: report?.normalizer ?? {},
      comparisons: comparisonSummaries,
      monthSummaries: Array.from(monthSummaryMap.values()).sort((left, right) => left.month - right.month),
    };
  }

  throw new Error(`Ismeretlen audit részletnézet: ${auditId}`);
}

export async function buildAuditDetailMonthModel(auditId, month, options = {}) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Érvénytelen audit hónap: ${month}`);
  }

  const query = String(options.query ?? "").trim();

  if (auditId === "wiki-vs-legacy") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.wikiVsLegacy);
    const rows = filterWikiRows(buildWikiRows(report), query).filter((row) => row.month === month);

    return {
      auditId,
      month: buildMonthResponse(month, rows),
    };
  }

  if (auditId === "legacy-primer") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.legacyPrimer);
    const rows = filterLegacyRows(buildLegacyRows(report), query).filter((row) => row.month === month);

    return {
      auditId,
      month: buildMonthResponse(month, rows),
    };
  }

  if (auditId === "primer-normalizalo") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNormalizalo);

    return {
      auditId,
      month,
      monthName: getMonthName(month),
      comparisons: ["legacy", "wiki"].map((key) => {
        const rows = filterComparisonRows(buildComparisonRows(report?.comparisons?.[key]), query).filter(
          (row) => row.month === month
        );

        return {
          id: key,
          title: key === "legacy" ? "Normalizált vs legacy" : "Normalizált vs wiki",
          summary: buildSimpleTotalSummary(rows),
          rows,
        };
      }),
    };
  }

  throw new Error(`Az audit nem támogat havi részletlekérést: ${auditId}`);
}

export async function buildPrimerAuditSummaryModel() {
  const report = await betoltPrimerAuditAdata({
    frissitRiport: false,
  });
  const fallbackSettings = (await betoltHelyiPrimerBeallitasokat()).settings;
  const settings = report.personal?.settingsSnapshot ?? fallbackSettings;
  const viewModel = buildPrimerAuditViewModel(report, {
    includeNames: false,
  });
  const todoRows = viewModel.days
    .filter((day) => day.flags?.hasMissing || day.flags?.hasLocal || day.flags?.isManualOverride)
    .slice(0, 8)
    .map((day) => ({
      id: day.monthDay,
      title: formatMonthDayLabel(day.monthDay),
      detail: `${safeArray(day.effectiveMissing).length} nyitott hiány • ${safeArray(day.localAddedPreferredNames).length} helyi hozzáadás`,
    }));

  return {
    generatedAt: report.generatedAt,
    summary: viewModel.summary,
    validations: report.validations,
    filters: {
      days: PRIMER_AUDIT_NAP_SZUROK,
      names: PRIMER_AUDIT_NEV_SZUROK,
      sorts: PRIMER_AUDIT_RENDEZESEK,
    },
    overviewQueues: viewModel.queues,
    settings,
    settingsFields: buildPrimerSettingsFields(settings),
    months: viewModel.monthSummary.map((month) => ({
      month: month.month,
      monthName: month.monthName,
      summary: month,
    })),
    todos: todoRows,
  };
}

export async function buildPrimerAuditMonthModel(month, options = {}) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`Érvénytelen primer audit hónap: ${month}`);
  }

  const report = await betoltPrimerAuditAdata({
    frissitRiport: false,
  });
  const trackedOverrides = await betoltKozosPrimerFelulirasokat();
  const trackedMap = new Map(safeArray(trackedOverrides.payload?.days).map((entry) => [entry.monthDay, entry]));
  const viewModel = buildPrimerAuditViewModel(report, {
    includeNames: false,
  });
  const filterId = String(options.filterId ?? "akciozhato");
  const query = String(options.query ?? "").trim();
  const rows = viewModel.days
    .filter((day) => day.month === month)
    .map((day) => buildPrimerDayRow(day, trackedMap))
    .filter((row) => dayMatchesFilter(row, filterId) && primerDayMatchesQuery(row, query));

  return buildMonthResponse(month, rows);
}

export async function buildPrimerAuditNamesModel(options = {}) {
  const report = await betoltPrimerAuditAdata({
    frissitRiport: false,
  });
  const filterId = String(options.filterId ?? "osszes");
  const query = String(options.query ?? "").trim().toLocaleLowerCase("hu");
  const sortId = String(options.sortId ?? "relevancia");
  const page = Math.max(1, Number(options.page ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(10, Number(options.pageSize ?? 100) || 100));
  const viewModel = buildPrimerAuditViewModel(report, {
    includeNames: true,
  });
  const filtered = sortPrimerAuditNevek(
    safeArray(viewModel.names).filter((entry) => {
      if (!nameMatchesFilter(entry, filterId)) {
        return false;
      }

      if (!query) {
        return true;
      }

      return (
        entry.name.toLocaleLowerCase("hu").includes(query) ||
        safeArray(entry.occurrences).some((occurrence) =>
          String(occurrence.monthDay ?? "").toLocaleLowerCase("hu").includes(query)
        )
      );
    }),
    sortId
  );
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map((entry) => ({
    ...entry,
    occurrences: safeArray(entry.occurrences).slice(0, 20).map((occurrence) => ({
      ...occurrence,
      dateLabel: formatMonthDayLabel(occurrence.monthDay),
    })),
  }));

  return {
    items,
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
  };
}

function getIcsFieldDefinition(key) {
  return ICS_BEALLITAS_DEFINICIOK.find((entry) => entry.kulcs === key) ?? EXTRA_ICS_FIELD_DEFS[key] ?? null;
}

function buildIcsField(settings, key) {
  const definition = getIcsFieldDefinition(key);
  const value = getNestedValue(settings, key);
  const type = definition?.tipus ?? "text";
  const options = safeArray(definition?.ertekek).map((option) => ({
    value: option,
    label: icsErtekCimke(key, option),
    description: definition?.ertekLeirasok?.[option] ?? "",
  }));
  const currentSummary =
    type === "enum"
      ? icsErtekCimke(key, value)
      : typeof value === "boolean"
        ? value
          ? "bekapcsolva"
          : "kikapcsolva"
        : String(value ?? "—");

  return {
    key,
    label: definition?.cimke ?? key,
    type,
    value,
    min: definition?.min ?? null,
    max: definition?.max ?? null,
    step: definition?.step ?? null,
    description: definition?.rovidLeiras ?? "",
    currentSummary,
    options,
  };
}

function buildIcsEditorSections(settings) {
  const sections = [
    {
      id: "partition",
      title: "Alapmód",
      fields: ["partitionMode"],
    },
    {
      id: "shared",
      title: "Megosztott alapbeállítások",
      fields: ["shared.input", "shared.leapProfile", "shared.fromYear", "shared.untilYear", "shared.baseYear"],
    },
    {
      id: "single",
      title: "Egy naptár",
      visible: settings.partitionMode === "single",
      fields: [
        "single.output",
        "single.calendarName",
        "single.layout",
        "single.descriptionMode",
        "single.descriptionFormat",
        "single.ordinalDay",
        "single.includeOtherDays",
      ],
    },
    {
      id: "split-primary",
      title: "Elsődleges naptár",
      visible: settings.partitionMode === "split",
      fields: [
        "split.primary.output",
        "split.primary.calendarName",
        "split.primary.layout",
        "split.primary.descriptionMode",
        "split.primary.descriptionFormat",
        "split.primary.ordinalDay",
        "split.primary.includeOtherDays",
      ],
    },
    {
      id: "split-rest",
      title: "További naptár",
      visible: settings.partitionMode === "split",
      fields: [
        "split.rest.output",
        "split.rest.calendarName",
        "split.rest.layout",
        "split.rest.descriptionMode",
        "split.rest.descriptionFormat",
        "split.rest.ordinalDay",
        "split.rest.includeOtherDays",
      ],
    },
  ];

  return sections.map((section) => ({
    id: section.id,
    title: section.title,
    visible: section.visible !== false,
    fields: section.fields.map((key) => buildIcsField(settings, key)),
  }));
}

function buildIcsStatusSummary(settings) {
  if (settings.partitionMode === "split") {
    return {
      modeLabel: "Külön elsődleges és külön további naptár",
      outputs: [settings.split.primary.output, settings.split.rest.output].map((item) => path.basename(item)),
      names: [settings.split.primary.calendarName, settings.split.rest.calendarName],
    };
  }

  return {
    modeLabel: "Egy közös naptár",
    outputs: [path.basename(settings.single.output)],
    names: [settings.single.calendarName],
  };
}

function buildIcsPreviewPanel(result, fallbackId) {
  const events = safeArray(result?.events).map((event) => ({
    summary: event.summary,
    startDate: event.startDate,
    dateLabel: formatMonthDayLabel(String(event.startDate ?? "").slice(4, 8).replace(/(\d{2})(\d{2})/u, "$1-$2")),
    descriptionPlain: event?.description?.plain ?? "",
  }));
  const groupedEvents = buildMonthGroups(
    events.map((event) => ({
      ...event,
      month: Number(String(event.startDate ?? "").slice(4, 6)),
    })),
    (event) => event.month
  ).map((group) => ({
    ...group,
    summary: {
      total: group.items.length,
    },
  }));
  const fileName = path.basename(result?.outputPath ?? fallbackId);
  const panelId = fileName.includes("primary")
    ? "primary"
    : fileName.includes("rest")
      ? "rest"
      : fallbackId;
  const label =
    panelId === "primary"
      ? "Elsődleges"
      : panelId === "rest"
        ? "További"
        : "Egy naptár";

  return {
    id: panelId,
    label,
    outputPath: result?.outputPath ?? null,
    fileName,
    eventCount: result?.eventCount ?? 0,
    groupedEvents,
    rawText: result?.calendarText ?? "",
  };
}

export async function buildIcsEditorModel() {
  const loaded = await betoltIcsBeallitasokat();
  const settings = normalizalIcsBeallitasokat(loaded.settings);

  return {
    savedSettings: settings,
    status: buildIcsStatusSummary(settings),
    sections: buildIcsEditorSections(settings),
  };
}

export async function buildIcsPreviewModel(draft = {}) {
  const preview = await epitIcsPreviewt(draft);
  const settings = normalizalIcsBeallitasokat(preview.settings);
  const panels = safeArray(preview.results).map((result, index) =>
    buildIcsPreviewPanel(result, index === 0 ? "single" : `panel-${index + 1}`)
  );

  return {
    settings,
    mode: preview.outputProfil?.partitionMode ?? settings.partitionMode,
    panels,
  };
}

export async function buildPipelineModel() {
  const [stateRows] = await Promise.all([pipelineAllapot()]);
  const stateMap = new Map(stateRows.map((row) => [row.azonosito, row]));
  const steps = pipelineLepesek.map((step) => {
    const current = stateMap.get(step.azonosito) ?? {};
    const dependsOnTitles = safeArray(step.dependsOn)
      .map((dependencyId) => pipelineLepesek.find((entry) => entry.azonosito === dependencyId)?.leiras)
      .filter(Boolean);
    const warning =
      current.status === "blokkolt"
        ? "A lépés valamelyik bemenete még hiányzik, vagy előfeltétel nélkül nem futtatható."
        : current.status === "elavult"
          ? "Legalább egy bemenet frissebb a jelenlegi kimenetnél."
          : current.status === "fuggoseg-frissitesre-var"
            ? "A függőségek között van olyan lépés, amelyet előbb frissíteni kell."
            : null;

    return {
      id: step.azonosito,
      title: capitalize(step.leiras.replace(/\.$/u, "")),
      description: step.leiras,
      dependsOn: dependsOnTitles,
      inputsSummary: summarizePathList(current.bemenetek ?? step.bemenetek),
      outputsSummary: summarizePathList(current.kimenetek ?? step.kimenetek),
      status: current.status ?? "ismeretlen",
      statusLabel: pipelineStatusLabel(current.status),
      tone: buildPipelineStatusTone(current.status),
      lastRun: current.utolsoFutas ?? null,
      lastStatus: current.utolsoStatus ?? null,
      warning,
      actions: [
        { id: "run", label: "Lépés futtatása", target: step.azonosito, force: false },
        { id: "rerun", label: "Lépés újrafuttatása", target: step.azonosito, force: true },
      ],
    };
  });
  const counts = steps.reduce(
    (acc, step) => {
      acc.total += 1;
      acc[step.status] = (acc[step.status] ?? 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  return {
    steps,
    summary: {
      total: counts.total,
      kesz: counts.kesz ?? 0,
      hianyzik: counts.hianyzik ?? 0,
      elavult: counts.elavult ?? 0,
      blokkolt: counts.blokkolt ?? 0,
      fuggosegFrissitesreVar: counts["fuggoseg-frissitesre-var"] ?? 0,
    },
    actions: [
      { id: "run-all", label: "Teljes pipeline futtatása", target: "teljes", force: false },
      { id: "rerun-all", label: "Teljes pipeline újrafuttatása", target: "teljes", force: true },
    ],
  };
}

export async function buildAuditCatalogModel() {
  const [officialReport, wikiReport, legacyReport, normalizerReport] = await Promise.all([
    loadStructuredIfExists(kanonikusUtvonalak.riportok.hivatalosNevjegyzek),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.wikiVsLegacy),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.legacyPrimer),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNormalizalo),
  ]);

  return {
    audits: [
      buildAuditCatalogCardFromOfficial(officialReport),
      buildAuditCatalogCardFromWiki(wikiReport),
      buildAuditCatalogCardFromLegacy(legacyReport),
      buildAuditCatalogCardFromNormalizer(normalizerReport),
    ],
  };
}

export async function buildAuditDetailModel(auditId) {
  if (auditId === "hivatalos-nevjegyzek") {
    const [report, exceptions] = await Promise.all([
      loadStructuredIfExists(kanonikusUtvonalak.riportok.hivatalosNevjegyzek),
      betoltHivatalosNevjegyzekKiveteleket(),
    ]);

    return buildOfficialDetail(report, exceptions.payload);
  }

  if (auditId === "wiki-vs-legacy") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.wikiVsLegacy);
    return buildWikiDetail(report);
  }

  if (auditId === "legacy-primer") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.legacyPrimer);
    return buildLegacyDetail(report);
  }

  if (auditId === "primer-normalizalo") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNormalizalo);
    return buildNormalizerDetail(report);
  }

  throw new Error(`Ismeretlen audit részletnézet: ${auditId}`);
}

function buildPrimerSettingsFields(settings) {
  return SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK.map((definition) => ({
    key: definition.kulcs,
    label: definition.cimke,
    type: definition.tipus,
    value: getNestedValue(settings, definition.kulcs),
    summary: szemelyesBeallitasCimke(definition, settings),
    description: szemelyesBeallitasLeiras(definition, settings),
    options:
      definition.kulcs === "primarySource"
        ? safeArray(definition.ertekek).map((value) => ({
            value,
            label: sajatPrimerForrasCimke(value),
            description: sajatPrimerForrasLeiras(value),
          }))
        : [],
  }));
}

export async function buildPrimerAuditWorkspaceModel() {
  const report = await betoltPrimerAuditAdata({
    frissitRiport: false,
  });
  const trackedOverrides = await betoltKozosPrimerFelulirasokat();
  const viewModel = buildPrimerAuditViewModel(report);
  const trackedMap = new Map(safeArray(trackedOverrides.payload?.days).map((entry) => [entry.monthDay, entry]));
  const months = safeArray(report.months).map((month) => {
    const enrichedRows = safeArray(month.rows).map((row) => {
      const viewDay = viewModel.dayMap.get(row.monthDay) ?? row;
      const candidateNames = Array.from(
        new Set(
          [
            ...safeArray(row.rawNames),
            ...safeArray(row.legacy),
            ...safeArray(row.wiki),
            ...safeArray(row.normalized),
            ...safeArray(row.ranking),
            ...safeArray(viewDay.commonPreferredNames),
            ...safeArray(viewDay.effectivePreferredNames),
            ...safeArray(viewDay.localAddedPreferredNames),
          ].filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right, "hu", { sensitivity: "base" }));

      return {
        month: row.month,
        day: row.day,
        monthDay: row.monthDay,
        dateLabel: formatMonthDayLabel(row.monthDay),
        commonPreferredNames: safeArray(viewDay.commonPreferredNames),
        trackedPreferredNames: safeArray(trackedMap.get(row.monthDay)?.preferredNames),
        effectivePreferredNames: safeArray(viewDay.effectivePreferredNames),
        effectiveMissingNames: safeArray(viewDay.effectiveMissing).map((entry) => entry.name),
        localAddedPreferredNames: safeArray(viewDay.localAddedPreferredNames),
        rawNames: safeArray(row.rawNames),
        hiddenNames: safeArray(row.hidden),
        legacyNames: safeArray(row.legacy),
        wikiNames: safeArray(row.wiki),
        normalizedNames: safeArray(row.normalized),
        rankingNames: safeArray(row.ranking),
        finalSource: row.source,
        warning: row.warning === true,
        flags: viewDay.flags,
        counts: viewDay.counts,
        sourceSummary: {
          legacy: listPreview(row.legacy),
          wiki: listPreview(row.wiki),
          normalized: listPreview(row.normalized),
          ranking: listPreview(row.ranking),
        },
        candidateNames,
      };
    });

    return {
      month: month.month,
      monthName: month.monthName,
      summary: buildGroupSummary(enrichedRows),
      rows: enrichedRows,
    };
  });

  return {
    generatedAt: report.generatedAt,
    summary: report.summary,
    validations: report.validations,
    filters: {
      days: PRIMER_AUDIT_NAP_SZUROK,
      names: PRIMER_AUDIT_NEV_SZUROK,
      sorts: PRIMER_AUDIT_RENDEZESEK,
    },
    overviewQueues: viewModel.queues,
    settings: report.personal?.settingsSnapshot ?? (await betoltHelyiPrimerBeallitasokat()).settings,
    settingsFields: buildPrimerSettingsFields(
      report.personal?.settingsSnapshot ?? (await betoltHelyiPrimerBeallitasokat()).settings
    ),
    months,
    names: viewModel.names.map((entry) => ({
      name: entry.name,
      counts: entry.counts,
      occurrenceCount: entry.occurrenceCount,
      firstMonthDay: entry.firstMonthDay,
      occurrences: safeArray(entry.occurrences).map((occurrence) => ({
        ...occurrence,
        dateLabel: formatMonthDayLabel(occurrence.monthDay),
      })),
    })),
  };
}

export async function buildDashboardModel(jobState = null) {
  const [pipeline, audits, primerSummary, icsEditor] = await Promise.all([
    buildPipelineModel(),
    buildAuditCatalogModel(),
    buildPrimerAuditSummaryModel(),
    buildIcsEditorModel(),
  ]);
  const todoRows = pipeline.steps
    .filter((step) => step.status !== "kesz")
    .slice(0, 6)
    .map((step) => ({
      id: step.id,
      kind: "pipeline",
      title: step.title,
      detail: `${step.statusLabel} • ${step.inputsSummary}`,
    }));
  const auditWarningCount = audits.audits.filter((audit) => audit.status !== "ok").length;

  return {
    generatedAt: new Date().toISOString(),
    connection: {
      connected: true,
    },
    jobState,
    pipelineKpi: pipeline.summary,
    auditKpi: {
      figyelmeztetesesAuditok: auditWarningCount,
      primerNyitottHianyok: primerSummary.summary.effectiveMissingCount ?? 0,
      keziOverrideNapok: primerSummary.summary.overrideDayCount ?? 0,
      helyiFeloldasok: primerSummary.summary.locallyResolvedMissingCount ?? 0,
    },
    icsStatus: {
      modeLabel: icsEditor.status.modeLabel,
      outputs: icsEditor.status.outputs,
      names: icsEditor.status.names,
    },
    todos: [...todoRows, ...(primerSummary.todos ?? []).map((item) => ({ ...item, kind: "primer" }))].slice(0, 10),
    highlights: {
      pipeline: pipeline.steps.filter((step) => step.status !== "kesz").slice(0, 4),
      audits: audits.audits,
      primer: primerSummary.overviewQueues,
    },
  };
}
