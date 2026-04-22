import crypto from "node:crypto";
import { EventEmitter } from "node:events";
import { createReporter } from "../../kozos/reporter.mjs";

export const MAX_JOB_LOG_LINES = 200;

function nowIso() {
  return new Date().toISOString();
}

function cloneLogEntry(entry) {
  if (!entry) {
    return null;
  }

  return {
    level: entry.level,
    message: entry.message,
    timestamp: entry.timestamp,
  };
}

function cloneJobSummary(job) {
  if (!job) {
    return null;
  }

  return {
    id: job.id,
    kind: job.kind,
    target: job.target,
    status: job.status,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    logCount: job.logCount ?? 0,
    result: job.result ?? null,
    error: job.error ?? null,
  };
}

export class ActiveJobConflictError extends Error {
  constructor(job) {
    super("Már fut egy aktív módosító művelet.");
    this.name = "ActiveJobConflictError";
    this.statusCode = 409;
    this.code = "active_job_conflict";
    this.job = cloneJobSummary(job);
  }
}

export class JobManager {
  constructor() {
    this.activeJob = null;
    this.lastJob = null;
    this.events = new EventEmitter();
    this.pendingSettlements = new Map();
  }

  getState() {
    return {
      activeJob: cloneJobSummary(this.activeJob),
      lastJob: cloneJobSummary(this.lastJob),
    };
  }

  subscribe(listener) {
    this.events.on("update", listener);
    return () => {
      this.events.off("update", listener);
    };
  }

  subscribeLogs(listener) {
    this.events.on("log", listener);
    return () => {
      this.events.off("log", listener);
    };
  }

  subscribeFinished(listener) {
    this.events.on("finished", listener);
    return () => {
      this.events.off("finished", listener);
    };
  }

  emitUpdate() {
    this.events.emit("update", this.getState());
  }

  emitLog(job, entry, options = {}) {
    this.events.emit("log", {
      jobId: job.id,
      entry: cloneLogEntry(entry),
      replay: options.replay === true,
    });
  }

  emitFinished(job) {
    this.events.emit("finished", {
      job: cloneJobSummary(job),
    });
  }

  whenSettled(jobId) {
    if (!jobId) {
      return Promise.resolve(null);
    }

    if (this.lastJob?.id === jobId && this.activeJob?.id !== jobId) {
      return Promise.resolve(cloneJobSummary(this.lastJob));
    }

    return this.pendingSettlements.get(jobId) ?? Promise.resolve(null);
  }

  getLogTail(jobId, limit = MAX_JOB_LOG_LINES) {
    if (!jobId) {
      return [];
    }

    const job =
      this.activeJob?.id === jobId ? this.activeJob : this.lastJob?.id === jobId ? this.lastJob : null;

    if (!job) {
      return [];
    }

    return job.logs.slice(-limit).map((entry) => cloneLogEntry(entry));
  }

  async startJob({ kind, target, handler }) {
    if (this.activeJob) {
      throw new ActiveJobConflictError(this.activeJob);
    }

    const job = {
      id: crypto.randomUUID(),
      kind,
      target,
      status: "running",
      startedAt: nowIso(),
      finishedAt: null,
      logs: [],
      logCount: 0,
      result: null,
      error: null,
    };
    let settleJob;
    const settled = new Promise((resolve) => {
      settleJob = resolve;
    });

    this.activeJob = job;
    this.pendingSettlements.set(job.id, settled);
    this.emitUpdate();

    const reporter = createReporter({
      emit: (entry) => {
        const clonedEntry = cloneLogEntry(entry);
        job.logs.push(clonedEntry);
        job.logCount += 1;

        if (job.logs.length > MAX_JOB_LOG_LINES) {
          job.logs.splice(0, job.logs.length - MAX_JOB_LOG_LINES);
        }

        this.emitLog(job, clonedEntry);
      },
    });

    Promise.resolve()
      .then(() => handler({ reporter, job: cloneJobSummary(job) }))
      .then((result) => {
        job.result = result ?? null;
        job.status = "completed";
      })
      .catch((error) => {
        job.status = "failed";
        job.error = {
          message: error?.message ?? String(error),
        };
        reporter.error(error?.message ?? String(error));
      })
      .finally(() => {
        job.finishedAt = nowIso();
        this.lastJob = {
          ...job,
          logs: job.logs.map((entry) => cloneLogEntry(entry)),
        };
        this.activeJob = null;
        this.pendingSettlements.delete(job.id);
        this.emitFinished(job);
        this.emitUpdate();
        settleJob(cloneJobSummary(job));
      });

    return cloneJobSummary(job);
  }
}
