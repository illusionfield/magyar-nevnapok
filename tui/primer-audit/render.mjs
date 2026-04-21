/**
 * tui/primer-audit/render.mjs
 * Megjelenítési segédek és komponensek a primer audit TUI-hoz.
 */

import React from "react";
import { Box, Text } from "ink";
import { Spinner } from "@inkjs/ui";
import {
  PRIMER_AUDIT_MODOK,
  PRIMER_AUDIT_NAP_SZUROK,
  PRIMER_AUDIT_NEV_SZUROK,
  PRIMER_AUDIT_RENDEZESEK,
  SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK,
  formataltKapcsolodoPrimerek,
  formataltNevek,
  formatForrasJelzo,
  formatForrasLista,
  formatOccurrenceSources,
  formatOccurrenceStatus,
  formatSearchPrompt,
  nameMatchesFilter,
  primerNapSzine,
  sajatPrimerForrasCimke,
  statusCimkekNevhez,
  szemelyesBeallitasCimke,
  szemelyesBeallitasLeiras,
  vegsoPrimerForrasCimke,
  vegsoPrimerForrasSzine,
} from "./view-model.mjs";
import {
  getSelectedDay,
  getSelectedName,
  getSelectedOverviewQueue,
  getSelectedSettingsDefinicio,
  getVisibleDayRows,
  getVisibleNameRows,
} from "./state.mjs";

const e = React.createElement;

function safeWidth(width, fallback = 80) {
  return Math.max(20, Number(width) || fallback);
}

function egysorosSzoveg(value, maxWidth) {
  const szoveg = String(value ?? "");
  const limit = Math.max(8, Number(maxWidth) || 0);

  if (szoveg.length <= limit) {
    return szoveg;
  }

  return `${szoveg.slice(0, Math.max(0, limit - 2)).trimEnd()}…`;
}

function kijeloltAblak(values, activeIndex, windowSize = 8) {
  const lista = Array.isArray(values) ? values : [];

  if (lista.length === 0) {
    return {
      elemek: [],
      before: 0,
      after: 0,
    };
  }

  const size = Math.max(1, Math.min(windowSize, lista.length));
  const half = Math.floor(size / 2);
  const start = Math.max(0, Math.min(lista.length - size, activeIndex - half));
  const end = start + size;

  return {
    elemek: lista.slice(start, end),
    before: start,
    after: Math.max(0, lista.length - end),
  };
}

function renderAblakJelzes(prefix, count, key) {
  if (count <= 0) {
    return null;
  }

  return e(Text, { key, dimColor: true }, `${prefix} … (+${count})`);
}

function renderStatusLine({ folyamatban, uzenet, uzenetTipus }) {
  if (folyamatban) {
    return e(Box, { marginTop: 1 }, e(Spinner, { label: "Művelet folyamatban..." }));
  }

  if (!uzenet) {
    return null;
  }

  return e(
    Text,
    {
      color:
        uzenetTipus === "hiba" ? "red" : uzenetTipus === "siker" ? "green" : "cyan",
    },
    uzenet
  );
}

function formatRovidIdobelyeg(isoString) {
  if (!isoString) {
    return "—";
  }

  return String(isoString).replace("T", " ").slice(0, 16);
}

function buildHeaderSummarySorok(viewModel, terminalWidth) {
  const compact = terminalWidth < 110;
  const primarySource = sajatPrimerForrasCimke(viewModel.personalSettings?.primarySource ?? "default");

  if (compact) {
    return [
      `Napok ${viewModel.summary?.rowCount ?? 0} • Közös hiány ${viewModel.summary?.combinedMissingCount ?? 0} • Helyi nyitott ${viewModel.summary?.effectiveMissingCount ?? 0}`,
      `Feloldva ${viewModel.summary?.locallyResolvedMissingCount ?? 0} • Overlay ${viewModel.summary?.localSelectedCount ?? 0} • Forrás: ${primarySource}`,
    ];
  }

  return [
    `Napok: ${viewModel.summary?.rowCount ?? 0} • Közös hiányzók: ${viewModel.summary?.combinedMissingCount ?? 0} • Helyben nyitott hiányzók: ${viewModel.summary?.effectiveMissingCount ?? 0}`,
    `Helyi feloldások: ${viewModel.summary?.locallyResolvedMissingCount ?? 0} • Helyi overlay nevek: ${viewModel.summary?.localSelectedCount ?? 0} • Személyes primerforrás: ${primarySource}`,
  ];
}

