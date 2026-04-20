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
  buildPrimerAuditOsszegzesSorok,
  formataltKapcsolodoPrimerek,
  formataltNevek,
  formatForrasJelzo,
  formatForrasLista,
  formatOccurrenceSources,
  formatOccurrenceStatus,
  formatSearchPrompt,
  primerNapSzine,
  sajatPrimerForrasCimke,
  statusCimkekNaphoz,
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

function renderHelpOverlay(state) {
  const kozos = [
    "Tab vagy 1–3: módváltás",
    "↑/↓: mozgás az aktív listában",
    "f: szűrőváltás",
    "s: rendezésváltás",
    "/: keresés",
    "b: személyes primer-beállítások",
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
            "←/→: váltás a naplista és a személyes műveletek között",
            "Enter: nyers/rejtett blokk kibontása vagy összecsukása",
            "Space: helyi kijelölés kapcsolása a személyes listában",
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
    e(Text, { bold: true }, "Személyes primer-beállítások"),
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
    e(Text, { dimColor: true }, "↑/↓: kijelölés • ←/→ vagy Space: értékváltás • b: drawer bezárása")
  );
}

function renderOverview(viewModel, state, bodyRows) {
  const queue = getSelectedOverviewQueue(viewModel, state);
  const queueWindow = kijeloltAblak(viewModel.queues ?? [], state.overviewQueueIndex, Math.max(3, bodyRows - 2));
  const honapWindow = kijeloltAblak(viewModel.monthSummary ?? [], 0, Math.max(3, bodyRows - 6));

  return e(
    Box,
    { marginTop: 1 },
    e(
      Box,
      { flexDirection: "column", width: 40, marginRight: 2 },
      e(Text, { bold: true }, "Queue-kártyák"),
      renderAblakJelzes("Felül", queueWindow.before, "overview-queues-before"),
      ...queueWindow.elemek.map((item, index) => {
        const globalIndex = queueWindow.before + index;
        const aktiv = globalIndex === state.overviewQueueIndex;

        return e(
          Text,
          {
            key: `overview-queue-${item.azonosito}`,
            color: aktiv ? "cyan" : undefined,
          },
          `${aktiv ? "❯ " : "  "}${item.cimke} • ${item.count}`
        );
      }),
      renderAblakJelzes("Alul", queueWindow.after, "overview-queues-after"),
      e(Text, { dimColor: true }, "Enter: ugrás a kijelölt queue napi nézetére")
    ),
    e(
      Box,
      { flexDirection: "column", flexGrow: 1 },
      e(Text, { bold: true }, "Éves összkép"),
      ...buildPrimerAuditOsszegzesSorok(viewModel).map((sor, index) =>
        e(Text, { key: `overview-summary-${index}` }, sor)
      ),
      e(Text, { bold: true }, ""),
      e(Text, { bold: true }, "Havi bontás"),
      ...honapWindow.elemek.map((honap) =>
        e(
          Text,
          { key: `overview-month-${honap.month}` },
          `${honap.monthName}: nap ${honap.total} • hiányzós ${honap.missing} • helyi ${honap.local} • kézi ${honap.overrides} • eltérés ${honap.mismatches}`
        )
      ),
      renderAblakJelzes("További hónapok", honapWindow.after, "overview-months-after"),
      e(Text, { bold: true }, ""),
      e(Text, { bold: true }, "Kijelölt queue"),
      queue
        ? e(Text, null, `${queue.cimke} • ${queue.count} nap • ${queue.leiras}`)
        : e(Text, { dimColor: true }, "Nincs kijelölt queue.")
    )
  );
}

function renderDayRow(day, selected) {
  const statusok = statusCimkekNaphoz(day);

  return e(
    Text,
    null,
    e(Text, { bold: true, color: primerNapSzine(day.finalPrimaryCount) }, `${selected ? "❯ " : "  "}${day.monthDay}`),
    e(Text, null, ` • ${formataltNevek(day.finalPrimaryNames, 2)} • ${statusok.join(" • ") || vegsoPrimerForrasCimke(day.source)}`)
  );
}

