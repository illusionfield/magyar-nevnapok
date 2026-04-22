import test from "node:test";
import assert from "node:assert/strict";

import { defaultMonthOpen, withMonthMatches } from "../web/client/src/features/shared/month-groups.js";
import { isIcsDraftDirty } from "../web/client/src/features/shared/ics-draft.js";

test("a havi accordion helper csak explicit találatnál vagy piszkos állapotnál nyit ki automatikusan", () => {
  const groups = withMonthMatches(
    [
      {
        month: 1,
        items: [{ id: 1 }, { id: 2 }],
        summary: { total: 2, missing: 0, local: 0, overrides: 0, mismatches: 0 },
        hasDirty: false,
      },
      {
        month: 2,
        items: [{ id: 3 }],
        summary: { total: 1, missing: 1, local: 0, overrides: 0, mismatches: 0 },
        hasDirty: false,
      },
      {
        month: 3,
        items: [{ id: 4 }],
        summary: { total: 1, missing: 0, local: 0, overrides: 0, mismatches: 0 },
        hasDirty: true,
      },
    ],
    (item) => item.id === 2
  );

  assert.equal(defaultMonthOpen(groups[0], { query: "keresett" }), true);
  assert.equal(defaultMonthOpen(groups[1]), false);
  assert.equal(defaultMonthOpen(groups[1], { openOnSummarySignals: true }), true);
  assert.equal(defaultMonthOpen(groups[2]), true);
});

test("az ICS draft helper csak eltérés esetén jelez piszkos állapotot", () => {
  const saved = {
    partitionMode: "single",
    shared: {
      fromYear: 2026,
    },
  };
  const same = {
    partitionMode: "single",
    shared: {
      fromYear: 2026,
    },
  };
  const changed = {
    partitionMode: "split",
    shared: {
      fromYear: 2026,
    },
  };

  assert.equal(isIcsDraftDirty(saved, same), false);
  assert.equal(isIcsDraftDirty(saved, changed), true);
});
