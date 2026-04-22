/**
 * web/shared/primer-audit/view-model.mjs
 * Shared primer audit view-model helpers for the web workspace.
 */

const collator = new Intl.Collator("hu", {
  sensitivity: "base",
  numeric: true,
});

export const PRIMER_AUDIT_MODOK = [
  { azonosito: "attekintes", cimke: "Áttekintés" },
  { azonosito: "napok", cimke: "Napok" },
  { azonosito: "nevek", cimke: "Nevek" },
];

export const PRIMER_AUDIT_NAP_SZUROK = [
  {
    azonosito: "akciozhato",
    cimke: "Akciózható",
    leiras: "Helyben nyitott hiányzós, overlayes, override-os vagy eltéréses napok.",
  },
  {
    azonosito: "hianyzos",
    cimke: "Hiányzós napok",
    leiras: "Legalább egy helyben még nyitott hiányzó névvel rendelkező napok.",
  },
  {
    azonosito: "manual-override",
    cimke: "Kézi override napok",
    leiras: "Kézi felülírással vagy override-érintettséggel jelölt napok.",
  },
  {
    azonosito: "helyi",
    cimke: "Helyi kijelölések",
    leiras: "Olyan napok, ahol a helyi overlay ténylegesen hozzáad nevet a közös alaphoz.",
  },
  {
    azonosito: "elteres",
    cimke: "Eltéréses napok",
    leiras: "Validációs mismatch/eltérés miatt kiemelt napok.",
  },
  {
    azonosito: "osszes",
    cimke: "Összes nap",
    leiras: "Az év összes auditált napja.",
  },
];

export const PRIMER_AUDIT_NEV_SZUROK = [
  {
    azonosito: "osszes",
    cimke: "Összes név",
    leiras: "Az összes indexelt név az összes forrásból.",
  },
  {
    azonosito: "hianyzo",
    cimke: "Hiányzó nevek",
    leiras: "Legalább egy napon hiányzóként jelölt nevek.",
  },
  {
    azonosito: "helyi",
    cimke: "Helyi nevek",
    leiras: "Legalább egy napon helyileg kijelölt nevek.",
  },
  {
    azonosito: "vegso",
    cimke: "Végső primerek",
    leiras: "A végső primerkészletben szereplő nevek.",
  },
  {
    azonosito: "rejtett",
    cimke: "Rejtett nevek",
    leiras: "Legalább egy napon rejtettként kezelt nevek.",
  },
  {
    azonosito: "nyers",
    cimke: "Nyers forrásnevek",
    leiras: "A napi nyers névlistákból származó nevek.",
  },
];

export const PRIMER_AUDIT_RENDEZESEK = [
  { azonosito: "relevancia", cimke: "relevancia" },
  { azonosito: "datum", cimke: "dátum" },
  { azonosito: "abc", cimke: "abc" },
  { azonosito: "elofordulas", cimke: "előfordulásszám" },
];

export const SAJAT_PRIMER_FORRAS_PROFILOK = ["default", "legacy", "ranked", "either"];

export const SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK = [
  {
    kulcs: "primarySource",
    cimke: "Primerforrás",
    tipus: "enum",
    ertekek: SAJAT_PRIMER_FORRAS_PROFILOK,
  },
  {
    kulcs: "modifiers.normalized",
    cimke: "Normalizált módosító",
    tipus: "boolean",
  },
  {
    kulcs: "modifiers.ranking",
    cimke: "Rangsor módosító",
    tipus: "boolean",
  },
];

const FORRAS_SORREND = ["final", "legacy", "wiki", "normalized", "ranking", "raw", "hidden", "local"];

const FORRAS_CIMKEK = {
  final: "V",
  legacy: "L",
  wiki: "W",
  normalized: "N",
  ranking: "R",
  raw: "Y",
  hidden: "H",
  local: "P",
};

const FORRAS_CIMKEK_HOSSZU = {
  final: "végső",
  legacy: "legacy",
  wiki: "wiki",
  normalized: "normalizált",
  ranking: "rangsorolt",
  raw: "nyers",
  hidden: "rejtett",
  local: "helyi",
};

function compareMonthDays(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "hu", {
    numeric: true,
  });
}

