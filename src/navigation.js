(function initializePriorityNavigationGuard() {
  "use strict";

  const PRIORITY_PATH = /^\/priority\/(?:list\/[^/]+|table)\/?$/;

  function isPriorityPath(pathname) {
    return PRIORITY_PATH.test(pathname);
  }

  function isPlainPrimaryClick(event) {
    return event.button === 0
      && !event.defaultPrevented
      && !event.metaKey
      && !event.ctrlKey
      && !event.shiftKey
      && !event.altKey;
  }

  let previousPath = location.pathname;

  function reloadWhenEnteringPriorityRoute() {
    const currentPath = location.pathname;
    if (currentPath === previousPath) {
      return;
    }

    const crossedPriorityBoundary = isPriorityPath(previousPath) !== isPriorityPath(currentPath);
    previousPath = currentPath;
    if (crossedPriorityBoundary) {
      // The list and timetable scripts are document content scripts. A full
      // navigation is required when NTU's app changes routes without a reload;
      // otherwise the new route may not receive (or may keep) the matching
      // content script.
      location.reload();
    }
  }

  document.addEventListener("click", (event) => {
    if (!isPlainPrimaryClick(event)) {
      return;
    }

    const anchor = event.target instanceof Element
      ? event.target.closest("a[href]")
      : null;
    if (!anchor) {
      return;
    }

    const targetUrl = new URL(anchor.href, location.href);
    const currentIsPriority = isPriorityPath(location.pathname);
    const targetIsPriority = isPriorityPath(targetUrl.pathname);
    if (targetUrl.origin !== location.origin
      || currentIsPriority === targetIsPriority) {
      return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    location.assign(targetUrl.href);
  }, true);

  const observer = new MutationObserver(reloadWhenEnteringPriorityRoute);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // A router can call history.pushState without a DOM mutation. Keep this
  // lightweight check only for detecting a route transition; it does not touch
  // storage or reorder anything.
  window.setInterval(reloadWhenEnteringPriorityRoute, 250);
})();
