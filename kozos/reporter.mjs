/**
 * kozos/reporter.mjs
 * Egységes, injektálható reporter a hosszú futások logolásához.
 */

function formatMessagePart(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? value.message;
  }

  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  return String(value);
}

function nowIso() {
  return new Date().toISOString();
}

export function createReporter(handlers = {}) {
  const emit = handlers.emit ?? (() => {});
  const updateState = handlers.updateState ?? (() => {});

  const write = (level, parts = []) => {
    const message = parts.map(formatMessagePart).join(" ").trim();

    emit({
      level,
      message,
      timestamp: nowIso(),
    });
  };

  return {
    info: (...parts) => write("info", parts),
    warn: (...parts) => write("warn", parts),
    error: (...parts) => write("error", parts),
    stage(label, extra = {}) {
      updateState({
        stageLabel: String(label ?? "").trim() || null,
        ...extra,
      });
    },
    progress(current, total, extra = {}) {
      const safeCurrent = Number.isFinite(current) ? Number(current) : 0;
      const safeTotal = Number.isFinite(total) ? Number(total) : 0;
      const percent =
        safeTotal > 0 ? Math.max(0, Math.min(100, Math.round((safeCurrent / safeTotal) * 100))) : 0;

      updateState({
        progress: {
          current: safeCurrent,
          total: safeTotal,
          percent,
        },
        ...extra,
      });
    },
    sections(sections = []) {
      updateState({
        sections: Array.isArray(sections) ? sections : [],
      });
    },
    state(patch = {}) {
      updateState(patch);
    },
  };
}

export function createConsoleReporter() {
  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  return createReporter({
    emit(entry) {
      const method =
        entry.level === "error"
          ? originalError
          : entry.level === "warn"
            ? originalWarn
            : originalLog;
      method(entry.message);
    },
  });
}

/**
 * A `withReporterConsole` ideiglenesen a megadott reporterre irányítja a console.log/error hívásokat.
 */
export async function withReporterConsole(reporter, fn) {
  const celReporter = reporter ?? createConsoleReporter();
  const originalLog = console.log;
  const originalError = console.error;
  const originalWarn = console.warn;

  console.log = (...parts) => {
    celReporter.info(...parts);
  };
  console.error = (...parts) => {
    celReporter.error(...parts);
  };
  console.warn = (...parts) => {
    celReporter.warn(...parts);
  };

  try {
    return await fn(celReporter);
  } finally {
    console.log = originalLog;
    console.error = originalError;
    console.warn = originalWarn;
  }
}
