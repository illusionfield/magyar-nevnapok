import { useEffect, useMemo, useState } from "react";
import { isIcsDraftDirty } from "./shared/ics-draft.js";
import {
  ActionButton,
  EmptyState,
  ErrorLabel,
  LoadingLabel,
  MetricStrip,
  MonthAccordion,
  PageSection,
  Toolbar,
} from "../ui.jsx";
import { useWsQuery } from "../hooks.js";

function getNestedValue(object, keyPath) {
  return String(keyPath)
    .split(".")
    .reduce((current, key) => current?.[key], object);
}

function setNestedValue(object, keyPath, value) {
  const keys = String(keyPath).split(".");
  const clone = { ...(object ?? {}) };
  let current = clone;

  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    current[key] = { ...(current[key] ?? {}) };
    current = current[key];
  }

  current[keys[keys.length - 1]] = value;
  return clone;
}

function sectionIsVisible(section, draft) {
  if (section.id === "single") {
    return draft.partitionMode === "single";
  }

  if (section.id === "split-primary" || section.id === "split-rest") {
    return draft.partitionMode === "split";
  }

  return true;
}

function FieldEditor({ field, draft, onChange }) {
  const value = getNestedValue(draft, field.key);

  return (
    <label className="field-card">
      <span className="field-label">{field.label}</span>
      {field.type === "enum" ? (
        <select value={value} onChange={(event) => onChange(field.key, event.target.value)}>
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : field.type === "boolean" ? (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(event) => onChange(field.key, event.target.checked)}
        />
      ) : (
        <input
          type={field.type === "number" ? "number" : "text"}
          min={field.min ?? undefined}
          max={field.max ?? undefined}
          step={field.step ?? undefined}
          value={value ?? ""}
          onChange={(event) => {
            const nextValue = field.type === "number" ? Number(event.target.value) : event.target.value;
            onChange(field.key, nextValue);
          }}
        />
      )}
      <span className="field-summary">Jelenlegi hatás: {field.currentSummary}</span>
      <span className="field-help">{field.description}</span>
    </label>
  );
}

function PreviewPanel({ panel, downloads }) {
  return (
    <PageSection
      title={panel.label}
      subtitle={`${panel.eventCount} esemény • ${panel.fileName}`}
      actions={
        <Toolbar>
          {(downloads ?? [])
            .filter((download) => download.fileName === panel.fileName)
            .map((download) => (
              <a key={download.token} className="download-link" href={download.url} target="_blank" rel="noreferrer">
                Letöltés
              </a>
            ))}
        </Toolbar>
      }
    >
      <div className="preview-layout">
        <div>
          <h3>Emberi előnézet</h3>
          {(panel.groupedEvents ?? []).length > 0 ? (
            panel.groupedEvents.map((group) => (
              <MonthAccordion key={`${panel.id}-${group.month}`} group={{ ...group, summary: group.summary }} defaultOpen={group.month === 1}>
                <ul className="plain-list compact-list">
                  {(group.items ?? []).map((event) => (
                    <li key={`${panel.id}-${event.startDate}-${event.summary}`}>
                      <strong>{event.dateLabel}</strong>
                      <span>{event.summary}</span>
                    </li>
                  ))}
                </ul>
              </MonthAccordion>
            ))
          ) : (
            <EmptyState title="Nincs előnézeti esemény." />
          )}
        </div>
        <div>
          <h3>Nyers ICS előnézet</h3>
          <pre className="log-console raw-preview">{panel.rawText || "Nincs nyers előnézet."}</pre>
        </div>
      </div>
    </PageSection>
  );
}

export function IcsPage({ request }) {
  const editorQuery = useWsQuery(() => request("ics:get-editor").then((payload) => payload.icsEditor), [request]);
  const editor = editorQuery.data;
  const [draft, setDraft] = useState(null);
  const [preview, setPreview] = useState(null);
  const [downloads, setDownloads] = useState([]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    setDraft(editor.savedSettings);
  }, [editor]);

  const fieldSections = useMemo(() => {
    if (!editor || !draft) {
      return [];
    }

    return (editor.sections ?? []).filter((section) => sectionIsVisible(section, draft));
  }, [draft, editor]);

  const dirty = useMemo(() => {
    if (!editor || !draft) {
      return false;
    }

    return isIcsDraftDirty(editor.savedSettings, draft);
  }, [draft, editor]);

  return (
    <div className="page-stack">
      <PageSection title="ICS generálás" subtitle="Teljes beállítófelület, nem perzisztens draft előnézet és végső letöltés egy helyen.">
        {editorQuery.loading && !editor ? <LoadingLabel /> : null}
        <ErrorLabel error={editorQuery.error} />
        {editor ? (
          <MetricStrip
            items={[
              { label: "Aktív mód", value: editor.status.modeLabel ?? "—" },
              { label: "Kimenetek", value: (editor.status.outputs ?? []).join(", ") || "—" },
              { label: "Piszkos draft", value: dirty ? "igen" : "nem" },
            ]}
          />
        ) : null}
      </PageSection>

      {draft && fieldSections.length > 0 ? (
        fieldSections.map((section) => (
          <PageSection key={section.id} title={section.title} subtitle="A mezők mind azonnali, interaktív szerkesztéssel módosíthatók.">
            <div className="settings-grid">
              {section.fields.map((field) => (
                <FieldEditor
                  key={field.key}
                  field={field}
                  draft={draft}
                  onChange={(key, value) => {
                    setDraft((current) => setNestedValue(current, key, value));
                  }}
                />
              ))}
            </div>
          </PageSection>
        ))
      ) : null}

      <PageSection title="Műveletek" subtitle="A draft állapot, a mentett állapot és az ideiglenes előnézet egymástól külön kezelt réteg.">
        <Toolbar>
          <ActionButton
            label="Változások visszaállítása"
            disabled={!dirty}
            onClick={async () => {
              setDraft(editor.savedSettings);
              setPreview(null);
              setDownloads([]);
            }}
          />
          <ActionButton
            label="Mentés"
            disabled={!dirty}
            onClick={async () => {
              await request("ics:save", { settings: draft });
              editorQuery.refresh();
            }}
          />
          <ActionButton
            label="Előnézet frissítése"
            onClick={async () => {
              const response = await request("ics:preview", { settings: draft });
              setPreview(response.icsPreview);
            }}
          />
          <ActionButton
            label="Generálás"
            tone="primary"
            onClick={async () => {
              const response = await request("ics:generate", { settings: draft });
              setPreview(response.icsPreview ?? null);
              setDownloads(response.downloads ?? []);
              editorQuery.refresh();
            }}
          />
        </Toolbar>
      </PageSection>

      {preview ? (
        <PageSection title="Előnézet" subtitle="Egyszerre látszik az emberi eseménylista és a nyers ICS tartalom is.">
          {(preview.panels ?? []).map((panel) => (
            <PreviewPanel key={panel.id} panel={panel} downloads={downloads} />
          ))}
        </PageSection>
      ) : (
        <PageSection title="Előnézet" subtitle="A nem mentett draftból is kérhetsz előnézetet, mielőtt véglegesítenéd a generálást.">
          <EmptyState title="Még nincs előnézet." detail="Használd az „Előnézet frissítése” gombot a jelenlegi draft ellenőrzéséhez." />
        </PageSection>
      )}
    </div>
  );
}
