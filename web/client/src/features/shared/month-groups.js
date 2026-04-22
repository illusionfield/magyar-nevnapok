export function defaultMonthOpen(group, options = {}) {
  if (!group) {
    return false;
  }

  if (options.forceOpenAll === true) {
    return true;
  }

  if (group.hasDirty === true) {
    return true;
  }

  if (
    options.openOnSummarySignals === true &&
    (group.summary?.missing > 0 ||
      group.summary?.local > 0 ||
      group.summary?.overrides > 0 ||
      group.summary?.mismatches > 0)
  ) {
    return true;
  }

  if (options.query && group.matchCount > 0) {
    return true;
  }

  return false;
}

export function withMonthMatches(groups = [], predicate = () => false) {
  return (Array.isArray(groups) ? groups : []).map((group) => {
    const matchCount = (Array.isArray(group.items) ? group.items : group.rows ?? []).filter(predicate).length;

    return {
      ...group,
      matchCount,
    };
  });
}
