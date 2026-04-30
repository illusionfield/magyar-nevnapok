import { Fragment, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ActionButton,
  EmptyState,
  ErrorLabel,
  LoadingLabel,
  MetricStrip,
  MonthAccordion,
  PageSection,
  SearchInput,
  Tooltip,
  Toolbar,
  WorkspaceJobPanel,
} from "../ui.jsx";
import { useWsQuery } from "../hooks.js";
import { defaultMonthOpen } from "./shared/month-groups.js";

const DAY_VIEW_MODES = [
  { id: "sources", label: "Források / eltérések" },
  { id: "missing", label: "Hiányzó nevek" },
  { id: "never-primary", label: "Primer nélkül maradó" },
  { id: "wiki-legacy", label: "Wiki vs legacy" },
  { id: "audit-drift", label: "Auditált drift" },
];

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("hu");
}

function uniqueNames(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values ?? []) {
    const key = normalizeName(value);

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(value);
  }

  return result;
}

function namesEqual(left = [], right = []) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function hasName(values = [], name) {
  const key = normalizeName(name);
  return (values ?? []).some((value) => normalizeName(value) === key);
}

function withoutName(values = [], name) {
  const key = normalizeName(name);
  return (values ?? []).filter((value) => normalizeName(value) !== key);
}

function formatNames(values = [], maxItems = 5) {
  const names = (values ?? []).filter(Boolean);

  if (names.length === 0) {
    return "—";
  }

  const visible = names.slice(0, maxItems).join(", ");
  return names.length > maxItems ? `${visible} … +${names.length - maxItems}` : visible;
}

function formatAllNames(values = []) {
  const names = (values ?? []).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "—";
}

function formatRelativeTime(value) {
  if (!value) {
    return "Nincs leokézva";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  const diffSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const units = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
    ["second", 1],
  ];
  const formatter = new Intl.RelativeTimeFormat("hu-HU", { numeric: "auto" });

  for (const [unit, seconds] of units) {
    if (Math.abs(diffSeconds) >= seconds || unit === "second") {
      return formatter.format(Math.round(diffSeconds / seconds), unit);
    }
  }

  return "épp most";
}

function getChipTone(row, name, viewMode) {
  const sourceOnly = hasName(row.drift?.sourceOnlyNames, name);
  const auditedOnly = hasName(row.drift?.auditedOnlyNames, name);
  const missing = hasName(row.neverPrimaryNames ?? row.effectiveMissingNames, name);
  const inLegacy = hasName(row.legacyNames, name);
  const inWiki = hasName(row.wikiNames, name);
  const inNormalized = hasName(row.normalizedNames, name);
  const inRanking = hasName(row.rankingNames, name);
  const inFinal = hasName(row.auditedPreferredNames, name) || hasName(row.effectivePreferredNames, name);

  if (viewMode === "audit-drift") {
    if (sourceOnly) {
      return "new";
    }

    if (auditedOnly) {
      return "stale";
    }
  }

  if (viewMode === "missing" || viewMode === "never-primary") {
    return missing ? "danger" : inFinal ? "ok" : "muted";
  }

  if (viewMode === "wiki-legacy") {
    if (inLegacy && !inWiki) {
      return "legacy";
    }

    if (inWiki && !inLegacy) {
      return "wiki";
    }

    if (inLegacy && inWiki) {
      return "ok";
    }
  }

  if (inFinal) {
    return "ok";
  }

  if (inNormalized || inRanking) {
    return "suggested";
  }

  if (sourceOnly) {
    return "new";
  }

  if (auditedOnly) {
    return "stale";
  }

  return "neutral";
}

function NameChip({ row, name, viewMode, selected = false, disabled = false, onAdd, onRemove, onInfo }) {
  const tone = getChipTone(row, name, viewMode);
  const sourceLabel = (row.chipSources?.[name] ?? []).join("+");
  const tooltip = sourceLabel ? `${name} • források: ${sourceLabel}` : name;

  return (
    <Tooltip
      as="span"
      className={["audit-name-chip", `tone-${tone}`, selected ? "selected" : "", disabled ? "disabled" : ""].filter(Boolean).join(" ")}
      label={tooltip}
    >
      <span className="audit-name-chip-copy">
        <span className="audit-name-chip-label">{name}</span>
        {sourceLabel ? <small className="audit-name-chip-source">{sourceLabel}</small> : null}
      </span>
      <span className="audit-name-chip-actions">
        {onAdd ? (
          <button type="button" disabled={disabled} aria-label={`${name} hozzáadása`} onClick={() => onAdd(name)}>
            +
          </button>
        ) : null}
        {onRemove ? (
          <button type="button" aria-label={`${name} eltávolítása`} onClick={() => onRemove(name)}>
            −
          </button>
        ) : null}
        {onInfo ? (
          <button type="button" aria-label={`${name} audit információ`} onClick={() => onInfo(name)}>
            i
          </button>
        ) : null}
      </span>
    </Tooltip>
  );
}

function SourceColumn({ title, names, row, viewMode, preferredDraft, onAdd, onInfo }) {
  return (
    <div className="audit-source-column">
      <strong>{title}</strong>
      <div className="audit-chip-flow compact">
        {(names ?? []).length > 0 ? (
          names.map((name) => (
            <NameChip
              key={`${title}-${name}`}
              row={row}
              name={name}
              viewMode={viewMode}
              disabled={hasName(preferredDraft, name)}
              onAdd={onAdd}
              onInfo={onInfo}
            />
          ))
        ) : (
          <span className="muted-text">—</span>
        )}
      </div>
    </div>
  );
}

