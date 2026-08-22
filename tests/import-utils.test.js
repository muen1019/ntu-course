const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPlan,
  executeAddOperations,
  serialFromCourseKey,
  uniqueSerials
} = require("../src/import-utils.js");

test("serialFromCourseKey extracts the NTU serial number", () => {
  assert.equal(serialFromCourseKey("/courses/114-2/46242"), "46242");
  assert.equal(serialFromCourseKey("https://course.ntu.edu.tw/courses/114-2/43041"), "43041");
  assert.equal(serialFromCourseKey("common:16235"), "16235");
  assert.equal(serialFromCourseKey("not-a-course"), null);
});

test("uniqueSerials removes invalid and duplicate serial numbers", () => {
  assert.deepEqual(uniqueSerials(["46242", "46242", "12", null, "43041"]), ["46242", "43041"]);
});

test("buildImportPlan adds new courses in source order", () => {
  const plan = buildImportPlan({
    sourceSerials: ["46242", "43041"],
    availableCourses: [
      { serial: "43041", name: "B" },
      { serial: "46242", name: "A" }
    ],
    registeredCourses: []
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.courses.map(({ serial, desiredRank, action }) => ({ serial, desiredRank, action })), [
    { serial: "46242", desiredRank: 1, action: "add" },
    { serial: "43041", desiredRank: 2, action: "add" }
  ]);
  assert.deepEqual(plan.operations, [
    { type: "add", serial: "46242", toRank: 1 },
    { type: "add", serial: "43041", toRank: 2 }
  ]);
});

test("buildImportPlan ignores every registered course and skips occupied ranks", () => {
  const plan = buildImportPlan({
    sourceSerials: ["46242", "16235"],
    availableCourses: [
      { serial: "46242", name: "A" },
      { serial: "16235", name: "Existing" }
    ],
    registeredCourses: [
      { serial: "99999", name: "Keep", rank: 1 },
      { serial: "16235", name: "Existing", rank: 2 }
    ]
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.courses.map(({ serial, desiredRank }) => ({ serial, desiredRank })), [
    { serial: "46242", desiredRank: 3 }
  ]);
  assert.deepEqual(plan.ignoredRegistered.map((course) => course.serial), ["99999", "16235"]);
  assert.deepEqual(plan.operations, [
    { type: "add", serial: "46242", toRank: 3 }
  ]);
});

test("buildImportPlan fills only unoccupied odd ranks when odd mode is enabled", () => {
  const plan = buildImportPlan({
    sourceSerials: ["11111", "22222", "33333"],
    availableCourses: [
      { serial: "11111", name: "A" },
      { serial: "22222", name: "B" },
      { serial: "33333", name: "C" }
    ],
    registeredCourses: [
      { serial: "44444", name: "Existing A", rank: 1 },
      { serial: "55555", name: "Existing B", rank: 5 }
    ],
    useOddRanks: true
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.useOddRanks, true);
  assert.deepEqual(plan.operations, [
    { type: "add", serial: "11111", toRank: 3 },
    { type: "add", serial: "22222", toRank: 7 },
    { type: "add", serial: "33333", toRank: 9 }
  ]);
});

test("buildImportPlan reports courses absent from the import page", () => {
  const plan = buildImportPlan({
    sourceSerials: ["46242", "55555"],
    availableCourses: [{ serial: "46242", name: "A" }],
    registeredCourses: []
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.missing, ["55555"]);
  assert.deepEqual(plan.courses.map((course) => course.serial), ["46242"]);
});

test("buildImportPlan shows unavailable courses without attempting to add them", () => {
  const plan = buildImportPlan({
    sourceSerials: ["22232", "46242"],
    availableCourses: [{ serial: "46242", name: "A" }],
    unavailableCourses: [
      { serial: "22232", name: "機器學習理論與實務", reason: "不開放初選" }
    ],
    registeredCourses: []
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.missing, []);
  assert.deepEqual(plan.unavailable, [
    { serial: "22232", name: "機器學習理論與實務", reason: "不開放初選" }
  ]);
  assert.deepEqual(plan.previewCourses.map(({ serial, action, reason }) => ({ serial, action, reason })), [
    { serial: "22232", action: "unavailable", reason: "不開放初選" },
    { serial: "46242", action: "add", reason: undefined }
  ]);
  assert.deepEqual(plan.operations, [{ type: "add", serial: "46242", toRank: 1 }]);
});

test("executeAddOperations records a rejected course and continues", async () => {
  const attempted = [];
  const operations = [
    { type: "add", serial: "11111", toRank: 1 },
    { type: "add", serial: "22222", toRank: 2 },
    { type: "add", serial: "33333", toRank: 3 }
  ];

  const result = await executeAddOperations(operations, async (operation) => {
    attempted.push(operation.serial);
    return operation.serial === "22222"
      ? { ok: false, reason: "資格不符" }
      : { ok: true };
  });

  assert.deepEqual(attempted, ["11111", "22222", "33333"]);
  assert.deepEqual(result.successes.map(({ operation }) => operation.serial), ["11111", "33333"]);
  assert.equal(result.failures[0].operation.serial, "22222");
  assert.equal(result.failures[0].result.reason, "資格不符");
});
