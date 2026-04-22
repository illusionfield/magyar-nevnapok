import { useEffect, useMemo, useState } from "react";
import {
  ActionButton,
  EmptyState,
  ErrorLabel,
  LoadingLabel,
  MetricStrip,
  MonthAccordion,
  PageSection,
  SearchInput,
  StatusBadge,
  StructuredSections,
  Toolbar,
  WorkspaceJobPanel,
} from "../ui.jsx";
import { useWsQuery } from "../hooks.js";
import { defaultMonthOpen } from "./shared/month-groups.js";

function getInitialAuditId() {
  const fromQuery = new URLSearchParams(window.location.search).get("audit");
  return fromQuery || "vegso-primer";
}

function AuditCard({ audit, selected, onSelect, onRerun }) {
  return (
    <button type="button" data-audit-id={audit.id} className={selected ? "catalog-card selected" : "catalog-card"} onClick={() => onSelect(audit.id)}>
      <div className="catalog-card-head">
        <strong>{audit.title}</strong>
        <StatusBadge tone={audit.status === "ok" ? "ok" : "warning"}>
          {audit.status === "ok" ? "rendben" : "figyelmet kér"}
        </StatusBadge>
      </div>
      <p>{audit.purpose}</p>
      <div className="catalog-kpis">
        {(audit.kpis ?? []).map((item) => (
          <span key={item.label}>
            {item.label}: <strong>{item.value}</strong>
          </span>
        ))}
      </div>
      <div className="catalog-actions">
        <span>{audit.generatedAt ?? "Még nincs riport"}</span>
        <button
          type="button"
          className="catalog-inline-action"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onRerun(audit.id);
          }}
        >
          Újrafuttatás
        </button>
      </div>
    </button>
  );
}

