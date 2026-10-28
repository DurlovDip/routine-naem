import { useEffect, useState } from "react";
import { useAccess, useAuth, type DirectoryRow } from "../auth";
import { useCourses } from "../courses";
import {
  courseStatusLabel,
  isCourseStatus,
  type CourseAssignment,
  type CourseDraft,
  type CourseStatus,
  type CourseSummary,
} from "../lib/courses";
import { formatSlashDate, todayInDhaka, toIsoDate } from "../lib/time";
import { colors } from "../theme";
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

export function CoursesPanel({ onOpenRoutine }: { onOpenRoutine?: () => void }) {
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
    <div className="space-y-4">
      <T style={{ color: colors.muted, fontSize: 13, lineHeight: 1.4 }}>
        Several courses can be active at once. Teachers can read active and ended courses. Inactive courses stay hidden from them.
      </T>

      {/* New Course Card */}
      {isSuperAdmin && (
        <div
          className="p-5 rounded-2xl border space-y-3"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.line,
          }}
        >
          <T weight="semibold" style={{ fontSize: 16, color: colors.ink }}>
            New course
          </T>
          <div>
            <Label>Name</Label>
            <Field
              value={draft.name}
              onChangeText={(name) => setDraft({ ...draft, name })}
              placeholder="Course name"
              autoCapitalize="words"
            />
          </div>

          <div>
            <Label>Short name</Label>
            <Field
              value={draft.code ?? ""}
              onChangeText={(code) => setDraft({ ...draft, code })}
              placeholder="Optional"
              autoCapitalize="characters"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Starts</Label>
              <input
                type="date"
                className="w-full h-11 px-3 rounded-lg text-sm border focus:outline-none"
                style={{
                  backgroundColor: colors.paper,
                  borderColor: colors.line,
                  color: colors.ink,
                }}
                value={toIsoDate(draft.startDate ?? "")}
                onChange={(e) => setDraft({ ...draft, startDate: e.target.value })}
              />
            </div>
            <div>
              <Label>Ends</Label>
              <input
                type="date"
                className="w-full h-11 px-3 rounded-lg text-sm border focus:outline-none"
                style={{
                  backgroundColor: colors.paper,
                  borderColor: colors.line,
                  color: colors.ink,
                }}
                value={toIsoDate(draft.endDate ?? "")}
                onChange={(e) => setDraft({ ...draft, endDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>Status</Label>
            <Segmented
              label="New course status"
              value={draft.status}
              onChange={(status) => {
                if (isCourseStatus(status)) setDraft({ ...draft, status });
              }}
              options={STATUSES.map((status) => ({ value: status, label: courseStatusLabel(status) }))}
            />
          </div>

          <div className="pt-1">
            <Button
              label={busy ? "Saving…" : "Create course"}
              tone="primary"
              disabled={busy || !draft.name.trim()}
              onPress={() => void create()}
            />
          </div>
        </div>
      )}

      {error ? <T style={{ color: colors.danger, fontSize: 13 }}>{error}</T> : null}

      {/* Filter Segmented */}
      <Segmented
        label="Course status"
        value={filter}
        onChange={(val) => setFilter(val as Filter)}
        options={FILTERS.map((item) => ({ value: item, label: item === "all" ? "All" : courseStatusLabel(item) }))}
      />

      <div className="flex items-center justify-between pt-1">
        <T weight="semibold" style={{ fontSize: 14, color: colors.ink }}>
          Courses catalog ({shown.length})
        </T>
      </div>

      {shown.length === 0 ? (
        <T style={{ color: colors.muted, fontSize: 13 }}>No courses in this filter.</T>
      ) : null}

      {/* Course List */}
      <div className="space-y-2">
        {shown.map((course) => (
          <MinimizedCourseRow
            key={`${course.id}:${course.updatedAt}`}
            course={course}
            current={course.id === selected?.id}
            teachers={teachers}
            assignments={assignments}
            onOpen={() => {
              selectCourse(course.id);
              onOpenRoutine?.();
            }}
            onEdit={() => setEditingCourse(course)}
          />
        ))}
      </div>

      {/* Edit Course Modal */}
      {editingCourse && (
        <EditCourseModal
          course={editingCourse}
          isSuperAdmin={isSuperAdmin}
          current={editingCourse.id === selected?.id}
          teachers={teachers}
          assignments={assignments}
          onClose={() => setEditingCourse(null)}
          confirmEnded={confirmEnded}
          onOpen={() => {
            selectCourse(editingCourse.id);
            setEditingCourse(null);
            onOpenRoutine?.();
          }}
          onSave={async (next) => {
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
      )}

      {/* End Course Confirmation Dialog */}
      {endPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(26,26,24,0.45)" }}
        >
          <div
            className="w-full max-w-sm p-6 rounded-2xl shadow-xl space-y-4"
            style={{ backgroundColor: colors.surface }}
          >
            <T weight="semibold" style={{ fontSize: 16, color: colors.ink }}>
              End {endPrompt.name}?
            </T>
            <T style={{ color: colors.muted, fontSize: 13, lineHeight: 1.4 }}>
              Teachers can still read it. Only a super admin can change it after it ends.
            </T>
            <div className="flex justify-end gap-2 pt-2">
              <Button label="Cancel" onPress={() => answerEnd(false)} />
              <Button label="End course" tone="danger" onPress={() => answerEnd(true)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MinimizedCourseRow({
  course,
  current,
  assignments,
  teachers,
  onOpen,
  onEdit,
}: {
  course: CourseSummary;
  current: boolean;
  assignments: CourseAssignment[];
  teachers: DirectoryRow[];
  onOpen: () => void;
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
    <div
      onClick={onOpen}
      className="p-3.5 sm:p-4 rounded-xl border flex items-center justify-between cursor-pointer transition hover:opacity-95"
      style={{
        backgroundColor: colors.surface,
        borderColor: current ? colors.accent : colors.line,
      }}
    >
      <div className="flex-1 mr-3 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <T weight="semibold" style={{ fontSize: 15, color: colors.ink }}>
            {course.name}
          </T>
          {course.code ? (
            <span
              className="px-1.5 py-0.5 rounded text-xs font-mono"
              style={{ backgroundColor: colors.paper, color: colors.muted }}
            >
              {course.code}
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <StatusBadge status={course.status} open={current} />
          {dateRange ? (
            <T style={{ color: colors.muted, fontSize: 12 }}>{dateRange}</T>
          ) : null}
          {coords.length > 0 ? (
            <T style={{ color: colors.muted, fontSize: 12 }}>
              · {coords.length === 1 ? coords[0] : `${coords.length} coordinators`}
            </T>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        aria-label={`Edit ${course.name}`}
        onClick={(e) => {
          e.stopPropagation();
          onEdit();
        }}
        className="w-9 h-9 rounded-lg flex items-center justify-center transition hover:bg-black/5"
        style={{ backgroundColor: colors.paper, color: colors.ink }}
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
      </button>
    </div>
  );
}

function EditCourseModal({
  course,
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
  course: CourseSummary;
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
  const [draft, setDraft] = useState<CourseDraft>(() => draftFrom(course));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(26,26,24,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg p-6 rounded-2xl shadow-xl space-y-4 my-8"
        style={{ backgroundColor: colors.surface }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <T weight="bold" style={{ fontSize: 17, color: colors.ink }}>
              {isSuperAdmin ? "Edit course" : "Course details"}
            </T>
            <T style={{ color: colors.muted, fontSize: 12 }}>
              {isSuperAdmin
                ? "Update course name, dates, status, and coordinators."
                : "Super admin permission required to edit course details."}
            </T>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={draft.status} open={current} />
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-stone-400 hover:text-stone-700 transition"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {error ? <T style={{ color: colors.danger, fontSize: 13 }}>{error}</T> : null}

        {/* Name */}
        <div>
          <Label>Name</Label>
          <Field
            value={draft.name}
            onChangeText={(name) => isSuperAdmin && setDraft({ ...draft, name })}
            readOnly={!isSuperAdmin}
            autoCapitalize="words"
          />
        </div>

        {/* Short name */}
        <div>
          <Label>Short name</Label>
          <Field
            value={draft.code ?? ""}
            onChangeText={(code) => isSuperAdmin && setDraft({ ...draft, code })}
            readOnly={!isSuperAdmin}
            autoCapitalize="characters"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Starts</Label>
            <input
              type="date"
              disabled={!isSuperAdmin}
              className="w-full h-11 px-3 rounded-lg text-sm border focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
              style={{
                backgroundColor: colors.paper,
                borderColor: colors.line,
                color: colors.ink,
              }}
              value={toIsoDate(draft.startDate ?? "")}
              onChange={(e) => isSuperAdmin && setDraft({ ...draft, startDate: e.target.value })}
            />
          </div>
          <div>
            <Label>Ends</Label>
            <input
              type="date"
              disabled={!isSuperAdmin}
              className="w-full h-11 px-3 rounded-lg text-sm border focus:outline-none disabled:opacity-70 disabled:cursor-not-allowed"
              style={{
                backgroundColor: colors.paper,
                borderColor: colors.line,
                color: colors.ink,
              }}
              value={toIsoDate(draft.endDate ?? "")}
              onChange={(e) => isSuperAdmin && setDraft({ ...draft, endDate: e.target.value })}
            />
          </div>
        </div>

        {/* Status */}
        <div>
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
            <Field value={courseStatusLabel(draft.status)} readOnly />
          )}
        </div>

        {/* Coordinators */}
        <div className="space-y-2">
          <Label>Coordinators</Label>
          {courseCoords.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {courseCoords.map((coord) => (
                <div
                  key={coord.teacherId}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-medium"
                  style={{
                    backgroundColor: colors.paper,
                    borderColor: colors.line,
                    color: colors.ink,
                  }}
                >
                  <span>{coord.name}</span>
                  {isSuperAdmin && (
                    <button
                      type="button"
                      aria-label={`Remove ${coord.name} as coordinator`}
                      onClick={() => void onRemoveCoordinator(course.id, coord.teacherId)}
                      className="text-stone-400 hover:text-stone-700"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <T style={{ color: colors.muted, fontSize: 12 }}>No coordinators assigned yet.</T>
          )}

          {isSuperAdmin && availableTeachers.length > 0 && (
            <div className="pt-1">
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
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="pt-2 flex flex-col sm:flex-row justify-end gap-2">
          <Button label="Open routine" onPress={onOpen} />
          {isSuperAdmin && (
            <Button
              label={busy ? "Saving…" : "Save course"}
              tone="primary"
              disabled={busy || !draft.name.trim()}
              onPress={() => void handleSave()}
            />
          )}
        </div>
      </div>
    </div>
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
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold"
      style={{ backgroundColor: palette.backgroundColor, color: palette.color }}
    >
      {courseStatusLabel(status)}
      {open ? " · open" : ""}
    </span>
  );
}
