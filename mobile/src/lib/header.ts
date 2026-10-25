import type { HeaderStyle } from "./types";

/** Same choices as the web document-header editor. */
export const HEADER_STYLES: { value: HeaderStyle; label: string }[] = [
  { value: "normal", label: "Plain" },
  { value: "title", label: "Course title" },
  { value: "subtitle", label: "Subtitle" },
];

export function isHeaderStyle(value: string): value is HeaderStyle {
  return HEADER_STYLES.some((item) => item.value === value);
}

export function headerStyleLabel(style: string): string {
  return HEADER_STYLES.find((item) => item.value === style)?.label ?? "";
}

/** Returns null when the label is not one of the three printed styles. */
export function headerStyleFromLabel(label: string): HeaderStyle | null {
  return HEADER_STYLES.find((item) => item.label === label)?.value ?? null;
}

/** Course title for the collapsed Routine row: the first title line, else the first line. */
export function courseTitleText(header: Array<{ style: string; text: string }>): string {
  const title = header.find((line) => line.style === "title" && line.text.trim());
  if (title) return title.text.trim();
  return header.find((line) => line.text.trim())?.text.trim() ?? "";
}

/** Routine tab title: the first Course title line, then the footer course name. */
export function routineCourseLabel(header: Array<{ style: string; text: string }>, courseName = ""): string {
  const title = header.find((line) => line.style === "title" && line.text.trim());
  if (title) return title.text.trim();
  return courseName.trim();
}

/**
 * "Course Coordinator: …" from the saved signee or assigned coordinator.
 * If multiple coordinators exist, formats as "Course Coordinator: <First> and others".
 */
export function routineCoordinatorLabel(
  footerName: string,
  assignedName = "",
  coordinatorNames: string[] = [],
): string {
  const cleanList = coordinatorNames.map((n) => n.trim()).filter(Boolean);
  if (cleanList.length > 1) {
    const trimmedFooter = footerName.trim();
    const primary = cleanList.find((n) => n.toLowerCase() === trimmedFooter.toLowerCase()) ?? cleanList[0];
    return `Course Coordinator: ${primary} and others`;
  }
  if (cleanList.length === 1) {
    return `Course Coordinator: ${cleanList[0]}`;
  }

  const fallback = footerName.trim() || assignedName.trim();
  if (!fallback) return "";

  const splitNames = fallback
    .split(/\s*(?:,|&|\band\b)\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (splitNames.length > 1) {
    return `Course Coordinator: ${splitNames[0]} and others`;
  }

  return `Course Coordinator: ${fallback}`;
}
