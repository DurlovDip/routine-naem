import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { useSchedule } from "../store";
import { card, colors, radius, shadow, space } from "../theme";
import { Button, Field, Label, T } from "../ui";
import {
  applyGeneratedGridToDay,
  generateScheduleGrid,
  type BatchItem,
  type GenerateGridResult,
  type TeacherCandidate,
} from "./scheduleAlgorithm";

export function RoutineGenerator() {
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
  // default: all sessions true (free)
  const [availability, setAvailability] = useState<Record<string, boolean[]>>({});

  // Step 3: Generation Result
  const [result, setResult] = useState<GenerateGridResult | null>(null);
  const [applied, setApplied] = useState(false);

  // Filter teachers for selection
  const filteredTeachers = state.teachers.filter((t) =>
    t.name.toLowerCase().includes(teacherSearch.toLowerCase().trim()),
  );

  // Ensure availability is initialized when moving to Step 2
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

  // Toggle teacher's availability for a specific session
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

  // Run generation algorithm
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

  // Apply generated schedule to current day automatically
  function handleApply() {
    if (!result) return;
    const updatedDay = applyGeneratedGridToDay({
      day,
      assignments: result.assignments,
      sessionCount,
    });

    // Also ensure state.batches has these batches if missing
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
    Alert.alert(
      "Routine Applied Successfully!",
      `Day ${day.dayNumber} routine has been automatically set up with ${result.assignedSlots} conflict-free assignments (0 collisions, balanced workload). Module codes can now be picked manually in the editor.`,
      [
        { text: "Keep Editing" },
        {
          text: "Go to Editor",
          onPress: () => router.push("/(main)/editor"),
        },
      ],
    );
  }

  return (
    <View style={{ gap: space.md }}>
      {/* Stepper Header */}
      <View style={stepBar}>
        {[
          { num: 1, label: "Teachers" },
          { num: 2, label: "When Free" },
          { num: 3, label: "Generate & Apply" },
        ].map((s) => (
          <Pressable
            key={s.num}
            onPress={() => {
              if (s.num < step || (s.num === 2 && selectedTeacherIds.length > 0)) {
                if (s.num === 2) goToStep2();
                else setStep(s.num as 1 | 2 | 3);
              }
            }}
            style={[
              stepDot,
              step === s.num && stepDotActive,
              step > s.num && stepDotDone,
            ]}
          >
            <T
              weight="bold"
              style={{
                fontSize: 12,
                color: step === s.num ? "#fff" : step > s.num ? colors.accent : colors.muted,
              }}
            >
              {s.num}
            </T>
          </Pressable>
        ))}
      </View>

      {/* STEP 1: SELECT PARTICIPATING TEACHERS */}
      {step === 1 && (
        <View style={card}>
          <View style={headerRow}>
            <View style={iconCircle}>
              <Ionicons name="people-outline" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 16, color: colors.ink }}>
                1. Select Teachers Joining Today
              </T>
              <T style={{ color: colors.muted, fontSize: 12 }}>
                Day {day.dayNumber} · {currentBatches.length} Batches · {sessionCount} Sessions ({selectedTeacherIds.length} teachers selected)
              </T>
            </View>
          </View>

          {/* Search Bar */}
          <Field
            value={teacherSearch}
            onChangeText={setTeacherSearch}
            placeholder="Search teachers by name..."
          />

          {/* Quick Controls */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <T style={{ color: colors.muted, fontSize: 12 }}>
              Needs at least {currentBatches.length} teachers for conflict-free coverage.
            </T>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Pressable
                onPress={() => setSelectedTeacherIds(state.teachers.map((t) => t.id))}
                hitSlop={8}
              >
                <T weight="medium" style={{ color: colors.accent, fontSize: 12 }}>
                  Select all
                </T>
              </Pressable>
              <Pressable onPress={() => setSelectedTeacherIds([])} hitSlop={8}>
                <T weight="medium" style={{ color: colors.danger, fontSize: 12 }}>
                  Clear
                </T>
              </Pressable>
            </View>
          </View>

          {/* Teacher Selection List */}
          <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
            <View style={{ gap: 6 }}>
              {filteredTeachers.map((teacher) => {
                const selected = selectedTeacherIds.includes(teacher.id);
                return (
                  <Pressable
                    key={teacher.id}
                    onPress={() => {
                      if (selected) {
                        setSelectedTeacherIds(selectedTeacherIds.filter((id) => id !== teacher.id));
                      } else {
                        setSelectedTeacherIds([...selectedTeacherIds, teacher.id]);
                      }
                    }}
                    style={[
                      teacherSelectRow,
                      selected && teacherSelectRowActive,
                    ]}
                  >
                    <View
                      style={[
                        checkboxSquare,
                        selected && checkboxSquareChecked,
                      ]}
                    >
                      {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <T weight="semibold" style={{ fontSize: 14, color: colors.ink }}>
                        {teacher.name}
                      </T>
                      {teacher.designation ? (
                        <T style={{ fontSize: 11, color: colors.muted }}>
                          {teacher.designation}
                        </T>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: space.sm }}>
            <Button
              tone="primary"
              label={`Next: When Free (${selectedTeacherIds.length}) →`}
              disabled={selectedTeacherIds.length === 0}
              onPress={goToStep2}
            />
          </View>
        </View>
      )}

      {/* STEP 2: TEACHER AVAILABILITY (WHEN FREE / BUSY MATRIX) */}
      {step === 2 && (
        <View style={card}>
          <View style={headerRow}>
            <View style={iconCircle}>
              <Ionicons name="call-outline" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 16, color: colors.ink }}>
                2. When Are Teachers Free?
              </T>
              <T style={{ color: colors.muted, fontSize: 12 }}>
                Coordinator calls each teacher. Uncheck any session they are not free.
              </T>
            </View>
          </View>

          <T style={{ color: colors.muted, fontSize: 12, backgroundColor: colors.paper, padding: 8, borderRadius: radius.sm }}>
            💡 <T weight="semibold">Green (✓ Free):</T> Teacher can take class.{" "}
            <T weight="semibold">Grey/Red (✗ Busy):</T> Teacher is busy/unavailable in that session.
          </T>

          <ScrollView style={{ maxHeight: 340 }} nestedScrollEnabled>
            <View style={{ gap: 10 }}>
              {selectedTeacherIds.map((id) => {
                const teacher = state.teachers.find((t) => t.id === id);
                if (!teacher) return null;
                const freeList = availability[id] || Array(sessionCount).fill(true);

                return (
                  <View key={id} style={availTeacherCard}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <View style={{ flex: 1 }}>
                        <T weight="bold" style={{ fontSize: 14, color: colors.ink }}>
                          {teacher.name}
                        </T>
                        {teacher.designation ? (
                          <T style={{ fontSize: 11, color: colors.muted }}>
                            {teacher.designation}
                          </T>
                        ) : null}
                      </View>
                      {/* Quick all free / all busy */}
                      <View style={{ flexDirection: "row", gap: 6 }}>
                        <Pressable
                          hitSlop={6}
                          onPress={() => {
                            setAvailability({
                              ...availability,
                              [id]: Array(sessionCount).fill(true),
                            });
                          }}
                        >
                          <T style={{ color: colors.accent, fontSize: 11 }}>All free</T>
                        </Pressable>
                        <T style={{ color: colors.line }}>|</T>
                        <Pressable
                          hitSlop={6}
                          onPress={() => {
                            setAvailability({
                              ...availability,
                              [id]: Array(sessionCount).fill(false),
                            });
                          }}
                        >
                          <T style={{ color: colors.danger, fontSize: 11 }}>All busy</T>
                        </Pressable>
                      </View>
                    </View>

                    {/* Sessions check/uncheck row */}
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                      {Array.from({ length: sessionCount }).map((_, sIdx) => {
                        const isFree = freeList[sIdx] !== false;
                        return (
                          <Pressable
                            key={sIdx}
                            onPress={() => toggleSessionFree(id, sIdx)}
                            style={[
                              sessionChip,
                              isFree ? sessionChipFree : sessionChipBusy,
                            ]}
                          >
                            <Ionicons
                              name={isFree ? "checkmark-circle" : "close-circle"}
                              size={14}
                              color={isFree ? "#fff" : colors.muted}
                            />
                            <T
                              weight="semibold"
                              style={{
                                fontSize: 11,
                                color: isFree ? "#fff" : colors.muted,
                              }}
                            >
                              S{sIdx + 1} {isFree ? "Free" : "Busy"}
                            </T>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.sm }}>
            <Button label="← Back to Teachers" onPress={() => setStep(1)} />
            <Button
              tone="primary"
              label="⚡ Generate Conflict-Free Routine"
              onPress={handleGenerate}
            />
          </View>
        </View>
      )}

      {/* STEP 3: GENERATED ROUTINE PREVIEW & APPLY */}
      {step === 3 && result && (
        <View style={card}>
          <View style={headerRow}>
            <View style={iconCircle}>
              <Ionicons name="sparkles" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="bold" style={{ fontSize: 16, color: colors.ink }}>
                3. Generated Routine
              </T>
              <T style={{ color: colors.muted, fontSize: 12 }}>
                {result.assignedSlots}/{result.totalSlots} slots assigned conflict-free.
              </T>
            </View>
          </View>

          {/* Conflict status banner */}
          <View
            style={[
              statusBanner,
              result.hasUnassigned ? statusBannerWarn : statusBannerOk,
            ]}
          >
            <Ionicons
              name={result.hasUnassigned ? "alert-circle" : "checkmark-circle"}
              size={18}
              color={result.hasUnassigned ? colors.warn : colors.accent}
            />
            <T
              style={{
                fontSize: 12,
                color: result.hasUnassigned ? colors.warn : colors.accentDark,
                flex: 1,
              }}
            >
              {result.hasUnassigned
                ? `${result.unassignedSlots} slot(s) need additional teachers due to availability constraints.`
                : "All slots successfully assigned with 0 teacher conflicts!"}
            </T>
          </View>

          {/* Grid Preview */}
          <Label>Schedule Matrix (Batches × Sessions)</Label>
          <ScrollView horizontal style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.md }}>
            <View>
              {/* Header: Sessions */}
              <View style={gridRowHeader}>
                <View style={[gridCell, gridCellHeader, { width: 90 }]}>
                  <T weight="bold" style={{ fontSize: 11, color: colors.ink }}>
                    Batch
                  </T>
                </View>
                {Array.from({ length: sessionCount }).map((_, sIdx) => (
                  <View key={sIdx} style={[gridCell, gridCellHeader, { width: 120 }]}>
                    <T weight="bold" style={{ fontSize: 11, color: colors.ink }}>
                      Session {sIdx + 1}
                    </T>
                  </View>
                ))}
              </View>

              {/* Rows: Batches */}
              {currentBatches.map((batch) => (
                <View key={batch.id} style={gridRow}>
                  <View style={[gridCell, { width: 90, backgroundColor: colors.paper }]}>
                    <T weight="bold" style={{ fontSize: 12, color: colors.ink }}>
                      {batch.name}
                    </T>
                  </View>
                  {Array.from({ length: sessionCount }).map((_, sIdx) => {
                    const item = result.assignments.find(
                      (a) => a.batchId === batch.id && a.sessionIndex === sIdx,
                    );
                    const hasTeacher = Boolean(item?.teacherName);
                    return (
                      <View
                        key={sIdx}
                        style={[
                          gridCell,
                          { width: 120 },
                          !hasTeacher && { backgroundColor: "rgba(239, 68, 68, 0.08)" },
                        ]}
                      >
                        <T
                          weight="medium"
                          numberOfLines={2}
                          style={{
                            fontSize: 11,
                            color: hasTeacher ? colors.ink : colors.danger,
                            textAlign: "center",
                          }}
                        >
                          {hasTeacher ? item?.teacherName : "(Unassigned)"}
                        </T>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </ScrollView>

          {/* Workload Stats */}
          <Label>Teacher Workload Distribution</Label>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {Object.entries(result.teacherLoad).map(([id, load]) => {
              const teacher = state.teachers.find((t) => t.id === id);
              return (
                <View key={id} style={workloadChip}>
                  <T style={{ fontSize: 11, color: colors.ink }}>
                    {teacher?.name || id}: <T weight="bold">{load} classes</T>
                  </T>
                </View>
              );
            })}
          </View>

          <T style={{ color: colors.muted, fontSize: 11, fontStyle: "italic" }}>
            * Note: Module selection remains manual as requested. You can pick module codes directly in the routine editor.
          </T>

          {/* Actions */}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.sm }}>
            <Button label="← Modify Free/Busy" onPress={() => setStep(2)} />
            <Button
              tone="primary"
              label={applied ? "Applied ✓" : `Apply to Day ${day.dayNumber} Routine`}
              disabled={applied}
              onPress={handleApply}
            />
          </View>
        </View>
      )}
    </View>
  );
}

const headerRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: space.sm,
};

const iconCircle = {
  width: 36,
  height: 36,
  borderRadius: 18,
  backgroundColor: colors.accentSoft,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const stepBar = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  gap: space.md,
  paddingVertical: space.xs,
};

const stepDot = {
  width: 28,
  height: 28,
  borderRadius: 14,
  backgroundColor: colors.chipPast,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const stepDotActive = {
  backgroundColor: colors.accent,
};

const stepDotDone = {
  backgroundColor: colors.accentSoft,
  borderWidth: 1.5,
  borderColor: colors.accent,
};

const teacherSelectRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: space.sm,
  padding: space.sm,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.line,
  backgroundColor: colors.surface,
};

const teacherSelectRowActive = {
  borderColor: colors.accent,
  backgroundColor: colors.accentSoft,
};

const checkboxSquare = {
  width: 20,
  height: 20,
  borderRadius: 4,
  borderWidth: 1.5,
  borderColor: colors.chipPastText,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const checkboxSquareChecked = {
  backgroundColor: colors.accent,
  borderColor: colors.accent,
};

const availTeacherCard = {
  padding: space.sm,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.line,
  backgroundColor: colors.surface,
  gap: 6,
};

const sessionChip = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 4,
  paddingVertical: 5,
  paddingHorizontal: 8,
  borderRadius: radius.pill,
  borderWidth: 1,
};

const sessionChipFree = {
  backgroundColor: colors.accent,
  borderColor: colors.accent,
};

const sessionChipBusy = {
  backgroundColor: colors.desk,
  borderColor: colors.line,
};

const statusBanner = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 8,
  padding: 10,
  borderRadius: radius.sm,
};

const statusBannerOk = {
  backgroundColor: colors.accentSoft,
  borderWidth: 1,
  borderColor: colors.accent,
};

const statusBannerWarn = {
  backgroundColor: colors.warnBg,
  borderWidth: 1,
  borderColor: colors.warn,
};

const gridRowHeader = {
  flexDirection: "row" as const,
  backgroundColor: colors.paper,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
};

const gridRow = {
  flexDirection: "row" as const,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
};

const gridCell = {
  padding: 8,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  borderRightWidth: 1,
  borderRightColor: colors.line,
};

const gridCellHeader = {
  backgroundColor: colors.paper,
};

const workloadChip = {
  backgroundColor: colors.paper,
  paddingVertical: 4,
  paddingHorizontal: 8,
  borderRadius: radius.pill,
};
