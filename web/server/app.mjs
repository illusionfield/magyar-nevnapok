import path from "node:path";
import express from "express";
import { DownloadTokenStore } from "./download-tokens.mjs";
import { JobManager } from "./job-manager.mjs";
import { attachWebSocketServer } from "./ws-server.mjs";

const distRoot = path.resolve(process.cwd(), "dist");
const clientRoot = path.resolve(process.cwd(), "web", "client");

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (error) {
      next(error);
    }
  };
}

async function createSpaMiddleware(app, options = {}) {
  if (options.dev === true) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: {
        middlewareMode: true,
      },
      appType: "custom",
    });

    app.use(vite.middlewares);
    app.use(async (req, res, next) => {
      try {
        const indexPath = path.join(clientRoot, "index.html");
        const transformed = await vite.transformIndexHtml(
          req.originalUrl,
          await import("node:fs/promises").then(({ readFile }) => readFile(indexPath, "utf8"))
        );
        res.status(200).set({ "Content-Type": "text/html" }).end(transformed);
      } catch (error) {
        vite.ssrFixStacktrace(error);
        next(error);
      }
    });

    return;
  }

  app.use(express.static(distRoot));
  app.use((_req, res) => {
    res.sendFile(path.join(distRoot, "index.html"));
  });
}

export async function createWebApp(options = {}) {
  const app = express();
  const jobManager = new JobManager();
  const downloadTokenStore = new DownloadTokenStore();

  app.use(express.json({ limit: "1mb" }));

  app.get(
    "/letoltes/:token",
    asyncHandler(async (req, res) => {
      const download = downloadTokenStore.resolve(req.params.token);
      res.download(download.filePath, download.fileName);
    })
  );

  await createSpaMiddleware(app, options);

  app.use((error, _req, res, _next) => {
    const statusCode = error.statusCode ?? 500;
    const code = error.code ?? "internal_error";
    const message =
      statusCode >= 500 ? error.message ?? "Váratlan szerverhiba történt." : error.message;

    res.status(statusCode).json({
      error: {
        code,
        message,
      },
    });
  });

  return {
    app,
    jobManager,
    downloadTokenStore,
    attach(server) {
      return attachWebSocketServer(server, {
        jobManager,
        downloadTokenStore,
      });
    },
  };
}

export async function startWebServer(options = {}) {
  const port = Number(options.port ?? process.env.PORT ?? 3000);
  const host = options.host ?? process.env.HOST ?? "127.0.0.1";
  const { app, jobManager, downloadTokenStore, attach } = await createWebApp(options);

  const server = await new Promise((resolve) => {
    const instance = app.listen(port, host, () => {
      resolve(instance);
    });
  });
  const wsServer = attach(server);
  const cim = server.address();
  const resolvedPort = typeof cim === "object" && cim ? cim.port : port;

  return {
    app,
    server,
    wsServer,
    host,
    port: resolvedPort,
    jobManager,
    downloadTokenStore,
  };
}
