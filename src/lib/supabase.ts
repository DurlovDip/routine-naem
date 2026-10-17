import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { normalizeState } from "./storage";
import type { AppState } from "./types";

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

export async function fetchRemoteSchedule(): Promise<AppState | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(SCHEDULE_TABLE)
      .select("data")
      .eq("id", SCHEDULE_ROW_ID)
      .maybeSingle();

    if (error) {
      console.warn("Error fetching schedule from Supabase:", error.message);
      return null;
    }

    if (!data || !data.data) return null;
    return normalizeState(data.data);
  } catch (err) {
    console.warn("Failed to connect to Supabase:", err);
    return null;
  }
}

export async function upsertRemoteSchedule(state: AppState): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(SCHEDULE_TABLE).upsert(
      {
        id: SCHEDULE_ROW_ID,
        data: state,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (error) {
      console.error("Error saving schedule to Supabase:", error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to upload schedule to Supabase:", err);
    return false;
  }
}

export function subscribeToRemoteSchedule(
  onUpdate: (state: AppState) => void,
): (() => void) | null {
  if (!supabase) return null;

  try {
    const channel = supabase
      .channel("schedules-sync")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: SCHEDULE_TABLE,
          filter: `id=eq.${SCHEDULE_ROW_ID}`,
        },
        (payload) => {
          const raw = payload.new && typeof payload.new === "object" && "data" in payload.new
            ? (payload.new as { data: unknown }).data
            : null;
          if (raw) {
            const next = normalizeState(raw);
            if (next) onUpdate(next);
          }
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
