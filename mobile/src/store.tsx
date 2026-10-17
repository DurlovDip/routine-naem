import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type Dispatch, type ReactNode } from "react";
import { useAuth } from "./auth";
import { screenshotMode } from "./flags";
import { createScreenshotState } from "./fixture";
import { createInitialState } from "./lib/demo";
import { scheduleReducer, type Action } from "./lib/reducer";
import { activeDay } from "./lib/schedule";
import { normalizeState } from "./lib/storage";
import { loadRemoteSchedule, subscribeToRemoteSchedule, upsertRemoteSchedule } from "./lib/supabase";
import type { AppState, DayPlan } from "./lib/types";

const CACHE_KEY = "routine-naem-schedule-cache";

export type SyncStatus = "connected" | "saving" | "error" | "local";

type Store = {
  state: AppState;
  dispatch: Dispatch<Action>;
  day: DayPlan;
  hydrated: boolean;
  syncStatus: SyncStatus;
  lastSyncedAt: Date | null;
  refreshFromCloud: () => Promise<void>;
};

const ScheduleContext = createContext<Store | null>(null);

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [state, dispatch] = useReducer(
    scheduleReducer,
    undefined,
    () => (screenshotMode ? createScreenshotState() : createInitialState()),
  );
  const [hydrated, setHydrated] = useState(screenshotMode);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(screenshotMode ? "local" : "connected");
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const skipCloudSave = useRef(false);
  const cloudReady = useRef(screenshotMode);
  const dirtyDuringLoad = useRef(false);
  const remoteApplied = useRef(false);
  const stateRef = useRef(state);
  const prevUser = useRef<string | null>(null);
  stateRef.current = state;

  const role = auth.session?.role;
  const realSession = Boolean(auth.session && auth.session.userId !== "hardcoded-superadmin");
  const canWrite =
    realSession && (role === "super_admin" || role === "coordinator" || role === "temp_coordinator");
  const canWriteCatalog = realSession && role === "super_admin";
  const day = activeDay(state);

  useEffect(() => {
    if (screenshotMode) return;
    let cancelled = false;
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (cancelled || remoteApplied.current || !raw) return;
        const parsed = normalizeState(JSON.parse(raw));
        if (parsed) {
          skipCloudSave.current = true;
          dispatch({ type: "replace", state: parsed });
        }
      } catch {
        // A bad cache should not block the cloud copy.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated || screenshotMode) return;
    const timer = setTimeout(() => {
      void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(state));
    }, 200);
    return () => clearTimeout(timer);
  }, [state, hydrated]);

  useEffect(() => {
    const id = auth.session?.userId ?? null;
    if (prevUser.current && !id && !screenshotMode) {
      skipCloudSave.current = true;
      remoteApplied.current = false;
      dispatch({ type: "replace", state: createInitialState() });
      void AsyncStorage.removeItem(CACHE_KEY);
      setSyncStatus("local");
    }
    prevUser.current = id;
  }, [auth.session?.userId]);

  const applyRemote = useCallback((next: AppState) => {
    remoteApplied.current = true;
    skipCloudSave.current = true;
    dispatch({ type: "replace", state: next });
  }, []);

  const refreshFromCloud = useCallback(async () => {
    if (!realSession || screenshotMode) return;
    setSyncStatus("saving");
    const remote = await loadRemoteSchedule();
    if (remote.error || !remote.state) {
      setSyncStatus("error");
      return;
    }
    applyRemote(remote.state);
    setSyncStatus("connected");
    setLastSyncedAt(new Date());
  }, [realSession, applyRemote]);

  useEffect(() => {
    if (!hydrated || !auth.ready || !realSession || screenshotMode) {
      if (auth.ready && auth.session && !realSession) setSyncStatus("local");
      return;
    }
    let mounted = true;
    void (async () => {
      setSyncStatus("saving");
      const remote = await loadRemoteSchedule();
      if (!mounted) return;
      cloudReady.current = true;
      if (remote.error) {
        setSyncStatus("error");
        return;
      }
      if (dirtyDuringLoad.current) {
        const ok = await upsertRemoteSchedule(stateRef.current, { catalogs: canWriteCatalog });
        if (!mounted) return;
        setSyncStatus(ok ? "connected" : "error");
        if (ok) setLastSyncedAt(new Date());
        return;
      }
      if (remote.state) {
        applyRemote(remote.state);
        setSyncStatus("connected");
        setLastSyncedAt(new Date());
        return;
      }
      if (canWrite) {
        const ok = await upsertRemoteSchedule(stateRef.current, { catalogs: canWriteCatalog });
        if (!mounted) return;
        setSyncStatus(ok ? "connected" : "error");
        if (ok) setLastSyncedAt(new Date());
        return;
      }
      setSyncStatus("connected");
    })();
    const unsubscribe = subscribeToRemoteSchedule((remoteState) => {
      if (!mounted) return;
      applyRemote(remoteState);
      setSyncStatus("connected");
      setLastSyncedAt(new Date());
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [hydrated, auth.ready, realSession, auth.session?.userId, canWrite, canWriteCatalog, applyRemote]);

  const hydratedStateSeen = useRef(false);
  useEffect(() => {
    if (!hydrated || screenshotMode) return;
    if (!hydratedStateSeen.current) {
      hydratedStateSeen.current = true;
      return;
    }
    if (!cloudReady.current && canWrite) dirtyDuringLoad.current = true;
  }, [state, hydrated, canWrite]);

  useEffect(() => {
    if (!hydrated || !canWrite || screenshotMode) return;
    if (!cloudReady.current) return;
    if (skipCloudSave.current) {
      skipCloudSave.current = false;
      return;
    }
    dirtyDuringLoad.current = false;
    setSyncStatus("saving");
    const timer = setTimeout(() => {
      void upsertRemoteSchedule(stateRef.current, { catalogs: canWriteCatalog }).then((ok) => {
        setSyncStatus(ok ? "connected" : "error");
        if (ok) setLastSyncedAt(new Date());
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [state, hydrated, canWrite, canWriteCatalog]);

  return (
    <ScheduleContext.Provider value={{ state, dispatch, day, hydrated, syncStatus, lastSyncedAt, refreshFromCloud }}>
      {children}
    </ScheduleContext.Provider>
  );
}

export function useSchedule(): Store {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error("useSchedule must be used inside ScheduleProvider");
  return value;
}
