import type { AppState, DayPlan } from "./types";

/**
 * Creates an empty, clean routine state with NO hardcoded teachers,
 * modules, batches, or cells. All data is dynamically loaded from Supabase.
 */
export function createInitialState(): AppState {
  const today = new Date().toISOString().slice(0, 10);
  const initialDay: DayPlan = {
    id: "day-01",
    date: today,
    dayNumber: 1,
    dayStart: "09:00",
    recapMin: 30,
    defaultSessionMin: 60,
    slots: [
      { id: "s1", kind: "session", durationMin: 60 },
      { id: "break-tea", kind: "break", label: "Tea Break", durationMin: 30 },
      { id: "s2", kind: "session", durationMin: 60 },
      { id: "s3", kind: "session", durationMin: 60 },
      { id: "break-lunch", kind: "break", label: "Prayer & Lunch Break", durationMin: 60 },
      { id: "s4", kind: "session", durationMin: 60 },
      { id: "s5", kind: "session", durationMin: 60 },
    ],
    managers: {},
    cells: {},
    merges: [],
  };

  return {
    version: 1,
    recapLabel: "Recap & Day Manager",
    autoRotate: true,
    showConflicts: true,
    activeDayId: "day-01",
    header: [
      { id: "h1", style: "normal", text: "Enhancing Professional Skills of Teachers Scheme" },
      { id: "h2", style: "normal", text: "Secondary Education Development Program (SEDP)" },
      { id: "h3", style: "normal", text: "National Academy for Educational Management (NAEM)" },
      {
        id: "h4",
        style: "normal",
        text: "Secondary and Higher Education Division, Ministry of Education",
      },
      { id: "h5", style: "title", text: "Advanced Course on Skill Development" },
      {
        id: "h6",
        style: "subtitle",
        text: "For Assistant Professors of BCS (General Education) Cadre",
      },
      {
        id: "h7",
        style: "normal",
        text: "(Duration: Training Course Schedule)",
      },
    ],
    batches: [],
    teachers: [],
    modules: [],
    moduleNumbers: [],
    subNumbers: [],
    footer: {
      signature: null,
      signatureDate: "",
      name: "",
      lines: ["Assistant Director & Course Coordinator"],
    },
    days: [initialDay],
  };
}

export const createDemoState = createInitialState;
