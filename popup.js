(function initializePopup() {
  "use strict";

  document.querySelector("#open-course").addEventListener("click", () => {
    chrome.tabs.create({ url: "https://course.ntu.edu.tw/priority/list/common" });
    window.close();
  });

  document.querySelector("#open-demo").addEventListener("click", () => {
    chrome.tabs.create({ url: chrome.runtime.getURL("demo.html") });
    window.close();
  });

  document.querySelector("#clear-order").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    await Promise.all([
      new Promise((resolve) => chrome.storage.sync.clear(resolve)),
      new Promise((resolve) => chrome.storage.local.clear(resolve))
    ]);
    button.textContent = "已清除，重新整理頁面即可";
    button.disabled = true;
  });
})();
