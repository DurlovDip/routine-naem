import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createInitialState } from "../mobile/src/lib/demo.ts";
import { formatMineDayHeader, mineEmptyLabel, mySessions, rosterTeacherName, upcomingMineGroups } from "../mobile/src/lib/mine.ts";
import type { DayPlan } from "../mobile/src/lib/types.ts";

function dayWith(patch: Partial<DayPlan>): DayPlan {
  const day = createInitialState().days[0];
  return { ...day, ...patch, slots: patch.slots ?? day.slots, cells: patch.cells ?? {}, merges: patch.merges ?? [] };
}

describe("my schedule", () => {
  const teachers = [
    { id: "teacher-2", name: "Md. Sazzad Ali" },
    { id: "teacher-3", name: "Muhammad Yeakub Ali" },
  ];

  it("matches the roster name for the signed-in teacher id", () => {
    const day = dayWith({
      slots: [
        { id: "s1", kind: "session", durationMin: 60 },
        { id: "s2", kind: "session", durationMin: 60 },
      ],
      cells: {
        "batch-9:s1": { code: "M- 7.04", note: "", teachers: ["Md. Sazzad Ali", "Muhammad Yeakub Ali"] },
        "batch-10:s2": { code: "M- 8.01", note: "Room 2", teachers: ["Prof. Asisul"] },
        "batch-11:s2": { code: "M- 9.05", note: "", teachers: ["md. sazzad ali"] },
      },
      merges: [],
    });
    const batches = [
      { id: "batch-9", name: "9th", roster: [] },
      { id: "batch-10", name: "10th", roster: [] },
      { id: "batch-11", name: "11th", roster: [] },
    ];
    assert.equal(rosterTeacherName(teachers, "teacher-2"), "Md. Sazzad Ali");
    const mine = mySessions(batches, teachers, day, "teacher-2", "Someone Else");
    assert.deepEqual(
      mine.map((item) => item.label),
      ["Session - 1", "Session - 2"],
    );
    assert.equal(mine[0]?.module, "M- 7.04");
    assert.deepEqual(mine[0]?.coTeachers, ["Muhammad Yeakub Ali"]);
    assert.equal(mine[0]?.batchLabel, "9th Batch");
    assert.equal(mine[1]?.batchLabel, "11th Batch");
    assert.equal(mine[1]?.module, "M- 9.05");
    assert.ok(mine[0]!.start < mine[1]!.start);
    assert.equal(mine.some((item) => item.batchLabel.startsWith("10th")), false);
  });

  it("uses the display name only when the id is not on the roster", () => {
    const day = dayWith({
      cells: {
        "batch-9:s1": { code: "M- 7.04", note: "", teachers: ["Dr. Litan Kanti Halder"] },
      },
    });
    const batches = [{ id: "batch-9", name: "9th", roster: [] }];
    assert.deepEqual(mySessions(batches, teachers, day, "screenshot", "Dr. Litan Kanti Halder"), [
      {
        key: "batch-9:s1",
        label: "Session - 1",
        start: 9 * 60 + 30,
        end: 10 * 60 + 30,
        batchLabel: "9th Batch",
        module: "M- 7.04",
        coTeachers: [],
      },
    ]);
    assert.deepEqual(mySessions(batches, teachers, day, "teacher-2", "Dr. Litan Kanti Halder"), []);
  });

  it("keeps one row for a merged span and orders batches by time", () => {
    const day = dayWith({
      dayStart: "09:00",
      recapMin: 0,
      slots: [
        { id: "s1", kind: "session", durationMin: 60 },
        { id: "s2", kind: "session", durationMin: 60 },
      ],
      cells: {
        "batch-11:s1": { code: "M- 8.01", note: "", teachers: ["Md. Sazzad Ali"] },
        "batch-9:s2": { code: "M- 7.02", note: "", teachers: ["Md. Sazzad Ali", "Prof. Asisul"] },
      },
      merges: [{ batchId: "batch-11", sessionIds: ["s1", "s2"] }],
    });
    const batches = [
      { id: "batch-11", name: "11th", roster: [] },
      { id: "batch-9", name: "9th", roster: [] },
    ];
    const mine = mySessions(batches, teachers, day, "teacher-2");
    assert.equal(mine.length, 2);
    assert.equal(mine[0]?.label, "Session - 1 to Session - 2");
    assert.equal(mine[0]?.batchLabel, "11th Batch");
    assert.equal(mine[0]?.start, 9 * 60);
    assert.equal(mine[0]?.end, 11 * 60);
    assert.equal(mine[1]?.label, "Session - 2");
    assert.equal(mine[1]?.batchLabel, "9th Batch");
    assert.deepEqual(mine[1]?.coTeachers, ["Prof. Asisul"]);
  });

  it("names the empty day the same way the chips do", () => {
    assert.equal(mineEmptyLabel(8), "No sessions for you on Day 08");
    assert.equal(mineEmptyLabel(0), "No sessions for you on Day 00");
  });

  it("formats day headers for Today, Tomorrow, and later days", () => {
    const today = "2026-10-24";
    assert.equal(formatMineDayHeader({ ...dayWith({ dayNumber: 8, date: "2026-10-24" }) }, today), "Today · 24/10/2026");
    assert.equal(formatMineDayHeader({ ...dayWith({ dayNumber: 9, date: "2026-10-25" }) }, today), "Tomorrow · 25/10/2026");
    assert.equal(formatMineDayHeader({ ...dayWith({ dayNumber: 10, date: "2026-10-26" }) }, today), "Day 10 · 26/10/2026");
  });

  it("groups upcoming sessions across future days and hides past days", () => {
    const today = "2026-10-24";
    const pastDay = dayWith({
      id: "day-past",
      dayNumber: 7,
      date: "2026-10-23",
      cells: { "batch-9:s1": { code: "M- 7.01", note: "", teachers: ["Md. Sazzad Ali"] } },
    });
    const todayDay = dayWith({
      id: "day-today",
      dayNumber: 8,
      date: "2026-10-24",
      cells: { "batch-9:s1": { code: "M- 7.04", note: "", teachers: ["Md. Sazzad Ali"] } },
    });
    const tomorrowDay = dayWith({
      id: "day-tomorrow",
      dayNumber: 9,
      date: "2026-10-25",
      cells: { "batch-9:s1": { code: "M- 8.01", note: "", teachers: ["Md. Sazzad Ali"] } },
    });
    const laterDay = dayWith({
      id: "day-later",
      dayNumber: 10,
      date: "2026-10-26",
      cells: { "batch-9:s1": { code: "M- 9.05", note: "", teachers: ["Prof. Asisul"] } },
    });
    const batches = [{ id: "batch-9", name: "9th", roster: [] }];
    const groups = upcomingMineGroups(batches, teachers, [pastDay, todayDay, tomorrowDay, laterDay], "teacher-2", "", today);
    assert.equal(groups.length, 2);
    assert.equal(groups[0]?.header, "Today · 24/10/2026");
    assert.equal(groups[0]?.sessions.length, 1);
    assert.equal(groups[0]?.sessions[0]?.module, "M- 7.04");
    assert.equal(groups[1]?.header, "Tomorrow · 25/10/2026");
    assert.equal(groups[1]?.sessions.length, 1);
    assert.equal(groups[1]?.sessions[0]?.module, "M- 8.01");
  });
});
