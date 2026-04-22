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
  listazAktivIcsKimeneteket,
  normalizalIcsBeallitasokat,
} from "../../domainek/naptar/ics-beallitasok.mjs";
import { buildIcsPreviewNameDetailPayload } from "../../domainek/naptar/ics-generalas.mjs";
import { parseMonthDay } from "../../domainek/primer/alap.mjs";
import { letezik } from "../../kozos/fajlrendszer.mjs";
import {
  createGridSection,
  createKeyValueSection,
  createListSection,
  createTableSection,
  createTextSection,
} from "../../kozos/riport-szekciok.mjs";
import { betoltStrukturaltFajl } from "../../kozos/strukturalt-fajl.mjs";
import { formatNameList } from "../../kozos/terminal-tabla.mjs";
import { kanonikusUtvonalak } from "../../kozos/utvonalak.mjs";
import { pipelineCsoportok, pipelineLepesek } from "../../pipeline/lepesek.mjs";
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

const timestampFormatter = new Intl.DateTimeFormat("hu-HU", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Budapest",
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
  "vegso-primer": {
    title: "Végső primer állapot",
    purpose: "A végső primerdöntések validációja, mintanapjai és rejtett névkapcsolatai.",
  },
  "primer-nelkul-marado-nevek": {
    title: "Primer nélkül maradó nevek",
    purpose: "Azok a nevek, amelyek normalizált vagy rangsorolt nézetben látszanak, de a végső primerből kimaradnak.",
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
  const items = (Array.isArray(paths) ? paths : []).map((item) => compactPathLabel(item)).filter(Boolean);

  if (items.length === 0) {
    return "Nincs megadva.";
  }

  if (items.length === 1) {
    return items[0];
  }

  return `${items.length} fájl: ${listPreview(items, 3)}`;
}

function formatTimestampLabel(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return timestampFormatter.format(date);
}

function compactPathLabel(filePath) {
  const value = String(filePath ?? "").trim();

  if (!value) {
    return "—";
  }

  const relative = path.isAbsolute(value) ? path.relative(process.cwd(), value) : value;
  const normalized =
    relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : path.basename(value);
  const segments = normalized.split(path.sep).filter(Boolean);

  if (segments.length <= 3) {
    return normalized;
  }

  return `${segments[0]}/${segments[1]}/…/${segments[segments.length - 1]}`;
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

function createMetric(label, value, tone = "neutral") {
  return {
    label,
    value,
    tone,
  };
}

function renderNames(values = [], maxItems = 4, maxLength = 36) {
  return formatNameList(values, {
    maxItems,
    maxLength,
  });
}

function buildPipelineStatusAdminLabel(status) {
  const labels = {
    kesz: "Friss",
    hianyzik: "Hiányzik",
    elavult: "Frissítés kell",
    blokkolt: "Előfeltétel hiányzik",
    "fuggoseg-frissitesre-var": "Előző lépésre vár",
  };

  return labels[status] ?? "Ismeretlen";
}

function buildPipelineStatusSummaryText(status) {
  const texts = {
    kesz: "A kimenet kész.",
    hianyzik: "A kimenet még hiányzik.",
    elavult: "Van frissebb bemenet.",
    blokkolt: "Hiányzik egy előfeltétel.",
    "fuggoseg-frissitesre-var": "Egy korábbi lépés frissítésére vár.",
  };

  return texts[status] ?? "A lépés állapota nem egyértelmű.";
}

function buildCrawlerSanityLabel(state) {
  if (state === "ok") {
    return "rendben";
  }

  if (state === "missing") {
    return "hiányzik";
  }

  if (state === "anomaly") {
    return "anomália";
  }

  return "ismeretlen";
}

function buildPipelineStepSummaryText(row) {
  if (row?.safeMode === "crawler") {
    if (row?.safety?.sanityState === "ok") {
      return "A meglévő kimenet sanity alapján rendben van, ezért a lépés kihagyható.";
    }

    if (row?.safety?.sanityState === "missing") {
      return "Hiányzik a crawler kimenete, ezért a lépés újrafuttatást kér.";
    }

    if (row?.safety?.sanityState === "anomaly") {
      return "A crawler kimenete anomáliát jelez, ezért felülvizsgálat és megerősített újrafuttatás kell.";
    }
  }

  return buildPipelineStatusSummaryText(row?.status);
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
    generatedAt: formatTimestampLabel(report?.generatedAt),
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
    generatedAt: formatTimestampLabel(report?.generatedAt),
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
    generatedAt: formatTimestampLabel(report?.generatedAt),
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
    generatedAt: formatTimestampLabel(report?.generatedAt),
    kpis: [
      { label: "Kézi felülvizsgálat", value: summary.manualConflictReview ?? 0 },
      { label: "Feloldatlan napok", value: summary.unresolved ?? 0 },
      { label: "Legacy primer mismatch", value: safeArray(report?.comparisons?.legacy?.differences?.preferredMismatchDays).length },
    ],
  };
}

function buildAuditCatalogCardFromFinal(report) {
  const validations = report?.validations ?? {};
  const summary = report?.summary ?? {};
  const issueCount =
    (validations.overrideDayCount ?? 0) +
    safeArray(validations.mismatchMonthDays).length +
    (validations.hardFailureCount ?? 0);

  return {
    id: "vegso-primer",
    title: AUDIT_META["vegso-primer"].title,
    purpose: AUDIT_META["vegso-primer"].purpose,
    status: issueCount > 0 ? "warning" : "ok",
    generatedAt: formatTimestampLabel(report?.generatedAt),
    kpis: [
      { label: "Felülírt napok", value: validations.overrideDayCount ?? 0 },
      { label: "Eltéréses napok", value: safeArray(validations.mismatchMonthDays).length },
      { label: "Primer nélkül maradó nevek", value: summary.neverPrimaryCount ?? 0 },
    ],
  };
}

function buildAuditCatalogCardFromMissing(report) {
  const summary = report?.summary ?? {};
  const issueCount = (summary.combinedHighlightedCount ?? 0) + (summary.uniqueMissingNameCount ?? 0);

  return {
    id: "primer-nelkul-marado-nevek",
    title: AUDIT_META["primer-nelkul-marado-nevek"].title,
    purpose: AUDIT_META["primer-nelkul-marado-nevek"].purpose,
    status: issueCount > 0 ? "warning" : "ok",
    generatedAt: formatTimestampLabel(report?.generatedAt),
    kpis: [
      { label: "Érintett napok", value: summary.rowCount ?? 0 },
      { label: "Jelölt hiányok", value: summary.combinedHighlightedCount ?? 0 },
      { label: "Egyedi nevek", value: summary.uniqueMissingNameCount ?? 0 },
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

function buildWikiSummarySections(report) {
  const summary = report?.comparison?.summary ?? {};
  const topRows = safeArray(report?.comparison?.differences?.preferredMismatchDays).slice(0, 20);

  return [
    createKeyValueSection({
      id: "wiki-sources",
      title: "Források",
      rows: [
        { label: "Legacy primer", value: compactPathLabel(report?.legacyPath) },
        { label: "Wiki primer", value: compactPathLabel(report?.wikiPath) },
        { label: "Riport", value: compactPathLabel(report?.reportPath) },
      ],
    }),
    createKeyValueSection({
      id: "wiki-summary",
      title: "Összkép",
      rows: [
        { label: "Közös napok", value: summary.sharedDayCount ?? 0 },
        { label: "Napi néveltérések", value: summary.overlapNameMatchDayCount ?? 0 },
        { label: "Primereltéréses napok", value: (summary.overlapPreferredMatchDayCount ?? 0) + (summary.disjointPreferredMatchDayCount ?? 0) },
        { label: "Pontos primer egyezések", value: summary.exactPreferredMatchDayCount ?? 0 },
      ],
    }),
    createTableSection({
      id: "wiki-top-mismatches",
      title: "Kiemelt primereltérések",
      columns: [
        { key: "dateLabel", label: "Nap" },
        { key: "typeLabel", label: "Eltérés" },
        { key: "legacy", label: "Legacy" },
        { key: "wiki", label: "Wiki" },
        { key: "details", label: "Részletek" },
      ],
      rows: topRows.map((row) => ({
        id: row.monthDay,
        dateLabel: formatMonthDayLabel(row.monthDay),
        typeLabel: row.typeLabel,
        legacy: renderNames(row.legacy, 4, 28),
        wiki: renderNames(row.wiki, 4, 28),
        details: `közös: ${renderNames(row.shared, 3, 22)} • csak legacy: ${renderNames(row.onlyLegacy, 3, 22)} • csak wiki: ${renderNames(row.onlyWiki, 3, 22)}`,
      })),
    }),
  ];
}

function buildLegacySummarySections(report) {
  const registrySummary = report?.registryComparison?.summary ?? {};
  const primarySummary = report?.primaryComparison?.summary ?? {};

  return [
    createKeyValueSection({
      id: "legacy-sources",
      title: "Források",
      rows: [
        { label: "Adatbázis", value: compactPathLabel(report?.inputPath) },
        { label: "Legacy primer", value: compactPathLabel(report?.registryPath) },
        { label: "Riport", value: compactPathLabel(report?.reportPath) },
      ],
    }),
    createKeyValueSection({
      id: "legacy-registry-summary",
      title: "Legacy vs adatbázis",
      rows: [
        { label: "Részleges napok", value: registrySummary.partialCount ?? 0 },
        { label: "Hiányzó legacy nevek", value: registrySummary.registryMissingNameCount ?? 0 },
        { label: "Primer hiányok", value: registrySummary.preferredMissingCount ?? 0 },
        { label: "Fedési arány", value: registrySummary.preferredMatchRate ?? "—" },
      ],
    }),
    createKeyValueSection({
      id: "legacy-primary-summary",
      title: "Legacy vs számított primer",
      rows: [
        { label: "Pontos egyezés", value: primarySummary.exactDayCount ?? 0 },
        { label: "Részleges átfedés", value: primarySummary.overlapDayCount ?? 0 },
        { label: "Teljes eltérés", value: primarySummary.disjointDayCount ?? 0 },
        { label: "Csak rangsorolt", value: primarySummary.rankedOnlyDayCount ?? 0 },
      ],
    }),
    createTableSection({
      id: "legacy-shortfalls",
      title: "Legacy primerhiányos napok",
      columns: [
        { key: "dateLabel", label: "Nap" },
        { key: "registry", label: "Legacy primer" },
        { key: "current", label: "Adatbázis legacy" },
        { key: "missing", label: "Hiányzik" },
      ],
      rows: safeArray(report?.registryComparison?.differences?.preferredShortfallDays).slice(0, 20).map((row) => ({
        id: row.monthDay,
        dateLabel: formatMonthDayLabel(row.monthDay),
        registry: renderNames(row.registryPreferredNames, 4, 28),
        current: renderNames(row.currentPrimaryLegacy, 4, 28),
        missing: renderNames(row.preferredMissing, 4, 28),
      })),
    }),
  ];
}

function buildNormalizerSummarySections(report) {
  const normalizerSummary = report?.normalizer?.summary ?? {};

  return [
    createKeyValueSection({
      id: "normalizer-sources",
      title: "Források",
      rows: [
        { label: "Normalizált primer", value: compactPathLabel(report?.normalizedPath) },
        { label: "Legacy primer", value: compactPathLabel(report?.legacyPath) },
        { label: "Wiki primer", value: compactPathLabel(report?.wikiPath) },
        { label: "Riport", value: compactPathLabel(report?.reportPath) },
      ],
    }),
    createKeyValueSection({
      id: "normalizer-summary",
      title: "Normalizáló összkép",
      rows: [
        { label: "Közvetlenül legacyből", value: normalizerSummary.directFromLegacy ?? 0 },
        { label: "Közvetlenül adatbázisból", value: normalizerSummary.directFromDatabase ?? 0 },
        { label: "Kézi felülvizsgálat", value: normalizerSummary.manualConflictReview ?? 0 },
        { label: "Feloldatlan napok", value: normalizerSummary.unresolved ?? 0 },
      ],
    }),
    ...["legacy", "wiki"].flatMap((key) => {
      const comparison = report?.comparisons?.[key] ?? {};
      const summary = comparison.summary ?? {};
      const preferredRows = safeArray(comparison?.differences?.preferredMismatchDays).slice(0, 12);

      return [
        createKeyValueSection({
          id: `normalizer-${key}-summary`,
          title: key === "legacy" ? "Normalizált vs legacy" : "Normalizált vs wiki",
          rows: [
            { label: "Pontos primer egyezés", value: summary.exactPreferredMatchDayCount ?? 0 },
            { label: "Részleges átfedés", value: summary.overlapPreferredMatchDayCount ?? 0 },
            { label: "Teljes eltérés", value: summary.disjointPreferredMatchDayCount ?? 0 },
            { label: "Fedési arány", value: summary.leftPreferredCoverageRate ?? "—" },
          ],
        }),
        createTableSection({
          id: `normalizer-${key}-table`,
          title: key === "legacy" ? "Kiemelt legacy eltérések" : "Kiemelt wiki eltérések",
          columns: [
            { key: "dateLabel", label: "Nap" },
            { key: "left", label: "Normalizált" },
            { key: "right", label: key === "legacy" ? "Legacy" : "Wiki" },
            { key: "details", label: "Részletek" },
          ],
          rows: preferredRows.map((row) => ({
            id: row.monthDay,
            dateLabel: formatMonthDayLabel(row.monthDay),
            left: renderNames(row.left, 4, 26),
            right: renderNames(row.right, 4, 26),
            details: `közös: ${renderNames(row.shared, 3, 20)} • csak bal: ${renderNames(row.onlyLeft, 3, 20)} • csak jobb: ${renderNames(row.onlyRight, 3, 20)}`,
          })),
        }),
      ];
    }),
  ];
}

function buildFinalSummarySections(report) {
  const validations = report?.validations ?? {};
  const summary = report?.summary ?? {};
  const similarRows = safeArray(report?.neverPrimarySimilarPrimary?.flattenedRows).slice(0, 16);

  return [
    createKeyValueSection({
      id: "final-sources",
      title: "Források",
      rows: [
        { label: "Végső primer", value: compactPathLabel(report?.inputs?.finalRegistryPath) },
        { label: "Legacy primer", value: compactPathLabel(report?.inputs?.legacyRegistryPath) },
        { label: "Wiki primer", value: compactPathLabel(report?.inputs?.wikiRegistryPath) },
        { label: "Normalizált primer", value: compactPathLabel(report?.inputs?.normalizedRegistryPath) },
        { label: "Névadatbázis", value: compactPathLabel(report?.inputs?.inputPath) },
        { label: "Felülírásfájl", value: compactPathLabel(report?.inputs?.overridesPath) },
      ],
    }),
    createKeyValueSection({
      id: "final-validation",
      title: "Validációs összkép",
      rows: [
        { label: "Felülírt napok", value: validations.overrideDayCount ?? 0 },
        { label: "Eltéréses napok", value: safeArray(validations.mismatchMonthDays).length },
        { label: "Kemény hibák", value: validations.hardFailureCount ?? 0, tone: (validations.hardFailureCount ?? 0) > 0 ? "danger" : "neutral" },
        { label: "Primer nélkül maradó nevek", value: summary.neverPrimaryCount ?? 0 },
        { label: "Hasonló primerrel", value: summary.neverPrimaryWithSimilarPrimaryCount ?? 0 },
      ],
    }),
    createTableSection({
      id: "final-sample-days",
      title: "Rögzített mintanapok",
      columns: [
        { key: "monthDay", label: "Nap" },
        { key: "expected", label: "Elvárt" },
        { key: "actual", label: "Tényleges" },
        { key: "status", label: "Állapot" },
      ],
      rows: safeArray(validations.sampleChecks).map((entry) => ({
        id: entry.monthDay,
        monthDay: entry.monthDay,
        expected: renderNames(entry.expectedNames, 6, 32),
        actual: renderNames(entry.actualNames, 6, 32),
        status: entry.ok ? "rendben" : "eltérés",
      })),
    }),
    createTableSection({
      id: "final-extremes",
      title: "Névfrekvenciás szélsőértékek",
      columns: [
        { key: "metric", label: "Mutató" },
        { key: "maxCount", label: "Maximum" },
        { key: "maxNames", label: "Legtöbb nap" },
        { key: "minCount", label: "Minimum" },
        { key: "minNames", label: "Legkevesebb nap" },
      ],
      rows: Object.entries(summary.metricExtremes ?? {}).map(([metric, entry]) => ({
        id: metric,
        metric,
        maxCount: entry?.maxCount ?? 0,
        maxNames: renderNames(entry?.maxNames, 5, 30),
        minCount: entry?.minPositiveCount ?? 0,
        minNames: renderNames(entry?.minPositiveNames, 5, 30),
      })),
    }),
    createTableSection({
      id: "final-never-primary",
      title: "Primer nélkül maradó nevek",
      columns: [
        { key: "name", label: "Név" },
        { key: "dayCount", label: "Napok" },
        { key: "monthDays", label: "Névnapjai" },
      ],
      rows: safeArray(summary.neverPrimary).slice(0, 20).map((entry) => ({
        id: entry.name,
        name: entry.name,
        dayCount: entry.dayCount,
        monthDays: renderNames(entry.monthDays, 8, 42),
      })),
    }),
    createTableSection({
      id: "final-similar-primary",
      title: "Kapcsolódó primernevek",
      columns: [
        { key: "hiddenName", label: "Rejtett név" },
        { key: "primaryName", label: "Kapcsolódó primer" },
        { key: "relation", label: "Kapcsolat" },
        { key: "primaryDays", label: "Primer napjai" },
      ],
      rows: similarRows.map((row, index) => ({
        id: `${row.hiddenName}-${row.primaryName}-${index}`,
        hiddenName: row.hiddenName,
        primaryName: row.primaryName,
        relation: row.relation,
        primaryDays: renderNames(row.primaryMonthDays, 6, 28),
      })),
    }),
    ...(safeArray(validations.hardFailures).length > 0
      ? [
          createListSection({
            id: "final-hard-failures",
            title: "Kemény hibák",
            tone: "danger",
            items: safeArray(validations.hardFailures).map((entry, index) => ({
              id: index + 1,
              title: entry,
            })),
          }),
        ]
      : []),
  ];
}

function buildMissingSummarySections(report) {
  const summary = report?.summary ?? {};
  const highlightedRows = safeArray(report?.months)
    .flatMap((month) => safeArray(month.rows))
    .filter((row) => safeArray(row.combinedMissing).some((entry) => entry.highlight))
    .slice(0, 20);

  return [
    createKeyValueSection({
      id: "missing-sources",
      title: "Források",
      rows: [
        { label: "Végső primer", value: compactPathLabel(report?.inputs?.finalRegistryPath) },
        { label: "Normalizált primer", value: compactPathLabel(report?.inputs?.normalizedRegistryPath) },
        { label: "Névadatbázis", value: compactPathLabel(report?.inputs?.inputPath) },
        { label: "Riport", value: compactPathLabel(report?.inputs?.reportPath) },
      ],
    }),
    createKeyValueSection({
      id: "missing-summary",
      title: "Összkép",
      rows: [
        { label: "Érintett hónapok", value: summary.monthCount ?? 0 },
        { label: "Érintett napok", value: summary.rowCount ?? 0 },
        { label: "Közös hiányok", value: summary.combinedMissingCount ?? 0 },
        { label: "Jelölt hiányok", value: summary.combinedHighlightedCount ?? 0 },
        { label: "Egyedi kimaradó nevek", value: summary.uniqueMissingNameCount ?? 0 },
      ],
    }),
    createTableSection({
      id: "missing-highlighted",
      title: "Kiemelt hiányok",
      columns: [
        { key: "dateLabel", label: "Nap" },
        { key: "finalNames", label: "Végső primerek" },
        { key: "combined", label: "Közös hiányok" },
        { key: "normalized", label: "Normalizált" },
        { key: "ranking", label: "Rangsor" },
      ],
      rows: highlightedRows.map((row) => ({
        id: row.monthDay,
        dateLabel: formatMonthDayLabel(row.monthDay),
        finalNames: renderNames(row.finalPrimaryNames, 4, 28),
        combined: renderNames(safeArray(row.combinedMissing).map((entry) => entry.name), 4, 30),
        normalized: renderNames(safeArray(row.normalizedMissing).map((entry) => entry.name), 4, 30),
        ranking: renderNames(safeArray(row.rankingMissing).map((entry) => entry.name), 4, 30),
      })),
    }),
    createKeyValueSection({
      id: "missing-buckets",
      title: "Végső primerdarab szerinti megoszlás",
      rows: [
        { label: "0 primeres nap", value: summary.finalPrimaryDayBuckets?.zero ?? 0 },
        { label: "1 primeres nap", value: summary.finalPrimaryDayBuckets?.one ?? 0 },
        { label: "2 primeres nap", value: summary.finalPrimaryDayBuckets?.two ?? 0 },
        { label: "3+ primeres nap", value: summary.finalPrimaryDayBuckets?.threeOrMore ?? 0 },
      ],
    }),
  ];
}

function buildWikiMonthSections(rows = []) {
  return [
    createTableSection({
      id: "wiki-month-table",
      title: "Havi eltérések",
      columns: [
        { key: "dateLabel", label: "Nap" },
        { key: "typeLabel", label: "Eltérés" },
        { key: "legacy", label: "Legacy" },
        { key: "wiki", label: "Wiki" },
        { key: "difference", label: "Különbség" },
      ],
      rows: rows.map((row) => ({
        id: row.monthDay,
        dateLabel: row.dateLabel,
        typeLabel: row.preferredDiff?.typeLabel ?? row.nameDiff?.typeLabel ?? "eltérés",
        legacy: renderNames(row.preferredDiff?.legacy ?? row.nameDiff?.legacy, 4, 26),
        wiki: renderNames(row.preferredDiff?.wiki ?? row.nameDiff?.wiki, 4, 26),
        difference: `csak legacy: ${renderNames(row.preferredDiff?.onlyLegacy ?? row.nameDiff?.onlyLegacy, 3, 20)} • csak wiki: ${renderNames(row.preferredDiff?.onlyWiki ?? row.nameDiff?.onlyWiki, 3, 20)}`,
      })),
    }),
  ];
}

function buildLegacyMonthSections(rows = []) {
  return [
    createTableSection({
      id: "legacy-month-table",
      title: "Havi eltérések",
      columns: [
        { key: "dateLabel", label: "Nap" },
        { key: "registryMissing", label: "Hiányzó legacy" },
        { key: "hits", label: "Találatok" },
        { key: "onlyLegacy", label: "Csak legacy primer" },
        { key: "onlyRanked", label: "Csak rangsorolt" },
      ],
      rows: rows.map((row) => ({
        id: row.monthDay,
        dateLabel: row.dateLabel,
        registryMissing: renderNames(row.registryDiff?.missing, 4, 26),
        hits: renderNames(row.registryDiff?.hits, 4, 24),
        onlyLegacy: renderNames(row.primaryDiff?.onlyLegacyPrimary, 4, 26),
        onlyRanked: renderNames(row.primaryDiff?.onlyRankedPrimary, 4, 26),
      })),
    }),
  ];
}

function buildNormalizerMonthSections(comparisons = []) {
  return safeArray(comparisons).map((comparison) =>
    createTableSection({
      id: `normalizer-month-${comparison.id}`,
      title: comparison.title,
      columns: [
        { key: "dateLabel", label: "Nap" },
        { key: "left", label: "Normalizált" },
        { key: "right", label: comparison.id === "legacy" ? "Legacy" : "Wiki" },
        { key: "difference", label: "Különbség" },
      ],
      rows: safeArray(comparison.rows).map((row) => ({
        id: row.monthDay,
        dateLabel: row.dateLabel,
        left: renderNames(row.preferredDiff?.left ?? row.nameDiff?.left, 4, 26),
        right: renderNames(row.preferredDiff?.right ?? row.nameDiff?.right, 4, 26),
        difference: `csak bal: ${renderNames(row.preferredDiff?.onlyLeft ?? row.nameDiff?.onlyLeft, 3, 20)} • csak jobb: ${renderNames(row.preferredDiff?.onlyRight ?? row.nameDiff?.onlyRight, 3, 20)}`,
      })),
    })
  );
}

function buildFinalMonthSections(rows = []) {
  return [
    createTableSection({
      id: "final-month-table",
      title: "Havi primerállapot",
      columns: [
        { key: "monthDay", label: "Nap" },
        { key: "source", label: "Forrás" },
        { key: "names", label: "Végső primerek" },
        { key: "legacy", label: "Legacy" },
        { key: "wiki", label: "Wiki" },
        { key: "hidden", label: "Rejtett nevek" },
      ],
      rows: rows.map((row) => ({
        id: row.monthDay,
        monthDay: row.monthDay,
        source: row.source ?? "—",
        names: renderNames(row.preferredNames, 5, 28),
        legacy: renderNames(row.legacy, 4, 22),
        wiki: renderNames(row.wiki, 4, 22),
        hidden: renderNames(row.hidden, 5, 30),
      })),
    }),
  ];
}

function buildMissingMonthSections(rows = []) {
  return [
    createTableSection({
      id: "missing-month-table",
      title: "Havi kimaradó nevek",
      columns: [
        { key: "monthDay", label: "Nap" },
        { key: "finalNames", label: "Végső primerek" },
        { key: "combined", label: "Közös hiányok" },
        { key: "normalized", label: "Normalizált" },
        { key: "ranking", label: "Rangsor" },
      ],
      rows: rows.map((row) => ({
        id: row.monthDay,
        monthDay: row.monthDay,
        finalNames: renderNames(row.finalPrimaryNames, 4, 28),
        combined: renderNames(safeArray(row.combinedMissing).map((entry) => entry.name), 4, 28),
        normalized: renderNames(safeArray(row.normalizedMissing).map((entry) => entry.name), 4, 28),
        ranking: renderNames(safeArray(row.rankingMissing).map((entry) => entry.name), 4, 28),
      })),
    }),
  ];
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
    generatedAt: formatTimestampLabel(report?.generatedAt),
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

function buildOfficialMetrics(report) {
  const male = report?.genders?.male?.differences ?? {};
  const female = report?.genders?.female?.differences ?? {};

  return [
    createMetric(
      "Dokumentált eltérések",
      safeArray(male.documentedExtraInJson).length +
        safeArray(male.documentedMissingFromJson).length +
        safeArray(female.documentedExtraInJson).length +
        safeArray(female.documentedMissingFromJson).length,
      "ok"
    ),
    createMetric(
      "Tisztázandó eltérések",
      safeArray(male.unapprovedExtraInJson).length +
        safeArray(male.unapprovedMissingFromJson).length +
        safeArray(female.unapprovedExtraInJson).length +
        safeArray(female.unapprovedMissingFromJson).length,
      buildOfficialAuditStatus(report) === "warning" ? "warning" : "ok"
    ),
    createMetric(
      "Vizsgált nevek",
      (report?.genders?.male?.json?.count ?? 0) + (report?.genders?.female?.json?.count ?? 0)
    ),
  ];
}

function buildOfficialSummarySections(report, exceptionsPayload) {
  const genders = [
    {
      id: "male",
      label: "Férfi nevek",
      report: report?.genders?.male ?? {},
    },
    {
      id: "female",
      label: "Női nevek",
      report: report?.genders?.female ?? {},
    },
  ];

  return [
    createGridSection({
      id: "official-sources",
      title: "Források és dátumok",
      items: [
        {
          id: "hivatalos",
          value: exceptionsPayload?.forrasok?.hivatalosNevjegyzekDatum ?? "Nincs megadva",
          meta: "Hivatalos névjegyzék dátuma",
        },
        {
          id: "elte",
          value: exceptionsPayload?.forrasok?.elteAdatbazisDatum ?? "Nincs megadva",
          meta: "ELTE adatbázis dátuma",
        },
        {
          id: "riport",
          value: formatTimestampLabel(report?.generatedAt) ?? "Még nincs riport",
          meta: "Utolsó auditfutás",
        },
      ],
    }),
    createTableSection({
      id: "official-gender-summary",
      title: "Nemek szerinti összkép",
      columns: [
        { key: "label", label: "Csoport" },
        { key: "officialCount", label: "Hivatalos" },
        { key: "jsonCount", label: "Adatbázis" },
        { key: "documented", label: "Dokumentált" },
        { key: "unresolved", label: "Tisztázandó" },
      ],
      rows: genders.map((gender) => ({
        id: gender.id,
        label: gender.label,
        officialCount: gender.report?.official?.count ?? 0,
        jsonCount: gender.report?.json?.count ?? 0,
        documented:
          safeArray(gender.report?.differences?.documentedExtraInJson).length +
          safeArray(gender.report?.differences?.documentedMissingFromJson).length,
        unresolved:
          safeArray(gender.report?.differences?.unapprovedExtraInJson).length +
          safeArray(gender.report?.differences?.unapprovedMissingFromJson).length,
      })),
    }),
    createTextSection({
      id: "official-notes",
      title: "Szerkesztői megjegyzés",
      body: exceptionsPayload?.megjegyzes || "Ehhez az audithoz jelenleg nincs külön szerkesztői megjegyzés.",
    }),
  ];
}

function buildFinalMonthSummaries(months = []) {
  return safeArray(months).map((month) => ({
    month: month.month,
    monthName: month.monthName ?? getMonthName(month.month),
    summary: {
      total: safeArray(month.rows).length,
      mismatches: safeArray(month.rows).filter((row) => row.source === "manual-override" || row.warning === true).length,
    },
  }));
}

function buildMissingMonthSummaries(months = []) {
  return safeArray(months).map((month) => ({
    month: month.month,
    monthName: month.monthName ?? getMonthName(month.month),
    summary: {
      total: safeArray(month.rows).length,
      mismatches: safeArray(month.rows).filter((row) =>
        safeArray(row.combinedMissing).some((entry) => entry.highlight === true)
      ).length,
    },
  }));
}

function filterFinalRows(rows = [], query = "") {
  return safeArray(rows).filter((row) =>
    matchesFreeText(query, [
      row.monthDay,
      row.source,
      ...safeArray(row.preferredNames),
      ...safeArray(row.legacy),
      ...safeArray(row.wiki),
      ...safeArray(row.override),
      ...safeArray(row.normalized),
      ...safeArray(row.ranking),
      ...safeArray(row.hidden),
    ])
  );
}

function filterMissingRows(rows = [], query = "") {
  return safeArray(rows).filter((row) =>
    matchesFreeText(query, [
      row.monthDay,
      ...safeArray(row.finalPrimaryNames),
      ...safeArray(row.combinedMissing).map((entry) => entry.name),
      ...safeArray(row.normalizedMissing).map((entry) => entry.name),
      ...safeArray(row.rankingMissing).map((entry) => entry.name),
      ...safeArray(row.combinedMissing)
        .flatMap((entry) => safeArray(entry.similarPrimaries).map((similar) => similar.primaryName)),
    ])
  );
}

async function buildAuditSummaryPayload(auditId) {
  if (auditId === "hivatalos-nevjegyzek") {
    const [report, exceptions] = await Promise.all([
      loadStructuredIfExists(kanonikusUtvonalak.riportok.hivatalosNevjegyzek),
      betoltHivatalosNevjegyzekKiveteleket(),
    ]);
    const editor = buildOfficialDetail(report, exceptions.payload);

    return {
      id: auditId,
      title: AUDIT_META[auditId].title,
      kind: "official",
      purpose: AUDIT_META[auditId].purpose,
      generatedAt: formatTimestampLabel(report?.generatedAt),
      status: buildOfficialAuditStatus(report),
      metrics: buildOfficialMetrics(report),
      sections: buildOfficialSummarySections(report, exceptions.payload),
      monthSummaries: [],
      editor,
    };
  }

  if (auditId === "wiki-vs-legacy") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.wikiVsLegacy);
    const rows = buildWikiRows(report);
    const summary = report?.comparison?.summary ?? {};

    return {
      id: auditId,
      title: AUDIT_META[auditId].title,
      kind: auditId,
      purpose: AUDIT_META[auditId].purpose,
      generatedAt: formatTimestampLabel(report?.generatedAt),
      status: buildAuditCatalogCardFromWiki(report).status,
      metrics: [
        createMetric("Közös napok", summary.sharedDayCount ?? 0),
        createMetric("Néveltéréses napok", safeArray(report?.comparison?.differences?.nameMismatchDays).length, buildAuditCatalogCardFromWiki(report).status === "warning" ? "warning" : "ok"),
        createMetric("Primereltérések", safeArray(report?.comparison?.differences?.preferredMismatchDays).length, buildAuditCatalogCardFromWiki(report).status === "warning" ? "warning" : "ok"),
        createMetric("Pontos primer egyezések", summary.exactPreferredMatchDayCount ?? 0, "ok"),
      ],
      sections: buildWikiSummarySections(report),
      monthSummaries: buildMonthSummariesFromGroups(buildMonthGroups(rows, (row) => row.month)),
      editor: null,
    };
  }

  if (auditId === "legacy-primer") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.legacyPrimer);
    const rows = buildLegacyRows(report);
    const registrySummary = report?.registryComparison?.summary ?? {};
    const primarySummary = report?.primaryComparison?.summary ?? {};

    return {
      id: auditId,
      title: AUDIT_META[auditId].title,
      kind: auditId,
      purpose: AUDIT_META[auditId].purpose,
      generatedAt: formatTimestampLabel(report?.generatedAt),
      status: buildAuditCatalogCardFromLegacy(report).status,
      metrics: [
        createMetric("Registry részleges napok", registrySummary.partialCount ?? 0, registrySummary.partialCount > 0 ? "warning" : "ok"),
        createMetric("Hiányzó legacy nevek", registrySummary.registryMissingNameCount ?? 0, registrySummary.registryMissingNameCount > 0 ? "warning" : "ok"),
        createMetric("Primer mismatch napok", safeArray(report?.primaryComparison?.differences?.mismatchDays).length, safeArray(report?.primaryComparison?.differences?.mismatchDays).length > 0 ? "warning" : "ok"),
        createMetric("Rangsorolt only napok", primarySummary.rankedOnlyDayCount ?? 0),
      ],
      sections: buildLegacySummarySections(report),
      monthSummaries: buildMonthSummariesFromGroups(buildMonthGroups(rows, (row) => row.month)),
      editor: null,
    };
  }

  if (auditId === "primer-normalizalo") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNormalizalo);
    const comparisonSummaries = ["legacy", "wiki"].map((key) => ({
      id: key,
      rows: buildComparisonRows(report?.comparisons?.[key]),
      summary: report?.comparisons?.[key]?.summary ?? {},
      title: key === "legacy" ? "Normalizált vs legacy" : "Normalizált vs wiki",
    }));
    const monthSummaryMap = new Map();

    for (const comparison of comparisonSummaries) {
      for (const monthSummary of buildMonthSummariesFromGroups(buildMonthGroups(comparison.rows, (row) => row.month))) {
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
      id: auditId,
      title: AUDIT_META[auditId].title,
      kind: auditId,
      purpose: AUDIT_META[auditId].purpose,
      generatedAt: formatTimestampLabel(report?.generatedAt),
      status: buildAuditCatalogCardFromNormalizer(report).status,
      metrics: [
        createMetric("Közvetlenül legacyből", report?.normalizer?.summary?.directFromLegacy ?? 0),
        createMetric("Közvetlenül adatbázisból", report?.normalizer?.summary?.directFromDatabase ?? 0),
        createMetric("Kézi felülvizsgálat", report?.normalizer?.summary?.manualConflictReview ?? 0, (report?.normalizer?.summary?.manualConflictReview ?? 0) > 0 ? "warning" : "ok"),
        createMetric("Feloldatlan napok", report?.normalizer?.summary?.unresolved ?? 0, (report?.normalizer?.summary?.unresolved ?? 0) > 0 ? "warning" : "ok"),
      ],
      sections: buildNormalizerSummarySections(report),
      monthSummaries: Array.from(monthSummaryMap.values()).sort((left, right) => left.month - right.month),
      editor: null,
    };
  }

  if (auditId === "vegso-primer") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.vegsoPrimer);
    const validations = report?.validations ?? {};
    const summary = report?.summary ?? {};

    return {
      id: auditId,
      title: AUDIT_META[auditId].title,
      kind: auditId,
      purpose: AUDIT_META[auditId].purpose,
      generatedAt: formatTimestampLabel(report?.generatedAt),
      status: buildAuditCatalogCardFromFinal(report).status,
      metrics: [
        createMetric("Felülírt napok", validations.overrideDayCount ?? 0, (validations.overrideDayCount ?? 0) > 0 ? "warning" : "ok"),
        createMetric("Eltéréses napok", safeArray(validations.mismatchMonthDays).length, safeArray(validations.mismatchMonthDays).length > 0 ? "warning" : "ok"),
        createMetric("Kemény hibák", validations.hardFailureCount ?? 0, (validations.hardFailureCount ?? 0) > 0 ? "danger" : "ok"),
        createMetric("Primer nélkül maradó nevek", summary.neverPrimaryCount ?? 0, (summary.neverPrimaryCount ?? 0) > 0 ? "warning" : "ok"),
      ],
      sections: buildFinalSummarySections(report),
      monthSummaries: buildFinalMonthSummaries(report?.months),
      editor: null,
    };
  }

  if (auditId === "primer-nelkul-marado-nevek") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNelkulMaradoNevek);
    const summary = report?.summary ?? {};

    return {
      id: auditId,
      title: AUDIT_META[auditId].title,
      kind: auditId,
      purpose: AUDIT_META[auditId].purpose,
      generatedAt: formatTimestampLabel(report?.generatedAt),
      status: buildAuditCatalogCardFromMissing(report).status,
      metrics: [
        createMetric("Érintett napok", summary.rowCount ?? 0, (summary.rowCount ?? 0) > 0 ? "warning" : "ok"),
        createMetric("Jelölt hiányok", summary.combinedHighlightedCount ?? 0, (summary.combinedHighlightedCount ?? 0) > 0 ? "warning" : "ok"),
        createMetric("Egyedi nevek", summary.uniqueMissingNameCount ?? 0),
        createMetric("12 havi lefedés", (summary.monthCount ?? 0) === 12 ? "igen" : `${summary.monthCount ?? 0} hónap`, (summary.monthCount ?? 0) === 12 ? "ok" : "warning"),
      ],
      sections: buildMissingSummarySections(report),
      monthSummaries: buildMissingMonthSummaries(report?.months),
      editor: null,
    };
  }

  throw new Error(`Ismeretlen audit részletnézet: ${auditId}`);
}

