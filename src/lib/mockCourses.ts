import {
  coursesForViewer,
  screenshotCatalog,
  type CourseAssignment,
  type CourseDraft,
  type CourseStatus,
  type CourseSummary,
} from "./courses";
import { todayIso, type AppRole } from "./roles";

const KEY = "routine-naem-mock-courses";

type MockCourseDb = {
  courses: CourseSummary[];
  assignments: CourseAssignment[];
};

const memory = new Map<string, string>();

function storageGet(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {
    // Node tests fall through.
  }
  return memory.get(key) ?? null;
}

function storageSet(key: string, value: string) {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(key, value);
      return;
    }
  } catch {
    // Fall through.
  }
  memory.set(key, value);
}

function storageRemove(key: string) {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    // Fall through.
  }
  memory.delete(key);
}

function seed(): MockCourseDb {
  return { courses: screenshotCatalog(), assignments: [] };
}

function readDb(): MockCourseDb {
  try {
    const raw = storageGet(KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as Partial<MockCourseDb>;
    const courses = Array.isArray(parsed.courses) && parsed.courses.length > 0 ? parsed.courses : screenshotCatalog();
    const assignments = Array.isArray(parsed.assignments) ? parsed.assignments : [];
    return { courses, assignments };
  } catch {
    return seed();
  }
}

function writeDb(db: MockCourseDb) {
  storageSet(KEY, JSON.stringify(db));
}

export function mockResetCourses() {
  storageRemove(KEY);
}

export function mockVisibleCourses(role: AppRole, teacherId: string, today = todayIso()): CourseSummary[] {
  const db = readDb();
  return coursesForViewer(db.courses, role, teacherId, db.assignments, today);
}

export function mockAllCourses(): CourseSummary[] {
  return readDb().courses;
}

export function mockCourseAssignments(): CourseAssignment[] {
  return readDb().assignments;
}

export function mockCreateCourse(draft: CourseDraft): CourseSummary {
  const name = draft.name.trim();
  if (!name) throw new Error("A course needs a name.");
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
    throw new Error("The end date cannot be before the start date.");
  }
  const db = readDb();
  const id = `course-${db.courses.length + 1}-${Date.now()}`;
  const course: CourseSummary = {
    id,
    name,
    code: draft.code?.trim() ? draft.code.trim() : null,
    status: draft.status,
    startDate: draft.startDate,
    endDate: draft.endDate,
    scheduleId: id,
    courseId: id,
    canEdit: true,
    updatedAt: new Date().toISOString(),
  };
  db.courses = [course, ...db.courses];
  writeDb(db);
  return course;
}

export function mockUpdateCourse(id: string, draft: CourseDraft): void {
  const name = draft.name.trim();
  if (!name) throw new Error("A course needs a name.");
  if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
    throw new Error("The end date cannot be before the start date.");
  }
  const db = readDb();
  const course = db.courses.find((row) => row.id === id);
  if (!course) throw new Error("That course is not in the list.");
  course.name = name;
  course.code = draft.code?.trim() ? draft.code.trim() : null;
  course.status = draft.status;
  course.startDate = draft.startDate;
  course.endDate = draft.endDate;
  course.updatedAt = new Date().toISOString();
  writeDb(db);
}

export function mockAssignCourse(
  teacherId: string,
  role: "teacher" | "coordinator" | "temp_coordinator",
  roleStart: string | null,
  roleEnd: string | null,
  courseId: string | null,
) {
  const db = readDb();
  if (role === "teacher") {
    db.assignments = courseId
      ? db.assignments.filter((row) => !(row.teacherId === teacherId && row.courseId === courseId))
      : db.assignments.filter((row) => row.teacherId !== teacherId);
    writeDb(db);
    return;
  }
  if (!courseId || !db.courses.some((course) => course.id === courseId)) {
    throw new Error("Choose a course.");
  }
  if (!roleStart || !roleEnd || roleEnd < roleStart) {
    throw new Error("A coordinator needs a start date and an end date.");
  }
  const next: CourseAssignment = { teacherId, courseId, role, roleStart, roleEnd };
  const index = db.assignments.findIndex((row) => row.teacherId === teacherId && row.courseId === courseId);
  if (index >= 0) db.assignments[index] = next;
  else db.assignments.push(next);
  writeDb(db);
}

export function mockCourseStatus(value: string): CourseStatus {
  if (value === "inactive" || value === "ended" || value === "active") return value;
  return "active";
}
