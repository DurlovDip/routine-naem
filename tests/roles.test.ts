import { describe, expect, it } from "vitest";
import { effectiveRole, isCoordinationActive, type Coordination } from "../src/lib/roles";

function row(patch: Partial<Coordination>): Coordination {
  return {
    id: "c1",
    teacherId: "teacher-2",
    grantedBy: "user-1",
    kind: "temporary",
    startsOn: "2026-10-18",
    endsOn: "2026-10-20",
    revokedAt: null,
    ...patch,
  };
}

describe("effective role", () => {
  const today = "2026-10-18";

  it("keeps a super admin above any coordination row", () => {
    expect(effectiveRole("super_admin", "teacher-1", [row({ teacherId: "teacher-1", kind: "permanent", startsOn: null, endsOn: null })], today)).toBe(
      "super_admin",
    );
  });

  it("treats a permanent row as coordinator", () => {
    const permanent = row({ kind: "permanent", startsOn: null, endsOn: null });
    expect(effectiveRole("teacher", "teacher-2", [permanent], today)).toBe("coordinator");
  });

  it("includes the start and end dates, then expires", () => {
    const temporary = row({});
    expect(isCoordinationActive(temporary, "2026-10-17")).toBe(false);
    expect(isCoordinationActive(temporary, "2026-10-18")).toBe(true);
    expect(isCoordinationActive(temporary, "2026-10-20")).toBe(true);
    expect(isCoordinationActive(temporary, "2026-10-21")).toBe(false);
    expect(effectiveRole("teacher", "teacher-2", [temporary], "2026-10-21")).toBe("teacher");
  });

  it("ignores a revoked row", () => {
    const revoked = row({ kind: "permanent", startsOn: null, endsOn: null, revokedAt: "2026-10-01T00:00:00Z" });
    expect(effectiveRole("teacher", "teacher-2", [revoked], today)).toBe("teacher");
  });
});
