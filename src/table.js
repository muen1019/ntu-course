(function initializePriorityTableSync() {
  "use strict";

  const utils = globalThis.NtuPrioritySortUtils;
  if (!utils || location.pathname !== "/priority/table") {
    return;
  }

  const categories = ["chinese", "foreign", "calculus", "common"];
  const storageKeys = categories.map((category) => utils.storageKey(category));
  const localCacheKeys = storageKeys.map((key) => `${key}:local-cache`);
  const watchedKeys = new Set([...storageKeys, ...localCacheKeys]);
  const state = {
    applying: false,
    refreshTimer: null,
    savedOrders: []
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
        resolve({ ok: !error, value: value || {}, error: error?.message || null });
      };

      try {
        area[method](...args, finish);
      } catch (error) {
        resolve({ ok: false, value: {}, error: error.message });
      }
    });
  }

  function isOrderRecord(record) {
    return Boolean(record && Array.isArray(record.order) && record.order.length);
  }

  async function readSavedOrders() {
    const [syncResult, localResult] = await Promise.all([
      callStorage("sync", "get", storageKeys),
      callStorage("local", "get", localCacheKeys)
    ]);

    return storageKeys.map((key) => {
      const syncRecord = syncResult.value?.[key];
      const localRecord = localResult.value?.[`${key}:local-cache`];
      if (syncResult.ok && isOrderRecord(syncRecord)) {
        return syncRecord.order;
      }
      return isOrderRecord(localRecord) ? localRecord.order : [];
    });
  }

  function ensureStatus() {
    let status = document.querySelector("#ntu-priority-memory-status");
    if (status) {
      return status;
    }

    const heading = Array.from(document.querySelectorAll("main h1, main h2"))
      .find((element) => element.textContent.trim() === "預選課表");
    if (!heading?.parentElement) {
      return null;
    }

    status = document.createElement("span");
    status.id = "ntu-priority-memory-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.innerHTML = '<span aria-hidden="true">✓</span><span>正在同步列表志願序</span>';
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

  function courseLinksInCell(cell) {
    return Array.from(cell.querySelectorAll(':scope > a[href^="/courses/"]'));
  }

  function applySavedOrders() {
    if (state.applying || !state.savedOrders.some((order) => order.length)) {
      return 0;
    }

    state.applying = true;
    let changedCells = 0;
    document.querySelectorAll("main .td").forEach((cell) => {
      const links = courseLinksInCell(cell);
      if (links.length < 2) {
        return;
      }

      const currentKeys = links.map((link) => link.getAttribute("href"));
      const desiredKeys = utils.sortBySavedOrders(currentKeys, state.savedOrders);
      if (currentKeys.every((key, index) => key === desiredKeys[index])) {
        return;
      }

      const linksByKey = new Map();
      links.forEach((link) => {
        const key = link.getAttribute("href");
        const bucket = linksByKey.get(key) || [];
        bucket.push(link);
        linksByKey.set(key, bucket);
      });
      desiredKeys.forEach((key) => cell.appendChild(linksByKey.get(key).shift()));
      changedCells += 1;
    });
    state.applying = false;
    return changedCells;
  }

  async function hydrate() {
    if (location.pathname !== "/priority/table") {
      return;
    }

    ensureStatus();
    state.savedOrders = await readSavedOrders();
    if (!state.savedOrders.some((order) => order.length)) {
      setStatus("尚無已儲存的列表志願序", "idle");
      return;
    }

    applySavedOrders();
    setStatus("課表已與列表志願序同步", "saved");
  }

  function scheduleHydrate() {
    window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(hydrate, 100);
  }

  function navigateWithFullReload(event) {
    const anchor = event.target instanceof Element
      ? event.target.closest('a[href^="/priority/list"]')
      : null;
    if (!anchor || event.defaultPrevented || event.button !== 0
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(new URL(anchor.href, location.href).href);
  }

  const observer = new MutationObserver((mutations) => {
    if (state.applying) {
      return;
    }
    const timetableChanged = mutations.some((mutation) =>
      mutation.type === "childList"
      && Array.from(mutation.addedNodes).some((node) =>
        node.nodeType === Node.ELEMENT_NODE
        && (node.matches?.('.td, a[href^="/courses/"]')
          || node.querySelector?.('.td, a[href^="/courses/"]'))
      )
    );
    if (timetableChanged) {
      scheduleHydrate();
    }
  });

  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("click", navigateWithFullReload, true);
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if ((areaName === "sync" || areaName === "local")
      && Object.keys(changes).some((key) => watchedKeys.has(key))) {
      scheduleHydrate();
    }
  });

  hydrate();
})();
