import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import { isAuthMock, useAuth } from "./auth";
import { useCourses } from "./courses";
import { withCourseTitle } from "./lib/courses";
import { createDemoState } from "./lib/demo";
import { scheduleReducer, type Action } from "./lib/reducer";
import { activeDay, scheduleContentChanged } from "./lib/schedule";
import { loadState, saveState } from "./lib/storage";
import {
  isSupabaseConfigured,
  loadRemoteSchedule,
  subscribeToRemoteSchedule,
  upsertRemoteSchedule,
} from "./lib/supabase";
import type { AppState, DayPlan } from "./lib/types";

export type SyncStatus = "connected" | "saving" | "offline" | "error" | "unconfigured";

export type Store = {
  state: AppState;
  dispatch: Dispatch<Action>;
  day: DayPlan;
  persistError: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: Date | null;
  refreshFromCloud: () => Promise<void>;
};

const ScheduleContext = createContext<Store | null>(null);

function initialState(): AppState {
  return loadState() ?? createDemoState();
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const courses = useCourses();
  const cloudOn = isSupabaseConfigured && !isAuthMock;
  const target = courses.selected;
  const canWrite = cloudOn && Boolean(target?.canEdit);
  const canWriteCatalog = cloudOn && (!auth.required || auth.session?.role === "super_admin");
  const canRead = cloudOn && courses.ready && Boolean(target) && (!auth.required || Boolean(auth.session));
  const [state, dispatch] = useReducer(scheduleReducer, undefined, initialState);
  const [persistError, setPersistError] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    cloudOn ? "connected" : "unconfigured",
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const day = activeDay(state);
  const skipCloudSave = useRef(false);
  const cloudReady = useRef(false);
  const loadedScheduleId = useRef<string | null>(null);
  const targetRef = useRef(target);
  const stateRef = useRef(state);
  const localDocs = useRef(new Map<string, AppState>());
  const localCourse = useRef<string | null>(null);
  targetRef.current = target;
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Local storage debounced persistence
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPersistError(!saveState(state));
    }, 150);
    return () => window.clearTimeout(timer);
  }, [state]);

  // Mock and offline previews keep a document per course in this tab.
  useEffect(() => {
    if (cloudOn || !courses.ready || !target) return;
    if (localCourse.current === target.id) return;
    if (localCourse.current) localDocs.current.set(localCourse.current, stateRef.current);
    const previous = localCourse.current;
    localCourse.current = target.id;
    const stored = localDocs.current.get(target.id);
    if (stored) {
      skipCloudSave.current = true;
      dispatch({ type: "replace", state: stored });
      return;
    }
    if (previous) {
      skipCloudSave.current = true;
      const next = withCourseTitle(stateRef.current, target.name);
      localDocs.current.set(target.id, next);
      dispatch({ type: "replace", state: next });
    }
  }, [cloudOn, courses.ready, target]);

  // Load the selected course before any save of this document can start.
  useEffect(() => {
    if (!canRead || !target) return;

    let mounted = true;
    cloudReady.current = false;
    const scheduleId = target.scheduleId;
    const courseId = target.courseId;

    async function initCloud() {
      if (!navigator.onLine) {
        setSyncStatus("offline");
        return;
      }

      setSyncStatus("saving");
      const remote = await loadRemoteSchedule({ scheduleId, courseId });
      if (!mounted || targetRef.current?.scheduleId !== scheduleId) return;

      if (remote.error) {
        setSyncStatus("error");
        return;
      }

      cloudReady.current = true;
      loadedScheduleId.current = scheduleId;

      if (remote.state) {
        applyRemote(remote.state);
        setSyncStatus("connected");
        setLastSyncedAt(new Date());
      } else if (targetRef.current?.canEdit) {
        const ok = await upsertRemoteSchedule(stateRef.current, {
          catalogs: canWriteCatalog,
          scheduleId,
          courseId,
        });
        if (mounted) {
          setSyncStatus(ok ? "connected" : "error");
          if (ok) setLastSyncedAt(new Date());
        }
      } else if (mounted) {
        setSyncStatus("connected");
      }
    }

    void initCloud();

    const unsubscribe = subscribeToRemoteSchedule((remoteState) => {
      if (!mounted || targetRef.current?.scheduleId !== scheduleId) return;
      applyRemote(remoteState);
      setSyncStatus("connected");
      setLastSyncedAt(new Date());
    }, { scheduleId, courseId });

    const handleOnline = () => {
      if (mounted) void initCloud();
    };
    const handleOffline = () => {
      if (mounted) setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      mounted = false;
      cloudReady.current = false;
      if (unsubscribe) unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [canRead, canWriteCatalog, target]);

  const lastSavedContentRef = useRef<AppState>(state);

  useEffect(() => {
    if (!canWrite || !cloudReady.current) return;
    if (skipCloudSave.current) {
      skipCloudSave.current = false;
      return;
    }
    if (!scheduleContentChanged(lastSavedContentRef.current, state)) {
      return;
    }
    const saving = targetRef.current;
    if (!saving || saving.scheduleId !== loadedScheduleId.current) return;
    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }

    setSyncStatus("saving");
    const timer = window.setTimeout(async () => {
      if (targetRef.current?.scheduleId !== saving.scheduleId) return;
      lastSavedContentRef.current = stateRef.current;
      const ok = await upsertRemoteSchedule(stateRef.current, {
        catalogs: canWriteCatalog,
        scheduleId: saving.scheduleId,
        courseId: saving.courseId,
      });
      if (ok) {
        setSyncStatus("connected");
        setLastSyncedAt(new Date());
      } else {
        setSyncStatus("error");
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [state, canWrite, canWriteCatalog, target]);

  function applyRemote(next: AppState) {
    skipCloudSave.current = true;
    const currentActiveDayId = stateRef.current.activeDayId;
    const keepLocal = next.days.some((d) => d.id === currentActiveDayId);
    const resolvedActiveDayId = keepLocal
      ? currentActiveDayId
      : (next.days.find((d) => d.id === next.activeDayId)?.id ?? next.days[0]?.id ?? next.activeDayId);
    const merged = { ...next, activeDayId: resolvedActiveDayId };
    lastSavedContentRef.current = merged;
    dispatch({ type: "replace", state: merged });
    saveState(merged);
  }

  const refreshFromCloud = useCallback(async () => {
    const current = targetRef.current;
    if (!canRead || !current) return;
    setSyncStatus("saving");
    const remote = await loadRemoteSchedule({ scheduleId: current.scheduleId, courseId: current.courseId });
    if (remote.error || !remote.state) {
      setSyncStatus("error");
      return;
    }
    applyRemote(remote.state);
    setSyncStatus("connected");
    setLastSyncedAt(new Date());
  }, [canRead]);

  const store = useMemo<Store>(
    () => ({
      state,
      dispatch,
      day,
      persistError,
      syncStatus,
      lastSyncedAt,
      refreshFromCloud,
    }),
    [state, day, persistError, syncStatus, lastSyncedAt, refreshFromCloud],
  );

  return <ScheduleContext.Provider value={store}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): Store {
  const store = useContext(ScheduleContext);
  if (!store) throw new Error("useSchedule must be used within ScheduleProvider");
  return store;
}