function uniqueKeepOrder(values) {
  const eredmeny = [];
  const seen = new Set();

  for (const ertek of values ?? []) {
    if (!ertek || seen.has(ertek)) {
      continue;
    }

    seen.add(ertek);
    eredmeny.push(ertek);
  }

  return eredmeny;
}

function getNestedValue(objektum, utvonal) {
  return String(utvonal)
    .split(".")
    .reduce((aktualis, kulcs) => aktualis?.[kulcs], objektum);
}

function setNestedValue(objektum, utvonal, ertek) {
  const kulcsok = String(utvonal).split(".");
  const uj = { ...(objektum ?? {}) };
  let aktualis = uj;

  for (let index = 0; index < kulcsok.length - 1; index += 1) {
    const kulcs = kulcsok[index];
    aktualis[kulcs] = { ...(aktualis[kulcs] ?? {}) };
    aktualis = aktualis[kulcs];
  }

  aktualis[kulcsok[kulcsok.length - 1]] = ertek;
  return uj;
}

export function leptetEnumErteket(ertekek, aktualisErtek, irany) {
  const lista = Array.isArray(ertekek) ? ertekek : [];

  if (lista.length === 0) {
    return aktualisErtek;
  }

  const aktualisIndex = Math.max(0, lista.indexOf(aktualisErtek));
  const kovetkezoIndex = (aktualisIndex + irany + lista.length) % lista.length;
  return lista[kovetkezoIndex];
}

export function leptetSzemelyesPrimerBeallitast(settings, definicio, irany = 1) {
  const aktualisErtek = getNestedValue(settings, definicio.kulcs);

  if (definicio.tipus === "boolean") {
    return setNestedValue(settings, definicio.kulcs, !aktualisErtek);
  }

  if (definicio.tipus === "enum") {
    return setNestedValue(
      settings,
      definicio.kulcs,
      leptetEnumErteket(definicio.ertekek, aktualisErtek, irany)
    );
  }

  return settings;
}

function szemelyesModifierLeiras(kulcs, aktiv) {
  if (kulcs === "modifiers.normalized") {
    return aktiv
      ? "A normalizált hiányok a bontott ICS elsődleges naptárába automatikusan belekerülnek."
      : "A normalizált hiányok nem kerülnek be automatikusan a bontott ICS elsődleges naptárába.";
  }

  if (kulcs === "modifiers.ranking") {
    return aktiv
      ? "A rangsorolt hiányok a bontott ICS elsődleges naptárába automatikusan belekerülnek."
      : "A rangsorolt hiányok nem kerülnek be automatikusan a bontott ICS elsődleges naptárába.";
  }

  return "";
}

export function sajatPrimerForrasCimke(ertek) {
  const cimkek = {
    default: "alap + ranking",
    legacy: "csak legacy",
    ranked: "csak ranking",
    either: "legacy vagy ranking",
  };

  return cimkek[ertek] ?? String(ertek);
}

export function sajatPrimerForrasLeiras(ertek) {
  const leirasok = {
    default:
      "Bontott ICS-nél az audit alap primerlogikája marad: a legacy elsődlegesekhez szükség esetén rangsorolt kiegészítés társul.",
    legacy:
      "Bontott ICS-nél az elsődleges rész csak a legacy kijelölésre támaszkodik. Akkor hasznos, ha a régi, hagyományos névnaprendhez akarsz közelebb maradni.",
    ranked:
      "Bontott ICS-nél az elsődleges rész a rangsorolt névjelölésekre épül. Ez modernebb, gyakorisági alapú fókuszt adhat a naptárnak.",
    either:
      "Bontott ICS-nél a legacy és a rangsorolt primerjelölés uniója használható. Ez bővebb primerlistát eredményezhet, de zajosabb is lehet.",
  };

  return leirasok[ertek] ?? String(ertek);
}

export function szemelyesBeallitasCimke(definicio, beallitasok) {
  const ertek = getNestedValue(beallitasok, definicio.kulcs);

  if (definicio.kulcs === "primarySource") {
    return sajatPrimerForrasCimke(ertek);
  }

  return ertek ? "bekapcsolva" : "kikapcsolva";
}

export function szemelyesBeallitasLeiras(definicio, beallitasok) {
  const ertek = getNestedValue(beallitasok, definicio.kulcs);

  if (definicio.kulcs === "primarySource") {
    return sajatPrimerForrasLeiras(ertek);
  }

  return szemelyesModifierLeiras(definicio.kulcs, ertek === true);
}

