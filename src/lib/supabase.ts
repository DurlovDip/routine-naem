import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDemoState } from "./demo";
import { catalogFromModules, formatModuleCode, parseModuleCode, rosterRange } from "./text";
import { normalizeState } from "./storage";
import type { AppState, Batch, ModuleEntry, Teacher } from "./types";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith("http") &&
    supabaseAnonKey.length > 10,
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

export const SCHEDULE_ROW_ID = "default";
export const SCHEDULE_TABLE = "schedules";
export const TEACHERS_TABLE = "teachers";
export const MODULES_TABLE = "modules";
export const BATCHES_TABLE = "batches";

/**
 * Fetch remote state from Supabase, integrating relational tables
 * (teachers, modules, batches) with the main schedule document.
 */
export async function fetchRemoteSchedule(): Promise<AppState | null> {
  if (!supabase) return null;
  try {
    const [scheduleRes, teachersRes, modulesRes, batchesRes] = await Promise.all([
      supabase.from(SCHEDULE_TABLE).select("data").eq("id", SCHEDULE_ROW_ID).maybeSingle(),
      supabase.from(TEACHERS_TABLE).select("id, name").order("name"),
      supabase.from(MODULES_TABLE).select("id, module_number, module_subnumber, module_name").order("id"),
      supabase.from(BATCHES_TABLE).select("id, name, number_of_students").order("id"),
    ]);

    let baseState: AppState | null = null;
    if (scheduleRes.data && scheduleRes.data.data) {
      baseState = normalizeState(scheduleRes.data.data);
    }

    const hasRelational = Boolean(
      (teachersRes.data && teachersRes.data.length > 0) ||
      (modulesRes.data && modulesRes.data.length > 0) ||
      (batchesRes.data && batchesRes.data.length > 0)
    );

    if (!baseState) {
      if (!hasRelational) return null;
      baseState = createDemoState();
    }

    // Merge relational teachers
    if (teachersRes.data && teachersRes.data.length > 0) {
      baseState.teachers = teachersRes.data.map((row: { id: string; name: string }): Teacher => ({
        id: row.id,
        name: row.name,
      }));
    }

    // Merge relational modules
    if (modulesRes.data && modulesRes.data.length > 0) {
      baseState.modules = modulesRes.data.map((row: {
        id: number | string;
        module_number?: string | number;
        module_subnumber?: string | number;
        module_name?: string;
      }): ModuleEntry => {
        const id = String(row.id);
        const mNum = row.module_number !== undefined
          ? String(row.module_number).replace(/^M-\s*/i, "").trim()
          : "";
        const sNum = row.module_subnumber !== undefined
          ? String(row.module_subnumber).replace(/^\./, "").trim()
          : "";
        const name = row.module_name !== undefined ? (row.module_name ?? "") : "";
        const code = formatModuleCode(mNum, sNum);
        return {
          id,
          moduleNumber: mNum,
          moduleSubnumber: sNum,
          moduleName: name,
          code,
          title: name,
        };
      });
      const catalog = catalogFromModules(baseState.modules);
      baseState.moduleNumbers = catalog.moduleNumbers;
      baseState.subNumbers = catalog.subNumbers;
    }

    // Merge relational batches
    if (batchesRes.data && batchesRes.data.length > 0) {
      baseState.batches = batchesRes.data.map((row: {
        id: number | string;
        name: string;
        number_of_students?: number;
      }): Batch => {
        const num = typeof row.id === "number" ? row.id : parseInt(String(row.id).replace(/\D/g, ""), 10) || 1;
        const count = typeof row.number_of_students === "number" ? row.number_of_students : 40;
        return {
          id: `batch-${num}`,
          name: row.name ?? "",
          numberOfStudents: count,
          roster: rosterRange(1, count),
        };
      });
    }

    return baseState;
  } catch (err) {
    console.warn("Failed to connect to Supabase:", err);
    return null;
  }
}

async function syncTeachers(teachers: Teacher[], timestamp: string) {
  if (!supabase) return;
  if (teachers.length > 0) {
    const rows = teachers.map((t) => ({
      id: t.id,
      name: t.name,
      updated_at: timestamp,
    }));
    await supabase.from(TEACHERS_TABLE).upsert(rows, { onConflict: "id" });
  }

  const { data: remoteRows, error } = await supabase.from(TEACHERS_TABLE).select("id");
  if (!error && remoteRows) {
    const activeIds = new Set(teachers.map((t) => t.id));
    const toDelete = remoteRows.map((r: { id: string }) => r.id).filter((id) => !activeIds.has(id));
    if (toDelete.length > 0) {
      await supabase.from(TEACHERS_TABLE).delete().in("id", toDelete);
    }
  }
}