function renderDayDetail(day, state, bodyRows) {
  if (!day) {
    return e(Text, { dimColor: true }, "Nincs kijelölt nap.");
  }

  const personalEntries = day.sections?.szemelyes?.entries ?? day.personalEntries ?? [];
  const missingEntries = day.sections?.hianyzok?.combinedMissing ?? day.combinedMissing ?? [];
  const personalEntry = personalEntries[state.dayPersonalIndex] ?? null;
  const compact = bodyRows < 12;
  const fixedRows = compact ? 7 : 10;
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
      e(Text, { bold: true }, `${day.monthName} • ${day.monthDay} • ${vegsoPrimerForrasCimke(day.source)}`),
      e(Text, { color: vegsoPrimerForrasSzine(day) }, `Végső: ${formataltNevek(day.finalPrimaryNames, 4)}`),
      e(Text, null, `Hiányzó: ${day.counts.missing} • Helyi: ${day.counts.local} • Nyers: ${day.counts.raw} • Rejtett: ${day.counts.hidden}`),
      e(Text, null, `Legacy/Wiki: ${formataltNevek(day.legacy, 3)} // ${formataltNevek(day.wiki, 3)}`),
      e(Text, null, `Norm/Rang: ${formataltNevek(day.normalized, 3)} // ${formataltNevek(day.ranking, 3)}`),
      e(Text, null, `Hiányzó jelöltek: ${missingEntries.length > 0 ? missingEntries.map((entry) => entry.name).join(" • ") : "—"}`),
      e(Text, null, `Nyers/Rejtett: ${rawPreview} // ${hiddenPreview}`),
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
              `${aktiv ? "❯" : " "} ${entry.localSelected ? "[x]" : "[ ]"} ${entry.name} ${formatForrasJelzo(entry.sources)}`
            );
          })
        : [e(Text, { key: "day-personal-compact-empty", dimColor: true }, "Nincs személyes jelölt.")]),
      personalEntry
        ? e(
            Text,
            { dimColor: true },
            `Kijelölt: ${personalEntry.name}${personalEntry.highlight ? ` • ${formataltKapcsolodoPrimerek(personalEntry.similarPrimaries, 2)}` : ""}`
          )
        : null
    );
  }

  return e(
    Box,
    { flexDirection: "column", flexGrow: 1 },
    e(Text, { bold: true }, `${day.monthName} • ${day.monthDay}`),
    e(
      Text,
      { color: vegsoPrimerForrasSzine(day) },
      `Végső: ${formataltNevek(day.finalPrimaryNames, 6)} • ${vegsoPrimerForrasCimke(day.source)}${day.flags.isValidationMismatch ? " • eltérés" : ""}`
    ),
    e(Text, null, `Hiányzók: ${day.counts.missing} • Helyi: ${day.counts.local} • Nyers: ${day.counts.raw} • Rejtett: ${day.counts.hidden}`),
    e(Text, null, `Legacy/Wiki: ${formataltNevek(day.legacy, 4)} // ${formataltNevek(day.wiki, 4)}`),
    e(Text, null, `Normalizált/Rangsorolt: ${formataltNevek(day.normalized, 4)} // ${formataltNevek(day.ranking, 4)}`),
    e(Text, null, `Hiányzó jelöltek: ${missingEntries.length > 0 ? missingEntries.map((entry) => `${entry.name} ${formatForrasJelzo(entry.sources)}`).join(" • ") : "—"}`),
    e(Text, null, `Nyers: ${rawPreview}`),
    e(Text, { color: (day.hidden?.length ?? 0) > 0 ? "yellow" : undefined }, `Rejtett: ${hiddenPreview}`),
    e(Text, { dimColor: true }, state.rawExpanded ? "Enter: hosszú névblokkok összecsukása" : "Enter: hosszabb nyers/rejtett előnézet"),
    e(Text, { bold: true }, "Személyes műveletek"),
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
            `${aktiv ? "❯" : " "} ${entry.localSelected ? "[x]" : "[ ]"} ${entry.name} ${formatForrasJelzo(entry.sources)}${entry.manualOnly ? " [kézi]" : ""}`
          );
        })
      : [e(Text, { key: "day-personal-empty", dimColor: true }, "Nincs személyes jelölt ezen a napon.")]),
    renderAblakJelzes("Alul", personalWindow.after, `day-personal-after-${day.monthDay}`),
    e(Text, { dimColor: true }, `Aktív panel: ${state.dayPanel === "lista" ? "naplista" : "személyes műveletek"} • ←/→: panelváltás • Space: helyi kapcsolás`),
    personalEntry
      ? e(
          Text,
          { dimColor: true },
          `Kijelölt név: ${personalEntry.name} • ${personalEntry.highlight ? `kapcsolódó primerek: ${formataltKapcsolodoPrimerek(personalEntry.similarPrimaries, 3)}` : `forrás: ${formatForrasLista(personalEntry.sources)}`}`
        )
      : null
  );
}

