(function exposeImportUtils(root, factory) {
  const api = factory();

  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }

  root.NtuPriorityImportUtils = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function createImportUtils() {
  "use strict";

  const MIN_RANK = 1;
  const MAX_RANK = 99;

  function normalizeSerial(value) {
    const match = String(value || "").trim().match(/^\d{5}$/);
    return match ? match[0] : null;
  }

  function serialFromCourseKey(courseKey) {
    const value = String(courseKey || "").trim();
    const pathMatch = value.match(/\/courses\/[^/]+\/(\d{5})(?:[/?#]|$)/);
    if (pathMatch) {
      return pathMatch[1];
    }

    const fallbackMatch = value.match(/(?:^|:)(\d{5})$/);
    return fallbackMatch ? fallbackMatch[1] : null;
  }

  function uniqueSerials(values) {
    const seen = new Set();
    const serials = [];

    (Array.isArray(values) ? values : []).forEach((value) => {
      const serial = normalizeSerial(value);
      if (serial && !seen.has(serial)) {
        seen.add(serial);
        serials.push(serial);
      }
    });

    return serials;
  }

  function normalizeCourses(courses) {
    const normalized = new Map();
    (Array.isArray(courses) ? courses : []).forEach((course) => {
      const serial = normalizeSerial(course?.serial);
      if (serial && !normalized.has(serial)) {
        normalized.set(serial, { ...course, serial });
      }
    });
    return normalized;
  }

  function buildImportPlan({
    sourceSerials,
    availableCourses,
    unavailableCourses,
    registeredCourses,
    useOddRanks = false
  }) {
    const source = uniqueSerials(sourceSerials);
    const available = normalizeCourses(availableCourses);
    const unavailableBySerial = normalizeCourses(unavailableCourses);
    const registered = normalizeCourses(registeredCourses);
    const missing = source.filter((serial) =>
      !registered.has(serial) && !available.has(serial) && !unavailableBySerial.has(serial)
    );
    const unavailable = source
      .filter((serial) => !registered.has(serial) && !available.has(serial) && unavailableBySerial.has(serial))
      .map((serial) => unavailableBySerial.get(serial));
    const additions = source.filter((serial) => !registered.has(serial) && available.has(serial));
    const ignoredRegistered = [...registered.values()];
    const reservedRanks = new Set(
      ignoredRegistered
        .map((course) => Number(course.rank))
        .filter((rank) => Number.isInteger(rank) && rank >= MIN_RANK && rank <= MAX_RANK)
    );
    const desiredRanks = [];

    const rankStep = useOddRanks ? 2 : 1;
    for (let rank = MIN_RANK; rank <= MAX_RANK && desiredRanks.length < additions.length; rank += rankStep) {
      if (!reservedRanks.has(rank)) {
        desiredRanks.push(rank);
      }
    }

    if (desiredRanks.length < additions.length) {
      return {
        ok: false,
        error: useOddRanks
          ? "可用的奇數志願序不足，請取消奇數模式後再預覽。"
          : "可用志願序不足，無法在完全不調整已登記課程的情況下匯入。",
        source,
        missing,
        unavailable,
        ignoredRegistered
      };
    }

    const desiredBySerial = new Map(additions.map((serial, index) => [serial, desiredRanks[index]]));
    const operations = additions.map((serial) => ({
      type: "add",
      serial,
      toRank: desiredBySerial.get(serial)
    }));
    const courses = additions.map((serial) => ({
      serial,
      name: available.get(serial)?.name || serial,
      currentRank: null,
      desiredRank: desiredBySerial.get(serial),
      action: "add"
    }));
    const previewCourses = source.flatMap((serial) => {
      const addition = courses.find((course) => course.serial === serial);
      if (addition) {
        return [addition];
      }

      const blocked = unavailableBySerial.get(serial);
      return blocked && !registered.has(serial) ? [{
        serial,
        name: blocked.name || serial,
        currentRank: null,
        desiredRank: null,
        action: "unavailable",
        reason: blocked.reason || "目前無法登記"
      }] : [];
    });

    return {
      ok: true,
      source,
      useOddRanks,
      missing,
      unavailable,
      ignoredRegistered,
      courses,
      previewCourses,
      operations,
      mutationCount: operations.length
    };
  }

  async function executeAddOperations(operations, addCourse, onProgress = () => {}) {
    const successes = [];
    const failures = [];
    const queue = Array.isArray(operations) ? operations : [];

    for (let index = 0; index < queue.length; index += 1) {
      const operation = queue[index];
      onProgress(operation, index, queue.length);
      const result = await addCourse(operation);
      if (result?.ok) {
        successes.push({ operation, result });
      } else {
        failures.push({
          operation,
          result: result || { ok: false, reason: "選課系統未回傳失敗原因。" }
        });
      }
    }

    return { successes, failures };
  }

  return {
    buildImportPlan,
    executeAddOperations,
    normalizeSerial,
    serialFromCourseKey,
    uniqueSerials
  };
});
