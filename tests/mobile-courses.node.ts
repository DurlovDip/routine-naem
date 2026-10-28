import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { pickDefaultCourse, screenshotCourses } from "../mobile/src/lib/courses.ts";

describe("mobile course switcher", () => {
  it("defaults a coordinator to the newest active assigned course", () => {
    const visible = screenshotCourses("coordinator");
    assert.deepEqual(
      visible.map((course) => course.name),
      ["Advanced Course on Skill Development", "Foundation Course"],
    );
    assert.equal(pickDefaultCourse(visible, null)?.id, "course-acsd");
    assert.equal(pickDefaultCourse(visible, "course-foundation")?.name, "Foundation Course");
    assert.equal(screenshotCourses("teacher").every((course) => !course.canEdit), true);
    assert.equal(screenshotCourses("teacher").some((course) => course.status === "ended"), true);
    const adminCourses = screenshotCourses("super_admin");
    assert.deepEqual(
      adminCourses.map((course) => course.status),
      ["active", "active", "ended", "inactive"],
    );
    assert.equal(adminCourses.every((course) => course.canEdit), true);
  });

  it("keeps course writes on the same paths as the website", () => {
    const courses = readFileSync(new URL("../mobile/src/courses.tsx", import.meta.url), "utf8");
    const admin = readFileSync(new URL("../mobile/app/(main)/admin.tsx", import.meta.url), "utf8");
    const panel = readFileSync(new URL("../mobile/src/CoursesPanel.tsx", import.meta.url), "utf8");
    assert.match(courses, /rpc\("create_course"/);
    assert.match(courses, /course_name: draft\.name/);
    assert.match(courses, /course_code: draft\.code/);
    assert.match(courses, /course_status: draft\.status/);
    assert.match(courses, /course_start: draft\.startDate/);
    assert.match(courses, /course_end: draft\.endDate/);
    assert.match(courses, /\.from\("courses"\)/);
    assert.match(courses, /start_date: draft\.startDate/);
    assert.match(courses, /end_date: draft\.endDate/);
    assert.match(courses, /if \(screenshotMode\)/);
    assert.match(admin, /access\.role === "super_admin"/);
    assert.match(admin, /label: "Courses"/);
    assert.match(admin, /scrollable/);
    assert.doesNotMatch(admin, /on the website/);
    assert.match(panel, /Create course/);
    assert.match(panel, /Save course/);
    assert.match(panel, /End course/);
    assert.match(panel, /type: "date"/);
    assert.match(panel, /mode="date"/);

    // Verify Manage tabs: Batches is removed; Modules and Teachers are present
    assert.doesNotMatch(admin, /label: "Batches"/);
    assert.match(admin, /label: "Modules"/);
    assert.match(admin, /label: "Teachers"/);

    // Verify New Teacher card is inside Roles with role and default PIN 6832
    assert.match(admin, /New teacher/);
    assert.match(admin, /finalPin = newPin\.trim\(\) \|\| "6832"/);
    assert.match(admin, /PIN \(default 6832\)/);

    // Verify minimized teacher item with edit icon and separate EditTeacherModal
    assert.match(admin, /testID=\{`teacher-item-\$\{row\.teacherId\}`\}/);
    assert.match(admin, /testID=\{`edit-teacher-\$\{row\.teacherId\}`\}/);
    assert.match(admin, /function EditTeacherModal/);
    assert.doesNotMatch(admin, /borderLeftWidth: 3/);
    assert.doesNotMatch(admin, /roleLabel\(row\.role\)/);

    // Verify ModulesPanel: New module card on top, minimized module rows, and EditModuleModal
    assert.match(admin, /New module/);
    assert.match(admin, /testID=\{`module-item-\$\{module\.id\}`\}/);
    assert.match(admin, /testID=\{`edit-module-\$\{module\.id\}`\}/);
    assert.match(admin, /function EditModuleModal/);

    // Verify coursewise coordinator dropdown and assignment in CoursesPanel
    assert.match(panel, /Label>Coordinators<\/Label>/);
    assert.match(panel, /placeholder="\+ Add coordinator"/);
    assert.match(panel, /onAssignCoordinator/);
    assert.match(panel, /onRemoveCoordinator/);

    // Verify minimized course row with edit icon and EditCourseModal
    assert.match(panel, /function MinimizedCourseRow/);
    assert.match(panel, /function EditCourseModal/);
    assert.match(panel, /testID=\{`course-card-\$\{course\.id\}`\}/);
    assert.match(panel, /testID=\{`edit-course-\$\{course\.id\}`\}/);
    assert.match(panel, /isSuperAdmin/);

    // Verify Editor tab is hidden for superadmin in layout and editor index
    const layout = readFileSync(new URL("../mobile/app/(main)/_layout.tsx", import.meta.url), "utf8");
    assert.match(layout, /isSuperAdmin = access\.role === "super_admin"/);
    assert.match(layout, /canAccessEditor = !isSuperAdmin && access\.canEdit && courseEditable/);

    const editorScreen = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    assert.match(editorScreen, /if \(access\.role === "super_admin"\) return <Redirect href="\/\(main\)\/routine" \/>/);

    // Verify Mine section is hidden for superadmin in routine.tsx
    const routineScreen = readFileSync(new URL("../mobile/app/(main)/routine.tsx", import.meta.url), "utf8");
    assert.match(routineScreen, /isSuperAdmin = access\.role === "super_admin"/);
    assert.match(routineScreen, /!isSuperAdmin \? \(/);

    // Verify Tools section is removed from tab bar (href: null) and redirects
    assert.match(layout, /name="tools"[\s\S]*href:\s*null/);
    const toolsScreen = readFileSync(new URL("../mobile/app/(main)/tools.tsx", import.meta.url), "utf8");
    assert.match(toolsScreen, /Redirect href="\/\(main\)\/editor"/);
  });
});
