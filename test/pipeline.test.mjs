import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";

import { betoltStrukturaltFajl } from "../kozos/strukturalt-fajl.mjs";

const repoRoot = process.cwd();
const startScript = path.join(repoRoot, "web", "server", "start.mjs");

function createLocalConfig() {
  return {
    version: 1,
    generatedAt: "2026-04-21T09:00:00.000Z",
    source: "helyi felhasználói beállítások",
    ics: {
      partitionMode: "single",
      shared: {
        input: "output/adatbazis/nevnapok.yaml",
        leapProfile: "off",
        fromYear: 2026,
        untilYear: 2040,
        baseYear: 2024,
      },
      single: {
        output: "output/naptar/nevnapok.ics",
        layout: "grouped",
        descriptionMode: "none",
        descriptionFormat: "text",
        ordinalDay: "none",
        includeOtherDays: false,
        calendarName: "Névnapok",
      },
      split: {
        primary: {
          output: "output/naptar/nevnapok-primary.ics",
          layout: "grouped",
          descriptionMode: "none",
          descriptionFormat: "text",
          ordinalDay: "none",
          includeOtherDays: false,
          calendarName: "Névnapok — elsődleges",
        },
        rest: {
          output: "output/naptar/nevnapok-rest.ics",
          layout: "grouped",
          descriptionMode: "none",
          descriptionFormat: "text",
          ordinalDay: "none",
          includeOtherDays: false,
          calendarName: "Névnapok — további",
        },
      },
    },
    personalPrimary: {
      primarySource: "default",
      modifiers: {
        normalized: false,
        ranking: false,
      },
      days: [],
    },
  };
}

async function copyPath(relativeSource, targetPath) {
  const sourcePath = path.join(repoRoot, relativeSource);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true });
}

async function prepareWorkspace(rootDir) {
  await copyPath("data/nevnapok_tisztitott_regi_nevkeszlet.ics", path.join(rootDir, "data", "nevnapok_tisztitott_regi_nevkeszlet.ics"));
  await copyPath("data/primary-registry-overrides.yaml", path.join(rootDir, "data", "primary-registry-overrides.yaml"));
  await copyPath("data/hivatalos-nevjegyzek-kivetelek.yaml", path.join(rootDir, "data", "hivatalos-nevjegyzek-kivetelek.yaml"));
  await copyPath("output/adatbazis/nevnapok.yaml", path.join(rootDir, "output", "adatbazis", "nevnapok.yaml"));
  await copyPath("output/primer", path.join(rootDir, "output", "primer"));
  await copyPath("output/riportok", path.join(rootDir, "output", "riportok"));
  await copyPath("output/pipeline/manifest.yaml", path.join(rootDir, "output", "pipeline", "manifest.yaml"));
  await fs.mkdir(path.join(rootDir, ".local"), { recursive: true });
  await fs.writeFile(
    path.join(rootDir, ".local", "nevnapok.local.yaml"),
    `${JSON.stringify(createLocalConfig(), null, 2)}\n`,
    "utf8"
  );
}

async function startServer(rootDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [startScript], {
      cwd: rootDir,
      env: {
        ...process.env,
        HOST: "127.0.0.1",
        PORT: "0",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdout += text;
      const match = text.match(/http:\/\/127\.0\.0\.1:(\d+)/u);

      if (match) {
        resolve({
          child,
          baseUrl: `http://127.0.0.1:${match[1]}`,
        });
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("exit", (code) => {
      reject(new Error(`A webszerver túl korán leállt (exit=${code}).\n${stdout}\n${stderr}`));
    });
    child.on("error", reject);
  });
}

async function stopServer(child) {
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    child.once("exit", () => resolve());
  });
}

