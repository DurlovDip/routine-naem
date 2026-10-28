import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from "react-native";
import { useAccess } from "../../../src/auth";
import { useCourses } from "../../../src/courses";
import {
  availableSubNumbers,
  buildTimeline,
  cellHasConflict,
  findConflicts,
  maxSpanFrom,
  rowCells,
  type SheetSession,
} from "../../../src/lib/schedule";
import { cleanBatchNumber, formatModuleCode, orderedManagers, ordinalSuffix, parseModuleCode, rosterRange, rotateIds, sessionSpanLabel, shortBatchLabel } from "../../../src/lib/text";
import { addDays, dayWhen, formatDayNumber, formatLastUpdated, formatRange, formatSlashDate, isIsoDate, todayInDhaka, weekdayName } from "../../../src/lib/time";
import type { Batch, CellContent, DayPlan } from "../../../src/lib/types";
import { isDayDirty } from "../../../src/lib/reducer";
import { useSchedule } from "../../../src/store";
import { card, colors, radius, space, type } from "../../../src/theme";
import { BatchChip, Button, CheckRow, DayChip, Field, Label, Select, T } from "../../../src/ui";
import { EditBatchModal } from "../../../src/EditBatchModal";
import { EditDayModal } from "../../../src/EditDayModal";
import { RoutineGeneratorModal } from "../../../src/RoutineGeneratorModal";
import { DraftRoutineModal } from "../../../src/DraftRoutineModal";

