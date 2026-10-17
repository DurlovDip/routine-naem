import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { createDemoState } from "./mockData";
import { buildScheduleDocument } from "../src/lib/docx";
import { normalizeState } from "../src/lib/storage";
import { scheduleReducer } from "../src/lib/reducer";
import {
  buildTimeline,
  describeRow,
  findConflicts,
  sessionsContiguous,
} from "../src/lib/schedule";
import { batchLines, formatModuleCode, joinWithAnd, parseModuleCode, rotateIds } from "../src/lib/text";
import { formatClock, formatSignatureDate, toIsoDate, weekdayName } from "../src/lib/time";

describe("demo day", () => {
  const state = createDemoState();
  const day = state.days[0];

  it("is Sunday 18 October 2026, day 07", () => {
    expect(day.date).toBe("2026-10-18");
    expect(day.dayNumber).toBe(7);
    expect(weekdayName(day.date)).toBe("Sunday");
  });

  it("cascades the printed times", () => {
    const timeline = buildTimeline(day);
    const ranges = [timeline.recap, ...timeline.slots].map(
      (slot) => `${formatClock(slot.start)} - ${formatClock(slot.end)}`,
    );
    expect(ranges).toEqual([
      "09.00 - 09.30",
      "09.30 - 10.30",
      "10.30 - 11.00",
      "11.00 - 12.00",
      "12.00 - 01.00",
      "01.00 - 02.00",
      "02.00 - 03.00",
      "03.00 - 04.00",
    ]);
  });

  it("merges the 9th batch across session 2–3 and 4–5", () => {
    expect(describeRow(day, "batch-9")).toEqual([
      "1:M- 7.04 (Theory)",
      "break:Tea Break",
      "2:M- 7.04 TPP (Theory & Practice)",
      "break:Prayer & Lunch Break",
      "2:M- 7.04 (Practice & Presentation)",
    ]);
  });

  it("keeps the other batches as five separate sessions", () => {
    for (const batchId of ["batch-10", "batch-11", "batch-12", "batch-13"]) {
      const sessions = describeRow(day, batchId).filter((item) => item.startsWith("1:"));
      expect(sessions).toHaveLength(5);
    }
  });

  it("has no teacher clashes on the sample day", () => {
    expect(findConflicts(state.batches, day)).toEqual([]);
  });

  it("splits a module into number and sub-number", () => {
    expect(parseModuleCode("M- 7.04")).toEqual({ moduleNumber: "M-7", subNumber: ".04" });
    expect(formatModuleCode("M-7", ".04")).toBe("M- 7.04");
    expect(formatModuleCode("M-3", ".06")).toBe("M- 3.06");
    expect(state.moduleNumbers).toContain("M-7");
    expect(state.subNumbers).toContain(".04");
  });

  it("round-trips through JSON import", () => {
    const again = normalizeState(JSON.parse(JSON.stringify(state)));
    expect(again?.footer.name).toBe("Dr. Litan Kanti Halder");
    expect(again?.days[0].cells["batch-9:s4"]?.teachers).toEqual([
      "Mst. Arifa Tazrimin",
      "Md. Jahangir Alom",
    ]);
    expect(again?.activeDayId).toBe("day-07");
  });
});

