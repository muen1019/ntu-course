(function initializePriorityMemory() {
  "use strict";

  const utils = globalThis.NtuPrioritySortUtils;
  const isDemo = document.documentElement.hasAttribute("data-ntu-priority-demo");
  const isPriorityList = /^\/priority\/list\/[^/]+\/?$/.test(location.pathname);

  if (!utils || (!isDemo && !isPriorityList)) {
    return;
  }

  const category = isDemo ? "demo" : location.pathname.split("/").filter(Boolean).at(-1);
  const currentStorageKey = utils.storageKey(category);
  const localCacheKey = `${currentStorageKey}:local-cache`;
  const syncReadyKey = `${currentStorageKey}:sync-ready`;
  const state = {
    applying: false,
    body: null,
    initialRestoreComplete: false,
    restoreCancelled: false,
    restorePromise: null,
    savedOrder: null,
    syncAvailable: false,
    refreshTimer: null,
    persistTimer: null,
    rowGestureActive: false,
    toastTimer: null
  };

  function callStorage(areaName, method, ...args) {
    return new Promise((resolve) => {
      const area = chrome.storage?.[areaName];
      if (!area || typeof area[method] !== "function") {
        resolve({ ok: false, value: null });
        return;
      }

      let settled = false;
      const finish = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        const error = chrome.runtime?.lastError;
        resolve({ ok: !error, value, error: error?.message || null });
      };

      try {
        area[method](...args, finish);
      } catch (error) {
        resolve({ ok: false, value: null, error: error.message });
      }
    });
  }

  async function storageGet(areaName, keys) {
    const result = await callStorage(areaName, "get", keys);
    return { ok: result.ok, values: result.value || {} };
  }

  async function storageSet(areaName, values) {
    const result = await callStorage(areaName, "set", values);
    return result.ok;
  }

  async function storageRemove(areaName, keys) {
    const result = await callStorage(areaName, "remove", keys);
    return result.ok;
  }

  function isOrderRecord(record) {
    return Boolean(record && Array.isArray(record.order) && record.order.length);
  }

  async function markSyncReady() {
    await storageSet("local", { [syncReadyKey]: true });
  }

  async function readStoredRecord() {
    const syncResult = await storageGet("sync", currentStorageKey);
    const syncRecord = syncResult.values[currentStorageKey];

    if (syncResult.ok && isOrderRecord(syncRecord)) {
      state.syncAvailable = true;
      await markSyncReady();
      return syncRecord;
    }

    const [localState, legacyState, cacheState] = await Promise.all([
      storageGet("local", syncReadyKey),
      storageGet("local", currentStorageKey),
      storageGet("local", localCacheKey)
    ]);
    const syncWasInitialized = localState.values[syncReadyKey] === true;

    if (syncResult.ok && !syncWasInitialized) {
      const legacyRecord = legacyState.values[currentStorageKey];
      const cachedRecord = cacheState.values[localCacheKey];
      const migrationRecord = isOrderRecord(legacyRecord) ? legacyRecord : cachedRecord;
      if (isOrderRecord(migrationRecord)) {
        await saveOrder(migrationRecord.order, migrationRecord);
        await storageRemove("local", currentStorageKey);
        return migrationRecord;
      }

      await markSyncReady();
      state.syncAvailable = true;
      return null;
    }

    state.syncAvailable = syncResult.ok;
    if (syncResult.ok) {
      return null;
    }

    return isOrderRecord(cacheState.values[localCacheKey])
      ? cacheState.values[localCacheKey]
      : (isOrderRecord(legacyState.values[currentStorageKey]) ? legacyState.values[currentStorageKey] : null);
  }

  function rowSelector() {
    return isDemo
      ? "tbody > tr[data-course-key]"
      : 'tbody > tr[aria-roledescription="draggable"]';
  }

  function findRows() {
    return Array.from(document.querySelectorAll(rowSelector()));
  }

  function getCourseKey(row) {
    const explicitKey = row.getAttribute("data-course-key");
    const courseHref = row.querySelector('a[href^="/courses/"]')?.getAttribute("href");
    const fallbackCode = row.cells?.[1]?.textContent?.trim();
    return explicitKey || courseHref || (fallbackCode ? `${category}:${fallbackCode}` : "");
  }

  function annotateRows() {
    findRows().forEach((row) => {
      const key = getCourseKey(row);
      if (key) {
        row.dataset.ntuPriorityKey = key;
      }
    });
  }

  function currentRows() {
    annotateRows();
    return findRows().filter((row) => row.dataset.ntuPriorityKey);
  }

  function currentOrder() {
    return currentRows().map((row) => row.dataset.ntuPriorityKey);
  }

  function orderSignature(order) {
    return (order || []).join("|");
  }

  function ensureStatus() {
    let status = document.querySelector("#ntu-priority-memory-status");
    if (status) {
      return status;
    }

    const heading = Array.from(document.querySelectorAll("main h1, main h2"))
      .find((element) => element.textContent.trim() === "志願序");
    if (!heading?.parentElement) {
      return null;
    }

    status = document.createElement("span");
    status.id = "ntu-priority-memory-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.innerHTML = '<span aria-hidden="true">✓</span><span>排序變更後將自動儲存</span>';
    heading.parentElement.appendChild(status);
    return status;
  }

  function setStatus(message, mode) {
    const status = ensureStatus();
    if (!status) {
      return;
    }
    status.dataset.state = mode;
    status.lastElementChild.textContent = message;
  }

  function showToast(message) {
    let toast = document.querySelector("#ntu-priority-toast");
    if (!toast) {
      toast = document.createElement("div");
      toast.id = "ntu-priority-toast";
      toast.setAttribute("role", "status");
      document.body.appendChild(toast);
    }

    toast.innerHTML = `<span aria-hidden="true">✓</span><span>${message}</span>`;
    toast.classList.add("is-visible");
    window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
  }

  function afterRender() {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(resolve));
    });
  }

  function setNativeInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) {
      setter.call(input, value);
    } else {
      input.value = value;
    }
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function commitNativeInputValue(input, value) {
    input.focus({ preventScroll: true });
    setNativeInputValue(input, value);
    await afterRender();
    if (state.rowGestureActive || state.restoreCancelled) {
      return false;
    }
    input.blur();
    await afterRender();
    return true;
  }

  async function waitForCoursePosition(courseKey, desiredIndex, timeoutMs = 800) {
    const deadline = performance.now() + timeoutMs;
    while (performance.now() < deadline) {
      if (state.rowGestureActive || state.restoreCancelled) {
        return false;
      }
      if (currentRows()[desiredIndex]?.dataset.ntuPriorityKey === courseKey) {
        return true;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 16));
    }
    return currentRows()[desiredIndex]?.dataset.ntuPriorityKey === courseKey;
  }

  async function saveOrder(order, existingRecord) {
    const record = existingRecord || {
      version: 1,
      category,
      order,
      savedAt: new Date().toISOString()
    };
    const [syncSaved, localSaved] = await Promise.all([
      storageSet("sync", { [currentStorageKey]: record }),
      storageSet("local", { [localCacheKey]: record })
    ]);

    if (syncSaved) {
      state.syncAvailable = true;
      await markSyncReady();
      await storageRemove("local", currentStorageKey);
    } else {
      state.syncAvailable = false;
    }

    state.savedOrder = record.order;
    return { syncSaved, localSaved };
  }

  function savedStatus() {
    return state.syncAvailable ? "本機順序已儲存並同步" : "本機順序已儲存（同步待恢復）";
  }

  async function applySavedOrder() {
    if (state.applying || state.rowGestureActive
      || state.restoreCancelled || !state.savedOrder?.length) {
      return false;
    }

    const before = currentOrder();
    if (!before.length) {
      return false;
    }
    const desired = utils.normalizeOrder(state.savedOrder, before);

    // A course that is not in the saved list is intentionally appended by
    // normalizeOrder. Save the merged order immediately so it stays last.
    if (orderSignature(desired) !== orderSignature(state.savedOrder)) {
      await saveOrder(desired);
    }

    if (state.rowGestureActive || state.restoreCancelled) {
      return false;
    }

    if (orderSignature(before) === orderSignature(desired)) {
      setStatus(savedStatus(), "saved");
      return true;
    }

    state.applying = true;
    setStatus("正在還原本機順序…", "working");

    try {
      for (let desiredIndex = 0; desiredIndex < desired.length; desiredIndex += 1) {
        if (state.rowGestureActive || state.restoreCancelled) {
          return false;
        }

        const rows = currentRows();
        if (rows[desiredIndex]?.dataset.ntuPriorityKey === desired[desiredIndex]) {
          continue;
        }

        const desiredRow = rows.find((row) => row.dataset.ntuPriorityKey === desired[desiredIndex]);
        const input = desiredRow?.cells?.[0]?.querySelector('input[type="number"]');
        if (!input) {
          setStatus("網站無法完成順序還原，請重新整理後重試", "idle");
          return false;
        }

        if (!await commitNativeInputValue(input, String(desiredIndex + 1))) {
          return false;
        }
        if (!await waitForCoursePosition(desired[desiredIndex], desiredIndex)) {
          setStatus("網站無法完成順序還原，請重新整理後重試", "idle");
          return false;
        }
      }

      if (state.rowGestureActive || state.restoreCancelled) {
        return false;
      }

      if (orderSignature(currentOrder()) !== orderSignature(desired)) {
        setStatus("網站無法完成順序還原，請重新整理後重試", "idle");
        return false;
      }

      setStatus("已還原本機順序", "saved");
      return true;
    } finally {
      state.applying = false;
    }
  }

  async function persistIfChanged() {
    if (state.applying || state.rowGestureActive) {
      return;
    }

    const order = currentOrder();
    if (!order.length) {
      return;
    }

    const normalizedSaved = utils.normalizeOrder(state.savedOrder, order);
    if (state.savedOrder?.length && orderSignature(order) === orderSignature(normalizedSaved)) {
      setStatus(savedStatus(), "saved");
      return;
    }

    const saveResult = await saveOrder(order);
    setStatus(savedStatus(), "saved");
    showToast(saveResult.syncSaved ? "已儲存並同步新的志願序" : "已儲存本機志願序，等待同步恢復");
  }

  function schedulePersist(delay = 180) {
    window.clearTimeout(state.persistTimer);
    state.persistTimer = window.setTimeout(persistIfChanged, delay);
  }

  async function saveBeforePriorityNavigation(event) {
    const anchor = event.target instanceof Element
      ? event.target.closest('a[href^="/priority/"]')
      : null;
    if (!anchor || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    const targetUrl = new URL(anchor.href, location.href);
    if (targetUrl.pathname === location.pathname) {
      return;
    }

    // NTU uses client-side navigation between list and timetable views. Waiting
    // for the storage write before a full navigation prevents a pending drag or
    // number edit from being discarded when the list component is unmounted.
    event.preventDefault();
    event.stopImmediatePropagation();
    window.clearTimeout(state.persistTimer);
    await restoreInitialOrder();
    await persistIfChanged();
    location.assign(targetUrl.href);
  }

  async function performInitialRestore() {
    state.restoreCancelled = false;
    ensureStatus();
    const rows = currentRows();
    if (!rows.length) {
      setStatus("等待課程資料載入", "working");
      return;
    }

    state.body = rows[0].parentElement;
    const stored = await readStoredRecord();
    state.savedOrder = stored?.order || null;

    if (state.savedOrder?.length && !state.rowGestureActive && !state.restoreCancelled) {
      const restored = await applySavedOrder();
      if (!restored && (state.rowGestureActive || state.restoreCancelled)) {
        setStatus("排序變更後將自動儲存", "idle");
      }
    } else {
      setStatus("排序變更後將自動儲存", "idle");
    }

    state.initialRestoreComplete = true;
    window.clearTimeout(state.refreshTimer);
    observer.disconnect();
  }

  function restoreInitialOrder() {
    if (state.initialRestoreComplete) {
      return Promise.resolve();
    }
    if (!state.restorePromise) {
      state.restorePromise = performInitialRestore()
        .finally(() => {
          state.restorePromise = null;
        });
    }
    return state.restorePromise;
  }

  function scheduleInitialRestore() {
    if (state.initialRestoreComplete) {
      return;
    }
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
      if (!state.rowGestureActive) {
        restoreInitialOrder();
      }
    }, 100);
  }

  function isPriorityRowTarget(target) {
    return target instanceof Element && Boolean(target.closest(rowSelector()));
  }

  document.addEventListener("pointerdown", (event) => {
    if (isPriorityRowTarget(event.target)) {
      window.clearTimeout(state.refreshTimer);
      window.clearTimeout(state.persistTimer);
      state.rowGestureActive = true;
      if (!state.initialRestoreComplete) {
        state.restoreCancelled = true;
      }
    }
  }, true);

  document.addEventListener("pointerup", () => {
    if (state.rowGestureActive) {
      state.rowGestureActive = false;
      schedulePersist(220);
    }
  }, true);

  document.addEventListener("pointercancel", () => {
    if (state.rowGestureActive) {
      state.rowGestureActive = false;
    }
  }, true);

  document.addEventListener("dragend", (event) => {
    if (isPriorityRowTarget(event.target)) {
      state.rowGestureActive = false;
      schedulePersist(120);
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (!state.applying && event.target.matches?.(`${rowSelector()} input[type="number"]`)) {
      schedulePersist(220);
    }
  }, true);

  document.addEventListener("keyup", (event) => {
    if (isPriorityRowTarget(event.target) && ["ArrowUp", "ArrowDown", "Home", "End", " "].includes(event.key)) {
      schedulePersist(180);
    }
  }, true);

  document.addEventListener("click", saveBeforePriorityNavigation, true);

  const observer = new MutationObserver((mutations) => {
    const tableChanged = mutations.some((mutation) =>
      mutation.type === "childList"
      && (mutation.target.matches?.("tbody")
        || Array.from(mutation.addedNodes).some((node) =>
          node.nodeType === Node.ELEMENT_NODE
          && (node.matches?.("table, tbody") || node.querySelector?.("table, tbody"))
        ))
    );
    if (tableChanged) {
      scheduleInitialRestore();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes[currentStorageKey]) {
      state.syncAvailable = true;
      state.savedOrder = changes[currentStorageKey].newValue?.order || null;
      if (state.initialRestoreComplete) {
        const current = currentOrder();
        const desired = utils.normalizeOrder(state.savedOrder, current);
        setStatus(
          orderSignature(current) === orderSignature(desired)
            ? savedStatus()
            : "其他裝置已有新順序，重新整理後套用",
          orderSignature(current) === orderSignature(desired) ? "saved" : "idle"
        );
      }
      return;
    }

    if (areaName !== "local" || (!changes[localCacheKey] && !changes[currentStorageKey])) {
      return;
    }

    if (!state.syncAvailable) {
      state.savedOrder = changes[localCacheKey]?.newValue?.order
        || changes[currentStorageKey]?.newValue?.order
        || null;
    }
  });

  restoreInitialOrder();
})();
