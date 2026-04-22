import { useState } from "react";
import {
  ActionButton,
  ErrorLabel,
  LoadingLabel,
  MetricStrip,
  PageSection,
  StatusBadge,
  Toolbar,
  WorkspaceJobPanel,
} from "../ui.jsx";
import { useWsQuery } from "../hooks.js";

function buildCrawlerConfirmMessage(error) {
  const steps = Array.isArray(error?.details?.steps) ? error.details.steps : [];

  if (steps.length === 0) {
    return "Ez a futás web crawleres lépést indítana. Biztosan folytatod?";
  }

  const lines = [
    "Ez a futás web crawleres lépést indítana:",
    "",
    ...steps.map((step) => {
      const reasons = Array.isArray(step.reasons) && step.reasons.length > 0 ? `\n - ${step.reasons.join("\n - ")}` : "";
      return `${step.title}${step.requestedByForce ? " (explicit újrafuttatás)" : ""}${reasons}`;
    }),
    "",
    "Folytatod a futást?",
  ];

  return lines.join("\n");
}

function StepSafety({ step }) {
  if (!step.isCrawler) {
    return null;
  }

  return (
    <div className="crawler-safety-box">
      <strong>Biztonsági guard</strong>
      <p className="muted-text">{step.safetyPolicyLabel}</p>
      <p className="muted-text">Sanity állapot: <strong>{step.sanityLabel ?? "ismeretlen"}</strong></p>
      {(step.safetyReasons ?? []).length > 0 ? (
        <ul className="plain-list compact-list">
          {step.safetyReasons.map((reason) => (
            <li key={reason} className="mini-meta">{reason}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function GroupPanel({ group, onRun }) {
  return (
    <section className="group-panel">
      <div className="group-panel-head">
        <div>
          <div className="group-panel-title-row">
            <h3>{group.label}</h3>
            <StatusBadge tone={group.tone}>{group.statusLabel}</StatusBadge>
          </div>
          <p className="section-subtitle">{group.description}</p>
          <p className="muted-text">{group.summaryText}</p>
        </div>
        <Toolbar>
          <ActionButton label="Frissítés" onClick={() => onRun(group.id, false)} />
          <ActionButton label="Újrafuttatás" onClick={() => onRun(group.id, true)} />
        </Toolbar>
      </div>

      <MetricStrip items={group.metrics ?? []} />

      <div className="group-step-list">
        {(group.steps ?? []).map((step) => (
          <details key={step.id} className="step-accordion" open={step.status !== "kesz"}>
            <summary>
              <div className="step-summary">
                <div className="step-summary-copy">
                  <strong>{step.title}</strong>
                  <span>{step.summaryText}</span>
                </div>
                <div className="step-summary-meta">
                  {step.isCrawler ? <StatusBadge tone={step.sanityState === "ok" ? "ok" : "warning"}>crawler</StatusBadge> : null}
                  <StatusBadge tone={step.tone}>{step.statusLabel}</StatusBadge>
                  <span className="step-last-run">{step.lastRun ?? "még nem futott"}</span>
                </div>
              </div>
            </summary>
            <div className="step-body">
              <StepSafety step={step} />
              <div className="step-grid admin-step-grid">
                <div>
                  <h4>Előfeltétel</h4>
                  <p>{step.dependsOn.length > 0 ? step.dependsOn.map((item) => item.label).join(", ") : "Nincs külön előfeltétel."}</p>
                </div>
                <div>
                  <h4>Bemenet</h4>
                  <p>{step.inputsSummary}</p>
                </div>
                <div>
                  <h4>Kimenet</h4>
                  <p>{step.outputsSummary}</p>
                </div>
                <div>
                  <h4>Mentett állapot</h4>
                  <p>{step.lastStatus ?? "még nincs mentett állapot"}</p>
                </div>
              </div>
              <Toolbar>
                <ActionButton label="Csak ezt frissítem" onClick={() => onRun(step.id, false)} />
                <ActionButton label="Csak ezt futtatom újra" onClick={() => onRun(step.id, true)} />
              </Toolbar>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

export function PipelinePage({ request, connected, jobState, lastSocketError }) {
  const pipelineQuery = useWsQuery(() => request("pipeline:get").then((payload) => payload.pipeline), [request]);
  const pipeline = pipelineQuery.data;
  const [actionError, setActionError] = useState(null);

  const runPipeline = async (target, force, confirmCrawlerRun = false) => {
    setActionError(null);

    try {
      await request("pipeline:run", { target, force, confirmCrawlerRun });
      pipelineQuery.refresh();
    } catch (error) {
      if (error.code === "pipeline_confirmation_required" && confirmCrawlerRun !== true) {
        const confirmed = window.confirm(buildCrawlerConfirmMessage(error));

        if (confirmed) {
          return runPipeline(target, force, true);
        }

        return;
      }

      setActionError(error.message ?? "A pipeline futtatása nem sikerült.");
    }
  };

  return (
    <div className="page-stack">
      <PageSection
        title="Pipeline"
        subtitle="A feldolgozási lánc rövid admin összképe: mi friss, mi vár frissítésre, és melyik crawleres lépés igényel külön megerősítést."
        actions={
          <Toolbar>
            <ActionButton label="Teljes frissítés" onClick={() => runPipeline("teljes", false)} />
            <ActionButton label="Teljes újrafuttatás" onClick={() => runPipeline("teljes", true)} />
          </Toolbar>
        }
      >
        <WorkspaceJobPanel
          workspace="pipeline"
          connected={connected}
          jobState={jobState}
          lastSocketError={lastSocketError}
          idleLabel="Ha innen indítasz futást, itt jelenik meg a százalékos előrehaladás és az aktuális szakasz."
        />
        {pipelineQuery.loading && !pipeline ? <LoadingLabel /> : null}
        <ErrorLabel error={pipelineQuery.error} />
        <ErrorLabel error={actionError} />
        {pipeline ? <MetricStrip items={pipeline.summary.metrics ?? []} /> : null}
      </PageSection>

      {(pipeline?.groups ?? []).map((group) => (
        <GroupPanel key={group.id} group={group} onRun={runPipeline} />
      ))}
    </div>
  );
}
