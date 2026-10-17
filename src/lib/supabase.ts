import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDemoState } from "./demo";
import { catalogFromModules } from "./text";
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
      supabase.from(MODULES_TABLE).select("id, code, title").order("code"),
      supabase.from(BATCHES_TABLE).select("id, name, roster").order("name"),
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
      baseState.modules = modulesRes.data.map((row: { id: string; code: string; title: string }): ModuleEntry => ({
        id: row.id,
        code: row.code,
        title: row.title ?? "",
      }));
      const catalog = catalogFromModules(baseState.modules);
      baseState.moduleNumbers = catalog.moduleNumbers;
      baseState.subNumbers = catalog.subNumbers;
    }

    // Merge relational batches
    if (batchesRes.data && batchesRes.data.length > 0) {
      baseState.batches = batchesRes.data.map((row: { id: string; name: string; roster: string[] }): Batch => ({
        id: row.id,
        name: row.name,
        roster: Array.isArray(row.roster) ? row.roster : [],
      }));
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
    const rows = modules.map((m) => ({
      id: m.id,
      code: m.code,
      title: m.title || "",
      updated_at: timestamp,
    }));
    await supabase.from(MODULES_TABLE).upsert(rows, { onConflict: "id" });
  }

  const { data: remoteRows, error } = await supabase.from(MODULES_TABLE).select("id");
  if (!error && remoteRows) {
    const activeIds = new Set(modules.map((m) => m.id));
    const toDelete = remoteRows.map((r: { id: string }) => r.id).filter((id) => !activeIds.has(id));
    if (toDelete.length > 0) {
      await supabase.from(MODULES_TABLE).delete().in("id", toDelete);
    }
  }
}

async function syncBatches(batches: Batch[], timestamp: string) {
  if (!supabase) return;
  if (batches.length > 0) {
    const rows = batches.map((b) => ({
      id: b.id,
      name: b.name,
      roster: b.roster,
      updated_at: timestamp,
    }));
    await supabase.from(BATCHES_TABLE).upsert(rows, { onConflict: "id" });
  }

  const { data: remoteRows, error } = await supabase.from(BATCHES_TABLE).select("id");
  if (!error && remoteRows) {
    const activeIds = new Set(batches.map((b) => b.id));
    const toDelete = remoteRows.map((r: { id: string }) => r.id).filter((id) => !activeIds.has(id));
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
