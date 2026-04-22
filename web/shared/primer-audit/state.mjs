/**
 * web/shared/primer-audit/state.mjs
 * Pure state management shared by the primer audit web workspace.
 */

import {
  PRIMER_AUDIT_MODOK,
  PRIMER_AUDIT_NAP_SZUROK,
  PRIMER_AUDIT_NEV_SZUROK,
  PRIMER_AUDIT_RENDEZESEK,
  SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK,
  visiblePrimerAuditNapok,
  visiblePrimerAuditNevek,
} from "./view-model.mjs";

function clampIndex(index, length) {
  if (length <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(index, length - 1));
}

function nextFromList(lista, aktualis, irany = 1) {
  const elemek = Array.isArray(lista) ? lista : [];

  if (elemek.length === 0) {
    return aktualis;
  }

  const index = Math.max(
    0,
    elemek.findIndex((elem) => elem.azonosito === aktualis)
  );

  return elemek[(index + irany + elemek.length) % elemek.length].azonosito;
}

export function createPrimerAuditInitialState(viewModel) {
  return normalizePrimerAuditState(
    {
      aktivMod: "attekintes",
      overviewQueueIndex: 0,
      dayFilterId: "akciozhato",
      nameFilterId: "osszes",
      daySortId: "relevancia",
      nameSortId: "relevancia",
      dayIndex: 0,
      nameIndex: 0,
      dayPersonalIndex: 0,
      nameOccurrenceIndex: 0,
      dayPanel: "lista",
      namePanel: "lista",
      dayQuery: "",
      nameQuery: "",
      search: {
        aktiv: false,
        target: null,
        draft: "",
        previous: "",
      },
      settingsDrawerOpen: false,
      settingsIndex: 0,
      helpOpen: false,
      rawExpanded: false,
    },
    viewModel
  );
}

export function getVisibleDayRows(viewModel, state) {
  return visiblePrimerAuditNapok(viewModel, state);
}

export function getVisibleNameRows(viewModel, state) {
  return visiblePrimerAuditNevek(viewModel, state);
}

export function getSelectedOverviewQueue(viewModel, state) {
  return (viewModel?.queues ?? [])[state?.overviewQueueIndex ?? 0] ?? null;
}

export function getSelectedDay(viewModel, state) {
  return getVisibleDayRows(viewModel, state)[state?.dayIndex ?? 0] ?? null;
}

export function getSelectedName(viewModel, state) {
  return getVisibleNameRows(viewModel, state)[state?.nameIndex ?? 0] ?? null;
}

export function getSelectedPersonalEntry(viewModel, state) {
  const day = getSelectedDay(viewModel, state);
  const entries = day?.sections?.szemelyes?.entries ?? day?.personalEntries ?? [];
  return entries[state?.dayPersonalIndex ?? 0] ?? null;
}

export function getSelectedOccurrence(viewModel, state) {
  const name = getSelectedName(viewModel, state);
  return name?.occurrences?.[state?.nameOccurrenceIndex ?? 0] ?? null;
}

export function getSelectedSettingsDefinicio(state) {
  return SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK[state?.settingsIndex ?? 0] ?? null;
}

export function normalizePrimerAuditState(state, viewModel) {
  const napok = getVisibleDayRows(viewModel, state);
  const nevek = getVisibleNameRows(viewModel, state);
  const kijeloltNap = napok[clampIndex(state.dayIndex, napok.length)] ?? null;
  const szemelyesBejegyzesek = kijeloltNap?.sections?.szemelyes?.entries ?? kijeloltNap?.personalEntries ?? [];
  const kijeloltNev = nevek[clampIndex(state.nameIndex, nevek.length)] ?? null;
  const elofordulasok = kijeloltNev?.occurrences ?? [];

  return {
    ...state,
    overviewQueueIndex: clampIndex(state.overviewQueueIndex, viewModel?.queues?.length ?? 0),
    dayIndex: clampIndex(state.dayIndex, napok.length),
    nameIndex: clampIndex(state.nameIndex, nevek.length),
    dayPersonalIndex: clampIndex(state.dayPersonalIndex, szemelyesBejegyzesek.length),
    nameOccurrenceIndex: clampIndex(state.nameOccurrenceIndex, elofordulasok.length),
    settingsIndex: clampIndex(state.settingsIndex, SZEMELYES_PRIMER_BEALLITAS_DEFINICIOK.length),
    dayPanel:
      state.dayPanel === "szemelyes" && szemelyesBejegyzesek.length === 0 ? "lista" : state.dayPanel,
    namePanel:
      state.namePanel === "elofordulasok" && elofordulasok.length === 0 ? "lista" : state.namePanel,
  };
}

