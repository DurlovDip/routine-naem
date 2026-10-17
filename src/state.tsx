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
import { createDemoState } from "./lib/demo";
import { scheduleReducer, type Action } from "./lib/reducer";
import { activeDay } from "./lib/schedule";
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
  const cloudOn = isSupabaseConfigured && !isAuthMock;
  const role = auth.session?.role;
  const canWrite =
    cloudOn &&
    (!auth.required || role === "super_admin" || role === "coordinator" || role === "temp_coordinator");
  const canWriteCatalog = cloudOn && (!auth.required || role === "super_admin");
  const canRead = cloudOn;
  const [state, dispatch] = useReducer(scheduleReducer, undefined, initialState);
  const [persistError, setPersistError] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    cloudOn ? "connected" : "unconfigured",
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const day = activeDay(state);
  const isInitialMount = useRef(true);
  const skipCloudSave = useRef(false);
  const stateRef = useRef(state);
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

  // Cloud sync debounced persistence
  useEffect(() => {
    if (!canWrite) {
      return;
    }

    if (skipCloudSave.current) {
      skipCloudSave.current = false;
      return;
    }

    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!navigator.onLine) {
      setSyncStatus("offline");
      return;
    }

    setSyncStatus("saving");
    const timer = window.setTimeout(async () => {
      const ok = await upsertRemoteSchedule(state, { catalogs: canWriteCatalog });
      if (ok) {
        setSyncStatus("connected");
        setLastSyncedAt(new Date());
      } else {
        setSyncStatus("error");
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [state, canWrite, canWriteCatalog]);

  function applyRemote(next: AppState) {
    skipCloudSave.current = true;
    dispatch({ type: "replace", state: next });
    saveState(next);
  }

  // Manual refresh / pull
  const refreshFromCloud = useCallback(async () => {
    if (!canRead) return;
    setSyncStatus("saving");
    const remote = await loadRemoteSchedule();
    if (remote.error || !remote.state) {
      setSyncStatus("error");
      return;
    }
    applyRemote(remote.state);
    setSyncStatus("connected");
    setLastSyncedAt(new Date());
  }, [canRead]);

  // Initial load from cloud and realtime subscription setup
  useEffect(() => {
    if (!canRead) return;

    let mounted = true;

    async function initCloud() {
      if (!navigator.onLine) {
        setSyncStatus("offline");
        return;
      }

      setSyncStatus("saving");
      const remote = await loadRemoteSchedule();
      if (!mounted) return;

      if (remote.error) {
        setSyncStatus("error");
        return;
      }

      if (remote.state) {
        applyRemote(remote.state);
        setSyncStatus("connected");
        setLastSyncedAt(new Date());
      } else if (canWrite) {
        const ok = await upsertRemoteSchedule(stateRef.current, { catalogs: canWriteCatalog });
        if (mounted) {
          setSyncStatus(ok ? "connected" : "error");
          if (ok) setLastSyncedAt(new Date());
        }
      } else if (mounted) {
        setSyncStatus("connected");
      }
    }

    void initCloud();

    // Subscribe to remote changes from other clients
    const unsubscribe = subscribeToRemoteSchedule((remoteState) => {
      if (!mounted) return;
      applyRemote(remoteState);
      setSyncStatus("connected");
      setLastSyncedAt(new Date());
    });

    // Handle online/offline events
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
      if (unsubscribe) unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [canRead, canWrite, canWriteCatalog]);

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