function dayEffectiveNames(day) {
  return day.effectivePreferredNames ?? day.finalPrimaryNames ?? [];
}

function dayCommonNames(day) {
  return day.commonPreferredNames ?? day.finalPrimaryNames ?? [];
}

function dayLocalOverlayNames(day) {
  return day.localAddedPreferredNames ?? day.localSelectedNames ?? [];
}

function dayEffectiveMissingEntries(day) {
  return day.effectiveMissing ?? day.sections?.hianyzok?.effectiveMissing ?? day.combinedMissing ?? [];
}

function dayResolvedMissingEntries(day) {
  return day.locallyResolvedMissing ?? day.sections?.hianyzok?.locallyResolvedMissing ?? [];
}

function honapOsszegzesSor(honap, width) {
  if (width < 44) {
    return `${honap.monthName}: Ö ${honap.total} • Hi ${honap.missing} • He ${honap.local} • K ${honap.overrides} • E ${honap.mismatches}`;
  }

  return `${honap.monthName}: nap ${honap.total} • helyben nyitott ${honap.missing} • overlay ${honap.local} • kézi ${honap.overrides} • eltérés ${honap.mismatches}`;
}

function renderKartyaRacs({ title, items, activeId, width, keyPrefix, emptyText }) {
  const lista = Array.isArray(items) ? items : [];
  const racsSzelesseg = safeWidth(width, 48);
  const columns = racsSzelesseg < 48 ? 1 : 2;
  const cellWidth = Math.max(18, Math.floor((racsSzelesseg - (columns - 1) * 2) / columns));
  const sorok = [];

  for (let index = 0; index < lista.length; index += columns) {
    sorok.push(lista.slice(index, index + columns));
  }

  return [
    e(Text, { key: `${keyPrefix}-title`, bold: true }, title),
    ...(sorok.length > 0
      ? sorok.map((sor, sorIndex) =>
          e(
            Box,
            { key: `${keyPrefix}-row-${sorIndex}` },
            ...sor.map((item, itemIndex) => {
              const aktiv = item.azonosito === activeId;
              const label = `${aktiv ? "❯ " : "  "}${item.cimke}${typeof item.count === "number" ? ` • ${item.count}` : ""}`;

              return e(
                Box,
                {
                  key: `${keyPrefix}-cell-${item.azonosito}`,
                  width: cellWidth,
                  marginRight: itemIndex < sor.length - 1 ? 2 : 0,
                },
                e(Text, { color: aktiv ? "cyan" : undefined }, egysorosSzoveg(label, cellWidth))
              );
            })
          )
        )
      : [e(Text, { key: `${keyPrefix}-empty`, dimColor: true }, emptyText ?? "Nincs elérhető elem.")]),
  ];
}

function renderHelpOverlay(state) {
  const kozos = [
    "Tab vagy 1–3: módváltás",
    "↑/↓: mozgás az aktív listában",
    "f: szűrőváltás",
    "s: rendezésváltás",
    "/: keresés",
    "b: helyi primer-beállítások",
    "?: súgó",
    "r: riportfrissítés",
    "g: ICS-generálás",
    "Esc vagy v: vissza",
    "q: kilépés",
  ];
  const modSpecifikus =
    state.aktivMod === "attekintes"
      ? ["Enter: ugrás a kijelölt queue napi nézetére"]
      : state.aktivMod === "napok"
        ? [
            "←/→: váltás a naplista és a helyi műveletek között",
            "Enter: nyers/rejtett blokk kibontása vagy összecsukása",
            "Space: kézi helyi kijelölés kapcsolása",
          ]
        : [
            "←/→: váltás a névlista és az előfordulások között",
            "Enter: előfordulás-lista megnyitása, majd ugrás a napi nézetre",
          ];

  return e(
    Box,
    {
      marginTop: 1,
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "cyan",
      paddingX: 1,
    },
    e(Text, { bold: true }, "Primer audit – helyi súgó"),
    ...kozos.map((sor, index) => e(Text, { key: `help-common-${index}` }, `• ${sor}`)),
    e(Text, { bold: true }, ""),
    ...modSpecifikus.map((sor, index) => e(Text, { key: `help-mode-${index}` }, `• ${sor}`))
  );
}

