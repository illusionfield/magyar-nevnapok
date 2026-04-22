import { useEffect, useState } from "react";
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
  Toolbar,
} from "../ui.jsx";
import { useWsQuery } from "../hooks.js";
import { defaultMonthOpen } from "./shared/month-groups.js";

function AuditCard({ audit, selected, onSelect, onRerun }) {
  return (
    <button type="button" className={selected ? "catalog-card selected" : "catalog-card"} onClick={() => onSelect(audit.id)}>
      <div className="catalog-card-head">
        <strong>{audit.title}</strong>
        <StatusBadge tone={audit.status === "ok" ? "ok" : "warning"}>{audit.status === "ok" ? "rendben" : "figyelmet kér"}</StatusBadge>
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
        <span className="catalog-action-link" onClick={(event) => {
          event.stopPropagation();
          onRerun(audit.id);
        }}>
          Újrafuttatás
        </span>
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

function OfficialAuditInspector({ detail, request, onSaved }) {
  const [notes, setNotes] = useState(detail?.notes ?? "");
  const [sources, setSources] = useState(detail?.sources ?? {});
  const [genders, setGenders] = useState({
    male: {
      extraInJson: detail?.genders?.find((entry) => entry.id === "male")?.lists?.[0]?.rows ?? [],
      missingFromJson: detail?.genders?.find((entry) => entry.id === "male")?.lists?.[1]?.rows ?? [],
    },
    female: {
      extraInJson: detail?.genders?.find((entry) => entry.id === "female")?.lists?.[0]?.rows ?? [],
      missingFromJson: detail?.genders?.find((entry) => entry.id === "female")?.lists?.[1]?.rows ?? [],
    },
  });

  useEffect(() => {
    setNotes(detail?.notes ?? "");
    setSources(detail?.sources ?? {});
    setGenders({
      male: {
        extraInJson: detail?.genders?.find((entry) => entry.id === "male")?.lists?.[0]?.rows ?? [],
        missingFromJson: detail?.genders?.find((entry) => entry.id === "male")?.lists?.[1]?.rows ?? [],
      },
      female: {
        extraInJson: detail?.genders?.find((entry) => entry.id === "female")?.lists?.[0]?.rows ?? [],
        missingFromJson: detail?.genders?.find((entry) => entry.id === "female")?.lists?.[1]?.rows ?? [],
      },
    });
  }, [detail]);

  return (
    <div className="page-stack">
      <MetricStrip
        items={(detail.genders ?? []).flatMap((gender) => [
          { label: `${gender.label} – hivatalos`, value: gender.officialCount ?? 0 },
          { label: `${gender.label} – adatbázis`, value: gender.jsonCount ?? 0 },
          { label: `${gender.label} – dokumentált`, value: (gender.documentedExtraCount ?? 0) + (gender.documentedMissingCount ?? 0) },
          { label: `${gender.label} – tisztázandó`, value: (gender.unresolvedExtraCount ?? 0) + (gender.unresolvedMissingCount ?? 0) },
        ])}
      />

      <PageSection title="Forrásmeta" subtitle="A kivétellista forrásdátumai és megjegyzései.">
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
          <textarea
            rows="3"
            value={notes}
            onChange={(event) => {
              setNotes(event.target.value);
            }}
          />
        </label>
      </PageSection>

      {(detail.genders ?? []).map((gender) => (
        <PageSection key={gender.id} title={gender.label} subtitle="A szerkeszthető, kézi kivétellisták naprakészen tartása.">
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
          label="Mentés és audit újrafuttatása"
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

function WikiRows({ rows }) {
  return (
    <div className="diff-card-list">
      {rows.map((row) => (
        <article key={row.monthDay} className="diff-card">
          <div className="diff-card-head">
            <strong>{row.dateLabel}</strong>
            <span>összes eltérés: {row.mismatchCount}</span>
          </div>
          {row.nameDiff ? (
            <div className="diff-block">
              <h3>Névkészlet</h3>
              <p>{row.nameDiff.typeLabel}</p>
              <p><strong>Csak legacy:</strong> {(row.nameDiff.onlyLegacy ?? []).join(", ") || "—"}</p>
              <p><strong>Csak wiki:</strong> {(row.nameDiff.onlyWiki ?? []).join(", ") || "—"}</p>
            </div>
          ) : null}
          {row.preferredDiff ? (
            <div className="diff-block">
              <h3>Primerkészlet</h3>
              <p>{row.preferredDiff.typeLabel}</p>
              <p><strong>Csak legacy primer:</strong> {(row.preferredDiff.onlyLegacy ?? []).join(", ") || "—"}</p>
              <p><strong>Csak wiki primer:</strong> {(row.preferredDiff.onlyWiki ?? []).join(", ") || "—"}</p>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function LegacyRows({ rows }) {
  return (
    <div className="diff-card-list">
      {rows.map((row) => (
        <article key={row.monthDay} className="diff-card">
          <div className="diff-card-head">
            <strong>{row.dateLabel}</strong>
            <span>eltérés: {row.mismatchCount}</span>
          </div>
          {row.registryDiff ? (
            <div className="diff-block">
              <h3>Registry vs adatbázis</h3>
              <p><strong>Hiányzik:</strong> {(row.registryDiff.missing ?? []).join(", ") || "—"}</p>
              <p><strong>Találat:</strong> {(row.registryDiff.hits ?? []).join(", ") || "—"}</p>
            </div>
          ) : null}
          {row.primaryDiff ? (
            <div className="diff-block">
              <h3>Legacy primer vs rangsorolt primer</h3>
              <p><strong>Csak legacy:</strong> {(row.primaryDiff.onlyLegacyPrimary ?? []).join(", ") || "—"}</p>
              <p><strong>Csak rangsorolt:</strong> {(row.primaryDiff.onlyRankedPrimary ?? []).join(", ") || "—"}</p>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function NormalizerRows({ comparisons }) {
  return (
    <div className="page-stack">
      {(comparisons ?? []).map((comparison) => (
        <div key={comparison.id} className="page-stack">
          <MetricStrip
            items={[
              { label: `${comparison.title} – találatok`, value: comparison.summary.total ?? 0 },
            ]}
          />
          <div className="diff-card-list">
            {(comparison.rows ?? []).map((row) => (
              <article key={`${comparison.id}-${row.monthDay}`} className="diff-card">
                <div className="diff-card-head">
                  <strong>{row.dateLabel}</strong>
                  <span>eltérés: {row.mismatchCount}</span>
                </div>
                {row.nameDiff ? (
                  <div className="diff-block">
                    <h3>Névkészlet</h3>
                    <p><strong>Csak normalizált:</strong> {(row.nameDiff.onlyLeft ?? []).join(", ") || "—"}</p>
                    <p><strong>Csak összevetett forrás:</strong> {(row.nameDiff.onlyRight ?? []).join(", ") || "—"}</p>
                  </div>
                ) : null}
                {row.preferredDiff ? (
                  <div className="diff-block">
                    <h3>Primerkészlet</h3>
                    <p><strong>Csak normalizált primer:</strong> {(row.preferredDiff.onlyLeft ?? []).join(", ") || "—"}</p>
                    <p><strong>Csak összevetett primer:</strong> {(row.preferredDiff.onlyRight ?? []).join(", ") || "—"}</p>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </div>
      ))}
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
      {data ? (
        auditId === "wiki-vs-legacy" ? (
          data.month.rows.length > 0 ? <WikiRows rows={data.month.rows} /> : <EmptyState title="Ebben a hónapban nincs találat." />
        ) : auditId === "legacy-primer" ? (
          data.month.rows.length > 0 ? <LegacyRows rows={data.month.rows} /> : <EmptyState title="Ebben a hónapban nincs találat." />
        ) : auditId === "primer-normalizalo" ? (
          (data.comparisons ?? []).some((comparison) => (comparison.rows ?? []).length > 0) ? (
            <NormalizerRows comparisons={data.comparisons} />
          ) : (
            <EmptyState title="Ebben a hónapban nincs találat." />
          )
        ) : null
      ) : null}
    </>
  );
}

function AuditMonthSection({ auditId, monthSummary, query, request, refreshToken }) {
  const defaultOpen = defaultMonthOpen(monthSummary, { query });

  return (
    <MonthAccordion group={monthSummary} defaultOpen={defaultOpen} keepMountedAfterOpen={true}>
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

function AuditDetail({ detail, request, query, refreshToken, onSaved }) {
  if (!detail) {
    return <EmptyState title="Válassz auditot." detail="A bal oldali katalógusból nyiss meg egy auditot a részletekhez." />;
  }

  if (detail.kind === "official") {
    return <OfficialAuditInspector detail={detail} request={request} onSaved={onSaved} />;
  }

  if (detail.kind === "wiki-vs-legacy") {
    return (
      <div className="page-stack">
        <MetricStrip
          items={[
            { label: "Legacy napok", value: detail.summary.legacyDayCount ?? 0 },
            { label: "Wiki napok", value: detail.summary.wikiDayCount ?? 0 },
            { label: "Néveltéréses napok", value: detail.summary.disjointNameMatchDayCount ?? 0 },
            { label: "Primereltéréses napok", value: detail.summary.disjointPreferredMatchDayCount ?? 0 },
          ]}
        />
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
    );
  }

  if (detail.kind === "legacy-primer") {
    return (
      <div className="page-stack">
        <MetricStrip
          items={[
            { label: "Registry részleges napok", value: detail.registrySummary.partialCount ?? 0 },
            { label: "Registry hiányzó nevek", value: detail.registrySummary.registryMissingNameCount ?? 0 },
            { label: "Primer mismatch napok", value: detail.primarySummary.disjointDayCount ?? 0 },
            { label: "Rangsorolt only napok", value: detail.primarySummary.rankedOnlyDayCount ?? 0 },
          ]}
        />
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
    );
  }

  if (detail.kind === "primer-normalizalo") {
    return (
      <div className="page-stack">
        <MetricStrip
          items={[
            { label: "Közvetlenül legacyből", value: detail.normalizer.summary?.directFromLegacy ?? 0 },
            { label: "Közvetlenül adatbázisból", value: detail.normalizer.summary?.directFromDatabase ?? 0 },
            { label: "Kézi felülvizsgálat", value: detail.normalizer.summary?.manualConflictReview ?? 0 },
            { label: "Feloldatlan", value: detail.normalizer.summary?.unresolved ?? 0 },
          ]}
        />
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
    );
  }

  return <EmptyState title="Az audit részletnézete még nem elérhető." />;
}

export function AuditsPage({ request }) {
  const [selectedAuditId, setSelectedAuditId] = useState("hivatalos-nevjegyzek");
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

  return (
    <div className="page-stack">
      <PageSection title="Auditok" subtitle="Auditkatalógus, részletes inspectorok és ahol lehet, közvetlen forrásszerkesztés.">
        <Toolbar>
          <SearchInput value={query} onChange={setQuery} placeholder="Keresés az audit-részletekben" />
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
              onRerun={async (auditId) => {
                await request("audits:run", { auditId });
                setRefreshToken((value) => value + 1);
              }}
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
                  <StatusBadge tone="neutral">Utolsó futás: {detailQuery.data.generatedAt ?? "még nincs"}</StatusBadge>
                  <ActionButton
                    label="Audit újrafuttatása"
                    onClick={async () => {
                      await request("audits:run", { auditId: selectedAuditId });
                      setRefreshToken((value) => value + 1);
                    }}
                  />
                </Toolbar>
              }
            >
              <AuditDetail
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
