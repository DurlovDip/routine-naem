import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createDemoState } from "./demo";
import { catalogFromModules, formatModuleCode, parseModuleCode, rosterRange } from "./text";
import { normalizeState } from "./storage";
import type { AppState, Batch, ModuleEntry, Teacher } from "./types";

const DEFAULT_SUPABASE_URL = "https://cbvtuztqnfjinvwhdvif.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNidnR1enRxbmZqaW52d2hkdmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNTc2NzIsImV4cCI6MjEwNzgzMzY3Mn0.Zk1XcupblUxS09e9dvV1_In8IYiljS7AjqEQ0CtB4Dw";

const supabaseUrl =
  (import.meta.env.VITE_SUPABASE_URL as string | undefined) || DEFAULT_SUPABASE_URL;
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || DEFAULT_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
    supabaseAnonKey &&
    supabaseUrl.startsWith("http") &&
    supabaseAnonKey.length > 10,
);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storage: typeof window === "undefined" ? undefined : window.localStorage,
      },
    })
  : null;

export const SCHEDULE_ROW_ID = "default";
export const SCHEDULE_TABLE = "schedules";

export type ScheduleTarget = {
  scheduleId: string;
  courseId: string | null;
};
export const TEACHERS_TABLE = "teachers";
export const MODULES_TABLE = "modules";
export const BATCHES_TABLE = "batches";

/**
 * Fetch remote state from Supabase, integrating relational tables
 * (teachers, modules, batches) with the main schedule document.
 */
