import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useAccess } from "../../src/auth";
import { FooterEditor } from "../../src/FooterEditor";
import { buildTimeline, cellHasConflict, findConflicts, maxSpanFrom, rowCells, type SheetSession } from "../../src/lib/schedule";
import { cleanBatchNumber, formatModuleCode, orderedManagers, parseModuleCode, rosterRange, sessionSpanLabel } from "../../src/lib/text";
import { addDays, formatDayNumber, formatRange, formatSlashDate, isIsoDate, weekdayName } from "../../src/lib/time";
import { HEADER_STYLES, headerStyleFromLabel, headerStyleLabel } from "../../src/lib/header";
import type { Batch, CellContent, DayPlan } from "../../src/lib/types";
import { useSchedule } from "../../src/store";
import { colors } from "../../src/theme";
import { Button, CheckRow, Field, Label, Select, T } from "../../src/ui";

export default function EditorScreen() {
  const access = useAccess();
  const { state, dispatch, day } = useSchedule();
  const [batchId, setBatchId] = useState(state.batches[0]?.id ?? "");
  const [dateText, setDateText] = useState(day.date);
  const [dayText, setDayText] = useState(String(day.dayNumber));
  const [showDaySettings, setShowDaySettings] = useState(false);

  useEffect(() => setDateText(day.date), [day.date]);
  useEffect(() => setDayText(String(day.dayNumber)), [day.dayNumber]);
  useEffect(() => {
    if (!state.batches.some((batch) => batch.id === batchId)) setBatchId(state.batches[0]?.id ?? "");
  }, [state.batches, batchId]);

  if (!access.canEdit) return <Redirect href="/(main)/routine" />;

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

  function addBatch() {
    const lastNum = state.batches.reduce((max, item) => {
      const num = parseInt(item.id.replace(/\D/g, ""), 10);
      return Number.isNaN(num) ? max : Math.max(max, num);
    }, 0);
    const nextNum = lastNum > 0 ? lastNum + 1 : state.batches.length + 1;
    dispatch({ type: "add-batch" });
    setBatchId(`batch-${nextNum}`);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.desk }} contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }} keyboardShouldPersistTaps="handled">
      <HeaderEditor />
      <FooterEditor />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, alignItems: "center" }}>
        {state.days.map((item) => {
          const on = item.id === day.id;
          return (
            <Button
              key={item.id}
              small
              tone={on ? "primary" : "ghost"}
              label={`${formatDayNumber(item.dayNumber).replace("Day – ", "Day ")}  ${formatSlashDate(item.date)}`}
              onPress={() => dispatch({ type: "set-active-day", id: item.id })}
            />
          );
        })}
        <Button
          small
          tone={showDaySettings ? "primary" : "ghost"}
          icon={<Ionicons name={showDaySettings ? "close" : "add"} size={17} color={showDaySettings ? "#fff" : colors.ink} />}
          testID="toggle-day-settings"
          accessibilityLabel={showDaySettings ? "Collapse day settings" : "Add or edit days"}
          onPress={() => setShowDaySettings((prev) => !prev)}
        />
      </ScrollView>

      {showDaySettings ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 12,
            padding: 12,
            gap: 12,
          }}
        >
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
            <View style={{ backgroundColor: colors.warnBg, borderColor: "#ead9b0", borderWidth: 1, borderRadius: 8, padding: 8, gap: 6 }}>
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

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button label="Add batch" onPress={addBatch} />
        <Button
          label={`Add session (${sessionCount}/10)`}
          disabled={sessionCount >= 10}
          onPress={() => dispatch({ type: "add-session", dayId: day.id })}
        />
      </View>

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
        <T style={{ color: colors.muted }}>Add a batch to edit the routine.</T>
      ) : (
        <View style={{ gap: 10 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {state.batches.map((item) => (
              <Button
                key={item.id}
                small
                tone={item.id === batch.id ? "primary" : "ghost"}
                label={cleanBatchNumber(item.name, item.id) || "Batch"}
                onPress={() => setBatchId(item.id)}
              />
            ))}
          </ScrollView>
          <View style={card}>
            <Label>Batch</Label>
            <Field
              value={batch.name}
              placeholder={cleanBatchNumber(batch.name, batch.id) || "9th"}
              onChangeText={(name) => dispatch({ type: "rename-batch", id: batch.id, name })}
            />
            {access.canAdmin ? (
              <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
                <Button
                  small
                  tone="danger"
                  label="Delete batch"
                  onPress={() =>
                    Alert.alert(`Delete ${cleanBatchNumber(batch.name, batch.id) || "batch"}?`, "This removes the batch from every day.", [
                      { text: "Cancel", style: "cancel" },
                      { text: "Delete batch", style: "destructive", onPress: () => dispatch({ type: "remove-batch", id: batch.id }) },
                    ])
                  }
                />
              </View>
            ) : null}
          </View>
          <View style={card}>
            <T weight="semibold" style={{ marginBottom: 6 }}>Day managers</T>
            <Managers day={day} batch={batch} managers={managers} />
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
        </View>
      )}
    </ScrollView>
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
            onChange={(value) => update({ ...cell.content, code: formatModuleCode(value, subNumber) })}
          />
        </View>
        <View style={{ width: 92 }}>
          <Select
            label="Sub-number"
            value={subNumber}
            options={withCurrent(state.subNumbers, subNumber)}
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

function Managers({ day, batch, managers }: { day: DayPlan; batch: Batch; managers: string[] }) {
  const { dispatch } = useSchedule();
  const [extra, setExtra] = useState(0);
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
    <View style={{ gap: 8 }}>
      <T style={{ color: colors.muted, fontSize: 12 }}>ID No.- {filled.length ? filled.join(" & ") : "—"}</T>
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
        <Button small tone="quiet" label="Use for every batch" onPress={() => dispatch({ type: "copy-managers", dayId: day.id, batchId: batch.id })} />
      </View>
    </View>
  );
}

