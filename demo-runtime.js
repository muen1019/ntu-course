(function provideStandaloneDemoRuntime() {
  "use strict";

  if (globalThis.chrome?.storage?.local && globalThis.chrome?.storage?.sync) {
    return;
  }

  const listeners = new Set();
  const prefix = "ntu-priority-demo-storage:";

  function areaPrefix(areaName) {
    return `${prefix}${areaName}:`;
  }

  function allValues(areaName) {
    const values = {};
    const currentPrefix = areaPrefix(areaName);
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(currentPrefix)) {
        values[key.slice(currentPrefix.length)] = JSON.parse(localStorage.getItem(key));
      }
    }

    // Preserve the first demo version's local records so the migration path
    // can be tested after upgrading this fixture.
    if (areaName === "local") {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        const legacyKey = key?.startsWith(prefix) ? key.slice(prefix.length) : "";
        if (legacyKey && !legacyKey.startsWith("local:") && !legacyKey.startsWith("sync:")) {
          values[legacyKey] = JSON.parse(localStorage.getItem(key));
        }
      }
    }
    return values;
  }

  function selectValues(areaName, keys) {
    const values = allValues(areaName);
    if (keys === null || typeof keys === "undefined") {
      return values;
    }
    if (typeof keys === "string") {
      return Object.hasOwn(values, keys) ? { [keys]: values[keys] } : {};
    }
    if (Array.isArray(keys)) {
      return Object.fromEntries(keys.filter((key) => Object.hasOwn(values, key)).map((key) => [key, values[key]]));
    }
    return Object.fromEntries(Object.entries(keys).map(([key, fallback]) => [key, values[key] ?? fallback]));
  }

  function createArea(areaName) {
    const currentPrefix = areaPrefix(areaName);
    return {
      get(keys, callback) {
        callback(selectValues(areaName, keys));
      },
      set(entries, callback) {
        const changes = {};
        Object.entries(entries).forEach(([key, value]) => {
          const oldValue = selectValues(areaName, key)[key];
          localStorage.setItem(`${currentPrefix}${key}`, JSON.stringify(value));
          changes[key] = { oldValue, newValue: value };
        });
        listeners.forEach((listener) => listener(changes, areaName));
        callback?.();
      },
      remove(keys, callback) {
        const changes = {};
        (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
          const oldValue = selectValues(areaName, key)[key];
          localStorage.removeItem(`${currentPrefix}${key}`);
          if (areaName === "local") {
            localStorage.removeItem(`${prefix}${key}`);
          }
          if (typeof oldValue !== "undefined") {
            changes[key] = { oldValue, newValue: undefined };
          }
        });
        if (Object.keys(changes).length) {
          listeners.forEach((listener) => listener(changes, areaName));
        }
        callback?.();
      },
      clear(callback) {
        const changes = {};
        Object.entries(allValues(areaName)).forEach(([key, oldValue]) => {
          localStorage.removeItem(`${currentPrefix}${key}`);
          if (areaName === "local") {
            localStorage.removeItem(`${prefix}${key}`);
          }
          changes[key] = { oldValue, newValue: undefined };
        });
        if (Object.keys(changes).length) {
          listeners.forEach((listener) => listener(changes, areaName));
        }
        callback?.();
      }
    };
  }

  globalThis.chrome = {
    runtime: {
      getURL(path) { return new URL(path, location.href).href; }
    },
    tabs: {
      create({ url }) { window.open(url, "_blank", "noopener"); }
    },
    storage: {
      local: createArea("local"),
      sync: createArea("sync"),
      onChanged: {
        addListener(listener) { listeners.add(listener); }
      }
    }
  };
})();
