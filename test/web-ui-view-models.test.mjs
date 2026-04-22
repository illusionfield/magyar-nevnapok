import test from "node:test";
import assert from "node:assert/strict";

import { defaultMonthOpen, withMonthMatches } from "../web/client/src/features/shared/month-groups.js";
import {
  flagsToLeapProfile,
  isIcsDraftDirty,
  leapProfileToFlags,
  setNestedValue,
} from "../web/client/src/features/shared/ics-draft.js";

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

test("az A és B checkbox leképezése stabilan állítja elő a leap profile értékét", () => {
  assert.equal(flagsToLeapProfile({ aEnabled: false, bEnabled: false }), "off");
  assert.equal(flagsToLeapProfile({ aEnabled: true, bEnabled: false }), "hungarian-a");
  assert.equal(flagsToLeapProfile({ aEnabled: false, bEnabled: true }), "hungarian-b");
  assert.equal(flagsToLeapProfile({ aEnabled: true, bEnabled: true }), "hungarian-both");

  assert.deepEqual(leapProfileToFlags("off"), { aEnabled: false, bEnabled: false });
  assert.deepEqual(leapProfileToFlags("hungarian-a"), { aEnabled: true, bEnabled: false });
  assert.deepEqual(leapProfileToFlags("hungarian-b"), { aEnabled: false, bEnabled: true });
  assert.deepEqual(leapProfileToFlags("hungarian-both"), { aEnabled: true, bEnabled: true });
});

test("a nested settings helper csak a célkulcsot írja felül", () => {
  const original = {
    shared: {
      fromYear: 2026,
      untilYear: 2040,
    },
    split: {
      primary: {
        calendarName: "Első",
      },
    },
  };

  const updated = setNestedValue(original, "split.primary.calendarName", "Másik");

  assert.equal(updated.split.primary.calendarName, "Másik");
  assert.equal(updated.shared.fromYear, 2026);
  assert.equal(original.split.primary.calendarName, "Első");
});
