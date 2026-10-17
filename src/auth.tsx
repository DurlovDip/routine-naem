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
  mockSignIn,
  mockSignOut,
  mockSignUp,
  mockUnclaimed,
  type DirectoryRow,
  type SessionView,
} from "./lib/mockAuth";
import { normalizeUsername, syntheticEmail, usernameError, type StoredRole } from "./lib/roles";
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
  directory: () => Promise<DirectoryRow[]>;
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
    if (isAuthMock) return mockDirectory();
    if (!supabase) return [];
    try {
      const { data, error } = await supabase.rpc("access_directory");
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        teacherId: String(row.teacher_id),
        teacherName: String(row.teacher_name),
        username: row.username ? String(row.username) : null,
        storedRole: row.stored_role as DirectoryRow["storedRole"],
        role: row.effective as DirectoryRow["role"],
        roleStart: row.role_start ? String(row.role_start) : null,
        roleEnd: row.role_end ? String(row.role_end) : null,
      }));
    } catch {
      const { data: teachers } = await supabase.from("teachers").select("id, name");
      if (teachers) {
        return (teachers as Array<{ id: string; name: string }>).map((t) => ({
          teacherId: t.id,
          teacherName: t.name,
          username: null,
          storedRole: "teacher" as const,
          role: "teacher" as const,
          roleStart: null,
          roleEnd: null,
        }));
      }
      return [];
    }
  }, []);

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
      assignRole,
    }),
    [ready, session, notice, signIn, signUp, signOut, unclaimedTeachers, directory, assignRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
