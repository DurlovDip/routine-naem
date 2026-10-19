import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Alert, Platform } from "react-native";
import { buildTimeline, rowCells } from "./lib/schedule";
import { batchLines, formatModule, joinWithAnd, orderedManagers } from "./lib/text";
import { formatClock, formatDayNumber, formatSignatureDate, formatSlashDate, weekdayName } from "./lib/time";
import type { AppState, DayPlan } from "./lib/types";

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function routineHtml(state: AppState, day: DayPlan): string {
  const timeline = buildTimeline(day);
  const rows = state.batches.map((batch) => ({
    batch,
    managers: orderedManagers(batch.roster, day.managers[batch.id] ?? []),
    cells: rowCells(day, batch.id),
  }));
  const sessionCount = timeline.slots.filter((slot) => slot.kind === "session").length;
  const breakCount = timeline.slots.length - sessionCount;
  const breakWidth = 6;
  const sessionWidth = sessionCount > 0 ? (100 - 8 - 12 - breakCount * breakWidth) / sessionCount : 0;
  const weekday = weekdayName(day.date);
  const header = state.header
    .map((line) => `<div class="h h-${line.style}">${esc(line.text)}</div>`)
    .join("");
  const cols = [
    `<col style="width:8%" />`,
    `<col style="width:12%" />`,
    ...timeline.slots.map((slot) => {
      const width = slot.kind === "break" ? breakWidth : sessionWidth;
      return `<col style="width:${width}%" />`;
    }),
  ].join("");
  const headTop = timeline.slots
    .map((slot) =>
      slot.kind === "break"
        ? `<th rowspan="2" class="break-time">${formatClock(slot.start)}<br />-<br />${formatClock(slot.end)}</th>`
        : `<th>Session - ${slot.number}</th>`,
    )
    .join("");
  const headTimes = timeline.slots
    .map((slot) =>
      slot.kind === "session"
        ? `<th class="time">${formatClock(slot.start)}<br />-<br />${formatClock(slot.end)}</th>`
        : "",
    )
    .join("");
  const body =
    rows.length === 0
      ? `<tr><td colspan="${2 + timeline.slots.length}" class="empty">Add a batch to fill the routine.</td></tr>`
      : rows
          .map((row, rowIndex) => {
            const cells = row.cells
              .map((cell) => {
                if (cell.kind === "skip") return "";
                if (cell.kind === "break") {
                  if (rowIndex !== 0) return "";
                  return `<td rowspan="${rows.length}" class="break"><span>${esc(cell.label)}</span></td>`;
                }
                const line = formatModule(cell.content.code, cell.content.note);
                const teachers = joinWithAnd(cell.content.teachers);
                return `<td colspan="${cell.span}" class="session">${
                  line ? `<div class="code">${esc(line)}</div>` : ""
                }${teachers ? `<div class="teachers">${esc(teachers)}</div>` : ""}</td>`;
              })
              .join("");
            const batch = batchLines(row.batch.name, row.batch.id)
              .map((line) => `<div>${esc(line)}</div>`)
              .join("");
            const managers =
              row.managers.length > 0
                ? `<div>ID No.-</div><div>${esc(joinWithAnd(row.managers))}</div>`
                : "";
            return `<tr><th class="batch">${batch}</th><td class="recap">${managers}</td>${cells}</tr>`;
          })
          .join("");
  const signature = state.footer.signature
    ? `<img class="sign" src="${esc(state.footer.signature)}" alt="" />`
    : `<div class="sign-gap"></div>`;
  const footerBits = [
    state.footer.signatureDate ? `<div>${esc(formatSignatureDate(state.footer.signatureDate))}</div>` : "",
    state.footer.name ? `<div class="name">${esc(state.footer.name)}</div>` : "",
    ...state.footer.lines.filter((line) => line.trim()).map((line) => `<div>${esc(line)}</div>`),
  ].join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: A4 landscape; margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #1a1a18; font-family: "Times New Roman", Times, serif; font-size: 11px; }
  .h { text-align: center; line-height: 1.25; }
  .h-title { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .h-subtitle { font-size: 13px; font-weight: 700; }
  .info { display: flex; justify-content: space-between; align-items: flex-end; margin: 6px 0 4px; font-weight: 700; }
  .info .center { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; table-layout: fixed; }
  th, td { border: 1px solid #1a1a18; text-align: center; vertical-align: middle; padding: 3px; }
  thead th { font-size: 11px; }
  .time, .break-time { font-weight: 700; line-height: 1.15; }
  .batch { font-weight: 700; }
  .recap { font-weight: 700; }
  .code { font-weight: 700; }
  .teachers { margin-top: 2px; }
  .break span { writing-mode: vertical-rl; transform: rotate(180deg); font-weight: 700; }
  .empty { height: 80px; font-style: italic; }
  .footer { display: flex; justify-content: flex-end; margin-top: 8px; }
  .sign-block { text-align: center; min-width: 180px; line-height: 1.3; }
  .sign { max-height: 48px; max-width: 160px; }
  .sign-gap { height: 36px; }
  .name { font-weight: 700; }
</style>
</head>
<body>
  <header>${header}</header>
  <div class="info">
    <div>Date: ${esc(formatSlashDate(day.date))}${weekday ? ` (${esc(weekday)})` : ""}</div>
    <div class="center">Daily Schedule</div>
    <div>${esc(formatDayNumber(day.dayNumber))}</div>
  </div>
  <table>
    <colgroup>${cols}</colgroup>
    <thead>
      <tr>
        <th rowspan="2"></th>
        <th>${esc(state.recapLabel)}</th>
        ${headTop}
      </tr>
      <tr>
        <th class="time">${formatClock(timeline.recap.start)}<br />-<br />${formatClock(timeline.recap.end)}</th>
        ${headTimes}
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
  <footer class="footer">
    <div class="sign-block">${signature}${footerBits}</div>
  </footer>
</body>
</html>`;
}

async function printHtml(html: string) {
  await Print.printAsync({ html, width: 842, height: 595 });
}

async function shareHtml(html: string) {
  const file = await Print.printToFileAsync({ html, width: 842, height: 595 });
  if (Platform.OS === "web") return;
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    await printHtml(html);
    return;
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: "application/pdf",
    dialogTitle: "Share routine",
    UTI: "com.adobe.pdf",
  });
}

export function shareOrPrintRoutine(state: AppState, day: DayPlan) {
  const html = routineHtml(state, day);
  if (Platform.OS === "web") {
    void Print.printToFileAsync({ html, width: 842, height: 595 });
    return;
  }
  Alert.alert("Routine PDF", formatDayNumber(day.dayNumber), [
    { text: "Print", onPress: () => void printHtml(html) },
    { text: "Share", onPress: () => void shareHtml(html) },
    { text: "Cancel", style: "cancel" },
  ]);
}
