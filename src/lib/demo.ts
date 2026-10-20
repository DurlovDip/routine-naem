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
      designation: "Assistant Director",
      isCourseCoordinator: true,
      courseName: "",
      lines: ["Assistant Director & Course Coordinator"],
    },
    days: [initialDay],
  };
}

export function createDemoState(): AppState {
  const base = createInitialState();
  const roster = Array.from({ length: 40 }, (_, i) => String(i + 1).padStart(2, "0"));

  const day1: DayPlan = {
    id: "day-01",
    date: "2026-10-19",
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
    managers: {
      "batch-9": ["01", "02"],
      "batch-10": ["01", "02"],
      "batch-11": ["01", "02"],
      "batch-12": ["01", "02"],
      "batch-13": ["01", "02"],
    },
    cells: {
      "batch-9:s1": { code: "M- 7.04", note: "Theory", teachers: ["Prof. Asisul"] },
      "batch-9:s2": { code: "M- 8.01", note: "", teachers: ["Md. Sazzad Ali"] },
      "batch-9:s3": { code: "M- 8.01", note: "", teachers: ["Md. Sazzad Ali"] },
      "batch-9:s4": { code: "M- 1.06", note: "", teachers: ["Muhammad Yeakub Ali"] },
      "batch-9:s5": { code: "M- 3.02", note: "", teachers: ["Mst. Arifa Tazrimin"] },

      "batch-10:s1": { code: "M- 1.06", note: "", teachers: ["Muhammad Yeakub Ali"] },
      "batch-10:s2": { code: "M- 7.04", note: "Theory", teachers: ["Prof. Asisul"] },
      "batch-10:s3": { code: "M- 3.02", note: "", teachers: ["Mst. Arifa Tazrimin"] },
      "batch-10:s4": { code: "M- 8.01", note: "", teachers: ["Md. Sazzad Ali"] },
      "batch-10:s5": { code: "M- 5.01", note: "", teachers: ["Md. Jahangir Alom"] },

      "batch-11:s1": { code: "M- 3.02", note: "", teachers: ["Mst. Arifa Tazrimin"] },
      "batch-11:s2": { code: "M- 1.06", note: "", teachers: ["Muhammad Yeakub Ali"] },
      "batch-11:s3": { code: "M- 7.04", note: "Theory", teachers: ["Prof. Asisul"] },
      "batch-11:s4": { code: "M- 5.01", note: "", teachers: ["Md. Jahangir Alom"] },
      "batch-11:s5": { code: "M- 8.01", note: "", teachers: ["Md. Sazzad Ali"] },

      "batch-12:s1": { code: "M- 5.01", note: "", teachers: ["Md. Jahangir Alom"] },
      "batch-12:s2": { code: "M- 3.05", note: "", teachers: ["Prof. Rukhshana"] },
      "batch-12:s3": { code: "M- 1.08", note: "", teachers: ["Prof. Nilufar"] },
      "batch-12:s4": { code: "M- 7.04", note: "TPP", teachers: ["Prof. Asisul"] },
      "batch-12:s5": { code: "M- 6.01", note: "", teachers: ["Dr. Rahman"] },

      "batch-13:s1": { code: "M- 1.08", note: "", teachers: ["Prof. Nilufar"] },
      "batch-13:s2": { code: "M- 5.01", note: "", teachers: ["Md. Jahangir Alom"] },
      "batch-13:s3": { code: "M- 6.01", note: "", teachers: ["Dr. Rahman"] },
      "batch-13:s4": { code: "M- 3.05", note: "", teachers: ["Prof. Rukhshana"] },
      "batch-13:s5": { code: "M- 7.04", note: "TPP", teachers: ["Prof. Asisul"] },
    },
    merges: [{ batchId: "batch-9", sessionIds: ["s2", "s3"] }],
  };

  const day2: DayPlan = {
    id: "day-02",
    date: "2026-10-20",
    dayNumber: 2,
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
    managers: {
      "batch-9": ["03", "04"],
      "batch-10": ["03", "04"],
      "batch-11": ["03", "04"],
      "batch-12": ["03", "04"],
      "batch-13": ["03", "04"],
    },
    cells: {
      "batch-9:s1": { code: "M- 7.04", note: "TPP (Theory & Practice)", teachers: ["Prof. Asisul"] },
      "batch-9:s2": { code: "M- 8.03", note: "", teachers: ["Ms. Ayesa"] },
      "batch-9:s3": { code: "M- 5.06", note: "", teachers: ["Mr. S. Mahbub"] },
      "batch-9:s4": { code: "M- 6.01", note: "", teachers: ["Dr. Rahman", "Mr. M. Ali"] },
      "batch-9:s5": { code: "M- 8.07", note: "", teachers: ["Mr. Ariful"] },

      "batch-10:s1": { code: "M- 5.06", note: "", teachers: ["Mr. S. Mahbub"] },
      "batch-10:s2": { code: "M- 7.04", note: "TPP (Theory & Practice)", teachers: ["Prof. Asisul"] },
      "batch-10:s3": { code: "M- 8.03", note: "", teachers: ["Ms. Ayesa"] },
      "batch-10:s4": { code: "M- 8.07", note: "", teachers: ["Mr. Ariful"] },
      "batch-10:s5": { code: "M- 6.01", note: "", teachers: ["Dr. Rahman"] },

      "batch-11:s1": { code: "M- 8.03", note: "", teachers: ["Ms. Ayesa"] },
      "batch-11:s2": { code: "M- 5.06", note: "", teachers: ["Mr. S. Mahbub"] },
      "batch-11:s3": { code: "M- 7.04", note: "Practice & Presentation", teachers: ["Prof. Asisul"] },
      "batch-11:s4": { code: "M- 8.08", note: "", teachers: ["Dr. Nuruzzaman"] },
      "batch-11:s5": { code: "M- 8.10", note: "", teachers: ["Ms. Zinan"] },

      "batch-12:s1": { code: "M- 6.01", note: "", teachers: ["Dr. Rahman"] },
      "batch-12:s2": { code: "M- 8.08", note: "", teachers: ["Dr. Nuruzzaman"] },
      "batch-12:s3": { code: "M- 8.10", note: "", teachers: ["Ms. Zinan"] },
      "batch-12:s4": { code: "M- 7.04", note: "Theory", teachers: ["Prof. Asisul"] },
      "batch-12:s5": { code: "M- 3.02", note: "", teachers: ["Mst. Arifa Tazrimin"] },

      "batch-13:s1": { code: "M- 8.10", note: "", teachers: ["Ms. Zinan"] },
      "batch-13:s2": { code: "M- 6.01", note: "", teachers: ["Dr. Rahman"] },
      "batch-13:s3": { code: "M- 8.08", note: "", teachers: ["Dr. Nuruzzaman"] },
      "batch-13:s4": { code: "M- 3.02", note: "", teachers: ["Mst. Arifa Tazrimin"] },
      "batch-13:s5": { code: "M- 7.04", note: "Theory", teachers: ["Prof. Asisul"] },
    },
    merges: [],
  };

  return {
    ...base,
    activeDayId: "day-02",
    batches: [9, 10, 11, 12, 13].map((num) => ({
      id: `batch-${num}`,
      name: `${num}th`,
      numberOfStudents: 40,
      roster,
    })),
    teachers: [
      { id: "teacher-1", name: "Prof. Asisul", designation: "Professor" },
      { id: "teacher-2", name: "Md. Sazzad Ali", designation: "Associate Professor" },
      { id: "teacher-3", name: "Muhammad Yeakub Ali", designation: "Assistant Professor" },
      { id: "teacher-4", name: "Mst. Arifa Tazrimin", designation: "Assistant Professor" },
      { id: "teacher-5", name: "Md. Jahangir Alom", designation: "Lecturer" },
      { id: "teacher-6", name: "Prof. Rukhshana", designation: "Professor" },
      { id: "teacher-7", name: "Prof. Nilufar", designation: "Professor" },
      { id: "teacher-8", name: "Ms. Ayesa", designation: "Associate Professor" },
      { id: "teacher-9", name: "Mr. S. Mahbub", designation: "Assistant Professor" },
      { id: "teacher-10", name: "Dr. Rahman", designation: "Director" },
      { id: "teacher-11", name: "Mr. M. Ali", designation: "Assistant Professor" },
      { id: "teacher-12", name: "Mr. Ariful", designation: "Lecturer" },
      { id: "teacher-13", name: "Dr. Nuruzzaman", designation: "Director" },
      { id: "teacher-14", name: "Ms. Zinan", designation: "Assistant Professor" },
      { id: "teacher-15", name: "Ms. Arifa", designation: "Lecturer" },
      { id: "teacher-16", name: "Dr. Ayet", designation: "Associate Professor" },
      { id: "teacher-17", name: "Dr. Litan Kanti Halder", designation: "Assistant Director" },
    ],
    modules: [
      { id: "1", moduleNumber: "7", moduleSubnumber: "04", moduleName: "Theory", code: "M- 7.04", title: "Theory" },
      { id: "2", moduleNumber: "7", moduleSubnumber: "04", moduleName: "TPP (Theory & Practice)", code: "M- 7.04", title: "TPP (Theory & Practice)" },
      { id: "3", moduleNumber: "7", moduleSubnumber: "04", moduleName: "Practice & Presentation", code: "M- 7.04", title: "Practice & Presentation" },
      { id: "4", moduleNumber: "1", moduleSubnumber: "06", moduleName: "Education Governance", code: "M- 1.06", title: "Education Governance" },
      { id: "5", moduleNumber: "1", moduleSubnumber: "08", moduleName: "Financial Management", code: "M- 1.08", title: "Financial Management" },
      { id: "6", moduleNumber: "3", moduleSubnumber: "02", moduleName: "Curriculum Implementation", code: "M- 3.02", title: "Curriculum Implementation" },
      { id: "7", moduleNumber: "3", moduleSubnumber: "05", moduleName: "Pedagogical Leadership", code: "M- 3.05", title: "Pedagogical Leadership" },
      { id: "8", moduleNumber: "5", moduleSubnumber: "01", moduleName: "ICT in Education", code: "M- 5.01", title: "ICT in Education" },
      { id: "9", moduleNumber: "5", moduleSubnumber: "06", moduleName: "Classroom Assessment", code: "M- 5.06", title: "Classroom Assessment" },
      { id: "10", moduleNumber: "6", moduleSubnumber: "01", moduleName: "Research Methodology", code: "M- 6.01", title: "Research Methodology" },
      { id: "11", moduleNumber: "8", moduleSubnumber: "03", moduleName: "Professional Ethics", code: "M- 8.03", title: "Professional Ethics" },
      { id: "12", moduleNumber: "8", moduleSubnumber: "07", moduleName: "Quality Assurance", code: "M- 8.07", title: "Quality Assurance" },
      { id: "13", moduleNumber: "8", moduleSubnumber: "08", moduleName: "Institutional Planning", code: "M- 8.08", title: "Institutional Planning" },
      { id: "14", moduleNumber: "8", moduleSubnumber: "10", moduleName: "Evaluation & Feedback", code: "M- 8.10", title: "Evaluation & Feedback" },
    ],
    moduleNumbers: ["M-1", "M-3", "M-5", "M-6", "M-7", "M-8"],
    subNumbers: [".01", ".02", ".03", ".04", ".05", ".06", ".07", ".08", ".10"],
    days: [day1, day2],
    footer: {
      signature: null,
      name: "Dr. Litan Kanti Halder",
      signatureDate: "20.10.26",
      designation: "Assistant Director & Course Coordinator",
      isCourseCoordinator: true,
      courseName: "Advanced Course on Skill Development",
      lines: [
        "Assistant Director & Course Coordinator",
        "Advanced Course on Skill Development",
        "NAEM, Dhaka",
      ],
    },
  };
}
