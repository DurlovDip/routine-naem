import {
  effectiveRole,
  normalizeUsername,
  syntheticEmail,
  todayIso,
  usernameError,
  type AppRole,
  type StoredRole,
} from "./roles";

const STORAGE_KEY = "routine-naem-mock-auth";

type MockTeacher = {
  id: string;
  name: string;
  authUserId: string | null;
  username: string | null;
  password: string | null;
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
];

function seedTeachers(): MockTeacher[] {
  return previewTeachers.map((name, index) => ({
    id: `teacher-${index + 1}`,
    name,
    authUserId: null,
    username: null,
    password: null,
    role: "teacher" as const,
    roleStart: null,
    roleEnd: null,
  }));
}

function emptyDb(): MockDb {
  return { teachers: seedTeachers(), sessionUserId: null };
}

function readDb(): MockDb {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as Partial<MockDb>;
    const teachers = Array.isArray(parsed.teachers) ? parsed.teachers : seedTeachers();
    return { teachers, sessionUserId: parsed.sessionUserId ?? null };
  } catch {
    return emptyDb();
  }
}

function writeDb(db: MockDb) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function toSession(teacher: MockTeacher): SessionView {
  const today = todayIso();
  return {
    userId: teacher.authUserId ?? "",
    username: teacher.username ?? "",
    email: syntheticEmail(teacher.username ?? ""),
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

export function mockUnclaimed(): { id: string; name: string }[] {
  return readDb()
    .teachers.filter((teacher) => !teacher.authUserId)
    .map((teacher) => ({ id: teacher.id, name: teacher.name }));
}

export function mockSignUp(input: { username: string; teacherId: string; password: string }): SessionView {
  const username = normalizeUsername(input.username);
  const problem = usernameError(username);
  if (problem) throw new Error(problem);
  if (input.password.length < 6) throw new Error("Use at least 6 characters for the password.");
  const db = readDb();
  if (db.teachers.some((teacher) => teacher.username === username)) throw new Error("That username is already taken.");
  const teacher = db.teachers.find((row) => row.id === input.teacherId);
  if (!teacher) throw new Error("Pick a teacher from the list.");
  if (teacher.authUserId) throw new Error("That teacher already has an account.");
  const first = !db.teachers.some((row) => row.authUserId);
  teacher.authUserId = `user-${username}`;
  teacher.username = username;
  teacher.password = input.password;
  if (first) {
    teacher.role = "super_admin";
    teacher.roleStart = null;
    teacher.roleEnd = null;
  }
  db.sessionUserId = teacher.authUserId;
  writeDb(db);
  return toSession(teacher);
}

export function mockSignIn(username: string, password: string): SessionView {
  const norm = normalizeUsername(username);
  if (norm === "superadmin") {
    if (password === "19521971") {
      return {
        userId: "hardcoded-superadmin",
        username: "superadmin",
        email: "superadmin@routine.local",
        teacherId: "superadmin",
        teacherName: "Super Admin",
        role: "super_admin",
        storedRole: "super_admin",
        roleStart: null,
        roleEnd: null,
      };
    }
    throw new Error("Incorrect password for superadmin.");
  }
  const db = readDb();
  const teacher = db.teachers.find((row) => row.username === norm);
  if (!teacher || teacher.password !== password) throw new Error("Username or password is incorrect.");
  db.sessionUserId = teacher.authUserId;
  writeDb(db);
  return toSession(teacher);
}

export function mockDirectory(): DirectoryRow[] {
  const db = readDb();
  requireSuperAdmin(db);
  const today = todayIso();
  return db.teachers.map((teacher) => ({
    teacherId: teacher.id,
    teacherName: teacher.name,
    username: teacher.username,
    storedRole: teacher.role,
    role: effectiveRole(teacher.role, teacher.roleStart, teacher.roleEnd, today),
    roleStart: teacher.roleStart,
    roleEnd: teacher.roleEnd,
  }));
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
