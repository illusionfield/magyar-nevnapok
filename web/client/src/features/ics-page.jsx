import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  EmptyState,
  ErrorLabel,
  LoadingLabel,
  MonthAccordion,
  PageSection,
  StatusBadge,
  Toolbar,
  WorkspaceJobPanel,
} from "../ui.jsx";
import { useWsQuery } from "../hooks.js";
import {
  flagsToLeapProfile,
  getNestedValue,
  setNestedValue,
} from "./shared/ics-draft.js";

function SettingField({ field, settings, disabled = false, onDraftChange, onCommit }) {
  const value = getNestedValue(settings, field.key);

  return (
    <label className="field-card compact-field">
      <span className="field-label">{field.label}</span>
      {field.type === "enum" ? (
        <select
          value={value}
          disabled={disabled}
          onChange={(event) => {
            const nextSettings = setNestedValue(settings, field.key, event.target.value);
            onDraftChange(nextSettings);
            Promise.resolve(onCommit(nextSettings)).catch(() => {});
          }}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          step={field.step ?? undefined}
          disabled={disabled}
          value={value ?? ""}
          onChange={(event) => {
            const nextValue = field.type === "number" ? Number(event.target.value) : event.target.value;
            onDraftChange(setNestedValue(settings, field.key, nextValue));
          }}
          onBlur={() => {
            Promise.resolve(onCommit(settings)).catch(() => {});
          }}
        />
      )}
      <span className="field-help">{field.description}</span>
    </label>
  );
}

function LeapProfileCard({ editor, settings, disabled, onDraftChange, onCommit }) {
  const leapProfile = editor.leapProfile;

  const updateLeapFlags = (nextFlags) => {
    const nextSettings = setNestedValue(settings, "shared.leapProfile", flagsToLeapProfile(nextFlags));
    onDraftChange(nextSettings);
    Promise.resolve(onCommit(nextSettings)).catch(() => {});
  };

  return (
    <PageSection title="Szökőéves profil" subtitle="A szökőnap körüli kompatibilitást és az ehhez kapcsolódó időablakot itt tudod egyszerre átlátni és módosítani.">
      <p className="muted-text">{leapProfile.description}</p>
      <div className="toggle-explainer-grid">
        {(leapProfile.toggles ?? []).map((toggle) => (
          <label key={toggle.id} className="toggle-explainer">
            <div className="toggle-row">
              <input
                type="checkbox"
                checked={toggle.id === "a" ? leapProfile.aEnabled : leapProfile.bEnabled}
                disabled={disabled}
                onChange={(event) => {
                  updateLeapFlags({
                    aEnabled: toggle.id === "a" ? event.target.checked : leapProfile.aEnabled,
                    bEnabled: toggle.id === "b" ? event.target.checked : leapProfile.bEnabled,
                  });
                }}
              />
              <strong>{toggle.label}</strong>
            </div>
            <span>{toggle.description}</span>
          </label>
        ))}
      </div>

      <div className="settings-grid compact-grid">
        <label className="field-card compact-field">
          <span className="field-label">Kezdő év</span>
          <input
            type="number"
            value={settings.shared.fromYear ?? ""}
            min="1900"
            max="2100"
            step="1"
            disabled={disabled}
            onChange={(event) => {
              onDraftChange(setNestedValue(settings, "shared.fromYear", Number(event.target.value)));
            }}
            onBlur={() => Promise.resolve(onCommit(settings)).catch(() => {})}
          />
          <span className="field-help">A generált naptárak első éve.</span>
        </label>
        <label className="field-card compact-field">
          <span className="field-label">Utolsó év</span>
          <input
            type="number"
            value={settings.shared.untilYear ?? ""}
            min="1900"
            max="2100"
            step="1"
            disabled={disabled}
            onChange={(event) => {
              onDraftChange(setNestedValue(settings, "shared.untilYear", Number(event.target.value)));
            }}
            onBlur={() => Promise.resolve(onCommit(settings)).catch(() => {})}
          />
          <span className="field-help">Eddig az évig készüljenek események.</span>
        </label>
        {leapProfile.showBaseYear ? (
          <label className="field-card compact-field">
            <span className="field-label">Bázisév</span>
            <input
              type="number"
              value={settings.shared.baseYear ?? ""}
              min="1900"
              max="2100"
              step="1"
              disabled={disabled}
              onChange={(event) => {
                onDraftChange(setNestedValue(settings, "shared.baseYear", Number(event.target.value)));
              }}
              onBlur={() => Promise.resolve(onCommit(settings)).catch(() => {})}
            />
            <span className="field-help">A kompatibilitási számítások ehhez az évhez igazodnak.</span>
          </label>
        ) : null}
      </div>
    </PageSection>
  );
}