export async function buildAuditDetailSummaryModel(auditId) {
  return buildAuditSummaryPayload(auditId);
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
      sections: buildWikiMonthSections(rows),
    };
  }

  if (auditId === "legacy-primer") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.legacyPrimer);
    const rows = filterLegacyRows(buildLegacyRows(report), query).filter((row) => row.month === month);

    return {
      auditId,
      month: buildMonthResponse(month, rows),
      sections: buildLegacyMonthSections(rows),
    };
  }

  if (auditId === "primer-normalizalo") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNormalizalo);
    const comparisons = ["legacy", "wiki"].map((key) => {
      const rows = filterComparisonRows(buildComparisonRows(report?.comparisons?.[key]), query).filter(
        (row) => row.month === month
      );

      return {
        id: key,
        title: key === "legacy" ? "Normalizált vs legacy" : "Normalizált vs wiki",
        summary: buildSimpleTotalSummary(rows),
        rows,
      };
    });

    return {
      auditId,
      month: {
        month,
        monthName: getMonthName(month),
        summary: {
          total: comparisons.reduce((acc, comparison) => acc + (comparison.summary.total ?? 0), 0),
        },
      },
      comparisons,
      sections: buildNormalizerMonthSections(comparisons),
    };
  }

  if (auditId === "vegso-primer") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.vegsoPrimer);
    const monthReport = safeArray(report?.months).find((entry) => entry.month === month) ?? {
      month,
      monthName: getMonthName(month),
      rows: [],
    };
    const rows = filterFinalRows(monthReport.rows, query);

    return {
      auditId,
      month: buildMonthResponse(month, rows),
      sections: buildFinalMonthSections(rows),
    };
  }

  if (auditId === "primer-nelkul-marado-nevek") {
    const report = await loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNelkulMaradoNevek);
    const monthReport = safeArray(report?.months).find((entry) => entry.month === month) ?? {
      month,
      monthName: getMonthName(month),
      rows: [],
    };
    const rows = filterMissingRows(monthReport.rows, query);

    return {
      auditId,
      month: buildMonthResponse(month, rows),
      sections: buildMissingMonthSections(rows),
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
    generatedAt: formatTimestampLabel(report.generatedAt),
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

function buildIcsFieldModel(settings, key) {
  const definition = getIcsFieldDefinition(key);
  const value = getNestedValue(settings, key);

  return {
    key,
    label: definition?.cimke ?? key,
    type: definition?.tipus ?? "text",
    value,
    description: definition?.rovidLeiras ?? "",
    summary: icsErtekCimke(key, value),
    min: definition?.min ?? null,
    max: definition?.max ?? null,
    step: definition?.step ?? null,
    options: safeArray(definition?.ertekek).map((option) => ({
      value: option,
      label: icsErtekCimke(key, option),
      description: definition?.ertekLeirasok?.[option] ?? "",
    })),
  };
}

function buildLeapProfileModel(settings) {
  const leapProfile = settings?.shared?.leapProfile ?? "off";
  const aEnabled = leapProfile === "hungarian-a" || leapProfile === "hungarian-both";
  const bEnabled = leapProfile === "hungarian-b" || leapProfile === "hungarian-both";

  return {
    aEnabled,
    bEnabled,
    fromYear: settings?.shared?.fromYear,
    untilYear: settings?.shared?.untilYear,
    baseYear: settings?.shared?.baseYear,
    showBaseYear: aEnabled || bEnabled,
    selectionLabel: icsErtekCimke("shared.leapProfile", leapProfile),
    description:
      "A magyar szökőéves kompatibilitási profil a február 29. körüli névnapkezelést szabályozza. Az A és B jelölés két bevett értelmezést fed le.",
    toggles: [
      {
        id: "a",
        label: "A változat",
        checked: aEnabled,
        description: "Az A értelmezés a szökőnap körüli eltolást az egyik bevett magyar gyakorlat szerint kezeli.",
      },
      {
        id: "b",
        label: "B változat",
        checked: bEnabled,
        description: "A B értelmezés alternatív magyar kompatibilitási viselkedést ad, külön fájlban vagy önálló profilként is használható.",
      },
    ],
  };
}

function buildIcsCalendarCard(settings, prefix, id, label, description) {
  return {
    id,
    label,
    description,
    calendarName: buildIcsFieldModel(settings, `${prefix}.calendarName`),
    layout: buildIcsFieldModel(settings, `${prefix}.layout`),
    descriptionMode: buildIcsFieldModel(settings, `${prefix}.descriptionMode`),
    descriptionFormat: buildIcsFieldModel(settings, `${prefix}.descriptionFormat`),
    ordinalDay: buildIcsFieldModel(settings, `${prefix}.ordinalDay`),
  };
}

function buildIcsStatusSummary(settings) {
  const outputs = listazAktivIcsKimeneteket(settings).map((output) => path.basename(output));
  const calendarNames =
    settings.partitionMode === "split"
      ? [settings.split.primary.calendarName, settings.split.rest.calendarName]
      : [settings.single.calendarName];

  return {
    modeLabel: settings.partitionMode === "split" ? "Bontott naptár" : "Egy naptár",
    outputs,
    calendarNames,
    leapProfileLabel: icsErtekCimke("shared.leapProfile", settings.shared.leapProfile),
  };
}

function buildPreviewCalendarLabel(role) {
  return role === "rest" ? "További naptár" : "Naptár";
}

function buildPreviewNameIndex(results = []) {
  const index = new Map();

  for (const result of results) {
    for (const sourceDay of safeArray(result?.sourceDays)) {
      for (const nameEntry of safeArray(sourceDay?.names)) {
        const key = String(nameEntry?.name ?? "").trim();

        if (!key) {
          continue;
        }

        if (!index.has(key)) {
          index.set(key, new Set());
        }

        if (sourceDay?.monthDay) {
          index.get(key).add(sourceDay.monthDay);
        }
      }
    }
  }

  return index;
}

function buildPreviewDetailId(role, monthDay, index) {
  return `${role}-${monthDay}-${index + 1}`;
}

export async function buildIcsEditorModel() {
  const loaded = await betoltIcsBeallitasokat();
  const settings = normalizalIcsBeallitasokat(loaded.settings);

  return {
    savedSettings: settings,
    status: buildIcsStatusSummary(settings),
    outputs: listazAktivIcsKimeneteket(settings).map((output) => path.basename(output)),
    leapProfile: buildLeapProfileModel(settings),
    calendarMode: {
      partitionMode: settings.partitionMode,
      modeLabel: settings.partitionMode === "split" ? "Bontott naptár" : "Egy naptár",
      description:
        settings.partitionMode === "split"
          ? "Az elsődleges és a további névnapok külön naptárban készülnek el. Így a szerkesztői döntések azonnal átláthatók maradnak."
          : "Minden névnap egyetlen naptárban marad, ezért a beállítások a teljes kimenetre egyszerre hatnak.",
      primaryIncludeOtherDays: settings.partitionMode === "split" ? settings.split.primary.includeOtherDays === true : null,
      includeOtherDaysField:
        settings.partitionMode === "split"
          ? buildIcsFieldModel(settings, "split.primary.includeOtherDays")
          : buildIcsFieldModel(settings, "single.includeOtherDays"),
      calendars:
        settings.partitionMode === "split"
          ? [
              buildIcsCalendarCard(
                settings,
                "split.primary",
                "primary",
                "Elsődleges naptár",
                "A véglegesített primerek külön naptárba kerülnek."
              ),
              buildIcsCalendarCard(
                settings,
                "split.rest",
                "rest",
                "További naptár",
                "Az elsődlegesből kimaradó, de ugyanarra a napra eső nevek külön követhetők."
              ),
            ]
          : [
              buildIcsCalendarCard(
                settings,
                "single",
                "single",
                "Közös naptár",
                "Minden névnap egyetlen, közös naptárban látszik."
              ),
            ],
    },
  };
}

export async function buildIcsPreviewModel(draft = {}, options = {}) {
  const preview = await epitIcsPreviewt(draft);
  const settings = normalizalIcsBeallitasokat(preview.settings);
  const requestedPanelId = String(options.panelId ?? "").trim() || null;
  const results = requestedPanelId
    ? safeArray(preview.results).filter((result) => (result.previewRole ?? "main") === requestedPanelId)
    : safeArray(preview.results);
  const nameIndex = buildPreviewNameIndex(safeArray(preview.results));
  const rowMap = new Map();
  const details = {};
  const calendars = results.map((result) => {
    const role = result.previewRole ?? "main";

    return {
      id: role,
      role,
      label: result.previewLabel ?? buildPreviewCalendarLabel(role),
      outputPath: result.outputPath ?? null,
      fileName: path.basename(result.outputPath ?? `${role}.ics`),
      eventCount: result.eventCount ?? 0,
      rawText: options.includeRaw === true ? result.calendarText ?? "" : null,
      hasRawPreview: Boolean(result.calendarText),
    };
  });

  for (const result of results) {
    const role = result.previewRole ?? "main";
    const label = result.previewLabel ?? buildPreviewCalendarLabel(role);
    const collator = new Intl.Collator("hu", { sensitivity: "base", numeric: true });

    for (const sourceDay of safeArray(result?.sourceDays)) {
      const parsed = parseMonthDay(sourceDay?.monthDay);

      if (!parsed) {
        continue;
      }

      if (!rowMap.has(sourceDay.monthDay)) {
        rowMap.set(sourceDay.monthDay, {
          month: parsed.month,
          day: parsed.day,
          monthDay: sourceDay.monthDay,
          dateLabel: formatMonthDayLabel(sourceDay.monthDay),
          cells: {},
        });
      }

      const row = rowMap.get(sourceDay.monthDay);
      const sortedNames = safeArray(sourceDay.names).slice().sort((left, right) =>
        collator.compare(left?.name ?? "", right?.name ?? "")
      );

      row.cells[role] = {
        calendarId: role,
        names: sortedNames.map((nameEntry, index) => {
          const detailId = buildPreviewDetailId(role, sourceDay.monthDay, index);
          const otherMonthDays = Array.from(nameIndex.get(nameEntry?.name) ?? []).filter(
            (monthDay) => monthDay !== sourceDay.monthDay
          );
          const detail = buildIcsPreviewNameDetailPayload({
            nameEntry,
            sourceDay,
            otherMonthDays,
            options: result.options,
            calendarRole: role,
            calendarLabel: label,
          });

          details[detailId] = {
            id: detailId,
            name: nameEntry?.name ?? "—",
            calendarRole: role,
            calendarLabel: label,
            dateLabel: formatMonthDayLabel(sourceDay.monthDay),
            monthDay: sourceDay.monthDay,
            plainDescription: detail?.plainDescription ?? "",
            meta: detail?.meta ?? null,
          };

          return {
            id: `${detailId}-token`,
            label: nameEntry?.name ?? "—",
            detailId,
          };
        }),
      };
    }
  }

  const months = buildMonthGroups(Array.from(rowMap.values()), (row) => row.month).map((group) => ({
    month: group.month,
    monthName: group.monthName,
    summary: {
      total: safeArray(group.items).length,
    },
    rows: safeArray(group.items).sort((left, right) => left.day - right.day),
  }));

  return {
    settings,
    mode: preview.outputProfil?.partitionMode ?? settings.partitionMode,
    columns:
      preview.outputProfil?.partitionMode === "split"
        ? [
            { id: "main", label: "Naptár" },
            { id: "rest", label: "További naptár" },
          ]
        : [{ id: "main", label: "Naptár" }],
    calendars,
    months,
    details,
  };
}

function buildPipelineGroupStatus(statuses = []) {
  const values = safeArray(statuses);

  if (values.length === 0) {
    return "ismeretlen";
  }

  if (values.every((status) => status === "kesz")) {
    return "kesz";
  }

  if (values.includes("blokkolt")) {
    return "blokkolt";
  }

  if (values.includes("hianyzik")) {
    return "hianyzik";
  }

  if (values.includes("elavult")) {
    return "elavult";
  }

  if (values.includes("fuggoseg-frissitesre-var")) {
    return "fuggoseg-frissitesre-var";
  }

  return values[0] ?? "ismeretlen";
}

function buildPipelineSummary(rows = []) {
  const counts = safeArray(rows).reduce(
    (acc, row) => {
      acc.total += 1;
      acc[row.status] = (acc[row.status] ?? 0) + 1;
      return acc;
    },
    { total: 0 }
  );

  return {
    total: counts.total,
    fresh: counts.kesz ?? 0,
    missing: counts.hianyzik ?? 0,
    outdated: (counts.elavult ?? 0) + (counts["fuggoseg-frissitesre-var"] ?? 0),
    blocked: counts.blokkolt ?? 0,
    attention: counts.total - (counts.kesz ?? 0),
    overallStatus: buildPipelineGroupStatus(safeArray(rows).map((row) => row.status)),
  };
}

function buildPipelineStepModel(row) {
  const definition = pipelineLepesek.find((entry) => entry.azonosito === row.azonosito) ?? row;

  return {
    id: row.azonosito,
    title: capitalize(String(definition.leiras ?? row.leiras ?? row.azonosito).replace(/\.$/u, "")),
    description: definition.leiras ?? row.leiras ?? "",
    status: row.status,
    statusLabel: buildPipelineStatusAdminLabel(row.status),
    tone: buildPipelineStatusTone(row.status),
    summaryText: buildPipelineStepSummaryText(row),
    dependsOn: safeArray(row.dependsOn).map((dependencyId) => {
      const dependency = pipelineLepesek.find((entry) => entry.azonosito === dependencyId);

      return {
        id: dependencyId,
        label: capitalize(String(dependency?.leiras ?? dependencyId).replace(/\.$/u, "")),
      };
    }),
    inputsSummary: summarizePathList(row.bemenetek),
    outputsSummary: summarizePathList(row.kimenetek),
    isCrawler: row.safeMode === "crawler",
    safetyPolicyLabel: row.safety?.policyLabel ?? null,
    sanityState: row.safety?.sanityState ?? null,
    sanityLabel: row.safety?.sanityState ? buildCrawlerSanityLabel(row.safety.sanityState) : null,
    safetyReasons: safeArray(row.safety?.reasons),
    requiresConfirmation: row.safeMode === "crawler" && row.status !== "kesz",
    lastRun: formatTimestampLabel(row.utolsoFutas),
    lastStatus: row.utolsoStatus ?? null,
    actions: [
      { id: "run", label: "Frissítés", target: row.azonosito, force: false },
      { id: "rerun", label: "Újrafuttatás", target: row.azonosito, force: true },
    ],
  };
}

function buildPipelineGroupMetrics(steps = []) {
  const summary = buildPipelineSummary(steps);

  return [
    createMetric("Lépések", summary.total),
    createMetric("Friss", summary.fresh, summary.fresh === summary.total ? "ok" : "neutral"),
    createMetric("Figyelmet kér", summary.attention, summary.attention > 0 ? "warning" : "ok"),
    createMetric("Blokkolt", summary.blocked, summary.blocked > 0 ? "danger" : "ok"),
  ];
}

function buildPipelineGroupSummaryText(summary) {
  if ((summary?.attention ?? 0) === 0) {
    return `Mind a ${summary?.total ?? 0} lépés friss.`;
  }

  const parts = [
    `${summary?.fresh ?? 0}/${summary?.total ?? 0} friss`,
    `${summary?.attention ?? 0} figyelmet kér`,
  ];

  if ((summary?.blocked ?? 0) > 0) {
    parts.push(`${summary.blocked} blokkolt`);
  }

  return parts.join(" • ");
}

export async function buildPipelineModel() {
  const stateRows = await pipelineAllapot();
  const stateMap = new Map(stateRows.map((row) => [row.azonosito, row]));
  const groups = pipelineCsoportok.map((group) => {
    const steps = safeArray(group.lepesek)
      .map((stepId) => stateMap.get(stepId))
      .filter(Boolean);
    const stepModels = steps.map((step) => buildPipelineStepModel(step));
    const summary = buildPipelineSummary(steps);

    return {
      id: group.azonosito,
      label: group.cimke,
      description: group.leiras,
      status: summary.overallStatus,
      statusLabel: buildPipelineStatusAdminLabel(summary.overallStatus),
      tone: buildPipelineStatusTone(summary.overallStatus),
      summaryText: buildPipelineGroupSummaryText(summary),
      metrics: buildPipelineGroupMetrics(steps),
      stepCount: stepModels.length,
      steps: stepModels,
      actions: [
        { id: "run-group", label: "Csoport frissítése", target: group.azonosito, force: false },
        { id: "rerun-group", label: "Csoport újrafuttatása", target: group.azonosito, force: true },
      ],
    };
  });
  const summary = buildPipelineSummary(stateRows);

  return {
    summary: {
      ...summary,
      metrics: [
        createMetric("Összes lépés", summary.total),
        createMetric("Friss", summary.fresh, summary.fresh === summary.total ? "ok" : "neutral"),
        createMetric("Hiányzik vagy elavult", summary.attention, summary.attention > 0 ? "warning" : "ok"),
        createMetric("Blokkolt", summary.blocked, summary.blocked > 0 ? "danger" : "ok"),
      ],
    },
    groups,
    actions: [
      { id: "run-all", label: "Teljes frissítés", target: "teljes", force: false },
      { id: "rerun-all", label: "Teljes újrafuttatás", target: "teljes", force: true },
    ],
  };
}

export async function buildAuditCatalogModel() {
  const [officialReport, wikiReport, legacyReport, normalizerReport, finalReport, missingReport] = await Promise.all([
    loadStructuredIfExists(kanonikusUtvonalak.riportok.hivatalosNevjegyzek),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.wikiVsLegacy),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.legacyPrimer),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNormalizalo),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.vegsoPrimer),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNelkulMaradoNevek),
  ]);
  const audits = [
    buildAuditCatalogCardFromOfficial(officialReport),
    buildAuditCatalogCardFromWiki(wikiReport),
    buildAuditCatalogCardFromLegacy(legacyReport),
    buildAuditCatalogCardFromNormalizer(normalizerReport),
    buildAuditCatalogCardFromFinal(finalReport),
    buildAuditCatalogCardFromMissing(missingReport),
  ];

  return {
    audits,
    summary: {
      total: audits.length,
      warningCount: audits.filter((audit) => audit.status === "warning").length,
      okCount: audits.filter((audit) => audit.status === "ok").length,
    },
  };
}

