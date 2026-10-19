export type StoredRole = "super_admin" | "coordinator" | "temp_coordinator" | "teacher";
export type AppRole = StoredRole;

export function todayIso(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function syntheticEmail(username: string): string {
  return `${username}@routine.local`;
}

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function usernameError(username: string): string | null {
  if (!/^[a-z0-9][a-z0-9._-]{1,31}$/.test(username)) {
    return "Use 2–32 characters: letters, numbers, dots, or dashes.";
  }
  return null;
}

export const DEFAULT_PIN = "6832";

export function pinError(pin: string): string | null {
  if (!/^[0-9]{4}$/.test(pin)) return "A PIN is 4 digits.";
  return null;
}

export function effectiveRole(
  role: StoredRole,
  roleStart: string | null,
  roleEnd: string | null,
  today: string,
): AppRole {
  if (role === "super_admin") return "super_admin";
  if (
    (role === "coordinator" || role === "temp_coordinator") &&
    roleStart &&
    roleEnd &&
    roleStart <= today &&
    today <= roleEnd
  ) {
    return role;
  }
  return "teacher";
}

export const AUTH_ROLES_MIGRATION = "supabase/migration_add_auth_roles.sql";

export function missingTeacherColumnNotice(message: string): string | null {
  if (!/does not exist|42703|schema cache/i.test(message)) return null;
  if (!/username|role_start|role_end|auth_user_id|teachers\.role\b/i.test(message)) return null;
  return `The teachers table is missing account columns (username, role, role_start, role_end, auth_user_id). In the Supabase SQL editor, run ${AUTH_ROLES_MIGRATION}. Names can still load from id and name.`;
}

export function roleLabel(role: AppRole): string {
  if (role === "super_admin") return "Super admin";
  if (role === "coordinator") return "Coordinator";
  if (role === "temp_coordinator") return "Temporary coordinator";
  return "Teacher";
}
