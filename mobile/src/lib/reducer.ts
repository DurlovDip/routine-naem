import { createDemoState } from "./demo";
import { uid } from "./id";
import { cellKey, sessionSlots } from "./schedule";
import {
  normalizeModuleNumber,
  normalizeSubNumber,
  orderedManagers,
  rosterRange,
  rotateIds,
  sortModuleNumbers,
  sortSubNumbers,
} from "./text";
import { addDays, clampDuration, isClock, isIsoDate } from "./time";
import type {
  AppState,
  Batch,
  BreakSlot,
  CellContent,
  DayPlan,
  Footer,
  HeaderLine,
  HeaderStyle,
  SessionSlot,
  Slot,
} from "./types";

if (typeof globalThis.structuredClone !== "function") {
  globalThis.structuredClone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
}

export type Action =
  | { type: "replace"; state: AppState }
  | { type: "reset-demo" }
  | { type: "set-header-line"; id: string; patch: Partial<Pick<HeaderLine, "text" | "style">> }
  | { type: "add-header-line" }
  | { type: "remove-header-line"; id: string }
  | { type: "move-header-line"; id: string; dir: -1 | 1 }
  | { type: "set-recap-label"; text: string }
  | { type: "set-footer"; patch: Partial<Footer> }
  | { type: "set-footer-line"; index: number; text: string }
  | { type: "add-footer-line" }
  | { type: "remove-footer-line"; index: number }
  | { type: "set-auto-rotate"; value: boolean }
  | { type: "set-show-conflicts"; value: boolean }
  | { type: "set-active-day"; id: string }
  | {
      type: "update-day";
      id: string;
      patch: Partial<Pick<DayPlan, "date" | "dayNumber" | "dayStart" | "recapMin" | "defaultSessionMin">>;
    }
  | { type: "add-session"; dayId: string }
  | { type: "remove-slot"; dayId: string; slotId: string }
  | { type: "move-slot"; dayId: string; slotId: string; dir: -1 | 1 }
  | { type: "set-slot-duration"; dayId: string; slotId: string; durationMin: number }
  | { type: "set-break-label"; dayId: string; slotId: string; label: string }
  | { type: "insert-break"; dayId: string; index: number }
  | { type: "add-batch" }
  | { type: "remove-batch"; id: string }
  | { type: "move-batch"; id: string; dir: -1 | 1 }
  | { type: "rename-batch"; id: string; name: string }
  | { type: "set-batch-student-count"; id: string; count: number }
  | { type: "set-roster"; id: string; roster: string[] }
  | { type: "set-managers"; dayId: string; batchId: string; ids: string[] }
  | { type: "copy-managers"; dayId: string; batchId: string }
  | { type: "set-cell"; dayId: string; batchId: string; sessionId: string; cell: CellContent }
  | { type: "set-span"; dayId: string; batchId: string; sessionId: string; span: number }
  | { type: "add-teacher"; name: string; designation?: string }
  | { type: "rename-teacher"; id: string; name: string }
  | { type: "set-teacher-designation"; id: string; designation: string }
  | { type: "remove-teacher"; id: string }
  | { type: "add-module"; code: string; title: string }
  | { type: "update-module"; id: string; code: string; title: string }
  | { type: "remove-module"; id: string }
  | { type: "add-module-number"; value: string }
  | { type: "remove-module-number"; value: string }
  | { type: "add-sub-number"; value: string }
  | { type: "remove-sub-number"; value: string }
  | { type: "duplicate-day"; dayId: string }
  | { type: "duplicate-day-to-end"; dayId: string }
  | { type: "new-day"; dayId: string }
  | { type: "delete-day"; dayId: string };

function moveItem<T>(list: T[], index: number, dir: -1 | 1): T[] {
  const next = index + dir;
  if (index < 0 || next < 0 || next >= list.length) return list;
  const copy = list.slice();
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  return copy;
}

function withDay(state: AppState, dayId: string, update: (day: DayPlan) => DayPlan): AppState {
  return {
    ...state,
    days: state.days.map((day) => (day.id === dayId ? update(day) : day)),
  };
}

