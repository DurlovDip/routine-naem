import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useAccess, useAuth } from "../../src/auth";
import { screenshotMode } from "../../src/flags";
import { upcomingMineGroups, type MySession } from "../../src/lib/mine";
import { buildTimeline, rowCells, type SheetCell } from "../../src/lib/schedule";
import { batchLines, cleanBatchNumber, formatModule, joinWithAnd, orderedManagers, sessionSpanLabel } from "../../src/lib/text";
import { dayWhen, formatDayNumber, formatLastUpdated, formatRange, formatSlashDate, todayInDhaka, weekdayName } from "../../src/lib/time";
import { downloadRoutine } from "../../src/pdf";
import { useSchedule } from "../../src/store";
import { card, colors, radius, shadow, space, type } from "../../src/theme";
import { DayChip, T } from "../../src/ui";

type Pane = "mine" | "routine";

const PANE_KEY = "routine-naem-routine-pane";

function shotSearch(): string {
  return (globalThis as { location?: { search?: string } }).location?.search ?? "";
}

export default function RoutineScreen() {
  const access = useAccess();
  const auth = useAuth();
  const { state, dispatch, day: rawDay, hydrated } = useSchedule();
  const [pane, setPane] = useState<Pane>(() => (screenshotMode && shotSearch().includes("mine=1") ? "mine" : "routine"));
  const [table, setTable] = useState(() => screenshotMode && shotSearch().includes("table=1"));
  const [prefsReady, setPrefsReady] = useState(screenshotMode);
  const isSuperAdmin = access.role === "super_admin";
  const activePane: Pane = isSuperAdmin ? "routine" : pane;
  const activeDay = rawDay;
  const isPublished = Boolean(activeDay.isPublished);
  const day = isPublished && activeDay.publishedSnapshot ? activeDay.publishedSnapshot : activeDay;
  const timeline = buildTimeline(day);
  const upcoming = upcomingMineGroups(
    state.batches,
    state.teachers,
    state.days.map((d) => (d.isPublished && d.publishedSnapshot ? d.publishedSnapshot : d)),
    auth.session?.teacherId ?? "",
    auth.session?.teacherName ?? "",
  );

  useEffect(() => {
    if (screenshotMode) return;
    void AsyncStorage.getItem(PANE_KEY).then((raw) => {
      if (raw) {
        try {
          const saved = JSON.parse(raw) as { pane?: string; table?: boolean };
          if (saved.pane === "mine" || saved.pane === "routine") setPane(saved.pane);
          if (typeof saved.table === "boolean") setTable(saved.table);
        } catch {
          // Ignore a corrupt preference and keep the first-open default.
        }
      }
      setPrefsReady(true);
    });
  }, []);

  useEffect(() => {
    if (!prefsReady || screenshotMode) return;
    void AsyncStorage.setItem(PANE_KEY, JSON.stringify({ pane, table }));
  }, [pane, table, prefsReady]);
  const rows = state.batches.map((batch) => ({
    batch,
    managers: orderedManagers(batch.roster, day.managers[batch.id] ?? []),
    cells: rowCells(day, batch.id),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.desk }}>
      {/* 1. Mine | Routine row, placed directly under the header, before anything else on the Routine tab */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: space.lg,
          paddingTop: space.md,
          paddingBottom: space.xs,
          gap: space.sm,
        }}
      >
        <View style={{ flex: 1 }}>
          {!isSuperAdmin ? (
            <View accessibilityRole="tablist" accessibilityLabel="Schedule" style={styles.segment}>
              {/* Mine segment */}
              <Pressable
                accessibilityRole="tab"
                accessibilityState={{ selected: activePane === "mine" }}
                onPress={() => setPane("mine")}
                style={[styles.segmentBtn, activePane === "mine" && styles.segmentOn]}
              >
                <T
                  numberOfLines={1}
                  weight={activePane === "mine" ? "semibold" : "medium"}
                  style={{ color: activePane === "mine" ? colors.accent : colors.muted, fontSize: 13 }}
                >
                  Mine
                </T>
              </Pressable>

              {/* Routine segment with batch/table icon inside */}
              <View
                style={[
                  styles.segmentBtn,
                  styles.routineSegment,
                  activePane === "routine" && styles.segmentOn,
                ]}
              >
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: activePane === "routine" }}
                  onPress={() => setPane("routine")}
                  style={styles.routineLabelBtn}
                >
                  <T
                    numberOfLines={1}
                    weight={activePane === "routine" ? "semibold" : "medium"}
                    style={{ color: activePane === "routine" ? colors.accent : colors.muted, fontSize: 13 }}
                  >
                    Routine
                  </T>
                </Pressable>

                <View
                  style={[
                    styles.divider,
                    { backgroundColor: activePane === "routine" ? colors.line : "#dfdeda" },
                  ]}
                />

                <Pressable
                  testID="routine-table-toggle"
                  accessibilityRole="button"
                  accessibilityLabel={table ? "Switch to batch view" : "Switch to table view"}
                  hitSlop={6}
                  onPress={() => {
                    setTable((current) => !current);
                    setPane("routine");
                  }}
                  style={({ pressed }) => [
                    styles.toggleBtn,
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Ionicons
                    name={table ? "list-outline" : "grid-outline"}
                    size={18}
                    color={activePane === "routine" ? colors.accent : colors.muted}
                  />
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View
                style={[
                  styles.segment,
                  { alignSelf: "flex-start", paddingHorizontal: 3 },
                ]}
              >
                <View
                  style={[
                    styles.segmentBtn,
                    styles.segmentOn,
                    styles.routineSegment,
                    { paddingHorizontal: space.sm },
                  ]}
                >
                  <View style={styles.routineLabelBtn}>
                    <T weight="semibold" style={{ color: colors.accent, fontSize: 13 }}>
                      Routine
                    </T>
                  </View>
                  <View style={[styles.divider, { backgroundColor: colors.line }]} />
                  <Pressable
                    testID="routine-table-toggle"
                    accessibilityRole="button"
                    accessibilityLabel={table ? "Switch to batch view" : "Switch to table view"}
                    hitSlop={6}
                    onPress={() => setTable((current) => !current)}
                    style={({ pressed }) => [styles.toggleBtn, { opacity: pressed ? 0.6 : 1 }]}
                  >
                    <Ionicons name={table ? "list-outline" : "grid-outline"} size={18} color={colors.accent} />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Download icon at right end: plain dark icon in the theme's dark text colour */}
        <Pressable
          testID="routine-download"
          accessibilityRole="button"
          accessibilityLabel="Download PDF"
          hitSlop={8}
          onPress={() => {
            if (!isPublished && !access.canEdit) {
              Alert.alert(
                "Routine in Draft",
                "This routine has not been published yet. Once the course coordinator publishes it, it will be available for download.",
              );
              return;
            }
            void downloadRoutine(state, day);
          }}
          style={({ pressed }) => [
            styles.downloadBtn,
            { opacity: pressed ? 0.6 : !isPublished && !access.canEdit ? 0.45 : 1 },
          ]}
        >
          <Ionicons
            name={!isPublished && !access.canEdit ? "lock-closed-outline" : "download-outline"}
            size={22}
            color={colors.ink}
          />
        </Pressable>
      </View>

      {/* 2. Routine view: Shows horizontal day chips and date line */}
      {activePane === "routine" ? (
        <View style={{ paddingTop: space.sm, gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: space.lg }}>
            <T weight="bold" style={{ fontSize: 14, color: colors.ink, minWidth: 42 }}>Day:</T>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: space.sm, alignItems: "center" }}
              style={{ flex: 1 }}
            >
              {state.days.map((item) => (
                <DayChip
                  key={item.id}
                  selected={item.id === activeDay.id}
                  when={dayWhen(item.date, todayInDhaka())}
                  label={String(item.dayNumber)}
                  onPress={() => dispatch({ type: "set-active-day", id: item.id })}
                />
              ))}
            </ScrollView>
          </View>
          <View style={{ paddingHorizontal: space.lg, gap: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <T style={{ color: colors.muted, fontSize: type.caption }}>
                {formatSlashDate(day.date)}
                {weekdayName(day.date) ? ` · ${weekdayName(day.date)}` : ""} · {formatDayNumber(day.dayNumber)}
              </T>
              <View style={isPublished ? styles.badgePublished : styles.badgeDraft}>
                <Ionicons
                  name={isPublished ? "checkmark-circle" : "time-outline"}
                  size={11}
                  color={isPublished ? "#059669" : "#d97706"}
                />
                <T weight="bold" style={{ fontSize: 10, color: isPublished ? "#065f46" : "#92400e", letterSpacing: 0.3 }}>
                  {isPublished ? "PUBLISHED" : "DRAFT"}
                </T>
              </View>
            </View>
            {day.publishedAt ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Ionicons name="time-outline" size={12} color={colors.muted} />
                <T style={{ color: colors.muted, fontSize: 11 }}>
                  Last updated: {formatLastUpdated(day.publishedAt)}
                </T>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {!hydrated ? (
        <T style={{ padding: 16, color: colors.muted }}>Loading routine…</T>
      ) : activePane === "mine" ? (
        <ScrollView testID="routine-mine" style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}>
          {upcoming.length === 0 ? (
            <View style={card}>
              <T style={{ color: colors.muted }}>No upcoming sessions</T>
            </View>
          ) : (
            upcoming.map((group) => (
              <View key={group.day.id} style={{ gap: space.sm }}>
                <T weight="semibold" style={{ color: colors.muted, fontSize: type.caption }}>
                  {group.header}
                </T>
                {group.sessions.map((item) => (
                  <MineCard key={`${group.day.id}:${item.key}`} item={item} />
                ))}
              </View>
            ))
          )}
        </ScrollView>
      ) : table ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: 16 }}>
            <Table rows={rows} timeline={timeline} recap={state.recapLabel} />
          </ScrollView>
        </ScrollView>
      ) : (
        <ScrollView testID="routine-list" style={{ flex: 1 }} contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
          {rows.length === 0 ? <Empty /> : rows.map((row) => <BatchCard key={row.batch.id} row={row} timeline={timeline} recap={state.recapLabel} />)}
        </ScrollView>
      )}
    </View>
  );
}