export function reducePrimerAuditState(state, action, viewModel) {
  const aktualis = normalizePrimerAuditState(state, viewModel);

  switch (action.type) {
    case "replace_state":
      return normalizePrimerAuditState(action.state, viewModel);
    case "sync":
      return aktualis;
    case "set_mode":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          aktivMod: action.mod,
          search: {
            aktiv: false,
            target: null,
            draft: "",
            previous: "",
          },
        },
        viewModel
      );
    case "cycle_mode":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          aktivMod: nextFromList(PRIMER_AUDIT_MODOK, aktualis.aktivMod, action.irany ?? 1),
          search: {
            aktiv: false,
            target: null,
            draft: "",
            previous: "",
          },
        },
        viewModel
      );
    case "toggle_help":
      return {
        ...aktualis,
        helpOpen: !aktualis.helpOpen,
      };
    case "set_day_filter":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          dayFilterId: action.filterId,
          dayIndex: 0,
          dayPanel: "lista",
        },
        viewModel
      );
    case "set_name_filter":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          nameFilterId: action.filterId,
          nameIndex: 0,
          namePanel: "lista",
        },
        viewModel
      );
    case "set_day_sort":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          daySortId: action.sortId,
          dayIndex: 0,
        },
        viewModel
      );
    case "set_name_sort":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          nameSortId: action.sortId,
          nameIndex: 0,
        },
        viewModel
      );
    case "set_day_query":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          dayQuery: action.query ?? "",
          dayIndex: 0,
          dayPanel: "lista",
        },
        viewModel
      );
    case "set_name_query":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          nameQuery: action.query ?? "",
          nameIndex: 0,
          namePanel: "lista",
        },
        viewModel
      );
    case "set_day_index":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          dayIndex: action.index ?? 0,
        },
        viewModel
      );
    case "set_name_index":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          nameIndex: action.index ?? 0,
        },
        viewModel
      );
    case "set_day_panel":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          dayPanel: action.panel ?? "lista",
        },
        viewModel
      );
    case "set_name_panel":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          namePanel: action.panel ?? "lista",
        },
        viewModel
      );
    case "set_occurrence_index":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          nameOccurrenceIndex: action.index ?? 0,
        },
        viewModel
      );
    case "set_personal_index":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          dayPersonalIndex: action.index ?? 0,
        },
        viewModel
      );
    case "set_settings_index":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          settingsIndex: action.index ?? 0,
        },
        viewModel
      );
    case "toggle_drawer":
      return {
        ...aktualis,
        settingsDrawerOpen: !aktualis.settingsDrawerOpen,
      };
    case "drawer_move":
      return normalizePrimerAuditState(
        {
          ...aktualis,
          settingsIndex:
            aktualis.settingsIndex + (action.irany ?? 1),
        },
        viewModel
      );
    case "move": {
      if (aktualis.aktivMod === "attekintes") {
        return normalizePrimerAuditState(
          {
            ...aktualis,
            overviewQueueIndex: aktualis.overviewQueueIndex + (action.irany ?? 1),
          },
          viewModel
        );
      }

      if (aktualis.aktivMod === "napok") {
        if (aktualis.dayPanel === "szemelyes") {
          return normalizePrimerAuditState(
            {
              ...aktualis,
              dayPersonalIndex: aktualis.dayPersonalIndex + (action.irany ?? 1),
            },
            viewModel
          );
        }

        return normalizePrimerAuditState(
          {
            ...aktualis,
            dayIndex: aktualis.dayIndex + (action.irany ?? 1),
          },
          viewModel
        );
      }

      if (aktualis.namePanel === "elofordulasok") {
        return normalizePrimerAuditState(
          {
            ...aktualis,
            nameOccurrenceIndex: aktualis.nameOccurrenceIndex + (action.irany ?? 1),
          },
          viewModel
        );
      }

      return normalizePrimerAuditState(
        {
          ...aktualis,
          nameIndex: aktualis.nameIndex + (action.irany ?? 1),
        },
        viewModel
      );
    }
    case "cycle_filter":
      if (aktualis.aktivMod === "napok") {
        return normalizePrimerAuditState(
          {
            ...aktualis,
            dayFilterId: nextFromList(PRIMER_AUDIT_NAP_SZUROK, aktualis.dayFilterId, action.irany ?? 1),
            dayIndex: 0,
            dayPanel: "lista",
          },
          viewModel
        );
      }

      if (aktualis.aktivMod === "nevek") {
        return normalizePrimerAuditState(
          {
            ...aktualis,
            nameFilterId: nextFromList(PRIMER_AUDIT_NEV_SZUROK, aktualis.nameFilterId, action.irany ?? 1),
            nameIndex: 0,
            namePanel: "lista",
          },
          viewModel
        );
      }

      return aktualis;
    case "cycle_sort":
      if (aktualis.aktivMod === "napok") {
        return normalizePrimerAuditState(
          {
            ...aktualis,
            daySortId: nextFromList(PRIMER_AUDIT_RENDEZESEK, aktualis.daySortId, action.irany ?? 1),
            dayIndex: 0,
          },
          viewModel
        );
      }

      if (aktualis.aktivMod === "nevek") {
        return normalizePrimerAuditState(
          {
            ...aktualis,
            nameSortId: nextFromList(PRIMER_AUDIT_RENDEZESEK, aktualis.nameSortId, action.irany ?? 1),
            nameIndex: 0,
          },
          viewModel
        );
      }

      return aktualis;
    case "toggle_panel":
      if (aktualis.aktivMod === "napok") {
        return normalizePrimerAuditState(
          {
            ...aktualis,
            dayPanel: aktualis.dayPanel === "lista" ? "szemelyes" : "lista",
          },
          viewModel
        );
      }

      if (aktualis.aktivMod === "nevek") {
        return normalizePrimerAuditState(
          {
            ...aktualis,
            namePanel: aktualis.namePanel === "lista" ? "elofordulasok" : "lista",
          },
          viewModel
        );
      }

      return aktualis;
    case "start_search": {
      if (!["napok", "nevek"].includes(aktualis.aktivMod)) {
        return aktualis;
      }

      const target = aktualis.aktivMod;
      const previous = target === "napok" ? aktualis.dayQuery : aktualis.nameQuery;

      return {
        ...aktualis,
        search: {
          aktiv: true,
          target,
          draft: previous,
          previous,
        },
      };
    }
    case "append_search": {
      if (!aktualis.search.aktiv) {
        return aktualis;
      }

      const draft = `${aktualis.search.draft}${action.char ?? ""}`;
      const kovetkezo = {
        ...aktualis,
        search: {
          ...aktualis.search,
          draft,
        },
      };

      if (aktualis.search.target === "napok") {
        kovetkezo.dayQuery = draft;
        kovetkezo.dayIndex = 0;
        kovetkezo.dayPanel = "lista";
      } else {
        kovetkezo.nameQuery = draft;
        kovetkezo.nameIndex = 0;
        kovetkezo.namePanel = "lista";
      }

      return normalizePrimerAuditState(kovetkezo, viewModel);
    }
    case "backspace_search": {
      if (!aktualis.search.aktiv) {
        return aktualis;
      }

      const draft = aktualis.search.draft.slice(0, -1);
      const kovetkezo = {
        ...aktualis,
        search: {
          ...aktualis.search,
          draft,
        },
      };

      if (aktualis.search.target === "napok") {
        kovetkezo.dayQuery = draft;
        kovetkezo.dayIndex = 0;
      } else {
        kovetkezo.nameQuery = draft;
        kovetkezo.nameIndex = 0;
      }

      return normalizePrimerAuditState(kovetkezo, viewModel);
    }
    case "confirm_search":
      return {
        ...aktualis,
        search: {
          aktiv: false,
          target: null,
          draft: "",
          previous: "",
        },
      };
    case "cancel_search": {
      if (!aktualis.search.aktiv) {
        return aktualis;
      }

      const kovetkezo = {
        ...aktualis,
        search: {
          aktiv: false,
          target: null,
          draft: "",
          previous: "",
        },
      };

      if (aktualis.search.target === "napok") {
        kovetkezo.dayQuery = aktualis.search.previous;
        kovetkezo.dayIndex = 0;
      } else {
        kovetkezo.nameQuery = aktualis.search.previous;
        kovetkezo.nameIndex = 0;
      }

      return normalizePrimerAuditState(kovetkezo, viewModel);
    }
    case "toggle_raw_expanded":
      return {
        ...aktualis,
        rawExpanded: !aktualis.rawExpanded,
      };
    case "activate_enter": {
      if (aktualis.aktivMod === "attekintes") {
        const queue = getSelectedOverviewQueue(viewModel, aktualis);
        return normalizePrimerAuditState(
          {
            ...aktualis,
            aktivMod: "napok",
            dayFilterId: queue?.azonosito ?? aktualis.dayFilterId,
            dayIndex: 0,
            dayPanel: "lista",
          },
          viewModel
        );
      }

      if (aktualis.aktivMod === "napok") {
        return {
          ...aktualis,
          rawExpanded: !aktualis.rawExpanded,
        };
      }

      if (aktualis.namePanel === "lista") {
        const kijeloltNev = getSelectedName(viewModel, aktualis);

        if ((kijeloltNev?.occurrences?.length ?? 0) === 0) {
          return aktualis;
        }

        return normalizePrimerAuditState(
          {
            ...aktualis,
            namePanel: "elofordulasok",
            nameOccurrenceIndex: 0,
          },
          viewModel
        );
      }

      const occurrence = getSelectedOccurrence(viewModel, aktualis);

      if (!occurrence?.monthDay) {
        return aktualis;
      }

      const napok = visiblePrimerAuditNapok(viewModel, {
        ...aktualis,
        aktivMod: "napok",
        dayFilterId: "osszes",
        dayQuery: "",
        daySortId: "datum",
      });
      const index = Math.max(
        0,
        napok.findIndex((day) => day.monthDay === occurrence.monthDay)
      );

      return normalizePrimerAuditState(
        {
          ...aktualis,
          aktivMod: "napok",
          dayFilterId: "osszes",
          daySortId: "datum",
          dayQuery: "",
          dayIndex: index,
          dayPanel: "lista",
          rawExpanded: false,
        },
        viewModel
      );
    }
    default:
      return aktualis;
  }
}
