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
  mockAssign,
  mockCancel,
  mockDelegate,
  mockDelegations,
  mockDirectory,
  mockRevoke,
  mockSession,
  mockSignIn,
  mockSignOut,
  mockSignUp,
  mockTransfer,
  mockUnclaimed,
  type DelegationRow,
  type DirectoryRow,
  type SessionView,
} from "./lib/mockAuth";
import { normalizeUsername, syntheticEmail, usernameError } from "./lib/roles";
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
  delegations: () => Promise<DelegationRow[]>;
  assignCoordinator: (teacherId: string) => Promise<string | null>;
  revokeCoordinator: (teacherId: string) => Promise<string | null>;
  transferCoordination: (teacherId: string) => Promise<string | null>;
  delegateCoordination: (teacherId: string, startsOn: string, endsOn: string) => Promise<string | null>;
  cancelDelegation: (id: string) => Promise<string | null>;
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
    throw new Error("Signed in, but this account has no profile. Run supabase/migration_add_auth_roles.sql.");
  }
  const record = row as {
    username: string;
    teacher_id: string;
    teacher_name: string;
    base_role: SessionView["baseRole"];
    effective: SessionView["role"];
  };
  return {
    userId: authSession.user.id,
    username: record.username,
    email: authSession.user.email ?? syntheticEmail(record.username),
    teacherId: record.teacher_id,
    teacherName: record.teacher_name ?? record.teacher_id,
    baseRole: record.base_role,
    role: record.effective,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionView | null>(() => (isAuthMock ? mockSession() : null));
  const [ready, setReady] = useState(() => isAuthMock || !isSupabaseConfigured);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
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
    void refresh();
    const { data } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const signIn = useCallback(async (username: string, password: string) => {
    if (isAuthMock) {
      const result = mockSignIn(username, password);
      setSession(result.session);
      return result.error;
    }
    if (!supabase) return "Supabase is not configured.";
    const email = syntheticEmail(normalizeUsername(username));
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return error.message;
    try {
      setSession(await readSupabaseSession());
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const signUp = useCallback(async (input: { username: string; teacherId: string; password: string }) => {
    const username = normalizeUsername(input.username);
    const nameError = usernameError(username);
    if (nameError) return nameError;
    if (input.password.length < 8) return "Use a password of at least 8 characters.";
    if (isAuthMock) {
      const result = mockSignUp({ ...input, username });
      setSession(result.session);
      return result.error;
    }
    if (!supabase) return "Supabase is not configured.";
    const { data: available, error: nameLookupError } = await supabase.rpc("username_available", { uname: username });
    if (nameLookupError) return nameLookupError.message;
    if (available === false) return "That username is already taken.";
    const { data, error } = await supabase.auth.signUp({
      email: syntheticEmail(username),
      password: input.password,
      options: { data: { username, teacher_id: input.teacherId } },
    });
    if (error) return error.message;
    if (!data.session) {
      return "Account created, but email confirmation is still on. In Supabase, open Authentication → Providers → Email, turn off Confirm email, then sign in.";
    }
    try {
      setSession(await readSupabaseSession());
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (isAuthMock) {
      mockSignOut();
      setSession(null);
      return;
    }
    if (supabase) await supabase.auth.signOut();
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
    const { data, error } = await supabase.rpc("access_directory");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      teacherId: String(row.teacher_id),
      teacherName: String(row.teacher_name ?? ""),
      username: row.username ? String(row.username) : null,
      baseRole: (row.base_role as DirectoryRow["baseRole"]) ?? null,
      role: (row.effective as DirectoryRow["role"]) ?? null,
      hasPermanent: Boolean(row.has_permanent),
      temporaryUntil: row.temporary_until ? String(row.temporary_until) : null,
    }));
  }, []);

  const delegations = useCallback(async () => {
    if (isAuthMock) return mockDelegations();
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("list_delegations");
    if (error) throw new Error(error.message);
    return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      teacherId: String(row.teacher_id),
      teacherName: String(row.teacher_name ?? ""),
      grantedBy: row.granted_by ? String(row.granted_by) : null,
      kind: row.kind === "permanent" ? "permanent" as const : "temporary" as const,
      startsOn: row.starts_on ? String(row.starts_on) : null,
      endsOn: row.ends_on ? String(row.ends_on) : null,
      revokedAt: null,
      active: Boolean(row.active),
    }));
  }, []);

  const afterChange = useCallback(async (error: string | null) => {
    if (!error) await refresh();
    return error;
  }, [refresh]);

  const assignCoordinator = useCallback(async (teacherId: string) => {
    if (isAuthMock) {
      try {
        setSession(mockAssign(teacherId));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    }
    if (!supabase) return "Supabase is not configured.";
    const { error } = await supabase.rpc("assign_coordinator", { target_teacher: teacherId });
    return afterChange(rpcError(error));
  }, [afterChange]);

  const revokeCoordinator = useCallback(async (teacherId: string) => {
    if (isAuthMock) {
      try {
        setSession(mockRevoke(teacherId));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    }
    if (!supabase) return "Supabase is not configured.";
    const { error } = await supabase.rpc("revoke_coordinator", { target_teacher: teacherId });
    return afterChange(rpcError(error));
  }, [afterChange]);

  const transferCoordination = useCallback(async (teacherId: string) => {
    if (isAuthMock) {
      try {
        setSession(mockTransfer(teacherId));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    }
    if (!supabase) return "Supabase is not configured.";
    const { error } = await supabase.rpc("transfer_coordination", { target_teacher: teacherId });
    return afterChange(rpcError(error));
  }, [afterChange]);

  const delegateCoordination = useCallback(async (teacherId: string, startsOn: string, endsOn: string) => {
    if (isAuthMock) {
      try {
        setSession(mockDelegate(teacherId, startsOn, endsOn));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    }
    if (!supabase) return "Supabase is not configured.";
    const { error } = await supabase.rpc("delegate_coordination", {
      target_teacher: teacherId,
      start_on: startsOn,
      end_on: endsOn,
    });
    return afterChange(rpcError(error));
  }, [afterChange]);

  const cancelDelegation = useCallback(async (id: string) => {
    if (isAuthMock) {
      try {
        setSession(mockCancel(id));
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    }
    if (!supabase) return "Supabase is not configured.";
    const { error } = await supabase.rpc("cancel_delegation", { delegation_id: id });
    return afterChange(rpcError(error));
  }, [afterChange]);

  const value = useMemo<AuthValue>(
    () => ({
      required: authRequired,
      mock: isAuthMock,
      ready,
      session: notice ? null : session,
      setupError: notice,
      signIn,
      signUp,
      signOut,
      unclaimedTeachers,
      directory,
      delegations,
      assignCoordinator,
      revokeCoordinator,
      transferCoordination,
      delegateCoordination,
      cancelDelegation,
    }),
    [
      ready,
      session,
      notice,
      signIn,
      signUp,
      signOut,
      unclaimedTeachers,
      directory,
      delegations,
      assignCoordinator,
      revokeCoordinator,
      transferCoordination,
      delegateCoordination,
      cancelDelegation,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
