import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { buildTimeline, sessionSlots } from "../lib/schedule";
import { readSignatureFile } from "../lib/storage";
import { joinWithAnd, parseRoster, rosterRange } from "../lib/text";
import { formatClock, formatRange } from "../lib/time";
import type { Batch, DayPlan, HeaderStyle } from "../lib/types";
import { useSchedule } from "../state";
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
        onClick={() => dispatch({ type: "set-roster", id: batch.id, roster: rosterRange(1, 30) })}
      >
        Fill 01–30
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
        return (
          <article key={batch.id} className="batch-card">
            <div className="mb-2 flex items-start gap-2">
              <input
                className="field"
                aria-label="Batch name"
                value={batch.name}
                onChange={(event) =>
                  dispatch({ type: "rename-batch", id: batch.id, name: event.target.value })
                }
              />
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
  const [teacher, setTeacher] = useState("");
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");

  return (
    <div className="space-y-4">
      <div>
        <div className="field-label">Teachers</div>
        <ul className="space-y-1.5">
          {state.teachers.map((item) => (
            <li key={item.id} className="flex gap-2">
              <input
                className="field"
                aria-label={`Teacher ${item.name}`}
                value={item.name}
                onChange={(event) =>
                  dispatch({ type: "rename-teacher", id: item.id, name: event.target.value })
                }
              />
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
          className="mt-2 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            dispatch({ type: "add-teacher", name: teacher });
            setTeacher("");
          }}
        >
          <input
            className="field"
            placeholder="Add a teacher"
            value={teacher}
            onChange={(event) => setTeacher(event.target.value)}
          />
          <Button type="submit" tone="primary">
            Add
          </Button>
        </form>
        <p className="hint">Removing a name from this list leaves it on routines already written.</p>
      </div>
      <div>
        <div className="field-label">Modules</div>
        <ul className="space-y-1.5">
          {state.modules.map((item) => (
            <li key={item.id} className="flex gap-2">
              <input
                className="field"
                aria-label="Module code"
                value={item.code}
                onChange={(event) =>
                  dispatch({
                    type: "update-module",
                    id: item.id,
                    code: event.target.value,
                    title: item.title,
                  })
                }
              />
              <input
                className="field"
                aria-label="Module title"
                value={item.title}
                placeholder="Title or note"
                onChange={(event) =>
                  dispatch({
                    type: "update-module",
                    id: item.id,
                    code: item.code,
                    title: event.target.value,
                  })
                }
              />
              <IconButton
                label={`Remove ${item.code}`}
                onClick={() => dispatch({ type: "remove-module", id: item.id })}
              >
                <Trash2 size={14} />
              </IconButton>
            </li>
          ))}
        </ul>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            dispatch({ type: "add-module", code, title });
            setCode("");
            setTitle("");
          }}
        >
          <input
            className="field min-w-28 flex-1"
            placeholder="M- 1.01"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
          <input
            className="field min-w-36 flex-1"
            placeholder="Title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
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
      <Field label="Signature date">
        <input
          className="field"
          value={footer.signatureDate}
          onChange={(event) => dispatch({ type: "set-footer", patch: { signatureDate: event.target.value } })}
        />
      </Field>
      <Field label="Name">
        <input
          className="field"
          value={footer.name}
          onChange={(event) => dispatch({ type: "set-footer", patch: { name: event.target.value } })}
        />
      </Field>
      <div>
        <div className="field-label">Designation lines</div>
        {footer.lines.map((line, index) => (
          <div key={index} className="mb-2 flex gap-2">
            <input
              className="field"
              aria-label={`Designation line ${index + 1}`}
              value={line}
              onChange={(event) =>
                dispatch({ type: "set-footer-line", index, text: event.target.value })
              }
            />
            <IconButton
              label="Remove designation line"
              onClick={() => dispatch({ type: "remove-footer-line", index })}
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        <Button tone="ghost" onClick={() => dispatch({ type: "add-footer-line" })}>
          <Plus size={15} /> Add line
        </Button>
      </div>
    </div>
  );
}
