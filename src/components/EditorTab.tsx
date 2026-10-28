import {
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  Grid,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { isDayDirty } from "../lib/reducer";
import {
  availableSubNumbers,
  buildTimeline,
  cellHasConflict,
  findConflicts,
  maxSpanFrom,
  rowCells,
  type SheetSession,
} from "../lib/schedule";
import {
  formatModuleCode,
  joinWithAnd,
  orderedManagers,
  ordinalSuffix,
  parseModuleCode,
  rosterRange,
  sessionSpanLabel,
  shortBatchLabel,
} from "../lib/text";
import {
  dayWhen,
  formatDayNumber,
  formatLastUpdated,
  formatRange,
  formatSlashDate,
  todayInDhaka,
  weekdayName,
} from "../lib/time";
import type { Batch, CellContent, DayPlan } from "../lib/types";
import { useSchedule } from "../state";
import { colors } from "../theme";
import { DraftRoutineModal } from "./DraftRoutineModal";
import { EditBatchModal } from "./EditBatchModal";
import { EditDayModal } from "./EditDayModal";
import { HeaderFooterModal } from "./HeaderFooterModal";
import { BatchChip, Button, DayChip, Select, T } from "./ui";

export function EditorTab() {
  const { state, dispatch, day } = useSchedule();
  const [batchId, setBatchId] = useState(state.batches[0]?.id ?? "");
  const [editingDay, setEditingDay] = useState<DayPlan | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [isNewDay, setIsNewDay] = useState(false);
  const [isNewBatch, setIsNewBatch] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showDraftPreview, setShowDraftPreview] = useState(false);
  const [showHeaderFooter, setShowHeaderFooter] = useState(false);

  const hasChanges = isDayDirty(day);

  useEffect(() => {
    if (!state.batches.some((batch) => batch.id === batchId)) {
      setBatchId(state.batches[0]?.id ?? "");
    }
  }, [state.batches, batchId]);

  const batch = state.batches.find((item) => item.id === batchId) ?? state.batches[0];
  const timeline = buildTimeline(day);
  const conflicts = state.showConflicts ? findConflicts(state.batches, day) : [];
  const sessionCount = timeline.slots.filter((slot) => slot.kind === "session").length;
  const cells = batch ? rowCells(day, batch.id) : [];
  const managers = batch ? orderedManagers(batch.roster, day.managers[batch.id] ?? []) : [];

  function addBatch(name?: string, count?: number, batchNum?: number) {
    const lastNum = state.batches.reduce((max, item) => {
      const fromName = parseInt((item.name ?? "").replace(/\D/g, ""), 10);
      const fromId = parseInt((item.id ?? "").replace(/\D/g, ""), 10);
      const val =
        !isNaN(fromName) && fromName > 0
          ? fromName
          : !isNaN(fromId) && fromId > 0
            ? fromId
            : 0;
      return Math.max(max, val);
    }, 0);
    const nextNum = lastNum > 0 ? lastNum + 1 : state.batches.length + 1;
    const numToUse = batchNum ?? (name ? parseInt(name.replace(/\D/g, ""), 10) : NaN);
    const chosenNum = !isNaN(numToUse) && numToUse > 0 ? numToUse : nextNum;
    let newId = `batch-${chosenNum}`;
    if (state.batches.some((item) => item.id === newId)) {
      newId = `batch-${Date.now()}`;
    }
    const finalName = name ?? `${chosenNum}${ordinalSuffix(chosenNum)}`;
    dispatch({ type: "add-batch", id: newId, name: finalName, count });
    setBatchId(newId);
  }

  function addDay(dayNumber?: number, date?: string) {
    dispatch({ type: "add-day", dayId: day.id, dayNumber, date });
  }

  async function handlePublish() {
    setIsPublishing(true);
    dispatch({ type: "publish-day", dayId: day.id });
    setTimeout(() => {
      setIsPublishing(false);
    }, 400);
  }

  return (
    <div className="flex flex-col min-h-full pb-24 max-w-5xl mx-auto w-full px-4 sm:px-6 pt-4 gap-4">
      {/* Header & footer shortcut card */}
      <button
        type="button"
        data-testid="open-header-footer"
        onClick={() => setShowHeaderFooter(true)}
        className="w-full p-4 rounded-2xl border shadow-sm flex items-center justify-between text-left cursor-pointer transition-all hover:shadow"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.line,
        }}
      >
        <div>
          <div className="font-bold text-sm" style={{ color: colors.accent }}>
            Header & footer
          </div>
          <div className="text-xs mt-0.5" style={{ color: colors.muted }}>
            Course title, signature, and designation
          </div>
        </div>
        <ChevronRight size={18} style={{ color: colors.muted }} />
      </button>

      {/* Day row */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold min-w-10" style={{ color: colors.ink }}>
            Day:
          </span>
          <div className="flex-1 flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
            {state.days.map((item) => (
              <DayChip
                key={item.id}
                selected={item.id === day.id}
                when={dayWhen(item.date, todayInDhaka())}
                label={String(item.dayNumber)}
                onClick={() => dispatch({ type: "set-active-day", id: item.id })}
                onEdit={() => setEditingDay(item)}
              />
            ))}
            <Button
              small
              tone="ghost"
              icon={<Plus size={16} />}
              data-testid="add-day-button"
              aria-label="Add day"
              onClick={() => {
                setEditingDay(null);
                setIsNewDay(true);
              }}
            />
          </div>
        </div>

        <div className="text-xs" style={{ color: colors.muted }}>
          {formatSlashDate(day.date)}
          {weekdayName(day.date) ? ` · ${weekdayName(day.date)}` : ""} ·{" "}
          {formatDayNumber(day.dayNumber)}
          {day.publishedAt ? ` · Last modified: ${formatLastUpdated(day.publishedAt)}` : ""}
        </div>
      </div>

      {/* Clash warnings */}
      {conflicts.length > 0 ? (
        <div
          className="p-3 rounded-xl border text-xs"
          style={{ backgroundColor: colors.warnBg, borderColor: colors.warn, color: colors.warn }}
        >
          <div className="font-semibold mb-1">Same teacher in two batches:</div>
          {conflicts.map((conflict) => (
            <div key={`${conflict.sessionId}-${conflict.teacher}`}>
              {conflict.teacher} is in {conflict.batchNames.join(" and ")} during Session -{" "}
              {conflict.sessionNumber}.
            </div>
          ))}
        </div>
      ) : null}

      {/* Batch row */}
      {state.batches.length === 0 || !batch ? (
        <div className="p-6 rounded-2xl border bg-white flex items-center justify-between" style={{ borderColor: colors.line }}>
          <div>
            <div className="font-bold text-sm">No batches yet</div>
            <div className="text-xs" style={{ color: colors.muted }}>
              Add a batch to start creating the schedule.
            </div>
          </div>
          <Button
            tone="primary"
            label="Add Batch"
            icon={<Plus size={16} />}
            onClick={() => {
              setEditingBatch(null);
              setIsNewBatch(true);
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold min-w-10" style={{ color: colors.ink }}>
              Batch:
            </span>
            <div className="flex-1 flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
              {state.batches.map((item) => (
                <BatchChip
                  key={item.id}
                  selected={item.id === batch.id}
                  label={shortBatchLabel(item.name, item.id)}
                  onClick={() => setBatchId(item.id)}
                  onEdit={() => setEditingBatch(item)}
                />
              ))}
              <Button
                small
                tone="ghost"
                icon={<Plus size={16} />}
                data-testid="add-batch-button"
                aria-label="Add batch"
                onClick={() => {
                  setEditingBatch(null);
                  setIsNewBatch(true);
                }}
              />
            </div>
          </div>

          {/* Batch managers & Draft Preview button */}
          <div className="flex items-start gap-2.5">
            <div className="flex-1 p-4 rounded-2xl border bg-white shadow-sm" style={{ borderColor: colors.line }}>
              <Managers day={day} batch={batch} managers={managers} />
            </div>

            <button
              type="button"
              data-testid="open-draft-preview"
              aria-label="View drafted routine table"
              onClick={() => setShowDraftPreview(true)}
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white cursor-pointer hover:opacity-85 transition-opacity flex-none"
              style={{ backgroundColor: colors.accent }}
            >
              <Grid size={20} />
            </button>
          </div>

          {/* Sessions editor */}
          <div className="flex flex-col gap-3">
            {cells.map((cell) => {
              if (cell.kind === "skip") return null;
              if (cell.kind === "break") {
                const timed = timeline.slots.find((slot) => slot.id === cell.id);
                return (
                  <div
                    key={cell.id}
                    className="py-1 text-center text-xs font-semibold"
                    style={{ color: colors.muted }}
                  >
                    {cell.label}
                    {timed ? ` · ${formatRange(timed.start, timed.end)}` : ""}
                  </div>
                );
              }
              const clash = cellHasConflict(conflicts, batch.id, cell.sessionIds);
              const timed = cell.sessionIds
                .map((id) => timeline.slots.find((slot) => slot.id === id))
                .filter((slot) => slot && slot.kind === "session");
              const when = timed.length > 0 ? formatRange(timed[0]!.start, timed[timed.length - 1]!.end) : "";

              return (
                <div
                  key={cell.anchorId}
                  data-testid="editor-session"
                  className="p-4 sm:p-5 rounded-2xl border shadow-sm flex flex-col gap-3 bg-white"
                  style={{
                    borderColor: clash ? "#ead9b0" : colors.line,
                    backgroundColor: clash ? colors.warnBg : colors.surface,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <T weight="semibold" className="text-sm">
                        {sessionSpanLabel(cell.numbers)}
                      </T>
                      {when ? (
                        <div className="text-xs" style={{ color: colors.muted }}>
                          {when}
                        </div>
                      ) : null}
                    </div>

                    {sessionCount > 1 && cell.span === 1 ? (
                      <Button
                        small
                        tone="quiet"
                        label="Delete"
                        icon={<Trash2 size={13} />}
                        onClick={() => {
                          if (confirm(`Delete ${sessionSpanLabel(cell.numbers)}? This column will be removed from this day.`)) {
                            dispatch({ type: "remove-slot", dayId: day.id, slotId: cell.anchorId });
                          }
                        }}
                      />
                    ) : null}
                  </div>

                  <CellEditor day={day} batchId={batch.id} cell={cell} />
                </div>
              );
            })}

            <Button
              label="Add a new session"
              icon={<Plus size={16} />}
              disabled={sessionCount >= 10}
              onClick={() => dispatch({ type: "add-session", dayId: day.id })}
            />
          </div>
        </div>
      )}

      {/* Floating publish button on the bottom right */}
      <div className="fixed bottom-16 sm:bottom-6 right-4 sm:right-8 z-30">
        <button
          type="button"
          data-testid="publish-routine-fab"
          aria-label={hasChanges ? "Publish routine" : "Already published"}
          disabled={!hasChanges || isPublishing}
          onClick={handlePublish}
          className="flex items-center gap-2 px-5 py-3 rounded-full text-white font-bold text-sm shadow-xl transition-all cursor-pointer disabled:opacity-55 disabled:cursor-default"
          style={{
            backgroundColor: hasChanges ? colors.accent : "#a3a39e",
          }}
        >
          {isPublishing ? (
            <span>Publishing…</span>
          ) : hasChanges ? (
            <>
              <CloudUpload size={18} />
              <span>Publish</span>
            </>
          ) : (
            <>
              <CheckCircle2 size={18} />
              <span>Already published</span>
            </>
          )}
        </button>
      </div>

      {/* Modals */}
      <EditDayModal
        visible={editingDay !== null || isNewDay}
        day={editingDay}
        isNew={isNewDay}
        onAddDay={addDay}
        onClose={() => {
          setEditingDay(null);
          setIsNewDay(false);
        }}
      />
      <EditBatchModal
        visible={editingBatch !== null || isNewBatch}
        batch={editingBatch}
        isNew={isNewBatch}
        onAddBatch={addBatch}
        onClose={() => {
          setEditingBatch(null);
          setIsNewBatch(false);
        }}
      />
      <DraftRoutineModal
        visible={showDraftPreview}
        day={day}
        onClose={() => setShowDraftPreview(false)}
        onPublish={handlePublish}
      />
      <HeaderFooterModal
        visible={showHeaderFooter}
        onClose={() => setShowHeaderFooter(false)}
      />
    </div>
  );
}

function withCurrent(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}

function teacherChoices(catalog: string[], current: string, selected: string[]): string[] {
  const taken = new Set(selected.filter((name) => name && name !== current).map((name) => name.toLowerCase()));
  const options = catalog.filter((name) => !taken.has(name.toLowerCase()));
  if (current && !options.some((name) => name.toLowerCase() === current.toLowerCase())) options.unshift(current);
  return options;
}

function CellEditor({
  day,
  batchId,
  cell,
}: {
  day: DayPlan;
  batchId: string;
  cell: SheetSession;
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

  const subOptions = availableSubNumbers({
    state,
    batchId,
    currentDayId: day.id,
    currentSessionId: cell.anchorId,
    selectedModuleNumber: moduleNumber,
    currentCellCode: cell.content.code,
  });

  function update(next: CellContent) {
    dispatch({ type: "set-cell", dayId: day.id, batchId, sessionId: cell.anchorId, cell: next });
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
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <div className="flex-1">
          <Select
            label="Module number"
            value={moduleNumber}
            options={withCurrent(state.moduleNumbers, moduleNumber)}
            onChange={(value) => {
              const nextSubs = availableSubNumbers({
                state,
                batchId,
                currentDayId: day.id,
                currentSessionId: cell.anchorId,
                selectedModuleNumber: value,
                currentCellCode: cell.content.code,
              });
              const nextSub = nextSubs.includes(subNumber) ? subNumber : "";
              update({ ...cell.content, code: formatModuleCode(value, nextSub) });
            }}
          />
        </div>
        <div className="w-28 flex-none">
          <Select
            label="Sub-number"
            value={subNumber}
            options={subOptions}
            onChange={(value) => update({ ...cell.content, code: formatModuleCode(moduleNumber, value) })}
          />
        </div>
      </div>

      {rows.map((name, index) => (
        <Select
          key={`${cell.anchorId}-teacher-${index}`}
          label={index === 0 ? "Teacher" : `Teacher ${index + 1}`}
          value={name}
          options={teacherChoices(state.teachers.map((teacher) => teacher.name), name, filled)}
          onChange={(value) => setTeacher(index, value)}
        />
      ))}

      <div className="flex items-center justify-between pt-1">
        <Button
          small
          tone="quiet"
          label="+ Teacher"
          onClick={() => {
            if (rows.length > 0 && rows[rows.length - 1] === "") return;
            setExtra((count) => count + 1);
          }}
        />
        <Button
          small
          tone={cell.span > 1 ? "primary" : "ghost"}
          disabled={!canMerge}
          label={cell.span > 1 ? `Merged (${cell.span})` : "Merge"}
          onClick={() =>
            dispatch({
              type: "set-span",
              dayId: day.id,
              batchId,
              sessionId: cell.anchorId,
              span: cell.span > 1 ? 1 : Math.min(2, maxSpan),
            })
          }
        />
      </div>
    </div>
  );
}

function Managers({
  day,
  batch,
  managers,
}: {
  day: DayPlan;
  batch: Batch;
  managers: string[];
}) {
  const { state, dispatch } = useSchedule();
  const [extra, setExtra] = useState(0);
  const [expanded, setExpanded] = useState(false);
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
    dispatch({ type: "set-managers", dayId: day.id, batchId: batch.id, ids: list });
    setExtra(0);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs font-semibold" style={{ color: colors.muted }}>
            {state.recapLabel} (Day managers)
          </span>
          <div className="text-sm font-medium mt-0.5" style={{ color: colors.ink }}>
            {managers.length ? `ID No.- ${joinWithAnd(managers)}` : "—"}
          </div>
        </div>
        <Button
          small
          label={expanded ? "Done" : "Edit"}
          onClick={() => setExpanded((prev) => !prev)}
        />
      </div>

      {expanded ? (
        <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: colors.line }}>
          {rows.map((id, index) => (
            <Select
              key={`${batch.id}-mgr-${index}`}
              label={`Manager ${index + 1}`}
              value={id}
              options={managerChoices(batch.roster, id, filled)}
              onChange={(value) => setManager(index, value)}
            />
          ))}
          <Button
            small
            tone="quiet"
            label="+ Manager"
            onClick={() => setExtra((c) => c + 1)}
          />
        </div>
      ) : null}
    </div>
  );
}

function managerChoices(roster: string[], current: string, selected: string[]): string[] {
  const options = roster.length > 0 ? roster : rosterRange(1, 40);
  const taken = new Set(selected.filter((id) => id && id !== current));
  const available = options.filter((id) => !taken.has(id));
  if (current && !available.includes(current)) available.unshift(current);
  return available;
}

export default EditorTab;
