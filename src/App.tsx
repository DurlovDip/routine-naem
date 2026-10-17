import { useRef, useState } from "react";
import { CopyPlus, FileDown, LogOut, Menu, Printer, Trash2, X } from "lucide-react";
import { AuthProvider, useAuth } from "./auth";
import { PeopleSection } from "./components/AccessPanels";
import { AuthScreen } from "./components/AuthScreen";
import { BatchEditor, FooterEditor, HeaderEditor, LibraryEditor, StructureEditor } from "./components/panels";
import { GridEditor } from "./components/GridEditor";
import { PreviewPane } from "./components/PreviewPane";
import { Button, ConfirmDialog, Section } from "./components/ui";
import { downloadScheduleDocx } from "./lib/docx";
import { roleLabel } from "./lib/roles";
import { joinWithAnd, rotateIds } from "./lib/text";
import { addDays, formatDayNumber, formatSlashDate, weekdayName } from "./lib/time";
import { ScheduleProvider, useSchedule } from "./state";

type Mode = "edit" | "preview";

function readHash(): Mode {
  return window.location.hash.replace(/^#/, "").startsWith("preview") ? "preview" : "edit";
}

function Shell() {
  const { state, dispatch, day } = useSchedule();
  const auth = useAuth();
  const role = auth.session?.role;
  const canEdit = !auth.required || role === "super_admin" || role === "coordinator" || role === "temp_coordinator";
  const canManageCatalog = !auth.required || role === "super_admin";

  const nextDate = addDays(day.date, 1);
  const nextDayNum = day.dayNumber + 1;
  const nextDayExists = state.days.some(
    (d) => d.id !== day.id && (d.date === nextDate || d.dayNumber === nextDayNum),
  );
  const maxDayNum = Math.max(...state.days.map((d) => d.dayNumber), 0);
  const isDuplicateDate = state.days.some((d) => d.id !== day.id && d.date === day.date);
  const isDuplicateDayNum = state.days.some((d) => d.id !== day.id && d.dayNumber === day.dayNumber);
  const [mode, setMode] = useState<Mode>(() => readHash());
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const view: Mode = canEdit ? mode : "preview";
  const showEditor = view !== "preview";
  const showPreview = view !== "edit";

  const nextIds = state.batches.map((batch) =>
    joinWithAnd(rotateIds(batch.roster, day.managers[batch.id] ?? [])),
  );
  const sameNext = nextIds.every((text) => text === nextIds[0]);
  const nextLabel = sameNext ? nextIds[0] || "none" : "the next IDs in each roster";

  return (
    <div className="app">
      <header className="toolbar no-print">
        <div className="brand">
          <div className="brand-title">Daily Schedule</div>
          <div className="brand-sub">
            {auth.session ? `${auth.session.teacherName} · ${roleLabel(auth.session.role)}` : "Class routine for the training course"}
          </div>
        </div>
        <button
          type="button"
          className="toolbar-menu-btn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
        <div className={menuOpen ? "toolbar-collapse open" : "toolbar-collapse"}>
          {canEdit ? (
            <div className="segmented" role="group" aria-label="View">
              {(["edit", "preview"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  aria-pressed={view === item}
                  onClick={() => {
                    setMode(item);
                    setMenuOpen(false);
                  }}
                >
                  {item === "edit" ? "Editor" : "Preview"}
                </button>
              ))}
            </div>
          ) : (
            <div className="role-chip">View only</div>
          )}
          <div className="toolbar-actions">
            <Button
              tone="primary"
              onClick={() => {
                setMenuOpen(false);
                window.print();
              }}
            >
              <Printer size={16} /> Print / PDF
            </Button>
            <Button
              onClick={() => {
                setMenuOpen(false);
                void downloadScheduleDocx(state, day);
              }}
            >
              <FileDown size={16} /> Print / DOCX
            </Button>
            {auth.session ? (
              <Button
                onClick={() => {
                  setMenuOpen(false);
                  void auth.signOut();
                }}
              >
                <LogOut size={16} /> Sign out
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <div
        className="workspace"
        data-editor={showEditor ? "true" : "false"}
        data-preview={showPreview ? "true" : "false"}
      >
        {showEditor ? (
          <aside className="editor-pane no-print">
            <div className="daybar">
              <div className="day-chips mb-3">
                {state.days.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="day-chip"
                    aria-pressed={item.id === day.id}
                    onClick={() => dispatch({ type: "set-active-day", id: item.id })}
                  >
                    <strong>{formatDayNumber(item.dayNumber).replace("Day – ", "Day ")}</strong>
                    <span>{formatSlashDate(item.date)}</span>
                  </button>
                ))}
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label>
                  <span className="field-label">Date</span>
                  <input
                    className={`field ${isDuplicateDate ? "border-red-500 bg-red-50/50" : ""}`}
                    type="date"
                    value={day.date}
                    onChange={(event) =>
                      dispatch({ type: "update-day", id: day.id, patch: { date: event.target.value } })
                    }
                  />
                  <span className="hint">{weekdayName(day.date)}</span>
                  {isDuplicateDate && (
                    <span className="text-xs text-red-600 block mt-1 font-semibold">
                      ⚠️ Date is already scheduled on another day!
                    </span>
                  )}
                </label>
                <label>
                  <span className="field-label">Day number</span>
                  <input
                    className={`field ${isDuplicateDayNum ? "border-red-500 bg-red-50/50" : ""}`}
                    type="number"
                    min={1}
                    max={999}
                    value={day.dayNumber}
                    onChange={(event) =>
                      dispatch({
                        type: "update-day",
                        id: day.id,
                        patch: { dayNumber: Number(event.target.value) },
                      })
                    }
                  />
                  {isDuplicateDayNum && (
                    <span className="text-xs text-red-600 block mt-1 font-semibold">
                      ⚠️ Day number {day.dayNumber} is already used!
                    </span>
                  )}
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  tone="primary"
                  disabled={nextDayExists}
                  title={
                    nextDayExists
                      ? `Day ${nextDayNum < 10 ? `0${nextDayNum}` : nextDayNum} (${formatSlashDate(nextDate)}) already exists`
                      : undefined
                  }
                  onClick={() => dispatch({ type: "duplicate-day", dayId: day.id })}
                >
                  <CopyPlus size={15} /> Duplicate to next day
                </Button>
                <Button
                  disabled={nextDayExists}
                  title={
                    nextDayExists
                      ? `Day ${nextDayNum < 10 ? `0${nextDayNum}` : nextDayNum} (${formatSlashDate(nextDate)}) already exists`
                      : undefined
                  }
                  onClick={() => dispatch({ type: "new-day", dayId: day.id })}
                >
                  Blank next day
                </Button>
                <Button
                  tone="danger"
                  disabled={state.days.length <= 1}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} /> Delete day
                </Button>
              </div>
              {nextDayExists && (
                <div className="mt-2 text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded p-2 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    Day {nextDayNum < 10 ? `0${nextDayNum}` : nextDayNum} ({formatSlashDate(nextDate)}) already exists in routine.
                  </span>
                  <Button
                    tone="quiet"
                    onClick={() => dispatch({ type: "duplicate-day-to-end", dayId: day.id })}
                  >
                    <CopyPlus size={13} /> Duplicate as Day {maxDayNum + 1 < 10 ? `0${maxDayNum + 1}` : maxDayNum + 1}
                  </Button>
                </div>
              )}
              <label className="switch mt-3">
                <input
                  type="checkbox"
                  checked={state.autoRotate}
                  onChange={(event) =>
                    dispatch({ type: "set-auto-rotate", value: event.target.checked })
                  }
                />
                Auto-rotate day managers
              </label>
              <p className="hint">
                {state.autoRotate
                  ? `The next day picks ${nextLabel} from each roster.`
                  : "Duplicating keeps today’s day managers."}
              </p>
            </div>
            <div className="px-4 py-4">
              <GridEditor day={day} />
            </div>
            {auth.session?.role === "super_admin" ? (
              <Section title="Roles" summary="Assign a date range">
                <PeopleSection />
              </Section>
            ) : null}
            {canManageCatalog ? (
              <Section title="Settings" summary="Teachers and modules">
                <LibraryEditor />
              </Section>
            ) : null}
            {canManageCatalog ? (
              <Section title="Batches and day managers" summary={`${state.batches.length} rows`}>
                <BatchEditor day={day} />
              </Section>
            ) : null}
            <Section
              title="Times, sessions and breaks"
              summary={`${day.slots.filter((slot) => slot.kind === "session").length} sessions`}
            >
              <StructureEditor day={day} />
            </Section>
            <Section title="Document header" summary="Scheme, course, duration">
              <HeaderEditor />
            </Section>
            <Section title="Signature and footer" summary={state.footer.name}>
              <FooterEditor />
            </Section>
          </aside>
        ) : null}
        {showPreview ? (
          <main>
            <PreviewPane day={day} sheetRef={sheetRef} />
          </main>
        ) : (
          <div className="screen-hidden">
            <PreviewPane day={day} sheetRef={sheetRef} />
          </div>
        )}
      </div>
      {confirmDelete ? (
        <ConfirmDialog
          title="Delete this day?"
          body="The routines on the other days stay. This day’s cells are removed."
          confirmLabel="Delete day"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            dispatch({ type: "delete-day", dayId: day.id });
            setConfirmDelete(false);
          }}
        />
      ) : null}
    </div>
  );
}

function Gate() {
  const auth = useAuth();
  if (!auth.ready) {
    return (
      <div className="auth-shell">
        <p className="auth-lead">Checking session…</p>
      </div>
    );
  }
  if (auth.required && !auth.session) return <AuthScreen />;
  return <Shell />;
}

export default function App() {
  return (
    <AuthProvider>
      <ScheduleProvider>
        <Gate />
      </ScheduleProvider>
    </AuthProvider>
  );
}
