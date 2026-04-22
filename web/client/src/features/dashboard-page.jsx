import { useMemo, useState } from "react";
import { ActionButton, EmptyState, ErrorLabel, JobConsole, LoadingLabel, MetricStrip, PageSection, StatusBadge, Toolbar } from "../ui.jsx";
import { useWsQuery } from "../hooks.js";

function TodoList({ items = [] }) {
  if (items.length === 0) {
    return <EmptyState title="Nincs kiemelt teendő." detail="A pipeline és a primer audit jelenleg nem jelez sürgős beavatkozást." />;
  }

  return (
    <ul className="plain-list todo-list">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`}>
          <strong>{item.title}</strong>
          <span>{item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

function HighlightList({ items = [] }) {
  if (items.length === 0) {
    return <p className="muted-text">Nincs kiemelt elem.</p>;
  }

  return (
    <ul className="plain-list compact-list">
      {items.map((item) => (
        <li key={item.id}>
          <strong>{item.title}</strong>
          <span>{item.statusLabel ?? item.purpose ?? item.detail}</span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage({ request, connected, jobState, lastSocketError }) {
  const [actionMessage, setActionMessage] = useState(null);
  const dashboardQuery = useWsQuery(() => request("dashboard:get").then((payload) => payload.dashboard), [request]);
  const dashboard = dashboardQuery.data;

  const pipelineMetrics = useMemo(() => {
    if (!dashboard?.pipelineKpi) {
      return [];
    }

    return [
      { label: "Összes lépés", value: dashboard.pipelineKpi.total ?? 0 },
      { label: "Kész", value: dashboard.pipelineKpi.kesz ?? 0 },
      { label: "Hiányzik", value: dashboard.pipelineKpi.hianyzik ?? 0 },
      { label: "Elavult", value: dashboard.pipelineKpi.elavult ?? 0 },
      { label: "Blokkolt", value: dashboard.pipelineKpi.blokkolt ?? 0 },
    ];
  }, [dashboard]);

  const auditMetrics = useMemo(() => {
    if (!dashboard?.auditKpi) {
      return [];
    }

    return [
      { label: "Figyelmeztetéses auditok", value: dashboard.auditKpi.figyelmeztetesesAuditok ?? 0 },
      { label: "Nyitott primer hiányok", value: dashboard.auditKpi.primerNyitottHianyok ?? 0 },
      { label: "Kézi override napok", value: dashboard.auditKpi.keziOverrideNapok ?? 0 },
      { label: "Helyi feloldások", value: dashboard.auditKpi.helyiFeloldasok ?? 0 },
    ];
  }, [dashboard]);

  const icsMetrics = useMemo(() => {
    if (!dashboard?.icsStatus) {
      return [];
    }

    return [
      { label: "Aktív mód", value: dashboard.icsStatus.modeLabel ?? "—" },
      { label: "Kimenetek", value: (dashboard.icsStatus.outputs ?? []).join(", ") || "—" },
      { label: "Naptárnevek", value: (dashboard.icsStatus.names ?? []).join(", ") || "—" },
    ];
  }, [dashboard]);

  return (
    <div className="page-stack">
      <PageSection
        title="Kapcsolat és állapot"
        subtitle="A websocket kapcsolat, az aktív módosító művelet és a futási napló egy helyen."
        actions={
          <Toolbar>
            <StatusBadge tone={connected ? "ok" : "danger"}>{connected ? "Websocket rendben" : "Websocket nincs kapcsolatban"}</StatusBadge>
            {lastSocketError ? <span className="inline-error">{lastSocketError}</span> : null}
          </Toolbar>
        }
      >
        <JobConsole connected={connected} jobState={jobState} />
      </PageSection>

      <div className="two-column-grid">
        <PageSection title="Pipeline KPI" subtitle="A teljes feldolgozási lánc aktuális állapota.">
          {dashboardQuery.loading && !dashboard ? <LoadingLabel /> : null}
          <ErrorLabel error={dashboardQuery.error} />
          {dashboard ? <MetricStrip items={pipelineMetrics} /> : null}
          {dashboard ? <HighlightList items={dashboard.highlights?.pipeline ?? []} /> : null}
        </PageSection>

        <PageSection title="Audit KPI" subtitle="A kézi felülírást vagy figyelmet igénylő auditállapotok.">
          {dashboard ? <MetricStrip items={auditMetrics} /> : null}
          {dashboard ? <HighlightList items={dashboard.highlights?.audits ?? []} /> : null}
        </PageSection>
      </div>

      <div className="two-column-grid">
        <PageSection title="ICS állapot" subtitle="A jelenlegi generálási profil összképe.">
          {dashboard ? <MetricStrip items={icsMetrics} /> : null}
        </PageSection>

        <PageSection title="Teendők most" subtitle="A pipeline és a primer audit legsürgősebb elemei.">
          {dashboard ? <TodoList items={dashboard.todos ?? []} /> : null}
        </PageSection>
      </div>

      <PageSection title="Gyors műveletek" subtitle="A leggyakoribb futtatások és ellenőrzések közvetlenül a nyitóképernyőről.">
        <Toolbar>
          <ActionButton
            label="Teljes pipeline futtatása"
            onClick={async () => {
              setActionMessage(null);
              await request("pipeline:run", { target: "teljes", force: false });
              setActionMessage("A teljes pipeline lefutott, a dashboard frissült.");
              dashboardQuery.refresh();
            }}
          />
          <ActionButton
            label="Primer audit újrafuttatása"
            onClick={async () => {
              setActionMessage(null);
              await request("audits:run", { auditId: "primer-audit" });
              setActionMessage("A primer audit újraszámolása befejeződött.");
              dashboardQuery.refresh();
            }}
          />
          <ActionButton
            label="ICS előnézet frissítése"
            onClick={async () => {
              setActionMessage(null);
              await request("ics:preview", {});
              setActionMessage("Az aktuális ICS előnézet elkészült. A részletek az ICS generálás oldalon látszanak.");
            }}
          />
          <ActionButton
            label="ICS generálás"
            tone="primary"
            onClick={async () => {
              setActionMessage(null);
              await request("ics:generate", {});
              setActionMessage("Az ICS generálás sikeresen lefutott.");
              dashboardQuery.refresh();
            }}
          />
        </Toolbar>
        {actionMessage ? <p className="success-text">{actionMessage}</p> : null}
      </PageSection>
    </div>
  );
}