export async function buildAuditDetailModel(auditId) {
  return buildAuditSummaryPayload(auditId);
}

export async function buildDashboardModel(jobState = null) {
  const [pipeline, audits, primerSummary] = await Promise.all([
    buildPipelineModel(),
    buildAuditCatalogModel(),
    buildPrimerAuditSummaryModel(),
  ]);
  const actionableQueue =
    safeArray(primerSummary.overviewQueues).find((queue) => queue.azonosito === "akciozhato") ?? null;
  const warningAudits = safeArray(audits.audits).filter((audit) => audit.status !== "ok");

  return {
    generatedAt: new Date().toISOString(),
    connection: {
      connected: true,
    },
    jobState,
    summary: {
      actionablePrimerDayCount: actionableQueue?.count ?? 0,
      pipelineAttentionCount: pipeline.summary.attention,
      auditWarningCount: audits.summary.warningCount,
      primerOpenCount: primerSummary.summary.effectiveMissingCount ?? 0,
    },
    sections: {
      primerNow: {
        title: "Primer audit most",
        metrics: [
          createMetric("Akciózható napok", actionableQueue?.count ?? 0, (actionableQueue?.count ?? 0) > 0 ? "warning" : "ok"),
          createMetric("Nyitott hiány", primerSummary.summary.effectiveMissingCount ?? 0, (primerSummary.summary.effectiveMissingCount ?? 0) > 0 ? "warning" : "ok"),
          createMetric("Helyi kijelölések", primerSummary.summary.localSelectedDayCount ?? 0),
          createMetric("Eltéréses napok", primerSummary.summary.mismatchDayCount ?? 0, (primerSummary.summary.mismatchDayCount ?? 0) > 0 ? "warning" : "ok"),
        ],
        queues: safeArray(primerSummary.overviewQueues).map((queue) => ({
          id: queue.azonosito,
          label: queue.cimke,
          count: queue.count,
          description: queue.leiras,
        })),
        todos: safeArray(primerSummary.todos).slice(0, 8),
        link: "/primer-audit",
      },
      primerMonths: {
        title: "Havi primer állapot",
        months: safeArray(primerSummary.months).map((month) => ({
          month: month.month,
          monthName: month.monthName,
          total: month.summary?.total ?? 0,
          missing: month.summary?.missing ?? 0,
          local: month.summary?.local ?? 0,
          overrides: month.summary?.overrides ?? 0,
          mismatches: month.summary?.mismatches ?? 0,
        })),
        link: "/primer-audit",
      },
      auditWarnings: {
        title: "Audit figyelmek",
        metrics: [
          createMetric("Figyelmet kér", audits.summary.warningCount, audits.summary.warningCount > 0 ? "warning" : "ok"),
          createMetric("Rendben", audits.summary.okCount, "ok"),
        ],
        items: warningAudits.map((audit) => ({
          id: audit.id,
          title: audit.title,
          status: audit.status,
          generatedAt: audit.generatedAt,
          primaryKpi: audit.kpis?.[0] ?? null,
          purpose: audit.purpose,
        })),
        link: "/auditok",
      },
      pipeline: {
        title: "Pipeline",
        status: pipeline.summary.overallStatus,
        metrics: pipeline.summary.metrics,
        groups: safeArray(pipeline.groups).map((group) => ({
          id: group.id,
          label: group.label,
          status: group.status,
          statusLabel: group.statusLabel,
          summaryText: group.summaryText,
          attentionCount: group.steps.filter((step) => step.status !== "kesz").length,
        })),
        link: "/pipeline",
      },
    },
    links: [
      { id: "pipeline", label: "Pipeline", path: "/pipeline" },
      { id: "auditok", label: "Auditok", path: "/auditok" },
      { id: "primer-audit", label: "Primer audit", path: "/primer-audit" },
      { id: "ics", label: "ICS", path: "/ics" },
    ],
  };
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
    generatedAt: formatTimestampLabel(report.generatedAt),
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
