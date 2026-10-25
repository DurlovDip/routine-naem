import { createDemoState } from "./demo";
import {
  catalogFromModules,
  formatModuleCode,
  normalizeModuleNumber,
  normalizeSubNumber,
  parseModuleCode,
  rosterRange,
  sortModuleNumbers,
  sortSubNumbers,
} from "./text";
import { addDays } from "./time";
import type { AppState, Batch, DayPlan, Footer, HeaderLine, ModuleEntry, Teacher } from "./types";

const KEY = "acsd-daily-schedule-v1";

function repairBatch(value: unknown): Batch | null {
  if (!value || typeof value !== "object") return null;
  const batch = value as Partial<Batch>;
  if (typeof batch.id !== "string") return null;
  const count = typeof batch.numberOfStudents === "number" ? batch.numberOfStudents : 40;
  const roster =
    Array.isArray(batch.roster) && batch.roster.length === count
      ? batch.roster
      : rosterRange(1, count);
  return {
    id: batch.id,
    name: typeof batch.name === "string" ? batch.name : "",
    numberOfStudents: count,
    roster,
  };
}

function repairModule(value: unknown): ModuleEntry | null {
  if (!value || typeof value !== "object") return null;
  const m = value as Partial<ModuleEntry>;
  if (typeof m.id !== "string") return null;
  const parsed = m.code ? parseModuleCode(m.code) : null;
  const mNum = m.moduleNumber ?? (parsed ? parsed.moduleNumber.replace(/^M-/, "") : "");
  const sNum = m.moduleSubnumber ?? (parsed ? parsed.subNumber.replace(/^\./, "") : "");
  const name = m.moduleName ?? m.title ?? "";
  const code = m.code ?? formatModuleCode(mNum, sNum);
  return {
    id: m.id,
    moduleNumber: mNum,
    moduleSubnumber: sNum,
    moduleName: name,
    code,
    title: name,
  };
}

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
    isPublished: typeof day.isPublished === "boolean" ? day.isPublished : false,
    publishedAt: typeof day.publishedAt === "string" ? day.publishedAt : undefined,
    publishedSnapshot: day.publishedSnapshot
      ? repairDay(day.publishedSnapshot) ?? undefined
      : day.isPublished
        ? {
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
            isPublished: true,
            publishedAt: typeof day.publishedAt === "string" ? day.publishedAt : undefined,
          }
        : undefined,
  };
}

function repairTeacher(value: unknown): Teacher | null {
  if (!value || typeof value !== "object") return null;
  const t = value as Partial<Teacher>;
  if (typeof t.id !== "string" || typeof t.name !== "string") return null;
  return {
    id: t.id,
    name: t.name,
    designation: typeof t.designation === "string" ? t.designation : "",
  };
}

