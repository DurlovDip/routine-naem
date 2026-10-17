import type { Ref } from "react";
import {
  batchLines,
  formatModule,
  joinWithAnd,
  orderedManagers,
} from "../lib/text";
import { buildTimeline, rowCells } from "../lib/schedule";
import { formatClock, formatDayNumber, formatSignatureDate, formatSlashDate, weekdayName } from "../lib/time";
import type { AppState, CellContent, DayPlan } from "../lib/types";

function TimeStack({ start, end }: { start: number; end: number }) {
  return (
    <div className="time-stack">
      <span>{formatClock(start)}</span>
      <span>-</span>
      <span>{formatClock(end)}</span>
    </div>
  );
}

function ModuleBlock({ content }: { content: CellContent }) {
  const line = formatModule(content.code, content.note);
  const teachers = joinWithAnd(content.teachers);
  if (!line && !teachers) return null;
  return (
    <div className="module-block">
      {line ? <div className="module-code">{line}</div> : null}
      {teachers ? <div className="module-teachers">{teachers}</div> : null}
    </div>
  );
}

export function ScheduleSheet({
  state,
  day,
  sheetRef,
}: {
  state: AppState;
  day: DayPlan;
  sheetRef?: Ref<HTMLDivElement>;
}) {
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
  const columnCount = 2 + timeline.slots.length;
  const weekday = weekdayName(day.date);

  return (
    <div
      className={rows.length > 6 ? "sheet sheet-auto" : "sheet"}
      ref={sheetRef}
      data-dense={sessionCount >= 8 ? "true" : "false"}
    >
      <header className="sheet-header">
        {state.header.map((line) => (
          <div key={line.id} className={`header-line header-${line.style}`}>
            {line.text}
          </div>
        ))}
      </header>
      <div className="info-row">
        <div className="info-date">
          Date: {formatSlashDate(day.date)}
          {weekday ? ` (${weekday})` : ""}
        </div>
        <div className="info-title">Daily Schedule</div>
        <div className="info-day">{formatDayNumber(day.dayNumber)}</div>
      </div>
      <div className="table-area">
        <table>
          <colgroup>
            <col style={{ width: "8%" }} />
            <col style={{ width: "11%" }} />
            {timeline.slots.map((slot) => (
              <col
                key={slot.id}
                style={{ width: slot.kind === "break" ? `${breakWidth}%` : `${sessionWidth}%` }}
              />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th rowSpan={2} className="corner" />
              <th className="session-title">{state.recapLabel}</th>
              {timeline.slots.map((slot) =>
                slot.kind === "break" ? (
                  <th key={slot.id} rowSpan={2} className="break-time">
                    <TimeStack start={slot.start} end={slot.end} />
                  </th>
                ) : (
                  <th key={slot.id} className="session-title">
                    Session - {slot.number}
                  </th>
                ),
              )}
            </tr>
            <tr>
              <th className="time-cell">
                <TimeStack start={timeline.recap.start} end={timeline.recap.end} />
              </th>
              {timeline.slots.map((slot) =>
                slot.kind === "session" ? (
                  <th key={slot.id} className="time-cell">
                    <TimeStack start={slot.start} end={slot.end} />
                  </th>
                ) : null,
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columnCount} className="sheet-empty">
                  Add a batch to fill the routine.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIndex) => (
                <tr key={row.batch.id}>
                  <th className="batch-name">
                    {batchLines(row.batch.name, row.batch.id).map((line, index) => (
                      <span key={index}>{line}</span>
                    ))}
                  </th>
                  <td className="recap-cell">
                    {row.managers.length > 0 ? (
                      <>
                        <div>ID No.-</div>
                        <div>{joinWithAnd(row.managers)}</div>
                      </>
                    ) : null}
                  </td>
                  {row.cells.map((cell) => {
                    if (cell.kind === "skip") return null;
                    if (cell.kind === "break") {
                      if (rowIndex !== 0) return null;
                      return (
                        <td key={cell.id} rowSpan={rows.length} className="break-label">
                          <span>{cell.label}</span>
                        </td>
                      );
                    }
                    return (
                      <td key={cell.anchorId} colSpan={cell.span} className="session-cell">
                        <ModuleBlock content={cell.content} />
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <footer className="sheet-footer">
        <div className="sign-block">
          {state.footer.signature ? (
            <img className="sign-img" src={state.footer.signature} alt="" />
          ) : (
            <div className="sign-gap" />
          )}
          {state.footer.signatureDate ? (
            <div className="sign-date">{formatSignatureDate(state.footer.signatureDate)}</div>
          ) : null}
          {state.footer.name ? <div className="sign-name">{state.footer.name}</div> : null}
          {state.footer.lines.map((line, index) =>
            line.trim() ? (
              <div key={index} className="sign-line">
                {line}
              </div>
            ) : null,
          )}
        </div>
      </footer>
    </div>
  );
}
