import {
  effectiveRole,
  isCoordinationActive,
  normalizeUsername,
  syntheticEmail,
  todayIso,
  usernameError,
  type AppRole,
  type BaseRole,
  type Coordination,
  type CoordinationKind,
} from "./roles";

export type MockTeacher = { id: string; name: string };

export const MOCK_TEACHERS: MockTeacher[] = [
  { id: "teacher-1", name: "Prof. Asisul" },
  { id: "teacher-2", name: "Md. Sazzad Ali" },
  { id: "teacher-3", name: "Muhammad Yeakub Ali" },
  { id: "teacher-4", name: "Mst. Arifa Tazrimin" },
  { id: "teacher-5", name: "Md. Jahangir Alom" },
  { id: "teacher-6", name: "Prof. Rukhshana" },
  { id: "teacher-7", name: "Prof. Nilufar" },
  { id: "teacher-8", name: "Ms. Ayesa" },
  { id: "teacher-9", name: "Mr. S. Mahbub" },
  { id: "teacher-10", name: "Dr. Rahman" },
  { id: "teacher-11", name: "Mr. M. Ali" },
  { id: "teacher-12", name: "Mr. Ariful" },
  { id: "teacher-13", name: "Dr. Nuruzzaman" },
  { id: "teacher-14", name: "Ms. Zinan" },
  { id: "teacher-15", name: "Ms. Arifa" },
  { id: "teacher-16", name: "Dr. Ayet" },
];

export type MockUser = {
  id: string;
  username: string;
  password: string;
  teacherId: string;
  baseRole: BaseRole;
};

type MockDb = {
  users: MockUser[];
  coordinations: Coordination[];
  sessionUserId: string | null;
};

const KEY = "routine-auth-mock-v1";

export type DirectoryRow = {
  teacherId: string;
  teacherName: string;
  username: string | null;
  baseRole: BaseRole | null;
  role: AppRole | null;
  hasPermanent: boolean;
  temporaryUntil: string | null;
};

export type DelegationRow = Coordination & {
  teacherName: string;
  active: boolean;
};

export type SessionView = {
  userId: string;
  username: string;
  email: string;
  teacherId: string;
  teacherName: string;
  baseRole: BaseRole;
  role: AppRole;
};

function emptyDb(): MockDb {
  return { users: [], coordinations: [], sessionUserId: null };
}

function readDb(): MockDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyDb();
    const parsed = JSON.parse(raw) as MockDb;
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      coordinations: Array.isArray(parsed.coordinations) ? parsed.coordinations : [],
      sessionUserId: typeof parsed.sessionUserId === "string" ? parsed.sessionUserId : null,
    };
  } catch {
    return emptyDb();
  }
}

function writeDb(db: MockDb) {
  localStorage.setItem(KEY, JSON.stringify(db));
}

function teacherName(id: string): string {
  return MOCK_TEACHERS.find((teacher) => teacher.id === id)?.name ?? id;
}

function viewFor(db: MockDb, user: MockUser, today = todayIso()): SessionView {
  return {
    userId: user.id,
    username: user.username,
    email: syntheticEmail(user.username),
    teacherId: user.teacherId,
    teacherName: teacherName(user.teacherId),
    baseRole: user.baseRole,
    role: effectiveRole(user.baseRole, user.teacherId, db.coordinations, today),
  };
}

function currentUser(db: MockDb): MockUser | null {
  return db.users.find((user) => user.id === db.sessionUserId) ?? null;
}

function requireEditor(db: MockDb): SessionView {
  const user = currentUser(db);
  if (!user) throw new Error("Sign in first.");
  const session = viewFor(db, user);
  if (session.role === "teacher") throw new Error("Teachers can’t change coordination.");
  return session;
}

export function mockSession(): SessionView | null {
  const db = readDb();
  const user = currentUser(db);
  return user ? viewFor(db, user) : null;
}

export function mockUnclaimed(): MockTeacher[] {
  const taken = new Set(readDb().users.map((user) => user.teacherId));
  return MOCK_TEACHERS.filter((teacher) => !taken.has(teacher.id));
}

export function mockSignUp(input: {
  username: string;
  teacherId: string;
  password: string;
}): { session: SessionView | null; error: string | null } {
  const username = normalizeUsername(input.username);
  const nameError = usernameError(username);
  if (nameError) return { session: null, error: nameError };
  if (input.password.length < 8) return { session: null, error: "Use a password of at least 8 characters." };
  const db = readDb();
  if (db.users.some((user) => user.username === username)) {
    return { session: null, error: "That username is already taken." };
  }
  if (!MOCK_TEACHERS.some((teacher) => teacher.id === input.teacherId)) {
    return { session: null, error: "Choose your name from the teacher list." };
  }
  if (db.users.some((user) => user.teacherId === input.teacherId)) {
    return { session: null, error: "That teacher already has an account." };
  }
  const user: MockUser = {
    id: `user-${db.users.length + 1}`,
    username,
    password: input.password,
    teacherId: input.teacherId,
    baseRole: db.users.length === 0 ? "super_admin" : "teacher",
  };
  db.users.push(user);
  db.sessionUserId = user.id;
  writeDb(db);
  return { session: viewFor(db, user), error: null };
}