function sanitizeDay(day: DayPlan): DayPlan {
  const sessionIds = new Set(sessionSlots(day.slots).map((slot) => slot.id));
  const order = day.slots.map((slot) => slot.id);
  const merges = day.merges.flatMap((merge) => {
    const ids = merge.sessionIds.filter((id) => sessionIds.has(id));
    if (ids.length < 2) return [];
    const positions = ids.map((id) => order.indexOf(id));
    if (positions.some((position) => position < 0)) return [];
    const sortedPositions = [...positions].sort((a, b) => a - b);
    for (let index = 1; index < sortedPositions.length; index += 1) {
      if (sortedPositions[index] !== sortedPositions[index - 1] + 1) return [];
    }
    if (!sortedPositions.every((position) => day.slots[position]?.kind === "session")) return [];
    const sorted = sortedPositions.map((position) => day.slots[position].id);
    return [{ batchId: merge.batchId, sessionIds: sorted }];
  });
  const cells: DayPlan["cells"] = {};
  for (const [key, value] of Object.entries(day.cells)) {
    const sessionId = key.slice(key.indexOf(":") + 1);
    if (sessionIds.has(sessionId)) cells[key] = value;
  }
  return { ...day, merges, cells };
}

function nextManagers(batches: Batch[], current: Record<string, string[]>, rotate: boolean) {
  const managers: Record<string, string[]> = {};
  for (const batch of batches) {
    const ids = current[batch.id] ?? [];
    managers[batch.id] = rotate ? rotateIds(batch.roster, ids) : [...ids];
  }
  return managers;
}

function cloneDay(day: DayPlan, batches: Batch[], rotate: boolean, empty: boolean): DayPlan {
  const copy = structuredClone(day);
  copy.id = uid("day");
  copy.date = addDays(day.date, 1);
  copy.dayNumber = day.dayNumber + 1;
  copy.managers = nextManagers(batches, day.managers, rotate);
  if (empty) {
    copy.cells = {};
    copy.merges = [];
  }
  return copy;
}

function insertDay(state: AppState, afterId: string, day: DayPlan): AppState {
  const index = state.days.findIndex((item) => item.id === afterId);
  const days = state.days.slice();
  days.splice(index < 0 ? days.length : index + 1, 0, day);
  return { ...state, days, activeDayId: day.id };
}

function stripBatch(day: DayPlan, batchId: string): DayPlan {
  const cells: DayPlan["cells"] = {};
  for (const [key, value] of Object.entries(day.cells)) {
    if (!key.startsWith(`${batchId}:`)) cells[key] = value;
  }
  const managers = { ...day.managers };
  delete managers[batchId];
  return {
    ...day,
    cells,
    managers,
    merges: day.merges.filter((merge) => merge.batchId !== batchId),
  };
}

function setSpan(day: DayPlan, batchId: string, sessionId: string, span: number): DayPlan {
  const start = day.slots.findIndex((slot) => slot.id === sessionId && slot.kind === "session");
  if (start < 0) return day;
  const ids: string[] = [];
  for (let index = start; index < day.slots.length && ids.length < span; index += 1) {
    const slot = day.slots[index];
    if (slot.kind !== "session") break;
    ids.push(slot.id);
  }
  const merges = day.merges.filter(
    (merge) => merge.batchId !== batchId || merge.sessionIds.every((id) => !ids.includes(id)),
  );
  if (ids.length >= 2) merges.push({ batchId, sessionIds: ids });
  return sanitizeDay({ ...day, merges });
}

