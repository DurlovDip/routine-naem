import { describe, expect, it } from "vitest";
import { effectiveRole, missingTeacherColumnNotice } from "../src/lib/roles";

describe("effective role", () => {
  it("keeps a super admin active without dates", () => {
    expect(effectiveRole("super_admin", null, null, "2026-10-18")).toBe("super_admin");
  });

  it("includes the start and end dates for a coordinator", () => {
    expect(effectiveRole("coordinator", "2026-10-18", "2026-10-20", "2026-10-17")).toBe("teacher");
    expect(effectiveRole("coordinator", "2026-10-18", "2026-10-20", "2026-10-18")).toBe("coordinator");
    expect(effectiveRole("coordinator", "2026-10-18", "2026-10-20", "2026-10-20")).toBe("coordinator");
    expect(effectiveRole("coordinator", "2026-10-18", "2026-10-20", "2026-10-21")).toBe("teacher");
  });

  it("treats a temporary coordinator as its own role inside the range", () => {
    expect(effectiveRole("temp_coordinator", "2026-10-01", "2026-10-31", "2026-10-18")).toBe("temp_coordinator");
    expect(effectiveRole("temp_coordinator", "2026-10-01", "2026-10-31", "2026-11-01")).toBe("teacher");
  });

  it("names the auth migration only when an account column is missing", () => {
    const notice = missingTeacherColumnNotice("column teachers.username does not exist");
    expect(notice).toContain("supabase/migration_add_auth_roles.sql");
    expect(missingTeacherColumnNotice("column teachers.designation does not exist")).toBeNull();
    expect(missingTeacherColumnNotice("Only a super admin can open the role list")).toBeNull();
  });

  it("falls back when a dated role is missing either date", () => {
    expect(effectiveRole("coordinator", null, "2026-10-20", "2026-10-18")).toBe("teacher");
    expect(effectiveRole("teacher", "2026-10-01", "2026-10-31", "2026-10-18")).toBe("teacher");
  });

  it("authenticates hardcoded superadmin with superadmin / 19521971", async () => {
    const { mockSignIn } = await import("../src/lib/mockAuth");
    const session = mockSignIn("superadmin", "19521971");
    expect(session.role).toBe("super_admin");
    expect(session.username).toBe("superadmin");

    expect(() => mockSignIn("superadmin", "wrongpass")).toThrowError("Incorrect password for superadmin.");
  });
});
