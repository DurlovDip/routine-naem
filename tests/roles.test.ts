import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mockAdminResetPin, mockChangePin, mockResetStore, mockSignIn } from "../src/lib/mockAuth";
import { effectiveRole, missingTeacherColumnNotice, pinError } from "../src/lib/roles";

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

  it("signs in Dr. Litan Kanti Halder with the default PIN 6832", () => {
    mockResetStore();
    const session = mockSignIn("teacher-17", "6832");
    expect(session.teacherName).toBe("Dr. Litan Kanti Halder");
    expect(session.role).toBe("teacher");
    expect(() => mockSignIn("teacher-17", "0000")).toThrowError("That PIN is not correct.");
    mockSignIn("teacher-17", "6832");
    mockChangePin("6832", "1111");
    expect(mockSignIn("teacher-17", "1111").teacherId).toBe("teacher-17");
    expect(() => mockSignIn("teacher-17", "6832")).toThrowError("That PIN is not correct.");
  });

  it("lets a super admin reset a PIN to 6832", () => {
    mockResetStore();
    mockSignIn("teacher-17", "6832");
    mockChangePin("6832", "2222");
    const admin = mockSignIn("superadmin", "6832");
    expect(admin.role).toBe("super_admin");
    mockAdminResetPin("teacher-17", "6832");
    const session = mockSignIn("teacher-17", "6832");
    expect(session.teacherName).toBe("Dr. Litan Kanti Halder");
  });

  it("rejects a PIN that is not 4 digits", () => {
    expect(pinError("6832")).toBeNull();
    expect(pinError("683")).toMatch(/4 digits/);
    expect(pinError("68321")).toMatch(/4 digits/);
    expect(pinError("68a2")).toMatch(/4 digits/);
  });

  it("seeds PIN 6832 in the teacher PIN migration and checks Litan", () => {
    const sql = readFileSync(new URL("../supabase/migration_add_teacher_pin.sql", import.meta.url), "utf8");
    expect(sql).toContain("default '6832'");
    expect(sql).toMatch(/update public\.teachers set pin = '6832'/);
    expect(sql.toLowerCase()).toContain("litan kanti halder");
    expect(sql).toContain("login_with_pin");
    expect(sql).toContain("change_pin");
    expect(sql).toContain("admin_reset_pin");
  });
});
