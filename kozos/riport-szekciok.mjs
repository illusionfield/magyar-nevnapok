function normalizeRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    id: row?.id ?? `${index + 1}`,
    ...row,
  }));
}

function normalizeColumns(columns = []) {
  return (Array.isArray(columns) ? columns : []).map((column, index) => ({
    key: column?.key ?? `c${index + 1}`,
    label: column?.label ?? column?.title ?? `Oszlop ${index + 1}`,
    align: column?.align ?? "left",
    emphasis: column?.emphasis ?? false,
  }));
}

function normalizeItems(items = []) {
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: item?.id ?? `${index + 1}`,
    value: item?.value ?? item?.label ?? item ?? "—",
    tone: item?.tone ?? "neutral",
    meta: item?.meta ?? null,
  }));
}

export function createKeyValueSection({
  id,
  title,
  description = null,
  rows = [],
  tone = "neutral",
} = {}) {
  return {
    id,
    kind: "keyValue",
    title,
    description,
    tone,
    rows: normalizeRows(rows).map((row) => ({
      id: row.id,
      label: row.label ?? row.key ?? "—",
      value: row.value ?? "—",
      tone: row.tone ?? "neutral",
      meta: row.meta ?? null,
    })),
  };
}

export function createTableSection({
  id,
  title,
  description = null,
  columns = [],
  rows = [],
  tone = "neutral",
  emptyMessage = "Nincs megjeleníthető adat.",
} = {}) {
  return {
    id,
    kind: "table",
    title,
    description,
    tone,
    emptyMessage,
    columns: normalizeColumns(columns),
    rows: normalizeRows(rows),
  };
}

export function createGridSection({
  id,
  title,
  description = null,
  items = [],
  tone = "neutral",
  emptyMessage = "Nincs megjeleníthető elem.",
} = {}) {
  return {
    id,
    kind: "grid",
    title,
    description,
    tone,
    emptyMessage,
    items: normalizeItems(items),
  };
}

export function createTextSection({
  id,
  title,
  description = null,
  body = "",
  tone = "neutral",
} = {}) {
  return {
    id,
    kind: "text",
    title,
    description,
    tone,
    body: String(body ?? "").trim(),
  };
}

export function createListSection({
  id,
  title,
  description = null,
  items = [],
  tone = "neutral",
  emptyMessage = "Nincs megjeleníthető elem.",
} = {}) {
  return {
    id,
    kind: "list",
    title,
    description,
    tone,
    emptyMessage,
    items: normalizeRows(items).map((item) => ({
      id: item.id,
      title: item.title ?? item.label ?? item.value ?? "—",
      detail: item.detail ?? null,
      meta: item.meta ?? null,
      tone: item.tone ?? "neutral",
    })),
  };
}
