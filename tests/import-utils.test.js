const test = require("node:test");
const assert = require("node:assert/strict");
const {
  buildImportPlan,
  buildSecondStageAddOperations,
  buildSecondStagePlan,
  executeAddOperations,
  findScheduleConflicts,
  parseMeetingSlots,
  remainingSeats,
  secondStageSelectionStatus,
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

test("remainingSeats calculates available seats and never returns a negative value", () => {
  assert.equal(remainingSeats(50, 48), 2);
  assert.equal(remainingSeats(30, 32), 0);
  assert.equal(remainingSeats(null, 10), null);
});

test("secondStageSelectionStatus distinguishes registered courses from selected courses", () => {
  assert.equal(secondStageSelectionStatus(""), "selected");
  assert.equal(secondStageSelectionStatus("10（變更）"), "registered");
  assert.equal(secondStageSelectionStatus("變更", true), "registered");
});

test("parseMeetingSlots understands NTU weekday and extended period labels", () => {
  assert.deepEqual(parseMeetingSlots("四7 四8 四9"), ["四7", "四8", "四9"]);
  assert.deepEqual(parseMeetingSlots("三X、A B C"), ["三X", "三A", "三B", "三C"]);
  assert.deepEqual(parseMeetingSlots("密集課程，時間另訂"), []);
});

test("findScheduleConflicts reports every selected course and overlapping slot", () => {
  const conflicts = findScheduleConflicts(
    { serial: "11111", schedule: "一7 一8 一9" },
    [
      { serial: "22222", name: "Existing A", schedule: "一6 一7 一8" },
      { serial: "33333", name: "Existing B", schedule: "二7 二8" },
      { serial: "44444", name: "Existing C", slots: ["一9"] }
    ]
  );

  assert.deepEqual(conflicts.map(({ serial, overlappingSlots }) => ({ serial, overlappingSlots })), [
    { serial: "22222", overlappingSlots: ["一7", "一8"] },
    { serial: "44444", overlappingSlots: ["一9"] }
  ]);
});

test("buildSecondStagePlan keeps source order and annotates timetable conflicts", () => {
  const plan = buildSecondStagePlan({
    sourceSerials: ["11111", "22222", "33333", "44444", "55555"],
    candidateCourses: [
      { serial: "33333", name: "Unavailable", schedule: "三3", actionUrl: null },
      { serial: "11111", name: "Candidate A", schedule: "一2 一3", actionUrl: "/add/11111" },
      { serial: "22222", name: "Candidate B", schedule: "二2", actionUrl: "/add/22222" },
      { serial: "44444", name: "Existing", remainingSlots: 2, registeredCount: 8, actionUrl: null }
    ],
    selectedCourses: [
      { serial: "44444", name: "Existing", schedule: "一3", dropUrl: "/drop/44444" }
    ]
  });

  assert.deepEqual(plan.operations, [
    { type: "add", serial: "11111", actionUrl: "/add/11111", priority: 1 },
    { type: "add", serial: "22222", actionUrl: "/add/22222", priority: 2 }
  ]);
  assert.deepEqual(plan.additions[0].conflicts.map((course) => course.serial), ["44444"]);
  assert.equal(plan.conflictCount, 1);
  assert.deepEqual(plan.unavailable.map((course) => course.serial), ["33333"]);
  assert.deepEqual(plan.ignoredSelected.map((course) => course.serial), ["44444"]);
  assert.equal(plan.ignoredSelected[0].remainingSlots, 2);
  assert.equal(plan.ignoredSelected[0].registeredCount, 8);
  assert.deepEqual(plan.missing, ["55555"]);
});

test("buildSecondStagePlan ignores timetable conflicts with courses that are only registered", () => {
  const plan = buildSecondStagePlan({
    sourceSerials: ["11111"],
    candidateCourses: [
      { serial: "11111", name: "計量經濟", schedule: "一7 一8 一9", actionUrl: "/add/11111" }
    ],
    selectedCourses: [
      {
        serial: "22222",
        name: "待分發課程 A",
        schedule: "一7 一8 一9",
        selectionStatus: "registered",
        dropAvailable: true
      },
      {
        serial: "33333",
        name: "待分發課程 B",
        schedule: "一8 一9",
        selectionStatus: "registered",
        dropAvailable: true
      },
      {
        serial: "44444",
        name: "已選上但不同時段",
        schedule: "二7 二8 二9",
        selectionStatus: "selected",
        dropAvailable: true
      }
    ]
  });

  assert.deepEqual(plan.additions[0].conflicts, []);
  assert.equal(plan.conflictCount, 0);
  assert.deepEqual(buildSecondStageAddOperations(plan).map(({ serial }) => serial), ["11111"]);
});

test("buildSecondStageAddOperations re-adds successfully dropped source courses in source order", () => {
  const plan = buildSecondStagePlan({
    sourceSerials: ["44444", "11111", "22222"],
    candidateCourses: [
      { serial: "11111", name: "Candidate A", actionUrl: "/add/11111" },
      { serial: "22222", name: "Candidate B", actionUrl: "/add/22222" }
    ],
    selectedCourses: [{ serial: "44444", name: "Existing", dropAvailable: true }]
  });

  assert.deepEqual(buildSecondStageAddOperations(plan, ["44444"]), [
    { type: "add", serial: "44444", actionUrl: null, priority: 1, readd: true },
    { type: "add", serial: "11111", actionUrl: "/add/11111", priority: 2 },
    { type: "add", serial: "22222", actionUrl: "/add/22222", priority: 3 }
  ]);
  assert.deepEqual(buildSecondStageAddOperations(plan, []), plan.operations);
});

test("buildSecondStageAddOperations skips conflicts until every conflicting course is dropped", () => {
  const plan = buildSecondStagePlan({
    sourceSerials: ["11111", "22222"],
    candidateCourses: [
      { serial: "11111", name: "Candidate A", schedule: "一2 一3", actionUrl: "/add/11111" },
      { serial: "22222", name: "Candidate B", schedule: "二4", actionUrl: "/add/22222" }
    ],
    selectedCourses: [
      { serial: "33333", name: "Existing A", schedule: "一2", dropAvailable: true },
      { serial: "44444", name: "Existing B", schedule: "一3", dropAvailable: true }
    ]
  });

  assert.deepEqual(buildSecondStageAddOperations(plan, []).map(({ serial }) => serial), ["22222"]);
  assert.deepEqual(buildSecondStageAddOperations(plan, ["33333"]).map(({ serial }) => serial), ["22222"]);
  assert.deepEqual(
    buildSecondStageAddOperations(plan, ["33333", "44444"]).map(({ serial }) => serial),
    ["11111", "22222"]
  );
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
