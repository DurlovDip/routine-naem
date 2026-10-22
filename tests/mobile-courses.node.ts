import assert from "node:assert/strict";
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
  });
});