function renderDays(viewModel, state, bodyRows) {
  const napok = getVisibleDayRows(viewModel, state);
  const day = getSelectedDay(viewModel, state);
  const aktivSzuro = PRIMER_AUDIT_NAP_SZUROK.find((item) => item.azonosito === state.dayFilterId);
  const aktivRendezes = PRIMER_AUDIT_RENDEZESEK.find((item) => item.azonosito === state.daySortId);
  const window = kijeloltAblak(napok, state.dayIndex, Math.max(4, bodyRows - 2));

  return e(
    Box,
    { marginTop: 1 },
    e(
      Box,
      { flexDirection: "column", width: 52, marginRight: 2 },
      e(Text, { bold: true }, "Nap queue"),
      e(
        Text,
        { dimColor: true },
        `Szűrő: ${aktivSzuro?.cimke ?? "—"} • Rendezés: ${aktivRendezes?.cimke ?? "—"} • Találat: ${napok.length}${state.dayQuery ? ` • Keresés: ${state.dayQuery}` : ""}`
      ),
      renderAblakJelzes("Felül", window.before, "day-list-before"),
      ...(window.elemek.length > 0
        ? window.elemek.map((item, index) => {
            const globalIndex = window.before + index;
            return e(Box, { key: `day-row-${item.monthDay}` }, renderDayRow(item, globalIndex === state.dayIndex && state.dayPanel === "lista"));
          })
        : [e(Text, { key: "days-empty", dimColor: true }, "A jelenlegi szűrőhöz nincs találat.")]),
      renderAblakJelzes("Alul", window.after, "day-list-after")
    ),
    renderDayDetail(day, state, bodyRows)
  );
}

function renderNameRow(name, selected) {
  return e(
    Text,
    null,
    e(Text, { bold: true, color: selected ? "cyan" : undefined }, `${selected ? "❯ " : "  "}${name.name}`),
    e(Text, null, ` • ${statusCimkekNevhez(name).join(" • ")}`)
  );
}

function renderNameDetail(name, state, bodyRows) {
  if (!name) {
    return e(Text, { dimColor: true }, "Nincs kijelölt név.");
  }

  const occurrence = name.occurrences?.[state.nameOccurrenceIndex] ?? null;
  const compact = bodyRows < 12;
  const fixedRows = compact ? 5 : 6;
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
      e(Text, { bold: true }, name.name),
      e(Text, null, `Források: ${formatForrasLista(name.sources)}`),
      e(Text, null, `Napok: ${name.occurrenceCount} • Hiányzó: ${name.counts.missing} • Helyi: ${name.counts.local} • Végső: ${name.counts.final}`),
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
              `${aktiv ? "❯ " : "  "}${item.monthDay} • ${formatOccurrenceStatus(item)}`
            );
          })
        : [e(Text, { key: "name-occurrence-compact-empty", dimColor: true }, "Nincs naphoz kötött előfordulás.")]),
      occurrence
        ? e(
            Text,
            { dimColor: true },
            `Kijelölt: ${occurrence.monthDay} • ${formataltNevek(occurrence.finalPrimaryNames, 3)}`
          )
        : null
    );
  }

  return e(
    Box,
    { flexDirection: "column", flexGrow: 1 },
    e(Text, { bold: true }, name.name),
    e(Text, null, `Források: ${formatForrasLista(name.sources)}`),
    e(Text, null, `Napok: ${name.occurrenceCount} • Hiányzó: ${name.counts.missing} • Helyi: ${name.counts.local} • Végső: ${name.counts.final}`),
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
            `${aktiv ? "❯ " : "  "}${item.monthDay} • ${formatOccurrenceStatus(item)} • ${formatOccurrenceSources(item)}`
          );
        })
      : [e(Text, { key: "name-occurrence-empty", dimColor: true }, "Nincs naphoz kötött előfordulás.")]),
    renderAblakJelzes("Alul", occurrenceWindow.after, `name-occurrence-after-${name.name}`),
    e(Text, { dimColor: true }, `Aktív panel: ${state.namePanel === "lista" ? "névlista" : "előfordulások"} • ←/→: panelváltás • Enter: napra ugrás`),
    occurrence
      ? e(
          Text,
          { dimColor: true },
          `Kijelölt előfordulás: ${occurrence.monthDay} • végső nap: ${formataltNevek(occurrence.finalPrimaryNames, 4)}${occurrence.similarPrimaries.length > 0 ? ` • kapcsolódó: ${occurrence.similarPrimaries.join(" • ")}` : ""}`
        )
      : null
  );
}

