import test from "node:test";
import assert from "node:assert/strict";

import {
  createGridSection,
  createKeyValueSection,
  createListSection,
  createTableSection,
  createTextSection,
} from "../kozos/riport-szekciok.mjs";

test("a strukturált riportszekció helper egységes alakra normalizálja a mezőket", () => {
  const keyValue = createKeyValueSection({
    id: "summary",
    title: "Összkép",
    rows: [{ label: "Napok", value: 12 }],
  });
  const table = createTableSection({
    id: "rows",
    title: "Táblázat",
    columns: [{ key: "name", label: "Név" }],
    rows: [{ name: "Ábel" }],
  });
  const grid = createGridSection({
    id: "grid",
    title: "Rács",
    items: [{ value: "Friss", meta: "Állapot" }],
  });
  const text = createTextSection({
    id: "note",
    title: "Megjegyzés",
    body: "Rövid próza.",
  });
  const list = createListSection({
    id: "items",
    title: "Lista",
    items: [{ title: "Elem", detail: "Részlet" }],
  });

  assert.equal(keyValue.kind, "keyValue");
  assert.equal(keyValue.rows[0].value, 12);
  assert.equal(table.kind, "table");
  assert.equal(table.columns[0].key, "name");
  assert.equal(table.rows[0].id, "1");
  assert.equal(grid.kind, "grid");
  assert.equal(grid.items[0].meta, "Állapot");
  assert.equal(text.kind, "text");
  assert.equal(text.body, "Rövid próza.");
  assert.equal(list.kind, "list");
  assert.equal(list.items[0].detail, "Részlet");
});