export function formataltNevek(values, maxItems = 4) {
  const normalized = (Array.isArray(values) ? values : []).filter(Boolean);

  if (normalized.length === 0) {
    return "—";
  }

  const visible = normalized.slice(0, maxItems).join(" • ");
  const suffix = normalized.length > maxItems ? ` … (+${normalized.length - maxItems})` : "";
  return `${visible}${suffix}`;
}

export function formataltKapcsolodoPrimerek(entries, maxItems = 6) {
  const normalized = (Array.isArray(entries) ? entries : []).map(
    (entry) => `${entry.primaryName} (${entry.relation})`
  );

  return formataltNevek(normalized, maxItems);
}

export function forrasRovidCimke(source) {
  return FORRAS_CIMKEK[source] ?? "?";
}

export function forrasHosszuCimke(source) {
  return FORRAS_CIMKEK_HOSSZU[source] ?? source;
}

export function formatForrasJelzo(sources) {
  const cimkek = uniqueKeepOrder((Array.isArray(sources) ? sources : []).map(forrasRovidCimke)).filter(
    (ertek) => ertek !== "?"
  );

  return cimkek.length > 0 ? `[${cimkek.join("+")}]` : "[?]";
}

export function formatForrasLista(sources) {
  return uniqueKeepOrder((Array.isArray(sources) ? sources : []).map(forrasHosszuCimke)).join(", ") || "—";
}

export function vegsoPrimerForrasCimke(value) {
  const cimkek = {
    "manual-override": "kézi felülírás",
    "legacy-wiki-exact": "legacy = wiki",
    "warning-union": "figyelmeztetéses unió",
  };

  return cimkek[value] ?? (value || "ismeretlen");
}

export function vegsoPrimerForrasSzine(row) {
  if (row?.warning) {
    return "red";
  }

  if (row?.source === "manual-override") {
    return "yellow";
  }

  if (row?.source === "legacy-wiki-exact") {
    return "green";
  }

  return "cyan";
}

export function primerNapSzine(finalPrimaryCount) {
  if (finalPrimaryCount === 1) {
    return "green";
  }

  if (finalPrimaryCount === 2) {
    return "yellow";
  }

  if (finalPrimaryCount >= 3) {
    return "red";
  }

  return undefined;
}

function buildActionScore(day) {
  return (
    (day.counts.missing || 0) * 100 +
    (day.counts.local || 0) * 60 +
    (day.flags.isValidationMismatch ? 45 : 0) +
    (day.flags.isManualOverride ? 35 : 0) +
    (day.warning ? 25 : 0) +
    Math.min(day.counts.hidden || 0, 20)
  );
}

function buildNameScore(name) {
  return (
    (name.counts.missing || 0) * 120 +
    (name.counts.local || 0) * 90 +
    (name.counts.final || 0) * 40 +
    (name.counts.hidden || 0) * 15 +
    (name.counts.raw || 0)
  );
}

function ensureNameNode(map, name) {
  if (!name) {
    return null;
  }

  if (!map.has(name)) {
    map.set(name, {
      name,
      counts: {
        occurrences: 0,
        raw: 0,
        legacy: 0,
        wiki: 0,
        normalized: 0,
        ranking: 0,
        final: 0,
        hidden: 0,
        local: 0,
        missing: 0,
      },
      sourcesPresent: new Set(),
      occurrencesMap: new Map(),
    });
  }

  return map.get(name);
}

function ensureOccurrence(node, day) {
  if (!node.occurrencesMap.has(day.monthDay)) {
    node.occurrencesMap.set(day.monthDay, {
      monthDay: day.monthDay,
      monthName: day.monthName,
      sourceFlags: {
        raw: false,
        legacy: false,
        wiki: false,
        normalized: false,
        ranking: false,
        final: false,
        hidden: false,
        local: false,
      },
      statusFlags: {
        missing: false,
        final: false,
        hidden: false,
        local: false,
        manualOverride: day.flags.isManualOverride,
        validationMismatch: day.flags.isValidationMismatch,
      },
      localSelectable: false,
      similarPrimaries: [],
      missingSources: [],
      finalPrimaryNames: [...(day.commonPreferredNames ?? day.finalPrimaryNames ?? [])],
      effectivePreferredNames: [
        ...(day.effectivePreferredNames ?? day.commonPreferredNames ?? day.finalPrimaryNames ?? []),
      ],
      daySource: day.source ?? null,
    });
  }

  return node.occurrencesMap.get(day.monthDay);
}

