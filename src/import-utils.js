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

  function remainingSeats(limit, selected) {
    if (limit === null || limit === undefined || limit === ""
      || selected === null || selected === undefined || selected === "") {
      return null;
    }
    const normalizedLimit = Number(limit);
    const normalizedSelected = Number(selected);
    if (!Number.isFinite(normalizedLimit) || !Number.isFinite(normalizedSelected)) {
      return null;
    }
    return Math.max(Math.trunc(normalizedLimit) - Math.trunc(normalizedSelected), 0);
  }

  function secondStageSelectionStatus(priorityText, hasPriorityAction = false) {
    const normalizedPriority = String(priorityText || "").trim();
    return hasPriorityAction || /\d/.test(normalizedPriority)
      ? "registered"
      : "selected";
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

  function parseMeetingSlots(value) {
    const text = String(value || "").replace(/[，、,]/g, " ");
    const slots = [];
    const seen = new Set();
    const tokenPattern = /([一二三四五六日天])?\s*([0-9XABCD])/gi;
    let currentDay = null;
    let match;

    while ((match = tokenPattern.exec(text))) {
      if (match[1]) {
        currentDay = match[1] === "天" ? "日" : match[1];
      }
      if (!currentDay) {
        continue;
      }

      const slot = `${currentDay}${match[2].toUpperCase()}`;
      if (!seen.has(slot)) {
        seen.add(slot);
        slots.push(slot);
      }
    }

    return slots;
  }

  function meetingSlots(course) {
    const supplied = Array.isArray(course?.slots) ? course.slots : parseMeetingSlots(course?.schedule);
    return new Set(supplied.map((slot) => String(slot).trim()).filter(Boolean));
  }

  function findScheduleConflicts(course, selectedCourses) {
    const candidateSlots = meetingSlots(course);
    if (!candidateSlots.size) {
      return [];
    }

    return (Array.isArray(selectedCourses) ? selectedCourses : []).flatMap((selected) => {
      if (normalizeSerial(selected?.serial) === normalizeSerial(course?.serial)) {
        return [];
      }
      const overlappingSlots = [...meetingSlots(selected)].filter((slot) => candidateSlots.has(slot));
      return overlappingSlots.length ? [{ ...selected, overlappingSlots }] : [];
    });
  }

  function buildSecondStagePlan({ sourceSerials, candidateCourses, selectedCourses }) {
    const source = uniqueSerials(sourceSerials);
    const candidates = normalizeCourses(candidateCourses);
    const selected = normalizeCourses(selectedCourses);
    const confirmedSelected = [...selected.values()]
      .filter((course) => course.selectionStatus !== "registered");
    const missing = source.filter((serial) => !candidates.has(serial) && !selected.has(serial));
    const ignoredSelected = source
      .filter((serial) => selected.has(serial))
      .map((serial) => ({ ...candidates.get(serial), ...selected.get(serial) }));
    const unavailable = source
      .filter((serial) => candidates.has(serial) && !candidates.get(serial)?.actionUrl && !selected.has(serial))
      .map((serial) => candidates.get(serial));
    const additions = source
      .filter((serial) => candidates.get(serial)?.actionUrl && !selected.has(serial))
      .map((serial) => {
        const course = candidates.get(serial);
        return {
          ...course,
          conflicts: findScheduleConflicts(course, confirmedSelected)
        };
      });
    const operations = additions.map((course) => ({
      type: "add",
      serial: course.serial,
      actionUrl: course.actionUrl,
      priority: source.indexOf(course.serial) + 1
    }));

    return {
      ok: true,
      source,
      missing,
      ignoredSelected,
      unavailable,
      additions,
      selectedCourses: [...selected.values()],
      operations,
      conflictCount: additions.filter((course) => course.conflicts.length).length,
      mutationCount: operations.length
    };
  }

  function buildSecondStageAddOperations(plan, selectedDropSerials = []) {
    const source = uniqueSerials(plan?.source);
    const additions = new Map((Array.isArray(plan?.operations) ? plan.operations : [])
      .map((operation) => [normalizeSerial(operation?.serial), operation])
      .filter(([serial]) => serial));
    const additionCourses = normalizeCourses(plan?.additions);
    const selectedSource = normalizeCourses(plan?.ignoredSelected);
    const readds = new Set(uniqueSerials(selectedDropSerials));

    return source.flatMap((serial) => {
      if (additions.has(serial)) {
        const conflicts = Array.isArray(additionCourses.get(serial)?.conflicts)
          ? additionCourses.get(serial).conflicts
          : [];
        const everyConflictDropped = conflicts.every((conflict) =>
          readds.has(normalizeSerial(conflict?.serial))
        );
        if (!everyConflictDropped) {
          return [];
        }
        return [{ ...additions.get(serial) }];
      }
      if (readds.has(serial) && selectedSource.has(serial)) {
        return [{
          type: "add",
          serial,
          actionUrl: null,
          priority: source.indexOf(serial) + 1,
          readd: true
        }];
      }
      return [];
    });
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
    buildSecondStageAddOperations,
    buildSecondStagePlan,
    executeAddOperations,
    findScheduleConflicts,
    normalizeSerial,
    parseMeetingSlots,
    remainingSeats,
    secondStageSelectionStatus,
    serialFromCourseKey,
    uniqueSerials
  };
});