export default function EditorScreen() {
  const access = useAccess();
  const courses = useCourses();
  const router = useRouter();
  const { state, dispatch, day, publishRoutine } = useSchedule();
  const [batchId, setBatchId] = useState(state.batches[0]?.id ?? "");
  const [dateText, setDateText] = useState(day.date);
  const [dayText, setDayText] = useState(String(day.dayNumber));
  const [showDaySettings, setShowDaySettings] = useState(false);
  const [editingDay, setEditingDay] = useState<DayPlan | null>(null);
  const [editingBatch, setEditingBatch] = useState<Batch | null>(null);
  const [isNewDay, setIsNewDay] = useState(false);
  const [isNewBatch, setIsNewBatch] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [showDraftPreview, setShowDraftPreview] = useState(false);

  const isDayPublished = Boolean(day.isPublished);
  const hasChanges = isDayDirty(day);

  async function handlePublish() {
    setIsPublishing(true);
    dispatch({ type: "publish-day", dayId: day.id });
    try {
      await publishRoutine();
    } catch (e) {
      console.warn("Publish cloud sync error:", e);
    } finally {
      setIsPublishing(false);
      router.push("/(main)/routine");
    }
  }

  useEffect(() => setDateText(day.date), [day.date]);
  useEffect(() => setDayText(String(day.dayNumber)), [day.dayNumber]);
  useEffect(() => {
    if (!state.batches.some((batch) => batch.id === batchId)) setBatchId(state.batches[0]?.id ?? "");
  }, [state.batches, batchId]);

  if (access.role === "super_admin") return <Redirect href="/(main)/routine" />;
  if (!access.canEdit) return <Redirect href="/(main)/routine" />;
  if (courses.ready && !courses.selected?.canEdit) return <Redirect href="/(main)/routine" />;

  const nextDate = addDays(day.date, 1);
  const nextDayNum = day.dayNumber + 1;
  const nextDayExists = state.days.some((item) => item.id !== day.id && (item.date === nextDate || item.dayNumber === nextDayNum));
  const maxDayNum = Math.max(...state.days.map((item) => item.dayNumber), 0);
  const batch = state.batches.find((item) => item.id === batchId) ?? state.batches[0];
  const timeline = buildTimeline(day);
  const conflicts = state.showConflicts ? findConflicts(state.batches, day) : [];
  const sessionCount = timeline.slots.filter((slot) => slot.kind === "session").length;
  const cells = batch ? rowCells(day, batch.id) : [];
  const managers = batch ? orderedManagers(batch.roster, day.managers[batch.id] ?? []) : [];

  function addBatch(name?: string, count?: number, batchNum?: number) {
    const lastNum = state.batches.reduce((max, item) => {
      const fromName = parseInt((item.name ?? "").replace(/\D/g, ""), 10);
      const fromId = parseInt((item.id ?? "").replace(/\D/g, ""), 10);
      const val = !isNaN(fromName) && fromName > 0 ? fromName : (!isNaN(fromId) && fromId > 0 ? fromId : 0);
      return Math.max(max, val);
    }, 0);
    const nextNum = lastNum > 0 ? lastNum + 1 : state.batches.length + 1;
    const numToUse = batchNum ?? (name ? parseInt(name.replace(/\D/g, ""), 10) : NaN);
    const chosenNum = !isNaN(numToUse) && numToUse > 0 ? numToUse : nextNum;
    let newId = `batch-${chosenNum}`;
    if (state.batches.some((item) => item.id === newId)) {
      newId = `batch-${Date.now()}`;
    }
    const finalName = name ?? `${chosenNum}${ordinalSuffix(chosenNum)}`;
    dispatch({ type: "add-batch", id: newId, name: finalName, count });
    setBatchId(newId);
  }

  function addDay(dayNumber?: number, date?: string) {
    dispatch({ type: "add-day", dayId: day.id, dayNumber, date });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.desk }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100, gap: space.md }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md }}>
          <Pressable
            testID="open-header-footer"
            accessibilityRole="button"
            accessibilityLabel="Header and footer"
            onPress={() => router.push("/(main)/editor/header-footer")}
            style={{
              ...card,
              flexDirection: "row",
              alignItems: "center",
              gap: space.sm,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="bold" style={{ color: colors.accent, fontSize: 15 }}>Header & footer</T>
              <T style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
                Course title, signature, and designation
              </T>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
          <View style={rowHeader}>
            <T weight="bold" style={rowLabel}>Day:</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rowChips} style={{ flex: 1 }}>
              {state.days.map((item) => (
                <DayChip
                  key={item.id}
                  selected={item.id === day.id}
                  when={dayWhen(item.date, todayInDhaka())}
                  label={String(item.dayNumber)}
                  onPress={() => dispatch({ type: "set-active-day", id: item.id })}
                  onEdit={() => setEditingDay(item)}
                />
              ))}
              <Button
                small
                tone="ghost"
                icon={<Ionicons name="add" size={17} color={colors.ink} />}
                testID="add-day-button"
                accessibilityLabel="Add day"
                onPress={() => {
                  setEditingDay(null);
                  setIsNewDay(true);
                }}
              />
            </ScrollView>
          </View>

          {/* Date, day, and last modified date in basic text font */}
          <View style={{ marginTop: -4 }}>
            <T style={{ color: colors.muted, fontSize: type.caption }}>
              {formatSlashDate(day.date)}
              {weekdayName(day.date) ? ` · ${weekdayName(day.date)}` : ""} · {formatDayNumber(day.dayNumber)}
              {day.publishedAt ? ` · Last modified: ${formatLastUpdated(day.publishedAt)}` : ""}
            </T>
          </View>

      {showDaySettings ? (
        <View style={{ ...card, gap: space.md }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Label>Date</Label>
              <Field
                value={dateText}
                onChangeText={(value) => {
                  setDateText(value);
                  if (isIsoDate(value)) dispatch({ type: "update-day", id: day.id, patch: { date: value } });
                }}
                autoCapitalize="none"
                placeholder="YYYY-MM-DD"
              />
              <T style={{ color: colors.muted, fontSize: 11, marginTop: 3 }}>{weekdayName(day.date)}</T>
            </View>
            <View style={{ width: 96 }}>
              <Label>Day number</Label>
              <Field
                value={dayText}
                keyboardType="number-pad"
                onChangeText={(value) => {
                  setDayText(value);
                  const num = Number(value);
                  if (Number.isFinite(num) && num >= 1) dispatch({ type: "update-day", id: day.id, patch: { dayNumber: num } });
                }}
              />
            </View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button label="Duplicate to next day" tone="primary" disabled={nextDayExists} onPress={() => dispatch({ type: "duplicate-day", dayId: day.id })} />
            <Button label="Blank next day" disabled={nextDayExists} onPress={() => dispatch({ type: "new-day", dayId: day.id })} />
            <Button
              label="Delete day"
              tone="danger"
              disabled={state.days.length <= 1}
              onPress={() =>
                Alert.alert("Delete this day?", "The routines on the other days stay.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete day", style: "destructive", onPress: () => dispatch({ type: "delete-day", dayId: day.id }) },
                ])
              }
            />
          </View>
          {nextDayExists ? (
            <View style={{ backgroundColor: colors.warnBg, borderRadius: radius.md, padding: space.sm, gap: space.sm }}>
              <T style={{ color: colors.warn, fontSize: 12 }}>
                Day {String(nextDayNum).padStart(2, "0")} ({formatSlashDate(nextDate)}) already exists.
              </T>
              <Button
                small
                label={`Duplicate as Day ${String(maxDayNum + 1).padStart(2, "0")}`}
                onPress={() => dispatch({ type: "duplicate-day-to-end", dayId: day.id })}
              />
            </View>
          ) : null}
          <CheckRow label="Auto-rotate day managers" value={state.autoRotate} onChange={(value) => dispatch({ type: "set-auto-rotate", value })} />
          <CheckRow label="Clash warning" value={state.showConflicts} onChange={(value) => dispatch({ type: "set-show-conflicts", value })} />
        </View>
      ) : null}

      {conflicts.length > 0 ? (
        <View style={{ backgroundColor: colors.warnBg, borderRadius: 8, padding: 8 }}>
          <T weight="semibold" style={{ color: colors.warn, fontSize: 12 }}>Same teacher in two batches</T>
          {conflicts.map((conflict) => (
            <T key={`${conflict.sessionId}-${conflict.teacher}`} style={{ color: colors.warn, fontSize: 12, marginTop: 2 }}>
              {conflict.teacher} is in {conflict.batchNames.join(" and ")} during Session - {conflict.sessionNumber}.
            </T>
          ))}
        </View>
      ) : null}

      {state.batches.length === 0 || !batch ? (
        <View style={rowHeader}>
          <T weight="bold" style={rowLabel}>Batch:</T>
          <T style={{ color: colors.muted, flex: 1 }}>Add a batch to edit the routine.</T>
          <Button
            small
            tone="ghost"
            icon={<Ionicons name="add" size={17} color={colors.ink} />}
            testID="add-batch-button-empty"
            accessibilityLabel="Add batch"
            onPress={() => {
              setEditingBatch(null);
              setIsNewBatch(true);
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          <View style={rowHeader}>
            <T weight="bold" style={rowLabel}>Batch:</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rowChips} style={{ flex: 1 }}>
              {state.batches.map((item) => (
                <BatchChip
                  key={item.id}
                  selected={item.id === batch.id}
                  label={shortBatchLabel(item.name, item.id)}
                  onPress={() => setBatchId(item.id)}
                  onEdit={() => setEditingBatch(item)}
                />
              ))}
              <Button
                small
                tone="ghost"
                icon={<Ionicons name="add" size={17} color={colors.ink} />}
                testID="add-batch-button"
                accessibilityLabel="Add batch"
                onPress={() => {
                  setEditingBatch(null);
                  setIsNewBatch(true);
                }}
              />
            </ScrollView>
          </View>
          <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.sm }}>
            <View style={[{ flex: 1 }, card]}>
              <Managers
                day={day}
                batch={batch}
                managers={managers}
              />
            </View>
            <Pressable
              testID="open-routine-generator"
              accessibilityRole="button"
              accessibilityLabel="Routine generator"
              onPress={() => setShowGenerator(true)}
              style={({ pressed }) => [
                routineGenBtn,
                pressed && { opacity: 0.82, transform: [{ scale: 0.95 }] },
              ]}
            >
              <Ionicons name="sparkles" size={20} color="#ffffff" />
            </Pressable>
            <Pressable
              testID="open-draft-preview"
              accessibilityRole="button"
              accessibilityLabel="View drafted routine table"
              onPress={() => setShowDraftPreview(true)}
              style={({ pressed }) => [
                routineGenBtn,
                pressed && { opacity: 0.82, transform: [{ scale: 0.95 }] },
              ]}
            >
              <Ionicons name="grid-outline" size={20} color="#ffffff" />
            </Pressable>
          </View>
          {cells.map((cell) => {
            if (cell.kind === "skip") return null;
            if (cell.kind === "break") {
              const timed = timeline.slots.find((slot) => slot.id === cell.id);
              return (
                <T key={cell.id} weight="semibold" style={{ textAlign: "center", color: colors.muted, fontSize: 12 }}>
                  {cell.label}
                  {timed ? ` · ${formatRange(timed.start, timed.end)}` : ""}
                </T>
              );
            }
            const clash = cellHasConflict(conflicts, batch.id, cell.sessionIds);
            const timed = cell.sessionIds
              .map((id) => timeline.slots.find((slot) => slot.id === id))
              .filter((slot) => slot && slot.kind === "session");
            const when = timed.length > 0 ? formatRange(timed[0]!.start, timed[timed.length - 1]!.end) : "";
            return (
              <View key={cell.anchorId} testID="editor-session" style={[card, clash && { borderColor: "#ead9b0", backgroundColor: colors.warnBg }]}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <View style={{ flex: 1 }}>
                    <T weight="semibold">{sessionSpanLabel(cell.numbers)}</T>
                    {when ? <T style={{ color: colors.muted, fontSize: 11 }}>{when}</T> : null}
                  </View>
                  {sessionCount > 1 && cell.span === 1 ? (
                    <Button
                      small
                      tone="quiet"
                      label="Delete"
                      onPress={() =>
                        Alert.alert(`Delete ${sessionSpanLabel(cell.numbers)}?`, "This column is removed from this day.", [
                          { text: "Cancel", style: "cancel" },
                          {
                            text: "Delete",
                            style: "destructive",
                            onPress: () => dispatch({ type: "remove-slot", dayId: day.id, slotId: cell.anchorId }),
                          },
                        ])
                      }
                    />
                  ) : null}
                </View>
                <CellEditor day={day} batchId={batch.id} cell={cell} />
              </View>
            );
          })}
          <Button
            label="Add a new session"
            icon={<Ionicons name="add" size={17} color={colors.ink} />}
            disabled={sessionCount >= 10}
            onPress={() => dispatch({ type: "add-session", dayId: day.id })}
          />
        </View>
      )}
      </View>
      </ScrollView>

      {/* Floating publish button on the right bottom corner */}
      <View style={floatingPublishContainer} pointerEvents="box-none">
        <Pressable
          testID="publish-routine-fab"
          accessibilityRole="button"
          accessibilityLabel={hasChanges ? "Publish routine" : "Already published"}
          accessibilityState={{ disabled: !hasChanges || isPublishing }}
          disabled={!hasChanges || isPublishing}
          onPress={handlePublish}
          style={({ pressed }) => [
            floatingPublishBtn,
            {
              backgroundColor: hasChanges ? colors.accent : "#a3a39e",
              opacity: (hasChanges && pressed) || isPublishing ? 0.8 : 1,
              transform: [{ scale: hasChanges && pressed ? 0.96 : 1 }],
            },
          ]}
        >
          {isPublishing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : hasChanges ? (
            <Ionicons name="cloud-upload" size={18} color="#fff" />
          ) : (
            <Ionicons name="checkmark-circle" size={18} color="#fff" />
          )}
          <T weight="bold" style={{ color: "#fff", fontSize: 13, letterSpacing: 0.2 }}>
            {isPublishing ? "Publishing..." : hasChanges ? "Publish" : "Already published"}
          </T>
        </Pressable>
      </View>

      <EditDayModal
        visible={editingDay !== null || isNewDay}
        day={editingDay}
        isNew={isNewDay}
        onAddDay={addDay}
        onClose={() => {
          setEditingDay(null);
          setIsNewDay(false);
        }}
      />
      <EditBatchModal
        visible={editingBatch !== null || isNewBatch}
        batch={editingBatch}
        isNew={isNewBatch}
        onAddBatch={addBatch}
        onClose={() => {
          setEditingBatch(null);
          setIsNewBatch(false);
        }}
      />
      <RoutineGeneratorModal
        visible={showGenerator}
        onClose={() => setShowGenerator(false)}
      />
      <DraftRoutineModal
        visible={showDraftPreview}
        day={day}
        onClose={() => setShowDraftPreview(false)}
      />
    </View>
  );
}

