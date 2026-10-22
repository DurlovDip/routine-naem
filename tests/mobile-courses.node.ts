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
    assert.match(panel, /Open routine/);
    assert.match(panel, /End course/);
    assert.match(panel, /type: "date"/);
    assert.match(panel, /mode="date"/);
  });
});
