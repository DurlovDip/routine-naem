import { CheckCircle2, Grid, List, X } from "lucide-react";
import { useState } from "react";
import { isDayDirty } from "../lib/reducer";
import { buildTimeline, findConflicts, rowCells } from "../lib/schedule";
import { cleanBatchNumber, formatModule, joinWithAnd, orderedManagers, sessionSpanLabel } from "../lib/text";
import { formatRange, formatSlashDate, weekdayName } from "../lib/time";
import type { DayPlan } from "../lib/types";
import { useSchedule } from "../state";
import { colors } from "../theme";
import { Button, T } from "./ui";

export function DraftRoutineModal({
  visible,
  day,
  onClose,
  onPublish,
}: {
  visible: boolean;
  day: DayPlan;
  onClose: () => void;
  onPublish?: () => void;
}) {
  const { state } = useSchedule();
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  if (!visible) return null;

  const timeline = buildTimeline(day);
  const rows = state.batches.map((b) => ({
    batch: b,
    managers: orderedManagers(b.roster, day.managers[b.id] ?? []),
    cells: rowCells(day, b.id),
  }));
  const conflicts = state.showConflicts ? findConflicts(state.batches, day) : [];
  const hasChanges = isDayDirty(day);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ backgroundColor: "rgba(28, 28, 26, 0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 sm:p-5 border-b"
          style={{ borderColor: colors.line }}
        >
          <div className="flex-1 min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <T weight="bold" className="text-lg" style={{ color: colors.accent }}>
                Draft Routine Table
              </T>
              <span
                className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider"
                style={{
                  backgroundColor: hasChanges ? colors.warnBg : "#d1fae5",
                  color: hasChanges ? colors.warn : "#065f46",
                }}
              >
                {hasChanges ? "DRAFT" : "PUBLISHED"}
              </span>
            </div>
            <div className="text-xs mt-1" style={{ color: colors.muted }}>
              Day {day.dayNumber} · {formatSlashDate(day.date)}
              {weekdayName(day.date) ? ` · ${weekdayName(day.date)}` : ""}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div
              className="inline-flex p-1 rounded-lg"
              style={{ backgroundColor: colors.paper }}
            >
              <button
                type="button"
                onClick={() => setViewMode("table")}
                className="p-1.5 rounded-md cursor-pointer transition-colors"
                style={{
                  backgroundColor: viewMode === "table" ? colors.surface : "transparent",
                  color: viewMode === "table" ? colors.accent : colors.muted,
                }}
              >
                <Grid size={16} />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("cards")}
                className="p-1.5 rounded-md cursor-pointer transition-colors"
                style={{
                  backgroundColor: viewMode === "cards" ? colors.surface : "transparent",
                  color: viewMode === "cards" ? colors.accent : colors.muted,
                }}
              >
                <List size={16} />
              </button>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-md text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 space-y-4">
          {conflicts.length > 0 ? (
            <div
              className="p-3 rounded-xl border text-xs"
              style={{ backgroundColor: colors.warnBg, borderColor: colors.warn, color: colors.warn }}
            >
              <div className="font-semibold mb-1">Clashes detected on this day:</div>
              {conflicts.map((c) => (
                <div key={`${c.sessionId}-${c.teacher}`}>
                  {c.teacher} is scheduled in {c.batchNames.join(" and ")} during Session -{" "}
                  {c.sessionNumber}.
                </div>
              ))}
            </div>
          ) : null}

          {viewMode === "table" ? (
            <div className="overflow-x-auto border rounded-xl" style={{ borderColor: colors.line }}>
              <table className="w-full border-collapse text-center text-xs">
                <thead>
                  <tr style={{ backgroundColor: colors.paper }}>
                    <th className="border p-2 font-semibold" style={{ width: 80, borderColor: colors.line }}>
                      Batch
                    </th>
                    <th className="border p-2 font-semibold" style={{ width: 120, borderColor: colors.line }}>
                      <div>{state.recapLabel}</div>
                      <div className="text-[11px] font-normal" style={{ color: colors.muted }}>
                        {formatRange(timeline.recap.start, timeline.recap.end)}
                      </div>
                    </th>
                    {timeline.slots.map((slot) => (
                      <th
                        key={slot.id}
                        className="border p-2 font-semibold"
                        style={{ width: slot.kind === "break" ? 80 : 130, borderColor: colors.line }}
                      >
                        {slot.kind === "session" ? (
                          <>
                            <div>Session - {slot.number}</div>
                            <div className="text-[11px] font-normal" style={{ color: colors.muted }}>
                              {formatRange(slot.start, slot.end)}
                            </div>
                          </>
                        ) : (
                          <>
                            <div>{slot.label}</div>
                            <div className="text-[11px] font-normal" style={{ color: colors.muted }}>
                              {formatRange(slot.start, slot.end)}
                            </div>
                          </>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.batch.id}>
                      <td className="border p-2 font-semibold" style={{ borderColor: colors.line }}>
                        {cleanBatchNumber(row.batch.name, row.batch.id) || "Batch"}
                      </td>
                      <td className="border p-2 text-xs" style={{ borderColor: colors.line }}>
                        {row.managers.length ? `ID No.- ${joinWithAnd(row.managers)}` : "—"}
                      </td>
                      {row.cells.map((cell) => {
                        if (cell.kind === "skip") return null;
                        if (cell.kind === "break") {
                          return (
                            <td
                              key={cell.id}
                              className="border p-1 bg-stone-50 text-[11px] font-medium"
                              style={{ borderColor: colors.line, color: colors.muted }}
                            >
                              {cell.label}
                            </td>
                          );
                        }
                        const line = formatModule(cell.content.code, cell.content.note);
                        const teachers = joinWithAnd(cell.content.teachers);
                        return (
                          <td
                            key={cell.anchorId}
                            colSpan={cell.span}
                            className="border p-2 text-left"
                            style={{ borderColor: colors.line }}
                          >
                            {line ? <div className="font-semibold">{line}</div> : null}
                            {teachers ? (
                              <div className="text-[11px] text-stone-500 mt-0.5">{teachers}</div>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div
                  key={row.batch.id}
                  className="p-4 rounded-xl border"
                  style={{ borderColor: colors.line, backgroundColor: colors.paper }}
                >
                  <div className="font-bold text-sm" style={{ color: colors.ink }}>
                    {row.batch.name}
                  </div>
                  <div className="text-xs mb-2" style={{ color: colors.muted }}>
                    {state.recapLabel}: {row.managers.length ? joinWithAnd(row.managers) : "—"}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {row.cells.map((cell) => {
                      if (cell.kind === "skip" || cell.kind === "break") return null;
                      const line = formatModule(cell.content.code, cell.content.note);
                      const teachers = joinWithAnd(cell.content.teachers);
                      return (
                        <div
                          key={cell.anchorId}
                          className="p-2.5 rounded-lg bg-white border"
                          style={{ borderColor: colors.line }}
                        >
                          <div className="text-xs font-semibold">
                            {sessionSpanLabel(cell.numbers)}
                          </div>
                          <div className="text-sm font-medium mt-0.5">{line || "Empty"}</div>
                          {teachers ? (
                            <div className="text-xs text-stone-500">{teachers}</div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="p-4 border-t flex items-center justify-between"
          style={{ borderColor: colors.line }}
        >
          <Button label="Close" onClick={onClose} />
          {onPublish ? (
            <Button
              tone="primary"
              label="Publish This Day"
              icon={<CheckCircle2 size={16} />}
              onClick={() => {
                onPublish();
                onClose();
              }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
