import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizalAuditaltPrimerRegistryPayload,
} from "../domainek/primer/auditalt-primer-registry.mjs";

test("az auditált primer registry duplikátummentes és stabil napi szerkezetet ad", () => {
  const payload = normalizalAuditaltPrimerRegistryPayload({
    version: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    days: [
      {
        monthDay: "01-02",
        names: ["Ábel", "Ábel", "Alpár"],
        preferredNames: ["Alpár", "Alpár"],
        auditedAt: "2026-04-30T08:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(payload.days[0], {
    month: 1,
    day: 2,
    monthDay: "01-02",
    names: ["Ábel", "Alpár"],
    preferredNames: ["Alpár"],
    auditedAt: "2026-04-30T08:00:00.000Z",
  });
});

test("az auditált primer név csak a napi teljes névlistából jöhet", () => {
  assert.throws(
    () =>
      normalizalAuditaltPrimerRegistryPayload({
        days: [
          {
            monthDay: "01-02",
            names: ["Ábel"],
            preferredNames: ["Alpár"],
          },
        ],
      }),
    /nincs benne a napi teljes névlistában/u
  );
});
