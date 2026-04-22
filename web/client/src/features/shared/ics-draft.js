export function stableStringify(value) {
  return JSON.stringify(value, Object.keys(value ?? {}).sort());
}

export function isIcsDraftDirty(savedSettings, draftSettings) {
  return JSON.stringify(savedSettings) !== JSON.stringify(draftSettings);
}
