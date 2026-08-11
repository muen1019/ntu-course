(function exposeSortUtils(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.NtuPrioritySortUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createSortUtils() {
  "use strict";

  function uniqueStrings(values) {
    const seen = new Set();
    return (Array.isArray(values) ? values : []).filter((value) => {
      if (typeof value !== "string" || value.length === 0 || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  function normalizeOrder(savedOrder, currentKeys) {
    const current = uniqueStrings(currentKeys);
    const currentSet = new Set(current);
    const remembered = uniqueStrings(savedOrder).filter((key) => currentSet.has(key));
    const rememberedSet = new Set(remembered);

    return remembered.concat(current.filter((key) => !rememberedSet.has(key)));
  }

  function moveKey(order, movingKey, targetKey, placeAfter) {
    const next = uniqueStrings(order);
    const fromIndex = next.indexOf(movingKey);
    const targetIndex = next.indexOf(targetKey);

    if (fromIndex === -1 || targetIndex === -1 || movingKey === targetKey) {
      return next;
    }

    next.splice(fromIndex, 1);
    const adjustedTargetIndex = next.indexOf(targetKey);
    next.splice(adjustedTargetIndex + (placeAfter ? 1 : 0), 0, movingKey);
    return next;
  }

  function moveByOffset(order, movingKey, offset) {
    const next = uniqueStrings(order);
    const fromIndex = next.indexOf(movingKey);

    if (fromIndex === -1 || offset === 0) {
      return next;
    }

    const toIndex = Math.max(0, Math.min(next.length - 1, fromIndex + offset));
    if (toIndex === fromIndex) {
      return next;
    }

    next.splice(fromIndex, 1);
    next.splice(toIndex, 0, movingKey);
    return next;
  }

  function storageKey(category) {
    const safeCategory = String(category || "unknown")
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unknown";
    return `ntu-priority-planner:v1:${safeCategory}`;
  }

  return {
    moveByOffset,
    moveKey,
    normalizeOrder,
    storageKey,
    uniqueStrings
  };
});
