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
import { addDays, clampDuration, isClock, isIsoDate, todayInDhaka } from "./time";
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
  | { type: "add-batch"; id?: string; name?: string; count?: number }
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
  | { type: "add-day"; dayId?: string; dayNumber?: number; date?: string }
  | { type: "delete-day"; dayId: string }
  | { type: "publish-day"; dayId?: string };

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

function cascadeManagersForward(
  days: DayPlan[],
  startIndex: number,
  batches: Batch[],
  batchId?: string,
): DayPlan[] {
  const sourceDay = days[startIndex];
  if (!sourceDay) return days;

  const result = days.map((d) => ({ ...d, managers: { ...d.managers } }));
  const sortedDays = [...result].sort((a, b) => a.dayNumber - b.dayNumber || a.date.localeCompare(b.date));
  const sortedIdx = sortedDays.findIndex((d) => d.id === sourceDay.id);
  if (sortedIdx < 0) return days;

  const targetBatches = batchId ? batches.filter((b) => b.id === batchId) : batches;
  for (let i = sortedIdx + 1; i < sortedDays.length; i += 1) {
    const prevDay = sortedDays[i - 1];
    const currDay = sortedDays[i];

    for (const b of targetBatches) {
      const prev = prevDay.managers[b.id] ?? [];
      if (prev.length > 0) {
        currDay.managers[b.id] = rotateIds(b.roster, prev);
      }
    }
  }

  const managersById = new Map(sortedDays.map((d) => [d.id, d.managers]));
  return result.map((d) => ({ ...d, managers: managersById.get(d.id) ?? d.managers }));
}

function cloneDay(day: DayPlan, batches: Batch[], rotate: boolean, empty: boolean): DayPlan {
  const copy = structuredClone(day);
  copy.id = uid("day");
  copy.date = addDays(day.date, 1);
  copy.dayNumber = day.dayNumber + 1;
  copy.managers = nextManagers(batches, day.managers, rotate);
  copy.isPublished = false;
  copy.publishedAt = undefined;
  copy.publishedSnapshot = undefined;
  if (empty) {
    copy.cells = {};
    copy.merges = [];
  }
  return copy;
}

export function createDaySnapshot(day: DayPlan): DayPlan {
  const { publishedSnapshot, ...rest } = day;
  return {
    ...JSON.parse(JSON.stringify(rest)),
    isPublished: true,
    publishedAt: day.publishedAt ?? new Date().toISOString(),
  };
}

function stableStringify(val: unknown): string {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return `[${val.map(stableStringify).join(",")}]`;
  }
  const keys = Object.keys(val as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((val as Record<string, unknown>)[k])}`).join(",")}}`;
}

/**
 * Checks whether the current draft day has unpublished modifications compared to its published snapshot.
 */