function HeaderEditor() {
  const { state, dispatch } = useSchedule();
  return (
    <View testID="routine-header-editor" style={[card, { borderLeftWidth: 3, borderLeftColor: colors.accent, gap: 10 }]}>
      <View>
        <T weight="bold" style={{ color: colors.accent, fontSize: 15 }}>Routine header & title</T>
        <T style={{ color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
          Scheme, course, and duration. The course title is the bold heading on the routine and the PDF.
        </T>
      </View>
      {state.header.map((line, index) => (
        <View key={line.id} style={{ gap: 6 }}>
          <Label>{`Header line ${index + 1}`}</Label>
          <Field
            testID={`header-line-${index + 1}`}
            accessibilityLabel={`Header line ${index + 1}`}
            value={line.text}
            autoCapitalize="sentences"
            placeholder="Header text"
            onChangeText={(text) => dispatch({ type: "set-header-line", id: line.id, patch: { text } })}
          />
          <Select
            allowEmpty={false}
            label={`Style for header line ${index + 1}`}
            value={headerStyleLabel(line.style)}
            options={HEADER_STYLES.map((item) => item.label)}
            placeholder="Style"
            onChange={(label) => {
              const style = headerStyleFromLabel(label);
              if (!style) return;
              dispatch({ type: "set-header-line", id: line.id, patch: { style } });
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              small
              label="Up"
              disabled={index === 0}
              accessibilityLabel="Move line up"
              onPress={() => dispatch({ type: "move-header-line", id: line.id, dir: -1 })}
            />
            <Button
              small
              label="Down"
              disabled={index === state.header.length - 1}
              accessibilityLabel="Move line down"
              onPress={() => dispatch({ type: "move-header-line", id: line.id, dir: 1 })}
            />
            <Button
              small
              tone="danger"
              label="Remove"
              disabled={state.header.length <= 1}
              accessibilityLabel="Remove line"
              onPress={() => dispatch({ type: "remove-header-line", id: line.id })}
            />
          </View>
        </View>
      ))}
      <Button
        testID="add-header-line"
        label="Add line"
        icon={<Ionicons name="add" size={16} color={colors.ink} />}
        onPress={() => dispatch({ type: "add-header-line" })}
      />
    </View>
  );
}

const card = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: 12,
  padding: 12,
} as const;
