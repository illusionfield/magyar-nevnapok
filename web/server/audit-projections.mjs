import path from "node:path";
import { betoltHivatalosNevjegyzekKiveteleket } from "../../domainek/szolgaltatasok.mjs";
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
    order: 60,
    blocksPrimerWork: false,
  },
  "wiki-vs-legacy": {
    title: "Wiki vs legacy",
    purpose: "A wiki és a legacy primer közötti napi név- és primereltérések részletes nézete.",
    order: 40,
    blocksPrimerWork: true,
  },
  "legacy-primer": {
    title: "Legacy primer",
    purpose: "A legacy primerjegyzék és a jelenlegi adatbázis, valamint a rangsorolt primerek összevetése.",
    order: 50,
    blocksPrimerWork: false,
  },
  "primer-normalizalo": {
    title: "Primer normalizáló",
    purpose: "A normalizált primerjelölések eltérései a legacy és a wiki forrásokhoz képest.",
    order: 30,
    blocksPrimerWork: true,
  },
  "vegso-primer": {
    title: "Végső primer állapot",
    purpose: "A végső primerdöntések validációja, mintanapjai és rejtett névkapcsolatai.",
    order: 10,
    blocksPrimerWork: true,
  },
  "primer-nelkul-marado-nevek": {
    title: "Primer nélkül maradó nevek",
    purpose: "Azok a nevek, amelyek normalizált vagy rangsorolt nézetben látszanak, de a végső primerből kimaradnak.",
    order: 20,
    blocksPrimerWork: true,
  },
};

function capitalize(value) {
  const text = String(value ?? "");
  return text ? text.charAt(0).toLocaleUpperCase("hu") + text.slice(1) : "";
}

function getMonthName(month) {
  if (!Number.isInteger(month)) {
    return "—";
  }

  return capitalize(monthFormatter.format(new Date(Date.UTC(2024, month - 1, 1))));
}

function formatMonthDayLabel(monthDay) {
  const parsed = parseMonthDay(monthDay);
  return parsed ? `${getMonthName(parsed.month)} ${parsed.day}.` : monthDay ?? "—";
}

