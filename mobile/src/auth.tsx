import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "./lib/supabase";
import { normalizeUsername, syntheticEmail, usernameError, type AppRole, type StoredRole } from "./lib/roles";

const HARDCODED_KEY = "routine-naem-hardcoded-admin";

export const HARDCODED_SUPERADMIN = {
  username: "superadmin",
  password: "19521971",
};

let shortcutOpen: Promise<SessionView> | null = null;

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

async function shortcutRequested(): Promise<boolean> {
  return (await AsyncStorage.getItem(HARDCODED_KEY)) === "true";
}

async function rememberShortcut() {
  await AsyncStorage.setItem(HARDCODED_KEY, "true");
}

async function forgetShortcut() {
  await AsyncStorage.removeItem(HARDCODED_KEY);
}

async function openShortcutAccount(): Promise<SessionView> {
  if (!shortcutOpen) {
    shortcutOpen = openShortcutAccountOnce().finally(() => {
      shortcutOpen = null;
    });
  }
  return shortcutOpen;
}

/** Same account the web shortcut uses: superadmin@routine.local. */
async function openShortcutAccountOnce(): Promise<SessionView> {
  const email = syntheticEmail(HARDCODED_SUPERADMIN.username);
  const password = HARDCODED_SUPERADMIN.password;
  const current = await supabase.auth.getSession();
  const currentEmail = current.data.session?.user.email?.toLowerCase();
  if (currentEmail !== email) {
    const signedIn = await supabase.auth.signInWithPassword({ email, password });
    if (signedIn.error) {
      const created = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username: "superadmin", teacher_id: "superadmin" } },
      });
      if (created.error) {
        const code = "code" in created.error ? String(created.error.code) : "";
        const needsConfirm =
          code === "email_address_invalid" ||
          code === "over_email_send_rate_limit" ||
          code === "email_not_confirmed" ||
          /confirm email|invalid/i.test(created.error.message);
        throw new Error(
          needsConfirm
            ? `${created.error.message} Turn off Confirm email for superadmin@routine.local, then sign in again. Supabase will not deliver mail to that address.`
            : `${created.error.message} Run supabase/migration_superadmin_account.sql in the Supabase SQL editor, then sign in again.`,
        );
      }
      if (!created.data.session) {
        const again = await supabase.auth.signInWithPassword({ email, password });
        if (again.error) {
          const code = "code" in again.error ? String(again.error.code) : "";
          throw new Error(
            code === "email_not_confirmed" || /confirm/i.test(again.error.message)
              ? "Turn off Confirm email for the superadmin@routine.local account, then sign in again."
              : again.error.message,
          );
        }
      }
    }
  }
  const view = await readSupabaseSession();
  if (!view) {
    throw new Error("Run supabase/migration_superadmin_account.sql so superadmin@routine.local is a super admin.");
  }
  return view;
}

async function readSupabaseSession(): Promise<SessionView | null> {
  const { data } = await supabase.auth.getSession();
  const authSession = data.session;
  if (!authSession) return null;
  const [access, effective] = await Promise.all([
    supabase.rpc("my_access"),
    supabase.rpc("effective_role"),
  ]);
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionView | null>(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      if (await shortcutRequested()) {
        setSession(await openShortcutAccount());
      } else {
        setSession(await readSupabaseSession());
      }
      setNotice(null);
    } catch (err) {
      setSession(null);
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    void refresh();
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signIn = useCallback(async (username: string, password: string) => {
    const normalized = normalizeUsername(username);
    if (normalized === HARDCODED_SUPERADMIN.username) {
      if (password !== HARDCODED_SUPERADMIN.password) return "Incorrect password for superadmin.";
      try {
        await rememberShortcut();
        const next = await openShortcutAccount();
        setSession(next);
        setNotice(null);
        return null;
      } catch (err) {
        setSession(null);
        const message = err instanceof Error ? err.message : String(err);
        setNotice(message);
        return message;
      }
    }
    const problem = usernameError(normalized);
    if (problem) return problem;
    try {
      await forgetShortcut();
      const { error } = await supabase.auth.signInWithPassword({
        email: syntheticEmail(normalized),
        password,
      });
      if (error) return error.message;
      const next = await readSupabaseSession();
      if (!next) return "Signed in, but no session was stored.";
      setSession(next);
      setNotice(null);
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
    if (!input.teacherId) return "Choose your name from the teacher list.";
    try {
      await forgetShortcut();
      const available = await supabase.rpc("username_available", { uname: username });
      if (available.error) return available.error.message;
      if (available.data === false) return "That username is already taken.";
      const { error } = await supabase.auth.signUp({
        email: syntheticEmail(username),
        password: input.password,
        options: { data: { username, teacher_id: input.teacherId } },
      });
      if (error) return error.message;
      const next = await readSupabaseSession();
      if (!next) {
        return "Account created, but sign-in did not start. Turn off email confirmation in Supabase, then sign in.";
      }
      setSession(next);
      setNotice(null);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const signOut = useCallback(async () => {
    await forgetShortcut();
    await supabase.auth.signOut();
    setSession(null);
    setNotice(null);
  }, []);

  const unclaimedTeachers = useCallback(async () => {
    const { data, error } = await supabase.rpc("unclaimed_teachers");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string }[];
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

export function useAccess() {
  const { session } = useAuth();
  const role = session?.role ?? null;
  return {
    role,
    canEdit: role === "super_admin" || role === "coordinator" || role === "temp_coordinator",
    canAdmin: role === "super_admin",
    cloudSession: Boolean(session),
  };
}
