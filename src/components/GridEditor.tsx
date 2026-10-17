import { useState } from "react";
import { AlertTriangle, Link2 } from "lucide-react";
import { buildTimeline, cellHasConflict, findConflicts, maxSpanFrom, rowCells, type SheetSession } from "../lib/schedule";
import { formatModuleCode, joinWithAnd, orderedManagers, parseModuleCode } from "../lib/text";
import { formatClock, formatRange } from "../lib/time";
import type { CellContent, DayPlan } from "../lib/types";
import { useSchedule } from "../state";

export function GridEditor({ day }: { day: DayPlan }) {
  const { state } = useSchedule();
  const timeline = buildTimeline(day);
  const conflicts = state.showConflicts ? findConflicts(state.batches, day) : [];
  const rows = state.batches.map((batch) => ({
    batch,
    managers: orderedManagers(batch.roster, day.managers[batch.id] ?? []),
    cells: rowCells(day, batch.id),
  }));

  return (
    <div>
      {conflicts.length > 0 ? (
        <div className="warn-list mb-3">
          <div className="mb-1 flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 font-semibold">
              <AlertTriangle size={15} /> Same teacher in two batches
            </div>
            <ClashSwitch />
          </div>
          <ul>
            {conflicts.map((conflict) => (
              <li key={`${conflict.sessionId}-${conflict.teacher}`}>
                {conflict.teacher} is in {conflict.batchNames.join(" and ")} during Session - {conflict.sessionNumber}.
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="mb-2 flex justify-end">
          <ClashSwitch />
        </div>
      )}
      {state.batches.length === 0 ? (
        <p className="text-sm text-stone-600">Add a batch below to start the grid.</p>
      ) : (
        <div className="edit-grid-wrap">
          <table className="edit-grid">
            <thead>
              <tr>
                <th style={{ width: "8%" }}>Batch</th>
                <th style={{ width: "11%" }}>
                  {state.recapLabel}
                  <span className="time-note">{formatRange(timeline.recap.start, timeline.recap.end)}</span>
                </th>
                {timeline.slots.map((slot) => (
                  <th key={slot.id} style={{ width: slot.kind === "break" ? "5%" : undefined }}>
                    {slot.kind === "session" ? `Session - ${slot.number}` : formatClock(slot.start)}
                    <span className="time-note">
                      {slot.kind === "session" ? formatRange(slot.start, slot.end) : formatClock(slot.end)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={row.batch.id}>
                  <th className="batch-read">{row.batch.name}</th>
                  <td className="recap-read">
                    {row.managers.length > 0 ? (
                      <>
                        <div>ID No.-</div>
                        <div>{joinWithAnd(row.managers)}</div>
                      </>
                    ) : (
                      <span className="font-medium text-stone-400">No ID</span>
                    )}
                  </td>
                  {row.cells.map((cell) => {
                    if (cell.kind === "skip") return null;
                    if (cell.kind === "break") {
                      if (rowIndex !== 0) return null;
                      return (
                        <td key={cell.id} rowSpan={rows.length} className="text-center">
                          <span className="vlabel">{cell.label}</span>
                        </td>
                      );
                    }
                    const clash = cellHasConflict(conflicts, row.batch.id, cell.sessionIds);
                    return (
                      <td key={cell.anchorId} colSpan={cell.span} className={clash ? "session-edit conflict" : "session-edit"}>
                        <InlineCell day={day} batchId={row.batch.id} cell={cell} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClashSwitch() {
  const { state, dispatch } = useSchedule();
  return (
    <label className="switch shrink-0">
      <input
        type="checkbox"
        checked={state.showConflicts}
        onChange={(event) => dispatch({ type: "set-show-conflicts", value: event.target.checked })}
      />
      Clash warning
    </label>
  );
}

function InlineCell({ day, batchId, cell }: { day: DayPlan; batchId: string; cell: SheetSession }) {
  const { state, dispatch } = useSchedule();
  const [extra, setExtra] = useState(0);
  const parsed = parseModuleCode(cell.content.code);
  const moduleNumber = parsed?.moduleNumber ?? "";
  const subNumber = parsed?.subNumber ?? "";
  const filled = cell.content.teachers.map((name) => name.trim()).filter(Boolean);
  const rows = filled.length + extra > 0 ? [...filled, ...Array.from({ length: extra }, () => "")] : [""];
  const maxSpan = maxSpanFrom(day.slots, cell.anchorId);
  const canMerge = maxSpan >= 2 || cell.span >= 2;

  function update(next: CellContent) {
    dispatch({
      type: "set-cell",
      dayId: day.id,
      batchId,
      sessionId: cell.anchorId,
      cell: next,
    });
  }

  function setTeacher(index: number, name: string) {
    const teachers = filled.slice();
    if (!name) {
      if (index < teachers.length) teachers.splice(index, 1);
    } else if (index >= teachers.length) {
      if (!teachers.some((teacher) => teacher.toLowerCase() === name.toLowerCase())) teachers.push(name);
    } else if (!teachers.some((teacher, item) => item !== index && teacher.toLowerCase() === name.toLowerCase())) {
      teachers[index] = name;
    }
    update({ ...cell.content, teachers });
    setExtra(0);
  }

  return (
    <div className="inline-cell">
      <button
        type="button"
        className="merge-corner"
        aria-pressed={cell.span > 1}
        aria-label="Merge with next"
        disabled={!canMerge}
        onClick={() =>
          dispatch({
            type: "set-span",
            dayId: day.id,
            batchId,
            sessionId: cell.anchorId,
            span: cell.span > 1 ? 1 : Math.min(2, maxSpan),
          })
        }
      >
        <Link2 size={11} />
      </button>
      <div className="inline-mods">
        <select
          className="sheet-select"
          aria-label="Module number"
          value={moduleNumber}
          onChange={(event) => update({ ...cell.content, code: formatModuleCode(event.target.value, subNumber) })}
        >
          <option value="">—</option>
          {withCurrent(state.moduleNumbers, moduleNumber).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <select
          className="sheet-select sub"
          aria-label="Sub-number"
          value={subNumber}
          onChange={(event) => update({ ...cell.content, code: formatModuleCode(moduleNumber, event.target.value) })}
        >
          <option value="">—</option>
          {withCurrent(state.subNumbers, subNumber).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <div className="inline-teachers">
        {rows.map((name, index) => (
          <select
            key={`${cell.anchorId}-teacher-${index}`}
            className="sheet-select teacher"
            aria-label={index === 0 ? "Teacher" : `Teacher ${index + 1}`}
            value={name}
            onChange={(event) => setTeacher(index, event.target.value)}
          >
            <option value="">—</option>
            {teacherChoices(
              state.teachers.map((teacher) => teacher.name),
              name,
              filled,
            ).map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ))}
        <button
          type="button"
          className="inline-plus"
          aria-label="Add teacher"
          onClick={() => {
            if (rows[rows.length - 1] === "") return;
            setExtra((count) => count + 1);
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

function teacherChoices(catalog: string[], current: string, selected: string[]): string[] {
  const taken = new Set(selected.filter((name) => name && name !== current).map((name) => name.toLowerCase()));
  const options = catalog.filter((name) => !taken.has(name.toLowerCase()));
  if (current && !options.some((name) => name.toLowerCase() === current.toLowerCase())) options.unshift(current);
  return options;
}

function withCurrent(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}
