import { useEffect, useMemo, useState } from "react";

export function navigate(pathname) {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function getPathname(target) {
  try {
    return new URL(target, window.location.origin).pathname;
  } catch {
    return target;
  }
}

export function AppLink({ to, children, className = "" }) {
  const active = window.location.pathname === getPathname(to);

  return (
    <a
      href={to}
      className={["nav-link", active ? "active" : "", className].filter(Boolean).join(" ")}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function PageSection({ title, subtitle, actions, children, className = "" }) {
  return (
    <section className={["section-block", className].filter(Boolean).join(" ")}>
      <div className="section-header">
        <div>
          <h2>{title}</h2>
          {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="section-actions">{actions}</div> : null}
      </div>
      <div className="section-body">{children}</div>
    </section>
  );
}

export function StatusBadge({ tone = "neutral", children }) {
  return <span className={`status-badge ${tone}`}>{children}</span>;
}

export function Toolbar({ children, className = "" }) {
  return <div className={["toolbar", className].filter(Boolean).join(" ")}>{children}</div>;
}

export function MetricStrip({ items = [] }) {
  return (
    <div className="metric-strip">
      {items.map((item) => (
        <div className="metric-box" key={item.label}>
          <span className="metric-label">{item.label}</span>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function LoadingLabel({ label = "Betöltés folyamatban…" }) {
  return <p className="muted-text" aria-live="polite">{label}</p>;
}

export function ErrorLabel({ error }) {
  if (!error) {
    return null;
  }

  return <p className="error-text" role="alert">{error}</p>;
}

export function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

function getWorkspaceJob(jobState, workspace) {
  if (jobState?.activeJob?.workspace === workspace) {
    return {
      scope: "active",
      job: jobState.activeJob,
    };
  }

  if (jobState?.lastJob?.workspace === workspace) {
    return {
      scope: "last",
      job: jobState.lastJob,
    };
  }

  return null;
}

function getJobTone(jobScope) {
  if (!jobScope?.job) {
    return "neutral";
  }

  if (jobScope.scope === "active") {
    return "running";
  }

  return jobScope.job.status === "completed" ? "ok" : "danger";
}

function getJobLabel(jobScope) {
  if (!jobScope?.job) {
    return "Nincs aktív művelet";
  }

  if (jobScope.scope === "active") {
    return "Folyamatban";
  }

  return jobScope.job.status === "completed" ? "Legutóbbi sikeres" : "Legutóbbi sikertelen";
}

function clampPercent(value) {
  const percent = Number(value);

  if (!Number.isFinite(percent)) {
    return 0;
  }

  return Math.max(0, Math.min(100, percent));
}

function formatUiDateTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("hu-HU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function WorkspaceJobPanel({
  workspace,
  jobState,
  connected = true,
  lastSocketError = null,
  idleLabel = "Most nincs aktív futás ezen a munkatéren.",
}) {
  const jobScope = getWorkspaceJob(jobState, workspace);
  const job = jobScope?.job ?? null;
  const percent = clampPercent(job?.progress?.percent ?? 0);
  const showProgress = jobScope?.scope === "active";

  return (
    <section className="workspace-job-panel">
      <div className="workspace-job-head">
        <div className="workspace-job-meta">
          <StatusBadge tone={connected ? "ok" : "danger"}>
            {connected ? "Kapcsolat rendben" : "Nincs kapcsolat"}
          </StatusBadge>
          <StatusBadge tone={getJobTone(jobScope)}>{getJobLabel(jobScope)}</StatusBadge>
          {job ? <span className="muted-text">{job.kind} • {job.target}</span> : null}
        </div>
        {job?.finishedAt ? <span className="muted-text">{formatUiDateTime(job.finishedAt)}</span> : null}
      </div>

      {lastSocketError ? <p className="error-text">{lastSocketError}</p> : null}

      {job ? (
        <>
          <div className="workspace-job-copy">
            <strong>{job.stageLabel ?? "A művelet fut vagy már lefutott ezen a munkatéren."}</strong>
            {job.progress?.total ? (
              <span className="muted-text">
                {job.progress.current ?? 0} / {job.progress.total} lépés • {Math.round(percent)}%
              </span>
            ) : null}
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow={Math.round(showProgress ? percent : job.status === "completed" ? 100 : percent)}
            aria-label="Műveleti előrehaladás"
          >
            <div className="progress-fill" style={{ width: `${showProgress ? percent : job.status === "completed" ? 100 : percent}%` }} />
          </div>
          {(job.sections ?? []).length > 0 ? (
            <div className="job-section-strip">
              {(job.sections ?? []).map((section) => (
                <span key={section.id} className={`job-section-pill ${section.status ?? "pending"}`}>
                  <strong>{section.label}</strong>
                  {section.meta ? <span>{section.meta}</span> : null}
                </span>
              ))}
            </div>
          ) : null}
          {job.error?.message ? <p className="error-text">{job.error.message}</p> : null}
        </>
      ) : (
        <p className="muted-text">{idleLabel}</p>
      )}
    </section>
  );
}

export function ActionButton({ label, onClick, disabled = false, tone = "default" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  return (
    <div className="action-button-wrap">
      <button
        type="button"
        className={`action-button ${tone}`}
        disabled={disabled || pending}
        onClick={async () => {
          setPending(true);
          setError(null);

          try {
            await onClick();
          } catch (caughtError) {
            setError(caughtError.message);
          } finally {
            setPending(false);
          }
        }}
      >
        {pending ? "Folyamatban…" : label}
      </button>
      {error ? <span className="inline-error">{error}</span> : null}
    </div>
  );
}

function renderPlainValue(value) {
  if (value == null || value === "") {
    return "—";
  }

  if (Array.isArray(value)) {
    return value.join(", ") || "—";
  }

  if (typeof value === "object") {
    return JSON.stringify(value);
  }

  return String(value);
}

function StructuredKeyValueSection({ section }) {
  return (
    <div className="structured-content">
      <div className="key-value-grid">
        {(section.rows ?? []).map((row) => (
          <div key={row.id} className={`key-value-row tone-${row.tone ?? "neutral"}`}>
            <span>{row.label}</span>
            <strong>{renderPlainValue(row.value)}</strong>
            {row.meta ? <small>{row.meta}</small> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function StructuredGridSection({ section }) {
  if ((section.items ?? []).length === 0) {
    return <EmptyState title={section.emptyMessage ?? "Nincs adat."} />;
  }

  return (
    <div className="info-grid">
      {(section.items ?? []).map((item) => (
        <div key={item.id} className={`info-grid-card tone-${item.tone ?? "neutral"}`}>
          <strong>{renderPlainValue(item.value)}</strong>
          {item.meta ? <span>{item.meta}</span> : null}
        </div>
      ))}
    </div>
  );
}

function StructuredTextSection({ section }) {
  return <p className="structured-text-body">{section.body}</p>;
}

function StructuredListSection({ section }) {
  if ((section.items ?? []).length === 0) {
    return <EmptyState title={section.emptyMessage ?? "Nincs adat."} />;
  }

  return (
    <ul className="plain-list structured-list">
      {(section.items ?? []).map((item) => (
        <li key={item.id} className={`structured-list-item tone-${item.tone ?? "neutral"}`}>
          <strong>{item.title}</strong>
          {item.detail ? <span>{item.detail}</span> : null}
          {item.meta ? <small>{item.meta}</small> : null}
        </li>
      ))}
    </ul>
  );
}

function StructuredTableSection({ section }) {
  if ((section.rows ?? []).length === 0) {
    return <EmptyState title={section.emptyMessage ?? "Nincs adat."} />;
  }

  return (
    <div className="table-wrap">
      <table className="data-table section-table">
        <thead>
          <tr>
            {(section.columns ?? []).map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(section.rows ?? []).map((row) => (
            <tr key={row.id}>
              {(section.columns ?? []).map((column) => (
                <td key={`${row.id}-${column.key}`}>{renderPlainValue(row[column.key])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StructuredSections({ sections = [] }) {
  if (!sections || sections.length === 0) {
    return null;
  }

  return (
    <div className="structured-sections">
      {sections.map((section) => (
        <section key={section.id} className={`structured-section tone-${section.tone ?? "neutral"}`}>
          <div className="structured-section-head">
            <h3>{section.title}</h3>
            {section.description ? <p className="section-subtitle">{section.description}</p> : null}
          </div>

          {section.kind === "keyValue" ? <StructuredKeyValueSection section={section} /> : null}
          {section.kind === "grid" ? <StructuredGridSection section={section} /> : null}
          {section.kind === "text" ? <StructuredTextSection section={section} /> : null}
          {section.kind === "list" ? <StructuredListSection section={section} /> : null}
          {section.kind === "table" ? <StructuredTableSection section={section} /> : null}
        </section>
      ))}
    </div>
  );
}

export function MonthAccordion({
  group,
  defaultOpen = false,
  headerExtra = null,
  keepMountedAfterOpen = false,
  children,
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [hasOpened, setHasOpened] = useState(defaultOpen);

  useEffect(() => {
    setOpen(defaultOpen);

    if (defaultOpen) {
      setHasOpened(true);
    }
  }, [defaultOpen]);

  useEffect(() => {
    if (open) {
      setHasOpened(true);
    }
  }, [open]);

  const shouldRenderBody = open || (keepMountedAfterOpen && hasOpened);

  return (
    <details
      className="month-accordion"
      open={open}
      data-month={group.month}
      onToggle={(event) => {
        setOpen(event.currentTarget.open);
      }}
    >
      <summary>
        <div className="month-summary-title">
          <strong>{group.monthName}</strong>
          <span>{group.summary?.total ?? group.items?.length ?? group.rows?.length ?? 0} elem</span>
        </div>
        <div className="month-summary-kpis">
          {group.summary?.missing > 0 ? <span>hiány: {group.summary.missing}</span> : null}
          {group.summary?.local > 0 ? <span>helyi: {group.summary.local}</span> : null}
          {group.summary?.overrides > 0 ? <span>override: {group.summary.overrides}</span> : null}
          {group.summary?.mismatches > 0 ? <span>kiemelt: {group.summary.mismatches}</span> : null}
          {group.summary?.total && !group.summary?.missing && !group.summary?.local && !group.summary?.overrides && !group.summary?.mismatches ? (
            <span>részletek</span>
          ) : null}
          {headerExtra}
        </div>
      </summary>
      {shouldRenderBody ? <div className="month-accordion-body">{children}</div> : null}
    </details>
  );
}

function normalizeToken(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim();
}

export function NameTokenEditor({ values = [], suggestions = [], placeholder = "Új név hozzáadása", onChange }) {
  const [draft, setDraft] = useState("");
  const normalizedValues = useMemo(() => (Array.isArray(values) ? values : []).filter(Boolean), [values]);
  const visibleSuggestions = useMemo(() => {
    const selected = new Set(normalizedValues.map((value) => normalizeToken(value).toLocaleLowerCase("hu")));
    return (Array.isArray(suggestions) ? suggestions : [])
      .filter(Boolean)
      .filter((value) => !selected.has(normalizeToken(value).toLocaleLowerCase("hu")))
      .slice(0, 24);
  }, [normalizedValues, suggestions]);

  const addToken = (value) => {
    const nextValue = normalizeToken(value);

    if (!nextValue) {
      return;
    }

    const selected = new Set(normalizedValues.map((item) => normalizeToken(item).toLocaleLowerCase("hu")));

    if (selected.has(nextValue.toLocaleLowerCase("hu"))) {
      setDraft("");
      return;
    }

    onChange([...normalizedValues, nextValue]);
    setDraft("");
  };

  return (
    <div className="token-editor">
      <div className="token-list">
        {normalizedValues.length > 0 ? (
          normalizedValues.map((value) => (
            <button
              key={value}
              type="button"
              className="token-chip selected"
              onClick={() => {
                onChange(normalizedValues.filter((entry) => entry !== value));
              }}
            >
              {value} ×
            </button>
          ))
        ) : (
          <span className="muted-text">Nincs kijelölt név.</span>
        )}
      </div>
      <div className="token-input-row">
        <input
          value={draft}
          autoComplete="off"
          aria-label={placeholder}
          placeholder={placeholder}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addToken(draft);
            }
          }}
        />
        <button type="button" onClick={() => addToken(draft)}>
          Hozzáadás
        </button>
      </div>
      {visibleSuggestions.length > 0 ? (
        <div className="token-list suggestions">
          {visibleSuggestions.map((value) => (
            <button
              key={value}
              type="button"
              className="token-chip"
              onClick={() => addToken(value)}
            >
              {value}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = "Keresés" }) {
  return (
    <input
      type="search"
      value={value}
      className="search-input"
      autoComplete="off"
      aria-label={placeholder}
      placeholder={placeholder}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}