function formatTimestampLabel(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : timestampFormatter.format(date);
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

function withAuditPriority(card) {
  const meta = AUDIT_META[card.id] ?? {};

  return {
    ...card,
    order: meta.order ?? 999,
    blocksPrimerWork: meta.blocksPrimerWork === true,
  };
}

function sortAuditCards(cards = []) {
  return [...safeArray(cards)].sort((left, right) => {
    const leftStatus = left.status === "warning" ? 0 : 1;
    const rightStatus = right.status === "warning" ? 0 : 1;

    if (leftStatus !== rightStatus) {
      return leftStatus - rightStatus;
    }

    if ((left.order ?? 999) !== (right.order ?? 999)) {
      return (left.order ?? 999) - (right.order ?? 999);
    }

    return String(left.title ?? "").localeCompare(String(right.title ?? ""), "hu", {
      sensitivity: "base",
    });
  });
}

function buildAuditCatalogCardFromOfficial(report) {
  const male = report?.genders?.male?.differences ?? {};
  const female = report?.genders?.female?.differences ?? {};

  return withAuditPriority({
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
  });
}

function buildAuditCatalogCardFromWiki(report) {
  const summary = report?.comparison?.summary ?? {};
  const issueCount =
    (summary.disjointNameMatchDayCount ?? 0) +
    (summary.disjointPreferredMatchDayCount ?? 0) +
    (summary.overlapPreferredMatchDayCount ?? 0);

  return withAuditPriority({
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
  });
}

function buildAuditCatalogCardFromLegacy(report) {
  const registrySummary = report?.registryComparison?.summary ?? {};
  const primarySummary = report?.primaryComparison?.summary ?? {};
  const issueCount = (registrySummary.partialCount ?? 0) + (primarySummary.disjointDayCount ?? 0);

  return withAuditPriority({
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
  });
}

function buildAuditCatalogCardFromNormalizer(report) {
  const summary = report?.normalizer?.summary ?? {};
  const issueCount =
    safeArray(report?.comparisons?.legacy?.differences?.preferredMismatchDays).length +
    safeArray(report?.comparisons?.wiki?.differences?.preferredMismatchDays).length;

  return withAuditPriority({
    id: "primer-normalizalo",
    title: AUDIT_META["primer-normalizalo"].title,
    purpose: AUDIT_META["primer-normalizalo"].purpose,
    status: issueCount > 0 ? "warning" : "ok",
    generatedAt: formatTimestampLabel(report?.generatedAt),
    kpis: [
      { label: "Kézi felülvizsgálat", value: summary.manualConflictReview ?? 0 },
      { label: "Feloldatlan napok", value: summary.unresolved ?? 0 },
      {
        label: "Legacy primer mismatch",
        value: safeArray(report?.comparisons?.legacy?.differences?.preferredMismatchDays).length,
      },
    ],
  });
}

function buildAuditCatalogCardFromFinal(report) {
  const validations = report?.validations ?? {};
  const summary = report?.summary ?? {};
  const issueCount =
    (validations.overrideDayCount ?? 0) +
    safeArray(validations.mismatchMonthDays).length +
    (validations.hardFailureCount ?? 0);

  return withAuditPriority({
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
  });
}

function buildAuditCatalogCardFromMissing(report) {
  const summary = report?.summary ?? {};
  const issueCount = (summary.combinedHighlightedCount ?? 0) + (summary.uniqueMissingNameCount ?? 0);

  return withAuditPriority({
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
  });
}

function mergeDayDiffMap(baseRows = [], key) {
  const map = new Map();

  for (const row of safeArray(baseRows)) {
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
  const preferredDiffMap = mergeDayDiffMap(report?.comparison?.differences?.preferredMismatchDays, "preferredDiff");
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
  return safeArray(rows).filter((row) =>
    matchesFreeText(query, [
      row.monthDay,
      row.dateLabel,
      ...safeArray(row.nameDiff?.onlyLegacy),
      ...safeArray(row.nameDiff?.onlyWiki),
      ...safeArray(row.preferredDiff?.onlyLegacy),
      ...safeArray(row.preferredDiff?.onlyWiki),
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
  return safeArray(rows).filter((row) =>
    matchesFreeText(query, [
      row.monthDay,
      row.dateLabel,
      ...safeArray(row.registryDiff?.missing),
      ...safeArray(row.registryDiff?.hits),
      ...safeArray(row.primaryDiff?.onlyLegacyPrimary),
      ...safeArray(row.primaryDiff?.onlyRankedPrimary),
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
  return safeArray(rows).filter((row) =>
    matchesFreeText(query, [
      row.monthDay,
      row.dateLabel,
      ...safeArray(row.nameDiff?.onlyLeft),
      ...safeArray(row.nameDiff?.onlyRight),
      ...safeArray(row.preferredDiff?.onlyLeft),
      ...safeArray(row.preferredDiff?.onlyRight),
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
        {
          label: "Primereltéréses napok",
          value: (summary.overlapPreferredMatchDayCount ?? 0) + (summary.disjointPreferredMatchDayCount ?? 0),
        },
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
      rows: safeArray(report?.registryComparison?.differences?.preferredShortfallDays)
        .slice(0, 20)
        .map((row) => ({
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
        {
          label: "Kemény hibák",
          value: validations.hardFailureCount ?? 0,
          tone: (validations.hardFailureCount ?? 0) > 0 ? "danger" : "neutral",
        },
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
      rows: safeArray(rows).map((row) => ({
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
      rows: safeArray(rows).map((row) => ({
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
      rows: safeArray(rows).map((row) => ({
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
      rows: safeArray(rows).map((row) => ({
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
  return safeArray(groups).map((group) => ({
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
      ...safeArray(row.combinedMissing).flatMap((entry) =>
        safeArray(entry.similarPrimaries).map((similar) => similar.primaryName)
      ),
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
    const status = buildAuditCatalogCardFromWiki(report).status;

    return {
      id: auditId,
      title: AUDIT_META[auditId].title,
      kind: auditId,
      purpose: AUDIT_META[auditId].purpose,
      generatedAt: formatTimestampLabel(report?.generatedAt),
      status,
      metrics: [
        createMetric("Közös napok", summary.sharedDayCount ?? 0),
        createMetric("Néveltéréses napok", safeArray(report?.comparison?.differences?.nameMismatchDays).length, status === "warning" ? "warning" : "ok"),
        createMetric("Primereltérések", safeArray(report?.comparison?.differences?.preferredMismatchDays).length, status === "warning" ? "warning" : "ok"),
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
            summary: { total: 0 },
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

export async function buildAuditCatalogModel() {
  const [officialReport, wikiReport, legacyReport, normalizerReport, finalReport, missingReport] = await Promise.all([
    loadStructuredIfExists(kanonikusUtvonalak.riportok.hivatalosNevjegyzek),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.wikiVsLegacy),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.legacyPrimer),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNormalizalo),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.vegsoPrimer),
    loadStructuredIfExists(kanonikusUtvonalak.riportok.primerNelkulMaradoNevek),
  ]);
  const audits = sortAuditCards([
    buildAuditCatalogCardFromOfficial(officialReport),
    buildAuditCatalogCardFromWiki(wikiReport),
    buildAuditCatalogCardFromLegacy(legacyReport),
    buildAuditCatalogCardFromNormalizer(normalizerReport),
    buildAuditCatalogCardFromFinal(finalReport),
    buildAuditCatalogCardFromMissing(missingReport),
  ]);

  return {
    audits,
    summary: {
      total: audits.length,
      warningCount: audits.filter((audit) => audit.status === "warning").length,
      okCount: audits.filter((audit) => audit.status === "ok").length,
      blockingCount: audits.filter((audit) => audit.blocksPrimerWork === true && audit.status === "warning").length,
    },
  };
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
