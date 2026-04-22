import { WebSocketServer } from "ws";
import {
  allitHivatalosNevjegyzekKiveteleket,
  allitIcsBeallitasokat,
  allitKozosPrimerNapot,
  allitSajatPrimerBeallitasokat,
  allitHelyiPrimerNapot,
  ellenorizPipelineFuttatast,
  futtatAuditot,
  futtatPrimerAuditGyorsFrissitest,
  futtatPipeline,
  generalKimenetet,
} from "../../domainek/szolgaltatasok.mjs";
import { ActiveJobConflictError } from "./job-manager.mjs";
import {
  buildAuditCatalogModel,
  buildAuditDetailMonthModel,
  buildAuditDetailSummaryModel,
  buildDashboardModel,
  buildIcsEditorModel,
  buildIcsPreviewModel,
  buildPipelineModel,
  buildPrimerAuditMonthModel,
  buildPrimerAuditNamesModel,
  buildPrimerAuditSummaryModel,
} from "./view-models.mjs";

function createRequestError(message, code = "invalid_request", statusCode = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

function ensureNoActiveJob(jobManager) {
  const state = jobManager.getState();

  if (state.activeJob) {
    throw new ActiveJobConflictError(state.activeJob);
  }
}

function sendJson(socket, payload) {
  if (socket.readyState !== 1) {
    return;
  }

  socket.send(JSON.stringify(payload));
}

async function runJobAndWait(jobManager, descriptor, handler) {
  const startedJob = await jobManager.startJob({
    kind: descriptor.kind,
    target: descriptor.target,
    workspace: descriptor.workspace ?? null,
    handler,
  });
  const finalJob = await jobManager.whenSettled(startedJob.id);

  if (!finalJob) {
    return startedJob;
  }

  if (finalJob.status === "failed") {
    const error = createRequestError(
      finalJob.error?.message ?? "A művelet sikertelenül fejeződött be.",
      "job_failed",
      500,
      {
        job: finalJob,
      }
    );
    throw error;
  }

  return finalJob;
}

function issueDownloadDescriptors(downloadTokenStore, writtenPaths = []) {
  return (Array.isArray(writtenPaths) ? writtenPaths : []).map((filePath) =>
    downloadTokenStore.issue(filePath)
  );
}

function parseMonth(value, label) {
  const month = Number(value);

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw createRequestError(`A ${label} mezőnek 1 és 12 közötti egész hónapnak kell lennie.`);
  }

  return month;
}