function renderSearchBar(state) {
  if (!state.search.aktiv) {
    return null;
  }

  return e(
    Box,
    {
      marginTop: 1,
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "yellow",
      paddingX: 1,
    },
    e(Text, { bold: true }, `${formatSearchPrompt(state.search.target)}: ${state.search.draft || ""}`),
    e(Text, { dimColor: true }, "Enter: keresés rögzítése • Backspace: törlés • Esc: mégse")
  );
}

function renderSettingsDrawer(viewModel, state) {
  if (!state.settingsDrawerOpen) {
    return null;
  }

  const definicio = getSelectedSettingsDefinicio(state);

  return e(
    Box,
    {
      marginTop: 1,
      flexDirection: "column",
      borderStyle: "round",
      borderColor: "magenta",
      paddingX: 1,
    },
    e(Text, { bold: true }, "Helyi primer-beállítások"),
    e(
      Text,
      { dimColor: true },
      `Aktív primerforrás: ${sajatPrimerForrasCimke(viewModel.personalSettings?.primarySource ?? "default")}`
    ),
    ...SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK.map((item, index) =>
      e(
        Text,
        {
          key: `drawer-setting-${item.kulcs}`,
          color: index === state.settingsIndex ? "cyan" : undefined,
        },
        `${index === state.settingsIndex ? "❯ " : "  "}${item.cimke}: ${szemelyesBeallitasCimke(item, viewModel.personalSettings ?? {})}`
      )
    ),
    e(
      Text,
      { dimColor: true },
      definicio ? szemelyesBeallitasLeiras(definicio, viewModel.personalSettings ?? {}) : "Nincs kijelölt beállítás."
    ),
    e(
      Text,
      { dimColor: true },
      "↑/↓: kijelölés • ←/→ vagy Space: értékváltás • b: drawer bezárása • a bontott ICS ezt a véglegesítést használja"
    )
  );
}

function renderOverview(viewModel, state, bodyRows, terminalWidth) {
  const queue = getSelectedOverviewQueue(viewModel, state);
  const leftWidth = Math.min(44, Math.max(28, Math.floor(terminalWidth * 0.38)));
  const rightWidth = Math.max(28, terminalWidth - leftWidth - 4);
  const honapWindow = kijeloltAblak(viewModel.monthSummary ?? [], 0, Math.max(3, bodyRows - 5));

  return e(
    Box,
    { marginTop: 1 },
    e(
      Box,
      { flexDirection: "column", width: leftWidth, marginRight: 2 },
      ...renderKartyaRacs({
        title: "Queue-kártyák",
        items: viewModel.queues ?? [],
        activeId: queue?.azonosito ?? null,
        width: leftWidth,
        keyPrefix: "overview-queues",
      }),
      e(Text, { bold: true }, "Kijelölt queue"),
      queue
        ? e(Text, null, egysorosSzoveg(`${queue.cimke} • ${queue.count} nap • ${queue.leiras}`, leftWidth))
        : e(Text, { dimColor: true }, "Nincs kijelölt queue."),
      e(Text, { dimColor: true }, "Enter: ugrás a kijelölt queue napi nézetére")
    ),
    e(
      Box,
      { flexDirection: "column", width: rightWidth },
      e(Text, { bold: true }, "Havi bontás"),
      ...honapWindow.elemek.map((honap) =>
        e(
          Text,
          { key: `overview-month-${honap.month}` },
          egysorosSzoveg(honapOsszegzesSor(honap, rightWidth), rightWidth)
        )
      ),
      renderAblakJelzes("További hónapok", honapWindow.after, "overview-months-after")
    )
  );
}

