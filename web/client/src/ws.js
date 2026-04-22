import { useCallback, useEffect, useRef, useState } from "react";

const REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const RECONNECT_DELAY_MS = 1500;
const MAX_CLIENT_JOB_LOG_LINES = 200;

function buildWsUrl() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${window.location.host}/ws`;
}

function normalizeWsError(error, fallbackMessage) {
  if (error instanceof Error) {
    return error;
  }

  return new Error(fallbackMessage ?? String(error));
}

export function useWsBridge() {
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const pendingRef = useRef(new Map());
  const requestCounterRef = useRef(0);
  const mountedRef = useRef(true);
  const summaryRef = useRef({
    activeJob: null,
    lastJob: null,
  });
  const logBuffersRef = useRef(new Map());
  const [connected, setConnected] = useState(false);
  const [jobState, setJobState] = useState({
    activeJob: null,
    lastJob: null,
  });
  const [lastError, setLastError] = useState(null);

  const pruneLogBuffers = useCallback(() => {
    const keepIds = new Set(
      [summaryRef.current.activeJob?.id, summaryRef.current.lastJob?.id].filter(Boolean)
    );

    for (const jobId of logBuffersRef.current.keys()) {
      if (!keepIds.has(jobId)) {
        logBuffersRef.current.delete(jobId);
      }
    }
  }, []);

  const buildJobStateSnapshot = useCallback(() => {
    const withLogs = (job) => {
      if (!job) {
        return null;
      }

      return {
        ...job,
        logs: [...(logBuffersRef.current.get(job.id) ?? [])],
      };
    };

    return {
      activeJob: withLogs(summaryRef.current.activeJob),
      lastJob: withLogs(summaryRef.current.lastJob),
    };
  }, []);

  const applySummary = useCallback((summary) => {
    summaryRef.current = {
      activeJob: summary?.activeJob ?? null,
      lastJob: summary?.lastJob ?? null,
    };
    pruneLogBuffers();
    setJobState(buildJobStateSnapshot());
  }, [buildJobStateSnapshot, pruneLogBuffers]);

  const appendLogEntry = useCallback((jobId, entry) => {
    if (!jobId || !entry) {
      return;
    }

    const nextBuffer = [...(logBuffersRef.current.get(jobId) ?? []), entry];

    if (nextBuffer.length > MAX_CLIENT_JOB_LOG_LINES) {
      nextBuffer.splice(0, nextBuffer.length - MAX_CLIENT_JOB_LOG_LINES);
    }

    logBuffersRef.current.set(jobId, nextBuffer);
    setJobState(buildJobStateSnapshot());
  }, [buildJobStateSnapshot]);

  const rejectPending = useCallback((message) => {
    for (const pending of pendingRef.current.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error(message));
    }

    pendingRef.current.clear();
  }, []);

  const waitForOpenSocket = useCallback(() => {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + REQUEST_TIMEOUT_MS;

      const waitForSocket = () => {
        const socket = socketRef.current;

        if (!socket) {
          if (Date.now() >= deadline) {
            reject(new Error("A websocket kapcsolat még nem elérhető."));
            return;
          }

          window.setTimeout(waitForSocket, 25);
          return;
        }

        if (socket.readyState === WebSocket.OPEN) {
          resolve(socket);
          return;
        }

        if (socket.readyState !== WebSocket.CONNECTING) {
          reject(new Error("A websocket kapcsolat még nem elérhető."));
          return;
        }

        const timeoutId = window.setTimeout(() => {
          cleanup();
          reject(new Error("A websocket kapcsolat nem nyílt meg időben."));
        }, Math.max(0, deadline - Date.now()));

        const cleanup = () => {
          clearTimeout(timeoutId);
          socket.removeEventListener("open", onOpen);
          socket.removeEventListener("error", onError);
          socket.removeEventListener("close", onClose);
        };

        const onOpen = () => {
          cleanup();
          resolve(socket);
        };
        const onError = () => {
          cleanup();
          reject(new Error("A websocket kapcsolat hibára futott."));
        };
        const onClose = () => {
          cleanup();
          reject(new Error("A websocket kapcsolat megszakadt."));
        };

        socket.addEventListener("open", onOpen);
        socket.addEventListener("error", onError);
        socket.addEventListener("close", onClose);
      };

      waitForSocket();
    });
  }, []);

  const connect = useCallback(() => {
    const socket = new WebSocket(buildWsUrl());
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      if (!mountedRef.current) {
        return;
      }

      setConnected(true);
      setLastError(null);
    });

    socket.addEventListener("message", (event) => {
      let payload = null;

      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (payload.replyTo) {
        const pending = pendingRef.current.get(payload.replyTo) ?? null;

        if (!pending) {
          return;
        }

        clearTimeout(pending.timeoutId);
        pendingRef.current.delete(payload.replyTo);

        if (payload.ok === false) {
          const message = payload.error?.message ?? "Ismeretlen websocket hiba.";
          const error = new Error(message);
          error.code = payload.error?.code ?? "ws_error";
          error.details = payload.error?.details ?? null;
          pending.reject(error);
          return;
        }

        pending.resolve(payload.data ?? null);
        return;
      }

      if (payload.tipus === "job:update") {
        applySummary(payload.data ?? { activeJob: null, lastJob: null });
        return;
      }

      if (payload.tipus === "job:log") {
        appendLogEntry(payload.data?.jobId, payload.data?.entry ?? null);
        return;
      }

      if (payload.tipus === "job:finished") {
        const finishedJob = payload.data?.job ?? null;
        const current = summaryRef.current;

        summaryRef.current = {
          activeJob: current.activeJob?.id === finishedJob?.id ? null : current.activeJob,
          lastJob: finishedJob ?? current.lastJob,
        };
        pruneLogBuffers();
        setJobState(buildJobStateSnapshot());
        return;
      }

      if (payload.tipus === "connection:ready") {
        setConnected(true);
      }
    });

    socket.addEventListener("close", () => {
      if (!mountedRef.current) {
        return;
      }

      setConnected(false);
      rejectPending("A websocket kapcsolat megszakadt.");
      reconnectTimerRef.current = window.setTimeout(() => {
        connect();
      }, RECONNECT_DELAY_MS);
    });

    socket.addEventListener("error", () => {
      if (!mountedRef.current) {
        return;
      }

      setLastError("A websocket kapcsolat hibára futott.");
    });
  }, [appendLogEntry, applySummary, buildJobStateSnapshot, pruneLogBuffers, rejectPending]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      rejectPending("A websocket kliens leállt.");
      socketRef.current?.close();
    };
  }, [connect, rejectPending]);

  const request = useCallback(async (tipus, payload = null) => {
    const socket = await waitForOpenSocket();

    return new Promise((resolve, reject) => {
      const id = `req-${Date.now()}-${requestCounterRef.current}`;
      requestCounterRef.current += 1;
      const timeoutId = window.setTimeout(() => {
        pendingRef.current.delete(id);
        reject(new Error(`A websocket kérés időtúllépés miatt megszakadt: ${tipus}`));
      }, REQUEST_TIMEOUT_MS);

      pendingRef.current.set(id, {
        resolve,
        reject,
        timeoutId,
      });

      try {
        socket.send(
          JSON.stringify({
            id,
            tipus,
            payload,
          })
        );
      } catch (error) {
        clearTimeout(timeoutId);
        pendingRef.current.delete(id);
        reject(normalizeWsError(error, "A websocket kérés elküldése sikertelen."));
      }
    });
  }, [waitForOpenSocket]);

  return {
    connected,
    jobState,
    lastError,
    request,
  };
}
