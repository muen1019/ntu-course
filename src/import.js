(function initializePriorityImporter() {
  "use strict";

  const sortUtils = globalThis.NtuPrioritySortUtils;
  const importUtils = globalThis.NtuPriorityImportUtils;
  const importPath = "/rtcourse/coutake/rt1-runo2-new";

  if (!sortUtils || !importUtils || location.pathname.replace(/\/$/, "") !== importPath) {
    return;
  }

  const storageKey = sortUtils.storageKey("common");
  const localCacheKey = `${storageKey}:local-cache`;
  const state = {
    busy: false,
    modal: null,
    panel: null,
    plan: null,
    record: null,
    target: null
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
        resolve({ ok: false, value: null, error: error.message });
      }
    });
  }

  function isOrderRecord(record) {
    return Boolean(record && Array.isArray(record.order) && record.order.length);
  }

  async function readStoredRecord() {
    const syncResult = await callStorage("sync", "get", storageKey);
    const syncRecord = syncResult.value?.[storageKey];
    if (syncResult.ok && isOrderRecord(syncRecord)) {
      return syncRecord;
    }

    const localResult = await callStorage("local", "get", [storageKey, localCacheKey]);
    const cachedRecord = localResult.value?.[localCacheKey];
    const legacyRecord = localResult.value?.[storageKey];
    return isOrderRecord(cachedRecord)
      ? cachedRecord
      : (isOrderRecord(legacyRecord) ? legacyRecord : null);
  }

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function parseAvailableCourses(doc) {
    return Array.from(doc.querySelectorAll("button.btn-add"))
      .map((button) => {
        const row = button.closest("tr");
        const serial = row?.cells?.[0]?.textContent?.match(/\d{5}/)?.[0] || null;
        return serial ? {
          serial,
          name: cleanText(row.cells?.[1]?.textContent),
          courseCode: cleanText(row.cells?.[3]?.textContent)
        } : null;
      })
      .filter(Boolean);
  }

  function parseUnavailableCourses(doc) {
    return Array.from(doc.querySelectorAll("tr"))
      .map((row) => {
        if (row.querySelector("button.btn-add") || row.querySelector('a[href*="rt1-wish-adjust-new"]')) {
          return null;
        }

        const serial = row.cells?.[0]?.textContent?.match(/\d{5}/)?.[0] || null;
        if (!serial) {
          return null;
        }

        const reason = cleanText(row.cells[row.cells.length - 1]?.textContent);
        return {
          serial,
          name: cleanText(row.cells?.[1]?.textContent),
          courseCode: cleanText(row.cells?.[3]?.textContent),
          reason: reason || "目前無法登記"
        };
      })
      .filter(Boolean);
  }

  function parseRegisteredCourses(doc) {
    return Array.from(doc.querySelectorAll('a[href*="/rtcourse/coutake/rt1-wish-adjust-new?"]'))
      .map((anchor) => {
        const url = new URL(anchor.href, location.href);
        const row = anchor.closest("tr");
        const serial = importUtils.normalizeSerial(url.searchParams.get("serno"));
        const rank = Number(url.searchParams.get("rank"));
        return serial && Number.isInteger(rank) ? {
          serial,
          rank,
          name: cleanText(row?.cells?.[2]?.textContent || row?.cells?.[1]?.textContent),
          courseCode: cleanText(row?.cells?.[4]?.textContent || row?.cells?.[3]?.textContent)
        } : null;
      })
      .filter(Boolean);
  }

  function expiredSession(doc) {
    const text = doc.body?.innerText || "";
    return text.includes("使用時間超過") || text.includes("Your allotted usage time has expired");
  }

  function pageError(doc) {
    const flash = doc.querySelector(".flash_msg")?.textContent;
    if (cleanText(flash)) {
      return cleanText(flash);
    }

    const errorLabel = Array.from(doc.querySelectorAll("th, dt, label"))
      .find((element) => cleanText(element.textContent) === "錯誤訊息");
    const labeledError = errorLabel?.nextElementSibling?.textContent;
    return cleanText(labeledError) || "選課系統未回傳可驗證的結果。";
  }

  async function fetchDocument(url, options = {}) {
    const response = await fetch(url, {
      credentials: "include",
      redirect: "follow",
      ...options
    });
    if (!response.ok) {
      throw new Error(`選課系統回應錯誤（HTTP ${response.status}）。`);
    }

    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (expiredSession(doc)) {
      throw new Error("選課系統登入已逾時，請重新登入後再試。 ");
    }
    return doc;
  }

  async function loadTargetState() {
    const doc = await fetchDocument(`${importPath}?pageRow=all`);
    return {
      availableCourses: parseAvailableCourses(doc),
      unavailableCourses: parseUnavailableCourses(doc),
      registeredCourses: parseRegisteredCourses(doc)
    };
  }

  function payloadFromForm(form) {
    const payload = new URLSearchParams();
    new FormData(form).forEach((value, key) => {
      if (typeof value === "string") {
        payload.append(key, value);
      }
    });
    return payload;
  }

  async function submitForm(form, payload) {
    return fetchDocument(new URL(form.action, location.href).href, {
      method: (form.method || "POST").toUpperCase(),
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: payload.toString()
    });
  }

  function verifiedRank(doc, serial) {
    return parseRegisteredCourses(doc).find((course) => course.serial === serial)?.rank ?? null;
  }

  async function addCourse(serial, rank) {
    const sourceDoc = await fetchDocument(`${importPath}?pageRow=all`);
    const form = sourceDoc.querySelector('form#form1[action*="rt1-addo-new"]');
    if (!form) {
      throw new Error("找不到選課系統的正式登記表單，匯入已停止。 ");
    }

    const payload = payloadFromForm(form);
    payload.set("serno", serial);
    payload.set("txtrank", String(rank));
    const resultDoc = await submitForm(form, payload);
    if (verifiedRank(resultDoc, serial) !== rank) {
      return { ok: false, reason: pageError(resultDoc) };
    }
    return { ok: true };
  }

  function makeElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) {
      element.className = className;
    }
    if (text !== undefined) {
      element.textContent = text;
    }
    return element;
  }

  function actionLabel(action) {
    return ({ keep: "不變", add: "新增", adjust: "調整", unavailable: "略過" })[action] || action;
  }

  function closeModal() {
    if (!state.busy) {
      state.modal?.remove();
      state.modal = null;
    }
  }

  function appendWarning(container, text) {
    const warning = makeElement("p", "ntu-import-warning");
    warning.textContent = text;
    container.appendChild(warning);
  }

  function renderPreview() {
    state.modal?.remove();
    const overlay = makeElement("div", "ntu-import-overlay");
    const dialog = makeElement("section", "ntu-import-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "ntu-import-title");

    const header = makeElement("div", "ntu-import-dialog__header");
    const titleWrap = makeElement("div");
    const eyebrow = makeElement("span", "ntu-import-eyebrow", "正式選課資料變更");
    const title = makeElement("h2", null, "確認匯入志願序");
    title.id = "ntu-import-title";
    titleWrap.append(eyebrow, title);
    const close = makeElement("button", "ntu-import-icon-button", "×");
    close.type = "button";
    close.setAttribute("aria-label", "關閉");
    close.addEventListener("click", closeModal);
    header.append(titleWrap, close);

    const body = makeElement("div", "ntu-import-dialog__body");
    const summary = makeElement(
      "p",
      "ntu-import-summary",
      `將依課程網順序，${state.plan.useOddRanks ? "使用可用的奇數志願序" : "使用連續的可用志願序"}新增 ${state.plan.mutationCount} 門尚未登記的課程；${state.plan.unavailable.length} 門目前無法登記；已登記課程不會修改。`
    );
    body.appendChild(summary);

    const tableWrap = makeElement("div", "ntu-import-table-wrap");
    const table = makeElement("table", "ntu-import-table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["課程", "流水號", "目前", "匯入後", "動作"].forEach((label) => {
      headerRow.appendChild(makeElement("th", null, label));
    });
    thead.appendChild(headerRow);
    const tbody = document.createElement("tbody");
    state.plan.previewCourses.forEach((course) => {
      const row = document.createElement("tr");
      const action = course.action === "unavailable"
        ? `${actionLabel(course.action)}（${course.reason}）`
        : actionLabel(course.action);
      row.append(
        makeElement("td", "ntu-import-course-name", course.name),
        makeElement("td", null, course.serial),
        makeElement("td", null, course.currentRank === null ? "未登記" : String(course.currentRank)),
        makeElement("td", null, course.desiredRank === null ? "—" : String(course.desiredRank)),
        makeElement("td", `ntu-import-action ntu-import-action--${course.action}`, action)
      );
      tbody.appendChild(row);
    });
    table.append(thead, tbody);
    tableWrap.appendChild(table);
    body.appendChild(tableWrap);

    if (state.plan.missing.length) {
      appendWarning(body, `課程網中的 ${state.plan.missing.join("、")} 不在此匯入頁面，將略過。`);
    }
    if (state.plan.unavailable.length) {
      const details = state.plan.unavailable
        .map((course) => `${course.name || course.serial}（${course.reason || "目前無法登記"}）`)
        .join("、");
      appendWarning(body, `${details}，將略過。`);
    }
    if (state.plan.ignoredRegistered.length) {
      appendWarning(body, `選課系統已有 ${state.plan.ignoredRegistered.length} 門已登記課程，將全部忽略，不會調整志願序。`);
    }

    const progress = makeElement("p", "ntu-import-progress");
    progress.setAttribute("role", "status");
    progress.setAttribute("aria-live", "polite");
    body.appendChild(progress);

    const footer = makeElement("div", "ntu-import-dialog__footer");
    const cancel = makeElement("button", "ntu-import-button ntu-import-button--secondary", "取消");
    cancel.type = "button";
    cancel.addEventListener("click", closeModal);
    const emptyLabel = state.plan.unavailable.length || state.plan.missing.length
      ? "沒有可匯入課程"
      : "已是相同順序";
    const confirm = makeElement(
      "button",
      "ntu-import-button ntu-import-button--primary",
      state.plan.operations.length ? "確認並匯入" : emptyLabel
    );
    confirm.type = "button";
    confirm.disabled = !state.plan.operations.length;
    confirm.addEventListener("click", () => runImport({ confirm, cancel, close, progress }));
    footer.append(cancel, confirm);

    dialog.append(header, body, footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });
    document.body.appendChild(overlay);
    state.modal = overlay;
    confirm.focus();
  }

  async function runImport(controls) {
    if (state.busy) {
      return;
    }
    state.busy = true;
    controls.confirm.disabled = true;
    controls.cancel.disabled = true;
    controls.close.disabled = true;

    try {
      const result = await importUtils.executeAddOperations(
        state.plan.operations,
        (operation) => addCourse(operation.serial, operation.toRank),
        (operation, index, total) => {
          controls.progress.textContent = `正在登記流水號 ${operation.serial}（${index + 1}/${total}）…`;
        }
      );

      if (result.failures.length) {
        const details = result.failures
          .map(({ operation, result: failure }) => `${operation.serial}：${failure.reason}`)
          .join("；");
        controls.progress.classList.add("is-error");
        controls.progress.textContent = `已成功 ${result.successes.length} 門，略過 ${result.failures.length} 門。${details}`;
        controls.cancel.disabled = false;
        controls.cancel.textContent = "完成，重新整理";
        controls.cancel.addEventListener("click", () => location.reload(), { once: true });
        state.busy = false;
        return;
      }

      controls.progress.classList.add("is-success");
      controls.progress.textContent = "匯入完成，正在重新讀取選課結果…";
      window.setTimeout(() => location.reload(), 900);
    } catch (error) {
      controls.progress.classList.add("is-error");
      controls.progress.textContent = `系統性錯誤，匯入已停止：${error.message}`;
      controls.cancel.disabled = false;
      controls.cancel.textContent = "關閉並重新整理";
      controls.cancel.addEventListener("click", () => location.reload(), { once: true });
      state.busy = false;
    }
  }

  async function preparePreview(button, status, oddRanksToggle) {
    if (state.busy) {
      return;
    }
    button.disabled = true;
    oddRanksToggle.disabled = true;
    status.textContent = "正在讀取課程網排序與選課系統資料…";
    status.dataset.state = "working";

    try {
      const [record, target] = await Promise.all([readStoredRecord(), loadTargetState()]);
      if (!record) {
        throw new Error("尚未找到「其他科目」的課程網志願序；請先回課程網開啟該列表並確認已儲存。 ");
      }

      const sourceSerials = record.order
        .map(importUtils.serialFromCourseKey)
        .filter(Boolean);
      if (!sourceSerials.length) {
        throw new Error("已儲存的課程網順序中沒有可辨識的流水號。 ");
      }

      const plan = importUtils.buildImportPlan({
        sourceSerials,
        availableCourses: target.availableCourses,
        unavailableCourses: target.unavailableCourses,
        registeredCourses: target.registeredCourses,
        useOddRanks: oddRanksToggle.checked
      });
      if (!plan.ok) {
        throw new Error(plan.error);
      }

      state.record = record;
      state.target = target;
      state.plan = plan;
      status.textContent = `找到 ${plan.courses.length} 門可新增課程、${plan.unavailable.length} 門目前無法登記，請在預覽中確認。`;
      status.dataset.state = "ready";
      renderPreview();
    } catch (error) {
      status.textContent = error.message;
      status.dataset.state = "error";
    } finally {
      button.disabled = false;
      oddRanksToggle.disabled = false;
    }
  }

  function installPanel() {
    if (document.querySelector("#ntu-priority-import-panel")) {
      return;
    }

    const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4"))
      .find((element) => cleanText(element.textContent) === "匯入預選課程");
    if (!heading) {
      return;
    }

    const panel = makeElement("section", "ntu-import-panel");
    panel.id = "ntu-priority-import-panel";
    const copy = makeElement("div", "ntu-import-panel__copy");
    const label = makeElement("span", "ntu-import-eyebrow", "志願序規劃器");
    const title = makeElement("strong", null, "套用課程網的「其他科目」順序");
    const status = makeElement("p", "ntu-import-panel__status", "先比對差異，不會立即變更選課資料。 ");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    copy.append(label, title, status);

    const actions = makeElement("div", "ntu-import-panel__actions");
    const option = makeElement("label", "ntu-import-option");
    const oddRanksToggle = document.createElement("input");
    oddRanksToggle.type = "checkbox";
    oddRanksToggle.id = "ntu-import-odd-ranks";
    const optionText = makeElement("span", null, "只使用奇數志願序（1、3、5…）");
    option.append(oddRanksToggle, optionText);
    const button = makeElement("button", "ntu-import-button ntu-import-button--primary", "預覽匯入");
    button.type = "button";
    button.addEventListener("click", () => preparePreview(button, status, oddRanksToggle));
    actions.append(option, button);
    panel.append(copy, actions);
    heading.insertAdjacentElement("afterend", panel);
    state.panel = panel;
  }

  installPanel();
})();
