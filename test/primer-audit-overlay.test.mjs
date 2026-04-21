import test from "node:test";
import assert from "node:assert/strict";

import {
  alkalmazHelyiPrimerOverlaytPrimerAuditRiporton,
  buildVeglegesitettHelyiPrimerMapotPrimerAuditRiportbol,
} from "../domainek/auditok/primer-audit.mjs";

test("a primer audit helyi overlay a közös alapra merge-eli a módosítókat és a kézi helyi neveket", () => {
  const riport = {
    generatedAt: "2026-04-20T12:00:00.000Z",
    summary: {
      rowCount: 1,
      combinedMissingCount: 2,
    },
    personal: {
      settingsSnapshot: {
        primarySource: "default",
        modifiers: {
          normalized: true,
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
            day: 2,
            monthDay: "01-02",
            finalPrimaryNames: ["Ábel"],
            commonPreferredNames: ["Ábel"],
            rawNames: ["Ábel", "Alpár", "Béla"],
            legacy: ["Ábel"],
            wiki: ["Ábel"],
            normalized: ["Ábel", "Alpár"],
            ranking: ["Ábel", "Béla"],
            hidden: ["Alpár", "Béla"],
            combinedMissing: [
              {
                name: "Alpár",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
              },
              {
                name: "Béla",
                sources: ["ranking"],
                highlight: false,
                similarPrimaries: [],
              },
            ],
            normalizedMissing: [
              {
                name: "Alpár",
                sources: ["normalized"],
                highlight: false,
                similarPrimaries: [],
              },
            ],
            rankingMissing: [
              {
                name: "Béla",
                sources: ["ranking"],
                highlight: false,
                similarPrimaries: [],
              },
            ],
            sections: {
              osszefoglalo: {
                preferredNames: ["Ábel"],
              },
              forrasok: {
                preferredNames: ["Ábel"],
              },
              hianyzok: {
                combinedMissing: [
                  {
                    name: "Alpár",
                    sources: ["normalized"],
                    highlight: false,
                    similarPrimaries: [],
                  },
                  {
                    name: "Béla",
                    sources: ["ranking"],
                    highlight: false,
                    similarPrimaries: [],
                  },
                ],
                normalizedMissing: [
                  {
                    name: "Alpár",
                    sources: ["normalized"],
                    highlight: false,
                    similarPrimaries: [],
                  },
                ],
                rankingMissing: [
                  {
                    name: "Béla",
                    sources: ["ranking"],
                    highlight: false,
                    similarPrimaries: [],
                  },
                ],
              },
              szemelyes: {
                settingsSnapshot: {
                  primarySource: "default",
                  modifiers: {
                    normalized: true,
                    ranking: false,
                  },
                },
                selectedNames: [],
                entries: [],
              },
            },
          },
        ],
      },
    ],
  };

  const helyiFelulirasok = {
    primarySource: "default",
    modifiers: {
      normalized: true,
      ranking: false,
    },
    days: [
      {
        month: 1,
        day: 2,
        monthDay: "01-02",
        addedPreferredNames: ["Béla"],
      },
    ],
  };

  const friss = alkalmazHelyiPrimerOverlaytPrimerAuditRiporton(riport, {
    localSettings: helyiFelulirasok,
    localOverridesPayload: helyiFelulirasok,
  });
  const sor = friss.months[0].rows[0];
  const veglegesitettMap = buildVeglegesitettHelyiPrimerMapotPrimerAuditRiportbol(friss);

  assert.deepEqual(sor.commonPreferredNames, ["Ábel"]);
  assert.deepEqual(sor.localAddedPreferredNames, ["Alpár", "Béla"]);
  assert.deepEqual(sor.effectivePreferredNames, ["Ábel", "Alpár", "Béla"]);
  assert.deepEqual((sor.locallyResolvedMissing ?? []).map((entry) => entry.name), ["Alpár", "Béla"]);
  assert.deepEqual(sor.effectiveMissing, []);
  assert.equal(friss.summary.locallyResolvedMissingCount, 2);
  assert.equal(friss.summary.effectiveMissingCount, 0);
  assert.deepEqual(veglegesitettMap.get("01-02")?.addedPreferredNames, ["Alpár", "Béla"]);
});
