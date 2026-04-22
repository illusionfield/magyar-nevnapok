import { useEffect, useState } from "react";
import {
  ActionButton,
  EmptyState,
  ErrorLabel,
  LoadingLabel,
  MetricStrip,
  MonthAccordion,
  NameTokenEditor,
  PageSection,
  SearchInput,
  Toolbar,
  WorkspaceJobPanel,
} from "../ui.jsx";
import { useWsQuery } from "../hooks.js";
import { defaultMonthOpen } from "./shared/month-groups.js";

function arraysEqual(left = [], right = []) {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
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
  const [commonDrafts, setCommonDrafts] = useState({});
  const [localDrafts, setLocalDrafts] = useState({});

  useEffect(() => {
    if (!monthQuery.data?.rows) {
      return;
    }

    setCommonDrafts(
      Object.fromEntries(monthQuery.data.rows.map((row) => [row.monthDay, row.trackedPreferredNames ?? []]))
    );
    setLocalDrafts(
      Object.fromEntries(monthQuery.data.rows.map((row) => [row.monthDay, row.localAddedPreferredNames ?? []]))
    );
  }, [monthQuery.data]);

  return (
    <>
      {monthQuery.loading && !monthQuery.data ? <LoadingLabel label="Havi részletek betöltése…" /> : null}
      <ErrorLabel error={monthQuery.error} />
      {monthQuery.data ? (
        month.rows.length > 0 ? (
          <table className="data-table primer-table">
            <thead>
              <tr>
                <th>Dátum</th>
                <th>Közös primer döntés</th>
                <th>Effektív primer</th>
                <th>Hiányzó nevek</th>
                <th>Helyi hozzáadások</th>
                <th>Források / eltérések</th>
                <th>Állapot</th>
                <th>Műveletek</th>
              </tr>
            </thead>
            <tbody>
              {month.rows.map((row) => {
                const commonValues = commonDrafts[row.monthDay] ?? row.trackedPreferredNames ?? [];
                const localValues = localDrafts[row.monthDay] ?? row.localAddedPreferredNames ?? [];
                const commonDirty = !arraysEqual(commonValues, row.trackedPreferredNames ?? []);
                const localDirty = !arraysEqual(localValues, row.localAddedPreferredNames ?? []);

                return (
                  <tr key={row.monthDay}>
                    <td>
                      <strong>{row.dateLabel}</strong>
                      <div className="mini-meta">{row.monthDay}</div>
                    </td>
                    <td>
                      <NameTokenEditor
                        values={commonValues}
                        suggestions={row.candidateNames}
                        placeholder="Közös primer név…"
                        onChange={(values) => {
                          setCommonDrafts((current) => ({ ...current, [row.monthDay]: values }));
                        }}
                      />
                    </td>
                    <td>
                      <strong>{(row.effectivePreferredNames ?? []).join(", ") || "—"}</strong>
                      <div className="mini-meta">Közös alap: {(row.commonPreferredNames ?? []).join(", ") || "—"}</div>
                    </td>
                    <td>{(row.effectiveMissingNames ?? []).join(", ") || "—"}</td>
                    <td>
                      <NameTokenEditor
                        values={localValues}
                        suggestions={row.candidateNames}
                        placeholder="Helyi hozzáadás…"
                        onChange={(values) => {
                          setLocalDrafts((current) => ({ ...current, [row.monthDay]: values }));
                        }}
                      />
                    </td>
                    <td>
                      <div className="source-stack">
                        <span><strong>Legacy:</strong> {row.sourceSummary.legacy}</span>
                        <span><strong>Wiki:</strong> {row.sourceSummary.wiki}</span>
                        <span><strong>Normalizált:</strong> {row.sourceSummary.normalized}</span>
                        <span><strong>Rangsor:</strong> {row.sourceSummary.ranking}</span>
                      </div>
                    </td>
                    <td>
                      <div className="status-stack">
                        {row.flags?.hasMissing ? <span>nyitott hiány</span> : null}
                        {row.flags?.hasLocal ? <span>helyi hozzáadás</span> : null}
                        {row.flags?.isManualOverride ? <span>kézi override</span> : null}
                        {row.flags?.isValidationMismatch ? <span>eltérés</span> : null}
                        {!row.flags?.hasMissing && !row.flags?.hasLocal && !row.flags?.isManualOverride && !row.flags?.isValidationMismatch ? (
                          <span>rendben</span>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="row-action-stack">
                        <ActionButton
                          label={commonDirty ? "Közös mentése" : "Közös kész"}
                          disabled={!commonDirty}
                          onClick={async () => {
                            await request("primer-audit:save-common-day", {
                              monthDay: row.monthDay,
                              preferredNames: commonValues,
                              rerun: true,
                            });
                            monthQuery.refresh();
                            await onAfterSave();
                          }}
                        />
                        <ActionButton
                          label={localDirty ? "Helyi mentése" : "Helyi kész"}
                          disabled={!localDirty}
                          onClick={async () => {
                            await request("primer-audit:save-local-day", {
                              monthDay: row.monthDay,
                              addedPreferredNames: localValues,
                            });
                            monthQuery.refresh();
                            await onAfterSave();
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

function NameView({ namesData, onPageChange }) {
  if (!namesData || namesData.items.length === 0) {
    return <EmptyState title="Nincs találat a névnézetben." detail="Szűkíts kevesebbet, vagy írj más keresést." />;
  }

  return (
    <div className="page-stack">
      <Toolbar>
        <span className="muted-text">
          {namesData.totalItems} találat • {namesData.page}. oldal / {namesData.totalPages}
        </span>
        <ActionButton label="Előző oldal" disabled={namesData.page <= 1} onClick={() => onPageChange(namesData.page - 1)} />
        <ActionButton
          label="Következő oldal"
          disabled={namesData.page >= namesData.totalPages}
          onClick={() => onPageChange(namesData.page + 1)}
        />
      </Toolbar>
      <div className="name-list">
        {namesData.items.map((entry) => (
          <article key={entry.name} className="name-card">
            <div className="name-card-head">
              <strong>{entry.name}</strong>
              <span>{entry.occurrenceCount} előfordulás</span>
            </div>
            <div className="catalog-kpis">
              <span>hiányzó: {entry.counts.missing ?? 0}</span>
              <span>helyi: {entry.counts.local ?? 0}</span>
              <span>végső: {entry.counts.final ?? 0}</span>
              <span>rejtett: {entry.counts.hidden ?? 0}</span>
            </div>
            <ul className="plain-list compact-list">
              {(entry.occurrences ?? []).map((occurrence) => (
                <li key={`${entry.name}-${occurrence.monthDay}`}>
                  <strong>{occurrence.dateLabel}</strong>
                  <span>{(occurrence.effectivePreferredNames ?? []).join(", ") || "—"}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </div>
  );
}

function PrimerSettingsEditor({ fields, value, onChange, onSave }) {
  return (
    <PageSection title="Saját primerbeállítások" subtitle="A helyi overlay globális beállításai egy rövid, egyszerű szerkesztőfelületen.">
      <div className="settings-grid">
        {fields.map((field) => (
          <label key={field.key} className="field-card">
            <span className="field-label">{field.label}</span>
            {field.type === "enum" ? (
              <select
                value={field.value}
                onChange={(event) => {
                  if (field.key === "primarySource") {
                    onChange({ ...value, primarySource: event.target.value });
                  }
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
                type="checkbox"
                checked={field.value === true}
                onChange={(event) => {
                  const nextModifiers = {
                    ...(value.modifiers ?? {}),
                    [field.key.endsWith("normalized") ? "normalized" : "ranking"]: event.target.checked,
                  };
                  onChange({
                    ...value,
                    modifiers: nextModifiers,
                  });
                }}
              />
            )}
            <span className="field-summary">{field.summary}</span>
            <span className="field-help">{field.description}</span>
          </label>
        ))}
      </div>
      <Toolbar>
        <ActionButton label="Mentés" onClick={onSave} />
      </Toolbar>
    </PageSection>
  );
}

export function PrimerAuditPage({ request, connected, jobState, lastSocketError }) {
  const [mode, setMode] = useState("napok");
  const [dayQuery, setDayQuery] = useState("");
  const [dayFilterId, setDayFilterId] = useState("akciozhato");
  const [nameQuery, setNameQuery] = useState("");
  const [nameFilterId, setNameFilterId] = useState("osszes");
  const [nameSortId, setNameSortId] = useState("relevancia");
  const [namePage, setNamePage] = useState(1);
  const [refreshToken, setRefreshToken] = useState(0);
  const summaryQuery = useWsQuery(
    () => request("primer-audit:get-summary").then((payload) => payload.primerAuditSummary),
    [request, refreshToken]
  );
  const summary = summaryQuery.data;
  const [settingsDraft, setSettingsDraft] = useState(null);
  const namesQuery = useWsQuery(
    () =>
      request("primer-audit:get-names", {
        filterId: nameFilterId,
        query: nameQuery,
        sortId: nameSortId,
        page: namePage,
        pageSize: 120,
      }).then((payload) => payload.primerAuditNames),
    [request, nameFilterId, nameQuery, nameSortId, namePage, refreshToken],
    {
      enabled: mode === "nevek",
    }
  );

  useEffect(() => {
    if (!summary) {
      return;
    }

    setSettingsDraft(summary.settings);
  }, [summary]);

  useEffect(() => {
    setNamePage(1);
  }, [nameFilterId, nameQuery, nameSortId]);

  return (
    <div className="page-stack">
      <PageSection title="Primer audit" subtitle="A közös primerdöntések, a helyi feloldások és a saját primerprofil egy admin munkatéren marad.">
        <WorkspaceJobPanel
          workspace="primer-audit"
          connected={connected}
          jobState={jobState}
          lastSocketError={lastSocketError}
          idleLabel="A közös primernap mentésekor indul újrafuttatás; annak állapota itt látszik majd százalékos visszajelzéssel."
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
              { label: "Nyitott hiány", value: summary.summary.effectiveMissingCount ?? 0 },
              { label: "Helyi feloldás", value: summary.summary.locallyResolvedMissingCount ?? 0 },
              { label: "Kézi override napok", value: summary.summary.overrideDayCount ?? 0 },
            ]}
          />
        ) : null}
      </PageSection>

      {summary && settingsDraft ? (
        <PrimerSettingsEditor
          fields={summary.settingsFields ?? []}
          value={settingsDraft}
          onChange={setSettingsDraft}
          onSave={async () => {
            await request("primer-audit:save-settings", { settings: settingsDraft });
            setRefreshToken((value) => value + 1);
          }}
        />
      ) : null}

      {mode === "napok" ? (
        <>
          <PageSection title="Napnézet" subtitle="Havi csoportokba rendezett, soronként szerkeszthető primer döntések és helyi kiegészítések.">
            <Toolbar>
              <select value={dayFilterId} onChange={(event) => setDayFilterId(event.target.value)}>
                {(summary?.filters?.days ?? []).map((item) => (
                  <option key={item.azonosito} value={item.azonosito}>
                    {item.cimke}
                  </option>
                ))}
              </select>
              <SearchInput value={dayQuery} onChange={setDayQuery} placeholder="Keresés dátumra vagy névre…" />
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
              <select value={nameFilterId} onChange={(event) => setNameFilterId(event.target.value)}>
                {(summary?.filters?.names ?? []).map((item) => (
                  <option key={item.azonosito} value={item.azonosito}>
                    {item.cimke}
                  </option>
                ))}
              </select>
              <select value={nameSortId} onChange={(event) => setNameSortId(event.target.value)}>
                {(summary?.filters?.sorts ?? []).map((item) => (
                  <option key={item.azonosito} value={item.azonosito}>
                    {item.cimke}
                  </option>
                ))}
              </select>
              <SearchInput value={nameQuery} onChange={setNameQuery} placeholder="Keresés névre vagy dátumra…" />
            </Toolbar>
          </PageSection>
          {namesQuery.loading && mode === "nevek" && !namesQuery.data ? <LoadingLabel label="Névlista betöltése…" /> : null}
          <ErrorLabel error={namesQuery.error} />
          {namesQuery.data ? <NameView namesData={namesQuery.data} onPageChange={setNamePage} /> : null}
        </>
      )}
    </div>
  );
}
