import { useState } from "react";
import { ScrollView, View } from "react-native";
import { buildTimeline, rowCells, type SheetCell } from "../../src/lib/schedule";
import { batchLines, cleanBatchNumber, formatModule, joinWithAnd, orderedManagers, sessionSpanLabel } from "../../src/lib/text";
import { formatDayNumber, formatRange, formatSlashDate, weekdayName } from "../../src/lib/time";
import { shareOrPrintRoutine } from "../../src/pdf";
import { useSchedule } from "../../src/store";
import { colors } from "../../src/theme";
import { Button, Segmented, T } from "../../src/ui";

type ViewMode = "list" | "table";

export default function RoutineScreen() {
  const { state, dispatch, day, hydrated } = useSchedule();
  const [mode, setMode] = useState<ViewMode>("list");
  const timeline = buildTimeline(day);
  const title = state.header.find((line) => line.style === "title")?.text;
  const rows = state.batches.map((batch) => ({
    batch,
    managers: orderedManagers(batch.roster, day.managers[batch.id] ?? []),
    cells: rowCells(day, batch.id),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.desk }}>
      <View style={{ paddingTop: 12, gap: 10 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
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
        </ScrollView>
        <View style={{ paddingHorizontal: 16, gap: 8 }}>
          {title ? <T weight="semibold" style={{ fontSize: 13 }}>{title}</T> : null}
          <T style={{ color: colors.muted, fontSize: 12 }}>
            {formatSlashDate(day.date)}
            {weekdayName(day.date) ? ` · ${weekdayName(day.date)}` : ""} · {formatDayNumber(day.dayNumber)}
          </T>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Segmented
                label="Routine view"
                value={mode}
                onChange={setMode}
                options={[
                  { value: "list", label: "Batches" },
                  { value: "table", label: "Table" },
                ]}
              />
            </View>
            <Button label="PDF" tone="primary" onPress={() => shareOrPrintRoutine(state, day)} />
          </View>
        </View>
      </View>
      {!hydrated ? (
        <T style={{ padding: 16, color: colors.muted }}>Loading routine…</T>
      ) : mode === "list" ? (
        <ScrollView testID="routine-list" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }}>
          {rows.length === 0 ? <Empty /> : rows.map((row) => <BatchCard key={row.batch.id} row={row} timeline={timeline} recap={state.recapLabel} />)}
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ padding: 16 }}>
            <Table rows={rows} timeline={timeline} recap={state.recapLabel} />
          </ScrollView>
        </ScrollView>
      )}
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
      <T weight="bold" style={{ fontSize: 16 }}>{batchLines(row.batch.name, row.batch.id).join(" ")}</T>
      <T style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
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

const card = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: 12,
  padding: 12,
} as const;

const session = {
  backgroundColor: colors.paper,
  borderRadius: 8,
  padding: 8,
} as const;