export async function loadRemoteSchedule(
  target?: ScheduleTarget,
): Promise<{ state: AppState | null; error: string | null }> {
  if (!supabase) return { state: null, error: null };
  const scheduleId = target?.scheduleId ?? SCHEDULE_ROW_ID;
  const courseId = target?.courseId ?? null;
  try {
    const schedulePromise = supabase.from(SCHEDULE_TABLE).select("data").eq("id", scheduleId).maybeSingle();
    const modulesPromise = supabase.from(MODULES_TABLE).select("id, module_number, module_subnumber, module_name").order("id");
    let batchesQuery = supabase.from(BATCHES_TABLE).select("id, name, number_of_students").order("id");
    if (courseId) batchesQuery = batchesQuery.eq("course_id", courseId);
    const batchesPromise = batchesQuery;

    let teachersRes: {
      data: Array<{ id: string; name: string; designation?: string }> | null;
      error: { message: string } | null;
    } = await supabase.from(TEACHERS_TABLE).select("id, name, designation").order("name");
    if (teachersRes.error && teachersRes.error.message.includes("designation")) {
      const fallback = await supabase.from(TEACHERS_TABLE).select("id, name").order("name");
      teachersRes = {
        data: fallback.data ? (fallback.data as Array<{ id: string; name: string }>).map((r) => ({ id: r.id, name: r.name, designation: "" })) : null,
        error: fallback.error ? { message: fallback.error.message } : null,
      };
    }

    const [scheduleRes, modulesRes, batchesRes] = await Promise.all([
      schedulePromise,
      modulesPromise,
      batchesPromise,
    ]);

    const failure = scheduleRes.error || teachersRes.error || modulesRes.error || batchesRes.error;
    if (failure) {
      console.warn("Supabase read failed:", failure.message);
      return { state: null, error: failure.message };
    }

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
      if (!hasRelational) return { state: null, error: null };
      baseState = createDemoState();
    }

    // Merge relational teachers
    if (teachersRes.data && teachersRes.data.length > 0) {
      baseState.teachers = teachersRes.data.map((row: { id: string; name: string; designation?: string }): Teacher => ({
        id: row.id,
        name: row.name,
        designation: row.designation || "",
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

    return { state: baseState, error: null };
  } catch (err) {
    console.warn("Failed to connect to Supabase:", err);
    return { state: null, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchRemoteSchedule(): Promise<AppState | null> {
  const result = await loadRemoteSchedule();
  return result.state;
}

async function deleteMissingTeachers(teachers: Teacher[]) {
  if (!supabase || teachers.length === 0) return;
  const { data: remoteRows, error } = await supabase.from(TEACHERS_TABLE).select("id");
  if (error || !remoteRows) return;
  const activeIds = new Set(teachers.map((t) => t.id));
  const toDelete = remoteRows.map((r: { id: string }) => r.id).filter((id) => !activeIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from(TEACHERS_TABLE).delete().in("id", toDelete);
  }
}

async function deleteMissingModules(modules: ModuleEntry[]) {
  if (!supabase || modules.length === 0) return;
  const { data: remoteRows, error } = await supabase.from(MODULES_TABLE).select("id");
  if (error || !remoteRows) return;
  const activeNumIds = new Set(modules.map((m, idx) => parseInt(m.id.replace(/\D/g, ""), 10) || (idx + 1)));
  const toDelete = remoteRows.map((r: { id: number }) => r.id).filter((id) => !activeNumIds.has(id));
  if (toDelete.length > 0) {
    await supabase.from(MODULES_TABLE).delete().in("id", toDelete);
  }
}

async function deleteMissingBatches(batches: Batch[], courseId: string | null) {
  if (!supabase || batches.length === 0) return;
  let query = supabase.from(BATCHES_TABLE).select("id");
  if (courseId) query = query.eq("course_id", courseId);
  const { data: remoteRows, error } = await query;
  if (error || !remoteRows) return;
  const activeNumIds = new Set(batches.map((b, idx) => parseInt(b.id.replace(/\D/g, ""), 10) || (idx + 1)));
  const toDelete = remoteRows.map((r: { id: number }) => r.id).filter((id) => !activeNumIds.has(id));
  if (toDelete.length > 0) {
    let remove = supabase.from(BATCHES_TABLE).delete().in("id", toDelete);
    if (courseId) remove = remove.eq("course_id", courseId);
    await remove;
  }
}

async function syncTeachers(teachers: Teacher[], timestamp: string) {
  if (!supabase || teachers.length === 0) return;

  const rows = teachers.map((t) => ({
    id: t.id,
    name: t.name,
    designation: t.designation || "",
    updated_at: timestamp,
  }));
  const { error: upsertErr } = await supabase.from(TEACHERS_TABLE).upsert(rows, { onConflict: "id" }).select("id");
  if (upsertErr && upsertErr.message.includes("designation")) {
    const fallbackRows = teachers.map((t) => ({
      id: t.id,
      name: t.name,
      updated_at: timestamp,
    }));
    await supabase.from(TEACHERS_TABLE).upsert(fallbackRows, { onConflict: "id" }).select("id");
  }
  await deleteMissingTeachers(teachers);
}

async function syncModules(modules: ModuleEntry[], timestamp: string) {
  if (!supabase || modules.length === 0) return;

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
  await deleteMissingModules(modules);
}

async function syncBatches(batches: Batch[], timestamp: string, courseId: string | null) {
  if (!supabase || batches.length === 0) return;

  const rows = batches.map((b, index) => {
    const numId = parseInt(b.id.replace(/\D/g, ""), 10) || (index + 1);
    return {
      id: numId,
      name: b.name ?? "",
      number_of_students: b.numberOfStudents ?? 40,
      updated_at: timestamp,
      ...(courseId ? { course_id: courseId } : {}),
    };
  });
  await supabase.from(BATCHES_TABLE).upsert(rows, { onConflict: courseId ? "course_id,id" : "id" });
  await deleteMissingBatches(batches, courseId);
}

/**
 * Persists the schedule state to Supabase:
 * - Saves the full schedule JSON in schedules table
 * - Upserts relational records in teachers, modules, and batches tables
 */
export async function upsertRemoteSchedule(
  state: AppState,
  options: { catalogs?: boolean; scheduleId?: string; courseId?: string | null } = {},
): Promise<boolean> {
  if (!supabase) return false;
  try {
    const now = new Date().toISOString();
    const catalogs = options.catalogs !== false;
    const scheduleId = options.scheduleId ?? SCHEDULE_ROW_ID;
    const courseId = options.courseId ?? null;

    if (state.days.length === 0) {
      console.error("Refusing to replace the live schedule with an empty one.");
      return false;
    }

    const schedulePromise = supabase.from(SCHEDULE_TABLE).upsert(
      {
        id: scheduleId,
        data: state,
        updated_at: now,
        ...(courseId ? { course_id: courseId } : {}),
      },
      { onConflict: "id" },
    );

    const [scheduleRes] = await Promise.all([
      schedulePromise,
      catalogs
        ? syncTeachers(state.teachers, now).catch((err) => console.warn("Sync teachers failed:", err))
        : Promise.resolve(),
      catalogs
        ? syncModules(state.modules, now).catch((err) => console.warn("Sync modules failed:", err))
        : Promise.resolve(),
      catalogs
        ? syncBatches(state.batches, now, courseId).catch((err) => console.warn("Sync batches failed:", err))
        : Promise.resolve(),
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
  target?: ScheduleTarget,
): (() => void) | null {
  if (!supabase) return null;
  const scheduleId = target?.scheduleId ?? SCHEDULE_ROW_ID;

  try {
    const channel = supabase
      .channel(`routine-realtime-${scheduleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: SCHEDULE_TABLE,
          filter: `id=eq.${scheduleId}`,
        },
        async () => {
          const latest = await loadRemoteSchedule(target);
          if (latest.state) onUpdate(latest.state);
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
          const latest = await loadRemoteSchedule(target);
          if (latest.state) onUpdate(latest.state);
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
          const latest = await loadRemoteSchedule(target);
          if (latest.state) onUpdate(latest.state);
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
          const latest = await loadRemoteSchedule(target);
          if (latest.state) onUpdate(latest.state);
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

export const BACKUPS_TABLE = "backups";

export type BackupType = "teachers" | "batches" | "modules" | "schedules";
export type BackupOperation = "INSERT" | "UPDATE" | "DELETE" | "SNAPSHOT";

export interface BackupEntry {
  id: number;
  type: BackupType;
  record_id: string | null;
  data: Record<string, unknown>;
  operation: BackupOperation | string;
  created_at: string;
}

/**
 * Fetch immutable backups for recovery or auditing.
 */
export async function fetchBackups(typeFilter?: BackupType, limit = 60): Promise<BackupEntry[]> {
  if (!supabase) return [];
  try {
    let query = supabase
      .from(BACKUPS_TABLE)
      .select("id, type, record_id, data, operation, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (typeFilter) {
      query = query.eq("type", typeFilter);
    }

    const { data, error } = await query;
    if (error || !data) {
      console.warn("Failed to fetch backups:", error);
      return [];
    }
    return data as BackupEntry[];
  } catch (err) {
    console.warn("Error fetching backups:", err);
    return [];
  }
}

/**
 * Restore an accidentally deleted or modified record from the backup system.
 */
export async function restoreRecordFromBackup(
  backup: BackupEntry,
): Promise<{ success: boolean; message: string }> {
  if (!supabase) return { success: false, message: "Supabase is not configured." };

  try {
    const d = backup.data;
    const now = new Date().toISOString();

    if (backup.type === "teachers") {
      const id = String(d.id || backup.record_id || "");
      const name = String(d.name || "");
      if (!id || !name) return { success: false, message: "Missing teacher id or name in backup." };

      const designation = String(d.designation || "");
      const { error } = await supabase
        .from(TEACHERS_TABLE)
        .upsert({ id, name, ...(designation ? { designation } : {}), updated_at: now }, { onConflict: "id" })
        .select("id");
      if (error) throw error;
      return { success: true, message: `Restored teacher "${name}" (${id})` };
    }

    if (backup.type === "modules") {
      const id = typeof d.id === "number" ? d.id : parseInt(String(d.id || backup.record_id), 10);
      if (isNaN(id)) return { success: false, message: "Missing valid module id in backup." };

      const { error } = await supabase.from(MODULES_TABLE).upsert(
        {
          id,
          module_number: String(d.module_number ?? ""),
          module_subnumber: String(d.module_subnumber ?? ""),
          module_name: String(d.module_name ?? ""),
          updated_at: now,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      return {
        success: true,
        message: `Restored module #${id} (M-${d.module_number}.${d.module_subnumber})`,
      };
    }

    if (backup.type === "batches") {
      const id = typeof d.id === "number" ? d.id : parseInt(String(d.id || backup.record_id), 10);
      if (isNaN(id)) return { success: false, message: "Missing valid batch id in backup." };

      const { error } = await supabase.from(BATCHES_TABLE).upsert(
        {
          id,
          name: String(d.name ?? ""),
          number_of_students:
            typeof d.number_of_students === "number" ? d.number_of_students : 40,
          updated_at: now,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      return { success: true, message: `Restored batch #${id}` };
    }

    if (backup.type === "schedules") {
      const payload = d.data || d;
      const { error } = await supabase.from(SCHEDULE_TABLE).upsert(
        {
          id: SCHEDULE_ROW_ID,
          data: payload,
          updated_at: now,
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      return { success: true, message: "Restored full schedule snapshot" };
    }

    return { success: false, message: `Unknown backup type "${backup.type}"` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Failed to restore backup:", err);
    return { success: false, message: `Restore failed: ${msg}` };
  }
}

