import test from "node:test";
import assert from "node:assert/strict";

import { buildPrimerAuditViewModel, visiblePrimerAuditNapok, visiblePrimerAuditNevek } from "../web/shared/primer-audit/view-model.mjs";
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

test("a shared primer audit view-model felépíti a napi és névlistákat", () => {
  const viewModel = buildPrimerAuditViewModel(createSampleReport());
  const initialState = createPrimerAuditInitialState(viewModel);

  assert.equal(viewModel.days.length, 2);
  assert.equal(viewModel.names.length >= 3, true);
  assert.equal(visiblePrimerAuditNapok(viewModel, initialState).length, 1);
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
