import {
  DEFAULT_PIN,
  effectiveRole,
  pinError,
  syntheticEmail,
  todayIso,
  type AppRole,
  type StoredRole,
} from "./roles";

const STORAGE_KEY = "routine-naem-mock-auth";

type MockTeacher = {
  id: string;
  name: string;
  authUserId: string | null;
  username: string | null;
  pin: string;
  designation: string;
  role: StoredRole;
  roleStart: string | null;
  roleEnd: string | null;
};

type MockDb = {
  teachers: MockTeacher[];
  sessionUserId: string | null;
};

export type SessionView = {
  userId: string;
  username: string;
  email: string;
  teacherId: string;
  teacherName: string;
  role: AppRole;
  storedRole: StoredRole;
  roleStart: string | null;
  roleEnd: string | null;
};

export type DirectoryRow = {
  teacherId: string;
  teacherName: string;
  designation?: string;
  username: string | null;
  storedRole: StoredRole;
  role: AppRole;
  roleStart: string | null;
  roleEnd: string | null;
};

const previewTeachers = [
  "Prof. Asisul",
  "Md. Sazzad Ali",
  "Muhammad Yeakub Ali",
  "Mst. Arifa Tazrimin",
  "Md. Jahangir Alom",
  "Prof. Rukhshana",
  "Prof. Nilufar",
  "Ms. Ayesa",
  "Mr. S. Mahbub",
  "Dr. Rahman",
  "Mr. M. Ali",
  "Mr. Ariful",
  "Dr. Nuruzzaman",
  "Ms. Zinan",
  "Ms. Arifa",
  "Dr. Ayet",
  "Dr. Litan Kanti Halder",
];

const memoryStore = new Map<string, string>();

function storageGet(key: string): string | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage.getItem(key);
  } catch {
    // Node tests and private windows fall through to memory.
  }
  return memoryStore.get(key) ?? null;
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
  memoryStore.set(key, value);
}

function storageRemove(key: string) {
  try {
    if (typeof localStorage !== "undefined") localStorage.removeItem(key);
  } catch {
    // Fall through.
  }
  memoryStore.delete(key);
}

function seedTeachers(): MockTeacher[] {
  const rows: MockTeacher[] = previewTeachers.map((name, index) => ({
    id: `teacher-${index + 1}`,
    name,
    authUserId: `user-teacher-${index + 1}`,
    username: `teacher-${index + 1}`,
    pin: DEFAULT_PIN,
    designation: "",
    role: "teacher" as const,
    roleStart: null,
    roleEnd: null,
  }));
  rows.push({
    id: "superadmin",
    name: "Super Admin",
    authUserId: "user-superadmin",
    username: "superadmin",
    pin: DEFAULT_PIN,
    designation: "",
    role: "super_admin",
    roleStart: null,
    roleEnd: null,
  });
  return rows;
}

function asRole(value: unknown): StoredRole {
  if (value === "super_admin" || value === "coordinator" || value === "temp_coordinator" || value === "teacher") {
    return value;
  }
  return "teacher";
}

function normalizeTeacher(row: Partial<MockTeacher>, index: number): MockTeacher {
  const id = row.id ?? `teacher-${index + 1}`;
  return {
    id,
    name: row.name ?? "Teacher",
    authUserId: row.authUserId ?? `user-${id}`,
    username: row.username ?? id,
    pin: row.pin && /^[0-9]{4}$/.test(row.pin) ? row.pin : DEFAULT_PIN,
    designation: row.designation ?? "",
    role: asRole(row.role),
    roleStart: row.roleStart ?? null,
    roleEnd: row.roleEnd ?? null,
  };
}

function emptyDb(): MockDb {
  return { teachers: seedTeachers(), sessionUserId: null };
}