function renderDayRow(day, selected, width) {
  const statusok = [
    day.flags.hasMissing ? `H${day.counts.missing}` : null,
    (day.counts.resolved ?? 0) > 0 ? `F${day.counts.resolved}` : null,
    day.flags.hasLocal ? `P${day.counts.local}` : null,
    day.flags.isManualOverride ? "K" : null,
    day.flags.isValidationMismatch ? "E" : null,
    day.flags.hasHidden ? `R${day.counts.hidden}` : null,
  ]
    .filter(Boolean)
    .join(" • ");
  const line = `${selected ? "❯ " : "  "}${day.monthDay} • ${formataltNevek(dayEffectiveNames(day), 2)}${statusok ? ` • ${statusok}` : ""}`;

  return e(
    Text,
    { color: selected ? "cyan" : primerNapSzine(day.finalPrimaryCount) },
    egysorosSzoveg(line, width)
  );
}

function renderDayDetail(day, state, bodyRows, width) {
  if (!day) {
    return e(Text, { dimColor: true }, "Nincs kijelölt nap.");
  }

  const detailWidth = safeWidth(width, 48);
  const personalEntries = day.sections?.szemelyes?.entries ?? day.personalEntries ?? [];
  const commonMissingEntries = day.sections?.hianyzok?.combinedMissing ?? day.combinedMissing ?? [];
  const effectiveMissingEntries = dayEffectiveMissingEntries(day);
  const locallyResolvedMissing = dayResolvedMissingEntries(day);
  const personalEntry = personalEntries[state.dayPersonalIndex] ?? null;
  const compact = bodyRows < 13 || detailWidth < 54;
  const fixedRows = compact ? 8 : 12;
  const selectedRows = personalEntry ? 1 : 0;
  const personalWindowSize = Math.max(1, bodyRows - fixedRows - selectedRows);
  const personalWindow = kijeloltAblak(personalEntries, state.dayPersonalIndex, personalWindowSize);
  const rawPreviewCount = state.rawExpanded ? Math.max(4, bodyRows - 6) : compact ? 3 : 5;
  const rawPreview = formataltNevek(day.rawNames ?? [], rawPreviewCount);
  const hiddenPreview = formataltNevek(day.hidden ?? [], rawPreviewCount);

  if (compact) {
    return e(
      Box,
      { flexDirection: "column", flexGrow: 1 },
      e(Text, { bold: true }, egysorosSzoveg(`${day.monthName} • ${day.monthDay} • ${vegsoPrimerForrasCimke(day.source)}`, detailWidth)),
      e(Text, { color: vegsoPrimerForrasSzine(day) }, egysorosSzoveg(`Közös alap: ${formataltNevek(dayCommonNames(day), 4)}`, detailWidth)),
      e(Text, { color: "green" }, egysorosSzoveg(`Helyi overlay: ${formataltNevek(dayLocalOverlayNames(day), 4)}`, detailWidth)),
      e(Text, null, egysorosSzoveg(`Eredő helyi: ${formataltNevek(dayEffectiveNames(day), 4)}`, detailWidth)),
      e(Text, null, egysorosSzoveg(`Közös hiány: ${commonMissingEntries.length} • Feloldva: ${locallyResolvedMissing.length} • Nyitott: ${effectiveMissingEntries.length}`, detailWidth)),
      e(Text, null, egysorosSzoveg(`Legacy/Wiki: ${formataltNevek(day.legacy, 3)} // ${formataltNevek(day.wiki, 3)}`, detailWidth)),
      e(Text, null, egysorosSzoveg(`Norm/Rang: ${formataltNevek(day.normalized, 3)} // ${formataltNevek(day.ranking, 3)}`, detailWidth)),
      e(Text, null, egysorosSzoveg(`Nyitott hiányzók: ${effectiveMissingEntries.length > 0 ? effectiveMissingEntries.map((entry) => entry.name).join(" • ") : "—"}`, detailWidth)),
      e(Text, null, egysorosSzoveg(`Nyers/Rejtett: ${rawPreview} // ${hiddenPreview}`, detailWidth)),
      ...(personalWindow.elemek.length > 0
        ? personalWindow.elemek.map((entry, index) => {
            const globalIndex = personalWindow.before + index;
            const aktiv = state.dayPanel === "szemelyes" && globalIndex === state.dayPersonalIndex;
            const color = entry.localSelected ? "green" : aktiv ? "cyan" : undefined;

            return e(
              Text,
              {
                key: `day-personal-compact-${day.monthDay}-${entry.name}`,
                color,
              },
              egysorosSzoveg(
                `${aktiv ? "❯" : " "} ${entry.localSelected ? "[x]" : "[ ]"} ${entry.name} ${formatForrasJelzo(entry.sources)}`,
                detailWidth
              )
            );
          })
        : [e(Text, { key: "day-personal-compact-empty", dimColor: true }, "Nincs helyi jelölt.")]),
      personalEntry
        ? e(
            Text,
            { dimColor: true },
            egysorosSzoveg(
              `Kijelölt: ${personalEntry.name}${personalEntry.highlight ? ` • ${formataltKapcsolodoPrimerek(personalEntry.similarPrimaries, 2)}` : ""}`,
              detailWidth
            )
          )
        : null
    );
  }

  return e(
    Box,
      { flexDirection: "column", flexGrow: 1 },
      e(Text, { bold: true }, egysorosSzoveg(`${day.monthName} • ${day.monthDay}`, detailWidth)),
      e(
        Text,
        { color: vegsoPrimerForrasSzine(day) },
        egysorosSzoveg(
          `Közös alap: ${formataltNevek(dayCommonNames(day), 6)} • ${vegsoPrimerForrasCimke(day.source)}${day.flags.isValidationMismatch ? " • eltérés" : ""}`,
          detailWidth
        )
      ),
    e(Text, { color: "green" }, egysorosSzoveg(`Helyi overlay: ${formataltNevek(dayLocalOverlayNames(day), 6)}`, detailWidth)),
    e(Text, null, egysorosSzoveg(`Eredő helyi primerek: ${formataltNevek(dayEffectiveNames(day), 6)}`, detailWidth)),
    e(Text, null, egysorosSzoveg(`Közös hiányzók: ${commonMissingEntries.length} • Helyben feloldva: ${locallyResolvedMissing.length} • Helyben nyitott: ${effectiveMissingEntries.length}`, detailWidth)),
    e(Text, null, egysorosSzoveg(`Legacy/Wiki: ${formataltNevek(day.legacy, 4)} // ${formataltNevek(day.wiki, 4)}`, detailWidth)),
    e(Text, null, egysorosSzoveg(`Normalizált/Rangsorolt: ${formataltNevek(day.normalized, 4)} // ${formataltNevek(day.ranking, 4)}`, detailWidth)),
    e(Text, null, egysorosSzoveg(`Nyitott hiányzók: ${effectiveMissingEntries.length > 0 ? effectiveMissingEntries.map((entry) => `${entry.name} ${formatForrasJelzo(entry.sources)}`).join(" • ") : "—"}`, detailWidth)),
    e(Text, null, egysorosSzoveg(`Helyben feloldott hiányzók: ${locallyResolvedMissing.length > 0 ? locallyResolvedMissing.map((entry) => `${entry.name} ${formatForrasJelzo(entry.sources)}`).join(" • ") : "—"}`, detailWidth)),
    e(Text, null, egysorosSzoveg(`Nyers: ${rawPreview}`, detailWidth)),
    e(Text, { color: (day.hidden?.length ?? 0) > 0 ? "yellow" : undefined }, egysorosSzoveg(`Rejtett: ${hiddenPreview}`, detailWidth)),
    e(Text, { dimColor: true }, "Enter: hosszabb nyers/rejtett előnézet"),
    e(Text, { bold: true }, "Helyi műveletek"),
    renderAblakJelzes("Felül", personalWindow.before, `day-personal-before-${day.monthDay}`),
    ...(personalWindow.elemek.length > 0
      ? personalWindow.elemek.map((entry, index) => {
          const globalIndex = personalWindow.before + index;
          const aktiv = state.dayPanel === "szemelyes" && globalIndex === state.dayPersonalIndex;
          const color = entry.localSelected ? "green" : aktiv ? "cyan" : undefined;

          return e(
            Text,
            {
              key: `day-personal-${day.monthDay}-${entry.name}`,
              color,
            },
            egysorosSzoveg(
              `${aktiv ? "❯" : " "} ${entry.localSelected ? "[x]" : "[ ]"} ${entry.name} ${formatForrasJelzo(entry.sources)}${entry.manualOnly ? " [kézi]" : ""}`,
              detailWidth
            )
          );
        })
      : [e(Text, { key: "day-personal-empty", dimColor: true }, "Nincs helyi jelölt ezen a napon.")]),
    renderAblakJelzes("Alul", personalWindow.after, `day-personal-after-${day.monthDay}`),
    e(Text, { dimColor: true }, egysorosSzoveg(`Aktív panel: ${state.dayPanel === "lista" ? "naplista" : "helyi műveletek"} • ←/→: panelváltás • Space: kézi helyi kapcsolás`, detailWidth)),
    personalEntry
      ? e(
          Text,
          { dimColor: true },
          egysorosSzoveg(
            `Kijelölt név: ${personalEntry.name} • ${personalEntry.highlight ? `kapcsolódó primerek: ${formataltKapcsolodoPrimerek(personalEntry.similarPrimaries, 3)}` : `forrás: ${formatForrasLista(personalEntry.sources)}`}`,
            detailWidth
          )
        )
      : null
  );
}

