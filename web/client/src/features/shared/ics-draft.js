export function stableStringify(value) {
  return JSON.stringify(value);
}

export function isIcsDraftDirty(savedSettings, draftSettings) {
  return stableStringify(savedSettings) !== stableStringify(draftSettings);
}

export function getNestedValue(object, keyPath) {
  return String(keyPath)
    .split(".")
    .reduce((current, key) => current?.[key], object);
}

export function setNestedValue(object, keyPath, value) {
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

export function leapProfileToFlags(leapProfile = "off") {
  return {
    aEnabled: leapProfile === "hungarian-a" || leapProfile === "hungarian-both",
    bEnabled: leapProfile === "hungarian-b" || leapProfile === "hungarian-both",
  };
}

export function flagsToLeapProfile({ aEnabled = false, bEnabled = false } = {}) {
  if (aEnabled && bEnabled) {
    return "hungarian-both";
  }

  if (aEnabled) {
    return "hungarian-a";
  }

  if (bEnabled) {
    return "hungarian-b";
  }

  return "off";
}