function withCurrent(options: string[], current: string): string[] {
  if (!current || options.includes(current)) return options;
  return [current, ...options];
}

function teacherChoices(catalog: string[], current: string, selected: string[]): string[] {
  const taken = new Set(selected.filter((name) => name && name !== current).map((name) => name.toLowerCase()));
  const options = catalog.filter((name) => !taken.has(name.toLowerCase()));
  if (current && !options.some((name) => name.toLowerCase() === current.toLowerCase())) options.unshift(current);
  return options;
}

function CellEditor({ day, batchId, cell }: { day: DayPlan; batchId: string; cell: SheetSession }) {
  const { state, dispatch } = useSchedule();
  const [extra, setExtra] = useState(0);
  const parsed = parseModuleCode(cell.content.code);
  const moduleNumber = parsed?.moduleNumber ?? "";
  const subNumber = parsed?.subNumber ?? "";
  const filled = cell.content.teachers.map((name) => name.trim()).filter(Boolean);
  const rows = [...filled, ...Array.from({ length: extra }, () => "")];
  const maxSpan = maxSpanFrom(day.slots, cell.anchorId);
  const canMerge = maxSpan >= 2 || cell.span >= 2;

  const subOptions = availableSubNumbers({
    state,
    batchId,
    currentDayId: day.id,
    currentSessionId: cell.anchorId,
    selectedModuleNumber: moduleNumber,
    currentCellCode: cell.content.code,
  });

  function update(next: CellContent) {
    dispatch({ type: "set-cell", dayId: day.id, batchId, sessionId: cell.anchorId, cell: next });
  }

  function setTeacher(index: number, name: string) {
    const teachers = filled.slice();
    if (!name) {
      if (index < teachers.length) teachers.splice(index, 1);
    } else if (index >= teachers.length) {
      if (!teachers.some((teacher) => teacher.toLowerCase() === name.toLowerCase())) teachers.push(name);
    } else if (!teachers.some((teacher, item) => item !== index && teacher.toLowerCase() === name.toLowerCase())) {
      teachers[index] = name;
    }
    update({ ...cell.content, teachers });
    setExtra(0);
  }

  return (
    <View style={{ marginTop: 8, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Select
            label="Module number"
            value={moduleNumber}
            options={withCurrent(state.moduleNumbers, moduleNumber)}
            onChange={(value) => {
              const nextSubs = availableSubNumbers({
                state,
                batchId,
                currentDayId: day.id,
                currentSessionId: cell.anchorId,
                selectedModuleNumber: value,
                currentCellCode: cell.content.code,
              });
              const nextSub = nextSubs.includes(subNumber) ? subNumber : "";
              update({ ...cell.content, code: formatModuleCode(value, nextSub) });
            }}
          />
        </View>
        <View style={{ width: 92 }}>
          <Select
            label="Sub-number"
            value={subNumber}
            options={subOptions}
            onChange={(value) => update({ ...cell.content, code: formatModuleCode(moduleNumber, value) })}
          />
        </View>
      </View>
      {rows.map((name, index) => (
        <Select
          key={`${cell.anchorId}-teacher-${index}`}
          label={index === 0 ? "Teacher" : `Teacher ${index + 1}`}
          value={name}
          options={teacherChoices(state.teachers.map((teacher) => teacher.name), name, filled)}
          onChange={(value) => setTeacher(index, value)}
        />
      ))}
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Button
          small
          tone="quiet"
          label="+ Teacher"
          onPress={() => {
            if (rows.length > 0 && rows[rows.length - 1] === "") return;
            setExtra((count) => count + 1);
          }}
        />
        <Button
          small
          tone={cell.span > 1 ? "primary" : "ghost"}
          disabled={!canMerge}
          label={cell.span > 1 ? `Merged ${cell.span}` : "Merge"}
          onPress={() =>
            dispatch({
              type: "set-span",
              dayId: day.id,
              batchId,
              sessionId: cell.anchorId,
              span: cell.span > 1 ? 1 : Math.min(2, maxSpan),
            })
          }
        />
      </View>
    </View>
  );
}

function managerChoices(roster: string[], current: string, selected: string[]): string[] {
  const options = roster.length > 0 ? roster : rosterRange(1, 40);
  const taken = new Set(selected.filter((id) => id && id !== current));
  const available = options.filter((id) => !taken.has(id));
  if (current && !available.includes(current)) available.unshift(current);
  return available;
}

function Managers({
  day,
  batch,
  managers,
}: {
  day: DayPlan;
  batch: Batch;
  managers: string[];
}) {
  const { state, dispatch } = useSchedule();
  const [extra, setExtra] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const filled = managers.map((id) => id.trim()).filter(Boolean);
  const rows = [...filled, ...Array.from({ length: extra }, () => "")];

  function setManager(index: number, id: string) {
    const list = filled.slice();
    if (!id) {
      if (index < list.length) list.splice(index, 1);
    } else if (index >= list.length) {
      if (!list.includes(id)) list.push(id);
    } else {
      list[index] = id;
    }
    dispatch({ type: "set-managers", dayId: day.id, batchId: batch.id, ids: list });
    setExtra(0);
  }

  return (
    <View style={{ gap: expanded ? 10 : 0 }}>
      <Pressable
        testID="toggle-day-managers"
        accessibilityRole="button"
        accessibilityLabel={expanded ? "Collapse day managers" : "Expand day managers"}
        onPress={() => setExpanded((prev) => !prev)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ gap: 2 }}>
          <T weight="semibold">Day managers</T>
          <T style={{ color: colors.muted, fontSize: 12 }}>
            ID No.- {filled.length ? filled.join(" & ") : "—"}
          </T>
        </View>
        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: expanded ? colors.chipPast : "transparent",
            marginRight: 4,
          }}
        >
          <Ionicons
            name={expanded ? "chevron-up" : "chevron-down"}
            size={18}
            color={colors.ink}
          />
        </View>
      </Pressable>

      {expanded ? (
        <View style={{ gap: 8, marginTop: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.line }}>
          {rows.map((id, index) => (
            <Select
              key={`${batch.id}-mgr-${index}`}
              label={index === 0 ? "Day manager ID" : `Day manager ID ${index + 1}`}
              value={id}
              options={managerChoices(batch.roster, id, filled)}
              onChange={(value) => setManager(index, value)}
            />
          ))}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              small
              tone="quiet"
              label="+ Manager"
              onPress={() => {
                if (rows.length > 0 && rows[rows.length - 1] === "") return;
                setExtra((count) => count + 1);
              }}
            />
            <Button
              small
              tone="quiet"
              label="Use for every batch"
              onPress={() => dispatch({ type: "copy-managers", dayId: day.id, batchId: batch.id })}
            />
          </View>

          <View style={autoRollContainer}>
            <CheckRow
              testID="auto-roll-ids-toggle"
              label="Auto roll IDs each day"
              value={state.autoRotate}
              onChange={(value) => dispatch({ type: "set-auto-rotate", value })}
            />
            <T style={autoRollHint}>
              {state.autoRotate
                ? `Next day rolls forward (e.g. ${filled.length ? filled.join(" & ") : "13 & 14"} → ${filled.length ? rotateIds(batch.roster, filled).join(" & ") : "15 & 16"})`
                : "Keep current IDs without auto rolling to subsequent days"}
            </T>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const rowHeader = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 8,
};

const rowLabel = {
  fontSize: 14,
  color: colors.ink,
  minWidth: 46,
};

const rowChips = {
  gap: 8,
  alignItems: "center" as const,
};

const floatingPublishContainer = {
  position: "absolute" as const,
  right: 18,
  bottom: 20,
  zIndex: 99,
};

const floatingPublishBtn = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 8,
  paddingVertical: 12,
  paddingHorizontal: 20,
  borderRadius: 28,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.24,
  shadowRadius: 8,
  elevation: 6,
};


const autoRollContainer = {
  marginTop: 6,
  paddingTop: 8,
  borderTopWidth: 1,
  borderTopColor: colors.line,
  gap: 2,
};

const autoRollHint = {
  color: colors.muted,
  fontSize: 11,
  marginLeft: 26,
  lineHeight: 15,
};

const routineGenBtn = {
  width: 52,
  height: 52,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor: colors.accent,
  borderRadius: radius.md,
  shadowColor: colors.accent,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.22,
  shadowRadius: 4,
  elevation: 3,
};

