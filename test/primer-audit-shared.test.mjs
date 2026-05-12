import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPrimerAuditViewModel,
  dayMatchesExactNameFilter,
  dayMatchesFilter,
  visiblePrimerAuditNapok,
  visiblePrimerAuditNevek,
} from "../web/shared/primer-audit/view-model.mjs";
import {
  createPrimerAuditInitialState,
  getSelectedDay,
  getSelectedName,
  normalizePrimerAuditState,
  reducePrimerAuditState,
} from "../web/shared/primer-audit/state.mjs";

function createSampleReport() {
  return {
    reportPath: "output/riportok/primer-audit.yaml",
    generatedAt: "2026-04-20T12:00:00.000Z",
    summary: {
      rowCount: 2,
      combinedMissingCount: 1,
      effectiveMissingCount: 1,
      locallyResolvedMissingCount: 0,
      localSelectedCount: 1,
      overrideDayCount: 1,
      mismatchDayCount: 0,
    },
    validations: {
      mismatchMonthDays: [],
      overrideMonthDays: ["01-02"],
    },
    personal: {
      settingsSnapshot: {
        primarySource: "default",
        modifiers: {
          normalized: false,
          ranking: false,
        },
      },
    },
    months: [
      {
        month: 1,
        monthName: "Január",
        rows: [
          {
            month: 1,
            day: 1,
            monthDay: "01-01",
            commonPreferredNames: ["Ábel"],
            effectivePreferredNames: ["Ábel"],
            finalPrimaryNames: ["Ábel"],
            source: "legacy-wiki-exact",
            warning: false,
            rawNames: ["Ábel", "Abigél"],
            hidden: ["Abigél"],
            combinedMissing: [],
            effectiveMissing: [],
            sections: {
              szemelyes: {
                entries: [],
              },
            },
          },
          {
            month: 1,
            day: 2,
            monthDay: "01-02",
            commonPreferredNames: ["Bori"],
            localAddedPreferredNames: ["Cili"],
            effectivePreferredNames: ["Bori", "Cili"],
            finalPrimaryNames: ["Bori"],
            source: "manual-override",
            warning: false,
            rawNames: ["Bori", "Cili", "Bella"],
            hidden: ["Bella", "Cili"],
            combinedMissing: [
              {
                name: "Cili",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
                localSelected: true,
              },
            ],
            effectiveMissing: [
              {
                name: "Cili",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
                localSelected: true,
              },
            ],
            personalEntries: [
              {
                name: "Cili",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
                localSelected: true,
                localSelectable: true,
              },
            ],
            sections: {
              szemelyes: {
                entries: [
                  {
                    name: "Cili",
                    sources: ["normalized"],
                    highlight: false,
                    similarPrimaries: [],
                    localSelected: true,
                    localSelectable: true,
                  },
                ],
              },
            },
          },
        ],
      },
    ],
  };
}

function missingEntry(name, sources = ["ranking"], localSelected = false) {
  return {
    name,
    sources,
    highlight: false,
    similarPrimaries: [],
    localSelected,
  };
}