function markOccurrenceSource(node, day, name, source) {
  const occurrence = ensureOccurrence(node, day);

  if (!occurrence.sourceFlags[source]) {
    occurrence.sourceFlags[source] = true;
    occurrence.statusFlags.final ||= source === "final";
    occurrence.statusFlags.hidden ||= source === "hidden";
    occurrence.statusFlags.local ||= source === "local";
    node.counts[source] += 1;
    node.sourcesPresent.add(source);
  }

  occurrence.localSelectable ||= source === "local";
  occurrence.statusFlags.final ||= source === "final";
  occurrence.statusFlags.hidden ||= source === "hidden";
  occurrence.statusFlags.local ||= source === "local";
  return occurrence;
}

function markMissingOccurrence(node, day, entry) {
  const occurrence = ensureOccurrence(node, day);

  if (!occurrence.statusFlags.missing) {
    occurrence.statusFlags.missing = true;
    node.counts.missing += 1;
  }

  occurrence.missingSources = uniqueKeepOrder([...(occurrence.missingSources ?? []), ...(entry.sources ?? [])]);
  occurrence.similarPrimaries = uniqueKeepOrder([
    ...(occurrence.similarPrimaries ?? []),
    ...((entry.similarPrimaries ?? []).map((item) => `${item.primaryName} (${item.relation})`) ?? []),
  ]);
  occurrence.localSelectable = true;
  occurrence.statusFlags.local ||= entry.localSelected === true;
}

function finalizeNameNodes(nameMap) {
  return Array.from(nameMap.values())
    .map((node) => {
      const occurrences = Array.from(node.occurrencesMap.values())
        .sort((left, right) => compareMonthDays(left.monthDay, right.monthDay))
        .map((occurrence) => ({
          ...occurrence,
          sourceIds: FORRAS_SORREND.filter((source) => occurrence.sourceFlags[source]),
          statusIds: [
            occurrence.statusFlags.final ? "final" : null,
            occurrence.statusFlags.missing ? "missing" : null,
            occurrence.statusFlags.hidden ? "hidden" : null,
            occurrence.statusFlags.local ? "local" : null,
            occurrence.statusFlags.manualOverride ? "manualOverride" : null,
            occurrence.statusFlags.validationMismatch ? "validationMismatch" : null,
          ].filter(Boolean),
        }));

      const summary = {
        ...node.counts,
        occurrences: occurrences.length,
      };
      const firstMonthDay = occurrences[0]?.monthDay ?? null;
      const sources = FORRAS_SORREND.filter((source) => node.sourcesPresent.has(source));
      const item = {
        name: node.name,
        firstMonthDay,
        counts: summary,
        sources,
        occurrenceCount: occurrences.length,
        occurrences,
        relevanceScore: 0,
      };

      item.relevanceScore = buildNameScore(item);
      return item;
    })
    .sort((left, right) => collator.compare(left.name, right.name));
}

function buildQueues(days) {
  return PRIMER_AUDIT_NAP_SZUROK.map((filter) => ({
    ...filter,
    count: days.filter((day) => dayMatchesFilter(day, filter.azonosito)).length,
  }));
}

function buildMonthSummary(days) {
  const honapMap = new Map();

  for (const day of days) {
    if (!honapMap.has(day.monthName)) {
      honapMap.set(day.monthName, {
        month: day.month,
        monthName: day.monthName,
        total: 0,
        missing: 0,
        local: 0,
        overrides: 0,
        mismatches: 0,
      });
    }

    const honap = honapMap.get(day.monthName);
    honap.total += 1;
    honap.missing += day.flags.hasMissing ? 1 : 0;
    honap.local += day.flags.hasLocal ? 1 : 0;
    honap.overrides += day.flags.isManualOverride ? 1 : 0;
    honap.mismatches += day.flags.isValidationMismatch ? 1 : 0;
  }

  return Array.from(honapMap.values()).sort((left, right) => left.month - right.month);
}

