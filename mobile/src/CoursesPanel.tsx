import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { createElement, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useCourses } from "./courses";
import { courseStatusLabel, isCourseStatus, type CourseDraft, type CourseStatus, type CourseSummary } from "./lib/courses";
import { formatSlashDate, toIsoDate } from "./lib/time";
import { card, colors, radius, space } from "./theme";
import { Button, Field, Label, Segmented, T } from "./ui";

const FILTERS = ["all", "active", "inactive", "ended"] as const;
type Filter = (typeof FILTERS)[number];
const STATUSES = ["active", "inactive", "ended"] as const;

function draftFrom(course?: CourseSummary): CourseDraft {
  return {
    name: course?.name ?? "",
    code: course?.code ?? "",
    status: course?.status ?? "active",
    startDate: course?.startDate ?? "",
    endDate: course?.endDate ?? "",
  };
}

function clean(draft: CourseDraft): CourseDraft {
  return {
    name: draft.name.trim(),
    code: draft.code?.trim() ? draft.code.trim() : null,
    status: draft.status,
    startDate: draft.startDate || null,
    endDate: draft.endDate || null,
  };
}

type EndPrompt = { name: string; resolve: (ok: boolean) => void };

export function CoursesPanel() {
  const { courses, createCourse, updateCourse, selectCourse, selected } = useCourses();
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState<CourseDraft>(draftFrom());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endPrompt, setEndPrompt] = useState<EndPrompt | null>(null);
  const shown = filter === "all" ? courses : courses.filter((course) => course.status === filter);

  function confirmEnded(name: string): Promise<boolean> {
    return new Promise((resolve) => {
      setEndPrompt({ name, resolve });
    });
  }

  function answerEnd(ok: boolean) {
    endPrompt?.resolve(ok);
    setEndPrompt(null);
  }

  async function create() {
    if (draft.status === "ended") {
      const ok = await confirmEnded(draft.name.trim() || "this course");
      if (!ok) return;
    }
    setBusy(true);
    const message = await createCourse(clean(draft));
    setBusy(false);
    setError(message);
    if (!message) setDraft(draftFrom());
  }

  return (
    <View style={{ flex: 1 }}>
    <ScrollView
      testID="courses-scroll"
      contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }}
      keyboardShouldPersistTaps="handled"
    >
      <T style={{ color: colors.muted, fontSize: 12, lineHeight: 17 }}>
        Several courses can be active at once. Teachers can read active and ended courses. Inactive courses stay hidden from them.
      </T>
      <Segmented
        label="Course status"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((item) => ({ value: item, label: item === "all" ? "All" : courseStatusLabel(item) }))}
      />
      <View testID="new-course-form" style={courseCard}>
        <T weight="semibold" style={{ fontSize: 16 }}>New course</T>
        <View>
          <Label>Name</Label>
          <Field
            accessibilityLabel="New course name"
            value={draft.name}
            onChangeText={(name) => setDraft({ ...draft, name })}
            placeholder="Course name"
            autoCapitalize="words"
          />
        </View>
        <View>
          <Label>Short name</Label>
          <Field
            accessibilityLabel="New course short name"
            value={draft.code ?? ""}
            onChangeText={(code) => setDraft({ ...draft, code })}
            placeholder="Optional"
            autoCapitalize="characters"
          />
        </View>
        <DateField
          label="Starts"
          accessibilityLabel="New course start"
          value={draft.startDate ?? ""}
          onChange={(startDate) => setDraft({ ...draft, startDate })}
        />
        <DateField
          label="Ends"
          accessibilityLabel="New course end"
          value={draft.endDate ?? ""}
          onChange={(endDate) => setDraft({ ...draft, endDate })}
        />
        <View>
          <Label>Status</Label>
          <Segmented
            label="New course status"
            value={draft.status}
            onChange={(status) => {
              if (isCourseStatus(status)) setDraft({ ...draft, status });
            }}
            options={STATUSES.map((status) => ({ value: status, label: courseStatusLabel(status) }))}
          />
        </View>
        <Button
          label={busy ? "Saving…" : "Create course"}
          tone="primary"
          disabled={busy || !draft.name.trim()}
          onPress={() => void create()}
        />
      </View>
      {error ? <T style={{ color: colors.danger }}>{error}</T> : null}
      {shown.length === 0 ? <T style={{ color: colors.muted, fontSize: 12 }}>No courses in this filter.</T> : null}
      <View testID="course-list" style={{ gap: 10 }}>
        {shown.map((course) => (
          <CourseCard
            key={`${course.id}:${course.updatedAt}`}
            course={course}
            current={course.id === selected?.id}
            confirmEnded={confirmEnded}
            onOpen={() => {
              selectCourse(course.id);
              router.push("/(main)/routine");
            }}
            onSave={async (next) => {
              const message = await updateCourse(course.id, clean(next));
              setError(message);
              return message;
            }}
          />
        ))}
      </View>
    </ScrollView>
      <Modal visible={endPrompt !== null} transparent animationType="fade" onRequestClose={() => answerEnd(false)}>
        <View style={backdrop}>
          <View style={dialog}>
            <T weight="semibold" style={{ fontSize: 16 }}>End {endPrompt?.name}?</T>
            <T style={{ color: colors.muted, fontSize: 13, lineHeight: 18 }}>
              Teachers can still read it. Only a super admin can change it after it ends.
            </T>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Button label="Cancel" onPress={() => answerEnd(false)} />
              <Button label="End course" tone="danger" onPress={() => answerEnd(true)} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function CourseCard({
  course,
  current,
  confirmEnded,
  onOpen,
  onSave,
}: {
  course: CourseSummary;
  current: boolean;
  confirmEnded: (name: string) => Promise<boolean>;
  onOpen: () => void;
  onSave: (draft: CourseDraft) => Promise<string | null>;
}) {
  const [draft, setDraft] = useState<CourseDraft>(draftFrom(course));
  const [busy, setBusy] = useState(false);

  async function setStatus(status: CourseStatus) {
    if (status === draft.status || busy) return;
    if (status === "ended" && course.status !== "ended") {
      const ok = await confirmEnded(draft.name.trim() || course.name);
      if (!ok) return;
    }
    const next = { ...draft, status };
    setDraft(next);
    setBusy(true);
    await onSave(next);
    setBusy(false);
  }

  async function save() {
    if (draft.status === "ended" && course.status !== "ended") {
      const ok = await confirmEnded(draft.name.trim() || course.name);
      if (!ok) return;
    }
    setBusy(true);
    await onSave(draft);
    setBusy(false);
  }

  return (
    <View testID={`course-card-${course.id}`} style={courseCard}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
        <T weight="semibold" style={{ flex: 1, fontSize: 16 }}>{course.name}</T>
        <StatusBadge status={draft.status} open={current} />
      </View>
      <View>
        <Label>Name</Label>
        <Field
          accessibilityLabel={`Name for ${course.name}`}
          value={draft.name}
          onChangeText={(name) => setDraft({ ...draft, name })}
          autoCapitalize="words"
        />
      </View>
      <View>
        <Label>Short name</Label>
        <Field
          accessibilityLabel={`Short name for ${course.name}`}
          value={draft.code ?? ""}
          onChangeText={(code) => setDraft({ ...draft, code })}
          autoCapitalize="characters"
        />
      </View>
      <DateField
        label="Starts"
        accessibilityLabel={`Start for ${course.name}`}
        value={draft.startDate ?? ""}
        onChange={(startDate) => setDraft({ ...draft, startDate })}
      />
      <DateField
        label="Ends"
        accessibilityLabel={`End for ${course.name}`}
        value={draft.endDate ?? ""}
        onChange={(endDate) => setDraft({ ...draft, endDate })}
      />
      <View>
        <Label>Status</Label>
        <Segmented
          label={`Status for ${course.name}`}
          value={draft.status}
          onChange={(status) => {
            if (isCourseStatus(status)) void setStatus(status);
          }}
          options={STATUSES.map((status) => ({ value: status, label: courseStatusLabel(status) }))}
        />
      </View>
      <Button
        label={busy ? "Saving…" : "Save course"}
        tone="primary"
        disabled={busy || !draft.name.trim()}
        onPress={() => void save()}
      />
      <Button label="Open routine" onPress={onOpen} />
    </View>
  );
}

