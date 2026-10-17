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
import { createDemoState } from "./lib/demo";
import { scheduleReducer, type Action } from "./lib/reducer";
import { activeDay } from "./lib/schedule";
import { loadState, saveState } from "./lib/storage";
import {
  fetchRemoteSchedule,
  isSupabaseConfigured,
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
  const [state, dispatch] = useReducer(scheduleReducer, undefined, initialState);
  const [persistError, setPersistError] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() =>
    isSupabaseConfigured ? "connected" : "unconfigured",
  );
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const day = activeDay(state);
  const isInitialMount = useRef(true);
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
    if (!isSupabaseConfigured) {
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
      const ok = await upsertRemoteSchedule(state);
      if (ok) {
        setSyncStatus("connected");
        setLastSyncedAt(new Date());
      } else {
        setSyncStatus("error");
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [state]);

  // Manual refresh / pull
  const refreshFromCloud = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    setSyncStatus("saving");
    const remote = await fetchRemoteSchedule();
    if (remote) {
      dispatch({ type: "replace", state: remote });
      saveState(remote);
      setSyncStatus("connected");
      setLastSyncedAt(new Date());
    } else {
      setSyncStatus("error");
    }
  }, []);

  // Initial load from cloud and realtime subscription setup
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let mounted = true;

    async function initCloud() {
      if (!navigator.onLine) {
        setSyncStatus("offline");
        return;
      }

      setSyncStatus("saving");
      const remote = await fetchRemoteSchedule();
      if (!mounted) return;

      if (remote) {
        dispatch({ type: "replace", state: remote });
        saveState(remote);
        setSyncStatus("connected");
        setLastSyncedAt(new Date());
      } else {
        // If table is empty, seed it with the current local state
        const ok = await upsertRemoteSchedule(stateRef.current);
        if (mounted) {
          setSyncStatus(ok ? "connected" : "error");
          if (ok) setLastSyncedAt(new Date());
        }
      }
    }

    void initCloud();

    // Subscribe to remote changes from other clients
    const unsubscribe = subscribeToRemoteSchedule((remoteState) => {
      if (!mounted) return;
      dispatch({ type: "replace", state: remoteState });
      saveState(remoteState);
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
  }, []);

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
