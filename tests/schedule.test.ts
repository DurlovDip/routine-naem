import { describe, expect, it } from "vitest";
import { Packer } from "docx";
import JSZip from "jszip";
import { createDemoState } from "../src/lib/demo";
import { buildScheduleDocument } from "../src/lib/docx";
import { normalizeState } from "../src/lib/storage";
import { scheduleReducer } from "../src/lib/reducer";
import {
  buildTimeline,
  describeRow,
  findConflicts,
  sessionsContiguous,
} from "../src/lib/schedule";
import { formatModuleCode, joinWithAnd, parseModuleCode, rotateIds } from "../src/lib/text";
import { formatClock, weekdayName } from "../src/lib/time";

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

  it("stops at 10 sessions", () => {
    let state = createDemoState();
    for (let count = 0; count < 8; count += 1) {
      state = scheduleReducer(state, { type: "add-session", dayId: "day-07" });
    }
    const sessions = state.days[0].slots.filter((slot) => slot.kind === "session");
    expect(sessions).toHaveLength(10);
  });
});
