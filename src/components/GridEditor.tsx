import { useState } from "react";
import { AlertTriangle, Link2, Plus, Trash2 } from "lucide-react";
import { buildTimeline, cellHasConflict, findConflicts, maxSpanFrom, rowCells, type SheetSession, type Timeline } from "../lib/schedule";
import { cleanBatchNumber, formatModuleCode, orderedManagers, parseModuleCode, rosterRange, sessionSpanLabel } from "../lib/text";
import { formatClock, formatRange } from "../lib/time";
import type { Batch, CellContent, DayPlan } from "../lib/types";
import { useSchedule } from "../state";
import { PlainSelect } from "./PlainSelect";
import { Button, ConfirmDialog } from "./ui";

export function GridEditor({ day }: { day: DayPlan }) {
  const { state, dispatch } = useSchedule();
  const [batchToDelete, setBatchToDelete] = useState<Batch | null>(null);
  const [slotToDelete, setSlotToDelete] = useState<{ id: string; name: string } | null>(null);
  const [mobileBatchId, setMobileBatchId] = useState(state.batches[0]?.id ?? "");
  const timeline = buildTimeline(day);
  const conflicts = state.showConflicts ? findConflicts(state.batches, day) : [];
  const rows = state.batches.map((batch) => ({
    batch,
    managers: orderedManagers(batch.roster, day.managers[batch.id] ?? []),
    cells: rowCells(day, batch.id),
  }));
  const sessionCount = timeline.slots.filter((slot) => slot.kind === "session").length;
  const mobileRow = rows.find((row) => row.batch.id === mobileBatchId) ?? rows[0];

  return (
    <div>
      <div className="editor-tools">
        <div className="flex flex-wrap items-center gap-2">
          <Button tone="primary" onClick={() => dispatch({ type: "add-batch" })} title="Add a new batch row">
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
        <div className="empty-grid">
          <p>No batches in the grid yet.</p>
          <Button tone="primary" onClick={() => dispatch({ type: "add-batch" })}>
            <Plus size={15} /> Add First Batch
          </Button>
        </div>
      ) : (
        <div>
          <div className="editor-desktop">
            <div className="edit-grid-wrap">
              <table className="edit-grid">
                <thead>
                  <tr>
                    <th style={{ width: "9%" }}>Batch</th>
                    <th style={{ width: "12%" }}>
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
                        <InlineBatchCell batch={row.batch} onDelete={() => setBatchToDelete(row.batch)} />
                      </th>
                      <td className="recap-edit-cell">
                        <InlineManagerCell dayId={day.id} batch={row.batch} managers={row.managers} />
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
                      <button type="button" className="add-batch-row-btn" onClick={() => dispatch({ type: "add-batch" })}>
                        <Plus size={13} /> Add Batch
                      </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {mobileRow ? (
            <MobileBatchList
              day={day}
              timeline={timeline}
              rows={rows}
              selectedId={mobileRow.batch.id}
              onSelect={setMobileBatchId}
              conflicts={conflicts}
              onDeleteBatch={setBatchToDelete}
              onDeleteSlot={setSlotToDelete}
              sessionCount={sessionCount}
            />
          ) : null}

          <div className="editor-footer">
            <div className="flex flex-wrap items-center gap-2">
              <Button tone="ghost" className="text-xs" onClick={() => dispatch({ type: "add-batch" })}>
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
                    const lastSession = [...day.slots].reverse().find((slot) => slot.kind === "session");
                    if (lastSession) {
                      const timed = timeline.slots.find((slot) => slot.id === lastSession.id);
                      const num = timed && timed.kind === "session" ? timed.number : "";
                      setSlotToDelete({ id: lastSession.id, name: `Session - ${num}` });
                    }
                  }}
                  title="Delete last session"
                >
                  <Trash2 size={12} /> Delete Last Session
                </Button>
              ) : null}
            </div>
            <span className="count-note">
              {rows.length} {rows.length === 1 ? "batch" : "batches"} · {sessionCount}{" "}
              {sessionCount === 1 ? "session" : "sessions"}
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

