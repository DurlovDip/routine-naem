import Ionicons from "@expo/vector-icons/Ionicons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useAccess, useAuth } from "../../src/auth";
import { screenshotMode } from "../../src/flags";
import { mineEmptyLabel, mySessions, type MySession } from "../../src/lib/mine";
import { buildTimeline, rowCells, type SheetCell } from "../../src/lib/schedule";
import { batchLines, cleanBatchNumber, formatModule, joinWithAnd, orderedManagers, sessionSpanLabel } from "../../src/lib/text";
import { dayWhen, formatDayNumber, formatRange, formatSlashDate, todayInDhaka, weekdayName } from "../../src/lib/time";
import { downloadRoutine } from "../../src/pdf";
import { useSchedule } from "../../src/store";
import { card, colors, radius, space, type } from "../../src/theme";
import { Button, DayChip, Segmented, T } from "../../src/ui";

type Pane = "mine" | "routine";

const PANE_KEY = "routine-naem-routine-pane";

function shotSearch(): string {
  return (globalThis as { location?: { search?: string } }).location?.search ?? "";
}

export default function RoutineScreen() {
  const router = useRouter();
  const access = useAccess();
  const auth = useAuth();
  const { state, dispatch, day, hydrated } = useSchedule();
  const [pane, setPane] = useState<Pane>(() => (screenshotMode && shotSearch().includes("mine=1") ? "mine" : "routine"));
  const [table, setTable] = useState(() => screenshotMode && shotSearch().includes("table=1"));
  const [prefsReady, setPrefsReady] = useState(screenshotMode);
  const timeline = buildTimeline(day);
  const mine = mySessions(state.batches, state.teachers, day, auth.session?.teacherId ?? "", auth.session?.teacherName ?? "");

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
      <View style={{ paddingTop: space.md, gap: space.md }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, alignItems: "center" }}>
          {state.days.map((item) => (
            <DayChip
              key={item.id}
              selected={item.id === day.id}
              when={dayWhen(item.date, todayInDhaka())}
              label={formatDayNumber(item.dayNumber).replace("Day – ", "Day ")}
              onPress={() => dispatch({ type: "set-active-day", id: item.id })}
            />
          ))}
          {access.canEdit ? (
            <Button
              small
              icon={<Ionicons name="add" size={17} color={colors.ink} />}
              testID="routine-add-day"
              accessibilityLabel="Add or edit days"
              onPress={() => router.push("/(main)/editor")}
            />
          ) : null}
        </ScrollView>
        <View style={{ paddingHorizontal: space.lg, gap: space.sm }}>
          <T style={{ color: colors.muted, fontSize: type.caption }}>
            {formatSlashDate(day.date)}
            {weekdayName(day.date) ? ` · ${weekdayName(day.date)}` : ""} · {formatDayNumber(day.dayNumber)}
          </T>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Segmented
                label="Schedule"
                value={pane}
                onChange={setPane}
                options={[
                  { value: "mine", label: "Mine" },
                  { value: "routine", label: "Routine" },
                ]}
              />
            </View>
            {pane === "routine" ? (
              <>
                <Button
                  square
                  tone="ghost"
                  icon={<Ionicons name={table ? "list-outline" : "grid-outline"} size={20} color={colors.ink} />}
                  testID="routine-table-toggle"
                  accessibilityLabel={table ? "Batch view" : "Table view"}
                  onPress={() => setTable((current) => !current)}
                />
                <Button
                  square
                  tone="primary"
                  icon={<Ionicons name="download-outline" size={20} color="#fff" />}
                  testID="routine-download"
                  accessibilityLabel="Download PDF"
                  onPress={() => void downloadRoutine(state, day)}
                />
              </>
            ) : null}
          </View>
        </View>
      </View>
      {!hydrated ? (
        <T style={{ padding: 16, color: colors.muted }}>Loading routine…</T>
      ) : pane === "mine" ? (
        <ScrollView testID="routine-mine" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
          {mine.length === 0 ? (
            <View style={card}>
              <T style={{ color: colors.muted }}>{mineEmptyLabel(day.dayNumber)}</T>
            </View>
          ) : (
            mine.map((item) => <MineCard key={item.key} item={item} />)
          )}
        </ScrollView>
      ) : table ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: 16 }}>
            <Table rows={rows} timeline={timeline} recap={state.recapLabel} />
          </ScrollView>
        </ScrollView>
      ) : (
        <ScrollView testID="routine-list" contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: space.xxl }}>
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
            text={`${slot.kind === "session" ? `Session - ${slot.number}` : slot.label}\n${formatRange(slot.start, slot.end)}`}
          />
        ))}
      </View>
      {rows.map((row) => (
        <View key={row.batch.id} style={{ flexDirection: "row" }}>
          <TableCell width={78} text={cleanBatchNumber(row.batch.name, row.batch.id) || "Batch"} />
          <TableCell width={108} text={row.managers.length ? `ID No.- ${joinWithAnd(row.managers)}` : "—"} />
          {timeline.slots.map((slot) => {
            if (slot.kind === "break") {
              const label = row.cells.find((cell) => cell.kind === "break" && cell.id === slot.id);
              return <TableCell key={slot.id} width={76} text={label && label.kind === "break" ? label.label : ""} />;
            }
            const cell = row.cells.find((item) => item.kind === "session" && item.sessionIds.includes(slot.id));
            if (!cell || cell.kind !== "session") return <TableCell key={slot.id} width={132} text="" />;
            const continued = cell.anchorId !== slot.id;
            const line = formatModule(cell.content.code, cell.content.note);
            const teachers = joinWithAnd(cell.content.teachers);
            return (
              <TableCell key={slot.id} width={132} text={continued ? "Merged" : [line, teachers].filter(Boolean).join("\n") || "—"} />
            );
          })}
        </View>
      ))}
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
