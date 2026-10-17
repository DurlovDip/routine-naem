import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  mockAssignRole,
  mockDirectory,
  mockSession,
  mockUpdateTeacher,
  mockSignIn,
  mockSignOut,
  mockSignUp,
  mockUnclaimed,
  type DirectoryRow,
  type SessionView,
} from "./lib/mockAuth";
import {
  effectiveRole,
  missingTeacherColumnNotice,
  normalizeUsername,
  syntheticEmail,
  todayIso,
  usernameError,
  type StoredRole,
} from "./lib/roles";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

export const isAuthMock = import.meta.env.VITE_AUTH_MOCK === "true";
export const authRequired = isAuthMock || import.meta.env.VITE_AUTH_REQUIRED === "true";

type AuthValue = {
  required: boolean;
  mock: boolean;
  ready: boolean;
  session: SessionView | null;
  setupError: string | null;
  signIn: (username: string, password: string) => Promise<string | null>;
  signUp: (input: { username: string; teacherId: string; password: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
  unclaimedTeachers: () => Promise<{ id: string; name: string }[]>;
  directory: () => Promise<{ rows: DirectoryRow[]; notice: string | null }>;
  updateTeacher: (
    teacherId: string,
    patch: { name?: string; designation?: string },
  ) => Promise<string | null>;
  assignRole: (
    teacherId: string,
    role: Exclude<StoredRole, "super_admin">,
    roleStart: string | null,
    roleEnd: string | null,
  ) => Promise<string | null>;
};

const AuthContext = createContext<AuthValue | null>(null);

function rpcError(error: { message: string } | null): string | null {
  return error ? error.message : null;
}

function basicTeacherRows(
  teachers: Array<{ id: string; name: string; designation?: string | null }>,
): DirectoryRow[] {
  return teachers.map((teacher) => ({
    teacherId: teacher.id,
    teacherName: teacher.name,
    designation: teacher.designation ?? "",
    username: null,
    storedRole: "teacher",
    role: "teacher",
    roleStart: null,
    roleEnd: null,
  }));
}

type TeacherAccountRow = {
  id: string;
  name: string;
  username?: string | null;
  role?: string | null;
  role_start?: string | null;
  role_end?: string | null;
  designation?: string | null;
};

function accountTeacherRows(teachers: TeacherAccountRow[]): DirectoryRow[] {
  const today = todayIso();
  return teachers.map((teacher) => {
    const storedRole = (teacher.role ?? "teacher") as DirectoryRow["storedRole"];
    const roleStart = teacher.role_start ?? null;
    const roleEnd = teacher.role_end ?? null;
    return {
      teacherId: teacher.id,
      teacherName: teacher.name,
      designation: teacher.designation ?? "",
      username: teacher.username ?? null,
      storedRole,
      role: effectiveRole(storedRole, roleStart, roleEnd, today),
      roleStart,
      roleEnd,
    };
  });
}

async function readSupabaseSession(): Promise<SessionView | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const authSession = data.session;
  if (!authSession) return null;
  const { data: rows, error } = await supabase.rpc("my_access");
  if (error) throw new Error(error.message);
  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row) {
    throw new Error("Signed in, but this teacher has no account row. Run supabase/migration_add_auth_roles.sql.");
  }
  const record = row as {
    username: string;
    teacher_id: string;
    teacher_name: string;
    stored_role: SessionView["storedRole"];
    effective: SessionView["role"];
    role_start: string | null;
    role_end: string | null;
  };
  return {
    userId: authSession.user.id,
    username: record.username,
    email: authSession.user.email ?? syntheticEmail(record.username),
    teacherId: record.teacher_id,
    teacherName: record.teacher_name ?? record.teacher_id,
    storedRole: record.stored_role,
    role: record.effective,
    roleStart: record.role_start,
    roleEnd: record.role_end,
  };
}

export const HARDCODED_SUPERADMIN = {
  username: "superadmin",
  password: "19521971",
};