describe("rotation, merges and clashes", () => {
  const roster = Array.from({ length: 30 }, (_, index) => String(index + 1).padStart(2, "0"));

  it("joins names the way the sheet does", () => {
    expect(joinWithAnd(["Prof. Asisul"])).toBe("Prof. Asisul");
    expect(joinWithAnd(["Mst. Arifa Tazrimin", "Md. Jahangir Alom"])).toBe(
      "Mst. Arifa Tazrimin & Md. Jahangir Alom",
    );
    expect(joinWithAnd(["Prof. Asisul", "Md. Sazzad Ali", "Muhammad Yeakub Ali"])).toBe(
      "Prof. Asisul, Md. Sazzad Ali & Muhammad Yeakub Ali",
    );
  });

  it("rotates day managers to the next ids and wraps the roster", () => {
    expect(rotateIds(roster, ["09", "10"])).toEqual(["11", "12"]);
    expect(rotateIds(roster, ["29", "30"])).toEqual(["01", "02"]);
    expect(rotateIds(roster, ["30"])).toEqual(["01"]);
  });

  it("refuses a merge that would cross a break", () => {
    const day = createDemoState().days[0];
    expect(sessionsContiguous(day.slots, ["s2", "s3"])).toBe(true);
    expect(sessionsContiguous(day.slots, ["s4", "s5"])).toBe(true);
    expect(sessionsContiguous(day.slots, ["s1", "s2"])).toBe(false);
    expect(sessionsContiguous(day.slots, ["s3", "s4"])).toBe(false);
  });

  it("formats afternoon hours on a 12-hour clock", () => {
    expect(formatClock(9 * 60)).toBe("09.00");
    expect(formatClock(12 * 60)).toBe("12.00");
    expect(formatClock(13 * 60)).toBe("01.00");
    expect(formatClock(16 * 60)).toBe("04.00");
  });

  it("flags one teacher in two batches, including inside a merged span", () => {
    const state = createDemoState();
    const day = structuredClone(state.days[0]);
    day.cells["batch-10:s3"] = { code: "M- 8.08", note: "", teachers: ["Prof. Asisul"] };
    const conflicts = findConflicts(state.batches, day);
    expect(conflicts.some((item) => item.teacher === "Prof. Asisul" && item.sessionNumber === 3)).toBe(
      true,
    );
    expect(
      conflicts.some(
        (item) =>
          item.sessionNumber === 2 &&
          item.teacher === "Prof. Asisul" &&
          item.batchIds.includes("batch-10"),
      ),
    ).toBe(false);
  });

  it("duplicates the day, advances the date and rotates managers", () => {
    const next = scheduleReducer(createDemoState(), { type: "duplicate-day", dayId: "day-07" });
    expect(next.days).toHaveLength(2);
    const copy = next.days[1];
    expect(copy.date).toBe("2026-10-19");
    expect(copy.dayNumber).toBe(8);
    expect(weekdayName(copy.date)).toBe("Monday");
    expect(copy.managers["batch-9"]).toEqual(["11", "12"]);
    expect(copy.cells["batch-9:s2"]?.teachers).toEqual([
      "Prof. Asisul",
      "Md. Sazzad Ali",
      "Muhammad Yeakub Ali",
    ]);
  });

  it("exports a Word table with the sheet merges", async () => {
    const state = createDemoState();
    const buffer = await Packer.toBuffer(buildScheduleDocument(state, state.days[0]));
    const zip = await JSZip.loadAsync(buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    expect(xml).toBeTruthy();
    const spans = xml?.match(/w:gridSpan w:val="2"/g) ?? [];
    expect(spans.length).toBeGreaterThanOrEqual(2);
    expect(xml).toContain("w:vMerge");
    expect(xml).toContain("Tea Break");
    expect(xml).toContain("Prayer &amp; Lunch Break");
    expect(xml).toContain("M- 7.04 (Theory)");
    expect(xml).toContain("Prof. Asisul");
    expect(xml).toContain("Day – 07");
    expect(xml).toContain("Dr. Litan Kanti Halder");
    expect(xml?.match(/Tea Break/g)).toHaveLength(1);
  });

  it("prints batch names as a number over the word Batch", () => {
    expect(batchLines("9th Batch")).toEqual(["9th", "Batch"]);
    expect(batchLines("9th")).toEqual(["9th", "Batch"]);
  });

  it("creates a new batch with blank name, next ordinal ID, and default 40 students", () => {
    const next = scheduleReducer(createDemoState(), { type: "add-batch" });
    const added = next.batches.at(-1);
    expect(added?.name).toBe("");
    expect(added?.id).toBe("batch-14");
    expect(added?.numberOfStudents).toBe(40);
    expect(added?.roster).toHaveLength(40);
  });

  it("stops at 10 sessions", () => {
    let state = createDemoState();
    for (let count = 0; count < 8; count += 1) {
      state = scheduleReducer(state, { type: "add-session", dayId: "day-07" });
    }
    const sessions = state.days[0].slots.filter((slot) => slot.kind === "session");
    expect(sessions).toHaveLength(10);
  });

  it("converts signature dates between ISO calendar format and DD.MM.YY format", () => {
    expect(toIsoDate("17.10.26")).toBe("2026-10-17");
    expect(toIsoDate("17/10/2026")).toBe("2026-10-17");
    expect(toIsoDate("2026-10-17")).toBe("2026-10-17");
    expect(formatSignatureDate("2026-10-17")).toBe("17.10.26");
    expect(formatSignatureDate("17.10.26")).toBe("17.10.26");
    expect(formatSignatureDate("2026-05-09")).toBe("09.05.26");
  });

  it("handles teacher designation assignment and addition", () => {
    let state = createDemoState();
    const t0 = state.teachers[0];
    state = scheduleReducer(state, {
      type: "set-teacher-designation",
      id: t0.id,
      designation: "Deputy Director",
    });
    expect(state.teachers.find((t) => t.id === t0.id)?.designation).toBe("Deputy Director");

    state = scheduleReducer(state, {
      type: "add-teacher",
      name: "Dr. New Professor",
      designation: "Professor",
    });
    const added = state.teachers.find((t) => t.name === "Dr. New Professor");
    expect(added).toBeDefined();
    expect(added?.designation).toBe("Professor");
  });

  it("syncs footer lines with designation, course coordinator checkbox, and course name", () => {
    let state = createDemoState();
    state = scheduleReducer(state, {
      type: "set-footer",
      patch: {
        designation: "Deputy Director",
        isCourseCoordinator: true,
        courseName: "14th ACSD Course",
      },
    });
    expect(state.footer.designation).toBe("Deputy Director");
    expect(state.footer.isCourseCoordinator).toBe(true);
    expect(state.footer.courseName).toBe("14th ACSD Course");
    expect(state.footer.lines).toEqual([
      "Deputy Director & Course Coordinator",
      "14th ACSD Course",
    ]);
  });

  it("prevents creating duplicate days when next day already exists", () => {
    let state = createDemoState(); // starts with day-07 (2026-10-18, day 7)
    state = scheduleReducer(state, { type: "duplicate-day", dayId: "day-07" });
    expect(state.days).toHaveLength(2);
    expect(state.days[1].dayNumber).toBe(8);
    expect(state.days[1].date).toBe("2026-10-19");

    // Attempting to duplicate Day 7 AGAIN when Day 8 already exists MUST NOT create a duplicate Day 8
    const duplicatedAgain = scheduleReducer(state, { type: "duplicate-day", dayId: "day-07" });
    expect(duplicatedAgain.days).toHaveLength(2); // still 2! No 3rd day created!

    // Attempting to create blank next day from Day 7 when Day 8 already exists MUST NOT create duplicate
    const blankAgain = scheduleReducer(state, { type: "new-day", dayId: "day-07" });
    expect(blankAgain.days).toHaveLength(2); // still 2!
  });

  it("duplicates day to the end of routine with unique sequential number and date", () => {
    let state = createDemoState(); // day-07 (2026-10-18, day 7)
    state = scheduleReducer(state, { type: "duplicate-day", dayId: "day-07" }); // creates day 8 (2026-10-19)
    expect(state.days).toHaveLength(2);

    // Now on Day 7, duplicate to end:
    state = scheduleReducer(state, { type: "duplicate-day-to-end", dayId: "day-07" });
    expect(state.days).toHaveLength(3);
    const day9 = state.days[2];
    expect(day9.dayNumber).toBe(9);
    expect(day9.date).toBe("2026-10-20");
  });

  it("prevents updating a day to a conflicting date or dayNumber", () => {
    let state = createDemoState();
    state = scheduleReducer(state, { type: "duplicate-day", dayId: "day-07" }); // day 7 and day 8
    const day8Id = state.days[1].id;

    // Trying to set day 8's date to day 7's date (2026-10-18)
    const updated = scheduleReducer(state, {
      type: "update-day",
      id: day8Id,
      patch: { date: "2026-10-18" },
    });
    // Date was rejected and preserved as 2026-10-19
    expect(updated.days[1].date).toBe("2026-10-19");

    // Trying to set day 8's dayNumber to 7
    const updatedNum = scheduleReducer(state, {
      type: "update-day",
      id: day8Id,
      patch: { dayNumber: 7 },
    });
    // Day number was rejected and preserved as 8
    expect(updatedNum.days[1].dayNumber).toBe(8);
  });

  it("normalizeState automatically repairs duplicate days from corrupt data", () => {
    const corruptState = createDemoState();
    const day8 = { ...corruptState.days[0], id: "day-08-a", dayNumber: 8, date: "2026-10-19" };
    const duplicateDay8 = { ...corruptState.days[0], id: "day-08-b", dayNumber: 8, date: "2026-10-19" };
    corruptState.days = [corruptState.days[0], day8, duplicateDay8];

    const normalized = normalizeState(corruptState);
    expect(normalized).not.toBeNull();
    expect(normalized?.days).toHaveLength(3);
    expect(normalized?.days[0].dayNumber).toBe(7);
    expect(normalized?.days[0].date).toBe("2026-10-18");
    expect(normalized?.days[1].dayNumber).toBe(8);
    expect(normalized?.days[1].date).toBe("2026-10-19");
    // Duplicate day 8 was automatically advanced to day 9 with date 2026-10-20
    expect(normalized?.days[2].dayNumber).toBe(9);
    expect(normalized?.days[2].date).toBe("2026-10-20");
  });
});



