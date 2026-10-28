import { useState } from "react";
import {
  applyGeneratedGridToDay,
  generateScheduleGrid,
  type BatchItem,
  type GenerateGridResult,
  type TeacherCandidate,
} from "../lib/scheduleAlgorithm";
import { useSchedule } from "../state";
import { colors } from "../theme";
import { Button, Field, Label, T } from "./ui";

export function ToolsTab({ onGoToEditor }: { onGoToEditor?: () => void }) {
  const { state, dispatch, day } = useSchedule();

  // Wizard Step: 1 = Teachers, 2 = Availability (When Free), 3 = Result & Apply
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Active batches and sessions derived directly from current routine
  const sessionSlots = day.slots.filter((s) => s.kind === "session");
  const sessionCount = sessionSlots.length > 0 ? sessionSlots.length : 5;

  const currentBatches: BatchItem[] =
    state.batches.length > 0
      ? state.batches.map((b) => ({ id: b.id, name: b.name }))
      : [
          { id: "b1", name: "Batch 1" },
          { id: "b2", name: "Batch 2" },
          { id: "b3", name: "Batch 3" },
          { id: "b4", name: "Batch 4" },
          { id: "b5", name: "Batch 5" },
        ];

  // Step 1: Participating Teachers
  const [teacherSearch, setTeacherSearch] = useState("");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>(() => {
    const defaultCount = Math.max(currentBatches.length, 5);
    return state.teachers.slice(0, defaultCount).map((t) => t.id);
  });

  // Step 2: Availability Matrix (teacherId -> boolean[sessionIndex])
  const [availability, setAvailability] = useState<Record<string, boolean[]>>({});

  // Step 3: Generation Result
  const [result, setResult] = useState<GenerateGridResult | null>(null);
  const [applied, setApplied] = useState(false);

  // Filter teachers for selection
  const filteredTeachers = state.teachers.filter((t) =>
    t.name.toLowerCase().includes(teacherSearch.toLowerCase().trim()),
  );

  function goToStep2() {
    const updated = { ...availability };
    selectedTeacherIds.forEach((id) => {
      if (!updated[id] || updated[id].length !== sessionCount) {
        updated[id] = Array(sessionCount).fill(true);
      }
    });
    setAvailability(updated);
    setStep(2);
  }

  function toggleSessionFree(teacherId: string, sessionIndex: number) {
    const current = availability[teacherId]
      ? [...availability[teacherId]]
      : Array(sessionCount).fill(true);
    current[sessionIndex] = !current[sessionIndex];
    setAvailability({
      ...availability,
      [teacherId]: current,
    });
  }

  function handleGenerate() {
    const participatingTeachers: TeacherCandidate[] = selectedTeacherIds
      .map((id) => state.teachers.find((t) => t.id === id))
      .filter((t): t is TeacherCandidate => Boolean(t));

    const genResult = generateScheduleGrid({
      sessionCount,
      batches: currentBatches,
      selectedTeachers: participatingTeachers,
      availability,
    });

    setResult(genResult);
    setApplied(false);
    setStep(3);
  }

  function handleApply() {
    if (!result) return;
    const updatedDay = applyGeneratedGridToDay({
      day,
      assignments: result.assignments,
      sessionCount,
    });

    let batches = [...state.batches];
    if (batches.length === 0) {
      batches = currentBatches.map((b) => ({
        id: b.id,
        name: b.name,
        roster: [],
      }));
    }

    dispatch({
      type: "replace",
      state: {
        ...state,
        batches,
        days: state.days.map((d) => (d.id === day.id ? updatedDay : d)),
      },
    });

    setApplied(true);
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-6">
      {/* Title */}
      <div>
        <T weight="bold" style={{ fontSize: 20, color: colors.ink }}>
          Routine Generator
        </T>
        <T style={{ color: colors.muted, fontSize: 13 }}>
          Automatic conflict-free teacher routine optimizer with balanced workload.
        </T>
      </div>

      {/* Stepper Header */}
      <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: colors.line }}>
        {[
          { num: 1, label: "Teachers" },
          { num: 2, label: "When Free" },
          { num: 3, label: "Generate & Apply" },
        ].map((s) => {
          const isActive = step === s.num;
          const isDone = step > s.num;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => {
                if (s.num < step || (s.num === 2 && selectedTeacherIds.length > 0)) {
                  if (s.num === 2) goToStep2();
                  else setStep(s.num as 1 | 2 | 3);
                }
              }}
              className="flex items-center gap-2 cursor-pointer transition hover:opacity-80"
            >
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition"
                style={{
                  backgroundColor: isActive
                    ? colors.accent
                    : isDone
                      ? colors.accentSoft
                      : colors.paper,
                  color: isActive ? "#fff" : isDone ? colors.accentDark : colors.muted,
                }}
              >
                {isDone ? "✓" : s.num}
              </div>
              <span
                className="text-xs sm:text-sm font-medium"
                style={{
                  color: isActive ? colors.ink : colors.muted,
                }}
              >
                {s.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* STEP 1: SELECT PARTICIPATING TEACHERS */}
      {step === 1 && (
        <div
          className="p-5 sm:p-6 rounded-2xl border space-y-4"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.line,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: colors.accentSoft, color: colors.accentDark }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div>
              <T weight="bold" style={{ fontSize: 16, color: colors.ink }}>
                1. Select Teachers Joining Today
              </T>
              <T style={{ color: colors.muted, fontSize: 12 }}>
                Day {day.dayNumber} · {currentBatches.length} Batches · {sessionCount} Sessions ({selectedTeacherIds.length} teachers selected)
              </T>
            </div>
          </div>

          {/* Search Bar */}
          <Field
            value={teacherSearch}
            onChangeText={setTeacherSearch}
            placeholder="Search teachers by name..."
          />

          {/* Quick Controls */}
          <div className="flex items-center justify-between text-xs">
            <span style={{ color: colors.muted }}>
              Needs at least {currentBatches.length} teachers for conflict-free coverage.
            </span>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedTeacherIds(state.teachers.map((t) => t.id))}
                className="font-medium hover:underline"
                style={{ color: colors.accentDark }}
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedTeacherIds([])}
                className="font-medium hover:underline"
                style={{ color: colors.danger }}
              >
                Clear
              </button>
            </div>
          </div>

          {/* Teacher Selection List */}
          <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
            {filteredTeachers.map((teacher) => {
              const selected = selectedTeacherIds.includes(teacher.id);
              return (
                <div
                  key={teacher.id}
                  onClick={() => {
                    if (selected) {
                      setSelectedTeacherIds(selectedTeacherIds.filter((id) => id !== teacher.id));
                    } else {
                      setSelectedTeacherIds([...selectedTeacherIds, teacher.id]);
                    }
                  }}
                  className="p-3 rounded-xl border flex items-center gap-3 cursor-pointer transition"
                  style={{
                    backgroundColor: selected ? colors.accentSoft : colors.paper,
                    borderColor: selected ? colors.accent : colors.line,
                  }}
                >
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center border transition"
                    style={{
                      backgroundColor: selected ? colors.accent : "#fff",
                      borderColor: selected ? colors.accent : colors.line,
                    }}
                  >
                    {selected && (
                      <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <T weight="semibold" style={{ fontSize: 14, color: colors.ink }}>
                      {teacher.name}
                    </T>
                    {teacher.designation ? (
                      <T style={{ fontSize: 11, color: colors.muted }}>
                        {teacher.designation}
                      </T>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-end pt-2">
            <Button
              tone="primary"
              label={`Next: When Free (${selectedTeacherIds.length}) →`}
              disabled={selectedTeacherIds.length === 0}
              onPress={goToStep2}
            />
          </div>
        </div>
      )}

      {/* STEP 2: TEACHER AVAILABILITY (WHEN FREE / BUSY MATRIX) */}
      {step === 2 && (
        <div
          className="p-5 sm:p-6 rounded-2xl border space-y-4"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.line,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: colors.accentSoft, color: colors.accentDark }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <div>
              <T weight="bold" style={{ fontSize: 16, color: colors.ink }}>
                2. When Are Teachers Free?
              </T>
              <T style={{ color: colors.muted, fontSize: 12 }}>
                Coordinator calls each teacher. Uncheck any session they are not free.
              </T>
            </div>
          </div>

          <div
            className="p-3 rounded-lg text-xs"
            style={{ backgroundColor: colors.paper, color: colors.muted }}
          >
            💡 <strong className="text-stone-800">Green (✓ Free):</strong> Teacher can take class.{" "}
            <strong className="text-stone-800">Grey (✗ Busy):</strong> Teacher is busy/unavailable in that session.
          </div>

          <div className="max-h-96 overflow-y-auto space-y-3 pr-1">
            {selectedTeacherIds.map((id) => {
              const teacher = state.teachers.find((t) => t.id === id);
              if (!teacher) return null;
              const freeList = availability[id] || Array(sessionCount).fill(true);

              return (
                <div
                  key={id}
                  className="p-3.5 rounded-xl border space-y-2"
                  style={{
                    backgroundColor: colors.paper,
                    borderColor: colors.line,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <T weight="bold" style={{ fontSize: 14, color: colors.ink }}>
                        {teacher.name}
                      </T>
                      {teacher.designation ? (
                        <T style={{ fontSize: 11, color: colors.muted }}>
                          {teacher.designation}
                        </T>
                      ) : null}
                    </div>

                    {/* Quick all free / all busy */}
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setAvailability({
                            ...availability,
                            [id]: Array(sessionCount).fill(true),
                          });
                        }}
                        className="hover:underline"
                        style={{ color: colors.accentDark }}
                      >
                        All free
                      </button>
                      <span style={{ color: colors.line }}>|</span>
                      <button
                        type="button"
                        onClick={() => {
                          setAvailability({
                            ...availability,
                            [id]: Array(sessionCount).fill(false),
                          });
                        }}
                        className="hover:underline"
                        style={{ color: colors.danger }}
                      >
                        All busy
                      </button>
                    </div>
                  </div>

                  {/* Sessions check/uncheck chips */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {Array.from({ length: sessionCount }).map((_, sIdx) => {
                      const isFree = freeList[sIdx] !== false;
                      return (
                        <button
                          key={sIdx}
                          type="button"
                          onClick={() => toggleSessionFree(id, sIdx)}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 transition"
                          style={{
                            backgroundColor: isFree ? colors.accent : colors.surface,
                            color: isFree ? "#fff" : colors.muted,
                            border: `1px solid ${isFree ? colors.accent : colors.line}`,
                          }}
                        >
                          <span>{isFree ? "✓" : "✗"}</span>
                          <span>S{sIdx + 1} {isFree ? "Free" : "Busy"}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-2">
            <Button label="← Back to Teachers" onPress={() => setStep(1)} />
            <Button
              tone="primary"
              label="⚡ Generate Conflict-Free Routine"
              onPress={handleGenerate}
            />
          </div>
        </div>
      )}

      {/* STEP 3: GENERATED ROUTINE PREVIEW & APPLY */}
      {step === 3 && result && (
        <div
          className="p-5 sm:p-6 rounded-2xl border space-y-4"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.line,
          }}
        >
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: colors.accentSoft, color: colors.accentDark }}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            </div>
            <div>
              <T weight="bold" style={{ fontSize: 16, color: colors.ink }}>
                3. Generated Routine
              </T>
              <T style={{ color: colors.muted, fontSize: 12 }}>
                {result.assignedSlots}/{result.totalSlots} slots assigned conflict-free.
              </T>
            </div>
          </div>

          {/* Conflict status banner */}
          <div
            className="p-3.5 rounded-xl border flex items-center gap-2.5 text-xs sm:text-sm"
            style={{
              backgroundColor: result.hasUnassigned ? colors.warnBg : colors.accentSoft,
              borderColor: result.hasUnassigned ? colors.warn : colors.accent,
              color: result.hasUnassigned ? colors.warn : colors.accentDark,
            }}
          >
            <span>{result.hasUnassigned ? "⚠️" : "✓"}</span>
            <span>
              {result.hasUnassigned
                ? `${result.unassignedSlots} slot(s) need additional teachers due to availability constraints.`
                : "All slots successfully assigned with 0 teacher conflicts!"}
            </span>
          </div>

          {/* Matrix Preview */}
          <div>
            <Label>Schedule Matrix (Batches × Sessions)</Label>
            <div className="overflow-x-auto rounded-xl border" style={{ borderColor: colors.line }}>
              <table className="w-full text-xs text-left">
                <thead>
                  <tr style={{ backgroundColor: colors.paper }}>
                    <th className="p-2.5 font-bold border-b" style={{ borderColor: colors.line, color: colors.ink }}>
                      Batch
                    </th>
                    {Array.from({ length: sessionCount }).map((_, sIdx) => (
                      <th
                        key={sIdx}
                        className="p-2.5 font-bold border-b text-center"
                        style={{ borderColor: colors.line, color: colors.ink }}
                      >
                        Session {sIdx + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {currentBatches.map((batch) => (
                    <tr key={batch.id} className="border-b last:border-b-0" style={{ borderColor: colors.line }}>
                      <td className="p-2.5 font-semibold whitespace-nowrap" style={{ color: colors.ink }}>
                        {batch.name}
                      </td>
                      {Array.from({ length: sessionCount }).map((_, sIdx) => {
                        const item = result.assignments.find(
                          (a) => a.batchId === batch.id && a.sessionIndex === sIdx,
                        );
                        const assigned = Boolean(item?.teacherName);
                        return (
                          <td
                            key={sIdx}
                            className="p-2 text-center"
                            style={{
                              backgroundColor: assigned ? "transparent" : "rgba(220, 38, 38, 0.05)",
                            }}
                          >
                            {assigned ? (
                              <span
                                className="px-2 py-1 rounded font-medium inline-block truncate max-w-[130px]"
                                style={{ backgroundColor: colors.paper, color: colors.ink }}
                              >
                                {item?.teacherName}
                              </span>
                            ) : (
                              <span className="text-red-500 font-semibold">Unassigned</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Teacher Workload Summary */}
          <div>
            <Label>Teacher Workload Distribution</Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {Object.entries(result.teacherLoad).map(([id, load]) => {
                const teacher = state.teachers.find((t) => t.id === id);
                if (!teacher) return null;
                return (
                  <div
                    key={id}
                    className="p-2.5 rounded-lg border text-xs"
                    style={{ backgroundColor: colors.paper, borderColor: colors.line }}
                  >
                    <div className="font-semibold truncate" style={{ color: colors.ink }}>
                      {teacher.name}
                    </div>
                    <div className="text-stone-500">{load} {load === 1 ? "class" : "classes"} today</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Applied Notification */}
          {applied && (
            <div
              className="p-4 rounded-xl border flex items-center justify-between"
              style={{
                backgroundColor: colors.accentSoft,
                borderColor: colors.accent,
              }}
            >
              <div>
                <T weight="bold" style={{ fontSize: 14, color: colors.accentDark }}>
                  Routine Applied Successfully!
                </T>
                <T style={{ fontSize: 12, color: colors.accentDark }}>
                  Day {day.dayNumber} updated with {result.assignedSlots} conflict-free assignments.
                </T>
              </div>
              {onGoToEditor && (
                <Button label="Go to Editor →" tone="primary" onPress={onGoToEditor} />
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex justify-between items-center pt-2">
            <Button label="← Back to Availability" onPress={() => setStep(2)} />
            <Button
              tone="primary"
              label={applied ? "Re-apply to Routine" : "Apply to Routine"}
              onPress={handleApply}
            />
          </div>
        </div>
      )}

      {/* Voice Assistant Info Card */}
      <div
        className="p-5 rounded-2xl border space-y-2 opacity-90"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.line,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🎙️</span>
          <T weight="semibold" style={{ fontSize: 15, color: colors.ink }}>
            Voice Assistant
          </T>
          <span
            className="px-2 py-0.5 rounded-full text-xs font-medium ml-auto"
            style={{ backgroundColor: colors.paper, color: colors.muted }}
          >
            Available in Mobile App
          </span>
        </div>
        <T style={{ color: colors.muted, fontSize: 12, lineHeight: 1.5 }}>
          The AI Voice Assistant for routine queries and live verbal adjustments is supported natively in the Routine NAEM Android app.
        </T>
      </div>
    </div>
  );
}
