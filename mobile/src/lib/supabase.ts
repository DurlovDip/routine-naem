import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { BUILTIN_DESIGNATIONS, designationChoices } from "./designations";
import { createDemoState } from "./demo";
import { catalogFromModules, formatModuleCode, parseModuleCode, rosterRange } from "./text";
import { normalizeState } from "./storage";
import type { AppState, Batch, ModuleEntry, Teacher } from "./types";

/** Same project the web app falls back to when VITE_SUPABASE_* is unset. */
export const SUPABASE_URL = "https://cbvtuztqnfjinvwhdvif.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNidnR1enRxbmZqaW52d2hkdmlmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIyNTc2NzIsImV4cCI6MjEwNzgzMzY3Mn0.Zk1XcupblUxS09e9dvV1_In8IYiljS7AjqEQ0CtB4Dw";

export const isSupabaseConfigured = true;

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});

export const SCHEDULE_ROW_ID = "default";
export const SCHEDULE_TABLE = "schedules";

export type ScheduleTarget = {
  scheduleId: string;
  courseId: string | null;
};
export const TEACHERS_TABLE = "teachers";
export const MODULES_TABLE = "modules";
export const BATCHES_TABLE = "batches";
export const DESIGNATIONS_TABLE = "designations";

export type RemoteLoad = {
  state: AppState | null;
  error: string | null;
  designations: string[];
  designationError: string | null;
};

type QueryError = { message: string } | null;

function problem(label: string, error: QueryError): string | null {
  return error ? `${label}: ${error.message}` : null;
}

function mapModules(rows: Array<{
  id: number | string;
  module_number?: string | number;
  module_subnumber?: string | number;
  module_name?: string;
}>): ModuleEntry[] {
  return rows.map((row) => {
    const id = String(row.id);
    const mNum = row.module_number !== undefined ? String(row.module_number).replace(/^M-\s*/i, "").trim() : "";
    const sNum = row.module_subnumber !== undefined ? String(row.module_subnumber).replace(/^\./, "").trim() : "";
    const name = row.module_name !== undefined ? (row.module_name ?? "") : "";
    return {
      id,
      moduleNumber: mNum,
      moduleSubnumber: sNum,
      moduleName: name,
      code: formatModuleCode(mNum, sNum),
      title: name,
    };
  });
}