function createWsClient(baseUrl) {
  const wsUrl = baseUrl.replace(/^http/u, "ws") + "/ws";

  return new Promise((resolve, reject) => {
    const socket = new WebSocket(wsUrl);
    const pending = new Map();
    const events = [];
    const waiters = [];
    let requestCounter = 0;

    function notify(event) {
      events.push(event);

      for (let index = waiters.length - 1; index >= 0; index -= 1) {
        if (waiters[index].predicate(event)) {
          waiters[index].resolve(event);
          waiters.splice(index, 1);
        }
      }
    }

    socket.on("open", () => {
      resolve({
        socket,
        events,
        requestRaw(tipus, payload = null) {
          return new Promise((requestResolve, requestReject) => {
            const id = `req-${requestCounter}`;
            requestCounter += 1;
            pending.set(id, { resolve: requestResolve, reject: requestReject });
            socket.send(
              JSON.stringify({
                id,
                tipus,
                payload,
              })
            );
          });
        },
        async request(tipus, payload = null) {
          const response = await this.requestRaw(tipus, payload);
          return response.data;
        },
        waitForEvent(predicate, timeoutMs = 20_000) {
          const existing = events.find(predicate);

          if (existing) {
            return Promise.resolve(existing);
          }

          return new Promise((eventResolve, eventReject) => {
            const timeoutId = setTimeout(() => {
              const index = waiters.findIndex((item) => item.resolve === eventResolve);

              if (index >= 0) {
                waiters.splice(index, 1);
              }
              eventReject(new Error("A várt websocket push esemény nem érkezett meg időben."));
            }, timeoutMs);

            waiters.push({
              predicate,
              resolve(event) {
                clearTimeout(timeoutId);
                eventResolve(event);
              },
            });
          });
        },
      });
    });

    socket.on("message", (raw) => {
      const text = String(raw);
      const bytes = Buffer.byteLength(text);
      const message = JSON.parse(text);

      if (message.replyTo) {
        const current = pending.get(message.replyTo) ?? null;

        if (!current) {
          return;
        }

        pending.delete(message.replyTo);

        if (message.ok === false) {
          const error = new Error(message.error?.message ?? "Websocket kérés sikertelen.");
          error.code = message.error?.code ?? "ws_error";
          error.details = message.error?.details ?? null;
          current.reject(error);
          return;
        }

        current.resolve({
          data: message.data ?? null,
          bytes,
        });
        return;
      }

      notify({
        ...message,
        bytes,
      });
    });

    socket.on("error", reject);
  });
}

test("a websocket contract summary + lazy payloadokra állt át, és az ICS letöltés végigjárható", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-websocket-"));
  await prepareWorkspace(workspace);
  const { child, baseUrl } = await startServer(workspace);

  t.after(async () => {
    await stopServer(child);
  });

  const client = await createWsClient(baseUrl);
  t.after(() => {
    client.socket.close();
  });

  const connectionEvent = await client.waitForEvent((event) => event.tipus === "connection:ready");
  assert.ok(connectionEvent.data.serverTime);

  const initialJobUpdate = await client.waitForEvent((event) => event.tipus === "job:update");
  assert.equal(typeof initialJobUpdate.data.activeJob, "object");
  assert.ok(initialJobUpdate.bytes < 1024);

  const dashboard = await client.requestRaw("dashboard:get");
  assert.equal(typeof dashboard.data.dashboard.pipelineKpi.total, "number");
  assert.ok(dashboard.bytes < 20_000);

  const primerSummary = await client.requestRaw("primer-audit:get-summary");
  assert.equal(primerSummary.data.primerAuditSummary.months.length, 12);
  assert.ok(primerSummary.bytes < 100_000);

  const primerMonth = await client.requestRaw("primer-audit:get-month", {
    month: 1,
    filterId: "osszes",
    query: "",
  });
  assert.equal(Array.isArray(primerMonth.data.primerAuditMonth.rows), true);
  assert.ok(primerMonth.bytes < 400_000);

  const wikiSummary = await client.requestRaw("audits:get-detail-summary", {
    auditId: "wiki-vs-legacy",
  });
  assert.equal(Array.isArray(wikiSummary.data.auditDetail.monthSummaries), true);
  assert.ok(wikiSummary.bytes < 100_000);

  const wikiMonth = await client.requestRaw("audits:get-detail-month", {
    auditId: "wiki-vs-legacy",
    month: 1,
    query: "",
  });
  assert.equal(Array.isArray(wikiMonth.data.auditMonth.month.rows), true);
  assert.ok(wikiMonth.bytes < 200_000);

  const editor = await client.request("ics:get-editor");
  assert.equal(editor.icsEditor.savedSettings.partitionMode, "single");

  const preview = await client.request("ics:preview", {
    settings: editor.icsEditor.savedSettings,
  });
  assert.equal(preview.icsPreview.mode, "single");
  assert.equal(preview.icsPreview.panels.length, 1);
  assert.match(preview.icsPreview.panels[0].rawText, /BEGIN:VCALENDAR/u);

  const generatePromise = client.request("ics:generate", {
    settings: editor.icsEditor.savedSettings,
  });
  const runningEvent = await client.waitForEvent((event) => event.tipus === "job:update" && event.data.activeJob);
  assert.equal(runningEvent.data.activeJob.status, "running");
  assert.ok(runningEvent.bytes < 1024);

  const logEvent = await client.waitForEvent((event) => event.tipus === "job:log" && event.data.jobId === runningEvent.data.activeJob.id);
  assert.equal(typeof logEvent.data.entry.message, "string");
  assert.ok(logEvent.bytes < 1024);

  const generated = await generatePromise;
  assert.equal(Array.isArray(generated.downloads), true);
  assert.equal(generated.downloads.length >= 1, true);

  const finishedEvent = await client.waitForEvent((event) => event.tipus === "job:finished");
  assert.equal(finishedEvent.data.job.status, "completed");
  assert.ok(finishedEvent.bytes < 2048);

  const downloadResponse = await fetch(`${baseUrl}${generated.downloads[0].url}`);
  assert.equal(downloadResponse.status, 200);
  assert.match(await downloadResponse.text(), /BEGIN:VCALENDAR/u);

  const longAuditPromise = client.request("audits:run", {
    auditId: "primer-audit",
  });
  const conflictEvent = await client.waitForEvent(
    (event) => event.tipus === "job:update" && event.data.activeJob?.kind === "audit"
  );
  assert.equal(conflictEvent.data.activeJob.target, "primer-audit");

  await assert.rejects(
    () =>
      client.request("ics:save", {
        settings: editor.icsEditor.savedSettings,
      }),
    (error) => {
      assert.equal(error.code, "active_job_conflict");
      assert.ok(error.details.activeJob);
      return true;
    }
  );

  await longAuditPromise;
});

