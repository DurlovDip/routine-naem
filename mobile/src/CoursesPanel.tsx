import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { createElement, useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useAccess, useAuth, type DirectoryRow } from "./auth";
import { useCourses } from "./courses";
import { courseStatusLabel, isCourseStatus, type CourseAssignment, type CourseDraft, type CourseStatus, type CourseSummary } from "./lib/courses";
import { formatSlashDate, todayInDhaka, toIsoDate } from "./lib/time";
import { card, colors, radius, shadow, space } from "./theme";
import { Button, Field, Label, Segmented, Select, T } from "./ui";

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
  const auth = useAuth();
  const access = useAccess();
  const isSuperAdmin = access.role === "super_admin";
  const { courses, createCourse, updateCourse, selectCourse, selected, reload: reloadCourses } = useCourses();
  const [filter, setFilter] = useState<Filter>("all");
  const [draft, setDraft] = useState<CourseDraft>(draftFrom());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endPrompt, setEndPrompt] = useState<EndPrompt | null>(null);
  const [teachers, setTeachers] = useState<DirectoryRow[]>([]);
  const [assignments, setAssignments] = useState<CourseAssignment[]>([]);
  const [editingCourse, setEditingCourse] = useState<CourseSummary | null>(null);
  const shown = filter === "all" ? courses : courses.filter((course) => course.status === filter);

  async function loadDirectoryAndAssignments() {
    try {
      const [t, a] = await Promise.all([auth.directory(), auth.courseAssignments()]);
      setTeachers(t);
      setAssignments(a);
    } catch {
      // offline / mock support
    }
  }

  useEffect(() => {
    void loadDirectoryAndAssignments();
  }, []);

  async function handleAssignCoordinator(courseId: string, teacherId: string) {
    const course = courses.find((c) => c.id === courseId);
    const start = course?.startDate || todayInDhaka();
    const end = course?.endDate || "2099-12-31";
    const msg = await auth.assignCourseRole(teacherId, "coordinator", start, end, courseId);
    if (msg) {
      setError(msg);
    } else {
      setError(null);
      await loadDirectoryAndAssignments();
      await reloadCourses();
    }
  }

  async function handleRemoveCoordinator(courseId: string, teacherId: string) {
    const msg = await auth.assignCourseRole(teacherId, "teacher", null, null, courseId);
    if (msg) {
      setError(msg);
    } else {
      setError(null);
      await loadDirectoryAndAssignments();
      await reloadCourses();
    }
  }

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

      <Segmented
        label="Course status"
        value={filter}
        onChange={setFilter}
        options={FILTERS.map((item) => ({ value: item, label: item === "all" ? "All" : courseStatusLabel(item) }))}
      />

      <T weight="semibold" style={{ fontSize: 13, color: colors.ink, marginTop: 4 }}>
        Courses catalog ({shown.length})
      </T>

      {shown.length === 0 ? <T style={{ color: colors.muted, fontSize: 12 }}>No courses in this filter.</T> : null}
      <View testID="course-list" style={{ gap: 10 }}>
        {shown.map((course) => (
          <MinimizedCourseRow
            key={`${course.id}:${course.updatedAt}`}
            course={course}
            current={course.id === selected?.id}
            canEdit={isSuperAdmin}
            teachers={teachers}
            assignments={assignments}
            onPress={() => setEditingCourse(course)}
            onEdit={() => setEditingCourse(course)}
          />
        ))}
      </View>
    </ScrollView>

      <EditCourseModal
        course={editingCourse}
        visible={editingCourse !== null}
        isSuperAdmin={isSuperAdmin}
        current={editingCourse?.id === selected?.id}
        teachers={teachers}
        assignments={assignments}
        onClose={() => setEditingCourse(null)}
        confirmEnded={confirmEnded}
        onOpen={() => {
          if (editingCourse) {
            selectCourse(editingCourse.id);
            setEditingCourse(null);
            router.push("/(main)/routine");
          }
        }}
        onSave={async (next) => {
          if (!editingCourse) return null;
          const message = await updateCourse(editingCourse.id, clean(next));
          setError(message);
          if (!message) {
            await reloadCourses();
          }
          return message;
        }}
        onAssignCoordinator={handleAssignCoordinator}
        onRemoveCoordinator={handleRemoveCoordinator}
      />
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

