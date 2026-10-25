import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { buildTimeline, findConflicts, rowCells, type SheetCell } from "./lib/schedule";
import { cleanBatchNumber, formatModule, joinWithAnd, orderedManagers, sessionSpanLabel } from "./lib/text";
import { formatRange, formatSlashDate, weekdayName } from "./lib/time";
import { isDayDirty } from "./lib/reducer";
import type { DayPlan } from "./lib/types";
import { useSchedule } from "./store";
import { card, colors, radius, shadow, space, type } from "./theme";
import { Button, T } from "./ui";

export function DraftRoutineModal({
  visible,
  day,
  onClose,
}: {
  visible: boolean;
  day: DayPlan;
  onClose: () => void;
}) {
  const { state } = useSchedule();
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");

  if (!visible) return null;

  const timeline = buildTimeline(day);
  const rows = state.batches.map((b) => ({
    batch: b,
    managers: orderedManagers(b.roster, day.managers[b.id] ?? []),
    cells: rowCells(day, b.id),
  }));
  const conflicts = state.showConflicts ? findConflicts(state.batches, day) : [];
  const hasChanges = isDayDirty(day);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={container}>
        {/* Header */}
        <View style={header}>
          <View style={{ flex: 1, paddingRight: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <T weight="bold" style={{ fontSize: type.title, color: colors.accent }}>
                Draft Routine Table
              </T>
              <View
                style={{
                  backgroundColor: hasChanges ? colors.warnBg : colors.chipPast,
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: radius.pill,
                }}
              >
                <T weight="bold" style={{ fontSize: 10, color: hasChanges ? colors.warn : colors.accent }}>
                  {hasChanges ? "DRAFT" : "PUBLISHED"}
                </T>
              </View>
            </View>
            <T style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
              Day {day.dayNumber} · {formatSlashDate(day.date)}{weekdayName(day.date) ? ` · ${weekdayName(day.date)}` : ""}
            </T>
          </View>

          {/* Actions: View toggle & Close button */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={viewToggle}>
              <Pressable
                testID="draft-view-table-btn"
                accessibilityRole="button"
                accessibilityLabel="Table view"
                onPress={() => setViewMode("table")}
                style={[
                  toggleBtn,
                  viewMode === "table" && toggleBtnActive,
                ]}
              >
                <Ionicons
                  name="grid-outline"
                  size={16}
                  color={viewMode === "table" ? colors.accent : colors.muted}
                />
              </Pressable>
              <Pressable
                testID="draft-view-cards-btn"
                accessibilityRole="button"
                accessibilityLabel="Cards view"
                onPress={() => setViewMode("cards")}
                style={[
                  toggleBtn,
                  viewMode === "cards" && toggleBtnActive,
                ]}
              >
                <Ionicons
                  name="list-outline"
                  size={16}
                  color={viewMode === "cards" ? colors.accent : colors.muted}
                />
              </Pressable>
            </View>

            <Pressable
              testID="close-draft-preview"
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 6 }]}
            >
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>
        </View>

        {/* Conflict warnings */}
        {conflicts.length > 0 ? (
          <View style={conflictBanner}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Ionicons name="warning" size={16} color={colors.warn} />
              <T weight="semibold" style={{ color: colors.warn, fontSize: 12 }}>
                Teacher conflict detected in draft
              </T>
            </View>
            {conflicts.map((c) => (
              <T key={`${c.sessionId}-${c.teacher}`} style={{ color: colors.warn, fontSize: 11, marginLeft: 22 }}>
                {c.teacher} assigned to {c.batchNames.join(" & ")} during Session - {c.sessionNumber}
              </T>
            ))}
          </View>
        ) : null}

        {/* Content */}
        {rows.length === 0 ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
            <Ionicons name="calendar-outline" size={40} color={colors.muted} />
            <T style={{ color: colors.muted, marginTop: 12 }}>No batches in this routine yet.</T>
          </View>
        ) : viewMode === "table" ? (
          <ScrollView
            testID="draft-table-view"
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 40 }}
          >
            <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: space.md }}>
              <DraftTable rows={rows} timeline={timeline} recap={state.recapLabel} />
            </ScrollView>
          </ScrollView>
        ) : (
          <ScrollView
            testID="draft-cards-view"
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: space.md, gap: space.md, paddingBottom: 40 }}
          >
            {rows.map((row) => (
              <DraftBatchCard
                key={row.batch.id}
                row={row}
                timeline={timeline}
                recap={state.recapLabel}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

function DraftTable({
  rows,
  timeline,
  recap,
}: {
  rows: { batch: { id: string; name: string }; managers: string[]; cells: SheetCell[] }[];
  timeline: ReturnType<typeof buildTimeline>;
  recap: string;
}) {
  let currentOffset = 78 + 108;
  const breakOverlays: { id: string; label: string; offset: number }[] = [];
  for (const slot of timeline.slots) {
    const width = slot.kind === "break" ? 76 : 132;
    if (slot.kind === "break") {
      breakOverlays.push({ id: slot.id, label: slot.label, offset: currentOffset });
    }
    currentOffset += width;
  }

  return (
    <View style={{ backgroundColor: colors.surface, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.line }}>
      <View style={{ flexDirection: "row" }}>
        <TableCell width={78} header text="Batch" />
        <TableCell width={108} header text={`${recap}\n${formatRange(timeline.recap.start, timeline.recap.end)}`} />
        {timeline.slots.map((slot) => (
          <TableCell
            key={slot.id}
            width={slot.kind === "break" ? 76 : 132}
            header
            text={
              slot.kind === "session"
                ? `Session - ${slot.number}\n${formatRange(slot.start, slot.end)}`
                : formatRange(slot.start, slot.end)
            }
          />
        ))}
      </View>
      <View style={{ position: "relative" }}>
        {rows.map((row) => (
          <View key={row.batch.id} style={{ flexDirection: "row" }}>
            <TableCell width={78} text={cleanBatchNumber(row.batch.name, row.batch.id) || "Batch"} />
            <TableCell width={108} text={row.managers.length ? `ID No.- ${joinWithAnd(row.managers)}` : "—"} />
            {row.cells.map((cell) => {
              if (cell.kind === "skip") return null;
              if (cell.kind === "break") {
                return <View key={cell.id} style={{ width: 76 }} />;
              }
              const line = formatModule(cell.content.code, cell.content.note);
              const teachers = joinWithAnd(cell.content.teachers);
              return (
                <TableCell
                  key={cell.anchorId}
                  width={132 * cell.span}
                  text={[line, teachers].filter(Boolean).join("\n") || "—"}
                />
              );
            })}
          </View>
        ))}
        {rows.length > 0
          ? breakOverlays.map((item) => (
              <View
                key={item.id}
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: item.offset,
                  top: 0,
                  bottom: 0,
                  width: 76,
                  borderWidth: 1,
                  borderColor: colors.line,
                  backgroundColor: colors.surface,
                  padding: 6,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <T weight="medium" style={{ fontSize: 11, lineHeight: 15, textAlign: "center" }}>
                  {item.label}
                </T>
              </View>
            ))
          : null}
      </View>
    </View>
  );
}

function TableCell({
  text = "",
  width,
  header,
}: {
  text?: string;
  width: number;
  header?: boolean;
}) {
  return (
    <View
      style={{
        width,
        minHeight: header ? 52 : 64,
        borderWidth: 1,
        borderColor: colors.line,
        backgroundColor: header ? colors.paper : colors.surface,
        padding: 6,
        justifyContent: "center",
      }}
    >
      <T weight={header ? "semibold" : "regular"} style={{ fontSize: 11, lineHeight: 15 }}>
        {text}
      </T>
    </View>
  );
}

function DraftBatchCard({
  row,
  timeline,
  recap,
}: {
  row: { batch: { id: string; name: string }; managers: string[]; cells: SheetCell[] };
  timeline: ReturnType<typeof buildTimeline>;
  recap: string;
}) {
  return (
    <View style={card}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.sm }}>
        <T weight="bold" style={{ fontSize: type.title, color: colors.accent }}>
          {cleanBatchNumber(row.batch.name, row.batch.id) || "Batch"}
        </T>
        <T style={{ color: colors.muted, fontSize: type.caption }}>
          {row.managers.length ? `ID No.- ${joinWithAnd(row.managers)}` : `${recap}: None`}
        </T>
      </View>
      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {row.cells.map((cell) => {
          if (cell.kind === "skip") return null;
          if (cell.kind === "break") {
            const timed = timeline.slots.find((slot) => slot.id === cell.id);
            return (
              <T key={cell.id} weight="semibold" style={{ textAlign: "center", color: colors.muted, fontSize: 11 }}>
                {cell.label}
                {timed ? ` · ${formatRange(timed.start, timed.end)}` : ""}
              </T>
            );
          }
          const timed = cell.sessionIds
            .map((id) => timeline.slots.find((slot) => slot.id === id))
            .filter((slot) => slot && slot.kind === "session");
          const when = timed.length > 0 ? formatRange(timed[0]!.start, timed[timed.length - 1]!.end) : "";
          const line = formatModule(cell.content.code, cell.content.note);
          const teachers = joinWithAnd(cell.content.teachers);
          return (
            <View key={cell.anchorId} style={{ backgroundColor: colors.paper, borderRadius: radius.md, padding: space.sm, gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <T weight="semibold" style={{ fontSize: 13 }}>
                  {sessionSpanLabel(cell.numbers)}
                </T>
                {when ? <T style={{ color: colors.muted, fontSize: 11 }}>{when}</T> : null}
              </View>
              {line ? <T weight="semibold" style={{ color: colors.ink, fontSize: 12 }}>{line}</T> : null}
              {teachers ? (
                <T style={{ color: colors.muted, fontSize: 11 }}>with {teachers}</T>
              ) : !line ? (
                <T style={{ color: colors.muted, fontSize: 11 }}>Empty session</T>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const container = {
  flex: 1,
  backgroundColor: colors.desk,
};

const header = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  paddingHorizontal: space.lg,
  paddingTop: Platform.OS === "ios" ? 20 : space.md,
  paddingBottom: space.md,
  backgroundColor: colors.surface,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
};

const viewToggle = {
  flexDirection: "row" as const,
  backgroundColor: colors.paper,
  borderRadius: radius.sm,
  padding: 2,
};

const toggleBtn = {
  paddingHorizontal: 8,
  paddingVertical: 6,
  borderRadius: radius.sm - 2,
};

const toggleBtnActive = {
  backgroundColor: colors.surface,
  ...shadow,
};

const conflictBanner = {
  backgroundColor: colors.warnBg,
  paddingHorizontal: space.md,
  paddingVertical: space.sm,
  borderBottomWidth: 1,
  borderBottomColor: "#ead9b0",
  gap: 2,
};
