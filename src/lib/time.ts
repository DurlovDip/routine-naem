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

/** Calendar date in Asia/Dhaka, YYYY-MM-DD. */
export function todayInDhaka(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

export type DayWhen = "past" | "today" | "future" | "undated";

/** Past, today, or future against a YYYY-MM-DD today. A missing or invalid date is undated. */
export function dayWhen(iso: string, today: string): DayWhen {
  if (!isIsoDate(iso) || !isIsoDate(today)) return "undated";
  if (iso < today) return "past";
  if (iso > today) return "future";
  return "today";
}

export function isClock(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function clampDuration(value: number): number {
  if (!Number.isFinite(value)) return 5;
  return Math.min(360, Math.max(5, Math.round(value)));
}

/**
 * Converts various date formats (DD.MM.YY, DD.MM.YYYY, DD/MM/YYYY, YYYY-MM-DD)
 * to an ISO YYYY-MM-DD string suitable for <input type="date">.
 */
export function toIsoDate(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);

  const mFull = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (mFull) {
    const [, d, m, y] = mFull;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const mShort = trimmed.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2})$/);
  if (mShort) {
    const [, d, m, y] = mShort;
    const fullYear = 2000 + parseInt(y, 10);
    return `${fullYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return "";
}

/**
 * Formats a date string (ISO YYYY-MM-DD or existing) into signature format DD.MM.YY (e.g. 17.10.26).
 */
export function formatSignatureDate(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{2}\.\d{2}\.\d{2}$/.test(trimmed)) return trimmed;

  const iso = toIsoDate(trimmed);
  if (iso) {
    const [y, m, d] = iso.split("-");
    const shortYear = y.length === 4 ? y.slice(2) : y;
    return `${d.padStart(2, "0")}.${m.padStart(2, "0")}.${shortYear}`;
  }

  return trimmed;
}

/**
 * Formats an ISO timestamp for display, e.g. "Today, 10:45 PM" or "25/10/2026, 10:45 PM".
 */
export function formatLastUpdated(iso?: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";

    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();

    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    if (hours === 0) hours = 12;
    const formattedHours = String(hours).padStart(2, "0");

    const now = new Date();
    const isToday =
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear();

    if (isToday) {
      return `Today, ${formattedHours}:${minutes} ${ampm}`;
    }
    return `${day}/${month}/${year}, ${formattedHours}:${minutes} ${ampm}`;
  } catch {
    return "";
  }
}