function CalendarModeCard({ editor, settings, disabled, onDraftChange, onCommit }) {
  const isSplit = editor.calendarMode.partitionMode === "split";
  const switchTo = (mode) => {
    const nextSettings = setNestedValue(settings, "partitionMode", mode);
    onDraftChange(nextSettings);
    Promise.resolve(onCommit(nextSettings)).catch(() => {});
  };

  return (
    <PageSection title="Naptárbeállítások" subtitle="A kimenet szerkezete és a látható eseményszintű beállítások itt maradnak egy helyen, rövid magyarázatokkal.">
      <div className="mode-switch-row">
        <div>
          <span className="field-label">Kimeneti szerkezet</span>
          <p className="muted-text">{editor.calendarMode.description}</p>
        </div>
        <div className="view-switch">
          <button type="button" className={!isSplit ? "tab-button active" : "tab-button"} disabled={disabled} onClick={() => switchTo("single")}>Egy naptár</button>
          <button type="button" className={isSplit ? "tab-button active" : "tab-button"} disabled={disabled} onClick={() => switchTo("split")}>Bontott naptár</button>
        </div>
      </div>

      {isSplit ? (
        <label className="field-card compact-field inline-toggle-field">
          <div className="toggle-row">
            <input
              type="checkbox"
              checked={editor.calendarMode.includeOtherDaysField?.value === true}
              disabled={disabled}
              onChange={(event) => {
                const nextSettings = setNestedValue(settings, editor.calendarMode.includeOtherDaysField.key, event.target.checked);
                onDraftChange(nextSettings);
                Promise.resolve(onCommit(nextSettings)).catch(() => {});
              }}
            />
            <strong>{editor.calendarMode.includeOtherDaysField?.label}</strong>
          </div>
          <span>{editor.calendarMode.includeOtherDaysField?.description}</span>
        </label>
      ) : null}

      <div className={isSplit ? "two-column-grid" : "page-stack"}>
        {(editor.calendarMode.calendars ?? []).map((calendar) => (
          <section key={calendar.id} className="calendar-panel">
            <div className="calendar-panel-head">
              <h3>{calendar.label}</h3>
              <p className="section-subtitle">{calendar.description}</p>
            </div>
            <div className="calendar-field-grid">
              {[calendar.calendarName, calendar.layout, calendar.descriptionMode, calendar.descriptionFormat, calendar.ordinalDay].map((field) => (
                <SettingField
                  key={field.key}
                  field={field}
                  settings={settings}
                  disabled={disabled}
                  onDraftChange={onDraftChange}
                  onCommit={onCommit}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </PageSection>
  );
}

function getFirstDetailId(preview) {
  for (const month of preview?.months ?? []) {
    for (const row of month.rows ?? []) {
      for (const column of preview?.columns ?? []) {
        const firstName = row.cells?.[column.id]?.names?.[0] ?? null;

        if (firstName?.detailId) {
          return firstName.detailId;
        }
      }
    }
  }

  return null;
}

function monthContainsDetail(month, detailId) {
  if (!detailId) {
    return false;
  }

  return (month?.rows ?? []).some((row) =>
    Object.values(row.cells ?? {}).some((cell) =>
      (cell?.names ?? []).some((name) => name.detailId === detailId)
    )
  );
}

function formatPreviewMetaValue(value) {
  if (value == null) {
    return null;
  }

  if (Array.isArray(value)) {
    const filtered = value.filter(Boolean);
    return filtered.length > 0 ? filtered.join(", ") : null;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return null;
}

function buildDetailMetaRows(detail) {
  const meta = detail?.meta ?? null;

  if (!meta) {
    return [];
  }

  const dayMeta = meta.dayMeta ?? {};
  const ranking = dayMeta.ranking ?? null;
  const frequencyParts = [
    meta.frequency?.overall ? `összesített: ${meta.frequency.overall}` : null,
    meta.frequency?.newborns ? `újszülött: ${meta.frequency.newborns}` : null,
    meta.frequency?.trend ? `meta: ${meta.frequency.trend}` : null,
  ].filter(Boolean);
  const dayFlags = [
    dayMeta.primary ? "primer" : null,
    dayMeta.primaryLocal ? "helyi primer" : null,
    dayMeta.primaryLegacy ? "legacy primer" : null,
    dayMeta.primaryRanked ? "rangsorolt primer" : null,
    dayMeta.primaryRegistry ? "végső primerjegyzék" : null,
    dayMeta.primaryOverlay ? "overlay primer" : null,
  ].filter(Boolean);
  const rankingParts = [
    Number.isInteger(ranking?.dayOrder) ? `napi sorrend: ${ranking.dayOrder}` : null,
    Number.isInteger(ranking?.overallRank) ? `összesített hely: ${ranking.overallRank}` : null,
    Number.isInteger(ranking?.newbornRank) ? `újszülött hely: ${ranking.newbornRank}` : null,
    Number.isInteger(ranking?.score) ? `pontszám: ${ranking.score}` : null,
  ].filter(Boolean);
  const legacyOrder = Number.isInteger(dayMeta.legacyOrder) ? String(dayMeta.legacyOrder) : null;

  return [
    { label: "Naptár", value: meta.calendarLabel ?? detail?.calendarLabel ?? null },
    { label: "Dátum", value: detail?.dateLabel ?? null },
    { label: "Nem", value: meta.gender ?? null },
    { label: "Eredet", value: meta.origin ?? null },
    { label: "Jelentés", value: meta.meaning ?? null },
    { label: "Becézések", value: formatPreviewMetaValue(meta.nicknames) },
    { label: "Rokon nevek", value: formatPreviewMetaValue(meta.relatedNames) },
    { label: "Gyakoriság", value: frequencyParts.join(" • ") || null },
    { label: "További névnapok", value: formatPreviewMetaValue(meta.otherNamedays) },
    { label: "Napi meta", value: dayFlags.join(" • ") || null },
    { label: "Legacy sorrend", value: legacyOrder },
    { label: "Ranking", value: rankingParts.join(" • ") || null },
  ].filter((row) => row.value);
}

function PreviewMonthTable({ month, columns = [], selectedDetailId, onSelectDetail }) {
  if ((month?.rows ?? []).length === 0) {
    return <EmptyState title="Ebben a hónapban nincs előnézeti sor." />;
  }

  return (
    <div className="table-wrap">
      <table className="data-table compact-table preview-data-table">
        <thead>
          <tr>
            <th>Dátum</th>
            {columns.map((column) => (
              <th key={column.id}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(month.rows ?? []).map((row) => (
            <tr key={row.monthDay}>
              <td className="preview-date-cell">{row.dateLabel}</td>
              {columns.map((column) => {
                const cell = row.cells?.[column.id] ?? null;
                const names = cell?.names ?? [];

                return (
                  <td key={`${row.monthDay}-${column.id}`} className="preview-name-cell">
                    {names.length > 0 ? (
                      <div className="preview-name-token-row">
                        {names.map((name) => (
                          <button
                            key={name.id}
                            type="button"
                            className={selectedDetailId === name.detailId ? "token-chip selected" : "token-chip"}
                            onClick={() => onSelectDetail(name.detailId)}
                          >
                            {name.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="muted-text">—</span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PreviewDetailPanel({ detail }) {
  if (!detail) {
    return <EmptyState title="Válassz nevet az előnézetből." detail="A részletes leírás és a metaadatok itt jelennek meg." />;
  }

  const metaRows = buildDetailMetaRows(detail);

  return (
    <section className="preview-detail-panel">
      <div className="preview-detail-head">
        <div>
          <h3>{detail.name}</h3>
          <p className="section-subtitle">{detail.dateLabel}</p>
        </div>
        <div className="inline-badge-row">
          <StatusBadge tone="neutral">{detail.calendarLabel}</StatusBadge>
        </div>
      </div>

      <div className="preview-detail-copy">
        <h4>Teljes leírás</h4>
        <pre className="log-console description-preview compact-description-preview">{detail.plainDescription || "Nincs részletes leírás."}</pre>
      </div>

      <div className="preview-detail-copy">
        <h4>Metaadatok</h4>
        {metaRows.length > 0 ? (
          <dl className="preview-meta-grid">
            {metaRows.map((row) => (
              <div key={row.label} className="preview-meta-row">
                <dt>{row.label}</dt>
                <dd>{row.value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState title="Ehhez a névhez most nincs külön metaadat." />
        )}
      </div>
    </section>
  );
}

export function IcsPage({ request, connected, jobState, lastSocketError }) {
  const editorQuery = useWsQuery(() => request("ics:get-editor").then((payload) => payload.icsEditor), [request]);
  const [editorState, setEditorState] = useState(null);
  const [settings, setSettings] = useState(null);
  const [preview, setPreview] = useState(null);
  const [downloads, setDownloads] = useState([]);
  const [selectedDetailId, setSelectedDetailId] = useState(null);
  const [saveState, setSaveState] = useState({ pending: false, error: null, message: null });
  const [rawPanels, setRawPanels] = useState({});
  const [rawLoading, setRawLoading] = useState({});
  const activeJob = jobState?.activeJob?.workspace === "ics" ? jobState.activeJob : null;
  const busy = saveState.pending || Boolean(activeJob);
  const editor = editorState ?? editorQuery.data;

  const loadPreview = async (nextSettings) => {
    const response = await request("ics:preview", { settings: nextSettings });
    setPreview(response.icsPreview);
    return response.icsPreview;
  };

  useEffect(() => {
    if (!editorQuery.data) {
      return;
    }

    setEditorState(editorQuery.data);
    setSettings(editorQuery.data.savedSettings);
  }, [editorQuery.data]);

  useEffect(() => {
    if (!editorState || preview) {
      return;
    }

    loadPreview(editorState.savedSettings).catch(() => {
      // a hiba megjelenik a websocket kérésnél használatkor, itt nem duplikáljuk külön
    });
  }, [editorState, preview]);

  const firstDetailId = useMemo(() => getFirstDetailId(preview), [preview]);

  useEffect(() => {
    if (!preview) {
      return;
    }

    const detailIds = new Set(Object.keys(preview.details ?? {}));

    if (selectedDetailId && detailIds.has(selectedDetailId)) {
      return;
    }

    setSelectedDetailId(firstDetailId ?? null);
  }, [preview, selectedDetailId, firstDetailId]);

  const persistSettings = async (nextSettings) => {
    setSaveState({ pending: true, error: null, message: null });

    try {
      const saveResponse = await request("ics:save", { settings: nextSettings });
      setEditorState(saveResponse.icsEditor);
      setSettings(saveResponse.icsEditor.savedSettings);
      setRawPanels({});
      await loadPreview(saveResponse.icsEditor.savedSettings);
      setSaveState({ pending: false, error: null, message: "Mentve, az előnézet frissült." });
    } catch (error) {
      setSaveState({ pending: false, error: error.message, message: null });
      throw error;
    }
  };

  const handleGenerate = async () => {
    const response = await request("ics:generate", { settings });
    setEditorState(response.icsEditor ?? editorState);
    if (response.icsEditor?.savedSettings) {
      setSettings(response.icsEditor.savedSettings);
    }
    setPreview(response.icsPreview ?? null);
    setDownloads(response.downloads ?? []);
    setRawPanels({});
  };

  const loadRawPanel = async (calendarId) => {
    if (rawPanels[calendarId] || rawLoading[calendarId]) {
      return;
    }

    setRawLoading((current) => ({ ...current, [calendarId]: true }));

    try {
      const response = await request("ics:get-raw-preview", {
        settings,
        panelId: calendarId,
      });
      const rawCalendar = response.icsRawPreview?.calendars?.find((calendar) => calendar.id === calendarId) ?? null;
      setRawPanels((current) => ({ ...current, [calendarId]: rawCalendar?.rawText ?? "Nincs nyers előnézet." }));
    } finally {
      setRawLoading((current) => ({ ...current, [calendarId]: false }));
    }
  };

  const selectedDetail = selectedDetailId ? preview?.details?.[selectedDetailId] ?? null : null;

  return (
    <div className="page-stack">
      <PageSection title="ICS naptárak" subtitle="A mentés, az előnézet és a végső generálás ugyanazon az oldalon marad.">
        <WorkspaceJobPanel
          workspace="ics"
          connected={connected}
          jobState={jobState}
          lastSocketError={lastSocketError}
          idleLabel="Az élő mentés nem külön jobként fut. A végső generálásnál itt jelenik meg a százalékos állapot és az aktuális szakasz."
        />
        {editorQuery.loading && !editor ? <LoadingLabel /> : null}
        <ErrorLabel error={editorQuery.error} />
        <ErrorLabel error={saveState.error} />
        {saveState.message ? <p className="success-text">{saveState.message}</p> : null}
        {editor ? (
          <Toolbar>
            <StatusBadge tone="neutral">{editor.status.modeLabel}</StatusBadge>
            <StatusBadge tone="neutral">{editor.status.leapProfileLabel}</StatusBadge>
            <span className="muted-text">Fájlok: {(editor.outputs ?? []).join(", ") || "—"}</span>
          </Toolbar>
        ) : null}
      </PageSection>

      {editor && settings ? (
        <>
          <LeapProfileCard
            editor={editor}
            settings={settings}
            disabled={busy}
            onDraftChange={setSettings}
            onCommit={persistSettings}
          />

          <CalendarModeCard
            editor={editor}
            settings={settings}
            disabled={busy}
            onDraftChange={setSettings}
            onCommit={persistSettings}
          />

          <PageSection title="Előnézet" subtitle="A hónapok primer-audit mintájú accordionban nyílnak, a táblázatban pedig névre kattintva külön részletes leírás jelenik meg.">
            {preview ? (
              <div className="preview-table-layout">
                <div className="page-stack compact-stack">
                  {(preview.months ?? []).map((month, index) => (
                    <MonthAccordion
                      key={month.month}
                      group={month}
                      defaultOpen={monthContainsDetail(month, selectedDetailId) || (!selectedDetailId && index === 0)}
                      keepMountedAfterOpen={true}
                    >
                      <PreviewMonthTable
                        month={month}
                        columns={preview.columns ?? []}
                        selectedDetailId={selectedDetailId}
                        onSelectDetail={setSelectedDetailId}
                      />
                    </MonthAccordion>
                  ))}
                </div>
                <PreviewDetailPanel detail={selectedDetail} />
              </div>
            ) : (
              <EmptyState title="Még nincs előnézet." detail="A mentett beállítás után itt automatikusan megjelenik a havi nézet." />
            )}
          </PageSection>

          <PageSection title="Generálás és letöltés" subtitle="A letöltési linkek a generálás után jelennek meg, a nyers ICS pedig külön, lustán betöltött lenyíló részben marad.">
            <Toolbar>
              <ActionButton label="ICS generálás" tone="primary" disabled={busy} onClick={handleGenerate} />
              {(downloads ?? []).map((download) => (
                <a key={download.token} className="download-link" href={download.url} target="_blank" rel="noreferrer">
                  {download.fileName}
                </a>
              ))}
            </Toolbar>

            {(preview?.calendars ?? []).map((calendar) => (
              <details
                key={calendar.id}
                className="raw-preview-details"
                onToggle={(event) => {
                  if (event.currentTarget.open) {
                    loadRawPanel(calendar.id);
                  }
                }}
              >
                <summary>{calendar.label} – nyers ICS előnézet</summary>
                {rawLoading[calendar.id] ? <LoadingLabel label="Nyers előnézet betöltése…" /> : null}
                <pre className="log-console raw-preview">{rawPanels[calendar.id] ?? "Nyisd le a panelt a nyers ICS előnézet betöltéséhez."}</pre>
              </details>
            ))}
          </PageSection>
        </>
      ) : null}
    </div>
  );
}
