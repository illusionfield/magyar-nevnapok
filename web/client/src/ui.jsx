import { useEffect, useMemo, useState } from "react";

export function navigate(pathname) {
  window.history.pushState({}, "", pathname);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function AppLink({ to, children }) {
  const active = window.location.pathname === to;

  return (
    <a
      href={to}
      className={active ? "nav-link active" : "nav-link"}
      onClick={(event) => {
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

export function PageSection({ title, subtitle, actions, children }) {
  return (
    <section className="section-block">
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

export function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>;
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
  return <p className="muted-text">{label}</p>;
}

export function ErrorLabel({ error }) {
  if (!error) {
    return null;
  }

  return <p className="error-text">{error}</p>;
}

export function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {detail ? <p>{detail}</p> : null}
    </div>
  );
}

export function JobConsole({ jobState, connected }) {
  const activeJob = jobState?.activeJob ?? null;
  const lastJob = jobState?.lastJob ?? null;
  const visibleJob = activeJob ?? lastJob;

  return (
    <div className="job-console">
      <div className="job-row">
        <StatusBadge tone={connected ? "ok" : "danger"}>{connected ? "Kapcsolódva" : "Nincs kapcsolat"}</StatusBadge>
        {visibleJob ? (
          <>
            <StatusBadge tone={activeJob ? "running" : visibleJob.status === "completed" ? "ok" : "danger"}>
              {activeJob ? "Aktív művelet" : visibleJob.status === "completed" ? "Legutóbbi sikeres" : "Legutóbbi sikertelen"}
            </StatusBadge>
            <span>{visibleJob.kind}</span>
            <span>{visibleJob.target}</span>
          </>
        ) : (
          <span className="muted-text">Ebben a munkamenetben még nem futott módosító művelet.</span>
        )}
      </div>
      <pre className="log-console">
        {visibleJob
          ? (visibleJob.logs ?? []).slice(-120).map((entry) => `[${entry.level}] ${entry.message}`).join("\n") || "Még nincs naplóbejegyzés."
          : "Még nincs naplóbejegyzés."}
      </pre>
      {visibleJob?.error ? <p className="error-text">{visibleJob.error.message}</p> : null}
    </div>
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
          {group.summary?.mismatches > 0 ? <span>eltérés: {group.summary.mismatches}</span> : null}
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
      value={value}
      className="search-input"
      placeholder={placeholder}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  );
}
