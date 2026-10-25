import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { generateScheduleGrid, applyGeneratedGridToDay } from "../mobile/src/tools/scheduleAlgorithm.ts";
import type { DayPlan } from "../mobile/src/lib/types.ts";

describe("routine generator algorithm", () => {
  const batches = [
    { id: "b1", name: "Batch 1" },
    { id: "b2", name: "Batch 2" },
    { id: "b3", name: "Batch 3" },
    { id: "b4", name: "Batch 4" },
    { id: "b5", name: "Batch 5" },
  ];

  const teachers = [
    { id: "t1", name: "Dr. Litan Kanti Halder" },
    { id: "t2", name: "Dr. Nuruzzaman" },
    { id: "t3", name: "Mr. Ariful" },
    { id: "t4", name: "Dr. Rahman" },
    { id: "t5", name: "Mr. Ali" },
    { id: "t6", name: "Dr. Ayet" },
  ];

  it("generates 5-session 5-batch routine with no teacher assigned twice in the same session", () => {
    // All teachers fully available (all 5 sessions true)
    const availability: Record<string, boolean[]> = {};
    teachers.forEach((t) => {
      availability[t.id] = [true, true, true, true, true];
    });

    const result = generateScheduleGrid({
      sessionCount: 5,
      batches,
      selectedTeachers: teachers,
      availability,
    });

    assert.equal(result.totalSlots, 25);
    assert.equal(result.assignedSlots, 25);
    assert.equal(result.unassignedSlots, 0);

    // Verify each session has zero teacher collision
    for (let s = 0; s < 5; s++) {
      const sessionAssignments = result.assignments.filter((a) => a.sessionIndex === s);
      assert.equal(sessionAssignments.length, 5);

      const assignedTeachers = sessionAssignments.map((a) => a.teacherId).filter(Boolean);
      const uniqueTeachers = new Set(assignedTeachers);
      assert.equal(uniqueTeachers.size, assignedTeachers.length);
    }
  });

  it("strictly honors teacher unavailability when session is unchecked", () => {
    // Dr. Litan (t1) is busy in session 2 (index 1) and session 4 (index 3)
    const availability: Record<string, boolean[]> = {};
    teachers.forEach((t) => {
      availability[t.id] = [true, true, true, true, true];
    });
    availability["t1"] = [true, false, true, false, true];

    const result = generateScheduleGrid({
      sessionCount: 5,
      batches,
      selectedTeachers: teachers,
      availability,
    });

    // Check Dr. Litan was never assigned in session index 1 or 3
    const litanInS2 = result.assignments.find((a) => a.teacherId === "t1" && a.sessionIndex === 1);
    const litanInS4 = result.assignments.find((a) => a.teacherId === "t1" && a.sessionIndex === 3);

    assert.equal(litanInS2, undefined);
    assert.equal(litanInS4, undefined);
  });

  it("applies assignments to DayPlan preserving existing structure and leaving module code for manual choice", () => {
    const dummyDay: DayPlan = {
      id: "day-1",
      date: "2026-10-25",
      dayNumber: 1,
      dayStart: "09:00",
      recapMin: 15,
      defaultSessionMin: 60,
      slots: [
        { id: "s1", kind: "session", durationMin: 60 },
        { id: "s2", kind: "session", durationMin: 60 },
      ],
      managers: {},
      cells: {},
      merges: [],
    };

    const assignments = [
      {
        batchId: "b1",
        batchName: "Batch 1",
        sessionIndex: 0,
        sessionId: "s1",
        teacherId: "t1",
        teacherName: "Dr. Litan Kanti Halder",
      },
      {
        batchId: "b2",
        batchName: "Batch 2",
        sessionIndex: 0,
        sessionId: "s1",
        teacherId: "t2",
        teacherName: "Dr. Nuruzzaman",
      },
    ];

    const updated = applyGeneratedGridToDay({
      day: dummyDay,
      assignments,
      sessionCount: 5,
    });

    assert.equal(updated.slots.filter((s) => s.kind === "session").length, 5);
    assert.deepEqual(updated.cells["b1:s1"]?.teachers, ["Dr. Litan Kanti Halder"]);
    assert.equal(updated.cells["b1:s1"]?.code, ""); // Module code is manual for now
  });

  it("tries not to give the same teacher to the same batch more than once", () => {
    // 5 batches, 5 teachers, 5 sessions
    const fiveTeachers = teachers.slice(0, 5);
    const availability: Record<string, boolean[]> = {};
    fiveTeachers.forEach((t) => {
      availability[t.id] = [true, true, true, true, true];
    });

    const result = generateScheduleGrid({
      sessionCount: 5,
      batches,
      selectedTeachers: fiveTeachers,
      availability,
    });

    // Check each batch: every teacher in this batch should be unique!
    for (const batch of batches) {
      const batchAssignments = result.assignments.filter((a) => a.batchId === batch.id);
      const assignedTeachers = batchAssignments.map((a) => a.teacherId);
      const uniqueTeachers = new Set(assignedTeachers);

      // 5 distinct teachers for 5 sessions in this batch!
      assert.equal(
        uniqueTeachers.size,
        5,
        `Batch ${batch.name} has repeat teachers: ${assignedTeachers.join(", ")}`,
      );
    }
  });

  it("exposes the routine generator button as an icon outside the day manager container", () => {
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    assert.match(editor, /testID="open-routine-generator"/);
    assert.match(editor, /RoutineGeneratorModal/);
    assert.match(editor, /routineGenBtn/);
    // Button is icon only (no text inside button)
    assert.doesNotMatch(editor, /<T[^>]*>\s*Routine Generator\s*<\/T>/);
    // Button is outside the Managers card container
    assert.match(editor, /<View style=\{\[\{\s*flex:\s*1\s*\}, card\]\}>\s*<Managers/);

    const modal = readFileSync(new URL("../mobile/src/RoutineGeneratorModal.tsx", import.meta.url), "utf8");
    assert.match(modal, /Select teachers joining this routine/);
    assert.match(modal, /When Free|when.*free/i);
    assert.match(modal, /Apply to Day.*Routine/);

    const tool = readFileSync(new URL("../mobile/src/tools/RoutineGenerator.tsx", import.meta.url), "utf8");
    assert.match(tool, /Select Teachers Joining Today/);
    assert.match(tool, /When Are Teachers Free\?/);
    assert.match(tool, /applyGeneratedGridToDay/);
  });

  it("exposes the drafted routine table view button on the right side of the generator button", () => {
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    // Verify drafted routine table view button is next to routine generator
    assert.match(editor, /testID="open-draft-preview"/);
    assert.match(editor, /accessibilityLabel="View drafted routine table"/);
    assert.match(editor, /name="grid-outline"/);
    assert.match(editor, /<DraftRoutineModal/);

    const draftModal = readFileSync(new URL("../mobile/src/DraftRoutineModal.tsx", import.meta.url), "utf8");
    assert.match(draftModal, /Draft Routine Table/);
    assert.match(draftModal, /testID="draft-table-view"/);
    assert.match(draftModal, /testID="draft-view-table-btn"/);
    assert.match(draftModal, /testID="draft-view-cards-btn"/);
    assert.match(draftModal, /testID="close-draft-preview"/);
    assert.match(draftModal, /function DraftTable/);
  });
});
