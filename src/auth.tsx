import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { CourseAssignment } from "./lib/courses";
import {
  mockAdminResetPin,
  mockAssignRole,
  mockChangePin,
  mockDirectory,
  mockSession,
  mockSignIn,
  mockSignInTeachers,
  mockSignOut,
  mockUpdateTeacher,
  type DirectoryRow as MockDirectoryRow,
  type SessionView as MockSessionView,
} from "./lib/mockAuth";
import { mockAssignCourse, mockCourseAssignments } from "./lib/mockCourses";
import {
  canEditSchedule,
  effectiveRole,
  missingTeacherColumnNotice,
  pinError,
  syntheticEmail,
  todayIso,
  type AppRole,
  type StoredRole,
} from "./lib/roles";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

export const isAuthMock = import.meta.env.VITE_AUTH_MOCK === "true";
export const authRequired = isAuthMock || import.meta.env.VITE_AUTH_REQUIRED === "true" || isSupabaseConfigured;

export type SessionView = MockSessionView;
export type DirectoryRow = MockDirectoryRow;

type AuthValue = {
  required: boolean;
  mock: boolean;
  ready: boolean;
  session: SessionView | null;
  setupError: string | null;
  signIn: (teacherId: string, pin: string) => Promise<string | null>;
  changePin: (oldPin: string, newPin: string) => Promise<string | null>;
  adminResetPin: (teacherId: string, newPin: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  signInTeachers: () => Promise<{ id: string; name: string }[]>;
  directory: () => Promise<DirectoryRow[] & { rows: DirectoryRow[]; notice: string | null }>;
  assignRole: (
    teacherId: string,
    role: Exclude<StoredRole, "super_admin">,
    roleStart: string | null,
    roleEnd: string | null,
  ) => Promise<string | null>;
  assignCourseRole: (
    teacherId: string,
    role: Exclude<StoredRole, "super_admin">,
    roleStart: string | null,
    roleEnd: string | null,
    courseId: string | null,
  ) => Promise<string | null>;
  courseAssignments: () => Promise<CourseAssignment[]>;
  loadDesignation: () => Promise<string>;
  saveDesignation: (designation: string) => Promise<string | null>;
  loadSignature: () => Promise<string | null>;
  saveSignature: (signature: string | null) => Promise<string | null>;
  updateTeacher: (
    teacherId: string,
    patch: { name?: string; designation?: string },
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

const PIN_MIGRATION = "supabase/migration_add_teacher_pin.sql";

function pinMigrationHint(message: string): string {
  if (/login_with_pin|teacher_sign_in_options|schema cache|does not exist|PGRST202|confirm|routine\.local|signup|sign up|invalid login|email/i.test(message)) {
    return `PIN sign-in is not ready yet. Run ${PIN_MIGRATION} in the Supabase SQL editor, then try again.`;
  }
  return message;
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
      if (isAuthMock) {
        setSession(mockSignIn(teacherId, pin));
        return null;
      }
      if (!supabase) return "Supabase is not configured.";
      const prepared = await supabase.rpc("login_with_pin", { teacher_id: teacherId, pin });
      if (prepared.error) return pinMigrationHint(prepared.error.message);
      const email = typeof prepared.data === "string" ? prepared.data : "";
      if (!email) return `Sign-in did not return an account. Run ${PIN_MIGRATION} in the Supabase SQL editor.`;
      const { error } = await supabase.auth.signInWithPassword({ email, password: pin });
      if (error) return pinMigrationHint(error.message);
      const nextSession = await readSupabaseSession();
      setSession(nextSession);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const changePin = useCallback(async (oldPin: string, newPin: string) => {
    const problem = pinError(newPin);
    if (problem) return problem;
    if (oldPin === newPin) return "Choose a different PIN.";
    try {
      if (isAuthMock) {
        mockChangePin(oldPin, newPin);
        return null;
      }
      if (!supabase) return "Supabase is not configured.";
      const { error } = await supabase.rpc("change_pin", { old_pin: oldPin, new_pin: newPin });
      return error ? pinMigrationHint(error.message) : null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }, []);

  const adminResetPin = useCallback(async (teacherId: string, newPin: string) => {
    const problem = pinError(newPin);
    if (problem) return problem;
    try {
      if (isAuthMock) {
        mockAdminResetPin(teacherId, newPin);
        return null;
      }
      if (!supabase) return "Supabase is not configured.";
      const { error } = await supabase.rpc("admin_reset_pin", { teacher_id: teacherId, new_pin: newPin });
      return error ? pinMigrationHint(error.message) : null;
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
    await supabase?.auth.signOut();
    setSession(null);
  }, []);

  const signInTeachers = useCallback(async () => {
    if (isAuthMock) return mockSignInTeachers();
    if (!supabase) return [];
    const rpc = await supabase.rpc("teacher_sign_in_options");
    if (!rpc.error && Array.isArray(rpc.data)) {
      return (rpc.data as { id: string; name: string }[]).map((row) => ({ id: row.id, name: row.name }));
    }
    const fallback = await supabase.from("teachers").select("id, name").order("name");
    if (!fallback.error && fallback.data) {
      return fallback.data as { id: string; name: string }[];
    }
    throw new Error(pinMigrationHint(rpc.error?.message ?? fallback.error?.message ?? "Could not load teachers."));
  }, []);

  const directory = useCallback(async () => {
    let rawRows: DirectoryRow[] = [];
    let noticeText: string | null = null;

    if (isAuthMock) {
      rawRows = mockDirectory();
    } else if (!supabase) {
      rawRows = [];
      noticeText = "Supabase is not configured.";
    } else {
      const columns = "id, name, username, role, role_start, role_end, auth_user_id, designation";
      const full = await supabase.from("teachers").select(columns).order("name");
      if (!full.error) {
        rawRows = accountTeacherRows((full.data ?? []) as TeacherAccountRow[]);
        noticeText = rawRows.length
          ? null
          : "The teachers table returned no rows for this login. Authenticated users can read it. The editor is still using the teachers saved in the schedule.";
      } else {
        const missingDesignation =
          /designation/i.test(full.error.message) &&
          /does not exist|42703|schema cache/i.test(full.error.message);
        if (missingDesignation) {
          const withoutDesignation = await supabase
            .from("teachers")
            .select("id, name, username, role, role_start, role_end, auth_user_id")
            .order("name");
          if (!withoutDesignation.error) {
            rawRows = accountTeacherRows((withoutDesignation.data ?? []) as TeacherAccountRow[]);
            noticeText = rawRows.length
              ? null
              : "The teachers table returned no rows for this login. Authenticated users can read it. The editor is still using the teachers saved in the schedule.";
          } else {
            noticeText =
              missingTeacherColumnNotice(withoutDesignation.error.message) ??
              withoutDesignation.error.message;
          }
        } else {
          const names = await supabase.from("teachers").select("id, name").order("name");
          if (!names.error && names.data?.length) {
            rawRows = basicTeacherRows(names.data);
            noticeText = missingTeacherColumnNotice(full.error.message) ?? full.error.message;
          } else {
            noticeText = [
              missingTeacherColumnNotice(full.error.message) ?? full.error.message,
              names.error?.message,
            ]
              .filter(Boolean)
              .join(" ");
          }
        }
      }
    }

    const dual: any = [...rawRows];
    dual.rows = rawRows;
    dual.notice = noticeText;
    return dual as DirectoryRow[] & { rows: DirectoryRow[]; notice: string | null };
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
          .eq("id", teacherId)
          .select("id");
        if (
          error &&
          next.designation !== undefined &&
          /designation/i.test(error.message) &&
          /does not exist|42703/i.test(error.message)
        ) {
          const retry = await supabase
            .from("teachers")
            .update({
              ...(next.name ? { name: next.name } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("id", teacherId)
            .select("id");
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

  const courseAssignments = useCallback(async () => {
    if (isAuthMock) return mockCourseAssignments();
    if (!supabase) return [];
    const { data, error } = await supabase.rpc("list_course_assignments");
    if (error) throw new Error(error.message);
    const rows = Array.isArray(data) ? data : [];
    return rows.map((row) => {
      const record = row as {
        teacher_id: string;
        course_id: string;
        role: string;
        role_start: string;
        role_end: string;
      };
      return {
        teacherId: record.teacher_id,
        courseId: record.course_id,
        role: record.role === "temp_coordinator" ? ("temp_coordinator" as const) : ("coordinator" as const),
        roleStart: String(record.role_start).slice(0, 10),
        roleEnd: String(record.role_end).slice(0, 10),
      };
    });
  }, []);

  const assignCourseRole = useCallback(
    async (
      teacherId: string,
      role: Exclude<StoredRole, "super_admin">,
      roleStart: string | null,
      roleEnd: string | null,
      courseId: string | null,
    ) => {
      try {
        if (isAuthMock) {
          mockAssignCourse(teacherId, role, roleStart, roleEnd, courseId);
          const today = todayIso();
          const mine = mockCourseAssignments().filter((row) => row.teacherId === teacherId);
          const current = mine.find((row) => row.roleStart <= today && today <= row.roleEnd);
          const future = mine
            .filter((row) => row.roleStart > today)
            .sort((a, b) => a.roleStart.localeCompare(b.roleStart))[0];
          const past = mine
            .filter((row) => row.roleEnd < today)
            .sort((a, b) => b.roleEnd.localeCompare(a.roleEnd))[0];
          const summary = current ?? future ?? past;
          if (summary) mockAssignRole(teacherId, summary.role, summary.roleStart, summary.roleEnd);
          else mockAssignRole(teacherId, "teacher", null, null);
          setSession(mockSession());
          return null;
        }
        if (!supabase) return "Supabase is not configured.";
        const { error } = await supabase.rpc("assign_course_role", {
          target_teacher: teacherId,
          next_role: role,
          start_on: roleStart,
          end_on: roleEnd,
          target_course: courseId,
        });
        if (!error) setSession(await readSupabaseSession());
        return rpcError(error);
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [],
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
        if (!error) setSession(await readSupabaseSession());
        return rpcError(error);
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [],
  );

  const loadDesignation = useCallback(async () => {
    if (isAuthMock || !session) return "Assistant Director";
    if (!supabase) return "";
    const { data, error } = await supabase
      .from("teachers")
      .select("designation")
      .eq("id", session.teacherId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return typeof data?.designation === "string" ? data.designation : "";
  }, [session]);

  const saveDesignation = useCallback(
    async (designation: string) => {
      if (isAuthMock) return null;
      if (!supabase) return "Supabase is not configured.";
      const trimmed = designation.trim();
      const { error } = await supabase.rpc("set_my_designation", { next_designation: trimmed });
      if (!error) return null;
      if (session?.teacherId) {
        const { error: directError } = await supabase
          .from("teachers")
          .update({ designation: trimmed })
          .eq("id", session.teacherId);
        if (!directError) return null;
      }
      return error.message;
    },
    [session?.teacherId],
  );

  const loadSignature = useCallback(async () => {
    if (isAuthMock || !session?.teacherId) return null;
    try {
      const cached = localStorage.getItem(`@teacher_sig_${session.teacherId}`);
      if (cached) return cached;
    } catch {
      // ignore
    }
    if (!supabase) return null;
    try {
      const { data, error } = await supabase
        .from("teachers")
        .select("signature")
        .eq("id", session.teacherId)
        .maybeSingle();
      if (!error && typeof data?.signature === "string" && data.signature) {
        return data.signature;
      }
    } catch {
      // ignore
    }
    return null;
  }, [session?.teacherId]);

  const saveSignature = useCallback(
    async (signature: string | null) => {
      if (isAuthMock) return null;
      if (!session?.teacherId) return "Not signed in";
      try {
        if (signature) {
          localStorage.setItem(`@teacher_sig_${session.teacherId}`, signature);
        } else {
          localStorage.removeItem(`@teacher_sig_${session.teacherId}`);
        }
      } catch {
        // ignore
      }
      if (!supabase) return null;
      try {
        await supabase
          .from("teachers")
          .update({ signature })
          .eq("id", session.teacherId);
      } catch {
        // ignore
      }
      return null;
    },
    [session?.teacherId],
  );

  const value = useMemo<AuthValue>(
    () => ({
      required: authRequired,
      mock: isAuthMock,
      ready,
      session,
      setupError: notice,
      signIn,
      changePin,
      adminResetPin,
      signOut,
      signInTeachers,
      directory,
      updateTeacher,
      assignRole,
      assignCourseRole,
      courseAssignments,
      loadDesignation,
      saveDesignation,
      loadSignature,
      saveSignature,
    }),
    [
      ready,
      session,
      notice,
      signIn,
      changePin,
      adminResetPin,
      signOut,
      signInTeachers,
      directory,
      updateTeacher,
      assignRole,
      assignCourseRole,
      courseAssignments,
      loadDesignation,
      saveDesignation,
      loadSignature,
      saveSignature,
    ],
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
  const role: AppRole | null = session?.role ?? null;
  return {
    role,
    canEdit: canEditSchedule(role),
    canAdmin: role === "super_admin",
    cloudSession: Boolean(session),
  };
}