function readDb(): MockDb {
  try {
    const raw = storageGet(STORAGE_KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as Partial<MockDb>;
    const teachers = Array.isArray(parsed.teachers) ? parsed.teachers.map(normalizeTeacher) : seedTeachers();
    return { teachers, sessionUserId: parsed.sessionUserId ?? null };
  } catch {
    return emptyDb();
  }
}

function writeDb(db: MockDb) {
  storageSet(STORAGE_KEY, JSON.stringify(db));
}

function toSession(teacher: MockTeacher): SessionView {
  const today = todayIso();
  const username = teacher.username ?? teacher.id;
  return {
    userId: teacher.authUserId ?? "",
    username,
    email: syntheticEmail(username),
    teacherId: teacher.id,
    teacherName: teacher.name,
    storedRole: teacher.role,
    role: effectiveRole(teacher.role, teacher.roleStart, teacher.roleEnd, today),
    roleStart: teacher.roleStart,
    roleEnd: teacher.roleEnd,
  };
}

function requireSuperAdmin(db: MockDb): MockTeacher {
  const session = current(db);
  if (!session || session.role !== "super_admin") throw new Error("Only a super admin can change roles.");
  return db.teachers.find((teacher) => teacher.authUserId === session.userId)!;
}

function current(db: MockDb): SessionView | null {
  const teacher = db.teachers.find((row) => row.authUserId && row.authUserId === db.sessionUserId);
  return teacher ? toSession(teacher) : null;
}

export function mockSession(): SessionView | null {
  return current(readDb());
}

export function mockSignOut() {
  const db = readDb();
  db.sessionUserId = null;
  writeDb(db);
}

export function mockSignInTeachers(): { id: string; name: string }[] {
  return readDb()
    .teachers.map((teacher) => ({ id: teacher.id, name: teacher.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function mockSignIn(teacherId: string, pin: string): SessionView {
  const db = readDb();
  const teacher = db.teachers.find((row) => row.id === teacherId);
  if (!teacher) throw new Error("That teacher is not in the list.");
  if (teacher.pin !== pin) throw new Error("That PIN is not correct.");
  db.sessionUserId = teacher.authUserId;
  writeDb(db);
  return toSession(teacher);
}

export function mockChangePin(oldPin: string, newPin: string) {
  const problem = pinError(newPin);
  if (problem) throw new Error(problem);
  if (oldPin === newPin) throw new Error("Choose a different PIN.");
  const db = readDb();
  const session = current(db);
  if (!session) throw new Error("Sign in before changing your PIN.");
  const teacher = db.teachers.find((row) => row.id === session.teacherId);
  if (!teacher) throw new Error("This sign-in is not linked to a teacher.");
  if (teacher.pin !== oldPin) throw new Error("The current PIN is not correct.");
  teacher.pin = newPin;
  writeDb(db);
}

export function mockAdminResetPin(teacherId: string, newPin: string) {
  const problem = pinError(newPin);
  if (problem) throw new Error(problem);
  const db = readDb();
  requireSuperAdmin(db);
  const teacher = db.teachers.find((row) => row.id === teacherId);
  if (!teacher) throw new Error("That teacher is not in the list.");
  teacher.pin = newPin;
  writeDb(db);
}

export function mockDirectory(): DirectoryRow[] {
  const db = readDb();
  requireSuperAdmin(db);
  const today = todayIso();
  return db.teachers.map((teacher) => ({
    teacherId: teacher.id,
    teacherName: teacher.name,
    designation: teacher.designation ?? "",
    username: teacher.username,
    storedRole: teacher.role,
    role: effectiveRole(teacher.role, teacher.roleStart, teacher.roleEnd, today),
    roleStart: teacher.roleStart,
    roleEnd: teacher.roleEnd,
  }));
}

export function mockUpdateTeacher(teacherId: string, patch: { name?: string; designation?: string }) {
  const db = readDb();
  requireSuperAdmin(db);
  const teacher = db.teachers.find((row) => row.id === teacherId);
  if (!teacher) throw new Error("That teacher is not in the list.");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("A teacher needs a name.");
    teacher.name = name;
  }
  if (patch.designation !== undefined) teacher.designation = patch.designation.trim();
  writeDb(db);
}

export function mockAssignRole(
  teacherId: string,
  role: Exclude<StoredRole, "super_admin">,
  roleStart: string | null,
  roleEnd: string | null,
) {
  const db = readDb();
  requireSuperAdmin(db);
  const teacher = db.teachers.find((row) => row.id === teacherId);
  if (!teacher) throw new Error("That teacher is not in the list.");
  if (teacher.role === "super_admin") throw new Error("Change a super admin with promote_super_admin.sql.");
  if (role === "teacher") {
    teacher.role = "teacher";
    teacher.roleStart = null;
    teacher.roleEnd = null;
  } else {
    if (!roleStart || !roleEnd || roleEnd < roleStart) {
      throw new Error("A coordinator needs a start date and an end date.");
    }
    teacher.role = role;
    teacher.roleStart = roleStart;
    teacher.roleEnd = roleEnd;
  }
  writeDb(db);
}

export function mockResetStore() {
  storageRemove(STORAGE_KEY);
}
