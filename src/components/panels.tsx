import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { buildTimeline, sessionSlots } from "../lib/schedule";
import { readSignatureFile } from "../lib/storage";
import { cleanBatchNumber, joinWithAnd, parseRoster, rosterRange } from "../lib/text";
import { formatClock, formatRange, formatSignatureDate, toIsoDate } from "../lib/time";
import { STANDARD_DESIGNATIONS, type Batch, type DayPlan, type HeaderStyle } from "../lib/types";
import { useSchedule } from "../state";
import { DesignationManager, useDesignations } from "../designations";
import { Button, Field } from "./ui";

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button type="button" className="icon-btn" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

export function StructureEditor({ day }: { day: DayPlan }) {
  const { state, dispatch } = useSchedule();
  const timeline = buildTimeline(day);
  const count = sessionSlots(day.slots).length;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Day starts">
          <input
            className="field"
            type="time"
            value={day.dayStart}
            onChange={(event) =>
              dispatch({ type: "update-day", id: day.id, patch: { dayStart: event.target.value } })
            }
          />
        </Field>
        <Field label="Recap length" hint="Minutes">
          <input
            className="field"
            type="number"
            min={5}
            max={360}
            step={5}
            value={day.recapMin}
            onChange={(event) =>
              dispatch({
                type: "update-day",
                id: day.id,
                patch: { recapMin: Number(event.target.value) },
              })
            }
          />
        </Field>
        <Field label="New session length" hint="Minutes">
          <input
            className="field"
            type="number"
            min={5}
            max={360}
            step={5}
            value={day.defaultSessionMin}
            onChange={(event) =>
              dispatch({
                type: "update-day",
                id: day.id,
                patch: { defaultSessionMin: Number(event.target.value) },
              })
            }
          />
        </Field>
      </div>
      <Field label="Recap column title" hint="Shown on every day">
        <input
          className="field"
          value={state.recapLabel}
          onChange={(event) => dispatch({ type: "set-recap-label", text: event.target.value })}
        />
      </Field>
      <p className="text-sm text-stone-600">
        Recap {formatRange(timeline.recap.start, timeline.recap.end)}. The day ends at{" "}
        {formatClock(timeline.end)}. Times follow the start time, then the recap, then each session
        and break.
      </p>
      <div>
        <BreakInsert onClick={() => dispatch({ type: "insert-break", dayId: day.id, index: 0 })} />
        {day.slots.map((slot, index) => {
          const timed = timeline.slots[index];
          return (
            <div key={slot.id}>
              <div className={slot.kind === "break" ? "slot-card break" : "slot-card"}>
                <div className="min-w-0">
                  {slot.kind === "session" ? (
                    <div className="text-sm font-semibold">
                      Session - {timed && timed.kind === "session" ? timed.number : index + 1}
                    </div>
                  ) : (
                    <input
                      className="field"
                      aria-label="Break label"
                      value={slot.label}
                      onChange={(event) =>
                        dispatch({
                          type: "set-break-label",
                          dayId: day.id,
                          slotId: slot.id,
                          label: event.target.value,
                        })
                      }
                    />
                  )}
                  <div className="mt-1 flex items-center gap-2">
                    <input
                      className="field w-20"
                      aria-label="Duration in minutes"
                      type="number"
                      min={5}
                      max={360}
                      step={5}
                      value={slot.durationMin}
                      onChange={(event) =>
                        dispatch({
                          type: "set-slot-duration",
                          dayId: day.id,
                          slotId: slot.id,
                          durationMin: Number(event.target.value),
                        })
                      }
                    />
                    <span className="text-xs text-stone-500">min</span>
                    <span className="text-xs font-semibold text-stone-700">
                      {timed ? formatRange(timed.start, timed.end) : ""}
                    </span>
                  </div>
                </div>
                <div className="slot-actions">
                  <IconButton
                    label="Move up"
                    disabled={index === 0}
                    onClick={() =>
                      dispatch({ type: "move-slot", dayId: day.id, slotId: slot.id, dir: -1 })
                    }
                  >
                    <ChevronUp size={14} />
                  </IconButton>
                  <IconButton
                    label="Move down"
                    disabled={index === day.slots.length - 1}
                    onClick={() =>
                      dispatch({ type: "move-slot", dayId: day.id, slotId: slot.id, dir: 1 })
                    }
                  >
                    <ChevronDown size={14} />
                  </IconButton>
                  <IconButton
                    label={slot.kind === "break" ? "Remove break" : "Remove session"}
                    disabled={slot.kind === "session" && count <= 1}
                    onClick={() => dispatch({ type: "remove-slot", dayId: day.id, slotId: slot.id })}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              </div>
              <BreakInsert
                onClick={() => dispatch({ type: "insert-break", dayId: day.id, index: index + 1 })}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Button
          tone="primary"
          disabled={count >= 10}
          onClick={() => dispatch({ type: "add-session", dayId: day.id })}
        >
          <Plus size={15} /> Add session
        </Button>
        <span className="text-xs text-stone-500">{count} of 10 sessions</span>
      </div>
    </div>
  );
}

function BreakInsert({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="break-insert" onClick={onClick}>
      <Plus size={12} /> Add break here
    </button>
  );
}

function RosterField({ batch }: { batch: Batch }) {
  const { dispatch } = useSchedule();
  const rosterText = batch.roster.join(", ");
  const [text, setText] = useState(rosterText);
  const [focused, setFocused] = useState(false);

  return (
    <Field label="Roster" hint="Comma or space separated. These are the IDs you can assign as day managers.">
      <textarea
        className="area"
        value={focused ? text : rosterText}
        onFocus={() => {
          setText(rosterText);
          setFocused(true);
        }}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          setFocused(false);
          dispatch({ type: "set-roster", id: batch.id, roster: parseRoster(text) });
        }}
      />
      <Button
        tone="quiet"
        className="mt-1"
        onClick={() => {
          const count = batch.numberOfStudents ?? 40;
          dispatch({ type: "set-roster", id: batch.id, roster: rosterRange(1, count) });
        }}
      >
        Fill 01–{batch.numberOfStudents ?? 40}
      </Button>
    </Field>
  );
}

export function BatchEditor({ day }: { day: DayPlan }) {
  const { state, dispatch } = useSchedule();

  return (
    <div>
      {state.batches.length === 0 ? (
        <p className="mb-3 text-sm text-stone-600">No batches yet. Add the first row of the routine.</p>
      ) : null}
      {state.batches.map((batch, index) => {
        const selected = new Set(day.managers[batch.id] ?? []);
        const placeholderName = cleanBatchNumber(batch.name, batch.id);
        const studentCount = batch.numberOfStudents ?? batch.roster.length ?? 40;
        return (
          <article key={batch.id} className="batch-card">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex-1">
                <input
                  className="field"
                  aria-label="Batch name"
                  placeholder={placeholderName ? `${placeholderName} Batch` : "Batch name"}
                  value={batch.name}
                  onChange={(event) =>
                    dispatch({ type: "rename-batch", id: batch.id, name: event.target.value })
                  }
                />
              </div>
              <div className="flex items-center gap-1 shrink-0" title="Number of students">
                <span className="text-xs text-stone-500">Students:</span>
                <input
                  className="field w-16 text-center"
                  type="number"
                  min={1}
                  max={200}
                  aria-label="Number of students"
                  value={studentCount}
                  onChange={(event) =>
                    dispatch({
                      type: "set-batch-student-count",
                      id: batch.id,
                      count: Number(event.target.value),
                    })
                  }
                />
              </div>
              <IconButton
                label="Move batch up"
                disabled={index === 0}
                onClick={() => dispatch({ type: "move-batch", id: batch.id, dir: -1 })}
              >
                <ChevronUp size={14} />
              </IconButton>
              <IconButton
                label="Move batch down"
                disabled={index === state.batches.length - 1}
                onClick={() => dispatch({ type: "move-batch", id: batch.id, dir: 1 })}
              >
                <ChevronDown size={14} />
              </IconButton>
              <IconButton
                label="Remove batch"
                onClick={() => dispatch({ type: "remove-batch", id: batch.id })}
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
            <div className="field-label">Day managers</div>
            {batch.roster.length === 0 ? (
              <p className="mb-2 text-sm text-stone-500">Add roster IDs before choosing day managers.</p>
            ) : (
              <div className="chips" role="group" aria-label={`${batch.name} day managers`}>
                {batch.roster.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className="chip"
                    aria-pressed={selected.has(id)}
                    onClick={() => {
                      const next = new Set(selected);
                      if (next.has(id)) next.delete(id);
                      else next.add(id);
                      const ids = batch.roster.filter((item) => next.has(item));
                      dispatch({ type: "set-managers", dayId: day.id, batchId: batch.id, ids });
                    }}
                  >
                    {id}
                  </button>
                ))}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-stone-600">
                Prints as{" "}
                <span className="font-sheet font-bold">
                  ID No.- {joinWithAnd(batch.roster.filter((id) => selected.has(id))) || "—"}
                </span>
              </p>
              <Button
                tone="quiet"
                onClick={() => dispatch({ type: "copy-managers", dayId: day.id, batchId: batch.id })}
              >
                Use for every batch
              </Button>
            </div>
            <div className="mt-3">
              <RosterField batch={batch} />
            </div>
          </article>
        );
      })}
      <Button tone="primary" className="mt-3" onClick={() => dispatch({ type: "add-batch" })}>
        <Plus size={15} /> Add batch
      </Button>
    </div>
  );
}

const HEADER_STYLES: { value: HeaderStyle; label: string }[] = [
  { value: "normal", label: "Plain" },
  { value: "title", label: "Course title" },
  { value: "subtitle", label: "Subtitle" },
];

export function HeaderEditor() {
  const { state, dispatch } = useSchedule();
  return (
    <div className="space-y-2">
      {state.header.map((line, index) => (
        <div key={line.id} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <input
              className="field"
              aria-label={`Header line ${index + 1}`}
              value={line.text}
              onChange={(event) =>
                dispatch({ type: "set-header-line", id: line.id, patch: { text: event.target.value } })
              }
            />
            <select
              className="field mt-1"
              aria-label={`Style for header line ${index + 1}`}
              value={line.style}
              onChange={(event) =>
                dispatch({
                  type: "set-header-line",
                  id: line.id,
                  patch: { style: event.target.value as HeaderStyle },
                })
              }
            >
              {HEADER_STYLES.map((style) => (
                <option key={style.value} value={style.value}>
                  {style.label}
                </option>
              ))}
            </select>
          </div>
          <IconButton
            label="Move line up"
            disabled={index === 0}
            onClick={() => dispatch({ type: "move-header-line", id: line.id, dir: -1 })}
          >
            <ChevronUp size={14} />
          </IconButton>
          <IconButton
            label="Move line down"
            disabled={index === state.header.length - 1}
            onClick={() => dispatch({ type: "move-header-line", id: line.id, dir: 1 })}
          >
            <ChevronDown size={14} />
          </IconButton>
          <IconButton
            label="Remove line"
            disabled={state.header.length <= 1}
            onClick={() => dispatch({ type: "remove-header-line", id: line.id })}
          >
            <Trash2 size={14} />
          </IconButton>
        </div>
      ))}
      <Button tone="ghost" onClick={() => dispatch({ type: "add-header-line" })}>
        <Plus size={15} /> Add line
      </Button>
    </div>
  );
}

export function LibraryEditor() {
  const { state, dispatch } = useSchedule();
  const designations = useDesignations();
  const [teacher, setTeacher] = useState("");
  const [teacherDesignation, setTeacherDesignation] = useState<string>("Assistant Director");
  const [moduleNumber, setModuleNumber] = useState("");
  const [subNumber, setSubNumber] = useState("");

  return (
    <div className="settings-panel">
      <DesignationManager />
      <div>
        <div className="field-label">Teachers</div>
        <p className="hint mb-2">Teacher names and official designations.</p>
        <ul className="settings-list space-y-2">
          {state.teachers.map((item) => (
            <li key={item.id} className="settings-item flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
              <input
                className="field flex-1"
                aria-label={`Teacher ${item.name}`}
                placeholder="Teacher name"
                value={item.name}
                onChange={(event) =>
                  dispatch({ type: "rename-teacher", id: item.id, name: event.target.value })
                }
              />
              <select
                className="field sm:w-48 text-xs"
                aria-label={`Designation for ${item.name}`}
                value={item.designation || ""}
                onChange={(event) =>
                  dispatch({
                    type: "set-teacher-designation",
                    id: item.id,
                    designation: event.target.value,
                  })
                }
              >
                <option value="">(No Designation)</option>
                {designations.names.map((des) => (
                  <option key={des} value={des}>
                    {des}
                  </option>
                ))}
              </select>
              <IconButton
                label={`Remove ${item.name}`}
                onClick={() => dispatch({ type: "remove-teacher", id: item.id })}
              >
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
        <form
          className="mt-3 flex flex-col sm:flex-row gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!teacher.trim()) return;
            dispatch({
              type: "add-teacher",
              name: teacher,
              designation: teacherDesignation,
            });
            setTeacher("");
          }}
        >
          <input
            className="field flex-1"
            placeholder="New teacher name"
            value={teacher}
            onChange={(event) => setTeacher(event.target.value)}
          />
          <select
            className="field sm:w-48 text-xs"
            aria-label="New teacher designation"
            value={teacherDesignation}
            onChange={(event) => setTeacherDesignation(event.target.value)}
          >
            <option value="">(No Designation)</option>
            {designations.names.map((des) => (
              <option key={des} value={des}>
                {des}
              </option>
            ))}
          </select>
          <Button type="submit" tone="primary">
            Add
          </Button>
        </form>
      </div>
      <div>
        <div className="field-label">Modules</div>
        <p className="hint">Module numbers and sub-numbers. A cell prints as M- 7.04.</p>
        <div className="mt-2 text-xs font-semibold text-stone-500">Module number</div>
        <div className="tag-list">
          {state.moduleNumbers.map((item) => (
            <span key={item} className="tag">
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => dispatch({ type: "remove-module-number", value: item })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            dispatch({ type: "add-module-number", value: moduleNumber });
            setModuleNumber("");
          }}
        >
          <input
            className="field"
            placeholder="M-7"
            value={moduleNumber}
            onChange={(event) => setModuleNumber(event.target.value)}
          />
          <Button type="submit" tone="primary">
            Add
          </Button>
        </form>
        <div className="mt-3 text-xs font-semibold text-stone-500">Sub-number</div>
        <div className="tag-list">
          {state.subNumbers.map((item) => (
            <span key={item} className="tag">
              {item}
              <button
                type="button"
                aria-label={`Remove ${item}`}
                onClick={() => dispatch({ type: "remove-sub-number", value: item })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
        <form
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            dispatch({ type: "add-sub-number", value: subNumber });
            setSubNumber("");
          }}
        >
          <input
            className="field"
            placeholder=".04"
            value={subNumber}
            onChange={(event) => setSubNumber(event.target.value)}
          />
          <Button type="submit" tone="primary">
            Add
          </Button>
        </form>
      </div>
    </div>
  );
}

export function FooterEditor() {
  const { state, dispatch } = useSchedule();
  const footer = state.footer;

  const designation = footer.designation ?? "Assistant Director";
  const isCourseCoordinator = footer.isCourseCoordinator ?? true;
  const courseName = footer.courseName ?? (footer.lines[1] ?? "");

  const resolvedDesignationLine = designation.trim()
    ? isCourseCoordinator
      ? `${designation.trim()} & Course Coordinator`
      : designation.trim()
    : isCourseCoordinator
      ? "Course Coordinator"
      : "";

  async function onFile(file: File | undefined) {
    if (!file) return;
    const signature = await readSignatureFile(file);
    dispatch({ type: "set-footer", patch: { signature } });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex h-20 w-44 items-center justify-center rounded-md border border-dashed border-[#ddd4c6] bg-white">
          {footer.signature ? (
            <img src={footer.signature} alt="" className="max-h-16 max-w-full object-contain" />
          ) : (
            <span className="text-xs text-stone-400">No signature</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="btn btn-ghost">
            Upload signature
            <input
              className="sr-only"
              type="file"
              accept="image/*"
              onChange={(event) => {
                void onFile(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          {footer.signature ? (
            <Button tone="quiet" onClick={() => dispatch({ type: "set-footer", patch: { signature: null } })}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <Field
        label="Signature date"
        hint={
          footer.signatureDate
            ? `Prints as: ${formatSignatureDate(footer.signatureDate)}`
            : "Choose date for the signature line"
        }
      >
        <div className="flex gap-2 items-center">
          <input
            className="field flex-1"
            type="date"
            aria-label="Signature date"
            value={toIsoDate(footer.signatureDate)}
            onClick={(event) => {
              try {
                event.currentTarget.showPicker?.();
              } catch {
                // ignore
              }
            }}
            onChange={(event) =>
              dispatch({
                type: "set-footer",
                patch: { signatureDate: formatSignatureDate(event.target.value) },
              })
            }
          />
          <Button
            tone="quiet"
            onClick={() => {
              const today = new Date().toISOString().slice(0, 10);
              dispatch({
                type: "set-footer",
                patch: { signatureDate: formatSignatureDate(today) },
              });
            }}
          >
            Today
          </Button>
        </div>
      </Field>
      <Field label="Name">
        <input
          className="field"
          placeholder="Signee full name"
          value={footer.name}
          onChange={(event) => dispatch({ type: "set-footer", patch: { name: event.target.value } })}
        />
      </Field>
      <Field label="Designation">
        <select
          className="field"
          aria-label="Designation dropdown"
          value={designation}
          onChange={(event) =>
            dispatch({
              type: "set-footer",
              patch: { designation: event.target.value },
            })
          }
        >
          {STANDARD_DESIGNATIONS.map((des) => (
            <option key={des} value={des}>
              {des}
            </option>
          ))}
          {designation && !STANDARD_DESIGNATIONS.includes(designation as any) && (
            <option value={designation}>{designation}</option>
          )}
        </select>
      </Field>
      <div className="rounded-md border border-[#e4ded5] bg-[#faf8f4] p-3 space-y-1">
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-semibold text-stone-800">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-stone-300 text-stone-800 focus:ring-stone-500"
            checked={isCourseCoordinator}
            onChange={(event) =>
              dispatch({
                type: "set-footer",
                patch: { isCourseCoordinator: event.target.checked },
              })
            }
          />
          <span>Course Coordinator</span>
          <span className="text-xs font-normal text-stone-500">(appends &amp; Course Coordinator)</span>
        </label>
        <div className="text-xs text-stone-600 pl-6">
          Prints as: <span className="font-semibold text-stone-800">{resolvedDesignationLine || "(empty)"}</span>
        </div>
      </div>
      <Field label="Course name" hint="Printed as the last line in the bottom right corner">
        <input
          className="field"
          placeholder="e.g. 12th ACSD Training Course"
          value={courseName}
          onChange={(event) =>
            dispatch({
              type: "set-footer",
              patch: { courseName: event.target.value },
            })
          }
        />
      </Field>
    </div>
  );
}
