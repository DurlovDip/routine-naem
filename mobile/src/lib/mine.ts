import { buildTimeline, rowCells } from "./schedule";
import { batchLines, formatModule, sessionSpanLabel } from "./text";
import { formatDayNumber } from "./time";
import type { Batch, DayPlan, Teacher } from "./types";

export type MySession = {
  key: string;
  label: string;
  start: number;
  end: number;
  batchLabel: string;
  module: string;
  coTeachers: string[];
};

function sameTeacher(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/** Name on the course roster for this id. Session cells store names, not ids. */
export function rosterTeacherName(teachers: Teacher[], teacherId: string): string {
  return teachers.find((teacher) => teacher.id === teacherId)?.name.trim() ?? "";
}

/**
 * The signed-in teacher's sessions on this day, across every batch, in time order.
 * A roster hit uses that id's name. A missing roster row falls back to the display name.
 */
export function mySessions(
  batches: Batch[],
  teachers: Teacher[],
  day: DayPlan,
  teacherId: string,
  fallbackName = "",
): MySession[] {
  const name = rosterTeacherName(teachers, teacherId) || fallbackName.trim();
  if (!name) return [];
  const timeline = buildTimeline(day);
  const items: MySession[] = [];
  for (const batch of batches) {
    for (const cell of rowCells(day, batch.id)) {
      if (cell.kind !== "session") continue;
      const listed = cell.content.teachers.map((teacher) => teacher.trim()).filter(Boolean);
      if (!listed.some((teacher) => sameTeacher(teacher, name))) continue;
      const timed = cell.sessionIds
        .map((id) => timeline.slots.find((slot) => slot.id === id))
        .filter((slot) => slot && slot.kind === "session");
      const start = timed[0]?.start ?? 0;
      const end = timed.length > 0 ? timed[timed.length - 1]!.end : start;
      items.push({
        key: `${batch.id}:${cell.anchorId}`,
        label: sessionSpanLabel(cell.numbers),
        start,
        end,
        batchLabel: batchLines(batch.name, batch.id).join(" "),
        module: formatModule(cell.content.code, cell.content.note),
        coTeachers: listed.filter((teacher) => !sameTeacher(teacher, name)),
      });
    }
  }
  items.sort((a, b) => a.start - b.start || a.end - b.end || a.batchLabel.localeCompare(b.batchLabel));
  return items;
}

export function mineEmptyLabel(dayNumber: number): string {
  return `No sessions for you on ${formatDayNumber(dayNumber).replace("Day – ", "Day ")}`;
}