function createMissingStateReport() {
  return {
    reportPath: "output/riportok/primer-audit.yaml",
    generatedAt: "2026-05-12T10:00:00.000Z",
    summary: {
      rowCount: 4,
      combinedMissingCount: 4,
      effectiveMissingCount: 2,
      locallyResolvedMissingCount: 1,
      localSelectedCount: 1,
    },
    validations: {
      mismatchMonthDays: [],
      overrideMonthDays: [],
    },
    months: [
      {
        month: 3,
        monthName: "Március",
        rows: [
          {
            month: 3,
            day: 29,
            monthDay: "03-29",
            commonPreferredNames: ["Auguszta"],
            effectivePreferredNames: ["Auguszta"],
            finalPrimaryNames: ["Auguszta"],
            source: "audited-registry",
            warning: false,
            rawNames: ["Auguszta", "Bercel", "Bertold"],
            hidden: ["Bercel"],
            normalized: ["Bertold"],
            ranking: ["Bertold"],
            combinedMissing: [],
            effectiveMissing: [],
            locallyResolvedMissing: [],
          },
        ],
      },
      {
        month: 5,
        monthName: "Május",
        rows: [
          {
            month: 5,
            day: 13,
            monthDay: "05-13",
            commonPreferredNames: ["Imola", "Szervác"],
            effectivePreferredNames: ["Imola", "Szervác"],
            finalPrimaryNames: ["Imola", "Szervác"],
            source: "audited-registry",
            warning: false,
            rawNames: ["Imola", "Noel", "Szervác"],
            hidden: ["Noel"],
            normalized: ["Noel"],
            ranking: ["Noel"],
            combinedMissing: [missingEntry("Noel", ["normalized", "ranking"])],
            effectiveMissing: [missingEntry("Noel", ["normalized", "ranking"])],
            locallyResolvedMissing: [],
          },
        ],
      },
      {
        month: 6,
        monthName: "Június",
        rows: [
          {
            month: 6,
            day: 3,
            monthDay: "06-03",
            commonPreferredNames: ["Cecília", "Klotild"],
            effectivePreferredNames: ["Cecília", "Klotild", "Kevin"],
            finalPrimaryNames: ["Cecília", "Klotild"],
            localAddedPreferredNames: ["Kevin"],
            source: "audited-registry",
            warning: false,
            rawNames: ["Bercel", "Cecília", "Kevin", "Klotild"],
            hidden: ["Bercel", "Kevin"],
            normalized: ["Cecília", "Klotild"],
            ranking: ["Bercel", "Kevin"],
            combinedMissing: [missingEntry("Bercel"), missingEntry("Kevin", ["ranking"], true)],
            effectiveMissing: [missingEntry("Bercel")],
            locallyResolvedMissing: [missingEntry("Kevin", ["ranking"], true)],
          },
        ],
      },
      {
        month: 12,
        monthName: "December",
        rows: [
          {
            month: 12,
            day: 25,
            monthDay: "12-25",
            commonPreferredNames: ["Eugénia"],
            effectivePreferredNames: ["Eugénia", "Noel"],
            finalPrimaryNames: ["Eugénia"],
            localAddedPreferredNames: ["Noel"],
            source: "audited-registry",
            warning: false,
            rawNames: ["Eugénia", "Noel"],
            hidden: ["Noel"],
            normalized: ["Noel"],
            ranking: ["Noel"],
            combinedMissing: [missingEntry("Noel", ["normalized", "ranking"], true)],
            effectiveMissing: [],
            locallyResolvedMissing: [missingEntry("Noel", ["normalized", "ranking"], true)],
          },
        ],
      },
    ],
  };
}

function createHiddenFilterReport() {
  return {
    reportPath: "output/riportok/primer-audit.yaml",
    generatedAt: "2026-05-12T10:00:00.000Z",
    summary: {
      rowCount: 3,
      combinedMissingCount: 0,
      effectiveMissingCount: 0,
      locallyResolvedMissingCount: 0,
    },
    validations: {
      mismatchMonthDays: [],
      overrideMonthDays: [],
    },
    months: [
      {
        month: 1,
        monthName: "Január",
        rows: [
          {
            month: 1,
            day: 1,
            monthDay: "01-01",
            commonPreferredNames: ["Anna"],
            effectivePreferredNames: ["Anna"],
            finalPrimaryNames: ["Anna"],
            source: "legacy-wiki-exact",
            warning: false,
            rawNames: ["Anna", "Marianna"],
            hidden: [],
            combinedMissing: [],
            effectiveMissing: [],
            locallyResolvedMissing: [],
          },
          {
            month: 1,
            day: 2,
            monthDay: "01-02",
            commonPreferredNames: ["Bori"],
            effectivePreferredNames: ["Bori"],
            finalPrimaryNames: ["Bori"],
            source: "legacy-wiki-exact",
            warning: false,
            rawNames: ["Bori", "Cili"],
            hidden: ["Cili"],
            combinedMissing: [],
            effectiveMissing: [],
            locallyResolvedMissing: [],
          },
          {
            month: 1,
            day: 3,
            monthDay: "01-03",
            commonPreferredNames: ["Marianna"],
            effectivePreferredNames: ["Marianna"],
            finalPrimaryNames: ["Marianna"],
            source: "legacy-wiki-exact",
            warning: false,
            rawNames: ["Marianna"],
            hidden: [],
            combinedMissing: [],
            effectiveMissing: [],
            locallyResolvedMissing: [],
          },
        ],
      },
    ],
  };
}

test("a shared primer audit view-model felépíti a napi és névlistákat", () => {
  const viewModel = buildPrimerAuditViewModel(createSampleReport());
  const initialState = createPrimerAuditInitialState(viewModel);

  assert.equal(viewModel.days.length, 2);
  assert.equal(viewModel.names.length >= 3, true);
  assert.equal(visiblePrimerAuditNapok(viewModel, initialState).length, 2);
  assert.equal(visiblePrimerAuditNevek(viewModel, initialState).length >= 1, true);
});

