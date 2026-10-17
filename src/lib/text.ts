export function joinWithAnd(items: string[]): string {
  const list = items.map((item) => item.trim()).filter(Boolean);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} & ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} & ${list[list.length - 1]}`;
}

export function formatModule(code: string, note: string): string {
  const moduleCode = code.trim();
  const moduleNote = note.trim();
  if (moduleCode && moduleNote) return `${moduleCode} ${moduleNote}`;
  return moduleCode || moduleNote;
}

export function parseRoster(text: string): string[] {
  const seen = new Set<string>();
  const roster: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const id = part.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    roster.push(id);
  }
  return roster;
}

export function rosterRange(start: number, end: number): string[] {
  const from = Math.max(0, Math.min(start, end));
  const to = Math.max(start, end);
  const roster: string[] = [];
  for (let n = from; n <= to; n += 1) roster.push(String(n).padStart(2, "0"));
  return roster;
}

export function orderedManagers(roster: string[], selected: string[]): string[] {
  const picked = new Set(selected);
  const inRoster = roster.filter((id) => picked.has(id));
  const extras = selected.filter((id) => !roster.includes(id));
  return [...inRoster, ...extras];
}

export function rotateIds(roster: string[], current: string[]): string[] {
  if (roster.length === 0 || current.length === 0) return [...current];
  const indexes = current.map((id) => roster.indexOf(id)).filter((index) => index >= 0);
  if (indexes.length === 0) return [...current];
  const start = Math.max(...indexes) + 1;
  const next: string[] = [];
  for (let offset = 0; offset < current.length; offset += 1) {
    next.push(roster[(start + offset) % roster.length]);
  }
  return next;
}

export function cleanBatchNumber(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\s+Batch$/i, "");
}

export function batchLines(name: string): string[] {
  const clean = cleanBatchNumber(name);
  if (!clean) return [""];
  return [clean, "Batch"];
}

export function sessionSpanLabel(numbers: number[]): string {
  if (numbers.length === 0) return "Session";
  if (numbers.length === 1) return `Session - ${numbers[0]}`;
  return `Session - ${numbers[0]} to Session - ${numbers[numbers.length - 1]}`;
}

export function normalizeModuleNumber(value: string): string {
  const match = value.trim().match(/^(?:M-\s*)?(\d+)/i);
  if (!match) return "";
  return `M-${Number(match[1])}`;
}

export function normalizeSubNumber(value: string): string {
  const match = value.trim().match(/^\.?(\d+)$/);
  if (!match) return "";
  return `.${match[1].padStart(2, "0")}`;
}

export function parseModuleCode(code: string): { moduleNumber: string; subNumber: string } | null {
  const full = code.trim().match(/^M-\s*(\d+)\.(\d+)$/i);
  if (full) {
    return {
      moduleNumber: `M-${Number(full[1])}`,
      subNumber: `.${full[2].padStart(2, "0")}`,
    };
  }
  const major = code.trim().match(/^M-\s*(\d+)$/i);
  if (!major) return null;
  return { moduleNumber: `M-${Number(major[1])}`, subNumber: "" };
}

export function formatModuleCode(moduleNumber: string, subNumber: string): string {
  const major = normalizeModuleNumber(moduleNumber);
  const sub = normalizeSubNumber(subNumber);
  if (!major) return "";
  const digits = major.slice(2);
  if (!sub) return `M- ${digits}`;
  return `M- ${digits}${sub}`;
}

function byNumber(a: string, b: string): number {
  return Number(a.replace(/[^\d]/g, "")) - Number(b.replace(/[^\d]/g, ""));
}

export function sortModuleNumbers(values: string[]): string[] {
  return [...new Set(values.map(normalizeModuleNumber).filter(Boolean))].sort(byNumber);
}

export function sortSubNumbers(values: string[]): string[] {
  return [...new Set(values.map(normalizeSubNumber).filter(Boolean))].sort(byNumber);
}

export function catalogFromModules(modules: { code: string }[]): {
  moduleNumbers: string[];
  subNumbers: string[];
} {
  const numbers: string[] = [];
  const subs: string[] = [];
  for (const module of modules) {
    const parsed = parseModuleCode(module.code);
    if (!parsed) continue;
    numbers.push(parsed.moduleNumber);
    subs.push(parsed.subNumber);
  }
  return { moduleNumbers: sortModuleNumbers(numbers), subNumbers: sortSubNumbers(subs) };
}
