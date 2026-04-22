import { AuditsPage } from "./features/audits-page.jsx";
import { DashboardPage } from "./features/dashboard-page.jsx";
import { IcsPage } from "./features/ics-page.jsx";
import { PipelinePage } from "./features/pipeline-page.jsx";
import { PrimerAuditPage } from "./features/primer-audit-page.jsx";
import { useRoute } from "./hooks.js";
import { AppLink } from "./ui.jsx";
import { useWsBridge } from "./ws.js";

const ROUTES = [
  { path: "/", label: "Dashboard" },
  { path: "/pipeline", label: "Pipeline" },
  { path: "/auditok", label: "Auditok" },
  { path: "/primer-audit", label: "Primer audit" },
  { path: "/ics", label: "ICS generálás" },
];

function PageSwitch({ pathname, request, connected, jobState, lastSocketError }) {
  if (pathname === "/pipeline") {
    return <PipelinePage request={request} />;
  }

  if (pathname === "/auditok") {
    return <AuditsPage request={request} />;
  }

  if (pathname === "/primer-audit") {
    return <PrimerAuditPage request={request} />;
  }

  if (pathname === "/ics") {
    return <IcsPage request={request} />;
  }

  return <DashboardPage request={request} connected={connected} jobState={jobState} lastSocketError={lastSocketError} />;
}

export function App() {
  const pathname = useRoute();
  const { connected, jobState, lastError, request } = useWsBridge();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Magyar névnapok</p>
          <h1>Web GUI v2</h1>
          <p className="header-copy">
            Magyar, websocketes, szerkesztő-központú kezelőfelület a pipeline-hoz, az auditokhoz,
            a primer döntésekhez és az ICS generáláshoz.
          </p>
        </div>
        <nav className="main-nav">
          {ROUTES.map((route) => (
            <AppLink key={route.path} to={route.path}>
              {route.label}
            </AppLink>
          ))}
        </nav>
      </header>

      <main className="app-content">
        <PageSwitch
          pathname={pathname}
          request={request}
          connected={connected}
          jobState={jobState}
          lastSocketError={lastError}
        />
      </main>
    </div>
  );
}
