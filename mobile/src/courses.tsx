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

  const reload = useCallback(async () => {
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
  }, [auth.ready, auth.session]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(() => pickDefaultCourse(courses, preferredId), [courses, preferredId]);

  useEffect(() => {
    if (selected && !screenshotMode) void AsyncStorage.setItem(STORAGE_KEY, selected.id);
  }, [selected]);

  const selectCourse = useCallback((id: string) => {
    setPreferredId(id);
    if (!screenshotMode) void AsyncStorage.setItem(STORAGE_KEY, id);
  }, []);

  const value = useMemo<CourseApi>(
    () => ({ courses, selected, ready, error, selectCourse, reload }),
    [courses, selected, ready, error, selectCourse, reload],
  );

  return <CourseContext.Provider value={value}>{children}</CourseContext.Provider>;
}

export function useCourses(): CourseApi {
  const value = useContext(CourseContext);
  if (!value) throw new Error("useCourses must be used inside CourseProvider");
  return value;
}