function ExceptionTable({ title, rows, onChange }) {
  return (
    <div className="editor-block">
      <div className="editor-block-head">
        <h3>{title}</h3>
        <button type="button" onClick={() => onChange([...(rows ?? []), { name: "", indoklas: "", forrasDatum: "" }])}>
          Új sor
        </button>
      </div>
      <table className="data-table compact-table">
        <thead>
          <tr>
            <th>Név</th>
            <th>Indoklás</th>
            <th>Forrásdátum</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row, index) => (
            <tr key={`${title}-${index}`}>
              <td>
                <input
                  value={row.name ?? ""}
                  onChange={(event) => {
                    const nextRows = [...rows];
                    nextRows[index] = { ...row, name: event.target.value };
                    onChange(nextRows);
                  }}
                />
              </td>
              <td>
                <input
                  value={row.indoklas ?? ""}
                  onChange={(event) => {
                    const nextRows = [...rows];
                    nextRows[index] = { ...row, indoklas: event.target.value };
                    onChange(nextRows);
                  }}
                />
              </td>
              <td>
                <input
                  value={row.forrasDatum ?? ""}
                  onChange={(event) => {
                    const nextRows = [...rows];
                    nextRows[index] = { ...row, forrasDatum: event.target.value };
                    onChange(nextRows);
                  }}
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => {
                    onChange(rows.filter((_, currentIndex) => currentIndex !== index));
                  }}
                >
                  Törlés
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OfficialAuditEditor({ detail, request, onSaved }) {
  const editor = detail.editor;
  const [notes, setNotes] = useState(editor?.notes ?? "");
  const [sources, setSources] = useState(editor?.sources ?? {});
  const [genders, setGenders] = useState({
    male: {
      extraInJson: editor?.genders?.find((entry) => entry.id === "male")?.lists?.[0]?.rows ?? [],
      missingFromJson: editor?.genders?.find((entry) => entry.id === "male")?.lists?.[1]?.rows ?? [],
    },
    female: {
      extraInJson: editor?.genders?.find((entry) => entry.id === "female")?.lists?.[0]?.rows ?? [],
      missingFromJson: editor?.genders?.find((entry) => entry.id === "female")?.lists?.[1]?.rows ?? [],
    },
  });

  useEffect(() => {
    setNotes(editor?.notes ?? "");
    setSources(editor?.sources ?? {});
    setGenders({
      male: {
        extraInJson: editor?.genders?.find((entry) => entry.id === "male")?.lists?.[0]?.rows ?? [],
        missingFromJson: editor?.genders?.find((entry) => entry.id === "male")?.lists?.[1]?.rows ?? [],
      },
      female: {
        extraInJson: editor?.genders?.find((entry) => entry.id === "female")?.lists?.[0]?.rows ?? [],
        missingFromJson: editor?.genders?.find((entry) => entry.id === "female")?.lists?.[1]?.rows ?? [],
      },
    });
  }, [editor]);

  return (
    <div className="page-stack">
      <StructuredSections sections={detail.sections ?? []} />
      <MetricStrip items={detail.metrics ?? []} />

      <PageSection title="Forrásmeta" subtitle="A forrásdátumok és a rövid szerkesztői megjegyzés itt tartható karban.">
        <div className="form-grid two-columns">
          <label>
            <span>Hivatalos névjegyzék dátuma</span>
            <input
              value={sources.hivatalosNevjegyzekDatum ?? ""}
              onChange={(event) => {
                setSources((current) => ({ ...current, hivatalosNevjegyzekDatum: event.target.value }));
              }}
            />
          </label>
          <label>
            <span>ELTE adatbázis dátuma</span>
            <input
              value={sources.elteAdatbazisDatum ?? ""}
              onChange={(event) => {
                setSources((current) => ({ ...current, elteAdatbazisDatum: event.target.value }));
              }}
            />
          </label>
        </div>
        <label>
          <span>Megjegyzés</span>
          <textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)} />
        </label>
      </PageSection>

      {(editor?.genders ?? []).map((gender) => (
        <PageSection key={gender.id} title={gender.label} subtitle="A dokumentált kivételek szerkesztése közvetlenül innen elvégezhető.">
          <ExceptionTable
            title={`${gender.label} – többlet az adatbázisban`}
            rows={genders[gender.id].extraInJson}
            onChange={(rows) => {
              setGenders((current) => ({
                ...current,
                [gender.id]: {
                  ...current[gender.id],
                  extraInJson: rows,
                },
              }));
            }}
          />
          <ExceptionTable
            title={`${gender.label} – hiányzik az adatbázisból`}
            rows={genders[gender.id].missingFromJson}
            onChange={(rows) => {
              setGenders((current) => ({
                ...current,
                [gender.id]: {
                  ...current[gender.id],
                  missingFromJson: rows,
                },
              }));
            }}
          />
        </PageSection>
      ))}

      <Toolbar>
        <ActionButton
          label="Mentés"
          onClick={async () => {
            await request("audits:save-official-exceptions", {
              notes,
              sources,
              genders,
              rerun: false,
            });
            await onSaved();
          }}
        />
        <ActionButton
          label="Mentés és újrafuttatás"
          onClick={async () => {
            await request("audits:save-official-exceptions", {
              notes,
              sources,
              genders,
              rerun: true,
            });
            await onSaved();
          }}
        />
      </Toolbar>
    </div>
  );
}

function AuditMonthContent({ auditId, monthSummary, query, request, refreshToken }) {
  const monthQuery = useWsQuery(
    () =>
      request("audits:get-detail-month", {
        auditId,
        month: monthSummary.month,
        query,
      }).then((payload) => payload.auditMonth),
    [request, auditId, monthSummary.month, query, refreshToken]
  );
  const data = monthQuery.data;

  return (
    <>
      {monthQuery.loading && !data ? <LoadingLabel label="Havi audit-részletek betöltése…" /> : null}
      <ErrorLabel error={monthQuery.error} />
      {data ? <StructuredSections sections={data.sections ?? []} /> : null}
    </>
  );
}

function AuditMonthSection({ auditId, monthSummary, query, request, refreshToken }) {
  return (
    <MonthAccordion
      group={monthSummary}
      defaultOpen={defaultMonthOpen(monthSummary, { query })}
      keepMountedAfterOpen={true}
    >
      <AuditMonthContent
        auditId={auditId}
        monthSummary={monthSummary}
        query={query}
        request={request}
        refreshToken={refreshToken}
      />
    </MonthAccordion>
  );
}

