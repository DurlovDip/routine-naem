import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useSchedule } from "./store";
import { colors, radius, shadow, space } from "./theme";
import { Button, Field, Label, T } from "./ui";
import {
  applyGeneratedGridToDay,
  generateScheduleGrid,
  type BatchItem,
  type GenerateGridResult,
  type TeacherCandidate,
} from "./tools/scheduleAlgorithm";

export function RoutineGeneratorModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { state, dispatch, day } = useSchedule();

  // Wizard Step: 1 = Select Teachers, 2 = Check Availability, 3 = Preview & Apply
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Active batches and sessions from current routine
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

  // Selected teachers joining today
  const [teacherSearch, setTeacherSearch] = useState("");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState<string[]>([]);

  // Availability matrix: teacherId -> boolean[sessionIndex]
  const [availability, setAvailability] = useState<Record<string, boolean[]>>({});

  // Generated Result
  const [result, setResult] = useState<GenerateGridResult | null>(null);

  // Initialize selected teachers and availability when modal opens
  useEffect(() => {
    if (visible) {
      setStep(1);
      setTeacherSearch("");
      setResult(null);

      // Pre-select first N teachers matching batch count if none selected yet
      if (selectedTeacherIds.length === 0 && state.teachers.length > 0) {
        const defaultCount = Math.max(currentBatches.length, 5);
        setSelectedTeacherIds(state.teachers.slice(0, defaultCount).map((t) => t.id));
      }
    }
  }, [visible]);

  if (!visible) return null;

  const filteredTeachers = state.teachers.filter((t) =>
    t.name.toLowerCase().includes(teacherSearch.toLowerCase().trim()),
  );

  // Move to Step 2: Availability
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

  // Toggle availability for a session
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

  // Generate Routine
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
    setStep(3);
  }

  // Apply to Routine automatically
  function handleApply() {
    if (!result) return;

    const updatedDay = applyGeneratedGridToDay({
      day,
      assignments: result.assignments,
      sessionCount,
    });

    // Ensure state.batches has default batches if empty
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

    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <Pressable
          style={Platform.OS === "web" ? undefined : backdropDismiss}
          onPress={onClose}
        />
        <View style={modalCard}>
          {/* Header */}
          <View style={headerRow}>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="sparkles" size={18} color={colors.accent} />
                <T weight="bold" style={{ fontSize: 16, color: colors.ink }}>
                  Routine Generator
                </T>
              </View>
              <T style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                Day {day.dayNumber} · {currentBatches.length} Batches · {sessionCount} Sessions
              </T>
            </View>

            <Pressable
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}
            >
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {/* Stepper Dots */}
          <View style={stepBar}>
            {[
              { num: 1, label: "Teachers" },
              { num: 2, label: "When Free" },
              { num: 3, label: "Apply" },
            ].map((s) => (
              <View key={s.num} style={{ alignItems: "center", gap: 2 }}>
                <View
                  style={[
                    stepDot,
                    step === s.num && stepDotActive,
                    step > s.num && stepDotDone,
                  ]}
                >
                  <T
                    weight="bold"
                    style={{
                      fontSize: 11,
                      color: step === s.num ? "#fff" : step > s.num ? colors.accent : colors.muted,
                    }}
                  >
                    {s.num}
                  </T>
                </View>
                <T
                  style={{
                    fontSize: 10,
                    color: step === s.num ? colors.ink : colors.muted,
                  }}
                >
                  {s.label}
                </T>
              </View>
            ))}
          </View>

          {/* STEP 1: SELECT TEACHERS JOINING TODAY */}
          {step === 1 && (
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Label>Select teachers joining this routine ({selectedTeacherIds.length})</Label>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Pressable
                    hitSlop={6}
                    onPress={() => setSelectedTeacherIds(state.teachers.map((t) => t.id))}
                  >
                    <T weight="medium" style={{ color: colors.accent, fontSize: 11 }}>
                      Select all
                    </T>
                  </Pressable>
                  <Pressable hitSlop={6} onPress={() => setSelectedTeacherIds([])}>
                    <T weight="medium" style={{ color: colors.danger, fontSize: 11 }}>
                      Clear
                    </T>
                  </Pressable>
                </View>
              </View>

              <Field
                value={teacherSearch}
                onChangeText={setTeacherSearch}
                placeholder="Search teachers by name..."
              />

              <ScrollView style={{ maxHeight: 250 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
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
                          teacherRow,
                          selected && teacherRowActive,
                        ]}
                      >
                        <View style={[checkbox, selected && checkboxChecked]}>
                          {selected ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <T weight="semibold" style={{ fontSize: 13, color: colors.ink }}>
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

              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: 4 }}>
                <Button label="Cancel" onPress={onClose} />
                <Button
                  tone="primary"
                  label={`Next: Free/Busy (${selectedTeacherIds.length}) →`}
                  disabled={selectedTeacherIds.length === 0}
                  onPress={goToStep2}
                />
              </View>
            </View>
          )}

          {/* STEP 2: AVAILABILITY (FREE VS BUSY MATRIX) */}
          {step === 2 && (
            <View style={{ gap: space.sm }}>
              <T style={{ color: colors.muted, fontSize: 11, backgroundColor: colors.paper, padding: 6, borderRadius: radius.sm }}>
                💡 Tap any session to toggle: <T weight="semibold">Green (✓ Free)</T> vs <T weight="semibold">Grey/Red (✗ Busy)</T>.
              </T>

              <ScrollView style={{ maxHeight: 300 }} nestedScrollEnabled>
                <View style={{ gap: 8 }}>
                  {selectedTeacherIds.map((id) => {
                    const teacher = state.teachers.find((t) => t.id === id);
                    if (!teacher) return null;
                    const freeList = availability[id] || Array(sessionCount).fill(true);

                    return (
                      <View key={id} style={availCard}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                          <View style={{ flex: 1 }}>
                            <T weight="bold" style={{ fontSize: 13, color: colors.ink }}>
                              {teacher.name}
                            </T>
                            {teacher.designation ? (
                              <T style={{ fontSize: 10, color: colors.muted }}>
                                {teacher.designation}
                              </T>
                            ) : null}
                          </View>
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

                        {/* Session pills */}
                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginTop: 4 }}>
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
                                  size={13}
                                  color={isFree ? "#fff" : colors.muted}
                                />
                                <T
                                  weight="semibold"
                                  style={{
                                    fontSize: 10,
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

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, marginTop: 4 }}>
                <Button label="← Back" onPress={() => setStep(1)} />
                <Button
                  tone="primary"
                  label="⚡ Generate Routine"
                  onPress={handleGenerate}
                />
              </View>
            </View>
          )}

          {/* STEP 3: PREVIEW & APPLY */}
          {step === 3 && result && (
            <View style={{ gap: space.sm }}>
              <View
                style={[
                  statusBanner,
                  result.hasUnassigned ? statusBannerWarn : statusBannerOk,
                ]}
              >
                <Ionicons
                  name={result.hasUnassigned ? "alert-circle" : "checkmark-circle"}
                  size={16}
                  color={result.hasUnassigned ? colors.warn : colors.accent}
                />
                <T
                  style={{
                    fontSize: 11,
                    color: result.hasUnassigned ? colors.warn : colors.accentDark,
                    flex: 1,
                  }}
                >
                  {result.hasUnassigned
                    ? `${result.unassignedSlots} slot(s) need more teachers due to busy constraints.`
                    : "Zero conflicts detected! Diverse teachers assigned across batches."}
                </T>
              </View>

              {/* Matrix Preview */}
              <ScrollView horizontal style={{ borderWidth: 1, borderColor: colors.line, borderRadius: radius.sm, maxHeight: 220 }}>
                <View>
                  <View style={gridRowHeader}>
                    <View style={[gridCell, gridCellHeader, { width: 80 }]}>
                      <T weight="bold" style={{ fontSize: 11, color: colors.ink }}>
                        Batch
                      </T>
                    </View>
                    {Array.from({ length: sessionCount }).map((_, sIdx) => (
                      <View key={sIdx} style={[gridCell, gridCellHeader, { width: 110 }]}>
                        <T weight="bold" style={{ fontSize: 11, color: colors.ink }}>
                          Session {sIdx + 1}
                        </T>
                      </View>
                    ))}
                  </View>

                  {currentBatches.map((batch) => (
                    <View key={batch.id} style={gridRow}>
                      <View style={[gridCell, { width: 80, backgroundColor: colors.paper }]}>
                        <T weight="bold" style={{ fontSize: 11, color: colors.ink }}>
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
                              { width: 110 },
                              !hasTeacher && { backgroundColor: "rgba(239, 68, 68, 0.08)" },
                            ]}
                          >
                            <T
                              weight="medium"
                              numberOfLines={2}
                              style={{
                                fontSize: 10,
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

              <T style={{ color: colors.muted, fontSize: 10, fontStyle: "italic" }}>
                * Module codes remain manual for selection in the routine editor.
              </T>

              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm, marginTop: 4 }}>
                <Button label="← Modify Free/Busy" onPress={() => setStep(2)} />
                <Button
                  tone="primary"
                  label={`Apply to Day ${day.dayNumber} Routine`}
                  onPress={handleApply}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const backdrop = {
  flex: 1,
  backgroundColor: "rgba(28, 24, 20, 0.45)",
  justifyContent: "center" as const,
  padding: 16,
};

const backdropDismiss = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const modalCard = {
  backgroundColor: colors.surface,
  borderRadius: radius.md,
  padding: space.md,
  gap: space.sm,
  ...shadow,
  maxHeight: "92%" as const,
};

const headerRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
  paddingBottom: 8,
};

const stepBar = {
  flexDirection: "row" as const,
  justifyContent: "center" as const,
  gap: 24,
  paddingVertical: 4,
};

const stepDot = {
  width: 24,
  height: 24,
  borderRadius: 12,
  backgroundColor: colors.paper,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  borderWidth: 1,
  borderColor: colors.line,
};

const stepDotActive = {
  backgroundColor: colors.accent,
  borderColor: colors.accent,
};

const stepDotDone = {
  backgroundColor: colors.accentSoft,
  borderColor: colors.accent,
};

const teacherRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 8,
  padding: 8,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.line,
  backgroundColor: colors.surface,
};

const teacherRowActive = {
  borderColor: colors.accent,
  backgroundColor: colors.accentSoft,
};

const checkbox = {
  width: 20,
  height: 20,
  borderRadius: 5,
  borderWidth: 1,
  borderColor: colors.chipOpenBorder,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor: colors.surface,
};

const checkboxChecked = {
  backgroundColor: colors.accent,
  borderColor: colors.accent,
};

const availCard = {
  padding: 8,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.line,
  backgroundColor: colors.surface,
  gap: 4,
};

const sessionChip = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 4,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: radius.pill,
};

const sessionChipFree = {
  backgroundColor: colors.accent,
};

const sessionChipBusy = {
  backgroundColor: colors.paper,
  borderWidth: 1,
  borderColor: colors.line,
};

const statusBanner = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 6,
  padding: 8,
  borderRadius: radius.sm,
  borderWidth: 1,
};

const statusBannerOk = {
  backgroundColor: colors.accentSoft,
  borderColor: colors.accent,
};

const statusBannerWarn = {
  backgroundColor: colors.warnBg,
  borderColor: colors.warn,
};

const gridRow = {
  flexDirection: "row" as const,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
};

const gridRowHeader = {
  flexDirection: "row" as const,
  backgroundColor: colors.paper,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
};

const gridCell = {
  padding: 6,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  borderRightWidth: 1,
  borderRightColor: colors.line,
  minHeight: 38,
};

const gridCellHeader = {
  minHeight: 32,
};
