import { createInitialState } from "./lib/demo";
import { rosterRange } from "./lib/text";
import type { AppState, DayPlan } from "./lib/types";

function cloneDay(day: DayPlan): DayPlan {
  return JSON.parse(JSON.stringify(day)) as DayPlan;
}

/** Sample day used only when the web screenshot URL includes ?shot=1. */
export function createScreenshotState(): AppState {
  const base = createInitialState();
  const day = base.days[0];
  day.id = "day-07";
  day.date = "2026-10-18";
  day.dayNumber = 7;
  day.dayStart = "09:00";
  day.slots = [
    { id: "s1", kind: "session", durationMin: 60 },
    { id: "break-tea", kind: "break", label: "Tea Break", durationMin: 30 },
    { id: "s2", kind: "session", durationMin: 60 },
    { id: "s3", kind: "session", durationMin: 60 },
    { id: "break-lunch", kind: "break", label: "Prayer & Lunch Break", durationMin: 60 },
    { id: "s4", kind: "session", durationMin: 60 },
  ];
  day.managers = {
    "batch-9": ["09", "10"],
    "batch-10": ["14"],
    "batch-11": ["03", "04"],
  };
  day.cells = {
    "batch-9:s1": { code: "M- 7.04", note: "", teachers: ["Prof. Asisul"] },
    "batch-9:s2": { code: "M- 8.01", note: "", teachers: ["Md. Sazzad Ali", "Muhammad Yeakub Ali"] },
    "batch-10:s1": { code: "M- 7.02", note: "", teachers: ["Mst. Arifa Tazrimin"] },
    "batch-10:s4": { code: "M- 9.05", note: "", teachers: ["Muhammad Yeakub Ali"] },
    "batch-11:s1": { code: "M- 8.04", note: "", teachers: ["Prof. Asisul"] },
    "batch-11:s3": { code: "M- 7.04", note: "", teachers: ["Md. Sazzad Ali"] },
  };
  day.merges = [{ batchId: "batch-9", sessionIds: ["s2", "s3"] }];

  const next = cloneDay(day);
  next.id = "day-08";
  next.date = "2026-10-19";
  next.dayNumber = 8;
  next.managers = {
    "batch-9": ["11", "12"],
    "batch-10": ["15"],
    "batch-11": ["05", "06"],
  };

  return {
    ...base,
    activeDayId: day.id,
    recapLabel: "Recap & Day Manager",
    batches: [9, 10, 11].map((num) => ({
      id: `batch-${num}`,
      name: `${num}th`,
      numberOfStudents: 40,
      roster: rosterRange(1, 40),
    })),
    teachers: [
      { id: "teacher-1", name: "Prof. Asisul", designation: "Professor" },
      { id: "teacher-2", name: "Md. Sazzad Ali", designation: "Associate Professor" },
      { id: "teacher-3", name: "Muhammad Yeakub Ali", designation: "Assistant Professor" },
      { id: "teacher-4", name: "Mst. Arifa Tazrimin", designation: "Training Specialist" },
    ],
    modules: [
      { id: "1", moduleNumber: "7", moduleSubnumber: "04", moduleName: "Assessment", code: "M- 7.04", title: "Assessment" },
      { id: "2", moduleNumber: "8", moduleSubnumber: "01", moduleName: "Supervision", code: "M- 8.01", title: "Supervision" },
      { id: "3", moduleNumber: "9", moduleSubnumber: "05", moduleName: "Planning", code: "M- 9.05", title: "Planning" },
    ],
    moduleNumbers: ["M-7", "M-8", "M-9"],
    subNumbers: [".01", ".02", ".04", ".05"],
    days: [day, next],
    footer: {
      ...base.footer,
      name: "",
      signatureDate: "18.10.26",
      designation: "Assistant Director",
      isCourseCoordinator: true,
      courseName: "Advanced Course on Skill Development",
      lines: ["Assistant Director & Course Coordinator", "Advanced Course on Skill Development"],
    },
  };
}