export function buildPrimerAuditViewModel(report, options = {}) {
  const includeNames = options.includeNames !== false;
  const mismatchDays = new Set(report?.validations?.mismatchMonthDays ?? []);
  const overrideDays = new Set(report?.validations?.overrideMonthDays ?? []);
  const days = (report?.months ?? []).flatMap((month) =>
    (month.rows ?? []).map((row) => {
      const commonPreferredNames =
        row.commonPreferredNames?.length > 0
          ? [...row.commonPreferredNames]
          : row.finalPrimaryNames?.length > 0
            ? [...row.finalPrimaryNames]
            : [...(row.sections?.osszefoglalo?.commonPreferredNames ?? row.sections?.osszefoglalo?.preferredNames ?? [])];
      const effectivePreferredNames =
        row.effectivePreferredNames?.length > 0
          ? [...row.effectivePreferredNames]
          : [...(row.sections?.osszefoglalo?.effectivePreferredNames ?? commonPreferredNames)];
      const effectiveMissing =
        row.effectiveMissing?.length >= 0
          ? [...(row.effectiveMissing ?? [])]
          : [...(row.sections?.hianyzok?.effectiveMissing ?? row.combinedMissing ?? [])];
      const locallyResolvedMissing =
        row.locallyResolvedMissing?.length >= 0
          ? [...(row.locallyResolvedMissing ?? [])]
          : [...(row.sections?.hianyzok?.locallyResolvedMissing ?? [])];
      const localAddedPreferredNames =
        row.localAddedPreferredNames?.length >= 0
          ? [...(row.localAddedPreferredNames ?? [])]
          : [...(row.sections?.osszefoglalo?.localAddedPreferredNames ?? row.localSelectedNames ?? [])];
      const counts = {
        final: effectivePreferredNames.length,
        commonFinal: commonPreferredNames.length,
        missing: effectiveMissing.length,
        commonMissing:
          row.combinedMissing?.length ?? row.sections?.hianyzok?.combinedMissing?.length ?? 0,
        resolved: locallyResolvedMissing.length,
        local: localAddedPreferredNames.length,
        hidden: row.hidden?.length ?? row.sections?.forrasok?.hidden?.length ?? 0,
        raw: row.rawNames?.length ?? row.sections?.forrasok?.rawNames?.length ?? 0,
      };
      const flags = {
        hasMissing: counts.missing > 0,
        hasLocal: counts.local > 0,
        isManualOverride: row.source === "manual-override" || overrideDays.has(row.monthDay),
        isValidationMismatch: mismatchDays.has(row.monthDay),
        hasFinal: counts.final > 0,
        hasHidden: counts.hidden > 0,
      };
      const item = {
        ...row,
        monthName: month.monthName,
        commonPreferredNames,
        finalPrimaryNames: effectivePreferredNames,
        finalPrimaryCount: effectivePreferredNames.length,
        effectivePreferredNames,
        effectivePreferredCount: effectivePreferredNames.length,
        effectiveMissing,
        locallyResolvedMissing,
        localAddedPreferredNames,
        counts,
        flags,
        summaryText: formataltNevek(effectivePreferredNames, 4),
        relevanceScore: 0,
      };

      item.relevanceScore = buildActionScore(item);
      return item;
    })
  );

  const nameMap = new Map();
  const names = includeNames
    ? (() => {
        for (const day of days) {
          for (const source of ["raw", "legacy", "wiki", "normalized", "ranking", "hidden"]) {
            const lista = day[source === "raw" ? "rawNames" : source] ?? [];

            for (const name of lista) {
              const node = ensureNameNode(nameMap, name);

              if (!node) {
                continue;
              }

              markOccurrenceSource(node, day, name, source);
            }
          }

          for (const name of day.commonPreferredNames ?? day.finalPrimaryNames ?? []) {
            const node = ensureNameNode(nameMap, name);

            if (!node) {
              continue;
            }

            markOccurrenceSource(node, day, name, "final");
          }

          for (const name of day.localAddedPreferredNames ?? day.localSelectedNames ?? []) {
            const node = ensureNameNode(nameMap, name);

            if (!node) {
              continue;
            }

            const occurrence = markOccurrenceSource(node, day, name, "local");
            occurrence.localSelectable = true;
            occurrence.statusFlags.local = true;
          }

          for (const entry of day.effectiveMissing ?? day.combinedMissing ?? day.sections?.hianyzok?.combinedMissing ?? []) {
            const node = ensureNameNode(nameMap, entry.name);

            if (!node) {
              continue;
            }

            markMissingOccurrence(node, day, entry);
          }

          for (const entry of day.personalEntries ?? day.sections?.szemelyes?.entries ?? []) {
            const node = ensureNameNode(nameMap, entry.name);

            if (!node) {
              continue;
            }

            const occurrence = ensureOccurrence(node, day);
            occurrence.localSelectable ||= entry.localSelectable !== false;
            occurrence.statusFlags.local ||= entry.localSelected === true;

            if (entry.localSelected === true && !occurrence.sourceFlags.local) {
              markOccurrenceSource(node, day, entry.name, "local");
            }

            if ((entry.similarPrimaries ?? []).length > 0) {
              occurrence.similarPrimaries = uniqueKeepOrder([
                ...(occurrence.similarPrimaries ?? []),
                ...entry.similarPrimaries.map((item) => `${item.primaryName} (${item.relation})`),
              ]);
            }
          }
        }

        return finalizeNameNodes(nameMap);
      })()
    : [];
  const queues = buildQueues(days);
  const monthSummary = buildMonthSummary(days);

  return {
    reportPath: report?.reportPath ?? null,
    generatedAt: report?.generatedAt ?? null,
    personalSettings: report?.personal?.settingsSnapshot ?? {
      primarySource: "default",
      modifiers: {
        normalized: false,
        ranking: false,
      },
    },
    summary: {
      ...(report?.summary ?? {}),
      effectiveMissingCount:
        report?.summary?.effectiveMissingCount ?? report?.summary?.combinedMissingCount ?? 0,
      locallyResolvedMissingCount: report?.summary?.locallyResolvedMissingCount ?? 0,
    },
    validations: report?.validations ?? {},
    days,
    dayMap: new Map(days.map((day) => [day.monthDay, day])),
    names,
    nameMap: includeNames ? new Map(names.map((name) => [name.name, name])) : new Map(),
    queues,
    monthSummary,
  };
}

