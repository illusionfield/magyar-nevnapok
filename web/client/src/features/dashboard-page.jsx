import { AppLink, EmptyState, ErrorLabel, LoadingLabel, MetricStrip, PageSection, StatusBadge } from "../ui.jsx";
import { useWsQuery } from "../hooks.js";

function DashboardPanel({ title, link, metrics = [], children }) {
  return (
    <section className="dashboard-card">
      <div className="dashboard-card-head">
        <div>
          <h3>{title}</h3>
          {link ? (
            <AppLink to={link} className="inline-nav-link">
              Megnyitás
            </AppLink>
          ) : null}
        </div>
      </div>
      {metrics.length > 0 ? <MetricStrip items={metrics} /> : null}
      {children}
    </section>
  );
}

function PrimerQueueList({ items = [] }) {
  if (items.length === 0) {
    return <p className="muted-text">Jelenleg nincs kiemelt primer queue.</p>;
  }

  return (
    <ul className="plain-list compact-list">
      {items.map((item) => (
        <li key={item.id} className="dashboard-list-row">
          <div>
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </div>
          <span className="muted-text">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

function PrimerTodoList({ items = [] }) {
  if (items.length === 0) {
    return <EmptyState title="Nincs nyitott primer teendő." detail="A legfontosabb napok jelenleg rendezettek." />;
  }

  return (
    <ul className="plain-list compact-list">
      {items.map((item) => (
        <li key={item.id} className="dashboard-list-row">
          <div>
            <strong>{item.title}</strong>
            <span>{item.detail}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function PrimerMonthGrid({ months = [] }) {
  if (months.length === 0) {
    return <EmptyState title="Még nincs havi primer összkép." />;
  }

  return (
    <div className="month-status-grid">
      {months.map((month) => (
        <article key={month.month} className="month-status-card">
          <div className="month-status-head">
            <strong>{month.monthName}</strong>
            <span className="muted-text">{month.total} nap</span>
          </div>
          <div className="month-status-kpis">
            <span>hiány: {month.missing}</span>
            <span>helyi: {month.local}</span>
            <span>override: {month.overrides}</span>
            <span>eltérés: {month.mismatches}</span>
          </div>
        </article>
      ))}
    </div>
  );
}

function AuditWarningList({ items = [] }) {
  if (items.length === 0) {
    return <EmptyState title="Nincs figyelmet kérő audit." detail="Az auditkatalógus jelenleg csak rendben státuszú elemeket mutat." />;
  }

  return (
    <ul className="plain-list compact-list">
      {items.map((audit) => (
        <li key={audit.id} className="dashboard-list-row">
          <div>
            <strong>{audit.title}</strong>
            <span>{audit.primaryKpi ? `${audit.primaryKpi.label}: ${audit.primaryKpi.value}` : audit.purpose}</span>
          </div>
          <StatusBadge tone={audit.blocksPrimerWork ? "danger" : "warning"}>
            {audit.blocksPrimerWork ? "blokkoló" : "figyelmet kér"}
          </StatusBadge>
        </li>
      ))}
    </ul>
  );
}

function PipelineGroupList({ groups = [] }) {
  if (groups.length === 0) {
    return <EmptyState title="Nincs pipeline összkép." />;
  }

  return (
    <ul className="plain-list compact-list">
      {groups.map((group) => (
        <li key={group.id} className="dashboard-list-row">
          <div>
            <strong>{group.label}</strong>
            <span>{group.summaryText}</span>
          </div>
          <div className="inline-badge-row">
            <StatusBadge tone={group.status === "kesz" ? "ok" : group.status === "blokkolt" ? "danger" : "warning"}>
              {group.statusLabel}
            </StatusBadge>
            <span className="muted-text">{group.attentionCount}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage({ request }) {
  const dashboardQuery = useWsQuery(() => request("dashboard:get").then((payload) => payload.dashboard), [request]);
  const dashboard = dashboardQuery.data;

  return (
    <div className="page-stack">
      <PageSection
        title="Irányítópult"
        subtitle="Primer- és auditközpontú összkép: mi igényel most figyelmet, és melyik munkatérre érdemes továbbmenni."
      >
        {dashboardQuery.loading && !dashboard ? <LoadingLabel /> : null}
        <ErrorLabel error={dashboardQuery.error} />
        {dashboard ? (
          <MetricStrip
            items={[
              { label: "Akciózható primer napok", value: dashboard.summary.actionablePrimerDayCount ?? 0 },
              { label: "Nyitott primer hiány", value: dashboard.summary.primerOpenCount ?? 0 },
              { label: "Audit blokkoló", value: dashboard.summary.auditBlockingCount ?? 0 },
              { label: "Pipeline figyelem", value: dashboard.summary.pipelineAttentionCount ?? 0 },
            ]}
          />
        ) : null}
      </PageSection>

      {dashboard ? (
        <>
          <div className="two-column-grid dashboard-main-grid">
            <DashboardPanel
              title={dashboard.sections.primerNow.title}
              link={dashboard.sections.primerNow.link}
              metrics={dashboard.sections.primerNow.metrics}
            >
              <div className="page-stack compact-stack">
                <div>
                  <h4>Queue-k</h4>
                  <PrimerQueueList items={dashboard.sections.primerNow.queues} />
                </div>
                <div>
                  <h4>Mai teendők</h4>
                  <PrimerTodoList items={dashboard.sections.primerNow.todos} />
                </div>
              </div>
            </DashboardPanel>

            <DashboardPanel
              title={dashboard.sections.pipeline.title}
              link={dashboard.sections.pipeline.link}
              metrics={dashboard.sections.pipeline.metrics}
            >
              <PipelineGroupList groups={dashboard.sections.pipeline.groups} />
            </DashboardPanel>
          </div>

          <div className="two-column-grid dashboard-main-grid">
            <DashboardPanel title={dashboard.sections.primerMonths.title} link={dashboard.sections.primerMonths.link}>
              <PrimerMonthGrid months={dashboard.sections.primerMonths.months} />
            </DashboardPanel>

            <DashboardPanel
              title={dashboard.sections.auditWarnings.title}
              link={dashboard.sections.auditWarnings.link}
              metrics={dashboard.sections.auditWarnings.metrics}
            >
              <AuditWarningList items={dashboard.sections.auditWarnings.items} />
            </DashboardPanel>
          </div>
        </>
      ) : null}
    </div>
  );
}
