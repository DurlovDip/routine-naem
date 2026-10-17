export type BaseRole = "super_admin" | "teacher";
export type AppRole = "super_admin" | "coordinator" | "teacher";
export type CoordinationKind = "permanent" | "temporary";

export type Coordination = {
  id: string;
  teacherId: string;
  grantedBy: string | null;
  kind: CoordinationKind;
  startsOn: string | null;
  endsOn: string | null;
  revokedAt: string | null;
};

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

export function isCoordinationActive(row: Coordination, today: string): boolean {
  if (row.revokedAt) return false;
  if (row.kind === "permanent") return true;
  if (!row.startsOn || !row.endsOn) return false;
  return row.startsOn <= today && today <= row.endsOn;
}

export function effectiveRole(
  baseRole: BaseRole,
  teacherId: string | null,
  rows: Coordination[],
  today: string,
): AppRole {
  if (baseRole === "super_admin") return "super_admin";
  if (!teacherId) return "teacher";
  const active = rows.some((row) => row.teacherId === teacherId && isCoordinationActive(row, today));
  return active ? "coordinator" : "teacher";
}

export function roleLabel(role: AppRole): string {
  if (role === "super_admin") return "Super admin";
  if (role === "coordinator") return "Coordinator";
  return "Teacher";
}
