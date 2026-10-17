import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ChevronDown } from "lucide-react";
import {
  buildTimeline,
  cellHasConflict,
  findConflicts,
  maxSpanFrom,
  rowCells,
  type SheetSession,
} from "../lib/schedule";
import {
  formatModule,
  formatModuleCode,
  joinWithAnd,
  orderedManagers,
  parseModuleCode,
  sessionSpanLabel,
} from "../lib/text";
import { formatClock, formatRange } from "../lib/time";
import type { CellContent, CellSelection, DayPlan } from "../lib/types";
import { useSchedule } from "../state";

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
        <p className="text-sm text-stone-600">Click a session, then pick a teacher and module.</p>
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
          key={`${selection!.batchId}:${selectedCell.cell.anchorId}`}
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
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [extraTeacher, setExtraTeacher] = useState(false);
  const maxSpan = maxSpanFrom(day.slots, cell.anchorId);
  const parsed = parseModuleCode(cell.content.code);
  const moduleNumber = parsed?.moduleNumber ?? "";
  const subNumber = parsed?.subNumber ?? "";
  const identity = `${batchId}:${cell.anchorId}`;

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      setOpen(null);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open]);

  function update(next: CellContent) {
    dispatch({
      type: "set-cell",
      dayId: day.id,
      batchId,
      sessionId: cell.anchorId,
      cell: next,
    });
  }

  function setParts(nextModule: string, nextSub: string) {
    update({ ...cell.content, code: formatModuleCode(nextModule, nextSub) });
    setOpen(null);
  }

  function setTeacher(index: number, name: string) {
    const teachers = cell.content.teachers.slice();
    if (!name) {
      if (index < teachers.length) teachers.splice(index, 1);
    } else if (index >= teachers.length) {
      if (!teachers.some((teacher) => teacher.toLowerCase() === name.toLowerCase())) teachers.push(name);
    } else if (!teachers.some((teacher, item) => item !== index && teacher.toLowerCase() === name.toLowerCase())) {
      teachers[index] = name;
    }
    update({ ...cell.content, teachers });
    setExtraTeacher(false);
    setOpen(null);
  }

  const teacherRows = cell.content.teachers.length > 0 ? cell.content.teachers : [""];
  const rows = extraTeacher ? [...teacherRows, ""] : teacherRows;
  const canMerge = maxSpan >= 2 || cell.span >= 2;

  return (
    <div className="cell-panel" ref={panelRef} data-cell-editor>
      <div className="cell-head">
        <h3>
          {batchName} · {sessionSpanLabel(cell.numbers)}
        </h3>
        <button type="button" className="more-link" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="teacher-picks">
        {rows.map((name, index) => (
          <div key={`${identity}-teacher-${index}`} className="teacher-line">
            <Pick
              label={index === 0 ? "Teacher" : `Teacher ${index + 1}`}
              value={name}
              placeholder="Select teacher"
              options={teacherChoices(state.teachers.map((teacher) => teacher.name), name, cell.content.teachers)}
              open={open === `teacher-${index}`}
              onToggle={() => setOpen(open === `teacher-${index}` ? null : `teacher-${index}`)}
              onPick={(option) => setTeacher(index, option)}
              allowClear={Boolean(name)}
            />
            {index > 0 ? (
              <button type="button" className="tiny-x" aria-label="Remove teacher" onClick={() => setTeacher(index, "")}>
                ×
              </button>
            ) : null}
          </div>
        ))}
        <button
          type="button"
          className="add-teacher"
          onClick={() => {
            if (cell.content.teachers.length === 0) {
              setOpen("teacher-0");
              return;
            }
            setExtraTeacher(true);
            setOpen(`teacher-${cell.content.teachers.length}`);
          }}
        >
          + teacher
        </button>
      </div>
      <div className="module-picks">
        <Pick
          label="Module number"
          value={moduleNumber}
          placeholder="M-7"
          options={withCurrent(state.moduleNumbers, moduleNumber)}
          open={open === "module"}
          onToggle={() => setOpen(open === "module" ? null : "module")}
          onPick={(option) => setParts(option, subNumber)}
          allowClear={Boolean(moduleNumber)}
        />
        <Pick
          label="Sub-number"
          value={subNumber}
          placeholder=".04"
          options={withCurrent(state.subNumbers, subNumber)}
          open={open === "sub"}
          onToggle={() => setOpen(open === "sub" ? null : "sub")}
          onPick={(option) => setParts(moduleNumber, option)}
          allowClear={Boolean(subNumber)}
        />
        <div className="code-chip" aria-label="Module code">
          {cell.content.code.trim() || "M-"}
        </div>
      </div>
      <div className="cell-foot">
        <label className="merge-toggle">
          <input
            type="checkbox"
            checked={cell.span > 1}
            disabled={!canMerge}
            onChange={(event) =>
              dispatch({
                type: "set-span",
                dayId: day.id,
                batchId,
                sessionId: cell.anchorId,
                span: event.target.checked ? Math.min(2, maxSpan) : 1,
              })
            }
          />
          Merge with next
        </label>
        <button type="button" className="more-link" aria-expanded={more} onClick={() => setMore((value) => !value)}>
          {more ? "Less" : "More"}
        </button>
      </div>
      {more ? (
        <div className="more-fields">
          <label className="block">
            <span className="field-label">Note</span>
            <input
              className="field"
              value={cell.content.note}
              placeholder="(Theory)"
              onChange={(event) => update({ ...cell.content, note: event.target.value })}
            />
          </label>
          <label className="block">
            <span className="field-label">Module text</span>
            <input
              className="field"
              value={cell.content.code}
              placeholder="M- 7.04"
              onChange={(event) => update({ ...cell.content, code: event.target.value })}
            />
          </label>
          {maxSpan > 2 || cell.span > 2 ? (
            <label className="block">
              <span className="field-label">Merged sessions</span>
              <select
                className="field"
                value={cell.span}
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
                {Array.from({ length: Math.max(cell.span, maxSpan) }, (_, index) => index + 1).map((span) => (
                  <option key={span} value={span}>
                    {span === 1 ? "This session only" : `${span} sessions`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}
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

function Pick({
  label,
  value,
  placeholder,
  options,
  open,
  onToggle,
  onPick,
  allowClear,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: string[];
  open: boolean;
  onToggle: () => void;
  onPick: (option: string) => void;
  allowClear: boolean;
}) {
  return (
    <div className="pick">
      <span className="field-label">{label}</span>
      <button
        type="button"
        className="pick-btn"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={onToggle}
      >
        <span className={value ? "" : "pick-placeholder"}>{value || placeholder}</span>
        <ChevronDown size={14} />
      </button>
      {open ? (
        <ul className="pick-menu" role="listbox" aria-label={label}>
          {allowClear ? (
            <li>
              <button type="button" role="option" onClick={() => onPick("")}>
                —
              </button>
            </li>
          ) : null}
          {options.length === 0 ? (
            <li className="pick-empty">Add names in Settings</li>
          ) : (
            options.map((option) => (
              <li key={option}>
                <button type="button" role="option" aria-selected={option === value} onClick={() => onPick(option)}>
                  {option}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