function renderDays(viewModel, state, bodyRows, terminalWidth) {
  const napok = getVisibleDayRows(viewModel, state);
  const day = getSelectedDay(viewModel, state);
  const aktivSzuro = PRIMER_AUDIT_NAP_SZUROK.find((item) => item.azonosito === state.dayFilterId);
  const aktivRendezes = PRIMER_AUDIT_RENDEZESEK.find((item) => item.azonosito === state.daySortId);
  const leftWidth = Math.min(48, Math.max(30, Math.floor(terminalWidth * 0.42)));
  const detailWidth = Math.max(28, terminalWidth - leftWidth - 4);
  const listWindowRows = Math.max(4, bodyRows - 5);
  const window = kijeloltAblak(napok, state.dayIndex, listWindowRows);

  return e(
    Box,
    { marginTop: 1 },
    e(
      Box,
      { flexDirection: "column", width: leftWidth, marginRight: 2 },
      ...renderKartyaRacs({
        title: "Queue-kártyák",
        items: viewModel.queues ?? [],
        activeId: state.dayFilterId,
        width: leftWidth,
        keyPrefix: "day-queues",
      }),
      e(
        Text,
        { dimColor: true },
        egysorosSzoveg(
          `Szűrő: ${aktivSzuro?.cimke ?? "—"} • Rendezés: ${aktivRendezes?.cimke ?? "—"} • Találat: ${napok.length}${state.dayQuery ? ` • Keresés: ${state.dayQuery}` : ""}`,
          leftWidth
        )
      ),
      renderAblakJelzes("Felül", window.before, "day-list-before"),
      ...(window.elemek.length > 0
        ? window.elemek.map((item, index) => {
            const globalIndex = window.before + index;
            return e(
              Box,
              { key: `day-row-${item.monthDay}` },
              renderDayRow(item, globalIndex === state.dayIndex && state.dayPanel === "lista", leftWidth)
            );
          })
        : [e(Text, { key: "days-empty", dimColor: true }, "A jelenlegi szűrőhöz nincs találat.")]),
      renderAblakJelzes("Alul", window.after, "day-list-after")
    ),
    renderDayDetail(day, state, bodyRows, detailWidth)
  );
}

