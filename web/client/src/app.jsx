import { useEffect, useMemo, useState } from "react";
import { AuditsPage } from "./features/audits-page.jsx";
import { DashboardPage } from "./features/dashboard-page.jsx";
import { IcsPage } from "./features/ics-page.jsx";
import { PipelinePage } from "./features/pipeline-page.jsx";
import { PrimerAuditPage } from "./features/primer-audit-page.jsx";
import { useRoute } from "./hooks.js";
import { AppLink, StatusBadge, Toolbar } from "./ui.jsx";
import { useWsBridge } from "./ws.js";

const ROUTES = [
  { path: "/", label: "Irányítópult" },
  { path: "/pipeline", label: "Pipeline" },
  { path: "/auditok", label: "Auditok" },
  { path: "/primer-audit", label: "Primer audit" },
  { path: "/ics", label: "ICS" },
];

const VIEW_MODE_KEY = "nevnapok:view-mode";

function getInitialViewMode() {
  const stored = window.localStorage.getItem(VIEW_MODE_KEY);
  return stored === "detailed" ? "detailed" : "compact";
}

function PageSwitch({ pathname, request, connected, jobState, lastSocketError }) {
  const sharedProps = {
    request,
    connected,
    jobState,
    lastSocketError,
  };

  if (pathname === "/pipeline") {
    return <PipelinePage {...sharedProps} />;
  }

  if (pathname === "/auditok") {
    return <AuditsPage {...sharedProps} />;
  }

  if (pathname === "/primer-audit") {
    return <PrimerAuditPage {...sharedProps} />;
  }

  if (pathname === "/ics") {
    return <IcsPage {...sharedProps} />;
  }

  return <DashboardPage {...sharedProps} />;
}

export function App() {
  const pathname = useRoute();
  const { connected, jobState, lastError, request } = useWsBridge();
  const [viewMode, setViewMode] = useState(getInitialViewMode);
  const currentRoute = useMemo(
    () => ROUTES.find((route) => route.path === pathname)?.label ?? "Irányítópult",
    [pathname]
  );

  useEffect(() => {
    window.localStorage.setItem(VIEW_MODE_KEY, viewMode);
  }, [viewMode]);

  return (
    <div className="app-shell" data-view-mode={viewMode}>
      <header className="app-topbar">
        <div>
          <p className="eyebrow">Magyar névnapok</p>
          <strong className="topbar-title">Névnap admin</strong>
        </div>
        <Toolbar className="topbar-tools">
          <StatusBadge tone={connected ? "ok" : "danger"}>
            {connected ? "Websocket rendben" : "Kapcsolat megszakadt"}
          </StatusBadge>
          <span className="muted-text">Oldal: {currentRoute}</span>
        </Toolbar>
      </header>

      <div className="app-frame">
        <aside className="app-sidebar">
          <div className="sidebar-block brand-block">
            <strong>Gyors admin nézet</strong>
            <p className="section-subtitle">
              Gyors áttekintés a primer audit teendőkhöz, az auditfigyelmekhez, a pipeline állapotához és az ICS munkatérhez.
            </p>
          </div>

          <nav className="sidebar-nav">
            {ROUTES.map((route) => (
              <AppLink key={route.path} to={route.path} className="sidebar-link">
                {route.label}
              </AppLink>
            ))}
          </nav>

          <div className="sidebar-block view-mode-block">
            <span className="field-label">Nézetmód</span>
            <div className="view-switch">
              <button
                type="button"
                className={viewMode === "compact" ? "tab-button active" : "tab-button"}
                onClick={() => {
                  setViewMode("compact");
                }}
              >
                Kompakt
              </button>
              <button
                type="button"
                className={viewMode === "detailed" ? "tab-button active" : "tab-button"}
                onClick={() => {
                  setViewMode("detailed");
                }}
              >
                Részletes
              </button>
            </div>
            <p className="muted-text">A választás megmarad a böngészőben, és minden oldalon ugyanígy érvényes.</p>
          </div>
        </aside>

        <main className="app-main">
          <PageSwitch
            pathname={pathname}
            request={request}
            connected={connected}
            jobState={jobState}
            lastSocketError={lastError}
          />
        </main>
      </div>
    </div>
  );
}