function MineCard({ item }: { item: MySession }) {
  return (
    <View style={card}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
        <T weight="bold" style={{ flex: 1, fontSize: type.title }}>{item.label}</T>
        <T style={{ color: colors.muted, fontSize: type.caption }}>{formatRange(item.start, item.end)}</T>
      </View>
      <T style={{ color: colors.muted, fontSize: type.caption, marginTop: 2 }}>{item.batchLabel}</T>
      {item.module ? (
        <T weight="semibold" style={{ marginTop: 8 }}>{item.module}</T>
      ) : (
        <T style={{ color: colors.muted, marginTop: 8 }}>Empty</T>
      )}
      {item.coTeachers.length > 0 ? (
        <T style={{ marginTop: 2 }}>with {joinWithAnd(item.coTeachers)}</T>
      ) : null}
    </View>
  );
}

function Empty() {
  return (
    <View style={card}>
      <T style={{ color: colors.muted }}>No batches in this routine yet.</T>
    </View>
  );
}

function BatchCard({
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
      <T weight="bold" style={{ fontSize: type.title }}>{batchLines(row.batch.name, row.batch.id).join(" ")}</T>
      <T style={{ color: colors.muted, fontSize: type.caption, marginTop: 2 }}>
        {recap}: {row.managers.length ? `ID No.- ${joinWithAnd(row.managers)}` : "—"}
      </T>
      <View style={{ marginTop: 10, gap: 8 }}>
        {row.cells.map((cell) => {
          if (cell.kind === "skip") return null;
          if (cell.kind === "break") {
            const timed = timeline.slots.find((slot) => slot.id === cell.id);
            const when = timed ? formatRange(timed.start, timed.end) : "";
            return (
              <T key={cell.id} weight="semibold" style={{ color: colors.muted, fontSize: 12, textAlign: "center" }}>
                {cell.label}
                {when ? ` · ${when}` : ""}
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
            <View key={cell.anchorId} style={session}>
              <T weight="semibold" style={{ fontSize: 12 }}>{sessionSpanLabel(cell.numbers)}</T>
              {when ? <T style={{ color: colors.muted, fontSize: 11 }}>{when}</T> : null}
              {line ? <T weight="semibold" style={{ marginTop: 4 }}>{line}</T> : <T style={{ color: colors.muted, marginTop: 4 }}>Empty</T>}
              {teachers ? <T style={{ marginTop: 2 }}>{teachers}</T> : null}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Table({
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
    <View>
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
    <View style={{ width, minHeight: header ? 52 : 64, borderWidth: 1, borderColor: colors.line, backgroundColor: header ? colors.paper : colors.surface, padding: 6, justifyContent: "center" }}>
      <T weight={header ? "semibold" : "regular"} style={{ fontSize: 11, lineHeight: 15 }}>{text}</T>
    </View>
  );
}

const session = {
  backgroundColor: colors.paper,
  borderRadius: radius.md,
  padding: space.md,
} as const;

const styles = StyleSheet.create({
  segment: {
    flexDirection: "row",
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    padding: 3,
    height: 40,
    alignItems: "center",
  },
  segmentBtn: {
    flex: 1,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
  },
  segmentOn: {
    backgroundColor: colors.surface,
    ...shadow,
  },
  routineSegment: {
    flexDirection: "row",
    alignItems: "center",
    height: 34,
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  routineLabelBtn: {
    flex: 1,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingLeft: 12,
    paddingRight: 4,
  },
  divider: {
    width: 1,
    height: 16,
    marginHorizontal: 3,
  },
  toggleBtn: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  downloadBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  badgePublished: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#d1fae5",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeDraft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#fef3c7",
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
