import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextDirection,
  TextRun,
  UnderlineType,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
} from "docx";
import { buildTimeline, rowCells } from "./schedule";
import { downloadBlob } from "./storage";
import { batchLines, formatModule, joinWithAnd, orderedManagers } from "./text";
import { formatClock, formatDayNumber, formatSignatureDate, formatSlashDate, weekdayName } from "./time";
import type { AppState, DayPlan, HeaderStyle } from "./types";

const PAGE_WIDTH = 16838;
const PAGE_HEIGHT = 11906;
const MARGIN = 420;
const FONT = "Times New Roman";

const line = (style: (typeof BorderStyle)[keyof typeof BorderStyle], size: number): IBorderOptions => ({
  style,
  size,
  color: "000000",
});

const box = {
  top: line(BorderStyle.SINGLE, 4),
  bottom: line(BorderStyle.SINGLE, 4),
  left: line(BorderStyle.SINGLE, 4),
  right: line(BorderStyle.SINGLE, 4),
};

const open = {
  top: line(BorderStyle.NONE, 0),
  bottom: line(BorderStyle.NONE, 0),
  left: line(BorderStyle.NONE, 0),
  right: line(BorderStyle.NONE, 0),
};

type RunOpts = { bold?: boolean; underline?: boolean; size?: number };

function text(value: string, opts: RunOpts = {}): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: 240 },
    children: [
      new TextRun({
        text: value,
        bold: opts.bold,
        underline: opts.underline ? { type: UnderlineType.SINGLE } : undefined,
        font: FONT,
        size: opts.size ?? 20,
      }),
    ],
  });
}

function clockLines(start: number, end: number, size = 18): Paragraph[] {
  return [formatClock(start), "-", formatClock(end)].map((value) => text(value, { size }));
}

function cell({
  paragraphs,
  width,
  rowSpan,
  columnSpan,
  vertical,
  borders = box,
}: {
  paragraphs: Paragraph[];
  width: number;
  rowSpan?: number;
  columnSpan?: number;
  vertical?: boolean;
  borders?: typeof box;
}): TableCell {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    rowSpan,
    columnSpan,
    verticalAlign: VerticalAlign.CENTER,
    textDirection: vertical ? TextDirection.BOTTOM_TO_TOP_LEFT_TO_RIGHT : undefined,
    margins: { top: 28, bottom: 28, left: 40, right: 40 },
    children: paragraphs.length > 0 ? paragraphs : [text("")],
  });
}

function headerSize(style: HeaderStyle): { bold?: boolean; size: number } {
  if (style === "title") return { bold: true, size: 28 };
  if (style === "subtitle") return { bold: true, size: 24 };
  return { size: 22 };
}

function columnPlan(day: DayPlan): number[] {
  const timeline = buildTimeline(day);
  const sessions = timeline.slots.filter((slot) => slot.kind === "session").length;
  const breaks = timeline.slots.length - sessions;
  const tableWidth = PAGE_WIDTH - MARGIN * 2;
  const batch = Math.round(tableWidth * 0.08);
  const recap = Math.round(tableWidth * 0.11);
  const breakWidth = Math.round(tableWidth * 0.055);
  const used = batch + recap + breaks * breakWidth;
  const sessionWidth = sessions > 0 ? Math.floor((tableWidth - used) / sessions) : 0;
  const widths = [batch, recap];
  let sessionSeen = 0;
  for (const slot of timeline.slots) {
    if (slot.kind === "break") widths.push(breakWidth);
    else {
      sessionSeen += 1;
      widths.push(sessionSeen === sessions ? tableWidth - widths.reduce((sum, value) => sum + value, 0) : sessionWidth);
    }
  }
  return widths;
}

function spanWidth(widths: number[], start: number, span: number): number {
  return widths.slice(start, start + span).reduce((sum, value) => sum + value, 0);
}

