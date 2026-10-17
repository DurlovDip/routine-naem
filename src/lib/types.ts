export type HeaderStyle = "normal" | "title" | "subtitle";

export type HeaderLine = {
  id: string;
  text: string;
  style: HeaderStyle;
};

export type Teacher = {
  id: string;
  name: string;
};

export type ModuleEntry = {
  id: string;
  code: string;
  title: string;
};

export type Batch = {
  id: string;
  name: string;
  roster: string[];
};

export type CellContent = {
  code: string;
  note: string;
  teachers: string[];
};

export type SessionSlot = {
  id: string;
  kind: "session";
  durationMin: number;
};

export type BreakSlot = {
  id: string;
  kind: "break";
  label: string;
  durationMin: number;
};

export type Slot = SessionSlot | BreakSlot;

export type Merge = {
  batchId: string;
  sessionIds: string[];
};

export type DayPlan = {
  id: string;
  date: string;
  dayNumber: number;
  dayStart: string;
  recapMin: number;
  defaultSessionMin: number;
  slots: Slot[];
  managers: Record<string, string[]>;
  cells: Record<string, CellContent>;
  merges: Merge[];
};

export type Footer = {
  signature: string | null;
  signatureDate: string;
  name: string;
  lines: string[];
};

export type AppState = {
  version: 1;
  header: HeaderLine[];
  recapLabel: string;
  batches: Batch[];
  teachers: Teacher[];
  modules: ModuleEntry[];
  moduleNumbers: string[];
  subNumbers: string[];
  days: DayPlan[];
  activeDayId: string;
  autoRotate: boolean;
  showConflicts: boolean;
  footer: Footer;
};

export type CellSelection = {
  batchId: string;
  sessionId: string;
};