async function handleRequest(context, request) {
  const payload = request.payload ?? {};

  switch (request.tipus) {
    case "dashboard:get":
      return {
        dashboard: await buildDashboardModel(context.jobManager.getState()),
      };
    case "pipeline:get":
      return {
        pipeline: await buildPipelineModel(),
      };
    case "pipeline:run": {
      const target = String(payload.target ?? "").trim();

      if (!target) {
        throw createRequestError("A pipeline futtatásához kötelező a target mező.");
      }

      await ellenorizPipelineFuttatast(target, {
        force: payload.force === true,
        confirmCrawlerRun: payload.confirmCrawlerRun === true,
      });

      const job = await runJobAndWait(
        context.jobManager,
        {
          kind: "pipeline",
          target,
          workspace: "pipeline",
        },
        ({ reporter }) =>
          futtatPipeline(target, {
            force: payload.force === true,
            confirmCrawlerRun: payload.confirmCrawlerRun === true,
            reporter,
          })
      );

      return {
        job,
        pipeline: await buildPipelineModel(),
        dashboard: await buildDashboardModel(context.jobManager.getState()),
      };
    }
    case "audits:get-catalog":
      return {
        auditCatalog: await buildAuditCatalogModel(),
      };
    case "audits:get-detail-summary": {
      const auditId = String(payload.auditId ?? "").trim();

      if (!auditId) {
        throw createRequestError("Az audit részletnézethez kötelező az auditId mező.");
      }

      return {
        auditDetail: await buildAuditDetailSummaryModel(auditId),
      };
    }
    case "audits:get-detail-month": {
      const auditId = String(payload.auditId ?? "").trim();

      if (!auditId) {
        throw createRequestError("Az audit havi részletnézetéhez kötelező az auditId mező.");
      }

      return {
        auditMonth: await buildAuditDetailMonthModel(auditId, parseMonth(payload.month, "month"), {
          query: payload.query ?? "",
        }),
      };
    }
    case "audits:run": {
      const auditId = String(payload.auditId ?? "").trim();

      if (!auditId) {
        throw createRequestError("Az audit futtatásához kötelező az auditId mező.");
      }

      const job = await runJobAndWait(
        context.jobManager,
        {
          kind: "audit",
          target: auditId,
          workspace: "auditok",
        },
        ({ reporter }) =>
          futtatAuditot(auditId, {
            reporter,
          })
      );

      return {
        job,
        auditCatalog: await buildAuditCatalogModel(),
        auditDetail:
          auditId !== "mind" && auditId !== "primer-audit"
            ? await buildAuditDetailSummaryModel(auditId)
            : null,
        dashboard: await buildDashboardModel(context.jobManager.getState()),
      };
    }
    case "audits:save-official-exceptions": {
      ensureNoActiveJob(context.jobManager);
      await allitHivatalosNevjegyzekKiveteleket({
        forrasok: payload.sources ?? {},
        megjegyzes: payload.notes ?? "",
        genders: payload.genders ?? {},
      });

      let job = null;

      if (payload.rerun === true) {
        job = await runJobAndWait(
          context.jobManager,
          {
            kind: "audit",
            target: "hivatalos-nevjegyzek",
            workspace: "auditok",
          },
          ({ reporter }) =>
            futtatAuditot("hivatalos-nevjegyzek", {
              reporter,
            })
        );
      }

      return {
        job,
        auditCatalog: await buildAuditCatalogModel(),
        auditDetail: await buildAuditDetailSummaryModel("hivatalos-nevjegyzek"),
        dashboard: await buildDashboardModel(context.jobManager.getState()),
      };
    }
    case "primer-audit:get-summary":
      return {
        primerAuditSummary: await buildPrimerAuditSummaryModel(),
      };
    case "primer-audit:get-month":
      return {
        primerAuditMonth: await buildPrimerAuditMonthModel(parseMonth(payload.month, "month"), {
          filterId: payload.filterId ?? "akciozhato",
          query: payload.query ?? "",
        }),
      };
    case "primer-audit:get-names":
      return {
        primerAuditNames: await buildPrimerAuditNamesModel({
          filterId: payload.filterId ?? "osszes",
          query: payload.query ?? "",
          sortId: payload.sortId ?? "relevancia",
          page: payload.page ?? 1,
          pageSize: payload.pageSize ?? 100,
        }),
      };
    case "primer-audit:save-settings": {
      ensureNoActiveJob(context.jobManager);
      const settings = payload.settings ?? payload;
      await allitSajatPrimerBeallitasokat({
        primarySource: settings.primarySource,
        modifiers: settings.modifiers,
      });

      return {
        primerAuditSummary: await buildPrimerAuditSummaryModel(),
        dashboard: await buildDashboardModel(context.jobManager.getState()),
      };
    }
    case "primer-audit:save-common-day": {
      ensureNoActiveJob(context.jobManager);
      const monthDay = String(payload.monthDay ?? "").trim();

      if (!monthDay) {
        throw createRequestError("A közös primer mentéshez kötelező a monthDay mező.");
      }

      await allitKozosPrimerNapot({
        monthDay,
        preferredNames: payload.preferredNames ?? [],
      });

      const shouldRerun = payload.rerun !== false;
      let job = null;

      if (shouldRerun) {
        job = await runJobAndWait(
          context.jobManager,
          {
            kind: "audit",
            target: "primer-audit",
            workspace: "primer-audit",
          },
          ({ reporter }) =>
            futtatPrimerAuditGyorsFrissitest({
              reporter,
            })
        );
      }

      return {
        job,
        primerAuditSummary: await buildPrimerAuditSummaryModel(),
        dashboard: await buildDashboardModel(context.jobManager.getState()),
      };
    }
    case "primer-audit:save-local-day": {
      ensureNoActiveJob(context.jobManager);
      const monthDay = String(payload.monthDay ?? "").trim();

      if (!monthDay) {
        throw createRequestError("A helyi primer mentéshez kötelező a monthDay mező.");
      }

      await allitHelyiPrimerNapot({
        monthDay,
        addedPreferredNames: payload.addedPreferredNames ?? [],
      });

      return {
        primerAuditSummary: await buildPrimerAuditSummaryModel(),
        dashboard: await buildDashboardModel(context.jobManager.getState()),
      };
    }
    case "ics:get-editor":
      return {
        icsEditor: await buildIcsEditorModel(),
      };
    case "ics:save": {
      ensureNoActiveJob(context.jobManager);
      const settings = payload.settings ?? payload.draft ?? payload;
      await allitIcsBeallitasokat(settings);

      return {
        icsEditor: await buildIcsEditorModel(),
        dashboard: await buildDashboardModel(context.jobManager.getState()),
      };
    }
    case "ics:preview": {
      const settings = payload.settings ?? payload.draft ?? payload;

      return {
        icsPreview: await buildIcsPreviewModel(settings, {
          includeRaw: false,
        }),
      };
    }
    case "ics:get-raw-preview": {
      const settings = payload.settings ?? payload.draft ?? payload;

      return {
        icsRawPreview: await buildIcsPreviewModel(settings, {
          includeRaw: true,
          panelId: payload.panelId ?? null,
        }),
      };
    }
    case "ics:generate": {
      const settings = payload.settings ?? payload.draft ?? payload;
      await allitIcsBeallitasokat(settings);

      const job = await runJobAndWait(
        context.jobManager,
        {
          kind: "output",
          target: "ics",
          workspace: "ics",
        },
        ({ reporter }) =>
          generalKimenetet("ics", {
            reporter,
          })
      );
      const downloads = issueDownloadDescriptors(context.downloadTokenStore, job.result);

      return {
        job: {
          ...job,
          result: {
            writtenPaths: job.result,
            downloads,
          },
        },
        downloads,
        icsEditor: await buildIcsEditorModel(),
        icsPreview: await buildIcsPreviewModel(settings, {
          includeRaw: false,
        }),
        dashboard: await buildDashboardModel(context.jobManager.getState()),
      };
    }
    default:
      throw createRequestError(`Ismeretlen websocket művelet: ${request.tipus}`, "unknown_request", 404);
  }
}