async function syncModules(modules: ModuleEntry[], timestamp: string) {
  if (!supabase) return;
  if (modules.length > 0) {
    const rows = modules.map((m, index) => {
      const numId = parseInt(m.id.replace(/\D/g, ""), 10) || (index + 1);
      const parsed = parseModuleCode(m.code);
      const mNum = m.moduleNumber ?? (parsed ? parsed.moduleNumber.replace(/^M-/, "") : m.code);
      const sNum = m.moduleSubnumber ?? (parsed ? parsed.subNumber.replace(/^\./, "") : "");
      const name = m.moduleName ?? m.title ?? "";
      return {
        id: numId,
        module_number: mNum,
        module_subnumber: sNum,
        module_name: name,
        updated_at: timestamp,
      };
    });
    await supabase.from(MODULES_TABLE).upsert(rows, { onConflict: "id" });
  }

  const { data: remoteRows, error } = await supabase.from(MODULES_TABLE).select("id");
  if (!error && remoteRows) {
    const activeNumIds = new Set(
      modules.map((m, idx) => parseInt(m.id.replace(/\D/g, ""), 10) || (idx + 1)),
    );
    const toDelete = remoteRows
      .map((r: { id: number }) => r.id)
      .filter((id) => !activeNumIds.has(id));
    if (toDelete.length > 0) {
      await supabase.from(MODULES_TABLE).delete().in("id", toDelete);
    }
  }
}

async function syncBatches(batches: Batch[], timestamp: string) {
  if (!supabase) return;
  if (batches.length > 0) {
    const rows = batches.map((b, index) => {
      const numId = parseInt(b.id.replace(/\D/g, ""), 10) || (index + 1);
      return {
        id: numId,
        name: b.name ?? "",
        number_of_students: b.numberOfStudents ?? 40,
        updated_at: timestamp,
      };
    });
    await supabase.from(BATCHES_TABLE).upsert(rows, { onConflict: "id" });
  }

  const { data: remoteRows, error } = await supabase.from(BATCHES_TABLE).select("id");
  if (!error && remoteRows) {
    const activeNumIds = new Set(
      batches.map((b, idx) => parseInt(b.id.replace(/\D/g, ""), 10) || (idx + 1)),
    );
    const toDelete = remoteRows
      .map((r: { id: number }) => r.id)
      .filter((id) => !activeNumIds.has(id));
    if (toDelete.length > 0) {
      await supabase.from(BATCHES_TABLE).delete().in("id", toDelete);
    }
  }
}

/**
 * Persists the schedule state to Supabase:
 * - Saves the full schedule JSON in schedules table
 * - Upserts relational records in teachers, modules, and batches tables
 */
export async function upsertRemoteSchedule(state: AppState): Promise<boolean> {
  if (!supabase) return false;
  try {
    const now = new Date().toISOString();

    const schedulePromise = supabase.from(SCHEDULE_TABLE).upsert(
      {
        id: SCHEDULE_ROW_ID,
        data: state,
        updated_at: now,
      },
      { onConflict: "id" },
    );

    const [scheduleRes] = await Promise.all([
      schedulePromise,
      syncTeachers(state.teachers, now).catch((err) => console.warn("Sync teachers failed:", err)),
      syncModules(state.modules, now).catch((err) => console.warn("Sync modules failed:", err)),
      syncBatches(state.batches, now).catch((err) => console.warn("Sync batches failed:", err)),
    ]);

    if (scheduleRes.error) {
      console.error("Error saving schedule to Supabase:", scheduleRes.error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to upload schedule to Supabase:", err);
    return false;
  }
}

/**
 * Subscribes to real-time changes across schedules, teachers, modules, and batches tables.
 */
export function subscribeToRemoteSchedule(
  onUpdate: (state: AppState) => void,
): (() => void) | null {
  if (!supabase) return null;

  try {
    const channel = supabase
      .channel("routine-realtime-channel")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: SCHEDULE_TABLE,
          filter: `id=eq.${SCHEDULE_ROW_ID}`,
        },
        async (payload) => {
          const raw =
            payload.new && typeof payload.new === "object" && "data" in payload.new
              ? (payload.new as { data: unknown }).data
              : null;
          if (raw) {
            const next = normalizeState(raw);
            if (next) onUpdate(next);
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: TEACHERS_TABLE,
        },
        async () => {
          const latest = await fetchRemoteSchedule();
          if (latest) onUpdate(latest);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: MODULES_TABLE,
        },
        async () => {
          const latest = await fetchRemoteSchedule();
          if (latest) onUpdate(latest);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: BATCHES_TABLE,
        },
        async () => {
          const latest = await fetchRemoteSchedule();
          if (latest) onUpdate(latest);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  } catch (err) {
    console.warn("Failed to subscribe to Supabase changes:", err);
    return null;
  }
}