export function normalizeState(raw: unknown): AppState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<AppState>;
  if (!Array.isArray(value.days) || !Array.isArray(value.batches)) return null;
  const rawDays = value.days.map(repairDay).filter((day): day is DayPlan => day !== null);
  if (rawDays.length === 0) return null;

  // Deduplicate dates & dayNumbers to prevent duplicate days from being loaded
  const seenDates = new Set<string>();
  const seenNumbers = new Set<number>();
  const days: DayPlan[] = [];

  for (let i = 0; i < rawDays.length; i++) {
    const day = rawDays[i];
    let date = day.date;
    let dayNumber = day.dayNumber;

    if (seenNumbers.has(dayNumber) || dayNumber <= 0) {
      let nextNum = (days[i - 1]?.dayNumber ?? 0) + 1;
      while (seenNumbers.has(nextNum)) {
        nextNum += 1;
      }
      dayNumber = nextNum;
    }
    seenNumbers.add(dayNumber);

    if (seenDates.has(date)) {
      let nextDate = addDays(days[i - 1]?.date ?? date, 1);
      while (seenDates.has(nextDate)) {
        nextDate = addDays(nextDate, 1);
      }
      date = nextDate;
    }
    seenDates.add(date);

    days.push({
      ...day,
      date,
      dayNumber,
    });
  }
  const demo = createDemoState();
  const header = Array.isArray(value.header) ? (value.header as HeaderLine[]) : demo.header;

  const rawFooter = value.footer && typeof value.footer === "object" ? (value.footer as Partial<Footer>) : {};
  let footerDesignation = typeof rawFooter.designation === "string" ? rawFooter.designation : "";
  let isCourseCoordinator =
    typeof rawFooter.isCourseCoordinator === "boolean" ? rawFooter.isCourseCoordinator : true;
  let courseName = typeof rawFooter.courseName === "string" ? rawFooter.courseName : "";

  if (!footerDesignation && Array.isArray(rawFooter.lines) && rawFooter.lines.length > 0) {
    const l1 = rawFooter.lines[0] || "";
    if (l1.includes("& Course Coordinator")) {
      footerDesignation = l1.replace("& Course Coordinator", "").trim();
      isCourseCoordinator = true;
    } else if (l1.includes("Course Coordinator")) {
      footerDesignation = l1.replace("Course Coordinator", "").trim();
      isCourseCoordinator = true;
    } else {
      footerDesignation = l1.trim();
      isCourseCoordinator = false;
    }
    if (!courseName && rawFooter.lines.length > 1) {
      courseName = rawFooter.lines[1] || "";
    }
  }

  const line1 = footerDesignation
    ? (isCourseCoordinator ? `${footerDesignation} & Course Coordinator` : footerDesignation)
    : (isCourseCoordinator ? "Course Coordinator" : "");
  const line2 = courseName;
  const lines = [line1, line2].filter(Boolean);

  const footer: Footer = {
    ...demo.footer,
    ...rawFooter,
    designation: footerDesignation || "Assistant Director",
    isCourseCoordinator,
    courseName,
    lines: lines.length > 0 ? lines : (rawFooter.lines && rawFooter.lines.length > 0 ? rawFooter.lines : demo.footer.lines),
  };

  const active = days.some((day) => day.id === value.activeDayId) ? value.activeDayId! : days[0].id;
  const modules = Array.isArray(value.modules)
    ? value.modules.map(repairModule).filter((m): m is ModuleEntry => m !== null)
    : [];
  const derived = catalogFromModules(modules);
  const moduleNumbers = stringList(value.moduleNumbers, normalizeModuleNumber, sortModuleNumbers);
  const subNumbers = stringList(value.subNumbers, normalizeSubNumber, sortSubNumbers);
  return {
    version: 1,
    header: header.length > 0 ? header : demo.header,
    recapLabel: typeof value.recapLabel === "string" ? value.recapLabel : demo.recapLabel,
    batches: value.batches.map(repairBatch).filter((b): b is Batch => b !== null),
    teachers: Array.isArray(value.teachers)
      ? value.teachers.map(repairTeacher).filter((t): t is Teacher => t !== null)
      : [],
    modules,
    moduleNumbers: moduleNumbers ?? (derived.moduleNumbers.length > 0 ? derived.moduleNumbers : demo.moduleNumbers),
    subNumbers: subNumbers ?? (derived.subNumbers.length > 0 ? derived.subNumbers : demo.subNumbers),
    days,
    activeDayId: active,
    autoRotate: value.autoRotate !== false,
    showConflicts: value.showConflicts !== false,
    footer,
    isPublished: typeof value.isPublished === "boolean" ? value.isPublished : false,
    publishedAt: typeof value.publishedAt === "string" ? value.publishedAt : undefined,
  };
}

function stringList(
  raw: unknown,
  normalize: (value: string) => string,
  sort: (values: string[]) => string[],
): string[] | null {
  if (!Array.isArray(raw)) return null;
  return sort(raw.filter((item): item is string => typeof item === "string").map(normalize));
}