function DetailNameList({ values = [] }) {
  return <strong>{formatAllNames(values)}</strong>;
}

function JsonDetails({ title, value }) {
  return (
    <div className="name-detail-json">
      {title ? <strong>{title}</strong> : null}
      {value ? <pre>{JSON.stringify(value, null, 2)}</pre> : <p className="muted-text">Nincs adat.</p>}
    </div>
  );
}

function NameDetailMainContent({ detail, summaryCard = null }) {
  const description = detail.description ?? {};
  const frequency = description.frequency ?? {};
  const formalizedEdges = detail.formalizedEdges ?? [];
  const occurrences = detail.occurrences ?? [];

  return (
    <div className="name-detail-main-grid">
      <section className="name-detail-card name-detail-grid-card" aria-label="Név alapadatai">
        <h3>Alapadatok</h3>
        <div className="name-detail-grid">
          <span>Nem</span><strong>{description.gender ?? "—"}</strong>
          <span>Adatlap</span>
          <strong>
            {description.detailUrl ? <a href={description.detailUrl} target="_blank" rel="noreferrer">HUN-REN adatlap</a> : "—"}
          </strong>
          <span>Eredet</span><strong>{description.origin ?? "—"}</strong>
          <span>Jelentés</span><strong>{description.meaning ?? "—"}</strong>
          <span>Gyakoriság</span><strong>{frequency.overall?.labelHu ?? "—"} / {frequency.newborns?.labelHu ?? "—"}</strong>
          <span>Becenevek</span><DetailNameList values={description.nicknames} />
          <span>Kapcsolódó nevek</span><DetailNameList values={description.relatedNames} />
          <span>Nyelvi jellemzők</span>
          <strong>
            {description.languageFeatures
              ? [
                  description.languageFeatures.syllableCount ? `${description.languageFeatures.syllableCount} szótag` : null,
                  description.languageFeatures.vowelHarmony,
                  description.languageFeatures.vowels,
                ].filter(Boolean).join(" • ")
              : "—"}
          </strong>
          <span>Auditált primer</span><strong>{detail.counts?.auditedPrimary ?? 0}</strong>
          <span>Legacy / Wiki</span><strong>{detail.counts?.legacyPrimary ?? 0} / {detail.counts?.wikiPrimary ?? 0}</strong>
          <span>Normalizált / Rangsor</span><strong>{detail.counts?.normalizedPrimary ?? 0} / {detail.counts?.rankingPrimary ?? 0}</strong>
          <span>Formalizált élek</span><strong>{detail.formalized?.edgeCount ?? 0}</strong>
        </div>
      </section>
      {summaryCard}

      <section className="name-detail-card" aria-label="Név előfordulásai">
        <h3>Előfordulások</h3>
        {occurrences.length > 0 ? (
          <ul className="plain-list compact-list name-detail-occurrences">
            {occurrences.map((occurrence) => (
              <li key={`${detail.name}-${occurrence.monthDay}`}>
                <strong>{occurrence.dateLabel}</strong>
                <span>
                  audit: {occurrence.auditedPrimaryCount} • legacy: {occurrence.sourcePrimaryCounts?.legacy ?? 0} • wiki: {occurrence.sourcePrimaryCounts?.wiki ?? 0} • norm: {occurrence.sourcePrimaryCounts?.normalized ?? 0} • rangsor: {occurrence.sourcePrimaryCounts?.ranking ?? 0}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted-text">Ehhez a névhez nincs napi előfordulás.</p>
        )}
      </section>

      <section className="name-detail-card" aria-label="Formalizált leírás">
        <h3>Formalizált leírás</h3>
        <div className="name-detail-block">
          <strong>Leírás</strong>
          <p>{description.formalized?.normalized ?? description.formalized?.raw ?? "—"}</p>
        </div>
        <div className="name-detail-block">
          <strong>Kapcsolati élek</strong>
          {formalizedEdges.length > 0 ? (
            <ul className="plain-list compact-list name-detail-occurrences">
              {formalizedEdges.map((edge, index) => (
                <li key={edge.id ?? `${detail.name}-${edge.raw}-${index}`}>
                  <strong>{edge.relationCode ?? edge.relationLabel ?? "kapcsolat"}</strong>
                  <span>{edge.normalized ?? edge.raw ?? "—"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text">Nincs formalizált kapcsolati él.</p>
          )}
        </div>
      </section>
    </div>
  );
}

function NameDetailRawBlocks({ detail, className = "name-detail-raw-grid" }) {
  const description = detail.description ?? {};
  const formalizedEdges = detail.formalizedEdges ?? [];

  return (
    <div className={className} aria-label="Teljes nyers névdetail adatok">
      <JsonDetails title="Teljes névadatbázis rekord" value={description.raw} />
      <JsonDetails title="Teljes formalizált él-adatok" value={detail.formalized?.edges ?? formalizedEdges} />
    </div>
  );
}

function clampNameDetailHeight(value) {
  const viewportHeight = typeof window === "undefined" ? 900 : window.innerHeight;
  const minHeight = 260;
  const maxHeight = Math.round(viewportHeight * 0.7);

  return Math.max(minHeight, Math.min(maxHeight, Math.round(value)));
}

function NameDetailPanel({ detail, selectedName, loading, error, onClose }) {
  const [rawOpen, setRawOpen] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [dockHeight, setDockHeight] = useState(null);

  useEffect(() => {
    setRawOpen(false);
    setMaximized(false);
  }, [selectedName]);

  if (!selectedName) {
    return null;
  }

  const displayName = detail?.name ?? selectedName;
  const windowStyle = {
    "--name-detail-window-height": dockHeight == null ? "38vh" : `${dockHeight}px`,
  };
  const handleClose = () => {
    setRawOpen(false);
    setMaximized(false);
    onClose();
  };
  const beginResize = (event) => {
    if (maximized) {
      return;
    }

    event.preventDefault();
    const updateHeight = (clientY) => {
      setDockHeight(clampNameDetailHeight(window.innerHeight - clientY));
    };
    const handlePointerMove = (moveEvent) => {
      updateHeight(moveEvent.clientY);
    };
    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    updateHeight(event.clientY);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };
  const renderHead = ({ meta, rawDisabled = false }) => (
    <div className="name-detail-head">
      <div className="name-detail-head-copy">
        <strong>{displayName}</strong>
        <span>{meta}</span>
      </div>
      <div className="name-detail-head-actions">
        <Tooltip
          as="button"
          type="button"
          className="name-detail-raw-toggle"
          aria-label={rawOpen ? "Nyers adatok bezárása" : "Nyers adatok megnyitása"}
          aria-expanded={rawOpen}
          disabled={rawDisabled}
          label={rawOpen ? "Nyers adatok bezárása" : "Nyers adatok megnyitása"}
          onClick={() => setRawOpen((current) => !current)}
        >
          {rawOpen ? "Nyers adatok ▲" : "Nyers adatok ▼"}
        </Tooltip>
        <Tooltip
          as="button"
          type="button"
          className="name-detail-maximize"
          aria-label={maximized ? "Névinfo visszaállítása alsó ablakba" : "Névinfo maximalizálása"}
          aria-pressed={maximized}
          label={maximized ? "Vissza az alsó ablakba" : "Névinfo maximalizálása"}
          onClick={() => setMaximized((current) => !current)}
        >
          {maximized ? "▁" : "▣"}
        </Tooltip>
        <Tooltip as="button" type="button" className="name-detail-close" aria-label="Névinfo bezárása" label="Névinfo bezárása" onClick={handleClose}>
          ×
        </Tooltip>
      </div>
    </div>
  );
  const renderWindow = (bodyContent, headOptions) => {
    const panel = (
      <aside
        className={["name-detail-window", maximized ? "maximized" : "docked"].join(" ")}
        style={windowStyle}
        aria-label={`${displayName} név audit részletei`}
      >
        <div className="name-detail-resize-handle" role="separator" aria-label="Névinfo ablak magasságának állítása" aria-orientation="horizontal" onPointerDown={beginResize} />
        {renderHead(headOptions)}
        <div className="name-detail-body">
          {bodyContent}
        </div>
      </aside>
    );

    return (
      <>
        {typeof document === "undefined" ? panel : createPortal(panel, document.body)}
        {!maximized ? <div className="name-detail-dock-spacer" style={windowStyle} aria-hidden="true" /> : null}
      </>
    );
  };

  if (loading || error || !detail) {
    return renderWindow(
      error ? <ErrorLabel error={error} /> : <LoadingLabel label="Név audit részletek betöltése…" />,
      { meta: "Névinfo", rawDisabled: true }
    );
  }

  return (
    renderWindow(
      <>
        <NameDetailMainContent detail={detail} />
        {rawOpen ? <NameDetailRawBlocks detail={detail} /> : null}
      </>,
      { meta: `${detail.occurrenceCount ?? 0} nap • auditált primer: ${detail.counts?.auditedPrimary ?? 0}` }
    )
  );
}

function AuditEvidenceSummary({ row, preferredDraft }) {
  const facts = [
    ["Auditált primer", `${preferredDraft.length} név: ${formatAllNames(preferredDraft)}`],
    ["Legacy", formatAllNames(row.legacyNames)],
    ["Wiki", formatAllNames(row.wikiNames)],
    ["Normalizált", formatAllNames(row.normalizedNames)],
    ["Rangsor", formatAllNames(row.rankingNames)],
    ["Új forrásnevek", formatAllNames(row.drift?.sourceOnlyNames)],
    ["Csak auditáltban", formatAllNames(row.drift?.auditedOnlyNames)],
    ["Primer nélkül maradó", formatAllNames(row.neverPrimaryNames ?? row.effectiveMissingNames)],
    ["Utolsó OK", row.auditedAt ? formatRelativeTime(row.auditedAt) : "nincs leokézva"],
  ];

  return (
    <dl className="audit-evidence-facts">
      {facts.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function DayAuditEditor({ row, request, onSaved, onCancel }) {
  const [viewMode, setViewMode] = useState("sources");
  const [namesDraft, setNamesDraft] = useState(row.auditedNames ?? row.candidateNames ?? []);
  const [preferredDraft, setPreferredDraft] = useState(row.auditedPreferredNames ?? row.effectivePreferredNames ?? []);
  const [detailState, setDetailState] = useState({
    loading: false,
    error: null,
    detailsByName: {},
    selectedName: null,
  });
  const candidateNames = useMemo(
    () => uniqueNames([...(namesDraft ?? []), ...(row.candidateNames ?? [])]),
    [namesDraft, row.candidateNames]
  );
  const candidateNamesKey = useMemo(() => candidateNames.map(normalizeName).join("|"), [candidateNames]);

  useEffect(() => {
    setNamesDraft(row.auditedNames ?? row.candidateNames ?? []);
    setPreferredDraft(row.auditedPreferredNames ?? row.effectivePreferredNames ?? []);
    setDetailState({ loading: false, error: null, detailsByName: {}, selectedName: null });
  }, [row.monthDay, row.auditedAt, row.auditedNames, row.auditedPreferredNames, row.effectivePreferredNames, row.candidateNames]);

  useEffect(() => {
    let active = true;

    setDetailState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    request("primer-audit:get-day-name-details", {
      monthDay: row.monthDay,
      names: candidateNames,
    })
      .then((payload) => {
        if (!active) {
          return;
        }

        setDetailState((current) => ({
          ...current,
          loading: false,
          error: null,
          detailsByName: payload.primerAuditDayNameDetails?.detailsByName ?? {},
        }));
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setDetailState((current) => ({
          ...current,
          loading: false,
          error: error.message,
          detailsByName: {},
        }));
      });

    return () => {
      active = false;
    };
  }, [request, row.monthDay, candidateNamesKey]);

  const dirty = !namesEqual(namesDraft, row.auditedNames ?? []) || !namesEqual(preferredDraft, row.auditedPreferredNames ?? []);

  const addToPreferred = (name) => {
    setNamesDraft((current) => uniqueNames([...current, name]));
    setPreferredDraft((current) => (hasName(current, name) ? current : [...current, name]));
  };
  const removeFromPreferred = (name) => {
    setPreferredDraft((current) => withoutName(current, name));
  };
  const addToNames = (name) => {
    setNamesDraft((current) => uniqueNames([...current, name]));
  };
  const removeFromNames = (name) => {
    setNamesDraft((current) => withoutName(current, name));
    setPreferredDraft((current) => withoutName(current, name));
  };
  const showNameDetail = (name) => {
    setDetailState((current) => ({
      ...current,
      selectedName: normalizeName(current.selectedName) === normalizeName(name) ? null : name,
    }));
  };
  const closeNameDetail = () => {
    setDetailState((current) => ({
      ...current,
      selectedName: null,
    }));
  };
  const selectedDetail = detailState.selectedName
    ? detailState.detailsByName?.[normalizeName(detailState.selectedName)] ?? null
    : null;

  return (
    <div className="day-audit-editor">
      <div className="day-audit-editor-head">
        <div>
          <strong>{row.dateLabel}</strong>
          <p className="muted-text">Utolsó OK: {formatRelativeTime(row.auditedAt)}</p>
        </div>
        <div className="view-switch audit-view-switch">
          {DAY_VIEW_MODES.map((mode) => (
            <button
              key={mode.id}
              type="button"
              className={viewMode === mode.id ? "tab-button active" : "tab-button"}
              onClick={() => setViewMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="day-audit-workspace">
        <div className="day-audit-dashboard">
          <div className="audit-source-grid">
            <SourceColumn title="Legacy" names={row.legacyNames} row={row} viewMode={viewMode} preferredDraft={preferredDraft} onAdd={addToPreferred} onInfo={showNameDetail} />
            <SourceColumn title="Wiki" names={row.wikiNames} row={row} viewMode={viewMode} preferredDraft={preferredDraft} onAdd={addToPreferred} onInfo={showNameDetail} />
            <SourceColumn title="Normalizált" names={row.normalizedNames} row={row} viewMode={viewMode} preferredDraft={preferredDraft} onAdd={addToPreferred} onInfo={showNameDetail} />
            <SourceColumn title="Rangsor" names={row.rankingNames} row={row} viewMode={viewMode} preferredDraft={preferredDraft} onAdd={addToPreferred} onInfo={showNameDetail} />
          </div>

          <div className="final-primer-panel">
            <div className="final-primer-panel-head">
              <strong>Végső auditált primer</strong>
              <span>{preferredDraft.length} név</span>
            </div>
            <div className="audit-chip-flow">
              {preferredDraft.length > 0 ? (
                preferredDraft.map((name) => (
                  <NameChip key={`final-${name}`} row={row} name={name} viewMode={viewMode} selected={true} onRemove={removeFromPreferred} onInfo={showNameDetail} />
                ))
              ) : (
                <span className="muted-text">Nincs végső primer kijelölve.</span>
              )}
            </div>
            <AuditEvidenceSummary row={row} preferredDraft={preferredDraft} />
          </div>
        </div>

        <div className="all-day-names-panel">
          <div className="final-primer-panel-head">
            <strong>A nap auditált teljes névlistája</strong>
            <span>{namesDraft.length} / {candidateNames.length} név</span>
          </div>
          <div className="audit-chip-flow">
            {candidateNames.map((name) => {
              const inNames = hasName(namesDraft, name);
              const inPreferred = hasName(preferredDraft, name);

              return (
                <NameChip
                  key={`all-${name}`}
                  row={row}
                  name={name}
                  viewMode={viewMode}
                  selected={inNames}
                  disabled={inPreferred}
                  onAdd={!inNames ? addToNames : inPreferred ? null : addToPreferred}
                  onRemove={inNames && !inPreferred ? removeFromNames : null}
                  onInfo={showNameDetail}
                />
              );
            })}
          </div>
          {row.drift?.sourceOnlyNames?.length > 0 || row.drift?.auditedOnlyNames?.length > 0 ? (
            <p className="muted-text">
              Drift: új forrásnév: {formatNames(row.drift.sourceOnlyNames, 6)} • csak auditáltban: {formatNames(row.drift.auditedOnlyNames, 6)}
            </p>
          ) : null}
        </div>
      </div>

      <Toolbar>
        <ActionButton
          label="OK"
          disabled={!dirty}
          tone="primary"
          onClick={async () => {
            await request("primer-audit:save-audited-day", {
              monthDay: row.monthDay,
              names: namesDraft,
              preferredNames: preferredDraft,
              rerun: true,
            });
            await onSaved();
          }}
        />
        <button type="button" className="action-button" onClick={onCancel}>Cancel</button>
        {!dirty ? <span className="muted-text">Nincs mentetlen módosítás.</span> : <span className="muted-text">Mentetlen napi audit draft.</span>}
      </Toolbar>

      <NameDetailPanel
        detail={selectedDetail}
        selectedName={detailState.selectedName}
        loading={detailState.loading && detailState.selectedName !== null && !selectedDetail}
        error={detailState.error}
        onClose={closeNameDetail}
      />
    </div>
  );
}

function buildDayStatusItems(row) {
  const items = [];

  if (!row.auditedAt) {
    items.push({ id: "unaudited", icon: "!", label: "Nincs leokézva", tone: "warning" });
  }

  if (row.drift?.hasSourceNameDrift) {
    items.push({ id: "drift", icon: "Δ", label: "Auditált állapot forrásdriftben van", tone: "info" });
  }

  if (row.flags?.hasMissing) {
    items.push({ id: "missing", icon: "∅", label: "Primer nélkül maradó név van ezen a napon", tone: "danger" });
  }

  if (row.flags?.isValidationMismatch) {
    items.push({ id: "wiki-legacy", icon: "≠", label: "Wiki/legacy eltérés", tone: "purple" });
  }

  if (items.length === 0) {
    items.push({ id: "ok", icon: "✓", label: "Rendben", tone: "ok" });
  }

  return items;
}

function DayAuditActionCell({ row, open, onToggle }) {
  const actionLabel = open ? "Editor bezárása" : "Napi primer audit szerkesztése";

  return (
    <div className="day-audit-action-cell">
      <div className="audit-status-dot-row" aria-label="Napi audit státuszok">
        {buildDayStatusItems(row).map((item) => (
          <Tooltip
            as="span"
            key={item.id}
            className={`audit-status-dot ${item.tone}`}
            label={item.label}
            aria-label={item.label}
          >
            {item.icon}
          </Tooltip>
        ))}
      </div>
      {row.auditedAt ? (
        <Tooltip as="span" className="audit-relative-time" label={`Utolsó OK: ${row.auditedAt}`}>
          {formatRelativeTime(row.auditedAt)}
        </Tooltip>
      ) : null}
      <Tooltip
        as="button"
        type="button"
        className={["icon-action-button", open ? "active" : ""].filter(Boolean).join(" ")}
        label={actionLabel}
        aria-label={open ? `${row.dateLabel} editor bezárása` : `${row.dateLabel} szerkesztése`}
        onClick={onToggle}
      >
        ✎
      </Tooltip>
    </div>
  );
}

function PrimerMonthContent({ monthSummary, request, filterId, query, refreshToken, onAfterSave }) {
  const monthQuery = useWsQuery(
    () =>
      request("primer-audit:get-month", {
        month: monthSummary.month,
        filterId,
        query,
      }).then((payload) => payload.primerAuditMonth),
    [request, monthSummary.month, filterId, query, refreshToken]
  );
  const month = monthQuery.data ?? {
    ...monthSummary,
    rows: [],
  };
  const [openRows, setOpenRows] = useState({});

  useEffect(() => {
    setOpenRows({});
  }, [filterId, query, monthSummary.month]);

  return (
    <>
      {monthQuery.loading && !monthQuery.data ? <LoadingLabel label="Havi részletek betöltése…" /> : null}
      <ErrorLabel error={monthQuery.error} />
      {monthQuery.data ? (
        month.rows.length > 0 ? (
          <div className="table-wrap primer-audit-table-wrap">
            <table className="data-table primer-audit-table">
              <thead>
                <tr>
                  <th>Dátum</th>
                  <th>Végső primer</th>
                  <th>Egyéb nevek</th>
                  <th>Audit</th>
                </tr>
              </thead>
              <tbody>
                {month.rows.map((row) => {
                  const open = openRows[row.monthDay] === true;
                  const otherNames = (row.auditedNames ?? []).filter((name) => !hasName(row.auditedPreferredNames, name));

                  return (
                    <Fragment key={row.monthDay}>
                      <tr key={row.monthDay} className={row.needsAudit ? "needs-audit" : ""}>
                        <td>
                          <strong>{row.dateLabel}</strong>
                        </td>
                        <td>
                          <div className="audit-chip-flow compact">
                            {(row.auditedPreferredNames ?? []).length > 0 ? (
                              row.auditedPreferredNames.map((name) => <NameChip key={`${row.monthDay}-p-${name}`} row={row} name={name} viewMode="sources" selected={true} />)
                            ) : (
                              <span className="muted-text">—</span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="small-name-list">{formatAllNames(otherNames)}</span>
                        </td>
                        <td>
                          <DayAuditActionCell
                            row={row}
                            open={open}
                            onToggle={() => setOpenRows((current) => ({ ...current, [row.monthDay]: !open }))}
                          />
                        </td>
                      </tr>
                      {open ? (
                        <tr key={`${row.monthDay}-editor`} className="day-editor-row">
                          <td colSpan={4}>
                            <DayAuditEditor
                              row={row}
                              request={request}
                              onSaved={async () => {
                                monthQuery.refresh();
                                await onAfterSave();
                              }}
                              onCancel={() => setOpenRows((current) => ({ ...current, [row.monthDay]: false }))}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Ebben a hónapban nincs találat." detail="A jelenlegi szűrő és keresés mellett nincs megjeleníthető nap." />
        )
      ) : null}
    </>
  );
}

function PrimerMonthEditor({ monthSummary, request, filterId, query, refreshToken, onAfterSave }) {
  return (
    <MonthAccordion
      key={monthSummary.month}
      group={monthSummary}
      defaultOpen={defaultMonthOpen(monthSummary, { query })}
      keepMountedAfterOpen={true}
    >
      <PrimerMonthContent
        monthSummary={monthSummary}
        request={request}
        filterId={filterId}
        query={query}
        refreshToken={refreshToken}
        onAfterSave={onAfterSave}
      />
    </MonthAccordion>
  );
}

function buildNameStatusItems(entry) {
  const flags = entry.flags ?? {};
  const items = [];

  if (flags.hasMissing) {
    items.push({ id: "missing", icon: "∅", label: "Primer nélkül maradó név érinti", tone: "danger" });
  }

  if (flags.hasSourceSuggestion) {
    items.push({ id: "source-suggestion", icon: "Δ", label: "Forrás javaslat van auditált primer nélkül", tone: "info" });
  }

  if (flags.hasWikiLegacyMismatch) {
    items.push({ id: "wiki-legacy", icon: "≠", label: "Wiki/legacy eltérés érinti", tone: "purple" });
  }

  if (flags.hasLocal) {
    items.push({ id: "local", icon: "P", label: "Helyi kijelölés érinti", tone: "cyan" });
  }

  if (flags.hasHidden) {
    items.push({ id: "hidden", icon: "H", label: "Rejtettként kezelt név", tone: "warning" });
  }

  if (items.length === 0) {
    items.push({ id: "ok", icon: "✓", label: "Audit szempontból rendben", tone: "ok" });
  }

  return items;
}

function NameKpis({ entry }) {
  const counts = entry.counts ?? {};
  const sourceSuggestionCount = (counts.normalized ?? 0) + (counts.ranking ?? 0);

  return (
    <div className="catalog-kpis name-row-kpis">
      <span>nap: <strong>{entry.occurrenceCount ?? counts.occurrences ?? 0}</strong></span>
      <span>primer: <strong>{counts.final ?? 0}</strong></span>
      <span>hiány: <strong>{counts.missing ?? 0}</strong></span>
      <span>javaslat: <strong>{sourceSuggestionCount}</strong></span>
      <span>helyi: <strong>{counts.local ?? 0}</strong></span>
      <span>rejtett: <strong>{counts.hidden ?? 0}</strong></span>
    </div>
  );
}

function NameAuditActionCell({ entry, open, onToggle }) {
  return (
    <div className="name-audit-action-cell">
      <div className="audit-status-dot-row" aria-label="Név audit státuszok">
        {buildNameStatusItems(entry).map((item) => (
          <Tooltip
            as="span"
            key={item.id}
            className={`audit-status-dot ${item.tone}`}
            label={item.label}
            aria-label={item.label}
          >
            {item.icon}
          </Tooltip>
        ))}
      </div>
      <Tooltip
        as="button"
        type="button"
        className={["icon-action-button", open ? "active" : ""].filter(Boolean).join(" ")}
        label={open ? "Névinfo bezárása" : "Név audit információ"}
        aria-label={open ? `${entry.name} névinfo bezárása` : `${entry.name} audit információ`}
        onClick={onToggle}
      >
        i
      </Tooltip>
    </div>
  );
}

function NameOccurrencePreview({ entry }) {
  const occurrences = entry.occurrences ?? entry.occurrencePreview ?? [];

  if (occurrences.length === 0) {
    return null;
  }

  return (
    <span className="small-name-list">
      {occurrences.map((occurrence) => occurrence.dateLabel).join(", ")}
    </span>
  );
}

function NameAuditSummary({ entry, detail }) {
  const counts = entry.counts ?? {};
  const detailCounts = detail?.counts ?? {};
  const days = (detail?.occurrences ?? []).map((occurrence) => occurrence.dateLabel);
  const facts = [
    ["Előfordulás", `${entry.occurrenceCount ?? detail?.occurrenceCount ?? 0} nap`],
    ["Auditált primer", detailCounts.auditedPrimary ?? counts.final ?? 0],
    ["Legacy / Wiki", `${detailCounts.legacyPrimary ?? counts.legacy ?? 0} / ${detailCounts.wikiPrimary ?? counts.wiki ?? 0}`],
    ["Normalizált / Rangsor", `${detailCounts.normalizedPrimary ?? counts.normalized ?? 0} / ${detailCounts.rankingPrimary ?? counts.ranking ?? 0}`],
    ["Primer nélkül maradó", counts.missing ?? 0],
    ["Helyi / Rejtett", `${counts.local ?? 0} / ${counts.hidden ?? 0}`],
    ["Érintett napok", formatAllNames(days)],
  ];

  return (
    <section className="name-detail-card name-inline-audit-summary" aria-label="Név audit összefoglaló">
      <h3>Audit összefoglaló</h3>
      <dl className="audit-evidence-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function InlineNameDetailPanel({ entry, detail, loading, error, onClose }) {
  return (
    <div className="name-inline-detail-panel">
      <Tooltip as="button" type="button" className="name-detail-close name-inline-detail-close" aria-label="Névinfo bezárása" label="Névinfo bezárása" onClick={onClose}>
        ×
      </Tooltip>
      {loading ? <LoadingLabel label="Név audit részletek betöltése…" /> : null}
      <ErrorLabel error={error} />
      {!loading && !error && detail ? (
        <div className="name-inline-detail-grid">
          <div className="name-inline-detail-left">
            <NameDetailMainContent
              detail={detail}
              summaryCard={<NameAuditSummary entry={entry} detail={detail} />}
            />
          </div>
          <aside className="name-inline-raw-column" aria-label="Név nyers forrásadatai">
            <NameDetailRawBlocks detail={detail} className="name-inline-raw-stack" />
          </aside>
        </div>
      ) : null}
    </div>
  );
}

function NameLetterAccordion({ group, request, filterId, query, selectedName, detailState, onInfo, onCloseDetail }) {
  const [open, setOpen] = useState(false);
  const [letterState, setLetterState] = useState({
    loading: false,
    error: null,
    data: null,
  });

  const loadLetter = () => {
    if (letterState.loading || letterState.data) {
      return;
    }

    setLetterState((current) => ({
      ...current,
      loading: true,
      error: null,
    }));
    request("primer-audit:get-name-letter", {
      letter: group.letter,
      filterId,
      query,
    })
      .then((payload) => {
        setLetterState({
          loading: false,
          error: null,
          data: payload.primerAuditNameLetter,
        });
      })
      .catch((error) => {
        setLetterState({
          loading: false,
          error: error.message,
          data: null,
        });
      });
  };

  const rows = letterState.data?.rows ?? [];
  const summary = group.summary ?? {};

  return (
    <details
      className="month-accordion name-letter-accordion"
      open={open}
      data-letter={group.letter}
      onToggle={(event) => {
        const nextOpen = event.currentTarget.open;

        setOpen(nextOpen);

        if (nextOpen) {
          loadLetter();
        }
      }}
    >
      <summary>
        <div className="month-summary-title">
          <strong>{group.label}</strong>
          <span>{group.count} név</span>
        </div>
        <div className="month-summary-kpis">
          {summary.missing > 0 ? <span>hiány: {summary.missing}</span> : null}
          {summary.sourceSuggestion > 0 ? <span>javaslat: {summary.sourceSuggestion}</span> : null}
          {summary.wikiLegacyMismatch > 0 ? <span>wiki/legacy: {summary.wikiLegacyMismatch}</span> : null}
          {summary.local > 0 ? <span>helyi: {summary.local}</span> : null}
          {summary.hidden > 0 ? <span>rejtett: {summary.hidden}</span> : null}
          {summary.total > 0 && !summary.missing && !summary.sourceSuggestion && !summary.wikiLegacyMismatch && !summary.local && !summary.hidden ? <span>részletek</span> : null}
        </div>
      </summary>
      {open ? (
        <div className="month-accordion-body">
          {letterState.loading && !letterState.data ? <LoadingLabel label="Névcsoport betöltése…" /> : null}
          <ErrorLabel error={letterState.error} />
          {letterState.data ? (
            rows.length > 0 ? (
              <div className="table-wrap primer-audit-name-table-wrap">
                <table className="data-table primer-audit-name-table">
                  <thead>
                    <tr>
                      <th>Név</th>
                      <th>Napok</th>
                      <th>Audit KPI-k</th>
                      <th>Audit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((entry) => {
                      const openDetail = normalizeName(selectedName) === normalizeName(entry.name);
                      const detailKey = normalizeName(entry.name);

                      return (
                        <Fragment key={entry.name}>
                          <tr>
                            <td>
                              <strong className="name-row-title">{entry.name}</strong>
                            </td>
                            <td>
                              <NameOccurrencePreview entry={entry} />
                            </td>
                            <td>
                              <NameKpis entry={entry} />
                            </td>
                            <td>
                              <NameAuditActionCell
                                entry={entry}
                                open={openDetail}
                                onToggle={() => onInfo(entry.name)}
                              />
                            </td>
                          </tr>
                          {openDetail ? (
                            <tr className="name-inline-detail-row">
                              <td colSpan={4}>
                                <InlineNameDetailPanel
                                  entry={entry}
                                  detail={detailState.detailsByName[detailKey] ?? null}
                                  loading={detailState.loadingName === detailKey}
                                  error={detailState.errorName === detailKey ? detailState.error : null}
                                  onClose={onCloseDetail}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="Ebben a kezdőbetűben nincs találat." detail="A jelenlegi szűrő és keresés mellett nincs megjeleníthető név." />
            )
          ) : null}
        </div>
      ) : null}
    </details>
  );
}

function NameView({ nameIndex, request, filterId, query }) {
  const [selectedName, setSelectedName] = useState(null);
  const [detailState, setDetailState] = useState({
    loadingName: null,
    errorName: null,
    error: null,
    detailsByName: {},
  });
  const selectedKey = normalizeName(selectedName);

  useEffect(() => {
    setSelectedName(null);
    setDetailState({
      loadingName: null,
      errorName: null,
      error: null,
      detailsByName: {},
    });
  }, [filterId, query]);

  useEffect(() => {
    if (!selectedName || detailState.detailsByName[selectedKey] || detailState.loadingName === selectedKey) {
      return undefined;
    }

    let active = true;

    setDetailState((current) => ({
      ...current,
      loadingName: selectedKey,
      errorName: null,
      error: null,
    }));
    request("primer-audit:get-name-detail", {
      name: selectedName,
    })
      .then((payload) => {
        if (!active) {
          return;
        }

        setDetailState((current) => ({
          ...current,
          loadingName: null,
          errorName: null,
          error: null,
          detailsByName: {
            ...current.detailsByName,
            [selectedKey]: payload.primerAuditNameDetail,
          },
        }));
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        setDetailState((current) => ({
          ...current,
          loadingName: null,
          errorName: selectedKey,
          error: error.message,
        }));
      });

    return () => {
      active = false;
    };
  }, [request, selectedName, selectedKey]);

  if (!nameIndex || nameIndex.groups.length === 0) {
    return <EmptyState title="Nincs találat a névnézetben." detail="Szűkíts kevesebbet, vagy írj más keresést." />;
  }

  return (
    <div className="page-stack name-letter-list">
      <p className="muted-text">{nameIndex.totalItems} név • {nameIndex.groups.length} kezdőbetű</p>
      {nameIndex.groups.map((group) => (
        <NameLetterAccordion
          key={`${filterId}-${query}-${group.letter}`}
          group={group}
          request={request}
          filterId={filterId}
          query={query}
          selectedName={selectedName}
          detailState={detailState}
          onInfo={(name) => {
            setSelectedName((current) => (normalizeName(current) === normalizeName(name) ? null : name));
          }}
          onCloseDetail={() => setSelectedName(null)}
        />
      ))}
    </div>
  );
}

export function PrimerAuditPage({ request, connected, jobState, lastSocketError }) {
  const [mode, setMode] = useState("napok");
  const [dayQuery, setDayQuery] = useState("");
  const [dayFilterId, setDayFilterId] = useState("osszes");
  const [nameQuery, setNameQuery] = useState("");
  const [nameFilterId, setNameFilterId] = useState("osszes");
  const [refreshToken, setRefreshToken] = useState(0);
  const summaryQuery = useWsQuery(
    () => request("primer-audit:get-summary").then((payload) => payload.primerAuditSummary),
    [request, refreshToken]
  );
  const summary = summaryQuery.data;
  const nameIndexQuery = useWsQuery(
    () =>
      request("primer-audit:get-name-index", {
        filterId: nameFilterId,
        query: nameQuery,
      }).then((payload) => payload.primerAuditNameIndex),
    [request, nameFilterId, nameQuery, refreshToken],
    {
      enabled: mode === "nevek",
    }
  );

  return (
    <div className="page-stack">
      <PageSection title="Primer audit" subtitle="Az auditált primary registry a végleges forrás; a pipeline-források csak eltérésjelző és döntéstámogató szerepet kapnak.">
        <WorkspaceJobPanel
          workspace="primer-audit"
          connected={connected}
          jobState={jobState}
          lastSocketError={lastSocketError}
          idleLabel="A napi OK mentésekor indul újrafuttatás; annak állapota itt látszik majd százalékos visszajelzéssel."
        />
        <Toolbar>
          <button type="button" className={mode === "napok" ? "tab-button active" : "tab-button"} onClick={() => setMode("napok")}>
            Napok
          </button>
          <button type="button" className={mode === "nevek" ? "tab-button active" : "tab-button"} onClick={() => setMode("nevek")}>
            Nevek
          </button>
        </Toolbar>
        {summaryQuery.loading && !summary ? <LoadingLabel /> : null}
        <ErrorLabel error={summaryQuery.error} />
        {summary ? (
          <MetricStrip
            items={[
              { label: "Összes nap", value: summary.summary.rowCount ?? 0 },
              { label: "Nincs leokézva", value: summary.summary.unauditedDayCount ?? 0 },
              { label: "Forrás drift", value: summary.summary.sourceNameDriftDayCount ?? 0 },
              { label: "Primer nélkül maradó", value: summary.summary.effectiveMissingCount ?? 0 },
            ]}
          />
        ) : null}
      </PageSection>

      {mode === "napok" ? (
        <>
          <PageSection title="Napnézet" subtitle="Havi csoportokba rendezett, soronként nyitható napi audit dashboard.">
            <Toolbar>
              <SearchInput value={dayQuery} onChange={setDayQuery} placeholder="Keresés dátumra vagy névre…" />
              <div className="filter-button-row">
                {(summary?.filters?.days ?? []).map((item) => (
                  <Tooltip
                    as="button"
                    key={item.azonosito}
                    type="button"
                    className={dayFilterId === item.azonosito ? "tab-button active" : "tab-button"}
                    label={item.leiras}
                    onClick={() => setDayFilterId(item.azonosito)}
                  >
                    {item.cimke}
                  </Tooltip>
                ))}
              </div>
            </Toolbar>
          </PageSection>
          {(summary?.months ?? []).map((monthSummary) => (
            <PrimerMonthEditor
              key={monthSummary.month}
              monthSummary={monthSummary}
              request={request}
              filterId={dayFilterId}
              query={dayQuery}
              refreshToken={refreshToken}
              onAfterSave={async () => {
                setRefreshToken((value) => value + 1);
              }}
            />
          ))}
        </>
      ) : (
        <>
          <PageSection title="Névnézet" subtitle="Névlista, előfordulások és gyors áttekintés a kapcsolódó napokról.">
            <Toolbar>
              <SearchInput value={nameQuery} onChange={setNameQuery} placeholder="Keresés névre vagy dátumra…" />
              <div className="filter-button-row">
                {(summary?.filters?.names ?? []).map((item) => (
                  <Tooltip
                    as="button"
                    key={item.azonosito}
                    type="button"
                    className={nameFilterId === item.azonosito ? "tab-button active" : "tab-button"}
                    label={item.leiras}
                    onClick={() => setNameFilterId(item.azonosito)}
                  >
                    {item.cimke}
                  </Tooltip>
                ))}
              </div>
            </Toolbar>
          </PageSection>
          {nameIndexQuery.loading && mode === "nevek" && !nameIndexQuery.data ? <LoadingLabel label="Névindex betöltése…" /> : null}
          <ErrorLabel error={nameIndexQuery.error} />
          {nameIndexQuery.data ? <NameView nameIndex={nameIndexQuery.data} request={request} filterId={nameFilterId} query={nameQuery} /> : null}
        </>
      )}
    </div>
  );
}
