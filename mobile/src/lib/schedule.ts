import { formatModule } from "./text";
import { parseTime } from "./time";
import type { Batch, CellContent, DayPlan, Merge, Slot } from "./types";

export type Timed = { start: number; end: number };

export type TimedSession = Timed & {
  kind: "session";
  id: string;
  number: number;
  durationMin: number;
};

export type TimedBreak = Timed & {
  kind: "break";
  id: string;
  label: string;
  durationMin: number;
};

export type TimedSlot = TimedSession | TimedBreak;

export type Timeline = {
  recap: Timed;
  slots: TimedSlot[];
  end: number;
};

export type SheetBreak = { kind: "break"; id: string; label: string };
export type SheetSkip = { kind: "skip" };
export type SheetSession = {
  kind: "session";
  sessionIds: string[];
  span: number;
  anchorId: string;
  content: CellContent;
  numbers: number[];
};
export type SheetCell = SheetBreak | SheetSkip | SheetSession;

export type Conflict = {
  sessionId: string;
  sessionNumber: number;
  teacher: string;
  batchIds: string[];
  batchNames: string[];
};

export function emptyCell(): CellContent {
  return { code: "", note: "", teachers: [] };
}

export function cellKey(batchId: string, sessionId: string): string {
  return `${batchId}:${sessionId}`;
}

export function sessionSlots(slots: Slot[]): Extract<Slot, { kind: "session" }>[] {
  return slots.filter((slot) => slot.kind === "session");
}

export function sessionNumber(slots: Slot[], sessionId: string): number {
  let number = 0;
  for (const slot of slots) {
    if (slot.kind !== "session") continue;
    number += 1;
    if (slot.id === sessionId) return number;
  }
  return 0;
}

export function sessionsContiguous(slots: Slot[], sessionIds: string[]): boolean {
  if (sessionIds.length < 2) return false;
  const positions = sessionIds.map((id) => slots.findIndex((slot) => slot.id === id));
  if (positions.some((position) => position < 0)) return false;
  const sorted = [...positions].sort((a, b) => a - b);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index] !== sorted[index - 1] + 1) return false;
  }
  return sorted.every((position) => slots[position]?.kind === "session");
}

export function maxSpanFrom(slots: Slot[], sessionId: string): number {
  const start = slots.findIndex((slot) => slot.id === sessionId);
  if (start < 0 || slots[start]?.kind !== "session") return 1;
  let count = 1;
  for (let index = start + 1; index < slots.length; index += 1) {
    if (slots[index]?.kind !== "session") break;
    count += 1;
  }
  return count;
}

export function buildTimeline(day: DayPlan): Timeline {
  let cursor = parseTime(day.dayStart);
  const recap = { start: cursor, end: cursor + day.recapMin };
  cursor = recap.end;
  let number = 0;
  const slots: TimedSlot[] = day.slots.map((slot) => {
    const start = cursor;
    const end = cursor + slot.durationMin;
    cursor = end;
    if (slot.kind === "break") {
      return {
        kind: "break",
        id: slot.id,
        label: slot.label,
        durationMin: slot.durationMin,
        start,
        end,
      };
    }
    number += 1;
    return {
      kind: "session",
      id: slot.id,
      number,
      durationMin: slot.durationMin,
      start,
      end,
    };
  });
  return { recap, slots, end: cursor };
}

export function validMerges(day: DayPlan, batchId: string): Merge[] {
  const order = new Map(day.slots.map((slot, index) => [slot.id, index]));
  return day.merges.flatMap((merge) => {
    if (merge.batchId !== batchId) return [];
    const ids = merge.sessionIds.filter((id) => order.has(id));
    if (!sessionsContiguous(day.slots, ids)) return [];
    const sorted = [...ids].sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
    return [{ batchId, sessionIds: sorted }];
  });
}

export function rowCells(day: DayPlan, batchId: string): SheetCell[] {
  const merges = validMerges(day, batchId);
  const covered = new Set<string>();
  for (const merge of merges) {
    for (const id of merge.sessionIds.slice(1)) covered.add(id);
  }
  return day.slots.map((slot) => {
    if (slot.kind === "break") return { kind: "break", id: slot.id, label: slot.label };
    if (covered.has(slot.id)) return { kind: "skip" };
    const merge = merges.find((item) => item.sessionIds[0] === slot.id);
    const sessionIds = merge ? merge.sessionIds : [slot.id];
    return {
      kind: "session",
      sessionIds,
      span: sessionIds.length,
      anchorId: slot.id,
      content: day.cells[cellKey(batchId, slot.id)] ?? emptyCell(),
      numbers: sessionIds.map((id) => sessionNumber(day.slots, id)),
    };
  });
}

export function describeRow(day: DayPlan, batchId: string): string[] {
  return rowCells(day, batchId).flatMap((cell) => {
    if (cell.kind === "skip") return [];
    if (cell.kind === "break") return [`break:${cell.label}`];
    const text = formatModule(cell.content.code, cell.content.note) || "(empty)";
    return [`${cell.span}:${text}`];
  });
}

export function findConflicts(batches: Batch[], day: DayPlan): Conflict[] {
  const timeline = buildTimeline(day);
  const sessions = timeline.slots.filter((slot) => slot.kind === "session");
  const bySession = new Map<string, Map<string, { name: string; batches: Map<string, string> }>>();

  for (const batch of batches) {
    const seen = new Set<string>();
    for (const slot of day.slots) {
      if (slot.kind !== "session" || seen.has(slot.id)) continue;
      const merge = validMerges(day, batch.id).find((item) => item.sessionIds.includes(slot.id));
      const ids = merge ? merge.sessionIds : [slot.id];
      for (const id of ids) seen.add(id);
      const content = day.cells[cellKey(batch.id, ids[0])];
      if (!content) continue;
      for (const raw of content.teachers) {
        const name = raw.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        for (const sessionId of ids) {
          let teachers = bySession.get(sessionId);
          if (!teachers) {
            teachers = new Map();
            bySession.set(sessionId, teachers);
          }
          let entry = teachers.get(key);
          if (!entry) {
            entry = { name, batches: new Map() };
            teachers.set(key, entry);
          }
          entry.batches.set(batch.id, batch.name);
        }
      }
    }
  }

  const conflicts: Conflict[] = [];
  for (const session of sessions) {
    const teachers = bySession.get(session.id);
    if (!teachers) continue;
    for (const entry of teachers.values()) {
      if (entry.batches.size < 2) continue;
      conflicts.push({
        sessionId: session.id,
        sessionNumber: session.number,
        teacher: entry.name,
        batchIds: [...entry.batches.keys()],
        batchNames: [...entry.batches.values()],
      });
    }
  }
  return conflicts;
}

export function cellHasConflict(
  conflicts: Conflict[],
  batchId: string,
  sessionIds: string[],
): boolean {
  return conflicts.some(
    (conflict) => sessionIds.includes(conflict.sessionId) && conflict.batchIds.includes(batchId),
  );
}

export function activeDay(state: { days: DayPlan[]; activeDayId: string }): DayPlan {
  return state.days.find((day) => day.id === state.activeDayId) ?? state.days[0];
}
