(function initializeDemoSorting() {
  "use strict";

  let draggedRow = null;
  const body = document.querySelector("tbody");

  if (new URLSearchParams(location.search).has("new-course-first")) {
    const newRow = document.createElement("tr");
    newRow.draggable = true;
    newRow.setAttribute("role", "button");
    newRow.setAttribute("aria-roledescription", "draggable");
    newRow.dataset.courseKey = "/courses/115-1/39999";
    newRow.innerHTML = `
      <td><input type="number" value="1"></td>
      <td>39999</td>
      <td data-course-name><a href="/courses/115-1/39999">新加入的示範課程</a></td>
      <td>3</td>
      <td>示範老師</td>
      <td>五 5, 6, 7</td>
      <td>40</td>
      <td><button>移除</button></td>`;
    body.prepend(newRow);
  }

  function updateNumbers() {
    Array.from(body.rows).forEach((row, index) => {
      row.querySelector('input[type="number"]').value = String(index + 1);
    });
  }

  body.addEventListener("dragstart", (event) => {
    draggedRow = event.target.closest("tr");
    if (draggedRow) {
      event.dataTransfer.effectAllowed = "move";
    }
  });

  body.addEventListener("dragover", (event) => {
    const target = event.target.closest("tr");
    if (!draggedRow || !target || target === draggedRow) {
      return;
    }
    event.preventDefault();
    const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
    body.insertBefore(draggedRow, after ? target.nextSibling : target);
    updateNumbers();
  });

  body.addEventListener("dragend", () => {
    updateNumbers();
    draggedRow = null;
  });

  body.addEventListener("change", (event) => {
    if (!event.target.matches('input[type="number"]')) {
      return;
    }
    const row = event.target.closest("tr");
    const targetIndex = Math.max(0, Math.min(body.rows.length - 1, Number(event.target.value) - 1));
    const reference = body.rows[targetIndex];
    body.insertBefore(row, reference === row ? row : reference);
    updateNumbers();
  });
})();
