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
  const breakWidth = 5.5;
  const sessionWidth = sessionCount > 0 ? (100 - 8 - 11 - breakCount * breakWidth) / sessionCount : 0;
  const weekday = weekdayName(day.date);
  const header = state.header
    .map((line) => `<div class="header-line header-${esc(line.style)}">${esc(line.text)}</div>`)
    .join("");
  const cols = [
    `<col style="width:8%" />`,
    `<col style="width:11%" />`,
    ...timeline.slots.map((slot) => {
      const width = slot.kind === "break" ? breakWidth : sessionWidth;
      return `<col style="width:${width}%" />`;
    }),
  ].join("");

  const headTop = timeline.slots
    .map((slot) =>
      slot.kind === "break"
        ? `<th rowspan="2" class="break-time"><div class="time-stack"><span>${formatClock(slot.start)}</span><span>-</span><span>${formatClock(slot.end)}</span></div></th>`
        : `<th class="session-title">Session - ${slot.number}</th>`,
    )
    .join("");

  const headTimes = timeline.slots
    .map((slot) =>
      slot.kind === "session"
        ? `<th class="time-cell"><div class="time-stack"><span>${formatClock(slot.start)}</span><span>-</span><span>${formatClock(slot.end)}</span></div></th>`
        : "",
    )
    .join("");

  const body =
    rows.length === 0
      ? `<tr><td colspan="${2 + timeline.slots.length}" class="sheet-empty">Add a batch to fill the routine.</td></tr>`
      : rows
          .map((row, rowIndex) => {
            const cells = row.cells
              .map((cell) => {
                if (cell.kind === "skip") return "";
                if (cell.kind === "break") {
                  if (rowIndex !== 0) return "";
                  return `<td rowspan="${rows.length}" class="break-label"><span>${esc(cell.label)}</span></td>`;
                }
                const line = formatModule(cell.content.code, cell.content.note);
                const teachers = joinWithAnd(cell.content.teachers);
                return `<td colspan="${cell.span}" class="session-cell">${
                  line ? `<div class="module-code">${esc(line)}</div>` : ""
                }${teachers ? `<div class="module-teachers">${esc(teachers)}</div>` : ""}</td>`;
              })
              .join("");
            const batch = batchLines(row.batch.name, row.batch.id)
              .map((line) => `<span>${esc(line)}</span>`)
              .join("");
            const managers =
              row.managers.length > 0
                ? `<div>ID No.-</div><div>${esc(joinWithAnd(row.managers))}</div>`
                : "";
            return `<tr><th class="batch-name">${batch}</th><td class="recap-cell">${managers}</td>${cells}</tr>`;
          })
          .join("");

  const signature = state.footer.signature
    ? `<img class="sign-img" src="${esc(state.footer.signature)}" alt="" />`
    : `<div class="sign-gap"></div>`;
  const footerBits = [
    state.footer.signatureDate ? `<div class="sign-date">${esc(formatSignatureDate(state.footer.signatureDate))}</div>` : "",
    state.footer.name ? `<div class="sign-name">${esc(state.footer.name)}</div>` : "",
    ...state.footer.lines.filter((line) => line.trim()).map((line) => `<div class="sign-line">${esc(line)}</div>`),
  ].join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Daily Schedule - ${esc(formatDayNumber(day.dayNumber))}</title>
