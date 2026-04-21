import test from "node:test";
import assert from "node:assert/strict";

import { buildPrimerAuditViewModel, visiblePrimerAuditNapok, visiblePrimerAuditNevek } from "../tui/primer-audit/view-model.mjs";
import {
  createPrimerAuditInitialState,
  getSelectedDay,
  getSelectedName,
  reducePrimerAuditState,
} from "../tui/primer-audit/state.mjs";

function createSampleReport() {
  return {
    reportPath: "output/riportok/primer-audit.yaml",
    generatedAt: "2026-04-20T12:00:00.000Z",
    summary: {
      rowCount: 3,
      combinedMissingCount: 2,
      effectiveMissingCount: 1,
      locallyResolvedMissingCount: 1,
      localSelectedCount: 1,
      overrideDayCount: 1,
      mismatchDayCount: 1,
    },
    validations: {
      mismatchMonthDays: ["01-03"],
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
            finalPrimaryCount: 1,
            source: "legacy-wiki-exact",
            warning: false,
            legacy: ["Ábel"],
            wiki: ["Ábel"],
            normalized: ["Ábel"],
            ranking: ["Ábel"],
            rawNames: ["Ábel", "Abigél"],
            hidden: ["Abigél"],
            combinedMissing: [],
            normalizedMissing: [],
            rankingMissing: [],
            localSelectedNames: [],
            localSelectedCount: 0,
            personalEntries: [],
            sections: {
              osszefoglalo: {
                preferredNames: ["Ábel"],
                commonPreferredNames: ["Ábel"],
                localAddedPreferredNames: [],
                effectivePreferredNames: ["Ábel"],
                source: "legacy-wiki-exact",
                warning: false,
                hiddenCount: 1,
                combinedMissingCount: 0,
                locallyResolvedMissingCount: 0,
                effectiveMissingCount: 0,
                localSelectedCount: 0,
                rawNameCount: 2,
              },
              forrasok: {
                preferredNames: ["Ábel"],
                commonPreferredNames: ["Ábel"],
                localAddedPreferredNames: [],
                effectivePreferredNames: ["Ábel"],
                legacy: ["Ábel"],
                wiki: ["Ábel"],
                normalized: ["Ábel"],
                ranking: ["Ábel"],
                hidden: ["Abigél"],
                rawNames: ["Ábel", "Abigél"],
                source: "legacy-wiki-exact",
                warning: false,
              },
              hianyzok: {
                combinedMissing: [],
                normalizedMissing: [],
                rankingMissing: [],
                locallyResolvedMissing: [],
                effectiveMissing: [],
              },
              szemelyes: {
                settingsSnapshot: {
                  primarySource: "default",
                  modifiers: {
                    normalized: false,
                    ranking: false,
                  },
                },
                selectedNames: [],
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
            effectivePreferredCount: 2,
            finalPrimaryNames: ["Bori"],
            finalPrimaryCount: 1,
            source: "manual-override",
            warning: false,
            legacy: ["Bori"],
            wiki: ["Bori"],
            normalized: ["Cili"],
            ranking: ["Cili"],
            rawNames: ["Bori", "Cili", "Bella"],
            hidden: ["Bella", "Cili"],
            combinedMissing: [
              {
                name: "Cili",
                sources: ["normalized", "ranking"],
                highlight: false,
                similarPrimaries: [],
                localSelected: true,
              },
            ],
            normalizedMissing: [
              {
                name: "Cili",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
                localSelected: true,
              },
            ],
            rankingMissing: [
              {
                name: "Cili",
                sources: ["ranking"],
                highlight: false,
                similarPrimaries: [],
                localSelected: true,
              },
            ],
            locallyResolvedMissing: [
              {
                name: "Cili",
                sources: ["normalized", "ranking"],
                highlight: false,
                similarPrimaries: [],
                localSelected: true,
              },
            ],
            effectiveMissing: [],
            localSelectedNames: ["Cili"],
            localSelectedCount: 1,
            personalEntries: [
              {
                name: "Cili",
                sources: ["normalized", "ranking"],
                highlight: false,
                similarPrimaries: [],
                localSelected: true,
                localSelectable: true,
              },
            ],
            sections: {
              osszefoglalo: {
                preferredNames: ["Bori"],
                commonPreferredNames: ["Bori"],
                localAddedPreferredNames: ["Cili"],
                effectivePreferredNames: ["Bori", "Cili"],
                source: "manual-override",
                warning: false,
                hiddenCount: 2,
                combinedMissingCount: 1,
                locallyResolvedMissingCount: 1,
                effectiveMissingCount: 0,
                localSelectedCount: 1,
                rawNameCount: 3,
              },
              forrasok: {
                preferredNames: ["Bori"],
                commonPreferredNames: ["Bori"],
                localAddedPreferredNames: ["Cili"],
                effectivePreferredNames: ["Bori", "Cili"],
                legacy: ["Bori"],
                wiki: ["Bori"],
                normalized: ["Cili"],
                ranking: ["Cili"],
                hidden: ["Bella", "Cili"],
                rawNames: ["Bori", "Cili", "Bella"],
                source: "manual-override",
                warning: false,
              },
              hianyzok: {
                combinedMissing: [
                  {
                    name: "Cili",
                    sources: ["normalized", "ranking"],
                    highlight: false,
                    similarPrimaries: [],
                    localSelected: true,
                  },
                ],
                normalizedMissing: [],
                rankingMissing: [],
                locallyResolvedMissing: [
                  {
                    name: "Cili",
                    sources: ["normalized", "ranking"],
                    highlight: false,
                    similarPrimaries: [],
                    localSelected: true,
                  },
                ],
                effectiveMissing: [],
              },
              szemelyes: {
                settingsSnapshot: {
                  primarySource: "default",
                  modifiers: {
                    normalized: false,
                    ranking: false,
                  },
                },
                selectedNames: ["Cili"],
                entries: [
                  {
                    name: "Cili",
                    sources: ["normalized", "ranking"],
                    highlight: false,
                    similarPrimaries: [],
                    localSelected: true,
                    localSelectable: true,
                  },
                ],
              },
            },
          },
          {
            month: 1,
            day: 3,
            monthDay: "01-03",
            commonPreferredNames: ["Dóra"],
            effectivePreferredNames: ["Dóra"],
            finalPrimaryNames: ["Dóra"],
            finalPrimaryCount: 1,
            source: "legacy-wiki-exact",
            warning: false,
            legacy: ["Dóra"],
            wiki: ["Dóra"],
            normalized: ["Dóra", "Dorka"],
            ranking: ["Dóra"],
            rawNames: ["Dóra", "Dorka"],
            hidden: ["Dorka"],
            combinedMissing: [
              {
                name: "Dorka",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
                localSelected: false,
              },
            ],
            normalizedMissing: [],
            rankingMissing: [],
            locallyResolvedMissing: [],
            effectiveMissing: [
              {
                name: "Dorka",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
                localSelected: false,
              },
            ],
            localSelectedNames: [],
            localSelectedCount: 0,
            personalEntries: [
              {
                name: "Dorka",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
                localSelected: false,
                localSelectable: true,
              },
            ],
            sections: {
              osszefoglalo: {
                preferredNames: ["Dóra"],
                commonPreferredNames: ["Dóra"],
                localAddedPreferredNames: [],
                effectivePreferredNames: ["Dóra"],
                source: "legacy-wiki-exact",
                warning: false,
                hiddenCount: 1,
                combinedMissingCount: 1,
                locallyResolvedMissingCount: 0,
                effectiveMissingCount: 1,
                localSelectedCount: 0,
                rawNameCount: 2,
              },
              forrasok: {
                preferredNames: ["Dóra"],
                commonPreferredNames: ["Dóra"],
                localAddedPreferredNames: [],
                effectivePreferredNames: ["Dóra"],
                legacy: ["Dóra"],
                wiki: ["Dóra"],
                normalized: ["Dóra", "Dorka"],
                ranking: ["Dóra"],
                hidden: ["Dorka"],
                rawNames: ["Dóra", "Dorka"],
                source: "legacy-wiki-exact",
                warning: false,
              },
              hianyzok: {
                combinedMissing: [
                  {
                    name: "Dorka",
                    sources: ["normalized"],
                    highlight: false,
                    similarPrimaries: [],
                    localSelected: false,
                  },
                ],
                normalizedMissing: [],
                rankingMissing: [],
                locallyResolvedMissing: [],
                effectiveMissing: [
                  {
                    name: "Dorka",
                    sources: ["normalized"],
                    highlight: false,
                    similarPrimaries: [],
                    localSelected: false,
                  },
                ],
              },
              szemelyes: {
                settingsSnapshot: {
                  primarySource: "default",
                  modifiers: {
                    normalized: false,
                    ranking: false,
                  },
                },
                selectedNames: [],
                entries: [
                  {
                    name: "Dorka",
                    sources: ["normalized"],
                    highlight: false,
                    similarPrimaries: [],
                    localSelected: false,
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

test("a primer audit view-model felépíti az akciózható napi queue-kat és a teljes névindexet", () => {
  const viewModel = buildPrimerAuditViewModel(createSampleReport());
  const akciozhatoQueue = viewModel.queues.find((item) => item.azonosito === "akciozhato");
  const missingQueue = viewModel.queues.find((item) => item.azonosito === "hianyzos");
  const cili = viewModel.nameMap.get("Cili");
  const dorka = viewModel.nameMap.get("Dorka");

  assert.equal(akciozhatoQueue.count, 2);
  assert.equal(missingQueue.count, 1);
  assert.equal(viewModel.dayMap.get("01-01").commonPreferredNames[0], "Ábel");
  assert.deepEqual(viewModel.dayMap.get("01-02").effectivePreferredNames, ["Bori", "Cili"]);
  assert.deepEqual(cili.sources, ["normalized", "ranking", "raw", "hidden", "local"]);
  assert.equal(cili.counts.missing, 0);
  assert.equal(cili.counts.local, 1);
  assert.equal(cili.occurrences[0].monthDay, "01-02");
  assert.deepEqual(dorka.sources, ["normalized", "raw", "hidden"]);
  assert.equal(dorka.counts.missing, 1);
});

test("a primer audit TUI állapotgépe kezeli a módváltást, szűrést, keresést és a drawer állapotát", () => {
  const viewModel = buildPrimerAuditViewModel(createSampleReport());
  let state = createPrimerAuditInitialState(viewModel);

  state = reducePrimerAuditState(state, { type: "activate_enter" }, viewModel);
  assert.equal(state.aktivMod, "napok");
  assert.equal(state.dayFilterId, "akciozhato");

  state = reducePrimerAuditState(state, { type: "cycle_filter", irany: 1 }, viewModel);
  assert.equal(state.dayFilterId, "hianyzos");
  assert.equal(visiblePrimerAuditNapok(viewModel, state).length, 1);

  state = reducePrimerAuditState(state, { type: "start_search" }, viewModel);
  state = reducePrimerAuditState(state, { type: "append_search", char: "0" }, viewModel);
  state = reducePrimerAuditState(state, { type: "append_search", char: "1" }, viewModel);
  state = reducePrimerAuditState(state, { type: "append_search", char: "-" }, viewModel);
  state = reducePrimerAuditState(state, { type: "append_search", char: "0" }, viewModel);
  state = reducePrimerAuditState(state, { type: "append_search", char: "3" }, viewModel);
  state = reducePrimerAuditState(state, { type: "confirm_search" }, viewModel);

  const szurtNapok = visiblePrimerAuditNapok(viewModel, state);
  assert.equal(szurtNapok.length, 1);
  assert.equal(szurtNapok[0].monthDay, "01-03");

  state = reducePrimerAuditState(state, { type: "toggle_drawer" }, viewModel);
  assert.equal(state.settingsDrawerOpen, true);
  state = reducePrimerAuditState(state, { type: "drawer_move", irany: 1 }, viewModel);
  assert.equal(state.settingsIndex, 1);
});

test("a primer audit névnézetéből Enterrel át lehet ugrani a megfelelő napi auditnézetre", () => {
  const viewModel = buildPrimerAuditViewModel(createSampleReport());
  let state = createPrimerAuditInitialState(viewModel);

  state = reducePrimerAuditState(state, { type: "set_mode", mod: "nevek" }, viewModel);
  state = reducePrimerAuditState(state, { type: "start_search" }, viewModel);
  for (const char of ["C", "i", "l", "i"]) {
    state = reducePrimerAuditState(state, { type: "append_search", char }, viewModel);
  }
  state = reducePrimerAuditState(state, { type: "confirm_search" }, viewModel);

  assert.equal(visiblePrimerAuditNevek(viewModel, state).length, 1);
  assert.equal(getSelectedName(viewModel, state).name, "Cili");

  state = reducePrimerAuditState(state, { type: "activate_enter" }, viewModel);
  assert.equal(state.namePanel, "elofordulasok");

  state = reducePrimerAuditState(state, { type: "activate_enter" }, viewModel);
  assert.equal(state.aktivMod, "napok");
  assert.equal(state.dayFilterId, "osszes");
  assert.equal(getSelectedDay(viewModel, state).monthDay, "01-02");
});
