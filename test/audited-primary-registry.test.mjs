import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  allitAuditaltPrimerNapokat,
  betoltAuditaltPrimerRegistryt,
  mentAuditaltPrimerRegistryt,
  normalizalAuditaltPrimerRegistryPayload,
} from "../domainek/primer/auditalt-primer-registry.mjs";

async function createTempRegistry(payload) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "audited-primary-registry-"));
  const filePath = path.join(dir, "registry.yaml");

  await mentAuditaltPrimerRegistryt(payload, filePath);

  return filePath;
}

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

test("a tömeges auditált primer művelet jóváhagy és resetel több napot egy írásban", async () => {
  const filePath = await createTempRegistry({
    version: 1,
    generatedAt: "2026-04-30T00:00:00.000Z",
    days: [
      {
        monthDay: "01-01",
        names: ["Fruzsina"],
        preferredNames: ["Fruzsina"],
        auditedAt: null,
      },
      {
        monthDay: "01-02",
        names: ["Ábel", "Alpár"],
        preferredNames: ["Ábel"],
        auditedAt: "2026-04-30T08:00:00.000Z",
      },
    ],
  });

  const approved = await allitAuditaltPrimerNapokat({
    action: "approve",
    monthDays: ["01-01", "01-02", "01-01"],
    auditedAt: "2026-05-12T10:00:00.000Z",
    filePath,
  });
  let registry = await betoltAuditaltPrimerRegistryt(filePath);

  assert.equal(approved.changedCount, 2);
  assert.deepEqual(registry.payload.days.map((day) => day.auditedAt), [
    "2026-05-12T10:00:00.000Z",
    "2026-05-12T10:00:00.000Z",
  ]);
  assert.deepEqual(registry.payload.days[1].names, ["Ábel", "Alpár"]);
  assert.deepEqual(registry.payload.days[1].preferredNames, ["Ábel"]);

  const reset = await allitAuditaltPrimerNapokat({
    action: "reset",
    monthDays: ["01-02"],
    filePath,
  });
  registry = await betoltAuditaltPrimerRegistryt(filePath);

  assert.equal(reset.changedCount, 1);
  assert.equal(registry.payload.days[0].auditedAt, "2026-05-12T10:00:00.000Z");
  assert.equal(registry.payload.days[1].auditedAt, null);
  assert.deepEqual(registry.payload.days[1].names, ["Ábel", "Alpár"]);
  assert.deepEqual(registry.payload.days[1].preferredNames, ["Ábel"]);
});

test("a tömeges auditált primer művelet üres naplistára hibát ad", async () => {
  const filePath = await createTempRegistry({
    days: [
      {
        monthDay: "01-01",
        names: ["Fruzsina"],
        preferredNames: ["Fruzsina"],
        auditedAt: null,
      },
    ],
  });

  await assert.rejects(
    () =>
      allitAuditaltPrimerNapokat({
        action: "approve",
        monthDays: [],
        filePath,
      }),
    /legalább egy nap/u
  );
});
