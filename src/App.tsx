import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { CopyPlus, Download, ImageDown, Printer, RotateCcw, Trash2, Upload } from "lucide-react";
import { BatchEditor, FooterEditor, HeaderEditor, LibraryEditor, StructureEditor } from "./components/panels";
import { GridEditor } from "./components/GridEditor";
import { PreviewPane } from "./components/PreviewPane";
import { Button, ConfirmDialog, Section } from "./components/ui";
import { joinWithAnd, rotateIds } from "./lib/text";
import { exportJson, normalizeState } from "./lib/storage";
import { formatDayNumber, formatSlashDate, weekdayName } from "./lib/time";
import type { CellSelection } from "./lib/types";
import { ScheduleProvider, useSchedule } from "./state";

type Mode = "split" | "edit" | "preview";
type ConfirmKind = "reset" | "delete-day" | null;

function readHash(): { mode: Mode; cell: CellSelection | null } {
  const hash = window.location.hash.replace(/^#/, "");
  const mode: Mode = hash.startsWith("preview") ? "preview" : hash.startsWith("edit") ? "edit" : "split";
  const match = hash.match(/cell=([^&]+)/);
  if (!match?.[1]) return { mode, cell: null };
  const [batchId, sessionId] = decodeURIComponent(match[1]).split(":");
  if (!batchId || !sessionId) return { mode, cell: null };
  return { mode, cell: { batchId, sessionId } };
}

function useWideScreen() {
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1100px)").matches);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 1100px)");
    const onChange = () => setWide(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return wide;
}

function Shell() {
  const { state, dispatch, day, persistError } = useSchedule();
  const [mode, setMode] = useState<Mode>(() => readHash().mode);
  const [selection, setSelection] = useState<CellSelection | null>(() => readHash().cell);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [status, setStatus] = useState("Saved in this browser");
  const [pngTick, setPngTick] = useState(0);
  const wide = useWideScreen();
  const sheetRef = useRef<HTMLDivElement>(null);
  const pngRun = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const effective: Mode = !wide && mode === "split" ? "edit" : mode;
  const showEditor = effective !== "preview";
  const showPreview = effective !== "edit";

  const nextIds = state.batches.map((batch) =>
    joinWithAnd(rotateIds(batch.roster, day.managers[batch.id] ?? [])),
  );
  const sameNext = nextIds.every((text) => text === nextIds[0]);
  const nextLabel = sameNext ? nextIds[0] || "none" : "the next IDs in each roster";

  useEffect(() => {
    if (pngTick === 0) return;
    const run = ++pngRun.current;
    const node = sheetRef.current;
    if (!node) return;
    void (async () => {
      try {
        await document.fonts.ready;
        if (pngRun.current !== run) return;
        const dataUrl = await toPng(node, {
          pixelRatio: 2,
          backgroundColor: "#ffffff",
          cacheBust: true,
        });
        if (pngRun.current !== run) return;
        const number = String(day.dayNumber).padStart(2, "0");
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = `daily-schedule-day-${number}-${day.date}.png`;
        document.body.append(link);
        link.click();
        link.remove();
        setStatus("PNG downloaded");
      } catch {
        if (pngRun.current === run) setStatus("Could not create the PNG");
      }
    })();
  }, [day.date, day.dayNumber, pngTick]);

  async function onImport(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = normalizeState(JSON.parse(await file.text()));
      if (!parsed) {
        setStatus("That file is not a schedule");
        return;
      }
      dispatch({ type: "replace", state: parsed });
      setSelection(null);
      setStatus("Schedule imported");
    } catch {
      setStatus("Could not read that JSON file");
    }
  }

  return (
    <div className="app">
      <header className="toolbar no-print">
        <div className="mr-auto">
          <div className="brand-title">Daily Schedule</div>
          <div className="brand-sub">Class routine for the training course</div>
        </div>
        <div className="segmented" role="group" aria-label="View">
          {(wide ? (["edit", "split", "preview"] as const) : (["edit", "preview"] as const)).map((item) => (
            <button
              key={item}
              type="button"
              aria-pressed={mode === item || (!wide && item === "edit" && mode === "split")}
              onClick={() => setMode(item)}
            >
              {item === "edit" ? "Editor" : item === "preview" ? "Preview" : "Split"}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <Button tone="primary" onClick={() => window.print()}>
            <Printer size={16} /> Print / PDF
          </Button>
          <Button
            onClick={() => {
              setMode("preview");
              setPngTick((value) => value + 1);
            }}
          >
            <ImageDown size={16} /> PNG
          </Button>
          <Button onClick={() => exportJson(state)}>
            <Download size={16} /> JSON
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Import
          </Button>
          <Button tone="quiet" onClick={() => setConfirm("reset")}>
            <RotateCcw size={15} /> Sample
          </Button>
        </div>
        <div className="status" role="status">
          {persistError ? "This browser blocked saving. Export JSON to keep a copy." : status}
        </div>
        <input
          ref={fileRef}
          className="sr-only"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            void onImport(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
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
                  onClick={() => setConfirm("delete-day")}
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
              <GridEditor day={day} selection={selection} onSelect={setSelection} />
            </div>
            <Section title="Batches and day managers" summary={`${state.batches.length} rows`} defaultOpen>
              <BatchEditor day={day} />
            </Section>
            <Section
              title="Times, sessions and breaks"
              summary={`${day.slots.filter((slot) => slot.kind === "session").length} sessions`}
              defaultOpen
            >
              <StructureEditor day={day} />
            </Section>
            <Section title="Document header" summary="Scheme, course, duration">
              <HeaderEditor />
            </Section>
            <Section title="Module and teacher library" summary={`${state.modules.length} modules`}>
              <LibraryEditor />
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
      {confirm ? (
        <ConfirmDialog
          title={confirm === "reset" ? "Restore the sample sheet?" : "Delete this day?"}
          body={
            confirm === "reset"
              ? "This replaces the schedule in this browser with the Day 07 sample from 18 October 2026."
              : "The routines on the other days stay. This day’s cells are removed."
          }
          confirmLabel={confirm === "reset" ? "Restore sample" : "Delete day"}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm === "reset") dispatch({ type: "reset-demo" });
            else dispatch({ type: "delete-day", dayId: day.id });
            setSelection(null);
            setConfirm(null);
            setStatus(confirm === "reset" ? "Sample sheet restored" : "Day deleted");
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
