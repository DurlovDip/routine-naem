import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "./auth";
import {
  courseFromRow,
  legacyCourse,
  missingCoursesRpc,
  pickDefaultCourse,
  type CourseDraft,
  type CourseSummary,
} from "./lib/courses";
import { mockCreateCourse, mockUpdateCourse, mockVisibleCourses } from "./lib/mockCourses";
import { canEditSchedule } from "./lib/roles";
import { supabase } from "./lib/supabase";

const STORAGE_KEY = "routine-naem-selected-course";

type CourseApi = {
  courses: CourseSummary[];
  selected: CourseSummary | null;
  ready: boolean;
  error: string | null;
  selectCourse: (id: string) => void;
  reload: () => Promise<void>;
  createCourse: (draft: CourseDraft) => Promise<string | null>;
  updateCourse: (id: string, draft: CourseDraft) => Promise<string | null>;
};

const CourseContext = createContext<CourseApi | null>(null);

function storedCourseId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function rememberCourseId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private windows can refuse storage. The choice still lasts for this visit.
  }
}

export function CourseProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [preferredId, setPreferredId] = useState<string | null>(storedCourseId);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!auth.ready) return;
    if (auth.mock) {
      const role = auth.session?.role ?? "teacher";
      const teacherId = auth.session?.teacherId ?? "";
      setCourses(auth.session ? mockVisibleCourses(role, teacherId) : []);
      setError(null);
      setReady(true);
      return;
    }
    if (!supabase || !auth.session) {
      setCourses([]);
      setError(null);
      setReady(true);
      return;
    }
    const { data, error: rpcError } = await supabase.rpc("my_courses");
    if (rpcError) {
      if (missingCoursesRpc(rpcError.message)) {
        setCourses([legacyCourse(canEditSchedule(auth.session.role))]);
        setError(null);
      } else {
        setCourses([]);
        setError(rpcError.message);
      }
      setReady(true);
      return;
    }
    const rows = Array.isArray(data) ? data : [];
    setCourses(rows.map((row) => courseFromRow(row as Record<string, unknown>)).filter((row): row is CourseSummary => row !== null));
    setError(null);
    setReady(true);
  }, [auth.mock, auth.ready, auth.session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(() => pickDefaultCourse(courses, preferredId), [courses, preferredId]);

  useEffect(() => {
    if (selected) rememberCourseId(selected.id);
  }, [selected]);

  const selectCourse = useCallback((id: string) => {
    setPreferredId(id);
    rememberCourseId(id);
  }, []);

  const createCourse = useCallback(
    async (draft: CourseDraft) => {
      try {
        if (auth.session?.role !== "super_admin") return "Only a super admin can create a course.";
        if (auth.mock) {
          const created = mockCreateCourse(draft);
          setPreferredId(created.id);
          await reload();
          return null;
        }
        if (!supabase) return "Supabase is not configured.";
        const { data, error: rpcError } = await supabase.rpc("create_course", {
          course_name: draft.name,
          course_code: draft.code,
          course_status: draft.status,
          course_start: draft.startDate,
          course_end: draft.endDate,
        });
        if (rpcError) return rpcError.message;
        if (typeof data === "string") setPreferredId(data);
        await reload();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [auth.mock, auth.session?.role, reload],
  );

  const updateCourse = useCallback(
    async (id: string, draft: CourseDraft) => {
      try {
        if (auth.session?.role !== "super_admin") return "Only a super admin can change a course.";
        if (auth.mock) {
          mockUpdateCourse(id, draft);
          await reload();
          return null;
        }
        if (!supabase) return "Supabase is not configured.";
        const { error: writeError } = await supabase
          .from("courses")
          .update({
            name: draft.name.trim(),
            code: draft.code?.trim() ? draft.code.trim() : null,
            status: draft.status,
            start_date: draft.startDate,
            end_date: draft.endDate,
          })
          .eq("id", id);
        if (writeError) return writeError.message;
        await reload();
        return null;
      } catch (err) {
        return err instanceof Error ? err.message : String(err);
      }
    },
    [auth.mock, auth.session?.role, reload],
  );

  const value = useMemo<CourseApi>(
    () => ({ courses, selected, ready, error, selectCourse, reload, createCourse, updateCourse }),
    [courses, selected, ready, error, selectCourse, reload, createCourse, updateCourse],
  );

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourses(): CourseApi {
  const value = useContext(CourseContext);
  if (!value) throw new Error("useCourses must be used inside CourseProvider");
  return value;
}
