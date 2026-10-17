import { createDemoState } from "./demo";
import type { AppState, DayPlan, Footer, HeaderLine } from "./types";

const KEY = "acsd-daily-schedule-v1";

function repairDay(value: unknown): DayPlan | null {
  if (!value || typeof value !== "object") return null;
  const day = value as Partial<DayPlan>;
  if (typeof day.id !== "string" || typeof day.date !== "string" || !Array.isArray(day.slots)) {
    return null;
  }
  return {
    id: day.id,
    date: day.date,
    dayNumber: typeof day.dayNumber === "number" ? day.dayNumber : 1,
    dayStart: typeof day.dayStart === "string" ? day.dayStart : "09:00",
    recapMin: typeof day.recapMin === "number" ? day.recapMin : 30,
    defaultSessionMin: typeof day.defaultSessionMin === "number" ? day.defaultSessionMin : 60,
    slots: day.slots,
    managers: day.managers && typeof day.managers === "object" ? day.managers : {},
    cells: day.cells && typeof day.cells === "object" ? day.cells : {},
    merges: Array.isArray(day.merges) ? day.merges : [],
  };
}

export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<AppState>;
  if (!Array.isArray(value.days) || !Array.isArray(value.batches)) return null;
  const days = value.days.map(repairDay).filter((day): day is DayPlan => day !== null);
  if (days.length === 0) return null;
  const demo = createDemoState();
  const header = Array.isArray(value.header) ? (value.header as HeaderLine[]) : demo.header;
  const footer = {
    ...demo.footer,
    ...(value.footer && typeof value.footer === "object" ? (value.footer as Partial<Footer>) : {}),
  };
  const active = days.some((day) => day.id === value.activeDayId) ? value.activeDayId! : days[0].id;
  return {
    version: 1,
    header: header.length > 0 ? header : demo.header,
    recapLabel: typeof value.recapLabel === "string" ? value.recapLabel : demo.recapLabel,
    batches: value.batches,
    teachers: Array.isArray(value.teachers) ? value.teachers : [],
    modules: Array.isArray(value.modules) ? value.modules : [],
    days,
    activeDayId: active,
    autoRotate: Boolean(value.autoRotate),
    showConflicts: value.showConflicts !== false,
    footer,
  };
}

export function loadState(): AppState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(filename: string, href: string) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
}

export function exportJson(state: AppState) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  downloadBlob("daily-schedule.json", url);
  URL.revokeObjectURL(url);
}

export async function readSignatureFile(file: File): Promise<string> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxWidth = 900;
    const scale = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/png");
  } catch {
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }
}