function renderNameRow(name, selected, width) {
  const line = `${selected ? "❯ " : "  "}${name.name} • ${statusCimkekNevhez(name).join(" • ")}`;
  return e(Text, { color: selected ? "cyan" : undefined }, egysorosSzoveg(line, width));
}

function renderNameDetail(name, state, bodyRows, width) {
  if (!name) {
    return e(Text, { dimColor: true }, "Nincs kijelölt név.");
  }

  const detailWidth = safeWidth(width, 48);
  const occurrence = name.occurrences?.[state.nameOccurrenceIndex] ?? null;
  const compact = bodyRows < 12 || detailWidth < 54;
  const fixedRows = compact ? 5 : 8;
  const selectedRows = occurrence ? 1 : 0;
  const occurrenceWindow = kijeloltAblak(
    name.occurrences ?? [],
    state.nameOccurrenceIndex,
    Math.max(1, bodyRows - fixedRows - selectedRows)
  );

  if (compact) {
    return e(
      Box,
      { flexDirection: "column", flexGrow: 1 },
      e(Text, { bold: true }, egysorosSzoveg(name.name, detailWidth)),
      e(Text, null, egysorosSzoveg(`Források: ${formatForrasLista(name.sources)}`, detailWidth)),
      e(Text, null, egysorosSzoveg(`Napok: ${name.occurrenceCount} • Hiányzó: ${name.counts.missing} • Helyi overlay: ${name.counts.local} • Közös végső: ${name.counts.final}`, detailWidth)),
      ...(occurrenceWindow.elemek.length > 0
        ? occurrenceWindow.elemek.map((item, index) => {
            const globalIndex = occurrenceWindow.before + index;
            const aktiv = state.namePanel === "elofordulasok" && globalIndex === state.nameOccurrenceIndex;

            return e(
              Text,
              {
                key: `name-occurrence-compact-${name.name}-${item.monthDay}`,
                color: aktiv ? "cyan" : undefined,
              },
              egysorosSzoveg(`${aktiv ? "❯ " : "  "}${item.monthDay} • ${formatOccurrenceStatus(item)}`, detailWidth)
            );
          })
        : [e(Text, { key: "name-occurrence-compact-empty", dimColor: true }, "Nincs naphoz kötött előfordulás.")]),
      occurrence
        ? e(
            Text,
            { dimColor: true },
            egysorosSzoveg(`Kijelölt: ${occurrence.monthDay} • helyi eredő: ${formataltNevek(occurrence.effectivePreferredNames ?? occurrence.finalPrimaryNames, 3)}`, detailWidth)
          )
        : null
    );
  }

  return e(
    Box,
    { flexDirection: "column", flexGrow: 1 },
    e(Text, { bold: true }, egysorosSzoveg(name.name, detailWidth)),
    e(Text, null, egysorosSzoveg(`Források: ${formatForrasLista(name.sources)}`, detailWidth)),
    e(Text, null, egysorosSzoveg(`Napok: ${name.occurrenceCount} • Hiányzó: ${name.counts.missing} • Helyi overlay: ${name.counts.local} • Közös végső: ${name.counts.final}`, detailWidth)),
    e(Text, { bold: true }, "Előfordulások"),
    renderAblakJelzes("Felül", occurrenceWindow.before, `name-occurrence-before-${name.name}`),
    ...(occurrenceWindow.elemek.length > 0
      ? occurrenceWindow.elemek.map((item, index) => {
          const globalIndex = occurrenceWindow.before + index;
          const aktiv = state.namePanel === "elofordulasok" && globalIndex === state.nameOccurrenceIndex;
          return e(
            Text,
            {
              key: `name-occurrence-${name.name}-${item.monthDay}`,
              color: aktiv ? "cyan" : undefined,
            },
            egysorosSzoveg(
              `${aktiv ? "❯ " : "  "}${item.monthDay} • ${formatOccurrenceStatus(item)} • ${formatOccurrenceSources(item)}`,
              detailWidth
            )
          );
        })
      : [e(Text, { key: "name-occurrence-empty", dimColor: true }, "Nincs naphoz kötött előfordulás.")]),
    renderAblakJelzes("Alul", occurrenceWindow.after, `name-occurrence-after-${name.name}`),
    e(Text, { dimColor: true }, egysorosSzoveg(`Aktív panel: ${state.namePanel === "lista" ? "névlista" : "előfordulások"} • ←/→: panelváltás • Enter: napra ugrás`, detailWidth)),
    occurrence
        ? e(
            Text,
          { dimColor: true },
          egysorosSzoveg(
            `Kijelölt előfordulás: ${occurrence.monthDay} • közös: ${formataltNevek(occurrence.finalPrimaryNames, 3)} • helyi eredő: ${formataltNevek(occurrence.effectivePreferredNames ?? occurrence.finalPrimaryNames, 3)}${occurrence.similarPrimaries.length > 0 ? ` • kapcsolódó: ${occurrence.similarPrimaries.join(" • ")}` : ""}`,
            detailWidth
          )
        )
      : null
  );
}

