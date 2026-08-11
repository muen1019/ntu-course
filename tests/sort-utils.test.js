const test = require("node:test");
const assert = require("node:assert/strict");
const {
  moveByOffset,
  moveKey,
  normalizeOrder,
  storageKey,
  uniqueStrings
} = require("../src/sort-utils.js");

test("uniqueStrings removes invalid and duplicate values", () => {
  assert.deepEqual(uniqueStrings(["a", "a", "", null, "b"]), ["a", "b"]);
});

test("normalizeOrder keeps remembered courses and appends newly added courses", () => {
  assert.deepEqual(
    normalizeOrder(["course-c", "removed", "course-a"], ["course-a", "course-b", "course-c"]),
    ["course-c", "course-a", "course-b"]
  );
});

test("a newly added course goes to the end even when the website inserts it first", () => {
  assert.deepEqual(
    normalizeOrder(["course-a", "course-b"], ["new-course", "course-a", "course-b"]),
    ["course-a", "course-b", "new-course"]
  );
});

test("moveKey places a course before or after the target", () => {
  assert.deepEqual(moveKey(["a", "b", "c", "d"], "d", "b", false), ["a", "d", "b", "c"]);
  assert.deepEqual(moveKey(["a", "b", "c", "d"], "a", "c", true), ["b", "c", "a", "d"]);
});

test("moveByOffset clamps at the beginning and end", () => {
  assert.deepEqual(moveByOffset(["a", "b", "c"], "b", -1), ["b", "a", "c"]);
  assert.deepEqual(moveByOffset(["a", "b", "c"], "c", 1), ["a", "b", "c"]);
});

test("storageKey creates a stable namespaced key", () => {
  assert.equal(storageKey("Common Courses"), "ntu-priority-planner:v1:common-courses");
  assert.equal(storageKey(""), "ntu-priority-planner:v1:unknown");
});
