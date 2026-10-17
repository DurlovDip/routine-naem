import { DEMO_SIGNATURE } from "../src/lib/signature";
import type { AppState, CellContent, DayPlan } from "../src/lib/types";
import { catalogFromModules, rosterRange } from "../src/lib/text";
import { cellKey } from "../src/lib/schedule";

function cell(code: string, note: string, teachers: string[]): CellContent {
  return { code, note, teachers };
}

function put(
  cells: DayPlan["cells"],
  batchId: string,
  sessionId: string,
  content: CellContent,
) {
  cells[cellKey(batchId, sessionId)] = content;
}

export function createDemoState(): AppState {
  const roster = rosterRange(1, 30);
  const managers = ["09", "10"];
  const batches = [
    { id: "batch-9", name: "9th Batch", roster: [...roster] },
    { id: "batch-10", name: "10th Batch", roster: [...roster] },
    { id: "batch-11", name: "11th Batch", roster: [...roster] },
    { id: "batch-12", name: "12th Batch", roster: [...roster] },
    { id: "batch-13", name: "13th Batch", roster: [...roster] },
  ];

  const cells: DayPlan["cells"] = {};
  put(cells, "batch-9", "s1", cell("M- 7.04", "(Theory)", ["Prof. Asisul"]));
  put(
    cells,
    "batch-9",
    "s2",
    cell("M- 7.04", "TPP (Theory & Practice)", [
      "Prof. Asisul",
      "Md. Sazzad Ali",
      "Muhammad Yeakub Ali",
    ]),
  );
  put(
    cells,
    "batch-9",
    "s4",
    cell("M- 7.04", "(Practice & Presentation)", ["Mst. Arifa Tazrimin", "Md. Jahangir Alom"]),
  );

  put(cells, "batch-10", "s1", cell("M- 1.06", "", ["Prof. Rukhshana"]));
  put(cells, "batch-10", "s2", cell("M- 3.05", "", ["Prof. Nilufar"]));
  put(cells, "batch-10", "s3", cell("M- 8.08", "", ["Ms. Ayesa"]));
  put(cells, "batch-10", "s4", cell("M- 8.10", "", ["Mr. S. Mahbub"]));
  put(cells, "batch-10", "s5", cell("M- 5.06", "", ["Dr. Rahman"]));

  put(cells, "batch-11", "s1", cell("M- 1.08", "", ["Mr. M. Ali"]));
  put(cells, "batch-11", "s2", cell("M- 3.02", "", ["Mr. Ariful"]));
  put(cells, "batch-11", "s3", cell("M- 8.07", "", ["Dr. Nuruzzaman"]));
  put(cells, "batch-11", "s4", cell("M- 5.06", "", ["Dr. Rahman"]));
  put(cells, "batch-11", "s5", cell("M- 6.01", "", ["Ms. Zinan"]));

  put(cells, "batch-12", "s1", cell("M- 3.05", "", ["Prof. Nilufar"]));
  put(cells, "batch-12", "s2", cell("M- 8.07", "", ["Dr. Nuruzzaman"]));
  put(cells, "batch-12", "s3", cell("M- 1.06", "", ["Prof. Rukhshana"]));
  put(cells, "batch-12", "s4", cell("M- 8.03", "", ["Ms. Arifa"]));
  put(cells, "batch-12", "s5", cell("M- 1.08", "", ["Mr. M. Ali"]));

  put(cells, "batch-13", "s1", cell("M- 5.01", "", ["Dr. Ayet"]));
  put(cells, "batch-13", "s2", cell("M- 5.06", "", ["Dr. Rahman"]));
  put(cells, "batch-13", "s3", cell("M- 6.01", "", ["Ms. Zinan"]));
  put(cells, "batch-13", "s4", cell("M- 1.06", "", ["Prof. Rukhshana"]));
  put(cells, "batch-13", "s5", cell("M- 3.02", "", ["Mr. Ariful"]));

  const dayManagers = Object.fromEntries(batches.map((batch) => [batch.id, [...managers]]));
  const modules = [
    ["M- 7.04", "(Theory)"],
    ["M- 7.04", "TPP (Theory & Practice)"],
    ["M- 7.04", "(Practice & Presentation)"],
    ["M- 1.06", ""],
    ["M- 1.08", ""],
    ["M- 3.02", ""],
    ["M- 3.05", ""],
    ["M- 5.01", ""],
    ["M- 5.06", ""],
    ["M- 6.01", ""],
    ["M- 8.03", ""],
    ["M- 8.07", ""],
    ["M- 8.08", ""],
    ["M- 8.10", ""],
  ].map(([code, title], index) => ({ id: `module-${index + 1}`, code, title }));

  return {
    version: 1,
    recapLabel: "Recap & Day Manager",
    autoRotate: true,
    showConflicts: true,
    activeDayId: "day-07",
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
        text: "For Assistant Professors of BCS (General Education) Cadre (09th – 13th Batch)",
      },
      {
        id: "h7",
        style: "normal",
        text: "(Duration: 12 October, 2026 – 10 November, 2026)",
      },
    ],
    batches,
    teachers: [
      "Prof. Asisul",
      "Md. Sazzad Ali",
      "Muhammad Yeakub Ali",
      "Mst. Arifa Tazrimin",
      "Md. Jahangir Alom",
      "Prof. Rukhshana",
      "Prof. Nilufar",
      "Ms. Ayesa",
      "Mr. S. Mahbub",
      "Dr. Rahman",
      "Mr. M. Ali",
      "Mr. Ariful",
      "Dr. Nuruzzaman",
      "Ms. Zinan",
      "Ms. Arifa",
      "Dr. Ayet",
    ].map((name, index) => ({ id: `teacher-${index + 1}`, name })),
    modules,
    ...catalogFromModules(modules),
    footer: {
      signature: DEMO_SIGNATURE,
      signatureDate: "17.10.26",
      name: "Dr. Litan Kanti Halder",
      lines: ["Assistant Director & Course Coordinator", "12th ACSD Training Course"],
    },
    days: [
      {
        id: "day-07",
        date: "2026-10-18",
        dayNumber: 7,
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
        managers: dayManagers,
        cells,
        merges: [
          { batchId: "batch-9", sessionIds: ["s2", "s3"] },
          { batchId: "batch-9", sessionIds: ["s4", "s5"] },
        ],
      },
    ],
  };
}