function MobileBatchList({
  day,
  timeline,
  rows,
  selectedId,
  onSelect,
  conflicts,
  onDeleteBatch,
  onDeleteSlot,
  sessionCount,
}: {
  day: DayPlan;
  timeline: Timeline;
  rows: Array<{ batch: Batch; managers: string[]; cells: ReturnType<typeof rowCells> }>;
  selectedId: string;
  onSelect: (id: string) => void;
  conflicts: ReturnType<typeof findConflicts>;
  onDeleteBatch: (batch: Batch) => void;
  onDeleteSlot: (slot: { id: string; name: string }) => void;
  sessionCount: number;
}) {
  const row = rows.find((item) => item.batch.id === selectedId) ?? rows[0];
  if (!row) return null;

  return (
    <div className="editor-mobile">
      <div className="batch-picker" role="tablist" aria-label="Batches">
        {rows.map((item) => (
          <button
            key={item.batch.id}
            type="button"
            role="tab"
            aria-selected={item.batch.id === row.batch.id}
            onClick={() => onSelect(item.batch.id)}
          >
            {cleanBatchNumber(item.batch.name) || "Batch"}
          </button>
        ))}
      </div>
      <article className="batch-session-card">
        <div className="mobile-batch-head">
          <InlineBatchCell batch={row.batch} onDelete={() => onDeleteBatch(row.batch)} />
        </div>
        <div className="mobile-managers">
          <span className="mobile-kicker">Day managers</span>
          <InlineManagerCell dayId={day.id} batch={row.batch} managers={row.managers} />
        </div>
        <div className="session-stack">
          {row.cells.map((cell) => {
            if (cell.kind === "skip") return null;
            if (cell.kind === "break") {
              const timed = timeline.slots.find((slot) => slot.id === cell.id);
              const when = timed ? formatRange(timed.start, timed.end) : "";
              return (
                <div key={cell.id} className="break-divider">
                  <span>
                    {cell.label}
                    {when ? ` · ${when}` : ""}
                  </span>
                </div>
              );
            }
            const clash = cellHasConflict(conflicts, row.batch.id, cell.sessionIds);
            const timed = cell.sessionIds
              .map((id) => timeline.slots.find((slot) => slot.id === id))
              .filter((slot) => slot?.kind === "session");
            const when =
              timed.length > 0 ? formatRange(timed[0]!.start, timed[timed.length - 1]!.end) : "";
            const name = sessionSpanLabel(cell.numbers);
            return (
              <section key={cell.anchorId} className={clash ? "session-card conflict" : "session-card"}>
                <header className="session-card-head">
                  <div>
                    <strong>{name}</strong>
                    {when ? <span className="time-note">{when}</span> : null}
                  </div>
                  {sessionCount > 1 && cell.span === 1 ? (
                    <button
                      type="button"
                      className="text-del"
                      aria-label={`Delete ${name}`}
                      onClick={() => onDeleteSlot({ id: cell.anchorId, name })}
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : null}
                </header>
                <InlineCell day={day} batchId={row.batch.id} cell={cell} layout="card" />
              </section>
            );
          })}
        </div>
      </article>
    </div>
  );
}

function InlineCell({
  day,
  batchId,
  cell,
  layout = "table",
}: {
  day: DayPlan;
  batchId: string;
  cell: SheetSession;
  layout?: "table" | "card";
}) {
  const { state, dispatch } = useSchedule();
  const [extra, setExtra] = useState(0);
  const parsed = parseModuleCode(cell.content.code);
  const moduleNumber = parsed?.moduleNumber ?? "";
  const subNumber = parsed?.subNumber ?? "";
  const filled = cell.content.teachers.map((name) => name.trim()).filter(Boolean);
  const rows = [...filled, ...Array.from({ length: extra }, () => "")];
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
    <div className={layout === "card" ? "inline-cell card-layout" : "inline-cell"}>
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
        <Link2 size={layout === "card" ? 16 : 11} />
      </button>
      <div className="inline-mods">
        <PlainSelect
          className="mod"
          ariaLabel="Module number"
          value={moduleNumber}
          options={withCurrent(state.moduleNumbers, moduleNumber)}
          onChange={(value) => update({ ...cell.content, code: formatModuleCode(value, subNumber) })}
        />
        <PlainSelect
          className="sub"
          ariaLabel="Sub-number"
          value={subNumber}
          options={withCurrent(state.subNumbers, subNumber)}
          onChange={(value) => update({ ...cell.content, code: formatModuleCode(moduleNumber, value) })}
        />
      </div>
      <div className="inline-teachers">
        {rows.map((name, index) => (
          <PlainSelect
            key={`${cell.anchorId}-teacher-${index}`}
            className="teacher"
            ariaLabel={index === 0 ? "Teacher" : `Teacher ${index + 1}`}
            value={name}
            options={teacherChoices(
              state.teachers.map((teacher) => teacher.name),
              name,
              filled,
            )}
            onChange={(value) => setTeacher(index, value)}
          />
        ))}
        <button
          type="button"
          className="inline-plus"
          aria-label="Add teacher"
          onClick={() => {
            if (rows.length > 0 && rows[rows.length - 1] === "") return;
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

function InlineBatchCell({ batch, onDelete }: { batch: Batch; onDelete: () => void }) {
  const { dispatch } = useSchedule();
  const cleanNumber = cleanBatchNumber(batch.name);
  const [draft, setDraft] = useState<string | null>(null);

  function commit(next: string) {
    const trimmed = next.trim();
    setDraft(null);
    if (!trimmed || trimmed === cleanNumber) return;
    dispatch({ type: "rename-batch", id: batch.id, name: trimmed });
  }

  return (
    <div className="batch-header-cell">
      <input
        className="batch-number-input"
        aria-label="Batch number"
        value={draft ?? cleanNumber}
        placeholder="9th"
        onFocus={() => setDraft(cleanNumber)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit(draft ?? cleanNumber)}
        onKeyDown={(event) => {
          if (event.key === "Enter") (event.target as HTMLInputElement).blur();
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
  const rows = [...filled, ...Array.from({ length: extra }, () => "")];

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
            <PlainSelect
              className="recap"
              ariaLabel={index === 0 ? "Day manager ID" : `Day manager ID ${index + 1}`}
              value={id}
              options={managerChoices(batch.roster, id, filled)}
              onChange={(value) => setManager(index, value)}
            />
          </span>
        ))}
        <button
          type="button"
          className="inline-plus"
          aria-label="Add day manager"
          title="Add another day manager"
          onClick={() => {
            if (rows.length > 0 && rows[rows.length - 1] === "") return;
            setExtra((count) => count + 1);
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}