export function dayMatchesFilter(day, filterId) {
  switch (filterId) {
    case "akciozhato":
      return day.flags.hasMissing || day.flags.hasLocal || day.flags.isManualOverride || day.flags.isValidationMismatch;
    case "hianyzos":
      return day.flags.hasMissing;
    case "manual-override":
      return day.flags.isManualOverride;
    case "helyi":
      return day.flags.hasLocal;
    case "elteres":
      return day.flags.isValidationMismatch;
    case "osszes":
    default:
      return true;
  }
}

export function nameMatchesFilter(name, filterId) {
  switch (filterId) {
    case "hianyzo":
      return (name.counts.missing ?? 0) > 0;
    case "helyi":
      return (name.counts.local ?? 0) > 0;
    case "vegso":
      return (name.counts.final ?? 0) > 0;
    case "rejtett":
      return (name.counts.hidden ?? 0) > 0;
    case "nyers":
      return (name.counts.raw ?? 0) > 0;
    case "osszes":
    default:
      return true;
  }
}

function dayMatchesQuery(day, query) {
  if (!query) {
    return true;
  }

  const normalized = String(query).trim().toLocaleLowerCase("hu");
  const haystack = [
    day.monthDay,
    day.monthName,
    ...(day.finalPrimaryNames ?? []),
    ...(day.rawNames ?? []),
    ...(day.hidden ?? []),
    ...(day.localSelectedNames ?? []),
    ...(day.combinedMissing ?? []).map((entry) => entry.name),
  ]
    .join(" ")
    .toLocaleLowerCase("hu");

  return haystack.includes(normalized);
}

function nameMatchesQuery(name, query) {
  if (!query) {
    return true;
  }

  return name.name.toLocaleLowerCase("hu").includes(String(query).trim().toLocaleLowerCase("hu"));
}

export function sortPrimerAuditNapok(days, sortId) {
  return [...(days ?? [])].sort((left, right) => {
    if (sortId === "datum") {
      return compareMonthDays(left.monthDay, right.monthDay);
    }

    if (sortId === "abc") {
      return (
        collator.compare(left.summaryText || left.monthDay, right.summaryText || right.monthDay) ||
        compareMonthDays(left.monthDay, right.monthDay)
      );
    }

    if (sortId === "elofordulas") {
      return (
        (right.counts.raw ?? 0) - (left.counts.raw ?? 0) ||
        (right.counts.hidden ?? 0) - (left.counts.hidden ?? 0) ||
        compareMonthDays(left.monthDay, right.monthDay)
      );
    }

    return right.relevanceScore - left.relevanceScore || compareMonthDays(left.monthDay, right.monthDay);
  });
}

