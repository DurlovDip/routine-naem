import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "./auth";
import { screenshotMode } from "./flags";
import {
  courseFromRow,
  legacyCourse,
  missingCoursesRpc,
  pickDefaultCourse,
  screenshotCourses,
  type CourseDraft,
  type CourseSummary,
} from "./lib/courses";
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
  coordinators: Record<string, string[]>;
  selectedCoordinators: string[];
};

const CourseContext = createContext<CourseApi | null>(null);

export function CourseProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [courses, setCourses] = useState<CourseSummary[]>(() =>
    screenshotMode ? screenshotCourses(auth.session?.role ?? "coordinator") : [],
  );
  const [preferredId, setPreferredId] = useState<string | null>(null);
  const [ready, setReady] = useState(screenshotMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (screenshotMode) return;
    void AsyncStorage.getItem(STORAGE_KEY).then((value) => {
      if (value) setPreferredId(value);
    });
  }, []);

  const [coordinators, setCoordinators] = useState<Record<string, string[]>>(() =>
    screenshotMode
      ? {
          "course-acsd": ["Dr. Litan Kanti Halder", "Md. Sazzad Ali"],
          "course-foundation": ["Dr. Litan Kanti Halder"],
        }
      : ({} as Record<string, string[]>),
  );

  const reloadCoordinators = useCallback(async () => {
    if (screenshotMode) {
      setCoordinators({
        "course-acsd": ["Dr. Litan Kanti Halder", "Md. Sazzad Ali"],
        "course-foundation": ["Dr. Litan Kanti Halder"],
      });
      return;
    }
    if (!auth.ready || !auth.session) {
      setCoordinators({});
      return;
    }
    try {
      const [t, a] = await Promise.all([auth.directory(), auth.courseAssignments()]);
      const map: Record<string, string[]> = {};
      for (const item of a) {
        if (item.role === "coordinator" || item.role === "temp_coordinator") {
          const teacher = t.find((row) => row.teacherId === item.teacherId);
          const name = teacher?.teacherName || item.teacherId;
          if (!map[item.courseId]) map[item.courseId] = [];
          if (!map[item.courseId].includes(name)) {
            map[item.courseId].push(name);
          }
        }
      }
      setCoordinators(map);
    } catch {
      // best-effort for non-super admins or offline
    }
  }, [auth]);

  const reload = useCallback(async () => {
    void reloadCoordinators();
    if (screenshotMode) {
      setCourses(screenshotCourses(auth.session?.role ?? "coordinator"));
      setReady(true);
      return;
    }
    if (!auth.ready) return;
    if (!auth.session) {
      setCourses([]);
      setError(null);
      setReady(true);
      return;
    }
    try {
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
    } catch (err) {
      console.warn("my_courses fetch failed:", err);
      setCourses([legacyCourse(canEditSchedule(auth.session.role))]);
      setError(err instanceof Error ? err.message : String(err));
      setReady(true);
    }
  }, [auth.ready, auth.session, reloadCoordinators]);

  useEffect(() => {
    void reload();
    void reloadCoordinators();
  }, [reload, reloadCoordinators]);

  const selected = useMemo(() => pickDefaultCourse(courses, preferredId), [courses, preferredId]);
  const selectedCoordinators = useMemo(
    () => (selected?.id ? coordinators[selected.id] ?? [] : []),
    [selected?.id, coordinators],
  );

  useEffect(() => {
    if (selected && !screenshotMode) void AsyncStorage.setItem(STORAGE_KEY, selected.id);
  }, [selected]);

  const selectCourse = useCallback((id: string) => {
    setPreferredId(id);
    if (!screenshotMode) void AsyncStorage.setItem(STORAGE_KEY, id);
  }, []);

  const createCourse = useCallback(
    async (draft: CourseDraft) => {
      try {
        if (auth.session?.role !== "super_admin") return "Only a super admin can create a course.";
        if (screenshotMode) {
          const id = `course-local-${Date.now()}`;
          setCourses((current) => [
            {
              id,
              name: draft.name.trim(),
              code: draft.code?.trim() ? draft.code.trim() : null,
              status: draft.status,
              startDate: draft.startDate,
              endDate: draft.endDate,
              scheduleId: id,
              courseId: id,
              canEdit: true,
              updatedAt: new Date().toISOString(),
            },
            ...current,
          ]);
          setPreferredId(id);
          return null;
        }
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
    [auth.session?.role, reload],
  );

  const updateCourse = useCallback(
    async (id: string, draft: CourseDraft) => {
      try {
        if (auth.session?.role !== "super_admin") return "Only a super admin can change a course.";
        if (screenshotMode) {
          setCourses((current) =>
            current.map((course) =>
              course.id === id
                ? {
                    ...course,
                    name: draft.name.trim(),
                    code: draft.code?.trim() ? draft.code.trim() : null,
                    status: draft.status,
                    startDate: draft.startDate,
                    endDate: draft.endDate,
                    updatedAt: new Date().toISOString(),
                  }
                : course,
            ),
          );
          return null;
        }
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
    [auth.session?.role, reload],
  );

  const value = useMemo<CourseApi>(
    () => ({
      courses,
      selected,
      ready,
      error,
      selectCourse,
      reload,
      createCourse,
      updateCourse,
      coordinators,
      selectedCoordinators,
    }),
    [
      courses,
      selected,
      ready,
      error,
      selectCourse,
      reload,
      createCourse,
      updateCourse,
      coordinators,
      selectedCoordinators,
    ],
  );

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourses(): CourseApi {
  const value = useContext(CourseContext);
  if (!value) throw new Error("useCourses must be used inside CourseProvider");
  return value;
}