export function scheduleReducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "replace":
      return action.state;
    case "reset-demo":
      return createDemoState();
    case "set-header-line":
      return {
        ...state,
        header: state.header.map((line) =>
          line.id === action.id ? { ...line, ...action.patch } : line,
        ),
      };
    case "add-header-line":
      return {
        ...state,
        header: [...state.header, { id: uid("line"), text: "", style: "normal" satisfies HeaderStyle }],
      };
    case "remove-header-line":
      if (state.header.length <= 1) return state;
      return { ...state, header: state.header.filter((line) => line.id !== action.id) };
    case "move-header-line": {
      const index = state.header.findIndex((line) => line.id === action.id);
      return { ...state, header: moveItem(state.header, index, action.dir) };
    }
    case "set-recap-label":
      return { ...state, recapLabel: action.text };
    case "set-footer": {
      const updated = { ...state.footer, ...action.patch };
      if (
        "designation" in action.patch ||
        "isCourseCoordinator" in action.patch ||
        "courseName" in action.patch
      ) {
        const des = updated.designation ? updated.designation.trim() : "";
        const isCoord = updated.isCourseCoordinator !== false;
        const line1 = des
          ? (isCoord ? `${des} & Course Coordinator` : des)
          : (isCoord ? "Course Coordinator" : "");
        const line2 = updated.courseName ? updated.courseName.trim() : "";
        updated.lines = [line1, line2].filter(Boolean);
      }
      return { ...state, footer: updated };
    }
    case "set-footer-line":
      return {
        ...state,
        footer: {
          ...state.footer,
          lines: state.footer.lines.map((line, index) => (index === action.index ? action.text : line)),
        },
      };
    case "add-footer-line":
      return { ...state, footer: { ...state.footer, lines: [...state.footer.lines, ""] } };
    case "remove-footer-line":
      return {
        ...state,
        footer: {
          ...state.footer,
          lines: state.footer.lines.filter((_, index) => index !== action.index),
        },
      };
    case "set-auto-rotate":
      return { ...state, autoRotate: action.value };
    case "set-show-conflicts":
      return { ...state, showConflicts: action.value };
    case "set-active-day":
      if (!state.days.some((day) => day.id === action.id)) return state;
      return { ...state, activeDayId: action.id };
    case "update-day":
      return withDay(state, action.id, (day) => {
        const patch = { ...action.patch };
        if (
          patch.date !== undefined &&
          (!isIsoDate(patch.date) || state.days.some((d) => d.id !== action.id && d.date === patch.date))
        ) {
          delete patch.date;
        }
        if (patch.dayStart !== undefined && !isClock(patch.dayStart)) delete patch.dayStart;
        if (patch.dayNumber !== undefined) {
          const num = Math.min(999, Math.max(1, Math.trunc(patch.dayNumber)));
          if (state.days.some((d) => d.id !== action.id && d.dayNumber === num)) {
            delete patch.dayNumber;
          } else {
            patch.dayNumber = num;
          }
        }
        if (patch.recapMin !== undefined) patch.recapMin = clampDuration(patch.recapMin);
        if (patch.defaultSessionMin !== undefined) {
          patch.defaultSessionMin = clampDuration(patch.defaultSessionMin);
        }
        return { ...day, ...patch };
      });
    case "add-session":
      return withDay(state, action.dayId, (day) => {
        if (sessionSlots(day.slots).length >= 10) return day;
        const slot: SessionSlot = {
          id: uid("session"),
          kind: "session",
          durationMin: day.defaultSessionMin || 60,
        };
        return { ...day, slots: [...day.slots, slot] };
      });
    case "remove-slot":
      return withDay(state, action.dayId, (day) => {
        const slot = day.slots.find((item) => item.id === action.slotId);
        if (!slot) return day;
        if (slot.kind === "session" && sessionSlots(day.slots).length <= 1) return day;
        return sanitizeDay({ ...day, slots: day.slots.filter((item) => item.id !== action.slotId) });
      });
    case "move-slot":
      return withDay(state, action.dayId, (day) => {
        const index = day.slots.findIndex((slot) => slot.id === action.slotId);
        return sanitizeDay({ ...day, slots: moveItem(day.slots, index, action.dir) });
      });
    case "set-slot-duration":
      return withDay(state, action.dayId, (day) => ({
        ...day,
        slots: day.slots.map((slot) =>
          slot.id === action.slotId ? { ...slot, durationMin: clampDuration(action.durationMin) } : slot,
        ),
      }));
    case "set-break-label":
      return withDay(state, action.dayId, (day) => ({
        ...day,
        slots: day.slots.map((slot) =>
          slot.id === action.slotId && slot.kind === "break" ? { ...slot, label: action.label } : slot,
        ),
      }));
    case "insert-break":
      return withDay(state, action.dayId, (day) => {
        const slot: BreakSlot = {
          id: uid("break"),
          kind: "break",
          label: "Break",
          durationMin: 30,
        };
        const slots: Slot[] = day.slots.slice();
        const index = Math.max(0, Math.min(action.index, slots.length));
        slots.splice(index, 0, slot);
        return sanitizeDay({ ...day, slots });
      });
    case "add-batch": {
      const lastNum = state.batches.reduce((max, b) => {
        const n = parseInt(b.id.replace(/\D/g, ""), 10);
        return isNaN(n) ? max : Math.max(max, n);
      }, 0);
      const nextNum = lastNum > 0 ? lastNum + 1 : state.batches.length + 1;
      const batch: Batch = {
        id: `batch-${nextNum}`,
        name: "", // by default blank
        numberOfStudents: 40,
        roster: rosterRange(1, 40),
      };
      return {
        ...state,
        batches: [...state.batches, batch],
        days: state.days.map((day) => ({
          ...day,
          managers: { ...day.managers, [batch.id]: [] },
        })),
      };
    }
    case "remove-batch":
      return {
        ...state,
        batches: state.batches.filter((batch) => batch.id !== action.id),
        days: state.days.map((day) => stripBatch(day, action.id)),
      };
    case "move-batch": {
      const index = state.batches.findIndex((batch) => batch.id === action.id);
      return { ...state, batches: moveItem(state.batches, index, action.dir) };
    }
    case "rename-batch":
      return {
        ...state,
        batches: state.batches.map((batch) =>
          batch.id === action.id ? { ...batch, name: action.name } : batch,
        ),
      };
    case "set-batch-student-count": {
      const count = Math.max(1, Math.min(200, action.count));
      return {
        ...state,
        batches: state.batches.map((batch) => {
          if (batch.id !== action.id) return batch;
          return {
            ...batch,
            numberOfStudents: count,
            roster: rosterRange(1, count),
          };
        }),
      };
    }
    case "set-roster":
      return {
        ...state,
        batches: state.batches.map((batch) =>
          batch.id === action.id ? { ...batch, roster: action.roster } : batch,
        ),
        days: state.days.map((day) => ({
          ...day,
          managers: {
            ...day.managers,
            [action.id]: (day.managers[action.id] ?? []).filter((id) => action.roster.includes(id)),
          },
        })),
      };
    case "set-managers":
      return withDay(state, action.dayId, (day) => ({
        ...day,
        managers: { ...day.managers, [action.batchId]: action.ids },
      }));
    case "copy-managers":
      return withDay(state, action.dayId, (day) => {
        const ids = day.managers[action.batchId] ?? [];
        const managers = { ...day.managers };
        for (const batch of state.batches) {
          managers[batch.id] = orderedManagers(
            batch.roster,
            ids.filter((id) => batch.roster.includes(id)),
          );
        }
        return { ...day, managers };
      });
    case "set-cell":
      return withDay(state, action.dayId, (day) => ({
        ...day,
        cells: { ...day.cells, [cellKey(action.batchId, action.sessionId)]: action.cell },
      }));
    case "set-span":
      return withDay(state, action.dayId, (day) =>
        setSpan(day, action.batchId, action.sessionId, action.span),
      );
    case "add-teacher": {
      const name = action.name.trim();
      if (!name) return state;
      if (state.teachers.some((teacher) => teacher.name.toLowerCase() === name.toLowerCase())) {
        return state;
      }
      return {
        ...state,
        teachers: [
          ...state.teachers,
          { id: uid("teacher"), name, designation: action.designation?.trim() || "" },
        ],
      };
    }
    case "set-teacher-designation": {
      return {
        ...state,
        teachers: state.teachers.map((teacher) =>
          teacher.id === action.id ? { ...teacher, designation: action.designation } : teacher,
        ),
      };
    }
    case "rename-teacher": {
      const current = state.teachers.find((teacher) => teacher.id === action.id);
      const name = action.name.trim();
      if (!current || !name) return state;
      return {
        ...state,
        teachers: state.teachers.map((teacher) =>
          teacher.id === action.id ? { ...teacher, name } : teacher,
        ),
        days: state.days.map((day) => ({
          ...day,
          cells: Object.fromEntries(
            Object.entries(day.cells).map(([key, content]) => [
              key,
              {
                ...content,
                teachers: content.teachers.map((teacher) => (teacher === current.name ? name : teacher)),
              },
            ]),
          ),
        })),
      };
    }
    case "remove-teacher":
      return { ...state, teachers: state.teachers.filter((teacher) => teacher.id !== action.id) };
    case "add-module": {
      const code = action.code.trim();
      if (!code) return state;
      const title = action.title.trim();
      const exists = state.modules.some(
        (module) => module.code === code && module.title.trim() === title,
      );
      if (exists) return state;
      return { ...state, modules: [...state.modules, { id: uid("module"), code, title }] };
    }
    case "update-module":
      return {
        ...state,
        modules: state.modules.map((module) =>
          module.id === action.id ? { ...module, code: action.code, title: action.title } : module,
        ),
      };
    case "remove-module":
      return { ...state, modules: state.modules.filter((module) => module.id !== action.id) };
    case "add-module-number": {
      const value = normalizeModuleNumber(action.value);
      if (!value || state.moduleNumbers.includes(value)) return state;
      return { ...state, moduleNumbers: sortModuleNumbers([...state.moduleNumbers, value]) };
    }
    case "remove-module-number":
      return {
        ...state,
        moduleNumbers: state.moduleNumbers.filter((item) => item !== action.value),
      };
    case "add-sub-number": {
      const value = normalizeSubNumber(action.value);
      if (!value || state.subNumbers.includes(value)) return state;
      return { ...state, subNumbers: sortSubNumbers([...state.subNumbers, value]) };
    }
    case "remove-sub-number":
      return { ...state, subNumbers: state.subNumbers.filter((item) => item !== action.value) };
    case "duplicate-day": {
      const day = state.days.find((item) => item.id === action.dayId);
      if (!day) return state;
      const targetDate = addDays(day.date, 1);
      const targetDayNum = day.dayNumber + 1;
      if (state.days.some((d) => d.date === targetDate || d.dayNumber === targetDayNum)) {
        return state;
      }
      return insertDay(state, day.id, cloneDay(day, state.batches, state.autoRotate, false));
    }
    case "duplicate-day-to-end": {
      const day = state.days.find((item) => item.id === action.dayId);
      if (!day) return state;
      const maxDayNum = Math.max(...state.days.map((d) => d.dayNumber), 0);
      const maxDate = state.days.reduce((max, d) => (d.date > max ? d.date : max), day.date);
      let nextDate = addDays(maxDate, 1);
      while (state.days.some((d) => d.date === nextDate)) {
        nextDate = addDays(nextDate, 1);
      }
      const newDay = cloneDay(day, state.batches, state.autoRotate, false);
      newDay.date = nextDate;
      newDay.dayNumber = maxDayNum + 1;
      return {
        ...state,
        days: [...state.days, newDay],
        activeDayId: newDay.id,
      };
    }
    case "new-day": {
      const day = state.days.find((item) => item.id === action.dayId);
      if (!day) return state;
      const targetDate = addDays(day.date, 1);
      const targetDayNum = day.dayNumber + 1;
      if (state.days.some((d) => d.date === targetDate || d.dayNumber === targetDayNum)) {
        return state;
      }
      return insertDay(state, day.id, cloneDay(day, state.batches, state.autoRotate, true));
    }
    case "delete-day": {
      if (state.days.length <= 1) return state;
      const index = state.days.findIndex((day) => day.id === action.dayId);
      if (index < 0) return state;
      const days = state.days.filter((day) => day.id !== action.dayId);
      const activeDayId =
        state.activeDayId === action.dayId ? days[Math.max(0, index - 1)].id : state.activeDayId;
      return { ...state, days, activeDayId };
    }
    default:
      return state;
  }
}
