/**
 * domainek/auditok/kozos/primer-kapcsolatok.mjs
 * Közös névkapcsolati és primerrokonsági segédek az auditok számára.
 */

import { normalizeNameForMatch } from "../../primer/alap.mjs";

/**
 * A `buildNameRecordMap` a névadatbázis névkapcsolatait gyors lookup formára alakítja.
 */
export function buildNameRecordMap(inputPayload) {
  const map = new Map();

  for (const entry of inputPayload?.names ?? []) {
    const name = String(entry?.name ?? "").trim();

    if (!name) {
      continue;
    }

    map.set(normalizeNameForMatch(name), {
      name,
      relatedNames: sanitizeLinkedNames(entry.relatedNames ?? []),
      nicknames: sanitizeLinkedNames(entry.nicknames ?? []),
    });
  }

  return map;
}

/**
 * A `buildReverseLinkMap` fordított névkapcsolati indexet készít a hasonlósági jelölésekhez.
 */
export function buildReverseLinkMap(nameRecords) {
  const reverse = new Map();

  for (const record of nameRecords.values()) {
    const allLinks = uniqueKeepOrder([...(record.relatedNames ?? []), ...(record.nicknames ?? [])]);

    for (const linkedName of allLinks) {
      const normalizedLinked = normalizeNameForMatch(linkedName);

      if (!normalizedLinked) {
        continue;
      }

      if (!reverse.has(normalizedLinked)) {
        reverse.set(normalizedLinked, new Set());
      }

      reverse.get(normalizedLinked).add(record.name);
    }
  }

  return reverse;
}

/**
 * A `gyujtKapcsolodoPrimereket` az adott rejtett névhez kapcsolódó, engedélyezett primerjelölteket gyűjti össze.
 */
export function gyujtKapcsolodoPrimereket({
  hiddenName,
  primerNevMap,
  nameRecords,
  reverseLinks,
  collator,
}) {
  const normalizedHidden = normalizeNameForMatch(hiddenName);
  const record = nameRecords.get(normalizedHidden) ?? null;
  const directLinks = uniqueKeepOrder([...(record?.relatedNames ?? []), ...(record?.nicknames ?? [])]);
  const reverseCandidates = Array.from(reverseLinks.get(normalizedHidden) ?? []);
  const candidateMap = new Map();

  for (const candidateName of directLinks) {
    const normalizedCandidate = normalizeNameForMatch(candidateName);
    const actualPrimaryName = primerNevMap.get(normalizedCandidate) ?? null;

    if (!actualPrimaryName) {
      continue;
    }

    const current = candidateMap.get(normalizedCandidate) ?? {
      primaryName: actualPrimaryName,
      reasons: new Set(),
    };

    current.reasons.add("saját rokon/becézés");
    candidateMap.set(normalizedCandidate, current);
  }

  for (const candidateName of reverseCandidates) {
    const normalizedCandidate = normalizeNameForMatch(candidateName);
    const actualPrimaryName = primerNevMap.get(normalizedCandidate) ?? null;

    if (!actualPrimaryName) {
      continue;
    }

    const current = candidateMap.get(normalizedCandidate) ?? {
      primaryName: actualPrimaryName,
      reasons: new Set(),
    };

    current.reasons.add("visszahivatkozás");
    candidateMap.set(normalizedCandidate, current);
  }

  return Array.from(candidateMap.values())
    .map((entry) => ({
      primaryName: entry.primaryName,
      relation: Array.from(entry.reasons)
        .sort((left, right) => collator.compare(left, right))
        .join(" • "),
    }))
    .sort((left, right) => collator.compare(left.primaryName, right.primaryName));
}

/**
 * A `sanitizeLinkedNames` kiszűri a zajos vagy üres névkapcsolatokat.
 */
function sanitizeLinkedNames(values) {
  return uniqueKeepOrder(
    (Array.isArray(values) ? values : []).filter((value) => /[\p{L}\p{N}]/u.test(String(value ?? "")))
  );
}

/**
 * A `uniqueKeepOrder` duplikátummentes listát ad vissza az első előfordulási sorrendben.
 */
function uniqueKeepOrder(values) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    const normalized = normalizeNameForMatch(value);

    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(String(value));
  }

  return result;
}
