const USE_COLOR = !("NO_COLOR" in process.env);
const ANSI_MINTA = /\u001b\[[0-9;]*m/g;
const ANSI = {
  reset: "\u001b[0m",
  bold: "\u001b[1m",
  dim: "\u001b[2m",
  red: "\u001b[31m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  blue: "\u001b[34m",
  magenta: "\u001b[35m",
  cyan: "\u001b[36m",
  gray: "\u001b[90m",
};

/**
 * A `printKeyValueTable` kétoszlopos mutató-érték táblát ír a terminálra.
 */
export function printKeyValueTable(title, entries, options = {}) {
  const rows = entries.map(([label, value]) => ({
    label,
    value: stringifyValue(value),
  }));

  printDataTable(
    title,
    [
      {
        key: "label",
        title: options.keyLabel ?? "Mutató",
        width: options.keyWidth ?? 34,
      },
      {
        key: "value",
        title: options.valueLabel ?? "Érték",
        width: options.valueWidth ?? 72,
      },
    ],
    rows,
    options
  );
}

/**
 * A `printDataTable` általános szöveges táblát rajzol a terminálra.
 */
export function printDataTable(title, columns, rows, options = {}) {
  console.log("");
  console.log(styleText(title, options.titleStyle ?? ["bold"]));

  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(options.emptyMessage ?? "(nincs adat)");
    return;
  }

  console.log(renderTable(columns, rows, options));
}

/**
 * A `printValueGrid` többoszlopos névrácsot jelenít meg a terminálon.
 */
export function printValueGrid(title, values, options = {}) {
  const normalizedValues = Array.isArray(values) ? values : [];

  if (normalizedValues.length === 0) {
    printDataTable(title, [{ key: "value", title: "Név", width: options.cellWidth ?? 24 }], [], {
      emptyMessage: options.emptyMessage ?? "nincs",
    });
    return;
  }

  const columnCount = Math.max(1, options.columns ?? 3);
  const columns = Array.from({ length: columnCount }, (_, index) => ({
    key: `c${index}`,
    title: index === 0 ? "Név" : "",
    width: options.cellWidth ?? 24,
  }));
  const rows = [];

  for (let index = 0; index < normalizedValues.length; index += columnCount) {
    const row = {};

    for (let offset = 0; offset < columnCount; offset += 1) {
      row[`c${offset}`] = normalizedValues[index + offset] ?? "";
    }

    rows.push(row);
  }

  printDataTable(title, columns, rows, options);
}

/**
 * A `formatNameList` rövid, olvasható névlista-összefoglalót készít.
 */
export function formatNameList(values, options = {}) {
  const normalizedValues = Array.isArray(values)
    ? values.map((value) => String(value ?? "").trim()).filter(Boolean)
    : [];

  if (normalizedValues.length === 0) {
    return "—";
  }

  const maxItems = Math.max(1, options.maxItems ?? 4);
  const maxLength = Math.max(8, options.maxLength ?? 36);
  const visible = normalizedValues.slice(0, maxItems).join(" • ");
  const suffix =
    normalizedValues.length > maxItems ? ` … (+${normalizedValues.length - maxItems})` : "";

  return truncate(`${visible}${suffix}`, maxLength);
}

/**
 * A `formatDiffNote` rövid eltérésmagyarázatot készít a két oldal különbségeiből.
 */
export function formatDiffNote({ shared, onlyLeft, onlyRight, leftLabel, rightLabel }) {
  const parts = [];

  if (Array.isArray(shared) && shared.length > 0) {
    parts.push(`közös: ${formatNameList(shared, { maxItems: 3, maxLength: 24 })}`);
  }

  if (Array.isArray(onlyLeft) && onlyLeft.length > 0) {
    parts.push(`${leftLabel}: ${formatNameList(onlyLeft, { maxItems: 3, maxLength: 24 })}`);
  }

  if (Array.isArray(onlyRight) && onlyRight.length > 0) {
    parts.push(`${rightLabel}: ${formatNameList(onlyRight, { maxItems: 3, maxLength: 24 })}`);
  }

  return parts.length > 0 ? parts.join("; ") : "—";
}

/**
 * A `styleText` ANSI-stílusokkal formázza a terminálra írt szöveget.
 */
export function styleText(text, styles) {
  const normalizedText = String(text ?? "");

  if (!USE_COLOR) {
    return normalizedText;
  }

  const normalizedStyles = Array.isArray(styles) ? styles.filter(Boolean) : [styles].filter(Boolean);

  if (normalizedStyles.length === 0) {
    return normalizedText;
  }

  const prefix = normalizedStyles
    .map((style) => ANSI[style] ?? "")
    .filter(Boolean)
    .join("");

  if (!prefix) {
    return normalizedText;
  }

  return `${prefix}${normalizedText}${ANSI.reset}`;
}

/**
 * A `renderTable` teljes Unicode keretes szöveges táblát állít elő.
 */
function renderTable(columns, rows, options = {}) {
  const preparedColumns = columns.map((column, index) => ({
    ...column,
    key: column.key ?? String(index),
    title: String(column.title ?? ""),
    width: Math.max(column.minWidth ?? 3, column.width ?? 16),
    align: column.align ?? "left",
  }));

  const preparedRows = rows.map((row) =>
    preparedColumns.map((column, index) => {
      const rawValue = Array.isArray(row)
        ? row[index]
        : typeof column.value === "function"
          ? column.value(row)
          : row[column.key];
      const stringValue = stringifyValue(rawValue);
      return truncate(stringValue, column.width);
    })
  );

  const widths = preparedColumns.map((column, index) => {
    const headerLength = lathatoHossz(column.title);
    const contentLength = preparedRows.reduce(
      (max, row) => Math.max(max, lathatoHossz(row[index] ?? "")),
      0
    );

    return Math.max(column.width, headerLength, contentLength);
  });

  const horizontal = (left, middle, right) =>
    `${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`;
  const formatRow = (cells) =>
    `│ ${cells
      .map((cell, index) => alignCell(cell, widths[index], preparedColumns[index].align))
      .join(" │ ")} │`;

  const lines = [horizontal("┌", "┬", "┐")];
  lines.push(formatRow(preparedColumns.map((column) => column.title)));
  lines.push(horizontal("├", "┼", "┤"));

  for (const [index, row] of preparedRows.entries()) {
    const rawRow = rows[index];
    const rowStyle =
      typeof options.rowStyle === "function" ? options.rowStyle(rawRow, index) : options.rowStyle;

    lines.push(styleText(formatRow(row), rowStyle));
  }

  lines.push(horizontal("└", "┴", "┘"));

  if (options.footer) {
    lines.push(options.footer);
  }

  return lines.join("\n");
}

/**
 * Az `alignCell` a cella tartalmát a kívánt igazítással tölti ki.
 */
function alignCell(value, width, align) {
  const padding = Math.max(0, width - lathatoHossz(value));

  if (align === "right") {
    return `${" ".repeat(padding)}${value}`;
  }

  if (align === "center") {
    const left = Math.floor(padding / 2);
    const right = padding - left;
    return `${" ".repeat(left)}${value}${" ".repeat(right)}`;
  }

  return `${value}${" ".repeat(padding)}`;
}

/**
 * A `stringifyValue` emberileg olvasható sztringgé alakítja az értéket.
 */
function stringifyValue(value) {
  if (value == null) {
    return "—";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.join(", ");
  }

  return JSON.stringify(value);
}

/**
 * A `truncate` a túl hosszú szöveget a megadott szélességre rövidíti.
 */
function truncate(value, maxWidth) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();

  if (lathatoHossz(normalized) <= maxWidth) {
    return normalized;
  }

  if (maxWidth <= 1) {
    return "…";
  }

  const csupasz = csupaszitAnsi(normalized);
  return `${csupasz.slice(0, Math.max(0, maxWidth - 1))}…`;
}

/**
 * A `csupaszitAnsi` eltávolítja a terminálszínezés ANSI vezérlőkódjait.
 */
function csupaszitAnsi(value) {
  return String(value ?? "").replace(ANSI_MINTA, "");
}

/**
 * A `lathatoHossz` a ténylegesen látható karakterhosszt adja vissza ANSI nélkül.
 */
function lathatoHossz(value) {
  return csupaszitAnsi(value).length;
}