function renderNames(viewModel, state, bodyRows) {
  const nevek = getVisibleNameRows(viewModel, state);
  const name = getSelectedName(viewModel, state);
  const aktivSzuro = PRIMER_AUDIT_NEV_SZUROK.find((item) => item.azonosito === state.nameFilterId);
  const aktivRendezes = PRIMER_AUDIT_RENDEZESEK.find((item) => item.azonosito === state.nameSortId);
  const window = kijeloltAblak(nevek, state.nameIndex, Math.max(4, bodyRows - 2));

  return e(
    Box,
    { marginTop: 1 },
    e(
      Box,
      { flexDirection: "column", width: 48, marginRight: 2 },
      e(Text, { bold: true }, "Névindex"),
      e(
        Text,
        { dimColor: true },
        `Szűrő: ${aktivSzuro?.cimke ?? "—"} • Rendezés: ${aktivRendezes?.cimke ?? "—"} • Találat: ${nevek.length}${state.nameQuery ? ` • Keresés: ${state.nameQuery}` : ""}`
      ),
      renderAblakJelzes("Felül", window.before, "name-list-before"),
      ...(window.elemek.length > 0
        ? window.elemek.map((item, index) => {
            const globalIndex = window.before + index;
            return e(Box, { key: `name-row-${item.name}` }, renderNameRow(item, globalIndex === state.nameIndex && state.namePanel === "lista"));
          })
        : [e(Text, { key: "names-empty", dimColor: true }, "A jelenlegi szűrőhöz nincs találat.")]),
      renderAblakJelzes("Alul", window.after, "name-list-after")
    ),
    renderNameDetail(name, state, bodyRows)
  );
}

export function PrimerAuditRender({ viewModel, state, folyamatban, uzenet, uzenetTipus, viewport }) {
  const aktivMod = PRIMER_AUDIT_MODOK.find((item) => item.azonosito === state.aktivMod);
  const terminalRows = Math.max(14, viewport?.rows ?? 24);
  const reservedRows =
    5 +
    (folyamatban || uzenet ? 1 : 0) +
    (state.search.aktiv ? 4 : 0) +
    (state.settingsDrawerOpen ? 7 : 0);
  const bodyRows = Math.max(6, terminalRows - reservedRows);

  return e(
    Box,
    { flexDirection: "column" },
    e(Text, { bold: true }, "Primer audit"),
    e(
      Text,
      { dimColor: true },
      `Aktív mód: ${aktivMod?.cimke ?? "Áttekintés"} • Tab vagy 1–3: módváltás • /: keresés • f: szűrő • s: rendezés • b: beállítások • ?: súgó`
    ),
    e(
      Text,
      { dimColor: true },
      `Riport: ${viewModel.reportPath ?? "—"} • Generálva: ${viewModel.generatedAt ?? "—"}`
    ),
    ...buildPrimerAuditOsszegzesSorok(viewModel).map((sor, index) =>
      e(Text, { key: `primer-audit-summary-${index}`, dimColor: true }, sor)
    ),
    renderStatusLine({ folyamatban, uzenet, uzenetTipus }),
    renderSearchBar(state),
    state.helpOpen
      ? renderHelpOverlay(state)
      : state.aktivMod === "attekintes"
        ? renderOverview(viewModel, state, bodyRows)
        : state.aktivMod === "napok"
          ? renderDays(viewModel, state, bodyRows)
          : renderNames(viewModel, state, bodyRows),
    state.helpOpen ? null : renderSettingsDrawer(viewModel, state)
  );
}