function StatusBadge({ status, open }: { status: CourseStatus; open: boolean }) {
  const palette =
    status === "active"
      ? { backgroundColor: colors.accentSoft, color: colors.accentDark }
      : status === "ended"
        ? { backgroundColor: colors.warnBg, color: colors.warn }
        : { backgroundColor: colors.paper, color: colors.muted };
  return (
    <View style={{ backgroundColor: palette.backgroundColor, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
      <T weight="semibold" style={{ color: palette.color, fontSize: 12 }}>
        {courseStatusLabel(status)}
        {open ? " · open" : ""}
      </T>
    </View>
  );
}

function DateField({
  label,
  accessibilityLabel,
  value,
  onChange,
}: {
  label: string;
  accessibilityLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <View>
      <Label>{label}</Label>
      {Platform.OS === "web" ? (
        createElement("input", {
          type: "date",
          "aria-label": accessibilityLabel,
          value: toIsoDate(value),
          onChange: (event: Event) => onChange((event.target as HTMLInputElement).value),
          style: dateInput,
        })
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={() => setShow(true)}
            style={dateButton}
          >
            <T style={{ color: value ? colors.ink : colors.muted }}>{value ? formatSlashDate(value) : "Choose date"}</T>
          </Pressable>
          {value ? <Button small tone="quiet" label="Clear" onPress={() => onChange("")} accessibilityLabel={`Clear ${label}`} /> : null}
        </View>
      )}
      {show && Platform.OS === "android" ? (
        <DateTimePicker
          value={dateValue(value)}
          mode="date"
          onChange={(event, selected) => {
            setShow(false);
            if (event.type === "dismissed" || !selected) return;
            onChange(localIso(selected));
          }}
        />
      ) : null}
      {show && Platform.OS === "ios" ? (
        <View style={{ gap: 8, marginTop: 8 }}>
          <DateTimePicker
            value={dateValue(value)}
            mode="date"
            display="spinner"
            onChange={(_event, selected) => {
              if (selected) onChange(localIso(selected));
            }}
          />
          <Button label="Done" onPress={() => setShow(false)} />
        </View>
      ) : null}
    </View>
  );
}

function dateValue(stored: string): Date {
  const iso = toIsoDate(stored);
  if (!iso) return new Date();
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function localIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const courseCard = { ...card, gap: space.md } as const;

const dateButton = {
  flex: 1,
  minHeight: 48,
  borderRadius: radius.md,
  backgroundColor: colors.paper,
  justifyContent: "center" as const,
  paddingHorizontal: space.md,
};

const backdrop = {
  flex: 1,
  backgroundColor: "rgba(26,26,24,0.35)",
  justifyContent: "center" as const,
  padding: 24,
};

const dialog = {
  backgroundColor: colors.surface,
  borderRadius: 12,
  padding: 16,
  gap: 12,
};

const dateInput = {
  width: "100%",
  minHeight: 40,
  borderRadius: 8,
  border: `1px solid ${colors.line}`,
  padding: "8px 10px",
  fontSize: 14,
  background: "#fff",
  boxSizing: "border-box" as const,
};
