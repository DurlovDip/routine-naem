import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { screenshotMode } from "./flags";
import { supabase } from "./lib/supabase";
import { canEditSchedule, pinError, syntheticEmail, type AppRole, type StoredRole } from "./lib/roles";

const PIN_MIGRATION = "supabase/migration_add_teacher_pin.sql";

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
  username: string | null;
  storedRole: StoredRole;
  role: AppRole;
  roleStart: string | null;
  roleEnd: string | null;
};

type AuthValue = {
  ready: boolean;
  session: SessionView | null;
  setupError: string | null;
  signIn: (teacherId: string, pin: string) => Promise<string | null>;
  changePin: (oldPin: string, newPin: string) => Promise<string | null>;
  adminResetPin: (teacherId: string, newPin: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  signInTeachers: () => Promise<{ id: string; name: string }[]>;
  directory: () => Promise<DirectoryRow[]>;
  assignRole: (
    teacherId: string,
    role: Exclude<StoredRole, "super_admin">,
    roleStart: string | null,
    roleEnd: string | null,
  ) => Promise<string | null>;
};

const AuthContext = createContext<AuthValue | null>(null);

function asRole(value: unknown): StoredRole {
  if (value === "super_admin" || value === "coordinator" || value === "temp_coordinator" || value === "teacher") {
    return value;
  }
  return "teacher";
}

function dateOrNull(value: unknown): string | null {
  if (!value) return null;
  return String(value).slice(0, 10);
}

function pinMigrationHint(message: string): string {
  if (/login_with_pin|teacher_sign_in_options|schema cache|does not exist|PGRST202|confirm|routine\.local|signup|sign up|invalid login|email/i.test(message)) {
    return `PIN sign-in is not ready yet. Run ${PIN_MIGRATION} in the Supabase SQL editor, then try again.`;
  }
  return message;
}

async function readSupabaseSession(): Promise<SessionView | null> {
  const { data } = await supabase.auth.getSession();
  const authSession = data.session;
  if (!authSession) return null;
  const [access, effective] = await Promise.all([supabase.rpc("my_access"), supabase.rpc("effective_role")]);
  if (access.error) throw new Error(access.error.message);
  const row = Array.isArray(access.data) ? access.data[0] : access.data;
  if (!row) {
    throw new Error("Signed in, but this teacher has no account row.");
  }
  const record = row as {
    username: string;
    teacher_id: string;
    teacher_name: string;
    stored_role: string;
    effective: string;
    role_start: string | null;
    role_end: string | null;
  };
  const rpcRole = !effective.error && typeof effective.data === "string" ? asRole(effective.data) : null;
  return {
    userId: authSession.user.id,
    username: record.username,
    email: authSession.user.email ?? syntheticEmail(record.username),
    teacherId: record.teacher_id,
    teacherName: record.teacher_name ?? record.teacher_id,
    storedRole: asRole(record.stored_role),
    role: rpcRole ?? asRole(record.effective),
    roleStart: dateOrNull(record.role_start),
    roleEnd: dateOrNull(record.role_end),
  };
}

function screenshotSession(): SessionView {
  const search = (globalThis as { location?: { search?: string } }).location?.search ?? "";
  const role: AppRole = search.includes("role=teacher")
    ? "teacher"
    : search.includes("role=temp")
      ? "temp_coordinator"
      : "coordinator";
  const dated = role === "coordinator" || role === "temp_coordinator";
  return {
    userId: "screenshot",
    username: role,
    email: syntheticEmail(role),
    teacherId: "screenshot",
    teacherName: role === "teacher" ? "Teacher" : role === "temp_coordinator" ? "Temporary coordinator" : "Dr. Litan Kanti Halder",
    role,
    storedRole: role,
    roleStart: dated ? "2026-01-01" : null,
    roleEnd: dated ? "2026-12-31" : null,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionView | null>(() => (screenshotMode ? screenshotSession() : null));
  const [ready, setReady] = useState(screenshotMode);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
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
    if (screenshotMode) return;
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    void refresh();
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signIn = useCallback(async (teacherId: string, pin: string) => {
    const problem = pinError(pin);
    if (!teacherId) return "Pick your name.";
    if (problem) return problem;
    try {
      const prepared = await supabase.rpc("login_with_pin", { teacher_id: teacherId, pin });
      if (prepared.error) return pinMigrationHint(prepared.error.message);
      const email = typeof prepared.data === "string" ? prepared.data : "";
      if (!email) return `Sign-in did not return an account. Run ${PIN_MIGRATION} in the Supabase SQL editor.`;
      const { error } = await supabase.auth.signInWithPassword({ email, password: pin });
      if (error) return pinMigrationHint(error.message);
      const next = await readSupabaseSession();
      if (!next) return "Signed in, but no session was stored.";
      setSession(next);
      setNotice(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const changePin = useCallback(async (oldPin: string, newPin: string) => {
    const problem = pinError(newPin);
    if (problem) return problem;
    if (oldPin === newPin) return "Choose a different PIN.";
    const { error } = await supabase.rpc("change_pin", { old_pin: oldPin, new_pin: newPin });
    return error ? pinMigrationHint(error.message) : null;
  }, []);

  const adminResetPin = useCallback(async (teacherId: string, newPin: string) => {
    const problem = pinError(newPin);
    if (problem) return problem;
    const { error } = await supabase.rpc("admin_reset_pin", { teacher_id: teacherId, new_pin: newPin });
    return error ? pinMigrationHint(error.message) : null;
  }, []);

  const signOut = useCallback(async () => {
    if (!screenshotMode) await supabase.auth.signOut();
    setSession(null);
    setNotice(null);
  }, []);

  const signInTeachers = useCallback(async () => {
    const rpc = await supabase.rpc("teacher_sign_in_options");
    if (!rpc.error && Array.isArray(rpc.data)) {
      return (rpc.data as { id: string; name: string }[]).map((row) => ({ id: row.id, name: row.name }));
    }
    const fallback = await supabase.from("teachers").select("id, name").order("name");
    if (!fallback.error && fallback.data) return fallback.data as { id: string; name: string }[];
    throw new Error(pinMigrationHint(rpc.error?.message ?? fallback.error?.message ?? "Could not load teachers."));
  }, []);

  const directory = useCallback(async () => {
    const { data, error } = await supabase.rpc("access_directory");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      teacherId: String(row.teacher_id),
      teacherName: String(row.teacher_name),
      username: row.username ? String(row.username) : null,
      storedRole: asRole(row.stored_role),
      role: asRole(row.effective),
      roleStart: dateOrNull(row.role_start),
      roleEnd: dateOrNull(row.role_end),
    }));
  }, []);

  const assignRole = useCallback(
    async (
      teacherId: string,
      role: Exclude<StoredRole, "super_admin">,
      roleStart: string | null,
      roleEnd: string | null,
    ) => {
      const { error } = await supabase.rpc("assign_teacher_role", {
        target_teacher: teacherId,
        next_role: role,
        start_on: roleStart,
        end_on: roleEnd,
      });
      if (!error) {
        try {
          setSession(await readSupabaseSession());
        } catch {
          // The directory reload still shows the saved role.
        }
      }
      return error ? error.message : null;
    },
    [],
  );

  const value = useMemo<AuthValue>(
    () => ({
      ready,
      session,
      setupError: notice,
      signIn,
      changePin,
      adminResetPin,
      signOut,
      signInTeachers,
      directory,
      assignRole,
    }),
    [ready, session, notice, signIn, changePin, adminResetPin, signOut, signInTeachers, directory, assignRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

export function useAccess() {
  const { session } = useAuth();
  const role = session?.role ?? null;
  return {
    role,
    canEdit: canEditSchedule(role),
    canAdmin: role === "super_admin",
    cloudSession: Boolean(session),
  };
}