function AuditDetailBody({ detail, request, query, refreshToken, onSaved }) {
  if (!detail) {
    return <EmptyState title="Válassz auditot." detail="A bal oldali listából nyiss meg egy auditot a részletekhez." />;
  }

  if (detail.kind === "official") {
    return <OfficialAuditEditor detail={detail} request={request} onSaved={onSaved} />;
  }

  return (
    <div className="page-stack">
      <MetricStrip items={detail.metrics ?? []} />
      <StructuredSections sections={detail.sections ?? []} />
      {(detail.monthSummaries ?? []).length > 0 ? (
        <div className="page-stack">
          {(detail.monthSummaries ?? []).map((monthSummary) => (
            <AuditMonthSection
              key={`${detail.id}-${monthSummary.month}`}
              auditId={detail.id}
              monthSummary={monthSummary}
              query={query}
              request={request}
              refreshToken={refreshToken}
            />
          ))}
        </div>
      ) : (
        <EmptyState title="Ehhez az auditnézethez nincs havi bontás." />
      )}
    </div>
  );
}

export function AuditsPage({ request, connected, jobState, lastSocketError }) {
  const [selectedAuditId, setSelectedAuditId] = useState(getInitialAuditId);
  const [query, setQuery] = useState("");
  const [refreshToken, setRefreshToken] = useState(0);
  const catalogQuery = useWsQuery(() => request("audits:get-catalog").then((payload) => payload.auditCatalog), [request, refreshToken]);
  const detailQuery = useWsQuery(
    () => request("audits:get-detail-summary", { auditId: selectedAuditId }).then((payload) => payload.auditDetail),
    [request, selectedAuditId, refreshToken]
  );

  useEffect(() => {
    if (catalogQuery.data?.audits?.length && !catalogQuery.data.audits.some((audit) => audit.id === selectedAuditId)) {
      setSelectedAuditId(catalogQuery.data.audits[0].id);
    }
  }, [catalogQuery.data, selectedAuditId]);

  const selectedAudit = useMemo(
    () => catalogQuery.data?.audits?.find((audit) => audit.id === selectedAuditId) ?? null,
    [catalogQuery.data, selectedAuditId]
  );

  const rerunAudit = async (auditId) => {
    await request("audits:run", { auditId });
    setRefreshToken((value) => value + 1);
  };

  return (
    <div className="page-stack">
      <PageSection title="Auditok" subtitle="Auditkatalógus rövid összképpel, havi részletekkel és ahol kell, közvetlen szerkesztéssel.">
        <WorkspaceJobPanel
          workspace="auditok"
          connected={connected}
          jobState={jobState}
          lastSocketError={lastSocketError}
          idleLabel="Ha innen indítasz auditot, itt jelenik meg az előrehaladás és az aktuális futási szakasz."
        />
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} placeholder="Keresés a havi részletekben…" />
        </Toolbar>
      </PageSection>

      <div className="audit-layout">
        <div className="audit-catalog-column">
          {catalogQuery.loading && !catalogQuery.data ? <LoadingLabel /> : null}
          <ErrorLabel error={catalogQuery.error} />
          {(catalogQuery.data?.audits ?? []).map((audit) => (
            <AuditCard
              key={audit.id}
              audit={audit}
              selected={selectedAuditId === audit.id}
              onSelect={setSelectedAuditId}
              onRerun={rerunAudit}
            />
          ))}
        </div>

        <div className="audit-detail-column">
          {detailQuery.loading && !detailQuery.data ? <LoadingLabel label="Audit részletek betöltése…" /> : null}
          <ErrorLabel error={detailQuery.error} />
          {detailQuery.data ? (
            <PageSection
              title={detailQuery.data.title}
              subtitle={detailQuery.data.purpose}
              actions={
                <Toolbar>
                  <StatusBadge tone={detailQuery.data.status === "ok" ? "ok" : "warning"}>
                    {detailQuery.data.status === "ok" ? "Rendben" : "Figyelmet kér"}
                  </StatusBadge>
                  <StatusBadge tone="neutral">Utolsó futás: {detailQuery.data.generatedAt ?? "még nincs"}</StatusBadge>
                  {selectedAudit ? <ActionButton label="Audit újrafuttatása" onClick={() => rerunAudit(selectedAudit.id)} /> : null}
                </Toolbar>
              }
            >
              <AuditDetailBody
                detail={detailQuery.data}
                request={request}
                query={query}
                refreshToken={refreshToken}
                onSaved={async () => {
                  setRefreshToken((value) => value + 1);
                }}
              />
            </PageSection>
          ) : null}
        </div>
      </div>
    </div>
  );
}