function mapBatches(rows: Array<{ id: number | string; name: string; number_of_students?: number }>): Batch[] {
  return rows.map((row) => {
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

/**
 * Fetch the schedule document and the relational tables.
 * A failed table is reported and does not discard data that did load.
 * Empty batches or modules tables keep the copies stored in schedules.data.
 */
export async function loadRemoteSchedule(target?: ScheduleTarget): Promise<RemoteLoad> {
  const scheduleId = target?.scheduleId ?? SCHEDULE_ROW_ID;
  const courseId = target?.courseId ?? null;
  const fallbackDesignations: string[] = [...BUILTIN_DESIGNATIONS];
  try {
    let batchesQuery = supabase.from(BATCHES_TABLE).select("id, name, number_of_students").order("id");
    if (courseId) batchesQuery = batchesQuery.eq("course_id", courseId);
    const [scheduleRes, teachersFirst, modulesRes, batchesRes, designationsRes] = await Promise.all([
      supabase.from(SCHEDULE_TABLE).select("data").eq("id", scheduleId).maybeSingle(),
      supabase.from(TEACHERS_TABLE).select("id, name, designation").order("name"),
      supabase.from(MODULES_TABLE).select("id, module_number, module_subnumber, module_name").order("id"),
      batchesQuery,
      supabase.from(DESIGNATIONS_TABLE).select("id, name").order("name"),
    ]);

    let teachersRes: {
      data: Array<{ id: string; name: string; designation?: string }> | null;
      error: QueryError;
    } = teachersFirst;
    if (teachersRes.error && /designation/i.test(teachersRes.error.message)) {
      const fallback = await supabase.from(TEACHERS_TABLE).select("id, name").order("name");
      teachersRes = {
        data: fallback.data
          ? (fallback.data as Array<{ id: string; name: string }>).map((row) => ({ ...row, designation: "" }))
          : null,
        error: fallback.error,
      };
    }

    const problems = [
      problem("Schedule", scheduleRes.error),
      problem("Teachers", teachersRes.error),
      problem("Modules", modulesRes.error),
      problem("Batches", batchesRes.error),
    ].filter((item): item is string => Boolean(item));

    let designationError: string | null = null;
    let designations = fallbackDesignations;
    if (designationsRes.error) {
      designationError = `Designations: ${designationsRes.error.message}`;
      problems.push(designationError);
    } else if (designationsRes.data && designationsRes.data.length > 0) {
      const names = designationsRes.data.map((row) => String((row as { name?: string }).name ?? "").trim()).filter(Boolean);
      if (names.length > 0) designations = names;
    }

    let baseState: AppState | null = null;
    if (!scheduleRes.error && scheduleRes.data?.data) {
      baseState = normalizeState(scheduleRes.data.data);
      if (!baseState) problems.push("Schedule: saved data could not be read.");
    }

    const teachers =
      !teachersRes.error && teachersRes.data && teachersRes.data.length > 0
        ? teachersRes.data.map(
            (row): Teacher => ({
              id: row.id,
              name: row.name,
              designation: row.designation || "",
            }),
          )
        : null;
    const modules = !modulesRes.error && modulesRes.data && modulesRes.data.length > 0 ? mapModules(modulesRes.data) : null;
    const batches = !batchesRes.error && batchesRes.data && batchesRes.data.length > 0 ? mapBatches(batchesRes.data) : null;

    if (!baseState && (teachers || modules || batches)) {
      baseState = createDemoState();
    }

    if (baseState) {
      if (teachers) baseState.teachers = teachers;
      if (modules) {
        baseState.modules = modules;
        const catalog = catalogFromModules(baseState.modules);
        baseState.moduleNumbers = catalog.moduleNumbers;
        baseState.subNumbers = catalog.subNumbers;
      }
      if (batches && (!baseState.batches || baseState.batches.length === 0)) {
        baseState.batches = batches;
      }
      designations = designationChoices(
        designations,
        baseState.teachers.map((teacher) => teacher.designation),
      );
    }

    const error = problems.length > 0 ? problems.join("\n") : null;
    if (error) console.warn("Supabase read:", error);
    return { state: baseState, error, designations, designationError };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn("Failed to connect to Supabase:", err);
    return { state: null, error: message, designations: fallbackDesignations, designationError: message };
  }
}

export async function fetchRemoteSchedule(): Promise<AppState | null> {
  const result = await loadRemoteSchedule();
  return result.state;
}

async function deleteMissingTeachers(_teachers: Teacher[]): Promise<string | null> {
  // Institutional teachers are directory accounts managed via admin RPCs and must never be deleted by a routine save.
  return null;
}

async function deleteMissingModules(modules: ModuleEntry[]): Promise<string | null> {
  if (modules.length === 0) return null;
  const { data: remoteRows, error } = await supabase.from(MODULES_TABLE).select("id");
  if (error) {
    if (/permission denied|violates row-level security|policy/i.test(error.message)) return null;
    return `Modules: ${error.message}`;
  }
  if (!remoteRows) return null;
  const activeNumIds = new Set(modules.map((m, idx) => parseInt(m.id.replace(/\D/g, ""), 10) || (idx + 1)));
  const toDelete = remoteRows.map((r: { id: number }) => r.id).filter((id) => !activeNumIds.has(id));
  if (toDelete.length === 0) return null;
  const { error: deleteErr } = await supabase.from(MODULES_TABLE).delete().in("id", toDelete);
  if (deleteErr && /permission denied|violates row-level security|policy/i.test(deleteErr.message)) return null;
  return deleteErr ? `Modules: ${deleteErr.message}` : null;
}

async function deleteMissingBatches(batches: Batch[], courseId: string | null): Promise<string | null> {
  if (batches.length === 0) return null;
  let query = supabase.from(BATCHES_TABLE).select("id");
  if (courseId) query = query.eq("course_id", courseId);
  const { data: remoteRows, error } = await query;
  if (error) {
    if (/permission denied|violates row-level security|policy/i.test(error.message)) return null;
    return `Batches: ${error.message}`;
  }
  if (!remoteRows) return null;
  const activeNumIds = new Set(batches.map((b, idx) => parseInt(b.id.replace(/\D/g, ""), 10) || (idx + 1)));
  const toDelete = remoteRows.map((r: { id: number }) => r.id).filter((id) => !activeNumIds.has(id));
  if (toDelete.length === 0) return null;
  let remove = supabase.from(BATCHES_TABLE).delete().in("id", toDelete);
  if (courseId) remove = remove.eq("course_id", courseId);
  const { error: deleteErr } = await remove;
  if (deleteErr && /permission denied|violates row-level security|policy/i.test(deleteErr.message)) return null;
  return deleteErr ? `Batches: ${deleteErr.message}` : null;
}

async function syncTeachers(teachers: Teacher[], timestamp: string): Promise<string | null> {
  if (teachers.length === 0) return null;

  try {
    const rows = teachers.map((t) => ({
      id: t.id,
      name: t.name,
      designation: t.designation || "",
      updated_at: timestamp,
    }));
    const { error: upsertErr } = await supabase.from(TEACHERS_TABLE).upsert(rows, { onConflict: "id" }).select("id");
    if (upsertErr) {
      if (/permission denied|violates row-level security|policy/i.test(upsertErr.message)) {
        return null;
      }
      if (/designation/i.test(upsertErr.message)) {
        const fallbackRows = teachers.map((t) => ({
          id: t.id,
          name: t.name,
          updated_at: timestamp,
        }));
        const { error: fallbackErr } = await supabase.from(TEACHERS_TABLE).upsert(fallbackRows, { onConflict: "id" }).select("id");
        if (fallbackErr) {
          if (/permission denied|violates row-level security|policy/i.test(fallbackErr.message)) return null;
          return `Teachers: ${fallbackErr.message}`;
        }
      } else {
        return `Teachers: ${upsertErr.message}`;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function syncModules(modules: ModuleEntry[], timestamp: string): Promise<string | null> {
  if (modules.length === 0) return null;

  try {
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
    const { error: upsertErr } = await supabase.from(MODULES_TABLE).upsert(rows, { onConflict: "id" });
    if (upsertErr) {
      if (/permission denied|violates row-level security|policy/i.test(upsertErr.message)) return null;
      return `Modules: ${upsertErr.message}`;
    }
    return deleteMissingModules(modules);
  } catch {
    return null;
  }
}

async function syncBatches(batches: Batch[], timestamp: string, courseId: string | null): Promise<string | null> {
  if (batches.length === 0) return null;

  try {
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
    const { error: upsertErr } = await supabase.from(BATCHES_TABLE).upsert(rows, { onConflict: courseId ? "course_id,id" : "id" });
    if (upsertErr) {
      if (/permission denied|violates row-level security|policy/i.test(upsertErr.message)) return null;
      return `Batches: ${upsertErr.message}`;
    }
    return deleteMissingBatches(batches, courseId);
  } catch {
    return null;
  }
}


/**
 * Persists the schedule state to Supabase:
 * - Saves the full schedule JSON in schedules table
 * - Best-effort syncs relational records in teachers, modules, and batches tables
 */
export async function upsertRemoteSchedule(
  state: AppState,
  options: { catalogs?: boolean; scheduleId?: string; courseId?: string | null } = {},
): Promise<{ ok: boolean; error: string | null }> {
  try {
    const now = new Date().toISOString();
    const catalogs = options.catalogs === true;
    const scheduleId = options.scheduleId ?? SCHEDULE_ROW_ID;
    const courseId = options.courseId ?? null;
    const skipped: Promise<string | null> = Promise.resolve(null);

    if (state.days.length === 0) {
      return { ok: false, error: "Refusing to replace the live schedule with an empty one." };
    }

    const [scheduleRes, teachersError, modulesError, batchesError] = await Promise.all([
      supabase.from(SCHEDULE_TABLE).upsert(
        {
          id: scheduleId,
          data: state,
          updated_at: now,
          ...(courseId ? { course_id: courseId } : {}),
        },
        { onConflict: "id" },
      ),
      catalogs ? syncTeachers(state.teachers, now) : skipped,
      catalogs ? syncModules(state.modules, now) : skipped,
      catalogs ? syncBatches(state.batches, now, courseId) : skipped,
    ]);

    if (scheduleRes.error) {
      console.error("Error saving schedule to Supabase:", scheduleRes.error.message);
      return { ok: false, error: scheduleRes.error.message };
    }

    const catalogWarnings = [teachersError, modulesError, batchesError].filter(Boolean);
    if (catalogWarnings.length > 0) {
      console.warn("Catalog sync skipped or restricted:", catalogWarnings.join("; "));
    }

    return { ok: true, error: null };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.error("Failed to upload schedule to Supabase:", err);
    return { ok: false, error };
  }
}

/**
 * Subscribes to real-time changes across schedules, teachers, modules, and batches tables.
 */
export function subscribeToRemoteSchedule(
  onUpdate: (result: RemoteLoad) => void,
  target?: ScheduleTarget,
): (() => void) | null {
  if (!supabase) return null;
  const scheduleId = target?.scheduleId ?? SCHEDULE_ROW_ID;

  try {
    const channel = supabase
      .channel(`routine-mobile-${scheduleId}-${Date.now()}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: SCHEDULE_TABLE,
          filter: `id=eq.${scheduleId}`,
        },
        async () => {
          onUpdate(await loadRemoteSchedule(target));
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
          onUpdate(await loadRemoteSchedule(target));
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
          onUpdate(await loadRemoteSchedule(target));
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
          onUpdate(await loadRemoteSchedule(target));
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

