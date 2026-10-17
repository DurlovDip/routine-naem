import { useRef, useState } from "react";
import { CopyPlus, FileDown, Menu, Printer, Trash2, X } from "lucide-react";
import { BatchEditor, FooterEditor, HeaderEditor, LibraryEditor, StructureEditor } from "./components/panels";
import { GridEditor } from "./components/GridEditor";
import { PreviewPane } from "./components/PreviewPane";
import { Button, ConfirmDialog, Section } from "./components/ui";
import { downloadScheduleDocx } from "./lib/docx";
import { joinWithAnd, rotateIds } from "./lib/text";
import { formatDayNumber, formatSlashDate, weekdayName } from "./lib/time";
import { ScheduleProvider, useSchedule } from "./state";

type Mode = "edit" | "preview";

function readHash(): Mode {
  return window.location.hash.replace(/^#/, "").startsWith("preview") ? "preview" : "edit";
}

function Shell() {
  const { state, dispatch, day } = useSchedule();
  const [mode, setMode] = useState<Mode>(() => readHash());
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const showEditor = mode !== "preview";
  const showPreview = mode !== "edit";

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
          <div className="brand-sub">Class routine for the training course</div>
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
          <div className="segmented" role="group" aria-label="View">
            {(["edit", "preview"] as const).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={mode === item}
                onClick={() => {
                  setMode(item);
                  setMenuOpen(false);
                }}
              >
                {item === "edit" ? "Editor" : "Preview"}
              </button>
            ))}
          </div>
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
                    className="field"
                    type="date"
                    value={day.date}
                    onChange={(event) =>
                      dispatch({ type: "update-day", id: day.id, patch: { date: event.target.value } })
                    }
                  />
                  <span className="hint">{weekdayName(day.date)}</span>
                </label>
                <label>
                  <span className="field-label">Day number</span>
                  <input
                    className="field"
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
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  tone="primary"
                  onClick={() => dispatch({ type: "duplicate-day", dayId: day.id })}
                >
                  <CopyPlus size={15} /> Duplicate to next day
                </Button>
                <Button onClick={() => dispatch({ type: "new-day", dayId: day.id })}>Blank next day</Button>
                <Button
                  tone="danger"
                  disabled={state.days.length <= 1}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 size={15} /> Delete day
                </Button>
              </div>
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
            <Section title="Settings" summary="Teachers and modules">
              <LibraryEditor />
            </Section>
            <Section title="Batches and day managers" summary={`${state.batches.length} rows`}>
              <BatchEditor day={day} />
            </Section>
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

export default function App() {
  return (
    <ScheduleProvider>
      <Shell />
    </ScheduleProvider>
  );
}
