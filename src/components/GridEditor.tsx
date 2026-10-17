import { useEffect, useState } from "react";
import { AlertTriangle, Link2, Plus, Trash2 } from "lucide-react";
import { buildTimeline, cellHasConflict, findConflicts, maxSpanFrom, rowCells, type SheetSession } from "../lib/schedule";
import { formatModuleCode, orderedManagers, parseModuleCode, rosterRange } from "../lib/text";
import { formatClock, formatRange } from "../lib/time";
import type { Batch, CellContent, DayPlan } from "../lib/types";
import { useSchedule } from "../state";
import { Button, ConfirmDialog } from "./ui";

export function GridEditor({ day }: { day: DayPlan }) {
  const { state, dispatch } = useSchedule();
  const [batchToDelete, setBatchToDelete] = useState<Batch | null>(null);
  const [slotToDelete, setSlotToDelete] = useState<{ id: string; name: string } | null>(null);
  const timeline = buildTimeline(day);
  const conflicts = state.showConflicts ? findConflicts(state.batches, day) : [];
  const rows = state.batches.map((batch) => ({
    batch,
    managers: orderedManagers(batch.roster, day.managers[batch.id] ?? []),
    cells: rowCells(day, batch.id),
  }));
  const sessionCount = timeline.slots.filter((slot) => slot.kind === "session").length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            tone="primary"
            onClick={() => dispatch({ type: "add-batch" })}
            title="Add a new batch row"
          >
            <Plus size={15} /> Add Batch
          </Button>
          <Button
            tone="ghost"
            disabled={sessionCount >= 10}
            onClick={() => dispatch({ type: "add-session", dayId: day.id })}
            title={sessionCount >= 10 ? "Maximum 10 sessions reached" : "Add a new session column"}
          >
            <Plus size={15} /> Add Session
            <span className="text-xs font-normal text-stone-500">({sessionCount}/10)</span>
          </Button>
        </div>
        <ClashSwitch />
      </div>

      {conflicts.length > 0 ? (
        <div className="warn-list mb-3">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle size={15} /> Same teacher in two batches
          </div>
          <ul className="mt-1">
            {conflicts.map((conflict) => (
              <li key={`${conflict.sessionId}-${conflict.teacher}`}>
                {conflict.teacher} is in {conflict.batchNames.join(" and ")} during Session - {conflict.sessionNumber}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.batches.length === 0 ? (
        <div className="rounded-lg border border-dashed border-stone-300 p-6 text-center">
          <p className="mb-3 text-sm text-stone-600">No batches in the grid yet.</p>
          <Button tone="primary" onClick={() => dispatch({ type: "add-batch" })}>
            <Plus size={15} /> Add First Batch
          </Button>
        </div>
      ) : (
        <div>
          <div className="edit-grid-wrap">
            <table className="edit-grid">
              <thead>
                <tr>
                  <th style={{ width: "9%" }}>Batch</th>
                  <th style={{ width: "11%" }}>
                    {state.recapLabel}
                    <span className="time-note">{formatRange(timeline.recap.start, timeline.recap.end)}</span>
                  </th>
                  {timeline.slots.map((slot) => {
                    const isSession = slot.kind === "session";
                    const canDelete = isSession ? sessionCount > 1 : true;
                    return (
                      <th key={slot.id} style={{ width: slot.kind === "break" ? "5%" : undefined }}>
                        <div className="slot-header-cell">
                          <div className="slot-title">
                            {isSession ? `Session - ${slot.number}` : formatClock(slot.start)}
                          </div>
                          <span className="time-note">
                            {isSession ? formatRange(slot.start, slot.end) : formatClock(slot.end)}
                          </span>
                          {canDelete ? (
                            <button
                              type="button"
                              className="slot-del-btn"
                              title={`Delete ${isSession ? `Session - ${slot.number}` : slot.label || "Break"}`}
                              aria-label={`Delete ${isSession ? `Session - ${slot.number}` : slot.label || "Break"}`}
                              onClick={() =>
                                setSlotToDelete({
                                  id: slot.id,
                                  name: isSession ? `Session - ${slot.number}` : slot.label || "Break",
                                })
                              }
                            >
                              <Trash2 size={11} />
                            </button>
                          ) : null}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={row.batch.id}>
                    <th className="batch-read">
                      <InlineBatchCell
                        batch={row.batch}
                        onDelete={() => setBatchToDelete(row.batch)}
                      />
                    </th>
                    <td className="recap-edit-cell">
                      <InlineManagerCell
                        dayId={day.id}
                        batch={row.batch}
                        managers={row.managers}
                      />
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
              <tfoot>
                <tr>
                  <td colSpan={2 + timeline.slots.length} className="add-batch-row">
                    <button
                      type="button"
                      className="add-batch-row-btn"
                      onClick={() => dispatch({ type: "add-batch" })}
                    >
                      <Plus size={13} /> Add Batch
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                tone="ghost"
                className="text-xs"
                onClick={() => dispatch({ type: "add-batch" })}
              >
                <Plus size={13} /> Add Batch
              </Button>
              <Button
                tone="ghost"
                className="text-xs"
                disabled={sessionCount >= 10}
                onClick={() => dispatch({ type: "add-session", dayId: day.id })}
              >
                <Plus size={13} /> Add Session
              </Button>
              {rows.length > 0 ? (
                <Button
                  tone="danger"
                  className="text-xs"
                  onClick={() => setBatchToDelete(rows[rows.length - 1].batch)}
                  title={`Delete last batch (${rows[rows.length - 1].batch.name})`}
                >
                  <Trash2 size={12} /> Delete Last Batch
                </Button>
              ) : null}
              {sessionCount > 1 ? (
                <Button
                  tone="danger"
                  className="text-xs"
                  onClick={() => {
                    const lastSession = [...day.slots].reverse().find((s) => s.kind === "session");
                    if (lastSession) {
                      const timed = timeline.slots.find((s) => s.id === lastSession.id);
                      const num = timed && timed.kind === "session" ? timed.number : "";
                      setSlotToDelete({
                        id: lastSession.id,
                        name: `Session - ${num}`,
                      });
                    }
                  }}
                  title="Delete last session"
                >
                  <Trash2 size={12} /> Delete Last Session
                </Button>
              ) : null}
            </div>
            <span className="text-xs text-stone-500">
              {rows.length} {rows.length === 1 ? "batch" : "batches"} · {sessionCount} {sessionCount === 1 ? "session" : "sessions"}
            </span>
          </div>
        </div>
      )}

      {batchToDelete ? (
        <ConfirmDialog
          title={`Delete ${batchToDelete.name}?`}
          body="This batch and its routine entries across all days will be permanently deleted."
          confirmLabel="Delete Batch"
          onCancel={() => setBatchToDelete(null)}
          onConfirm={() => {
            dispatch({ type: "remove-batch", id: batchToDelete.id });
            setBatchToDelete(null);
          }}
        />
      ) : null}

      {slotToDelete ? (
        <ConfirmDialog
          title={`Delete ${slotToDelete.name}?`}
          body="This column and its scheduled modules across all batches will be deleted from this day."
          confirmLabel="Delete Column"
          onCancel={() => setSlotToDelete(null)}
          onConfirm={() => {
            dispatch({ type: "remove-slot", dayId: day.id, slotId: slotToDelete.id });
            setSlotToDelete(null);
          }}
        />
      ) : null}
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

function InlineBatchCell({
  batch,
  onDelete,
}: {
  batch: Batch;
  onDelete: () => void;
}) {
  const { dispatch } = useSchedule();
  const cleanNumber = batch.name.replace(/\s*Batch$/i, "").trim();
  const [val, setVal] = useState(cleanNumber);
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setVal(batch.name.replace(/\s*Batch$/i, "").trim());
    }
  }, [batch.name, isFocused]);

  function commit(next: string) {
    const trimmed = next.trim();
    if (!trimmed) {
      setVal(cleanNumber);
      return;
    }
    dispatch({ type: "rename-batch", id: batch.id, name: trimmed });
  }

  return (
    <div className="batch-header-cell">
      <input
        className="batch-number-input"
        aria-label="Batch number"
        value={isFocused ? val : cleanNumber}
        placeholder="9th"
        onFocus={() => {
          setIsFocused(true);
          setVal(cleanNumber);
        }}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          setIsFocused(false);
          commit(val);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
      />
      <button
        type="button"
        className="batch-del-btn"
        title={`Delete batch ${cleanNumber}`}
        aria-label={`Delete batch ${cleanNumber}`}
        onClick={onDelete}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

function managerChoices(roster: string[], current: string, selected: string[]): string[] {
  const options = roster.length > 0 ? roster : rosterRange(1, 30);
  const taken = new Set(selected.filter((id) => id && id !== current));
  const available = options.filter((id) => !taken.has(id));
  if (current && !available.includes(current)) available.unshift(current);
  return available;
}

function InlineManagerCell({
  dayId,
  batch,
  managers,
}: {
  dayId: string;
  batch: Batch;
  managers: string[];
}) {
  const { dispatch } = useSchedule();
  const [extra, setExtra] = useState(0);

  const filled = managers.map((id) => id.trim()).filter(Boolean);
  const rows = filled.length + extra > 0 ? [...filled, ...Array.from({ length: extra }, () => "")] : [""];

  function setManager(index: number, id: string) {
    const list = filled.slice();
    if (!id) {
      if (index < list.length) list.splice(index, 1);
    } else if (index >= list.length) {
      if (!list.includes(id)) list.push(id);
    } else {
      list[index] = id;
    }
    dispatch({ type: "set-managers", dayId, batchId: batch.id, ids: list });
    setExtra(0);
  }

  return (
    <div className="recap-edit-box">
      <span className="recap-label-small">ID No.-</span>
      <div className="recap-selects">
        {rows.map((id, index) => (
          <span key={`${batch.id}-mgr-${index}`} className="recap-item">
            {index > 0 ? <span className="recap-amp">&</span> : null}
            <select
              className="sheet-select recap"
              aria-label={index === 0 ? "Day manager ID" : `Day manager ID ${index + 1}`}
              value={id}
              onChange={(e) => setManager(index, e.target.value)}
            >
              <option value="">—</option>
              {managerChoices(batch.roster, id, filled).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </span>
        ))}
        <button
          type="button"
          className="inline-plus"
          aria-label="Add day manager"
          title="Add another day manager"
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


