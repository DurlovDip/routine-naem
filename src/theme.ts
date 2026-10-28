/**
 * Design tokens mirrored directly from mobile/src/theme.ts.
 * Light neutral canvas with pine-green accent.
 */

export const colors = {
  ink: "#1c1c1a",
  muted: "#6e6e67",
  line: "#eceae4",
  paper: "#f3f2ee",
  desk: "#f6f5f2",
  surface: "#ffffff",
  accent: "#2c6b58",
  accentDark: "#1e4c3e",
  accentSoft: "#e6f2ed",
  warn: "#8a5a00",
  warnBg: "#fbf6ee",
  danger: "#8f3d3d",
  dangerBg: "#f8ecec",
  shadow: "#1c1c1a",
  /** Unselected day before today. */
  chipPast: "#d9d6ce",
  chipPastText: "#5a5a54",
  /** Unselected today or later, and days with no date. */
  chipOpenBorder: "#ddd9d0",
} as const;

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;

export const type = {
  caption: 12,
  body: 15,
  label: 13,
  title: 17,
  headline: 22,
  display: 28,
} as const;

export const font = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export type FontWeight = keyof typeof font;

export const shadow = "0 8px 18px rgba(28, 28, 26, 0.06)";
export const shadowSm = "0 2px 6px rgba(28, 28, 26, 0.05)";
export const shadowLg = "0 12px 32px rgba(28, 28, 26, 0.12)";