export function attachWebSocketServer(server, context) {
  const clients = new Set();
  const wss = new WebSocketServer({
    server,
    path: "/ws",
  });

  const unsubscribeUpdate = context.jobManager.subscribe((state) => {
    for (const client of clients) {
      sendJson(client, {
        tipus: "job:update",
        data: state,
      });
    }
  });
  const unsubscribeLogs = context.jobManager.subscribeLogs((event) => {
    for (const client of clients) {
      sendJson(client, {
        tipus: "job:log",
        data: event,
      });
    }
  });
  const unsubscribeFinished = context.jobManager.subscribeFinished((event) => {
    for (const client of clients) {
      sendJson(client, {
        tipus: "job:finished",
        data: event,
      });
    }
  });

  wss.on("connection", (socket) => {
    clients.add(socket);
    sendJson(socket, {
      tipus: "connection:ready",
      data: {
        serverTime: new Date().toISOString(),
      },
    });
    sendJson(socket, {
      tipus: "job:update",
      data: context.jobManager.getState(),
    });
    for (const job of [context.jobManager.getState().lastJob, context.jobManager.getState().activeJob]) {
      if (!job?.id) {
        continue;
      }

      for (const entry of context.jobManager.getLogTail(job.id)) {
        sendJson(socket, {
          tipus: "job:log",
          data: {
            jobId: job.id,
            entry,
            replay: true,
          },
        });
      }
    }

    socket.on("message", async (raw) => {
      let request;

      try {
        request = JSON.parse(String(raw));
      } catch {
        sendJson(socket, {
          replyTo: null,
          ok: false,
          error: {
            code: "invalid_json",
            message: "A websocket kérés nem érvényes JSON.",
          },
        });
        return;
      }

      const replyTo = request?.id ?? null;

      try {
        if (!request?.tipus) {
          throw createRequestError("A websocket kérésből hiányzik a tipus mező.");
        }

        const data = await handleRequest(context, request);
        sendJson(socket, {
          replyTo,
          ok: true,
          data,
        });
      } catch (error) {
        const activeJob = error instanceof ActiveJobConflictError ? error.job : null;
        sendJson(socket, {
          replyTo,
          ok: false,
          error: {
            code: error.code ?? "internal_error",
            message: error.message ?? "Váratlan websocket hiba történt.",
            statusCode: error.statusCode ?? 500,
            details: {
              ...(error.details ?? {}),
              ...(activeJob ? { activeJob } : {}),
            },
          },
        });
      }
    });

    socket.on("close", () => {
      clients.delete(socket);
    });
  });

  wss.on("close", () => {
    unsubscribeUpdate();
    unsubscribeLogs();
    unsubscribeFinished();
  });

  return wss;
}