export function sortPrimerAuditNevek(names, sortId) {
  return [...(names ?? [])].sort((left, right) => {
    if (sortId === "datum") {
      return compareMonthDays(left.firstMonthDay, right.firstMonthDay) || collator.compare(left.name, right.name);
    }

    if (sortId === "abc") {
      return collator.compare(left.name, right.name);
    }

    if (sortId === "elofordulas") {
      return (
        (right.occurrenceCount ?? 0) - (left.occurrenceCount ?? 0) ||
        collator.compare(left.name, right.name)
      );
    }

    return right.relevanceScore - left.relevanceScore || collator.compare(left.name, right.name);
  });
}

export function visiblePrimerAuditNapok(viewModel, allapot) {
  return sortPrimerAuditNapok(
    (viewModel?.days ?? []).filter(
      (day) => dayMatchesFilter(day, allapot?.dayFilterId ?? "akciozhato") && dayMatchesQuery(day, allapot?.dayQuery ?? "")
    ),
    allapot?.daySortId ?? "relevancia"
  );
}

export function visiblePrimerAuditNevek(viewModel, allapot) {
  return sortPrimerAuditNevek(
    (viewModel?.names ?? []).filter(
      (name) => nameMatchesFilter(name, allapot?.nameFilterId ?? "osszes") && nameMatchesQuery(name, allapot?.nameQuery ?? "")
    ),
    allapot?.nameSortId ?? "relevancia"
  );
}

export function buildPrimerAuditOsszegzesSorok(viewModel) {
  return [
    `Napok: ${viewModel.summary?.rowCount ?? 0} • Közös hiányzók: ${viewModel.summary?.combinedMissingCount ?? 0} • Helyben nyitott hiányzók: ${viewModel.summary?.effectiveMissingCount ?? 0}`,
    `Helyi feloldások: ${viewModel.summary?.locallyResolvedMissingCount ?? 0} • Kézi override napok: ${viewModel.summary?.overrideDayCount ?? 0} • Személyes primerforrás: ${sajatPrimerForrasCimke(
      viewModel.personalSettings?.primarySource ?? "default"
    )}`,
  ];
}

export function statusCimkekNaphoz(day) {
  return [
    day.flags.hasMissing ? `hiányzó: ${day.counts.missing}` : null,
    day.flags.hasLocal ? `helyi: ${day.counts.local}` : null,
    day.flags.isManualOverride ? "kézi" : null,
    day.flags.isValidationMismatch ? "eltérés" : null,
    day.flags.hasHidden ? `rejtett: ${day.counts.hidden}` : null,
  ].filter(Boolean);
}

export function statusCimkekNevhez(name) {
  return [
    name.counts.missing > 0 ? `hiányzó: ${name.counts.missing}` : null,
    name.counts.local > 0 ? `helyi: ${name.counts.local}` : null,
    name.counts.final > 0 ? `végső: ${name.counts.final}` : null,
    name.counts.hidden > 0 ? `rejtett: ${name.counts.hidden}` : null,
    `napok: ${name.occurrenceCount}`,
  ].filter(Boolean);
}

export function formatOccurrenceStatus(occurrence) {
  const statusok = [
    occurrence.statusFlags.final ? "végső" : null,
    occurrence.statusFlags.missing ? "hiányzó" : null,
    occurrence.statusFlags.hidden ? "rejtett" : null,
    occurrence.statusFlags.local ? "helyi" : null,
    occurrence.statusFlags.manualOverride ? "kézi" : null,
    occurrence.statusFlags.validationMismatch ? "eltérés" : null,
  ].filter(Boolean);

  return statusok.join(", ") || "—";
}

export function formatOccurrenceSources(occurrence) {
  return formatForrasLista(occurrence.sourceIds ?? []);
}

export function formatSearchPrompt(target) {
  if (target === "napok") {
    return "Napi keresés";
  }

  if (target === "nevek") {
    return "Névkeresés";
  }

  return "Keresés";
}
