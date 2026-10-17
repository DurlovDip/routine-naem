import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import {
  buildTimeline,
  cellHasConflict,
  findConflicts,
  maxSpanFrom,
  rowCells,
  type SheetSession,
} from "../lib/schedule";
import { formatModule, joinWithAnd, orderedManagers, sessionSpanLabel } from "../lib/text";
import { formatClock, formatRange } from "../lib/time";
import type { CellContent, CellSelection, DayPlan } from "../lib/types";
import { useSchedule } from "../state";
import { Button } from "./ui";

export function GridEditor({
  day,
  selection,
  onSelect,
}: {
  day: DayPlan;
  selection: CellSelection | null;
  onSelect: (selection: CellSelection | null) => void;
}) {
  const { state, dispatch } = useSchedule();
  const timeline = buildTimeline(day);
  const conflicts = state.showConflicts ? findConflicts(state.batches, day) : [];
  const rows = state.batches.map((batch) => ({
    batch,
    managers: orderedManagers(batch.roster, day.managers[batch.id] ?? []),
    cells: rowCells(day, batch.id),
  }));

  const selectedCell = useMemo(() => {
    if (!selection) return null;
    const row = rows.find((item) => item.batch.id === selection.batchId);
    const cell = row?.cells.find(
      (item) => item.kind === "session" && item.sessionIds.includes(selection.sessionId),
    );
    if (!row || !cell || cell.kind !== "session") return null;
    return { batchName: row.batch.name, cell };
  }, [rows, selection]);

  useEffect(() => {
    if (!selection || !selectedCell) return;
    if (selectedCell.cell.anchorId !== selection.sessionId) {
      onSelect({ batchId: selection.batchId, sessionId: selectedCell.cell.anchorId });
    }
  }, [onSelect, selectedCell, selection]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-stone-600">
          Click a cell to edit the module and teachers. Adjacent sessions, with no break between
          them, can merge for one batch.
        </p>
        <label className="switch shrink-0">
          <input
            type="checkbox"
            checked={state.showConflicts}
            onChange={(event) =>
              dispatch({ type: "set-show-conflicts", value: event.target.checked })
            }
          />
          Clash warning
        </label>
      </div>
      {conflicts.length > 0 ? (
        <div className="warn-list mb-3">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={15} /> Same teacher in two batches
          </div>
          <ul>
            {conflicts.map((conflict) => (
              <li key={`${conflict.sessionId}-${conflict.teacher}`}>
                {conflict.teacher} is in {conflict.batchNames.join(" and ")} during Session -{" "}
                {conflict.sessionNumber}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {selectedCell ? (
        <CellPanel
          day={day}
          batchId={selection!.batchId}
          batchName={selectedCell.batchName}
          cell={selectedCell.cell}
          onClose={() => onSelect(null)}
        />
      ) : null}
      {state.batches.length === 0 ? (
        <p className="text-sm text-stone-600">Add a batch below to start the grid.</p>
      ) : (
        <div className="edit-grid-wrap">
          <table className="edit-grid">
            <thead>
              <tr>
                <th style={{ width: "9%" }}>Batch</th>
                <th style={{ width: "12%" }}>
                  {state.recapLabel}
                  <span className="time-note">
                    {formatRange(timeline.recap.start, timeline.recap.end)}
                  </span>
                </th>
                {timeline.slots.map((slot) => (
                  <th key={slot.id} style={{ width: slot.kind === "break" ? "6%" : undefined }}>
                    {slot.kind === "session" ? `Session - ${slot.number}` : formatClock(slot.start)}
                    <span className="time-note">
                      {slot.kind === "session"
                        ? formatRange(slot.start, slot.end)
                        : formatClock(slot.end)}
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
                    const selected =
                      selection?.batchId === row.batch.id &&
                      cell.sessionIds.includes(selection.sessionId);
                    const clash = cellHasConflict(conflicts, row.batch.id, cell.sessionIds);
                    const line = formatModule(cell.content.code, cell.content.note);
                    const teachers = joinWithAnd(cell.content.teachers);
                    return (
                      <td key={cell.anchorId} colSpan={cell.span}>
                        <button
                          type="button"
                          className={`cell-btn${selected ? " selected" : ""}${clash ? " conflict" : ""}`}
                          onClick={() =>
                            onSelect({ batchId: row.batch.id, sessionId: cell.anchorId })
                          }
                        >
                          {line ? <span className="code">{line}</span> : <span className="empty">Empty</span>}
                          {teachers ? <span className="who">{teachers}</span> : null}
                          {cell.span > 1 ? (
                            <span className="text-[10px] font-semibold text-[#1b4332]">
                              Merged · {cell.span} sessions
                            </span>
                          ) : null}
                        </button>
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

function CellPanel({
  day,
  batchId,
  batchName,
  cell,
  onClose,
}: {
  day: DayPlan;
  batchId: string;
  batchName: string;
  cell: SheetSession;
  onClose: () => void;
}) {
  const { state, dispatch } = useSchedule();
  const [teacherDraft, setTeacherDraft] = useState("");
  const [codeFocus, setCodeFocus] = useState(false);
  const [teacherFocus, setTeacherFocus] = useState(false);
  const maxSpan = maxSpanFrom(day.slots, cell.anchorId);
  const timeline = buildTimeline(day);
  const timed = timeline.slots.filter((slot) => slot.kind === "session");
  const first = timed.find((slot) => slot.id === cell.sessionIds[0]);
  const last = timed.find((slot) => slot.id === cell.sessionIds[cell.sessionIds.length - 1]);
  const codeQuery = cell.content.code.trim().toLowerCase();
  const moduleOptions = state.modules
    .filter((module) => {
      const hay = `${module.code} ${module.title}`.toLowerCase();
      return !codeQuery || hay.includes(codeQuery);
    })
    .slice(0, 8);
  const teacherQuery = teacherDraft.trim().toLowerCase();
  const teacherOptions = state.teachers
    .filter((teacher) => !teacherQuery || teacher.name.toLowerCase().includes(teacherQuery))
    .slice(0, 8);

  function update(next: CellContent) {
    dispatch({
      type: "set-cell",
      dayId: day.id,
      batchId,
      sessionId: cell.anchorId,
      cell: next,
    });
  }

  function addTeacher(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (cell.content.teachers.some((teacher) => teacher.toLowerCase() === trimmed.toLowerCase())) {
      setTeacherDraft("");
      return;
    }
    update({ ...cell.content, teachers: [...cell.content.teachers, trimmed] });
    setTeacherDraft("");
  }

  function moveTeacher(index: number, dir: -1 | 1) {
    const next = cell.content.teachers.slice();
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    update({ ...cell.content, teachers: next });
  }

  const knownTeacher = (name: string) =>
    state.teachers.some((teacher) => teacher.name.toLowerCase() === name.trim().toLowerCase());

  return (
    <div className="cell-panel">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3>
            {cell.span > 1 ? "Merged cell · " : ""}
            {batchName} · {sessionSpanLabel(cell.numbers)}
          </h3>
          <p className="text-sm text-stone-600">
            {first && last ? formatRange(first.start, last.end) : ""}
            {cell.span > 1 ? " · one class across these sessions" : ""}
          </p>
        </div>
        <Button tone="quiet" onClick={onClose}>
          Close
        </Button>
      </div>
      <div className="serif-preview mb-3">
        <div className="code">{formatModule(cell.content.code, cell.content.note) || "Module"}</div>
        <div className="who">{joinWithAnd(cell.content.teachers) || "Teachers"}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="suggest block">
          <span className="field-label">Module code</span>
          <input
            className="field"
            value={cell.content.code}
            onFocus={() => setCodeFocus(true)}
            onBlur={() => setCodeFocus(false)}
            onChange={(event) => update({ ...cell.content, code: event.target.value })}
          />
          {codeFocus && moduleOptions.length > 0 ? (
            <ul className="suggest-list">
              {moduleOptions.map((module) => (
                <li key={module.id}>
                  <button
                    type="button"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      update({ ...cell.content, code: module.code, note: module.title });
                      setCodeFocus(false);
                    }}
                  >
                    <strong>{module.code}</strong>
                    {module.title ? <span className="ml-2 text-stone-500">{module.title}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </label>
        <label className="block">
          <span className="field-label">Note</span>
          <input
            className="field"
            value={cell.content.note}
            placeholder="(Theory)"
            onChange={(event) => update({ ...cell.content, note: event.target.value })}
          />
        </label>
      </div>
      <div className="mt-3">
        <div className="field-label">Teachers</div>
        {cell.content.teachers.map((name, index) => (
          <div key={`${name}-${index}`} className="teacher-row">
            <span className="text-xs text-stone-500">{index + 1}</span>
            <span className="name">
              {name}
              {!knownTeacher(name) ? (
                <button
                  type="button"
                  className="btn btn-quiet ml-1"
                  onClick={() => dispatch({ type: "add-teacher", name })}
                >
                  Save to library
                </button>
              ) : null}
            </span>
            <span className="flex gap-1">
              <button
                type="button"
                className="icon-btn"
                aria-label="Move teacher up"
                disabled={index === 0}
                onClick={() => moveTeacher(index, -1)}
              >
                <ChevronUp size={14} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Move teacher down"
                disabled={index === cell.content.teachers.length - 1}
                onClick={() => moveTeacher(index, 1)}
              >
                <ChevronDown size={14} />
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label={`Remove ${name}`}
                onClick={() =>
                  update({
                    ...cell.content,
                    teachers: cell.content.teachers.filter((_, item) => item !== index),
                  })
                }
              >
                <Trash2 size={14} />
              </button>
            </span>
          </div>
        ))}
        <form
          className="suggest mt-1 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            addTeacher(teacherDraft);
          }}
        >
          <div className="relative min-w-0 flex-1">
            <input
              className="field"
              placeholder="Add a teacher"
              value={teacherDraft}
              onFocus={() => setTeacherFocus(true)}
              onBlur={() => setTeacherFocus(false)}
              onChange={(event) => setTeacherDraft(event.target.value)}
            />
            {teacherFocus && teacherOptions.length > 0 ? (
              <ul className="suggest-list">
                {teacherOptions.map((teacher) => (
                  <li key={teacher.id}>
                    <button
                      type="button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        addTeacher(teacher.name);
                        setTeacherFocus(false);
                      }}
                    >
                      {teacher.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <Button type="submit" tone="primary">
            Add
          </Button>
        </form>
        <p className="hint">
          Prints as {joinWithAnd(cell.content.teachers) || "a blank teacher line"}.
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label>
          <span className="field-label">Merge</span>
          <select
            className="field"
            value={cell.span}
            disabled={maxSpan < 2 && cell.span < 2}
            onChange={(event) =>
              dispatch({
                type: "set-span",
                dayId: day.id,
                batchId,
                sessionId: cell.anchorId,
                span: Number(event.target.value),
              })
            }
          >
            {Array.from({ length: Math.max(cell.span, maxSpan) }, (_, index) => index + 1).map(
              (span) => (
                <option key={span} value={span}>
                  {span === 1 ? "This session only" : `${span} adjacent sessions`}
                </option>
              ),
            )}
          </select>
        </label>
        {cell.span > 1 ? (
          <Button
            tone="danger"
            onClick={() =>
              dispatch({
                type: "set-span",
                dayId: day.id,
                batchId,
                sessionId: cell.anchorId,
                span: 1,
              })
            }
          >
            Unmerge
          </Button>
        ) : null}
        {maxSpan < 2 ? (
          <p className="text-xs text-stone-500">A break sits beside this session, so it cannot merge sideways.</p>
        ) : null}
      </div>
      <Button
        tone="quiet"
        className="mt-2"
        onClick={() =>
          dispatch({
            type: "add-module",
            code: cell.content.code,
            title: cell.content.note,
          })
        }
      >
        Save this module to the library
      </Button>
    </div>
  );
}
