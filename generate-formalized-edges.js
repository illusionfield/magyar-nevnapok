import fs from "node:fs/promises";
import path from "node:path";

const DEFAULT_INPUT_PATH = path.join(process.cwd(), "output", "nevnapok.json");
const DEFAULT_OUTPUT_PATH = path.join(process.cwd(), "output", "formalized-edges.json");

const args = parseArgs(process.argv.slice(2));

async function main() {
  const inputPath = path.resolve(process.cwd(), args.input ?? DEFAULT_INPUT_PATH);
  const outputPath = path.resolve(process.cwd(), args.output ?? DEFAULT_OUTPUT_PATH);

  const raw = await fs.readFile(inputPath, "utf8");
  const payload = JSON.parse(raw);
  const names = Array.isArray(payload.names) ? payload.names : [];
  const edges = buildEdges(names);
  const relationCounts = countBy(edges, (edge) => edge.relationCode ?? "unknown");

  const output = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      input: inputPath,
      sourceVersion: payload.version ?? null,
      sourceGeneratedAt: payload.generatedAt ?? null,
    },
    stats: {
      nameCount: names.length,
      formalizedNameCount: names.filter((entry) => entry.formalized && entry.formalized.steps?.length > 0)
        .length,
      edgeCount: edges.length,
      relationCounts,
    },
    edges,
  };

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(`Saved ${edges.length} edge(s) to ${outputPath}`);
}

function buildEdges(names) {
  return names.flatMap((nameEntry) => buildEdgesForName(nameEntry));
}

function buildEdgesForName(nameEntry) {
  const formalized = nameEntry?.formalized;

  if (!formalized || !Array.isArray(formalized.steps) || formalized.steps.length === 0) {
    return [];
  }

  return formalized.steps.map((step) => {
    const operation = formalized.operations?.[step.operation] ?? null;
    const fromElement = step.from != null ? formalized.elements?.[step.from] ?? null : null;
    const toElement = step.to != null ? formalized.elements?.[step.to] ?? null : null;
    const fromNames = edgeNamesForElement(fromElement, nameEntry.name);
    const toNames = edgeNamesForElement(toElement, nameEntry.name);

    return {
      id: `formalized:${nameEntry.name}:${step.index}`,
      name: nameEntry.name ?? null,
      detailUrl: nameEntry.detailUrl ?? null,
      gender: nameEntry.gender ?? null,
      days: Array.isArray(nameEntry.days) ? nameEntry.days : [],
      frequency: nameEntry.frequency ?? null,
      meta: {
        frequency: nameEntry.meta?.frequency ?? null,
      },
      relationCode: operation?.code ?? null,
      relationLabel: operation?.label ?? null,
      relationTag: operation?.normalized ?? null,
      operationIndex: step.operation,
      qualifiers: Array.isArray(operation?.qualifiers) ? operation.qualifiers : [],
      attributes: Array.isArray(operation?.attributes) ? operation.attributes : [],
      fromElementIndex: step.from,
      fromKind: fromElement?.kind ?? null,
      fromText: fromElement?.normalized ?? null,
      fromReferences: Array.isArray(fromElement?.references) ? fromElement.references : [],
      fromNames,
      toElementIndex: step.to,
      toKind: toElement?.kind ?? null,
      toText: toElement?.normalized ?? null,
      toReferences: Array.isArray(toElement?.references) ? toElement.references : [],
      toNames,
      raw: formalized.raw ?? null,
      normalized: formalized.normalized ?? null,
      uncertain: Boolean(fromElement?.uncertain || toElement?.uncertain),
      canonicalized: Boolean(operation?.canonicalized),
      searchText: buildSearchText({
        name: nameEntry.name,
        relationCode: operation?.code,
        relationLabel: operation?.label,
        fromText: fromElement?.normalized,
        toText: toElement?.normalized,
        fromNames,
        toNames,
        qualifiers: operation?.qualifiers,
        attributes: operation?.attributes,
      }),
    };
  });
}

function edgeNamesForElement(element, selfName) {
  if (!element) {
    return [];
  }

  const names = new Set();

  if (element.kind === "self") {
    if (selfName) {
      names.add(selfName);
    }
  }

  if (Array.isArray(element.references) && element.references.length > 0) {
    for (const reference of element.references) {
      names.add(reference);
    }
  }

  if (selfName && typeof element.normalized === "string" && element.normalized.includes("~")) {
    names.add(selfName);
  }

  return Array.from(names);
}

function buildSearchText(parts) {
  const values = [
    parts.name,
    parts.relationCode,
    parts.relationLabel,
    parts.fromText,
    parts.toText,
    ...(Array.isArray(parts.fromNames) ? parts.fromNames : []),
    ...(Array.isArray(parts.toNames) ? parts.toNames : []),
    ...(Array.isArray(parts.qualifiers) ? parts.qualifiers : []),
    ...(Array.isArray(parts.attributes) ? parts.attributes.flatMap((attribute) => [attribute?.key, attribute?.value]) : []),
  ];

  return values
    .filter((value) => typeof value === "string" && value.trim())
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(values, keySelector) {
  const counts = {};

  for (const value of values) {
    const key = keySelector(value);
    counts[key] = (counts[key] ?? 0) + 1;
  }

  return counts;
}

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--input" && argv[index + 1]) {
      options.input = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--input=")) {
      options.input = arg.slice("--input=".length);
      continue;
    }

    if (arg === "--output" && argv[index + 1]) {
      options.output = argv[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      options.output = arg.slice("--output=".length);
    }
  }

  return options;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
