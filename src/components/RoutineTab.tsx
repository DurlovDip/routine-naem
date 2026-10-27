import {
  CheckCircle2,
  Clock,
  Download,
  Grid,
  List,
  Lock,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAccess, useAuth } from "../auth";
import { upcomingMineGroups, type MySession } from "../lib/mine";
import { downloadRoutine } from "../lib/pdf";
import { buildTimeline, rowCells, type SheetCell } from "../lib/schedule";
import {
  batchLines,
  cleanBatchNumber,
  formatModule,
  joinWithAnd,
  orderedManagers,
  sessionSpanLabel,
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
import { useSchedule } from "../state";
import { colors } from "../theme";
import { DayChip, T } from "./ui";

type Pane = "mine" | "routine";

const PANE_KEY = "routine-naem-routine-pane";

export function RoutineTab() {
  const access = useAccess();
  const auth = useAuth();
  const { state, dispatch, day: rawDay } = useSchedule();
  const hydrated = true;
  const [pane, setPane] = useState<Pane>("routine");
  const [table, setTable] = useState(false);
  const [prefsReady, setPrefsReady] = useState(false);
  const isSuperAdmin = access.role === "super_admin";
  const activePane: Pane = isSuperAdmin ? "routine" : pane;
  const activeDay = rawDay;
  const isPublished = Boolean(activeDay.isPublished);
  const day = isPublished && activeDay.publishedSnapshot ? activeDay.publishedSnapshot : activeDay;
  const timeline = buildTimeline(day);
  const upcoming = upcomingMineGroups(
    state.batches,
    state.teachers,
    state.days.map((d) => (d.isPublished && d.publishedSnapshot ? d.publishedSnapshot : d)),
    auth.session?.teacherId ?? "",
    auth.session?.teacherName ?? "",
  );

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PANE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { pane?: string; table?: boolean };
        if (saved.pane === "mine" || saved.pane === "routine") setPane(saved.pane as Pane);
        if (typeof saved.table === "boolean") setTable(saved.table);
      }
    } catch {
      // ignore
    }
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    if (!prefsReady) return;
    try {
      localStorage.setItem(PANE_KEY, JSON.stringify({ pane, table }));
    } catch {
      // ignore
    }
  }, [pane, table, prefsReady]);

  const rows = state.batches.map((batch) => ({
    batch,
    managers: orderedManagers(batch.roster, day.managers[batch.id] ?? []),
    cells: rowCells(day, batch.id),
  }));

  const handleDownload = () => {
    if (!isPublished && !access.canEdit) {
      alert(
        "Routine in Draft: This routine has not been published yet. Once the course coordinator publishes it, it will be available for download.",
      );
      return;
    }
    void downloadRoutine(state, day);
  };

  return (
    <div className="flex flex-col min-h-full pb-8">
      {/* 1. Mine | Routine switch + Download button row */}
      <div className="flex items-center justify-between px-4 sm:px-6 pt-3 pb-2 gap-3 max-w-5xl mx-auto w-full">
        <div className="flex-1 max-w-xs">
          {!isSuperAdmin ? (
            <div
              role="tablist"
              aria-label="Schedule"
              className="inline-flex items-center p-1 rounded-xl w-full"
              style={{ backgroundColor: colors.paper }}
            >
              {/* Mine button */}
              <button
                type="button"
                role="tab"
                aria-selected={activePane === "mine"}
                onClick={() => setPane("mine")}
                className="flex-1 h-8 rounded-lg flex items-center justify-center text-xs font-semibold cursor-pointer transition-colors"
                style={{
                  backgroundColor: activePane === "mine" ? colors.surface : "transparent",
                  color: activePane === "mine" ? colors.accent : colors.muted,
                  boxShadow: activePane === "mine" ? "0 2px 6px rgba(28, 28, 26, 0.05)" : "none",
                }}
              >
                Mine
              </button>

              {/* Routine segment with inner table toggle */}
              <div
                className="flex-1 h-8 rounded-lg flex items-center transition-colors overflow-hidden"
                style={{
                  backgroundColor: activePane === "routine" ? colors.surface : "transparent",
                  boxShadow: activePane === "routine" ? "0 2px 6px rgba(28, 28, 26, 0.05)" : "none",
                }}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activePane === "routine"}
                  onClick={() => setPane("routine")}
                  className="flex-1 h-full pl-3 pr-1 flex items-center justify-center text-xs font-semibold cursor-pointer"
                  style={{
                    color: activePane === "routine" ? colors.accent : colors.muted,
                  }}
                >
                  Routine
                </button>

                <div
                  className="w-px h-4"
                  style={{
                    backgroundColor: activePane === "routine" ? colors.line : "#dfdeda",
                  }}
                />

                <button
                  type="button"
                  data-testid="routine-table-toggle"
                  aria-label={table ? "Switch to batch view" : "Switch to table view"}
                  onClick={() => {
                    setTable((current) => !current);
                    setPane("routine");
                  }}
                  className="w-8 h-full flex items-center justify-center cursor-pointer hover:opacity-75"
                  style={{
                    color: activePane === "routine" ? colors.accent : colors.muted,
                  }}
                >
                  {table ? <List size={16} /> : <Grid size={16} />}
                </button>
              </div>
            </div>
          ) : (
            <div
              className="inline-flex items-center p-1 rounded-xl"
              style={{ backgroundColor: colors.paper }}
            >
              <div
                className="h-8 rounded-lg flex items-center bg-white shadow-sm overflow-hidden"
              >
                <span
                  className="pl-3 pr-2 text-xs font-semibold"
                  style={{ color: colors.accent }}
                >
                  Routine
                </span>
                <div className="w-px h-4" style={{ backgroundColor: colors.line }} />
                <button
                  type="button"
                  data-testid="routine-table-toggle"
                  aria-label={table ? "Switch to batch view" : "Switch to table view"}
                  onClick={() => setTable((current) => !current)}
                  className="w-8 h-full flex items-center justify-center cursor-pointer hover:opacity-75"
                  style={{ color: colors.accent }}
                >
                  {table ? <List size={16} /> : <Grid size={16} />}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Download Icon: Plain dark, unlabeled icon */}
        <button
          type="button"
          data-testid="routine-download"
          aria-label="Download routine"
          onClick={handleDownload}
          className="w-10 h-10 flex items-center justify-center rounded-lg cursor-pointer hover:opacity-70 transition-opacity flex-none"
          style={{
            color: colors.ink,
            opacity: !isPublished && !access.canEdit ? 0.45 : 1,
          }}
        >
          {!isPublished && !access.canEdit ? <Lock size={20} /> : <Download size={20} />}
        </button>
      </div>

      {/* 2. Routine Pane Header (Day chips + date info) */}
      {activePane === "routine" ? (
        <div className="px-4 sm:px-6 pt-2 pb-3 flex flex-col gap-3 max-w-5xl mx-auto w-full">
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold min-w-10" style={{ color: colors.ink }}>
              Day:
            </span>
            <div className="flex-1 flex items-center gap-2 overflow-x-auto py-1 no-scrollbar">
              {state.days.map((item) => (
                <DayChip
                  key={item.id}
                  selected={item.id === activeDay.id}
                  when={dayWhen(item.date, todayInDhaka())}
                  label={String(item.dayNumber)}
                  onClick={() => dispatch({ type: "set-active-day", id: item.id })}
                />
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-xs" style={{ color: colors.muted }}>
              <span>
                {formatSlashDate(day.date)}
                {weekdayName(day.date) ? ` · ${weekdayName(day.date)}` : ""} ·{" "}
                {formatDayNumber(day.dayNumber)}
              </span>

              <div
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tracking-wider"
                style={{
                  backgroundColor: isPublished ? "#d1fae5" : "#fef3c7",
                  color: isPublished ? "#065f46" : "#92400e",
                }}
              >
                {isPublished ? (
                  <CheckCircle2 size={12} style={{ color: "#059669" }} />
                ) : (
                  <Clock size={12} style={{ color: "#d97706" }} />
                )}
                <span>{isPublished ? "PUBLISHED" : "DRAFT"}</span>
              </div>
            </div>

            {day.publishedAt ? (
              <div className="flex items-center gap-1 text-[11px]" style={{ color: colors.muted }}>
                <Clock size={12} />
                <span>Last updated: {formatLastUpdated(day.publishedAt)}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* 3. Content: Mine or Batch View or Table View */}
      <div className="flex-1 px-4 sm:px-6 max-w-5xl mx-auto w-full">
        {!hydrated ? (
          <div className="p-8 text-center text-sm" style={{ color: colors.muted }}>
            Loading routine…
          </div>
        ) : activePane === "mine" ? (
          <div data-testid="routine-mine" className="flex flex-col gap-5 py-2">
            {upcoming.length === 0 ? (
              <div
                className="p-6 rounded-2xl border text-center"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                  color: colors.muted,
                }}
              >
                No upcoming sessions
              </div>
            ) : (
              upcoming.map((group) => (
                <div key={group.day.id} className="flex flex-col gap-2">
                  <div className="text-xs font-semibold" style={{ color: colors.muted }}>
                    {group.header}
                  </div>
                  <div className="flex flex-col gap-3">
                    {group.sessions.map((item) => (
                      <MineCard key={`${group.day.id}:${item.key}`} item={item} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : table ? (
          <div className="overflow-x-auto py-2 bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: colors.line }}>
            <Table rows={rows} timeline={timeline} recap={state.recapLabel} />
          </div>
        ) : (
          <div data-testid="routine-list" className="flex flex-col gap-4 py-2">
            {rows.length === 0 ? (
              <div
                className="p-6 rounded-2xl border text-center text-sm"
                style={{
                  backgroundColor: colors.surface,
                  borderColor: colors.line,
                  color: colors.muted,
                }}
              >
                No batches in this routine yet.
              </div>
            ) : (
              rows.map((row) => (
                <BatchCard
                  key={row.batch.id}
                  row={row}
                  timeline={timeline}
                  recap={state.recapLabel}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MineCard({ item }: { item: MySession }) {
  return (
    <div
      className="p-4 rounded-2xl border shadow-sm flex flex-col gap-1.5"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.line,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <T weight="bold" className="text-base" style={{ color: colors.ink }}>
          {item.label}
        </T>
        <span className="text-xs" style={{ color: colors.muted }}>
          {formatRange(item.start, item.end)}
        </span>
      </div>
      <div className="text-xs" style={{ color: colors.muted }}>
        {item.batchLabel}
      </div>
      {item.module ? (
        <div className="text-sm font-semibold mt-1" style={{ color: colors.ink }}>
          {item.module}
        </div>
      ) : (
        <div className="text-sm mt-1" style={{ color: colors.muted }}>
          Empty
        </div>
      )}
      {item.coTeachers.length > 0 ? (
        <div className="text-xs" style={{ color: colors.muted }}>
          with {joinWithAnd(item.coTeachers)}
        </div>
      ) : null}
    </div>
  );
}

function BatchCard({
  row,
  timeline,
  recap,
}: {
  row: { batch: { id: string; name: string }; managers: string[]; cells: SheetCell[] };
  timeline: ReturnType<typeof buildTimeline>;
  recap: string;
}) {
  return (
    <div
      className="p-5 rounded-2xl border shadow-sm flex flex-col gap-3"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.line,
      }}
    >
      <div>
        <T weight="bold" className="text-base" style={{ color: colors.ink }}>
          {batchLines(row.batch.name, row.batch.id).join(" ")}
        </T>
        <div className="text-xs mt-0.5" style={{ color: colors.muted }}>
          {recap}: {row.managers.length ? `ID No.- ${joinWithAnd(row.managers)}` : "—"}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {row.cells.map((cell) => {
          if (cell.kind === "skip") return null;
          if (cell.kind === "break") {
            const timed = timeline.slots.find((slot) => slot.id === cell.id);
            const when = timed ? formatRange(timed.start, timed.end) : "";
            return (
              <div
                key={cell.id}
                className="py-1 text-center text-xs font-semibold"
                style={{ color: colors.muted }}
              >
                {cell.label}
                {when ? ` · ${when}` : ""}
              </div>
            );
          }
          const timed = cell.sessionIds
            .map((id) => timeline.slots.find((slot) => slot.id === id))
            .filter((slot) => slot && slot.kind === "session");
          const when = timed.length > 0 ? formatRange(timed[0]!.start, timed[timed.length - 1]!.end) : "";
          const line = formatModule(cell.content.code, cell.content.note);
          const teachers = joinWithAnd(cell.content.teachers);

          return (
            <div
              key={cell.anchorId}
              className="p-3 rounded-xl flex flex-col gap-1"
              style={{ backgroundColor: colors.paper }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold" style={{ color: colors.ink }}>
                  {sessionSpanLabel(cell.numbers)}
                </span>
                {when ? (
                  <span className="text-xs" style={{ color: colors.muted }}>
                    {when}
                  </span>
                ) : null}
              </div>
              {line ? (
                <div className="text-sm font-semibold mt-0.5" style={{ color: colors.ink }}>
                  {line}
                </div>
              ) : (
                <div className="text-sm mt-0.5" style={{ color: colors.muted }}>
                  Empty
                </div>
              )}
              {teachers ? (
                <div className="text-xs" style={{ color: colors.muted }}>
                  {teachers}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Table({
  rows,
  timeline,
  recap,
}: {
  rows: { batch: { id: string; name: string }; managers: string[]; cells: SheetCell[] }[];
  timeline: ReturnType<typeof buildTimeline>;
  recap: string;
}) {
  return (
    <table className="w-full border-collapse border text-center text-xs" style={{ borderColor: colors.line }}>
      <thead>
        <tr style={{ backgroundColor: colors.paper }}>
          <th className="border p-2 font-semibold" style={{ width: 80, borderColor: colors.line }}>
            Batch
          </th>
          <th className="border p-2 font-semibold" style={{ width: 120, borderColor: colors.line }}>
            <div>{recap}</div>
            <div className="text-[11px] font-normal" style={{ color: colors.muted }}>
              {formatRange(timeline.recap.start, timeline.recap.end)}
            </div>
          </th>
          {timeline.slots.map((slot) => (
            <th
              key={slot.id}
              className="border p-2 font-semibold"
              style={{
                width: slot.kind === "break" ? 80 : 140,
                borderColor: colors.line,
              }}
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
                  {line ? <div className="font-semibold text-xs">{line}</div> : null}
                  {teachers ? <div className="text-[11px] text-stone-500 mt-0.5">{teachers}</div> : null}
                  {!line && !teachers ? <div className="text-center text-stone-300">—</div> : null}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default RoutineTab;
