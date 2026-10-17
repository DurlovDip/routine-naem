import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type Dispatch,
  type ReactNode,
} from "react";
import { createDemoState } from "./lib/demo";
import { scheduleReducer, type Action } from "./lib/reducer";
import { activeDay } from "./lib/schedule";
import { loadState, saveState } from "./lib/storage";
import type { AppState, DayPlan } from "./lib/types";

type Store = {
  state: AppState;
  dispatch: Dispatch<Action>;
  day: DayPlan;
  persistError: boolean;
};

const ScheduleContext = createContext<Store | null>(null);

function initialState(): AppState {
  return loadState() ?? createDemoState();
}

export function ScheduleProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(scheduleReducer, undefined, initialState);
  const [persistError, setPersistError] = useState(false);
  const day = activeDay(state);

  useEffect(() => {
    const timer = window.setTimeout(() => setPersistError(!saveState(state)), 180);
    return () => window.clearTimeout(timer);
  }, [state]);

  const store = useMemo<Store>(
    () => ({ state, dispatch, day, persistError }),
    [state, day, persistError],
  );

  return <ScheduleContext.Provider value={store}>{children}</ScheduleContext.Provider>;
}

export function useSchedule(): Store {
  const store = useContext(ScheduleContext);
  if (!store) throw new Error("useSchedule must be used within ScheduleProvider");
  return store;
}
