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