<style>
  @page {
    size: A4 landscape;
    margin: 6mm 8mm;
  }
  @media print {
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
    }
    .sheet {
      border: 1.5px solid #000000 !important;
      box-shadow: none !important;
      width: 100% !important;
      height: 196mm !important;
      max-height: 196mm !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  }
  * {
    box-sizing: border-box;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  html, body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #000000;
    font-family: "Tinos", "Times New Roman", Times, Georgia, serif;
    font-size: 11pt;
    line-height: 1.2;
    width: 100%;
    height: 100%;
  }
  .sheet {
    width: 282mm;
    height: 196mm;
    margin: 0 auto;
    border: 1.5px solid #000000;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-sizing: border-box;
  }
  .sheet-header {
    text-align: center;
    padding: 3mm 7mm 1mm;
  }
  .header-line {
    line-height: 1.22;
  }
  .header-normal {
    font-size: 11pt;
    font-weight: 400;
  }
  .header-title {
    font-size: 13.5pt;
    font-weight: 700;
    margin-top: 0.5mm;
  }
  .header-subtitle {
    font-size: 12pt;
    font-weight: 700;
  }
  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    padding: 1.2mm 5mm 1.5mm;
    font-weight: 700;
    font-size: 12pt;
    border-bottom: 1.5px solid #000000;
  }
  .info-date {
    text-align: left;
    flex: 1;
  }
  .info-title {
    text-align: center;
    font-size: 14pt;
    font-weight: 700;
    flex: 1;
  }
  .info-day {
    text-align: right;
    flex: 1;
  }
  .table-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  table {
    width: 100%;
    height: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #000000;
    text-align: center;
    vertical-align: middle;
    padding: 1mm 1.2mm;
  }
  thead th {
    font-weight: 700;
  }
  .corner {
    border-top: none;
    border-left: none;
  }
  .session-title {
    font-size: 11pt;
    font-weight: 700;
    line-height: 1.15;
    padding: 1.5mm 1mm 1mm;
    border-top: none;
  }
  .time-cell, .break-time {
    font-weight: 400;
    font-size: 11pt;
  }
  .break-time {
    vertical-align: bottom;
    padding-bottom: 1.5mm;
    border-top: none;
  }
  .time-stack {
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.12;
    font-weight: 400;
    font-size: 10.5pt;
  }
  .batch-name {
    font-weight: 700;
    font-size: 11pt;
    line-height: 1.15;
    border-left: none;
  }
  .batch-name span {
    display: block;
  }
  .recap-cell {
    font-weight: 700;
    font-size: 11pt;
    line-height: 1.2;
  }
  .session-cell {
    padding: 1.2mm 1.4mm;
  }
  .module-code {
    font-weight: 700;
    font-size: 10.5pt;
    line-height: 1.25;
  }
  .module-teachers {
    font-size: 10.5pt;
    line-height: 1.28;
    text-decoration: underline;
    text-underline-offset: 1px;
    margin-top: 0.5mm;
  }
  .break-label {
    font-weight: 700;
    font-size: 11pt;
    padding: 1mm 0;
    background-color: #fbfbfb;
  }
  .break-label span {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    white-space: nowrap;
    line-height: 1;
    display: inline-block;
  }
  .sheet-empty {
    height: 40mm;
    font-style: italic;
  }
  .sheet-footer {
    display: flex;
    justify-content: flex-end;
    padding: 1.8mm 10mm 3.5mm;
    margin-top: auto;
  }
  .sign-block {
    text-align: center;
    width: 78mm;
  }
  .sign-img {
    display: block;
    height: 13mm;
    width: auto;
    max-width: 70mm;
    margin: 0 auto 0.4mm;
    object-fit: contain;
  }
  .sign-gap {
    height: 12mm;
  }
  .sign-date {
    font-weight: 700;
    font-size: 12pt;
    line-height: 1.2;
  }
  .sign-name {
    font-weight: 700;
    font-size: 12.5pt;
    line-height: 1.25;
  }
  .sign-line {
    font-size: 11.5pt;
    line-height: 1.25;
    font-weight: 400;
  }
  .sheet[data-dense="true"] .session-title,
  .sheet[data-dense="true"] .module-code,
  .sheet[data-dense="true"] .module-teachers,
  .sheet[data-dense="true"] .time-stack {
    font-size: 9pt;
  }
</style>
</head>
<body>
  <div class="sheet" data-dense="${sessionCount >= 8 ? "true" : "false"}">
    <header class="sheet-header">${header}</header>
    <div class="info-row">
      <div class="info-date">Date: ${esc(formatSlashDate(day.date))}${weekday ? ` (${esc(weekday)})` : ""}</div>
      <div class="info-title">Daily Schedule</div>
      <div class="info-day">${esc(formatDayNumber(day.dayNumber))}</div>
    </div>
    <div class="table-area">
      <table>
        <colgroup>${cols}</colgroup>
        <thead>
          <tr>
            <th rowspan="2" class="corner"></th>
            <th class="session-title">${esc(state.recapLabel)}</th>
            ${headTop}
          </tr>
          <tr>
            <th class="time-cell">
              <div class="time-stack">
                <span>${formatClock(timeline.recap.start)}</span>
                <span>-</span>
                <span>${formatClock(timeline.recap.end)}</span>
              </div>
            </th>
            ${headTimes}
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <footer class="sheet-footer">
      <div class="sign-block">${signature}${footerBits}</div>
    </footer>
  </div>
</body>
</html>`;
}

export function printWebRoutine(html: string) {
  if (typeof document === "undefined") return;

  const oldIframe = document.getElementById("routine-print-frame");
  if (oldIframe) {
    try {
      oldIframe.remove();
    } catch {}
  }

  const iframe = document.createElement("iframe");
  iframe.id = "routine-print-frame";
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "297mm";
  iframe.style.height = "210mm";
  iframe.style.border = "none";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document;
  if (!doc) {
    const win = window.open("", "_blank");
    if (win) {
      win.document.open();
      win.document.write(html);
      win.document.close();
      win.focus();
      setTimeout(() => win.print(), 300);
    }
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const triggerPrint = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn("Iframe print failed, falling back to window:", err);
      const win = window.open("", "_blank");
      if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
        win.focus();
        setTimeout(() => win.print(), 300);
      }
    }
    setTimeout(() => {
      try {
        iframe?.remove();
      } catch {}
    }, 4000);
  };

  const fonts = (doc as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
  if (fonts?.ready) {
    fonts.ready
      .then(() => setTimeout(triggerPrint, 150))
      .catch(() => setTimeout(triggerPrint, 400));
  } else {
    setTimeout(triggerPrint, 400);
  }
}

async function printHtml(html: string) {
  await Print.printAsync({ html, width: 842, height: 595 });
}

async function shareHtml(html: string) {
  try {
    const file = await Print.printToFileAsync({ html, width: 842, height: 595 });
    const available = await Sharing.isAvailableAsync();
    if (!available) {
      await printHtml(html);
      return;
    }
    await Sharing.shareAsync(file.uri, {
      mimeType: "application/pdf",
      dialogTitle: "Download Notice Board Routine",
      UTI: "com.adobe.pdf",
    });
  } catch (err) {
    console.warn("Direct PDF download fallback to print:", err);
    await printHtml(html);
  }
}

export async function downloadRoutine(state: AppState, day: DayPlan) {
  const html = routineHtml(state, day);
  if (Platform.OS === "web") {
    printWebRoutine(html);
    return;
  }
  await shareHtml(html);
}

export const shareOrPrintRoutine = downloadRoutine;