export const HARDCODED_SUPERADMIN_SESSION: SessionView = {
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

const HARDCODED_ADMIN_STORAGE_KEY = "routine-naem-hardcoded-admin";

function getHardcodedSuperadminSession(): SessionView | null {
  try {
    if (typeof window !== "undefined" && localStorage.getItem(HARDCODED_ADMIN_STORAGE_KEY) === "true") {
      return HARDCODED_SUPERADMIN_SESSION;
    }
  } catch {
    // ignore
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionView | null>(
    () => getHardcodedSuperadminSession() || (isAuthMock ? mockSession() : null),
  );
  const [ready, setReady] = useState(
    () => isAuthMock || !isSupabaseConfigured || Boolean(getHardcodedSuperadminSession()),
  );
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (getHardcodedSuperadminSession()) {
      setSession(HARDCODED_SUPERADMIN_SESSION);
      setReady(true);
      return;
    }
    if (isAuthMock) {
      setSession(mockSession());
      setReady(true);
      return;
    }
    if (!isSupabaseConfigured) {
      setSession(null);
      setReady(true);
      return;
    }
    try {
      setSession(await readSupabaseSession());
      setNotice(null);
    } catch (err) {
      setSession(null);
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (isAuthMock || !supabase) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    void refresh();
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signIn = useCallback(async (username: string, password: string) => {
    const normalized = normalizeUsername(username);

    // Hardcoded Super Admin credentials
    if (normalized === "superadmin") {
      if (password === "19521971") {
        try {
          localStorage.setItem(HARDCODED_ADMIN_STORAGE_KEY, "true");
        } catch {
          // ignore
        }
        setSession(HARDCODED_SUPERADMIN_SESSION);
        return null;
      }
      return "Incorrect password for superadmin.";
    }

    const problem = usernameError(normalized);
    if (problem) return problem;
    try {
      if (isAuthMock) {
        setSession(mockSignIn(normalized, password));
        return null;
      }
      if (!supabase) return "Supabase is not configured.";
      const { error } = await supabase.auth.signInWithPassword({
        email: syntheticEmail(normalized),
        password,
      });
      if (error) return error.message;
      setSession(await readSupabaseSession());
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const signUp = useCallback(async (input: { username: string; teacherId: string; password: string }) => {
    const username = normalizeUsername(input.username);
    const problem = usernameError(username);
    if (problem) return problem;
    if (input.password.length < 6) return "Use at least 6 characters for the password.";
    try {
      if (isAuthMock) {
        setSession(mockSignUp({ ...input, username }));
        return null;
      }
      if (!supabase) return "Supabase is not configured.";
      const available = await supabase.rpc("username_available", { uname: username });
      if (available.error) return available.error.message;
      if (available.data === false) return "That username is already taken.";
      const { error } = await supabase.auth.signUp({
        email: syntheticEmail(username),
        password: input.password,
        options: { data: { username, teacher_id: input.teacherId } },
      });
      if (error) return error.message;
      setSession(await readSupabaseSession());
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      localStorage.removeItem(HARDCODED_ADMIN_STORAGE_KEY);
    } catch {
      // ignore
    }
    if (isAuthMock) {
      mockSignOut();
      setSession(null);
      return;
    }
    await supabase?.auth.signOut();
    setSession(null);
  }, []);

  const unclaimedTeachers = useCallback(async () => {
    if (isAuthMock) return mockUnclaimed();
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("unclaimed_teachers");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string }[];
  }, []);

  const directory = useCallback(async () => {
    if (isAuthMock) return { rows: mockDirectory(), notice: null };
    if (!supabase) return { rows: [], notice: "Supabase is not configured." };

    const columns = "id, name, username, role, role_start, role_end, auth_user_id, designation";
    const full = await supabase.from("teachers").select(columns).order("name");
    if (!full.error) {
      const rows = accountTeacherRows((full.data ?? []) as TeacherAccountRow[]);
      return {
        rows,
        notice: rows.length
          ? null
          : "The teachers table returned no rows for this login. Authenticated users can read it. The editor is still using the teachers saved in the schedule.",
      };
    }

    const missingDesignation = /designation/i.test(full.error.message) && /does not exist|42703|schema cache/i.test(full.error.message);
    if (missingDesignation) {
      const withoutDesignation = await supabase
        .from("teachers")
        .select("id, name, username, role, role_start, role_end, auth_user_id")
        .order("name");
      if (!withoutDesignation.error) {
        const rows = accountTeacherRows((withoutDesignation.data ?? []) as TeacherAccountRow[]);
        return {
          rows,
          notice: rows.length
            ? null
            : "The teachers table returned no rows for this login. Authenticated users can read it. The editor is still using the teachers saved in the schedule.",
        };
      }
      return {
        rows: [],
        notice: missingTeacherColumnNotice(withoutDesignation.error.message) ?? withoutDesignation.error.message,
      };
    }

    const names = await supabase.from("teachers").select("id, name").order("name");
    if (!names.error && names.data?.length) {
      return {
        rows: basicTeacherRows(names.data),
        notice: missingTeacherColumnNotice(full.error.message) ?? full.error.message,
      };
    }
    return {
      rows: [],
      notice: [missingTeacherColumnNotice(full.error.message) ?? full.error.message, names.error?.message]
        .filter(Boolean)
        .join(" "),
    };
  }, []);

  const updateTeacher = useCallback(
    async (teacherId: string, patch: { name?: string; designation?: string }) => {
      if (session?.role !== "super_admin") return "Only a super admin can edit teachers.";
      const next: { name?: string; designation?: string } = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (!name) return "A teacher needs a name.";
        next.name = name;
      }
      if (patch.designation !== undefined) next.designation = patch.designation.trim();
      if (next.name === undefined && next.designation === undefined) return null;
      try {
        if (isAuthMock) {
          mockUpdateTeacher(teacherId, next);
          return null;
        }
        if (!supabase) return "Supabase is not configured.";
        const { error } = await supabase
          .from("teachers")
          .update({ ...next, updated_at: new Date().toISOString() })
          .eq("id", teacherId);
        if (error && next.designation !== undefined && /designation/i.test(error.message) && /does not exist|42703/i.test(error.message)) {
          const retry = await supabase.from("teachers").update({ ...(next.name ? { name: next.name } : {}), updated_at: new Date().toISOString() }).eq("id", teacherId);
          if (next.name && !retry.error) {
            return "Name saved. Designation is not a column on teachers yet. Run supabase/migration_add_teacher_designation.sql.";
          }
          return "Designation is not a column on teachers yet. Run supabase/migration_add_teacher_designation.sql.";
        }
        return rpcError(error);
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [session?.role],
  );

  const assignRole = useCallback(
    async (
      teacherId: string,
      role: Exclude<StoredRole, "super_admin">,
      roleStart: string | null,
      roleEnd: string | null,
    ) => {
      try {
        if (isAuthMock) {
          mockAssignRole(teacherId, role, roleStart, roleEnd);
          setSession(mockSession());
          return null;
        }
        if (!supabase) return "Supabase is not configured.";
        const { error } = await supabase.rpc("assign_teacher_role", {
          target_teacher: teacherId,
          next_role: role,
          start_on: roleStart,
          end_on: roleEnd,
        });
        if (!error && !getHardcodedSuperadminSession()) setSession(await readSupabaseSession());
        return rpcError(error);
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({
      required: authRequired,
      mock: isAuthMock,
      ready,
      session,
      setupError: notice,
      signIn,
      signUp,
      signOut,
      unclaimedTeachers,
      directory,
      updateTeacher,
      assignRole,
    }),
    [ready, session, notice, signIn, signUp, signOut, unclaimedTeachers, directory, updateTeacher, assignRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
