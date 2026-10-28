import type { AppRole } from "./roles";

export type CourseStatus = "active" | "inactive" | "ended";

export type CourseSummary = {
  id: string;
  name: string;
  code: string | null;
  status: CourseStatus;
  startDate: string | null;
  endDate: string | null;
  scheduleId: string;
  /** Null only for the pre-migration shim that still reads schedules.id = default. */
  courseId: string | null;
  canEdit: boolean;
  updatedAt: string;
};

export type CourseAssignment = {
  teacherId: string;
  courseId: string;
  role: "coordinator" | "temp_coordinator";
  roleStart: string;
  roleEnd: string;
};

export type CourseDraft = {
  name: string;
  code: string | null;
  status: CourseStatus;
  startDate: string | null;
  endDate: string | null;
};

export const LEGACY_COURSE_ID = "legacy-default";

const STATUSES: CourseStatus[] = ["active", "inactive", "ended"];

export function isCourseStatus(value: string): value is CourseStatus {
  return STATUSES.includes(value as CourseStatus);
}

export function courseStatusLabel(status: CourseStatus): string {
  if (status === "active") return "Active";
  if (status === "inactive") return "Inactive";
  return "Ended";
}

export function courseOptionLabel(course: Pick<CourseSummary, "name" | "code" | "status">): string {
  const code = course.code ? ` (${course.code})` : "";
  return `${course.name}${code} · ${courseStatusLabel(course.status)}`;
}

export function missingCoursesRpc(message: string): boolean {
  return /my_courses|schema cache|PGRST202|could not find the function|42883/i.test(message);
}

export function legacyCourse(canEdit: boolean, updatedAt = "1970-01-01T00:00:00.000Z"): CourseSummary {
  return {
    id: LEGACY_COURSE_ID,
    name: "Current routine",
    code: null,
    status: "active",
    startDate: null,
    endDate: null,
    scheduleId: "default",
    courseId: null,
    canEdit,
    updatedAt,
  };
}

export function courseFromRow(row: {
  id?: unknown;
  name?: unknown;
  code?: unknown;
  status?: unknown;
  start_date?: unknown;
  end_date?: unknown;
  schedule_id?: unknown;
  can_edit?: unknown;
  updated_at?: unknown;
}): CourseSummary | null {
  if (typeof row.id !== "string" || typeof row.name !== "string" || typeof row.status !== "string") return null;
  if (!isCourseStatus(row.status) || typeof row.schedule_id !== "string") return null;
  return {
    id: row.id,
    name: row.name,
    code: typeof row.code === "string" && row.code.trim() ? row.code : null,
    status: row.status,
    startDate: row.start_date ? String(row.start_date).slice(0, 10) : null,
    endDate: row.end_date ? String(row.end_date).slice(0, 10) : null,
    scheduleId: row.schedule_id,
    courseId: row.id,
    canEdit: Boolean(row.can_edit),
    updatedAt: row.updated_at ? String(row.updated_at) : "1970-01-01T00:00:00.000Z",
  };
}

/** Saved choice, otherwise the only course, otherwise the newest active course. */
export function pickDefaultCourse(courses: CourseSummary[], preferredId: string | null): CourseSummary | null {
  if (courses.length === 0) return null;
  if (preferredId) {
    const preferred = courses.find((course) => course.id === preferredId);
    if (preferred) return preferred;
  }
  if (courses.length === 1) return courses[0];
  const active = courses.filter((course) => course.status === "active");
  const pool = active.length > 0 ? active : courses;
  return [...pool].sort((a, b) => {
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
    return a.name.localeCompare(b.name);
  })[0];
}

export function coursesForViewer(
  courses: CourseSummary[],
  role: AppRole,
  teacherId: string,
  assignments: CourseAssignment[],
  today: string,
): CourseSummary[] {
  if (role === "super_admin") {
    return courses.map((course) => ({ ...course, canEdit: true }));
  }
  if (role === "coordinator" || role === "temp_coordinator") {
    return courses.flatMap((course) => {
      const assignment = assignments.find((row) => row.teacherId === teacherId && row.courseId === course.id);
      if (!assignment) return [];
      const inWindow = assignment.roleStart <= today && today <= assignment.roleEnd;
      return [{ ...course, canEdit: course.status === "active" && inWindow }];
    });
  }
  return courses
    .filter((course) => course.status === "active" || course.status === "ended")
    .map((course) => ({ ...course, canEdit: false }));
}

type Titled = {
  header: Array<{ id: string; text: string; style: string }>;
  footer: { courseName?: string; lines: string[] };
};

/** Point the printed title and footer course line at the selected course. */
export function withCourseTitle<T extends Titled>(state: T, name: string): T {
  const hasTitle = state.header.some((line) => line.style === "title");
  const header = hasTitle
    ? state.header.map((line) => (line.style === "title" ? { ...line, text: name } : line))
    : state.header.map((line, index) => (index === 0 ? { ...line, text: name } : line));
  const lines = [...state.footer.lines];
  if (lines.length >= 2) lines[1] = name;
  else lines.push(name);
  return {
    ...state,
    header,
    footer: { ...state.footer, courseName: name, lines },
  };
}

export function screenshotCatalog(): CourseSummary[] {
  return [
    {
      id: "course-acsd",
      name: "Advanced Course on Skill Development",
      code: "ACSD",
      status: "active",
      startDate: "2026-10-01",
      endDate: "2026-12-31",
      scheduleId: "default",
      courseId: "course-acsd",
      canEdit: false,
      updatedAt: "2026-10-22T12:00:00.000Z",
    },
    {
      id: "course-foundation",
      name: "Foundation Course",
      code: "FOUND",
      status: "active",
      startDate: "2026-09-01",
      endDate: null,
      scheduleId: "course-foundation",
      courseId: "course-foundation",
      canEdit: false,
      updatedAt: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "course-ended",
      name: "Previous Skill Course",
      code: null,
      status: "ended",
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      scheduleId: "course-ended",
      courseId: "course-ended",
      canEdit: false,
      updatedAt: "2026-03-31T00:00:00.000Z",
    },
    {
      id: "course-paused",
      name: "Paused Workshop",
      code: null,
      status: "inactive",
      startDate: null,
      endDate: null,
      scheduleId: "course-paused",
      courseId: "course-paused",
      canEdit: false,
      updatedAt: "2026-08-01T00:00:00.000Z",
    },
  ];
}

export function screenshotCourses(role: AppRole, today = "2026-10-22"): CourseSummary[] {
  const assignments: CourseAssignment[] =
    role === "coordinator" || role === "temp_coordinator"
      ? [
          {
            teacherId: "screenshot",
            courseId: "course-acsd",
            role: role === "temp_coordinator" ? "temp_coordinator" : "coordinator",
            roleStart: "2026-01-01",
            roleEnd: "2026-12-31",
          },
          {
            teacherId: "screenshot",
            courseId: "course-foundation",
            role: role === "temp_coordinator" ? "temp_coordinator" : "coordinator",
            roleStart: "2026-01-01",
            roleEnd: "2026-12-31",
          },
        ]
      : [];
  return coursesForViewer(screenshotCatalog(), role, "screenshot", assignments, today);
}
