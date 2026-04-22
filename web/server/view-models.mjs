import path from "node:path";
import {
  betoltHelyiPrimerBeallitasokat,
} from "../../domainek/primer/helyi-primer-felulirasok.mjs";
import {
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
import {
  buildAuditCatalogModel,
  buildAuditDetailMonthModel,
  buildAuditDetailSummaryModel,
} from "./audit-projections.mjs";

export {
  buildAuditCatalogModel,
  buildAuditDetailMonthModel,
  buildAuditDetailSummaryModel,
};

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


function createMetric(label, value, tone = "neutral") {
  return {
    label,
    value,
    tone,
  };
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

function areSameNameSets(left = [], right = []) {
  const normalize = (values) =>
    Array.from(new Set(safeArray(values).map((value) => String(value ?? "").trim()).filter(Boolean))).sort(
      (a, b) => a.localeCompare(b, "hu", { sensitivity: "base" })
    );

  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}

function buildPrimerEvidence(day) {
  const monthDay = String(day?.monthDay ?? "").trim();
  const query = encodeURIComponent(monthDay);
  const links = [
    {
      id: "vegso-primer",
      label: "Végső primer audit",
      detail:
        day?.flags?.isValidationMismatch || day?.flags?.isManualOverride
          ? "A végső primerdöntés és az eltéréskezelés részletei."
          : `Forrás: ${day?.source ?? "—"} • effektív: ${listPreview(day?.effectivePreferredNames, 3)}`,
      to: `/auditok?audit=vegso-primer&query=${query}`,
    },
  ];

  if (day?.flags?.hasMissing) {
    links.push({
      id: "primer-nelkul-marado-nevek",
      label: "Primer nélkül maradó nevek",
      detail: `${safeArray(day?.effectiveMissing).length} nyitott hiányzó név ezen a napon.`,
      to: `/auditok?audit=primer-nelkul-marado-nevek&query=${query}`,
    });
  }

  if (safeArray(day?.normalized).length > 0 || safeArray(day?.ranking).length > 0) {
    links.push({
      id: "primer-normalizalo",
      label: "Primer normalizáló",
      detail: `Normalizált: ${safeArray(day?.normalized).length} • rangsor: ${safeArray(day?.ranking).length}`,
      to: `/auditok?audit=primer-normalizalo&query=${query}`,
    });
  }

  if (!areSameNameSets(day?.legacy, day?.wiki)) {
    links.push({
      id: "wiki-vs-legacy",
      label: "Wiki vs legacy",
      detail: `Legacy: ${safeArray(day?.legacy).length} • wiki: ${safeArray(day?.wiki).length}`,
      to: `/auditok?audit=wiki-vs-legacy&query=${query}`,
    });
  }

  return links;
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
    evidence: buildPrimerEvidence(day),
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

export async function buildAuditDetailModel(auditId) {
  return buildAuditDetailSummaryModel(auditId);
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
      auditBlockingCount: audits.summary.blockingCount ?? 0,
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
          createMetric(
            "Primerblokkoló",
            audits.summary.blockingCount ?? 0,
            (audits.summary.blockingCount ?? 0) > 0 ? "danger" : "ok"
          ),
          createMetric("Figyelmet kér", audits.summary.warningCount, audits.summary.warningCount > 0 ? "warning" : "ok"),
          createMetric("Rendben", audits.summary.okCount, "ok"),
        ],
        items: warningAudits.map((audit) => ({
          id: audit.id,
          title: audit.title,
          status: audit.status,
          blocksPrimerWork: audit.blocksPrimerWork === true,
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