export function mockSignIn(usernameRaw: string, password: string): { session: SessionView | null; error: string | null } {
  const username = normalizeUsername(usernameRaw);
  const db = readDb();
  const user = db.users.find((item) => item.username === username && item.password === password);
  if (!user) return { session: null, error: "Unknown username or password." };
  db.sessionUserId = user.id;
  writeDb(db);
  return { session: viewFor(db, user), error: null };
}

export function mockSignOut() {
  const db = readDb();
  db.sessionUserId = null;
  writeDb(db);
}

export function mockDirectory(): DirectoryRow[] {
  const db = readDb();
  requireEditor(db);
  const today = todayIso();
  return MOCK_TEACHERS.map((teacher) => {
    const user = db.users.find((item) => item.teacherId === teacher.id) ?? null;
    const rows = db.coordinations.filter((row) => row.teacherId === teacher.id);
    const permanent = rows.some((row) => isCoordinationActive(row, today) && row.kind === "permanent");
    const temporary = rows
      .filter((row) => isCoordinationActive(row, today) && row.kind === "temporary" && row.endsOn)
      .map((row) => row.endsOn as string)
      .sort()
      .at(-1) ?? null;
    return {
      teacherId: teacher.id,
      teacherName: teacher.name,
      username: user?.username ?? null,
      baseRole: user?.baseRole ?? null,
      role: user ? effectiveRole(user.baseRole, user.teacherId, db.coordinations, today) : null,
      hasPermanent: permanent,
      temporaryUntil: temporary,
    };
  });
}

export function mockDelegations(): DelegationRow[] {
  const db = readDb();
  requireEditor(db);
  const today = todayIso();
  return db.coordinations
    .filter((row) => !row.revokedAt)
    .map((row) => ({
      ...row,
      teacherName: teacherName(row.teacherId),
      active: isCoordinationActive(row, today),
    }));
}

function addCoordination(teacherId: string, kind: CoordinationKind, startsOn: string | null, endsOn: string | null) {
  const db = readDb();
  const session = requireEditor(db);
  if (teacherId === session.teacherId && kind === "temporary") {
    throw new Error("Choose another teacher.");
  }
  if (!MOCK_TEACHERS.some((teacher) => teacher.id === teacherId)) throw new Error("Unknown teacher.");
  const row: Coordination = {
    id: `coord-${db.coordinations.length + 1}`,
    teacherId,
    grantedBy: session.userId,
    kind,
    startsOn,
    endsOn,
    revokedAt: null,
  };
  db.coordinations.push(row);
  writeDb(db);
}

export function mockAssign(teacherId: string): SessionView | null {
  const db = readDb();
  const session = requireEditor(db);
  if (session.role !== "super_admin") throw new Error("Only a super admin can assign coordinators.");
  const today = todayIso();
  const exists = db.coordinations.some(
    (row) => row.teacherId === teacherId && row.kind === "permanent" && isCoordinationActive(row, today),
  );
  if (!exists) addCoordination(teacherId, "permanent", null, null);
  return mockSession();
}

export function mockRevoke(teacherId: string): SessionView | null {
  const db = readDb();
  const session = requireEditor(db);
  if (session.role !== "super_admin") throw new Error("Only a super admin can end coordination.");
  for (const row of db.coordinations) {
    if (row.teacherId === teacherId && !row.revokedAt) row.revokedAt = new Date().toISOString();
  }
  writeDb(db);
  return mockSession();
}

export function mockTransfer(teacherId: string): SessionView | null {
  const db = readDb();
  const session = requireEditor(db);
  if (teacherId === session.teacherId) throw new Error("Choose another teacher.");
  if (!MOCK_TEACHERS.some((teacher) => teacher.id === teacherId)) throw new Error("Unknown teacher.");
  for (const row of db.coordinations) {
    if (row.teacherId === session.teacherId && row.kind === "permanent" && !row.revokedAt) {
      row.revokedAt = new Date().toISOString();
    }
  }
  const today = todayIso();
  const exists = db.coordinations.some(
    (row) => row.teacherId === teacherId && row.kind === "permanent" && isCoordinationActive(row, today),
  );
  if (!exists) {
    db.coordinations.push({
      id: `coord-${db.coordinations.length + 1}`,
      teacherId,
      grantedBy: session.userId,
      kind: "permanent",
      startsOn: null,
      endsOn: null,
      revokedAt: null,
    });
  }
  writeDb(db);
  return mockSession();
}

export function mockDelegate(teacherId: string, startsOn: string, endsOn: string): SessionView | null {
  if (!startsOn || !endsOn || endsOn < startsOn) throw new Error("Choose a start and end date.");
  addCoordination(teacherId, "temporary", startsOn, endsOn);
  return mockSession();
}

export function mockCancel(id: string): SessionView | null {
  const db = readDb();
  const session = requireEditor(db);
  const row = db.coordinations.find((item) => item.id === id && !item.revokedAt);
  if (!row) throw new Error("That delegation is already closed.");
  if (session.role !== "super_admin" && row.grantedBy !== session.userId) {
    throw new Error("You can only cancel a delegation you created.");
  }
  row.revokedAt = new Date().toISOString();
  writeDb(db);
  return mockSession();
}