export function buildScheduleDocument(state: AppState, day: DayPlan, signature?: Uint8Array | null): Document {
  const timeline = buildTimeline(day);
  const widths = columnPlan(day);
  const rows = state.batches.map((batch) => ({
    batch,
    managers: orderedManagers(batch.roster, day.managers[batch.id] ?? []),
    cells: rowCells(day, batch.id),
  }));
  const weekday = weekdayName(day.date);
  const tableWidth = widths.reduce((sum, value) => sum + value, 0);

  const headerRow: TableCell[] = [
    cell({ paragraphs: [text("")], width: widths[0], rowSpan: 2 }),
    cell({ paragraphs: [text(state.recapLabel, { bold: true, size: 20 })], width: widths[1] }),
  ];
  timeline.slots.forEach((slot, index) => {
    const width = widths[index + 2];
    if (slot.kind === "break") {
      headerRow.push(cell({ paragraphs: clockLines(slot.start, slot.end), width, rowSpan: 2 }));
    } else {
      headerRow.push(cell({ paragraphs: [text(`Session - ${slot.number}`, { bold: true, size: 20 })], width }));
    }
  });

  const timeRow: TableCell[] = [cell({ paragraphs: clockLines(timeline.recap.start, timeline.recap.end), width: widths[1] })];
  timeline.slots.forEach((slot, index) => {
    if (slot.kind !== "session") return;
    timeRow.push(cell({ paragraphs: clockLines(slot.start, slot.end), width: widths[index + 2] }));
  });

  const body: TableRow[] = [];
  if (rows.length === 0) {
    body.push(
      new TableRow({
        children: [
          cell({
            paragraphs: [text("Add a batch to fill the routine.", { size: 20 })],
            width: tableWidth,
            columnSpan: widths.length,
          }),
        ],
      }),
    );
  } else {
    rows.forEach((row, rowIndex) => {
      let column = 0;
      const children: TableCell[] = [
        cell({
          paragraphs: batchLines(row.batch.name, row.batch.id).map((line) => text(line, { bold: true, size: 20 })),
          width: widths[0],
        }),
        cell({
          paragraphs:
            row.managers.length > 0
              ? [text("ID No.-", { bold: true, size: 20 }), text(joinWithAnd(row.managers), { bold: true, size: 20 })]
              : [text("")],
          width: widths[1],
        }),
      ];
      column = 2;
      for (const item of row.cells) {
        if (item.kind === "skip") continue;
        if (item.kind === "break") {
          if (rowIndex === 0) {
            children.push(
              cell({
                paragraphs: [text(item.label, { bold: true, size: 20 })],
                width: widths[column],
                rowSpan: rows.length,
                vertical: true,
              }),
            );
          }
          column += 1;
          continue;
        }
        const moduleLine = formatModule(item.content.code, item.content.note);
        const teachers = joinWithAnd(item.content.teachers);
        const paragraphs: Paragraph[] = [];
        if (moduleLine) paragraphs.push(text(moduleLine, { bold: true, size: 20 }));
        if (teachers) paragraphs.push(text(teachers, { underline: true, size: 20 }));
        children.push(
          cell({
            paragraphs,
            width: spanWidth(widths, column, item.span),
            columnSpan: item.span > 1 ? item.span : undefined,
          }),
        );
        column += item.span;
      }
      body.push(new TableRow({ cantSplit: true, children }));
    });
  }

  const info = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: [Math.round(tableWidth * 0.34), Math.round(tableWidth * 0.32), tableWidth - Math.round(tableWidth * 0.66)],
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: [
          cell({
            paragraphs: [text(`Date: ${formatSlashDate(day.date)}${weekday ? ` (${weekday})` : ""}`, { bold: true, size: 22 })],
            width: Math.round(tableWidth * 0.34),
            borders: open,
          }),
          cell({
            paragraphs: [text("Daily Schedule", { bold: true, size: 28 })],
            width: Math.round(tableWidth * 0.32),
            borders: open,
          }),
          cell({
            paragraphs: [text(formatDayNumber(day.dayNumber), { bold: true, size: 24 })],
            width: tableWidth - Math.round(tableWidth * 0.66),
            borders: open,
          }),
        ],
      }),
    ],
  });

  const schedule = new Table({
    width: { size: tableWidth, type: WidthType.DXA },
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [new TableRow({ cantSplit: true, children: headerRow }), new TableRow({ cantSplit: true, children: timeRow }), ...body],
  });

  const signatureParagraphs: Paragraph[] = [];
  if (signature && signature.length > 0) {
    signatureParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: 200, after: 0 },
        children: [
          new ImageRun({
            type: "png",
            data: signature,
            transformation: { width: 180, height: 44 },
          }),
        ],
      }),
    );
  }
  const signLines = [
    state.footer.signatureDate ? formatSignatureDate(state.footer.signatureDate) : "",
    state.footer.name,
    ...state.footer.lines.filter((item) => item.trim()),
  ];
  signLines.forEach((value, index) => {
    signatureParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { before: index === 0 && signatureParagraphs.length === 0 ? 200 : 0, after: 0 },
        children: [
          new TextRun({
            text: value,
            bold: index < 2,
            font: FONT,
            size: index === 1 ? 24 : 22,
          }),
        ],
      }),
    );
  });

  return new Document({
    styles: { default: { document: { run: { font: FONT, size: 22 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.LANDSCAPE, width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          },
        },
        children: [
          ...state.header.map(
            (item) =>
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0, line: 276 },
                children: [new TextRun({ text: item.text, font: FONT, ...headerSize(item.style) })],
              }),
          ),
          new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }),
          info,
          new Paragraph({ spacing: { before: 60, after: 40 }, children: [] }),
          schedule,
          ...signatureParagraphs,
        ],
      },
    ],
  });
}

function dataUrlBytes(dataUrl: string): Uint8Array | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  try {
    const binary = meta.includes(";base64") ? atob(payload) : decodeURIComponent(payload);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

export async function signatureToPng(signature: string | null): Promise<Uint8Array | null> {
  if (!signature || typeof document === "undefined") return null;
  if (signature.startsWith("data:image/png") || signature.startsWith("data:image/jpeg") || signature.startsWith("data:image/jpg")) {
    return dataUrlBytes(signature);
  }
  try {
    const image = new Image();
    image.src = signature;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 440;
    canvas.height = 108;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return dataUrlBytes(canvas.toDataURL("image/png"));
  } catch {
    return null;
  }
}

export async function downloadScheduleDocx(state: AppState, day: DayPlan) {
  const signature = await signatureToPng(state.footer.signature);
  const blob = await Packer.toBlob(buildScheduleDocument(state, day, signature));
  const url = URL.createObjectURL(blob);
  const number = String(day.dayNumber).padStart(2, "0");
  downloadBlob(`daily-schedule-day-${number}-${day.date}.docx`, url);
  URL.revokeObjectURL(url);
}
