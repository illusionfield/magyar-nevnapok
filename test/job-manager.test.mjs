import test from "node:test";
import assert from "node:assert/strict";

import { ActiveJobConflictError, JobManager, MAX_JOB_LOG_LINES } from "../web/server/job-manager.mjs";

test("a JobManager egyszerre csak egy aktív módosító műveletet enged", async () => {
  const manager = new JobManager();
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });

  const firstJob = await manager.startJob({
    kind: "pipeline",
    target: "teljes",
    handler: async ({ reporter }) => {
      reporter.info("job started");
      await pending;
      reporter.info("job finished");
      return { ok: true };
    },
  });

  assert.equal(firstJob.status, "running");
  assert.equal(manager.getState().activeJob?.id, firstJob.id);

  await assert.rejects(
    () =>
      manager.startJob({
        kind: "output",
        target: "ics",
        handler: async () => ({ ok: true }),
      }),
    (error) => {
      assert.equal(error instanceof ActiveJobConflictError, true);
      assert.equal(error.statusCode, 409);
      return true;
    }
  );

  release();

  await new Promise((resolve) => {
    setTimeout(resolve, 20);
  });

  assert.equal(manager.getState().activeJob, null);
  assert.equal(manager.getState().lastJob?.status, "completed");
});

test("a JobManager capped log tailt tart csak memóriában, miközben a logszámláló nő", async () => {
  const manager = new JobManager();

  const finishedJob = await manager.startJob({
    kind: "audit",
    target: "spam",
    handler: async ({ reporter }) => {
      for (let index = 0; index < MAX_JOB_LOG_LINES + 25; index += 1) {
        reporter.info(`sor-${index}`);
      }

      return { ok: true };
    },
  });

  const settled = await manager.whenSettled(finishedJob.id);
  const tail = manager.getLogTail(finishedJob.id);

  assert.equal(settled.status, "completed");
  assert.equal(settled.logCount, MAX_JOB_LOG_LINES + 25);
  assert.equal(tail.length, MAX_JOB_LOG_LINES);
  assert.equal(tail[0].message, "sor-25");
  assert.equal(tail.at(-1).message, `sor-${MAX_JOB_LOG_LINES + 24}`);
  assert.equal("logs" in manager.getState().lastJob, false);
});

test("a JobManager továbbadja a strukturált stage/progress/sections állapotot is", async () => {
  const manager = new JobManager();

  const startedJob = await manager.startJob({
    kind: "pipeline",
    target: "primer-audit",
    workspace: "pipeline",
    handler: async ({ reporter }) => {
      reporter.stage("Előkészítés");
      reporter.progress(1, 4);
      reporter.sections([
        { id: "one", label: "Első lépés", status: "running" },
      ]);
      return { ok: true };
    },
  });

  assert.equal(startedJob.workspace, "pipeline");
  const settled = await manager.whenSettled(startedJob.id);

  assert.equal(settled.stageLabel, "Előkészítés");
  assert.equal(settled.progress.percent, 25);
  assert.deepEqual(settled.sections, [
    { id: "one", label: "Első lépés", status: "running" },
  ]);
});