test("a hivatalos kivétellista mentése websocketen át a kézi forrásfájlt módosítja", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-official-exceptions-"));
  await prepareWorkspace(workspace);
  const { child, baseUrl } = await startServer(workspace);

  t.after(async () => {
    await stopServer(child);
  });

  const client = await createWsClient(baseUrl);
  t.after(() => {
    client.socket.close();
  });

  const detail = await client.request("audits:get-detail-summary", {
    auditId: "hivatalos-nevjegyzek",
  });
  const firstMaleList = detail.auditDetail.genders.find((entry) => entry.id === "male").lists[0].rows;

  await client.request("audits:save-official-exceptions", {
    notes: "Tesztelt módosítás",
    sources: {
      hivatalosNevjegyzekDatum: "2025-07-31",
      elteAdatbazisDatum: "2025-08-12",
    },
    genders: {
      male: {
        extraInJson: [...firstMaleList, { name: "Teszt Elek", indoklas: "Teszt ok", forrasDatum: "2026-04-21" }],
        missingFromJson: [],
      },
      female: {
        extraInJson: [],
        missingFromJson: [],
      },
    },
    rerun: false,
  });

  const saved = await betoltStrukturaltFajl(path.join(workspace, "data", "hivatalos-nevjegyzek-kivetelek.yaml"));
  assert.equal(saved.megjegyzes, "Tesztelt módosítás");
  assert.equal(saved.genders.male.extraInJson.some((entry) => entry.name === "Teszt Elek"), true);
});

test("a primer audit lazy websocket editorai mentik a követett és a helyi réteget is", async (t) => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "nevnapok-primer-editor-"));
  await prepareWorkspace(workspace);
  const { child, baseUrl } = await startServer(workspace);

  t.after(async () => {
    await stopServer(child);
  });

  const client = await createWsClient(baseUrl);
  t.after(() => {
    client.socket.close();
  });

  const summaryBefore = await client.request("primer-audit:get-summary");
  assert.equal(summaryBefore.primerAuditSummary.months.length, 12);

  const names = await client.request("primer-audit:get-names", {
    filterId: "osszes",
    query: "Ábel",
    sortId: "relevancia",
    page: 1,
    pageSize: 50,
  });
  assert.equal(Array.isArray(names.primerAuditNames.items), true);

  await client.request("primer-audit:save-local-day", {
    monthDay: "01-01",
    addedPreferredNames: ["Bazil"],
  });

  const localConfig = await betoltStrukturaltFajl(path.join(workspace, ".local", "nevnapok.local.yaml"));
  assert.equal(localConfig.personalPrimary.days.some((entry) => entry.monthDay === "01-01"), true);

  const commonSave = await client.request("primer-audit:save-common-day", {
    monthDay: "01-02",
    preferredNames: ["Ábel", "Alpár"],
    rerun: true,
  });
  assert.equal(commonSave.primerAuditSummary.months.length, 12);

  const trackedOverrides = await betoltStrukturaltFajl(path.join(workspace, "data", "primary-registry-overrides.yaml"));
  const updatedDay = trackedOverrides.days.find((entry) => entry.monthDay === "01-02");
  assert.deepEqual(updatedDay.preferredNames, ["Ábel", "Alpár"]);
});
