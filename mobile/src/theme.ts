export const colors = {
  ink: "#1a1a18",
  muted: "#6d6d68",
  line: "#e4e4e0",
  paper: "#f6f6f4",
  desk: "#f3f3f1",
  surface: "#ffffff",
  accent: "#3f5c4e",
  accentDark: "#2e453a",
  accentSoft: "#eef2ef",
  warn: "#8a5a00",
  warnBg: "#fbf6ee",
  danger: "#8f3d3d",
  dangerBg: "#f8ecec",
};

export const font = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export type FontWeight = keyof typeof font;
