import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type Dispatch, type ReactNode } from "react";
import { useAuth } from "./auth";
import { screenshotMode } from "./flags";
import { createScreenshotState } from "./fixture";
import { createInitialState } from "./lib/demo";
import { footerSigneePatch, signeeFromTeacher } from "./lib/footerDefaults";
import { scheduleReducer, type Action } from "./lib/reducer";
import { canEditSchedule } from "./lib/roles";
import { activeDay } from "./lib/schedule";
import { normalizeState } from "./lib/storage";
import { BUILTIN_DESIGNATIONS } from "./lib/designations";
import { loadRemoteSchedule, subscribeToRemoteSchedule, upsertRemoteSchedule, type RemoteLoad } from "./lib/supabase";
import type { AppState, DayPlan } from "./lib/types";

const CACHE_KEY = "routine-naem-schedule-cache";

export type SyncStatus = "connected" | "saving" | "error" | "local";

type Store = {
  state: AppState;
  dispatch: Dispatch<Action>;
  day: DayPlan;
  hydrated: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  designations: string[];
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
  const [syncError, setSyncError] = useState<string | null>(null);
  const [designations, setDesignations] = useState<string[]>([...BUILTIN_DESIGNATIONS]);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const skipCloudSave = useRef(false);
  const cloudReady = useRef(screenshotMode);
  const signeeApplied = useRef(false);
  const [scheduleReady, setScheduleReady] = useState(screenshotMode);
  const [scheduleEpoch, setScheduleEpoch] = useState(0);
  const dirtyDuringLoad = useRef(false);
  const remoteApplied = useRef(false);
  const stateRef = useRef(state);
  const prevUser = useRef<string | null>(null);
  stateRef.current = state;

  const role = auth.session?.role;
  const realSession = Boolean(auth.session);
  const canWrite = realSession && canEditSchedule(role ?? null);
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
    signeeApplied.current = false;
    if (!screenshotMode) setScheduleReady(false);
  }, [auth.session?.userId]);

  useEffect(() => {
    if (!hydrated || !scheduleReady || !canWrite || !auth.session || signeeApplied.current) return;
    signeeApplied.current = true;
    const patch = footerSigneePatch(
      stateRef.current.footer,
      signeeFromTeacher(auth.session, stateRef.current.teachers),
    );
    if (patch) dispatch({ type: "set-footer", patch });
  }, [hydrated, scheduleReady, scheduleEpoch, canWrite, auth.session, state.footer.name, state.footer.designation, state.teachers]);

  useEffect(() => {
    const id = auth.session?.userId ?? null;
    if (prevUser.current && !id && !screenshotMode) {
      skipCloudSave.current = true;
      remoteApplied.current = false;
      dispatch({ type: "replace", state: createInitialState() });
      void AsyncStorage.removeItem(CACHE_KEY);
      setSyncError(null);
      setSyncStatus("local");
    }
    prevUser.current = id;
  }, [auth.session?.userId]);

  const applyRemote = useCallback((next: AppState) => {
    remoteApplied.current = true;
    skipCloudSave.current = true;
    signeeApplied.current = false;
    setScheduleEpoch((value) => value + 1);
    dispatch({ type: "replace", state: next });
  }, []);

  const noteRemote = useCallback((remote: RemoteLoad) => {
    setDesignations(remote.designations);
    if (remote.state && !dirtyDuringLoad.current) applyRemote(remote.state);
    if (remote.error || !remote.state) {
      setSyncError(remote.error ?? "No schedule was returned.");
      setSyncStatus("error");
      return false;
    }
    setSyncError(null);
    setSyncStatus("connected");
    setLastSyncedAt(new Date());
    return true;
  }, [applyRemote]);

  const publish = useCallback(async () => {
    const result = await upsertRemoteSchedule(stateRef.current, { catalogs: canWriteCatalog });
    setSyncStatus(result.ok ? "connected" : "error");
    setSyncError(result.error);
    if (result.ok) setLastSyncedAt(new Date());
    return result.ok;
  }, [canWriteCatalog]);

  const refreshFromCloud = useCallback(async () => {
    if (!realSession || screenshotMode) return;
    setSyncStatus("saving");
    const remote = await loadRemoteSchedule();
    if (remote.error && !remote.state) {
      setDesignations(remote.designations);
      setSyncError(remote.error);
      setSyncStatus("error");
      return;
    }
    noteRemote(remote);
  }, [realSession, noteRemote]);

  useEffect(() => {
    if (!hydrated || !auth.ready || !realSession || screenshotMode) return;
    let mounted = true;
    void (async () => {
      setSyncStatus("saving");
      const remote = await loadRemoteSchedule();
      if (!mounted) return;
      setDesignations(remote.designations);
      if (remote.error && !remote.state) {
        setSyncError(remote.error);
        setSyncStatus("error");
        if (mounted) setScheduleReady(true);
        return;
      }
      cloudReady.current = true;
      if (mounted) setScheduleReady(true);
      if (dirtyDuringLoad.current) {
        if (mounted) await publish();
        return;
      }
      if (remote.state) {
        applyRemote(remote.state);
        if (!mounted) return;
        setSyncError(remote.error);
        setSyncStatus(remote.error ? "error" : "connected");
        if (!remote.error) setLastSyncedAt(new Date());
        return;
      }
      if (canWrite) {
        if (mounted) await publish();
        return;
      }
      setSyncError(null);
      setSyncStatus("connected");
    })();
    const unsubscribe = subscribeToRemoteSchedule((remote) => {
      if (!mounted || dirtyDuringLoad.current) return;
      setDesignations(remote.designations);
      if (remote.state) applyRemote(remote.state);
      if (remote.error || !remote.state) {
        setSyncError(remote.error ?? "No schedule was returned.");
        setSyncStatus("error");
        return;
      }
      setSyncError(null);
      setSyncStatus("connected");
      setLastSyncedAt(new Date());
    });
    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [hydrated, auth.ready, realSession, auth.session?.userId, canWrite, applyRemote, publish]);

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
      void publish();
    }, 600);
    return () => clearTimeout(timer);
  }, [state, hydrated, canWrite, publish]);

  return (
    <ScheduleContext.Provider value={{ state, dispatch, day, hydrated, syncStatus, syncError, designations, lastSyncedAt, refreshFromCloud }}>
      {children}
    </ScheduleContext.Provider>
  );
}

export function useSchedule(): Store {
  const value = useContext(ScheduleContext);
  if (!value) throw new Error("useSchedule must be used inside ScheduleProvider");
  return value;
}
