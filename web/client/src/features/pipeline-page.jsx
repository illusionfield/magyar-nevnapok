import { ActionButton, ErrorLabel, LoadingLabel, MetricStrip, PageSection, StatusBadge, Toolbar } from "../ui.jsx";
import { useWsQuery } from "../hooks.js";

function StepPanel({ step, onRun, onRerun }) {
  return (
    <details className="step-accordion" open={step.status !== "kesz"}>
      <summary>
        <div className="step-summary">
          <div>
            <strong>{step.title}</strong>
            <span>{step.description}</span>
          </div>
          <div className="step-summary-meta">
            <StatusBadge tone={step.tone}>{step.statusLabel}</StatusBadge>
            <span>{step.lastStatus ?? "még nem futott"}</span>
          </div>
        </div>
      </summary>
      <div className="step-body">
        <div className="step-grid">
          <div>
            <h3>Függőségek</h3>
            <p>{step.dependsOn.length > 0 ? step.dependsOn.join(", ") : "Nincs közvetlen függőség."}</p>
          </div>
          <div>
            <h3>Bemenetek</h3>
            <p>{step.inputsSummary}</p>
          </div>
          <div>
            <h3>Kimenetek</h3>
            <p>{step.outputsSummary}</p>
          </div>
          <div>
            <h3>Utolsó futás</h3>
            <p>{step.lastRun ?? "—"}</p>
          </div>
        </div>
        {step.warning ? <p className="warning-text">{step.warning}</p> : null}
        <Toolbar>
          <ActionButton label="Lépés futtatása" onClick={() => onRun(step.id, false)} />
          <ActionButton label="Lépés újrafuttatása" onClick={() => onRerun(step.id, true)} />
        </Toolbar>
      </div>
    </details>
  );
}

export function PipelinePage({ request }) {
  const pipelineQuery = useWsQuery(() => request("pipeline:get").then((payload) => payload.pipeline), [request]);
  const pipeline = pipelineQuery.data;

  return (
    <div className="page-stack">
      <PageSection
        title="Pipeline"
        subtitle="Minden lépés külön kibontva látható, a kapcsolódó leírással, állapottal és azonnali akciókkal."
        actions={
          <Toolbar>
            <ActionButton
              label="Teljes pipeline futtatása"
              onClick={async () => {
                await request("pipeline:run", { target: "teljes", force: false });
                pipelineQuery.refresh();
              }}
            />
            <ActionButton
              label="Teljes pipeline újrafuttatása"
              onClick={async () => {
                await request("pipeline:run", { target: "teljes", force: true });
                pipelineQuery.refresh();
              }}
            />
          </Toolbar>
        }
      >
        {pipelineQuery.loading && !pipeline ? <LoadingLabel /> : null}
        <ErrorLabel error={pipelineQuery.error} />
        {pipeline ? (
          <MetricStrip
            items={[
              { label: "Összes lépés", value: pipeline.summary.total ?? 0 },
              { label: "Kész", value: pipeline.summary.kesz ?? 0 },
              { label: "Hiányzik", value: pipeline.summary.hianyzik ?? 0 },
              { label: "Elavult", value: pipeline.summary.elavult ?? 0 },
              { label: "Blokkolt", value: pipeline.summary.blokkolt ?? 0 },
            ]}
          />
        ) : null}
      </PageSection>

      {pipeline?.steps?.map((step) => (
        <StepPanel
          key={step.id}
          step={step}
          onRun={async (target, force) => {
            await request("pipeline:run", { target, force });
            pipelineQuery.refresh();
          }}
          onRerun={async (target, force) => {
            await request("pipeline:run", { target, force });
            pipelineQuery.refresh();
          }}
        />
      ))}
    </div>
  );
}
