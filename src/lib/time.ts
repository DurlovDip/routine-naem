const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function parseTime(value: string): number {
  const [h, m] = value.split(":").map(Number);
  const hours = Number.isFinite(h) ? h : 0;
  const minutes = Number.isFinite(m) ? m : 0;
  return hours * 60 + minutes;
}

/** 12-hour clock without AM/PM, always two digits: 09.00, 12.00, 01.00. */
export function formatClock(totalMinutes: number): string {
  const day = 24 * 60;
  const normalized = ((totalMinutes % day) + day) % day;
  const hours24 = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  let hours = hours24 % 12;
  if (hours === 0) hours = 12;
  return `${String(hours).padStart(2, "0")}.${String(minutes).padStart(2, "0")}`;
}

export function formatRange(start: number, end: number): string {
  return `${formatClock(start)} - ${formatClock(end)}`;
}

export function weekdayName(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return "";
  return WEEKDAYS[new Date(year, month - 1, day).getDay()];
}

export function formatSlashDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

export function formatDayNumber(dayNumber: number): string {
  const value = Number.isFinite(dayNumber) ? Math.max(0, Math.trunc(dayNumber)) : 0;
  const text = value < 100 ? String(value).padStart(2, "0") : String(value);
  return `Day – ${text}`;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(year || 2026, (month || 1) - 1, day || 1);
  date.setDate(date.getDate() + days);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function isClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(360, Math.max(5, Math.round(value)));
}