test("a shared state kezeli a webes szűrési, keresési és kijelölési akciókat", () => {
  const viewModel = buildPrimerAuditViewModel(createSampleReport());
  let state = createPrimerAuditInitialState(viewModel);

  state = reducePrimerAuditState(state, { type: "set_mode", mod: "napok" }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_day_filter", filterId: "osszes" }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_day_query", query: "01-02" }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_day_index", index: 0 }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_day_panel", panel: "szemelyes" }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_personal_index", index: 0 }, viewModel);

  const normalized = normalizePrimerAuditState(state, viewModel);
  const selectedDay = getSelectedDay(viewModel, normalized);

  assert.equal(selectedDay.monthDay, "01-02");
  assert.equal(normalized.dayPanel, "szemelyes");

  state = reducePrimerAuditState(state, { type: "set_mode", mod: "nevek" }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_name_filter", filterId: "helyi" }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_name_query", query: "cili" }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_name_index", index: 0 }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_name_panel", panel: "elofordulasok" }, viewModel);
  state = reducePrimerAuditState(state, { type: "set_occurrence_index", index: 0 }, viewModel);

  const selectedName = getSelectedName(viewModel, normalizePrimerAuditState(state, viewModel));

  assert.equal(selectedName.name, "Cili");
});

test("a tiszta, nem leokézott primer audit szűrő kizárja az eltéréses napokat", () => {
  const viewModel = buildPrimerAuditViewModel(createSampleReport());
  const cleanUnauditedDays = visiblePrimerAuditNapok(viewModel, {
    dayFilterId: "nincs-auditalva-tiszta",
    dayQuery: "",
    daySortId: "datum",
  });

  assert.deepEqual(cleanUnauditedDays.map((day) => day.monthDay), ["01-01"]);
  assert.equal(dayMatchesFilter(viewModel.dayMap.get("01-01"), "nincs-auditalva-tiszta"), true);
  assert.equal(dayMatchesFilter(viewModel.dayMap.get("01-02"), "nincs-auditalva-tiszta"), false);
});

test("a rejtett napfilter és az exact névfilter pontos találatokkal dolgozik", () => {
  const viewModel = buildPrimerAuditViewModel(createHiddenFilterReport());
  const hiddenDays = visiblePrimerAuditNapok(viewModel, {
    dayFilterId: "rejtett",
    dayQuery: "",
    daySortId: "datum",
  });
  const annaDays = visiblePrimerAuditNapok(viewModel, {
    dayFilterId: "osszes",
    dayQuery: "",
    dayNameFilter: "Anna",
    daySortId: "datum",
  });

  assert.deepEqual(hiddenDays.map((day) => day.monthDay), ["01-02"]);
  assert.equal(dayMatchesFilter(viewModel.dayMap.get("01-02"), "rejtett"), true);
  assert.equal(dayMatchesFilter(viewModel.dayMap.get("01-03"), "rejtett"), false);
  assert.deepEqual(annaDays.map((day) => day.monthDay), ["01-01"]);
  assert.equal(dayMatchesExactNameFilter(viewModel.dayMap.get("01-03"), "Anna"), false);
});

test("a primer nélkül maradó állapotok külön jelzik az aktív, feloldott és raw-only neveket", () => {
  const viewModel = buildPrimerAuditViewModel(createMissingStateReport());
  const day0329 = viewModel.dayMap.get("03-29");
  const day0513 = viewModel.dayMap.get("05-13");
  const day0603 = viewModel.dayMap.get("06-03");
  const day1225 = viewModel.dayMap.get("12-25");

  assert.deepEqual(day0329.rawOnlyNonCandidateNames, ["Bercel"]);
  assert.deepEqual(day0329.activeMissingNames, []);
  assert.deepEqual(day0603.activeMissingNames, ["Bercel"]);
  assert.deepEqual(day0513.activeMissingNames, ["Noel"]);
  assert.deepEqual(day1225.resolvedMissingNames, ["Noel"]);
  assert.deepEqual(day1225.activeMissingNames, []);

  const bercelOccurrences = viewModel.names.find((entry) => entry.name === "Bercel")?.occurrences ?? [];
  const noelOccurrences = viewModel.names.find((entry) => entry.name === "Noel")?.occurrences ?? [];

  assert.equal(bercelOccurrences.find((entry) => entry.monthDay === "03-29")?.statusIds.includes("rawOnlyNonCandidate"), true);
  assert.equal(bercelOccurrences.find((entry) => entry.monthDay === "06-03")?.statusIds.includes("missing"), true);
  assert.equal(noelOccurrences.find((entry) => entry.monthDay === "05-13")?.statusIds.includes("missing"), true);
  assert.equal(noelOccurrences.find((entry) => entry.monthDay === "12-25")?.statusIds.includes("resolvedMissing"), true);
});