export function isDayDirty(day: DayPlan): boolean {
  if (!day.isPublished || !day.publishedSnapshot) return true;
  const snap = day.publishedSnapshot;
  if (day.date !== snap.date) return true;
  if (day.dayNumber !== snap.dayNumber) return true;
  if (day.dayStart !== snap.dayStart) return true;
  if (day.recapMin !== snap.recapMin) return true;
  if (day.defaultSessionMin !== snap.defaultSessionMin) return true;
  if (stableStringify(day.slots) !== stableStringify(snap.slots)) return true;
  if (stableStringify(day.managers) !== stableStringify(snap.managers)) return true;
  if (stableStringify(day.cells) !== stableStringify(snap.cells)) return true;
  if (stableStringify(day.merges) !== stableStringify(snap.merges)) return true;
  return false;
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
    case "set-auto-rotate": {
      let nextDays = state.days;
      if (action.value && state.days.length > 1) {
        const activeIdx = Math.max(0, state.days.findIndex((d) => d.id === state.activeDayId));
        nextDays = cascadeManagersForward(state.days, activeIdx, state.batches);
      }
      return { ...state, autoRotate: action.value, days: nextDays };
    }
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
    case "publish-day": {
      const targetDayId = action.dayId ?? state.activeDayId;
      const now = new Date().toISOString();
      const updatedDays = state.days.map((d) => {
        if (d.id !== targetDayId) return d;
        const snapshot = createDaySnapshot({
          ...d,
          isPublished: true,
          publishedAt: now,
        });
        return {
          ...d,
          isPublished: true,
          publishedAt: now,
          publishedSnapshot: snapshot,
        };
      });
      return {
        ...state,
        days: updatedDays,
        isPublished: true,
        publishedAt: now,
      };
    }
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
        const fromName = parseInt((b.name ?? "").replace(/\D/g, ""), 10);
        const fromId = parseInt((b.id ?? "").replace(/\D/g, ""), 10);
        const val = !isNaN(fromName) && fromName > 0 ? fromName : (!isNaN(fromId) && fromId > 0 ? fromId : 0);
        return Math.max(max, val);
      }, 0);
      const nextNum = lastNum > 0 ? lastNum + 1 : state.batches.length + 1;
      const newId = action.id ?? `batch-${nextNum}`;
      const newName = action.name !== undefined ? action.name : "";
      const studentCount = typeof action.count === "number" && action.count > 0 ? Math.max(1, Math.min(200, action.count)) : 40;
      const batch: Batch = {
        id: newId,
        name: newName,
        numberOfStudents: studentCount,
        roster: action.count ? rosterRange(1, studentCount) : rosterRange(1, 40),
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
    case "set-managers": {
      const dayIndex = state.days.findIndex((d) => d.id === action.dayId);
      if (dayIndex < 0) return state;
      let nextDays = state.days.map((day) =>
        day.id === action.dayId
          ? { ...day, managers: { ...day.managers, [action.batchId]: action.ids } }
          : day,
      );
      if (state.autoRotate) {
        nextDays = cascadeManagersForward(nextDays, dayIndex, state.batches, action.batchId);
      }
      return { ...state, days: nextDays };
    }
    case "copy-managers": {
      const dayIndex = state.days.findIndex((d) => d.id === action.dayId);
      if (dayIndex < 0) return state;
      const targetDay = state.days[dayIndex];
      const ids = targetDay.managers[action.batchId] ?? [];
      const managers = { ...targetDay.managers };
      for (const batch of state.batches) {
        managers[batch.id] = orderedManagers(
          batch.roster,
          ids.filter((id) => batch.roster.includes(id)),
        );
      }
      let nextDays = state.days.map((day) =>
        day.id === action.dayId ? { ...day, managers } : day,
      );
      if (state.autoRotate) {
        nextDays = cascadeManagersForward(nextDays, dayIndex, state.batches);
      }
      return { ...state, days: nextDays };
    }
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
    case "add-day": {
      const refDay =
        (action.dayId ? state.days.find((item) => item.id === action.dayId) : undefined) ??
        state.days.find((item) => item.id === state.activeDayId) ??
        state.days[state.days.length - 1] ??
        state.days[0];
      if (!refDay) return state;

      const maxDayNum = Math.max(...state.days.map((d) => d.dayNumber), 0);
      const maxDate = state.days.reduce((max, d) => (d.date > max ? d.date : max), refDay.date || todayInDhaka());
      let nextDate = addDays(maxDate, 1);
      while (state.days.some((d) => d.date === nextDate)) {
        nextDate = addDays(nextDate, 1);
      }
      const newDay = cloneDay(refDay, state.batches, state.autoRotate, true);
      newDay.date = action.date && isIsoDate(action.date) && !state.days.some((d) => d.date === action.date)
        ? action.date
        : nextDate;
      newDay.dayNumber = action.dayNumber && Number.isFinite(action.dayNumber) && action.dayNumber >= 1 && !state.days.some((d) => d.dayNumber === action.dayNumber)
        ? action.dayNumber
        : maxDayNum + 1;
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
