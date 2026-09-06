(function initializeSecondStageImporter() {
  "use strict";

  const sortUtils = globalThis.NtuPrioritySortUtils;
  const importUtils = globalThis.NtuPriorityImportUtils;
  const importPath = "/coursetake/ctake/import-cou";

  if (!sortUtils || !importUtils || location.pathname.replace(/\/$/, "") !== importPath) {
    return;
  }

  const storageKey = sortUtils.storageKey("common");
  const localCacheKey = `${storageKey}:local-cache`;
  const state = {
    busy: false,
    dropSelections: new Set(),
    modal: null,
    panel: null,
    plan: null,
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

  function serialFromRow(row) {
    return importUtils.normalizeSerial(cleanText(row?.cells?.[0]?.textContent));
  }

  function countFromCell(cell) {
    const text = cleanText(cell?.textContent).replace(/,/g, "");
    if (!text) {
      return null;
    }
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }

  function parseCandidateCourses(doc) {
    return Array.from(doc.querySelectorAll("tr"))
      .map((row) => {
        const serial = serialFromRow(row);
        if (!serial || row.cells.length < 9) {
          return null;
        }

        const addLink = row.querySelector('a[href*="/coursetake/ctake/add-cou"]');
        const schedule = cleanText(row.cells[5]?.textContent);
        const quotaLimit = countFromCell(row.cells[6]);
        const selectedCount = countFromCell(row.cells[7]);
        const registeredCount = countFromCell(row.cells[8]);
        return {
          serial,
          courseCode: cleanText(row.cells[1]?.textContent),
          section: cleanText(row.cells[2]?.textContent),
          name: cleanText(row.cells[3]?.textContent) || serial,
          teacher: cleanText(row.cells[4]?.textContent),
          schedule,
          slots: importUtils.parseMeetingSlots(schedule),
          quotaLimit,
          selectedCount,
          registeredCount,
          remainingSlots: importUtils.remainingSeats(quotaLimit, selectedCount),
          actionUrl: addLink?.href || null,
          reason: addLink ? null : "目前沒有登記連結"
        };
      })
      .filter(Boolean);
  }

  function parseSelectedCourses(doc) {
    return Array.from(doc.querySelectorAll("tr"))
      .map((row) => {
        const serial = serialFromRow(row);
        if (!serial || row.cells.length < 8) {
          return null;
        }

        const schedule = cleanText(row.cells[6]?.textContent);
        return {
          serial,
          courseCode: cleanText(row.cells[1]?.textContent),
          section: cleanText(row.cells[2]?.textContent),
          name: cleanText(row.cells[3]?.textContent) || serial,
          teacher: cleanText(row.cells[5]?.textContent),
          schedule,
          slots: importUtils.parseMeetingSlots(schedule),
          dropAvailable: Boolean(row.querySelector('a[href*="/coursetake/ctake/del-cou"]'))
        };
      })
      .filter(Boolean);
  }

  function parseHomeCourseStatuses(doc) {
    return Array.from(doc.querySelectorAll("tr"))
      .map((row) => {
        const serial = serialFromRow(row);
        if (!serial || row.cells.length < 8) {
          return null;
        }

        const priorityCell = row.cells[7];
        const priorityText = cleanText(priorityCell?.textContent);
        const priorityMatch = priorityText.match(/\d+/);
        return {
          serial,
          selectionStatus: importUtils.secondStageSelectionStatus(
            priorityText,
            Boolean(priorityCell?.querySelector('a[href*="/coursetake/ctake/chg-priority"]'))
          ),
          currentPriority: priorityMatch ? Number(priorityMatch[0]) : null
        };
      })
      .filter(Boolean);
  }

  function expiredSession(doc) {
    const text = cleanText(doc.body?.innerText || doc.body?.textContent);
    return text.includes("使用時間超過")
      || text.includes("請重新登入")
      || text.includes("Your allotted usage time has expired");
  }

  function pageError(doc) {
    const alertText = Array.from(doc.querySelectorAll(".flash_msg, .alert, .error, [role='alert']"))
      .map((element) => cleanText(element.textContent))
      .find(Boolean);
    if (alertText) {
      return alertText;
    }

    const errorLabel = Array.from(doc.querySelectorAll("th, dt, label"))
      .find((element) => cleanText(element.textContent) === "錯誤訊息");
    const labeledError = cleanText(errorLabel?.nextElementSibling?.textContent);
    return labeledError || "選課系統未回傳可驗證的結果。";
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
      throw new Error("選課系統登入已逾時，請重新登入後再試。");
    }
    return doc;
  }

  function targetLink(doc, pathFragment) {
    const anchor = doc.querySelector(`a[href*="${pathFragment}"]`);
    return anchor ? new URL(anchor.href, location.href).href : null;
  }

  async function loadTargetState() {
    const importPageUrl = location.href;
    const importDoc = await fetchDocument(importPageUrl);
    const dropPageUrl = targetLink(importDoc, "/coursetake/ctake/del-form");
    const homePageUrl = targetLink(importDoc, "/coursetake/ctake/mainscr");
    if (!dropPageUrl) {
      throw new Error("找不到選課系統的退選清單連結，無法檢查已選課程。");
    }
    if (!homePageUrl) {
      throw new Error("找不到選課系統首頁連結，無法區分已登記與已選上課程。");
    }

    const [dropDoc, homeDoc] = await Promise.all([
      fetchDocument(dropPageUrl),
      fetchDocument(homePageUrl)
    ]);
    const homeStatuses = new Map(parseHomeCourseStatuses(homeDoc)
      .map((course) => [course.serial, course]));
    return {
      importPageUrl,
      dropPageUrl,
      homePageUrl,
      candidateCourses: parseCandidateCourses(importDoc),
      selectedCourses: parseSelectedCourses(dropDoc).map((course) => ({
        ...course,
        ...(homeStatuses.get(course.serial) || { selectionStatus: "selected", currentPriority: null })
      }))
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

  async function submitForm(form, payload, fallbackUrl) {
    const method = (form.getAttribute("method") || "GET").toUpperCase();
    const action = new URL(form.getAttribute("action") || fallbackUrl, fallbackUrl);
    if (method === "GET") {
      action.search = payload.toString();
      return fetchDocument(action.href);
    }

    return fetchDocument(action.href, {
      method,
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: payload.toString()
    });
  }

  async function selectedCourse(serial) {
    const doc = await fetchDocument(state.target.dropPageUrl);
    return parseSelectedCourses(doc).find((course) => course.serial === serial) || null;
  }

  async function addCourse(operation) {
    const serial = operation.serial;
    if (await selectedCourse(serial)) {
      return { ok: true, reason: "已在選課清單中" };
    }

    const importDoc = await fetchDocument(state.target.importPageUrl);
    const row = Array.from(importDoc.querySelectorAll("tr"))
      .find((candidate) => serialFromRow(candidate) === serial);
    const addLink = row?.querySelector('a[href*="/coursetake/ctake/add-cou"]');
    if (!addLink) {
      return { ok: false, reason: "目前沒有可用的登記連結。" };
    }

    const confirmDoc = await fetchDocument(addLink.href);
    const form = Array.from(confirmDoc.forms)
      .find((candidate) => candidate.querySelector('input[name="sure"]'));
    const sure = form?.querySelector('input[name="sure"]');
    if (!form || !sure || !cleanText(sure.value).includes("確定登記")) {
      throw new Error(`找不到流水號 ${serial} 的正式登記確認表單，匯入已停止。`);
    }

    const payload = payloadFromForm(form);
    const priority = Math.min(Math.max(Number(operation.priority) || 1, 1), 99);
    payload.set("priority", String(priority));
    payload.set("sure", sure.value);
    const resultDoc = await submitForm(form, payload, addLink.href);
    if (!await selectedCourse(serial)) {
      return { ok: false, reason: pageError(resultDoc) };
    }
    return { ok: true };
  }

  async function dropCourse(serial) {
    const dropDoc = await fetchDocument(state.target.dropPageUrl);
    const selected = parseSelectedCourses(dropDoc).find((course) => course.serial === serial);
    if (!selected) {
      return { ok: true, reason: "已不在選課清單中" };
    }
    if (!selected.dropAvailable) {
      return { ok: false, reason: "選課系統未提供這門課的退選動作。" };
    }

    const row = Array.from(dropDoc.querySelectorAll("tr"))
      .find((candidate) => serialFromRow(candidate) === serial);
    const dropLink = row?.querySelector('a[href*="/coursetake/ctake/del-cou"]');
    if (!dropLink) {
      return { ok: false, reason: "選課系統未提供這門課的退選確認連結。" };
    }

    const confirmDoc = await fetchDocument(dropLink.href);
    const form = Array.from(confirmDoc.forms)
      .find((candidate) => candidate.querySelector('input[name="sure"]'));
    const sure = form?.querySelector('input[name="sure"]');
    if (!form || !sure || !cleanText(sure.value).includes("確定退選")) {
      throw new Error(`找不到流水號 ${serial} 的正式退選確認表單，匯入已停止。`);
    }

    const payload = payloadFromForm(form);
    payload.set("sure", sure.value);
    const resultDoc = await submitForm(form, payload, dropLink.href);
    if (await selectedCourse(serial)) {
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

  function quotaCompetition(course) {
    if (!Number.isFinite(course?.remainingSlots) || !Number.isFinite(course?.registeredCount)) {
      return { label: "—", state: "unknown" };
    }

    const state = course.remainingSlots === 0
      ? "full"
      : (course.registeredCount >= course.remainingSlots ? "competitive" : "available");
    return {
      label: `登記 ${course.registeredCount}｜剩餘 ${course.remainingSlots}`,
      state
    };
  }

  function closeModal() {
    if (!state.busy) {
      state.modal?.remove();
      state.modal = null;
      state.dropSelections.clear();
    }
  }

  function appendWarning(container, text, className = "ntu-import-warning") {
    const warning = makeElement("p", className, text);
    container.appendChild(warning);
    return warning;
  }

  function syncDropCheckboxes(serial, checked) {
    state.modal?.querySelectorAll(`input[data-drop-serial="${serial}"]`).forEach((checkbox) => {
      checkbox.checked = checked;
    });
  }

  function selectedDrops() {
    return state.plan.selectedCourses
      .filter((course) => state.dropSelections.has(course.serial));
  }

  function plannedAddOperations(dropSerials = [...state.dropSelections]) {
    return importUtils.buildSecondStageAddOperations(state.plan, dropSerials);
  }

  function selectedSourceDrops() {
    const selectedSource = new Set(state.plan.ignoredSelected.map((course) => course.serial));
    return selectedDrops().filter((course) => selectedSource.has(course.serial));
  }

  function selectedSourceStatus(course, willReadd) {
    if (willReadd) {
      return "將重新登記";
    }
    return course.selectionStatus === "registered" ? "已登記" : "已選上";
  }

  function selectedSourceHandling(course, willReadd) {
    if (willReadd) {
      return "先退選後重新登記";
    }
    return course.selectionStatus === "registered" ? "等待分發" : "保留";
  }

  function syncSelectedSourceRows() {
    state.plan.ignoredSelected.forEach((course) => {
      const willReadd = state.dropSelections.has(course.serial);
      const row = state.modal?.querySelector(`[data-selected-source-row="${course.serial}"]`);
      const status = row?.querySelector("[data-selected-source-status]");
      const handling = row?.querySelector("[data-selected-source-handling]");
      row?.classList.toggle("ntu-import-row--readd", willReadd);
      if (status) {
        status.className = `ntu-import-action ntu-import-action--${willReadd ? "adjust" : "keep"}`;
        status.textContent = selectedSourceStatus(course, willReadd);
      }
      if (handling) {
        handling.textContent = selectedSourceHandling(course, willReadd);
      }
    });
  }

  function syncConflictRows() {
    state.plan.additions
      .filter((course) => course.conflicts?.length)
      .forEach((course) => {
        const willResolveConflict = course.conflicts.every((conflict) =>
          state.dropSelections.has(conflict.serial)
        );
        const row = state.modal?.querySelector(`[data-conflict-course-row="${course.serial}"]`);
        const status = row?.querySelector("[data-conflict-course-status]");
        row?.classList.toggle("ntu-import-row--conflict-resolved", willResolveConflict);
        if (status) {
          const details = course.conflicts.map((conflict) =>
            `${conflict.name}（${conflict.overlappingSlots.join("、")}）`
          ).join("、");
          status.className = willResolveConflict
            ? "ntu-import-action ntu-import-action--add"
            : "ntu-import-conflict";
          status.textContent = willResolveConflict
            ? "衝堂已處理，將登記"
            : `衝堂，將略過：${details}`;
        }
      });
  }

  function updateDropSummary(confirm, warning, summary) {
    const drops = selectedDrops();
    const readds = selectedSourceDrops();
    const addCount = plannedAddOperations().length;
    confirm.textContent = drops.length
      ? `確認退選 ${drops.length} 門並登記 ${addCount} 門`
      : `確認並匯入 ${addCount} 門`;
    confirm.disabled = !drops.length && !addCount;
    warning.hidden = !drops.length;
    warning.textContent = drops.length
      ? `將先退選：${drops.map((course) => course.name).join("、")}。${readds.length
        ? `${readds.map((course) => course.name).join("、")} 會依課程網順序重新登記。`
        : ""}若後續登記失敗，不會自動復原退選。`
      : "";
    summary.textContent = `將依課程網順序登記 ${addCount} 門課；另有 ${state.plan.conflictCount} 門衝堂課，未完成退選時會略過。`;
    syncSelectedSourceRows();
    syncConflictRows();
  }

  function renderDropChoice(conflict, confirm, warning, summary) {
    const label = makeElement("label", "ntu-import-drop-option");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.dataset.dropSerial = conflict.serial;
    checkbox.disabled = !conflict.dropAvailable;
    checkbox.checked = state.dropSelections.has(conflict.serial);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        state.dropSelections.add(conflict.serial);
      } else {
        state.dropSelections.delete(conflict.serial);
      }
      syncDropCheckboxes(conflict.serial, checkbox.checked);
      updateDropSummary(confirm, warning, summary);
    });
    const suffix = conflict.dropAvailable ? "" : "（無退選動作）";
    label.append(checkbox, makeElement("span", null, `退選 ${conflict.name}${suffix}`));
    return label;
  }

  function renderPreview() {
    state.modal?.remove();
    state.dropSelections.clear();
    const initialAddCount = plannedAddOperations().length;

    const overlay = makeElement("div", "ntu-import-overlay");
    const dialog = makeElement("section", "ntu-import-dialog ntu-stage2-dialog");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "ntu-stage2-title");

    const header = makeElement("div", "ntu-import-dialog__header");
    const titleWrap = makeElement("div");
    titleWrap.append(
      makeElement("span", "ntu-import-eyebrow", "初選第二階段"),
      makeElement("h2", null, "確認匯入與衝堂處理")
    );
    titleWrap.querySelector("h2").id = "ntu-stage2-title";
    const close = makeElement("button", "ntu-import-icon-button", "×");
    close.type = "button";
    close.setAttribute("aria-label", "關閉");
    close.addEventListener("click", closeModal);
    header.append(titleWrap, close);

    const body = makeElement("div", "ntu-import-dialog__body");
    const summary = makeElement(
      "p",
      "ntu-import-summary",
      `將依課程網順序登記 ${initialAddCount} 門課；另有 ${state.plan.conflictCount} 門衝堂課，未完成退選時會略過。`
    );
    body.appendChild(summary);

    const tableWrap = makeElement("div", "ntu-import-table-wrap");
    const table = makeElement("table", "ntu-import-table ntu-stage2-table");
    const thead = document.createElement("thead");
    const headerRow = document.createElement("tr");
    ["順序", "課程", "上課時間", "名額競爭", "狀態", "衝堂處理"].forEach((text) => {
      headerRow.appendChild(makeElement("th", null, text));
    });
    thead.appendChild(headerRow);
    const tbody = document.createElement("tbody");

    const footer = makeElement("div", "ntu-import-dialog__footer");
    const cancel = makeElement("button", "ntu-import-button ntu-import-button--secondary", "取消");
    cancel.type = "button";
    cancel.addEventListener("click", closeModal);
    const confirm = makeElement(
      "button",
      "ntu-import-button ntu-import-button--primary",
      `確認並匯入 ${initialAddCount} 門`
    );
    confirm.type = "button";
    confirm.disabled = !initialAddCount;
    footer.append(cancel, confirm);

    const dropWarning = appendWarning(body, "", "ntu-import-drop-warning");
    dropWarning.hidden = true;

    const additions = new Map(state.plan.additions.map((course) => [course.serial, course]));
    const unavailable = new Map(state.plan.unavailable.map((course) => [course.serial, course]));
    const selectedSource = new Map(state.plan.ignoredSelected.map((course) => [course.serial, course]));
    let displayIndex = 0;
    state.plan.source.forEach((serial) => {
      const course = additions.get(serial) || unavailable.get(serial) || selectedSource.get(serial);
      if (!course) {
        return;
      }
      displayIndex += 1;
      const row = document.createElement("tr");
      const statusCell = document.createElement("td");
      const handlingCell = document.createElement("td");

      if (selectedSource.has(serial)) {
        row.dataset.selectedSourceRow = serial;
        const selectedStatus = makeElement(
          "span",
          "ntu-import-action ntu-import-action--keep",
          selectedSourceStatus(course, false)
        );
        selectedStatus.dataset.selectedSourceStatus = "";
        handlingCell.dataset.selectedSourceHandling = "";
        handlingCell.textContent = selectedSourceHandling(course, false);
        statusCell.appendChild(selectedStatus);
      } else if (course.conflicts?.length) {
        row.className = "ntu-import-row--conflict";
        row.dataset.conflictCourseRow = serial;
        const details = course.conflicts.map((conflict) =>
          `${conflict.name}（${conflict.overlappingSlots.join("、")}）`
        ).join("、");
        const conflictStatus = makeElement("span", "ntu-import-conflict", `衝堂，將略過：${details}`);
        conflictStatus.dataset.conflictCourseStatus = "";
        statusCell.appendChild(conflictStatus);
        const options = makeElement("div", "ntu-import-drop-options");
        course.conflicts.forEach((conflict) => {
          options.appendChild(renderDropChoice(conflict, confirm, dropWarning, summary));
        });
        handlingCell.appendChild(options);
      } else if (course.actionUrl) {
        statusCell.appendChild(makeElement("span", "ntu-import-action ntu-import-action--add", "可登記"));
        handlingCell.textContent = "保留已選課";
      } else {
        statusCell.appendChild(makeElement(
          "span",
          "ntu-import-action ntu-import-action--unavailable",
          `略過（${course.reason || "目前無法登記"}）`
        ));
        handlingCell.textContent = "—";
      }

      const competition = quotaCompetition(course);
      const quotaCell = makeElement(
        "td",
        `ntu-import-quota ntu-import-quota--${competition.state}`,
        competition.label
      );
      quotaCell.title = "已登記人數｜剩餘可選上名額";
      row.append(
        makeElement("td", null, String(displayIndex)),
        makeElement("td", "ntu-import-course-name", `${course.name}（${course.serial}）`),
        makeElement("td", null, course.schedule || "時間另訂"),
        quotaCell,
        statusCell,
        handlingCell
      );
      tbody.appendChild(row);
    });

    table.append(thead, tbody);
    tableWrap.appendChild(table);
    body.insertBefore(tableWrap, dropWarning);

    if (state.plan.missing.length) {
      appendWarning(body, `課程網中的 ${state.plan.missing.join("、")} 不在二階匯入頁面，將略過。`);
    }
    if (state.plan.ignoredSelected.length) {
      appendWarning(body, `已有 ${state.plan.ignoredSelected.length} 門志願課在選課清單中，已依原順序顯示；未勾選退選時會保留。`);
    }
    const progress = makeElement("p", "ntu-import-progress");
    progress.setAttribute("role", "status");
    progress.setAttribute("aria-live", "polite");
    body.appendChild(progress);

    confirm.addEventListener("click", () => runImport({ confirm, cancel, close, progress }));
    dialog.append(header, body, footer);
    overlay.appendChild(dialog);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeModal();
      }
    });
    document.body.appendChild(overlay);
    state.modal = overlay;
    updateDropSummary(confirm, dropWarning, summary);
    confirm.focus();
  }

  function resultDetails(failures) {
    return failures
      .map(({ operation, result }) => `${operation.serial}：${result.reason}`)
      .join("；");
  }

  async function runImport(controls) {
    if (state.busy) {
      return;
    }

    const drops = selectedDrops();
    if (drops.length) {
      const names = drops.map((course) => course.name).join("、");
      const readds = selectedSourceDrops();
      const accepted = window.confirm(
        `將先退選：${names}。${readds.length
          ? `\n其中 ${readds.map((course) => course.name).join("、")} 會依課程網順序重新登記。`
          : ""}\n後續課程若登記失敗，退選不會自動復原。確定繼續嗎？`
      );
      if (!accepted) {
        return;
      }
    }

    state.busy = true;
    controls.confirm.disabled = true;
    controls.cancel.disabled = true;
    controls.close.disabled = true;

    try {
      const dropOperations = drops.map((course) => ({ type: "drop", serial: course.serial }));
      const dropResult = await importUtils.executeAddOperations(
        dropOperations,
        (operation) => dropCourse(operation.serial),
        (operation, index, total) => {
          controls.progress.textContent = `正在退選流水號 ${operation.serial}（${index + 1}/${total}）…`;
        }
      );

      const successfulDropSerials = dropResult.successes
        .map(({ operation }) => operation.serial);
      const addOperations = plannedAddOperations(successfulDropSerials);

      const addResult = await importUtils.executeAddOperations(
        addOperations,
        (operation) => addCourse(operation),
        (operation, index, total) => {
          controls.progress.textContent = `正在登記流水號 ${operation.serial}（${index + 1}/${total}）…`;
        }
      );

      const failures = [...dropResult.failures, ...addResult.failures];
      if (failures.length) {
        controls.progress.classList.add("is-error");
        controls.progress.textContent = `退選成功 ${dropResult.successes.length} 門、登記成功 ${addResult.successes.length} 門；失敗 ${failures.length} 門。${resultDetails(failures)}`;
        controls.cancel.disabled = false;
        controls.cancel.textContent = "完成，重新整理";
        controls.cancel.addEventListener("click", () => location.reload(), { once: true });
        state.busy = false;
        return;
      }

      controls.progress.classList.add("is-success");
      controls.progress.textContent = `完成退選 ${dropResult.successes.length} 門、登記 ${addResult.successes.length} 門，正在重新讀取結果…`;
      window.setTimeout(() => location.reload(), 900);
    } catch (error) {
      controls.progress.classList.add("is-error");
      controls.progress.textContent = `系統性錯誤，操作已停止：${error.message}`;
      controls.cancel.disabled = false;
      controls.cancel.textContent = "關閉並重新整理";
      controls.cancel.addEventListener("click", () => location.reload(), { once: true });
      state.busy = false;
    }
  }

  async function preparePreview(button, status) {
    if (state.busy) {
      return;
    }
    button.disabled = true;
    status.textContent = "正在讀取課程網排序、二階候選課程與目前課表…";
    status.dataset.state = "working";

    try {
      const [record, target] = await Promise.all([readStoredRecord(), loadTargetState()]);
      if (!record) {
        throw new Error("尚未找到「其他科目」的課程網志願序；請先回課程網開啟該列表並確認已儲存。");
      }

      const sourceSerials = record.order
        .map(importUtils.serialFromCourseKey)
        .filter(Boolean);
      if (!sourceSerials.length) {
        throw new Error("已儲存的課程網順序中沒有可辨識的流水號。");
      }

      const plan = importUtils.buildSecondStagePlan({
        sourceSerials,
        candidateCourses: target.candidateCourses,
        selectedCourses: target.selectedCourses
      });
      state.target = target;
      state.plan = plan;
      const initialAddCount = importUtils.buildSecondStageAddOperations(plan).length;
      status.textContent = `目前可登記 ${initialAddCount} 門課；另有 ${plan.conflictCount} 門衝堂課預設略過，請在預覽中確認。`;
      status.dataset.state = "ready";
      renderPreview();
    } catch (error) {
      status.textContent = error.message;
      status.dataset.state = "error";
    } finally {
      button.disabled = false;
    }
  }

  function installPanel() {
    if (document.querySelector("#ntu-priority-import-panel")) {
      return;
    }

    const heading = Array.from(document.querySelectorAll("h1, h2, h3, h4"))
      .find((element) => cleanText(element.textContent) === "匯入要登記的課程");
    if (!heading) {
      return;
    }

    const panel = makeElement("section", "ntu-import-panel");
    panel.id = "ntu-priority-import-panel";
    const copy = makeElement("div", "ntu-import-panel__copy");
    const status = makeElement(
      "p",
      "ntu-import-panel__status",
      "先依課程網順序預覽，並自動比對目前已選課表；不會立即登記或退選。"
    );
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    copy.append(
      makeElement("span", "ntu-import-eyebrow", "志願序規劃器"),
      makeElement("strong", null, "套用課程網順序並檢查衝堂"),
      status
    );
    const button = makeElement("button", "ntu-import-button ntu-import-button--primary", "預覽二階匯入");
    button.type = "button";
    button.addEventListener("click", () => preparePreview(button, status));
    panel.append(copy, button);
    heading.insertAdjacentElement("afterend", panel);
    state.panel = panel;
  }

  installPanel();
})();