function MinimizedCourseRow({
  course,
  current,
  canEdit,
  assignments,
  teachers,
  onPress,
  onEdit,
}: {
  course: CourseSummary;
  current: boolean;
  canEdit: boolean;
  assignments: CourseAssignment[];
  teachers: DirectoryRow[];
  onPress: () => void;
  onEdit: () => void;
}) {
  const coords = assignments
    .filter((a) => a.courseId === course.id && (a.role === "coordinator" || a.role === "temp_coordinator"))
    .map((a) => {
      const teacher = teachers.find((t) => t.teacherId === a.teacherId);
      return teacher?.teacherName || a.teacherId;
    });

  const dateRange =
    course.startDate && course.endDate
      ? `${formatSlashDate(course.startDate)} - ${formatSlashDate(course.endDate)}`
      : course.startDate
        ? `Starts ${formatSlashDate(course.startDate)}`
        : "";

  return (
    <Pressable
      testID={`course-card-${course.id}`}
      accessibilityRole="button"
      accessibilityLabel={`Course ${course.name}`}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: current ? colors.accent : colors.line,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={{ flex: 1, marginRight: 8, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <T weight="semibold" style={{ fontSize: 15, color: colors.ink }}>
            {course.name}
          </T>
          {course.code ? (
            <View style={{ backgroundColor: colors.paper, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 }}>
              <T style={{ fontSize: 11, color: colors.muted }}>{course.code}</T>
            </View>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <StatusBadge status={course.status} open={current} />
          {dateRange ? (
            <T style={{ color: colors.muted, fontSize: 12 }}>{dateRange}</T>
          ) : null}
          {coords.length > 0 ? (
            <T style={{ color: colors.muted, fontSize: 12 }}>
              · {coords.length === 1 ? coords[0] : `${coords.length} coordinators`}
            </T>
          ) : null}
        </View>
      </View>

      <Pressable
        testID={`edit-course-${course.id}`}
        accessibilityLabel={`Edit ${course.name}`}
        hitSlop={8}
        onPress={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        style={({ pressed }) => [
          {
            width: 36,
            height: 36,
            borderRadius: radius.md,
            backgroundColor: colors.paper,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.7 : 1,
          },
        ]}
      >
        <Ionicons name="pencil" size={16} color={colors.ink} />
      </Pressable>
    </Pressable>
  );
}

function EditCourseModal({
  course,
  visible,
  isSuperAdmin,
  current,
  teachers,
  assignments,
  onClose,
  confirmEnded,
  onOpen,
  onSave,
  onAssignCoordinator,
  onRemoveCoordinator,
}: {
  course: CourseSummary | null;
  visible: boolean;
  isSuperAdmin: boolean;
  current: boolean;
  teachers: DirectoryRow[];
  assignments: CourseAssignment[];
  onClose: () => void;
  confirmEnded: (name: string) => Promise<boolean>;
  onOpen: () => void;
  onSave: (draft: CourseDraft) => Promise<string | null>;
  onAssignCoordinator: (courseId: string, teacherId: string) => Promise<void>;
  onRemoveCoordinator: (courseId: string, teacherId: string) => Promise<void>;
}) {
  const [draft, setDraft] = useState<CourseDraft>(() => draftFrom(course ?? undefined));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (course && visible) {
      setDraft(draftFrom(course));
      setError(null);
      setBusy(false);
    }
  }, [course, visible]);

  if (!course || !visible) return null;

  const courseCoords = assignments
    .filter((a) => a.courseId === course.id && (a.role === "coordinator" || a.role === "temp_coordinator"))
    .map((a) => {
      const teacher = teachers.find((t) => t.teacherId === a.teacherId);
      return {
        teacherId: a.teacherId,
        name: teacher?.teacherName || a.teacherId,
      };
    });

  const availableTeachers = teachers.filter(
    (t) => !courseCoords.some((c) => c.teacherId === t.teacherId),
  );

  async function handleSave() {
    if (!course) return;
    if (!draft.name.trim()) {
      setError("Course name cannot be empty.");
      return;
    }
    if (draft.status === "ended" && course.status !== "ended") {
      const ok = await confirmEnded(draft.name.trim() || course.name);
      if (!ok) return;
    }
    setBusy(true);
    setError(null);
    const message = await onSave(draft);
    setBusy(false);
    if (message) {
      setError(message);
    } else {
      onClose();
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <Pressable style={Platform.OS === "web" ? undefined : backdropDismiss} onPress={onClose} />
        <View style={modalCard}>
          <ScrollView contentContainerStyle={{ gap: space.md }} keyboardShouldPersistTaps="handled">
            {/* Header */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T weight="bold" style={{ fontSize: 17, color: colors.ink }}>
                  {isSuperAdmin ? "Edit course" : "Course details"}
                </T>
                <T style={{ color: colors.muted, fontSize: 12 }}>
                  {isSuperAdmin
                    ? "Update course name, dates, status, and coordinators."
                    : "Super admin permission required to edit course details."}
                </T>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <StatusBadge status={draft.status} open={current} />
                <Pressable hitSlop={8} onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}>
                  <Ionicons name="close" size={22} color={colors.muted} />
                </Pressable>
              </View>
            </View>

            {error ? <T style={{ color: colors.danger, fontSize: 13 }}>{error}</T> : null}

            {/* Name */}
            <View>
              <Label>Name</Label>
              <Field
                accessibilityLabel={`Name for ${course.name}`}
                value={draft.name}
                onChangeText={(name) => isSuperAdmin && setDraft({ ...draft, name })}
                editable={isSuperAdmin}
                autoCapitalize="words"
              />
            </View>

            {/* Short name */}
            <View>
              <Label>Short name</Label>
              <Field
                accessibilityLabel={`Short name for ${course.name}`}
                value={draft.code ?? ""}
                onChangeText={(code) => isSuperAdmin && setDraft({ ...draft, code })}
                editable={isSuperAdmin}
                autoCapitalize="characters"
              />
            </View>

            {/* Starts */}
            <DateField
              label="Starts"
              accessibilityLabel={`Start for ${course.name}`}
              value={draft.startDate ?? ""}
              onChange={(startDate) => isSuperAdmin && setDraft({ ...draft, startDate })}
              disabled={!isSuperAdmin}
            />

            {/* Ends */}
            <DateField
              label="Ends"
              accessibilityLabel={`End for ${course.name}`}
              value={draft.endDate ?? ""}
              onChange={(endDate) => isSuperAdmin && setDraft({ ...draft, endDate })}
              disabled={!isSuperAdmin}
            />

            {/* Status */}
            <View>
              <Label>Status</Label>
              {isSuperAdmin ? (
                <Segmented
                  label={`Status for ${course.name}`}
                  value={draft.status}
                  onChange={(status) => {
                    if (isCourseStatus(status)) setDraft({ ...draft, status });
                  }}
                  options={STATUSES.map((status) => ({ value: status, label: courseStatusLabel(status) }))}
                />
              ) : (
                <Field value={courseStatusLabel(draft.status)} editable={false} />
              )}
            </View>

            {/* Coordinators */}
            <View style={{ gap: 6 }}>
              <Label>Coordinators</Label>
              {courseCoords.length > 0 ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {courseCoords.map((coord) => (
                    <View
                      key={coord.teacherId}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        backgroundColor: colors.paper,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: colors.line,
                        paddingVertical: 4,
                        paddingLeft: 10,
                        paddingRight: isSuperAdmin ? 6 : 10,
                        gap: 4,
                      }}
                    >
                      <T weight="medium" style={{ fontSize: 13, color: colors.ink }}>
                        {coord.name}
                      </T>
                      {isSuperAdmin ? (
                        <Pressable
                          accessibilityLabel={`Remove ${coord.name} as coordinator`}
                          hitSlop={8}
                          onPress={() => void onRemoveCoordinator(course.id, coord.teacherId)}
                          style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
                        >
                          <Ionicons name="close-circle" size={16} color={colors.muted} />
                        </Pressable>
                      ) : null}
                    </View>
                  ))}
                </View>
              ) : (
                <T style={{ color: colors.muted, fontSize: 12 }}>No coordinators assigned yet.</T>
              )}

              {isSuperAdmin && availableTeachers.length > 0 ? (
                <View style={{ marginTop: 4 }}>
                  <Select
                    label={`Add coordinator to ${course.name}`}
                    value=""
                    options={availableTeachers.map((t) => t.teacherName)}
                    placeholder="+ Add coordinator"
                    allowEmpty={false}
                    onChange={(teacherName) => {
                      const matched = availableTeachers.find((t) => t.teacherName === teacherName);
                      if (matched) {
                        void onAssignCoordinator(course.id, matched.teacherId);
                      }
                    }}
                  />
                </View>
              ) : null}
            </View>

            {/* Actions */}
            <View style={{ gap: 8, marginTop: 8 }}>
              {isSuperAdmin ? (
                <Button
                  label={busy ? "Saving…" : "Save course"}
                  tone="primary"
                  disabled={busy || !draft.name.trim()}
                  onPress={() => void handleSave()}
                />
              ) : null}
              <Button label="Open routine" onPress={onOpen} />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
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
  disabled,
}: {
  label: string;
  accessibilityLabel: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
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
          onChange: (event: Event) => !disabled && onChange((event.target as HTMLInputElement).value),
          disabled: Boolean(disabled),
          style: { ...dateInput, ...(disabled ? { opacity: 0.7, cursor: "not-allowed" } : {}) },
        })
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            disabled={disabled}
            onPress={() => !disabled && setShow(true)}
            style={[dateButton, disabled && { opacity: 0.7 }]}
          >
            <T style={{ color: value ? colors.ink : colors.muted }}>{value ? formatSlashDate(value) : "Choose date"}</T>
          </Pressable>
          {value && !disabled ? <Button small tone="quiet" label="Clear" onPress={() => onChange("")} accessibilityLabel={`Clear ${label}`} /> : null}
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

const courseCard = { ...card, borderWidth: 1, borderColor: colors.line, gap: space.md } as const;

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
  backgroundColor: "rgba(26,26,24,0.45)",
  justifyContent: "center" as const,
  padding: 20,
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
  padding: space.lg,
  maxHeight: "90%",
  width: "100%",
  maxWidth: 500,
  alignSelf: "center" as const,
  ...shadow,
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