function renderNames(viewModel, state, bodyRows, terminalWidth) {
  const nevek = getVisibleNameRows(viewModel, state);
  const name = getSelectedName(viewModel, state);
  const aktivSzuro = PRIMER_AUDIT_NEV_SZUROK.find((item) => item.azonosito === state.nameFilterId);
  const aktivRendezes = PRIMER_AUDIT_RENDEZESEK.find((item) => item.azonosito === state.nameSortId);
  const leftWidth = Math.min(46, Math.max(30, Math.floor(terminalWidth * 0.4)));
  const detailWidth = Math.max(28, terminalWidth - leftWidth - 4);
  const filterItems = PRIMER_AUDIT_NEV_SZUROK.map((item) => ({
    ...item,
    count: (viewModel.names ?? []).filter((nameItem) => nameMatchesFilter(nameItem, item.azonosito)).length,
  }));
  const listWindowRows = Math.max(4, bodyRows - 5);
  const window = kijeloltAblak(nevek, state.nameIndex, listWindowRows);

  return e(
    Box,
    { marginTop: 1 },
    e(
      Box,
      { flexDirection: "column", width: leftWidth, marginRight: 2 },
      ...renderKartyaRacs({
        title: "Szűrő-kártyák",
        items: filterItems,
        activeId: state.nameFilterId,
        width: leftWidth,
        keyPrefix: "name-filters",
      }),
      e(
        Text,
        { dimColor: true },
        egysorosSzoveg(
          `Szűrő: ${aktivSzuro?.cimke ?? "—"} • Rendezés: ${aktivRendezes?.cimke ?? "—"} • Találat: ${nevek.length}${state.nameQuery ? ` • Keresés: ${state.nameQuery}` : ""}`,
          leftWidth
        )
      ),
      renderAblakJelzes("Felül", window.before, "name-list-before"),
      ...(window.elemek.length > 0
        ? window.elemek.map((item, index) => {
            const globalIndex = window.before + index;
            return e(
              Box,
              { key: `name-row-${item.name}` },
              renderNameRow(item, globalIndex === state.nameIndex && state.namePanel === "lista", leftWidth)
            );
          })
        : [e(Text, { key: "names-empty", dimColor: true }, "A jelenlegi szűrőhöz nincs találat.")]),
      renderAblakJelzes("Alul", window.after, "name-list-after")
    ),
    renderNameDetail(name, state, bodyRows, detailWidth)
  );
}

export function PrimerAuditRender({ viewModel, state, folyamatban, uzenet, uzenetTipus, viewport }) {
  const aktivMod = PRIMER_AUDIT_MODOK.find((item) => item.azonosito === state.aktivMod);
  const terminalRows = Math.max(14, viewport?.rows ?? 24);
  const terminalWidth = Math.max(64, viewport?.columns ?? 80);
  const headerSummarySorok = buildHeaderSummarySorok(viewModel, terminalWidth);
  const reservedRows =
    5 +
    (folyamatban || uzenet ? 1 : 0) +
    (state.search.aktiv ? 4 : 0) +
    (state.settingsDrawerOpen ? 8 : 0);
  const bodyRows = Math.max(6, terminalRows - reservedRows);
  const headerWidth = terminalWidth - 2;

  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "Primer audit"),
    e(
      Text,
      { dimColor: true },
      egysorosSzoveg(
        `Mód: ${aktivMod?.cimke ?? "Áttekintés"} • Tab/1–3 váltás • / keresés • f szűrő • s rendezés • b beállítások • ? súgó`,
        headerWidth
      )
    ),
    e(
      Text,
      { dimColor: true },
      egysorosSzoveg(`Riport: ${viewModel.reportPath ?? "—"} • Generálva: ${formatRovidIdobelyeg(viewModel.generatedAt)}`, headerWidth)
    ),
    ...headerSummarySorok.map((sor, index) =>
      e(Text, { key: `primer-audit-summary-${index}`, dimColor: true }, egysorosSzoveg(sor, headerWidth))
    ),
    renderStatusLine({ folyamatban, uzenet, uzenetTipus }),
    renderSearchBar(state),
    state.helpOpen
      ? renderHelpOverlay(state)
      : state.aktivMod === "attekintes"
        ? renderOverview(viewModel, state, bodyRows, terminalWidth)
        : state.aktivMod === "napok"
          ? renderDays(viewModel, state, bodyRows, terminalWidth)
          : renderNames(viewModel, state, bodyRows, terminalWidth),
    state.helpOpen ? null : renderSettingsDrawer(viewModel, state)
  );
}
