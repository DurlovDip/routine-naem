import { describe, expect, it } from "vitest";
import {
  courseFromRow,
  coursesForViewer,
  courseStatusLabel,
  legacyCourse,
  missingCoursesRpc,
  pickDefaultCourse,
  screenshotCatalog,
  screenshotCourses,
  withCourseTitle,
  type CourseSummary,
} from "../src/lib/courses";

const courses: CourseSummary[] = screenshotCatalog().map((course, index) => ({
  ...course,
  canEdit: index === 0,
}));

describe("courses", () => {
  it("picks the saved course, otherwise the newest active one", () => {
    expect(pickDefaultCourse([], null)).toBeNull();
    expect(pickDefaultCourse(courses, "course-ended")?.id).toBe("course-ended");
    expect(pickDefaultCourse(courses, "missing")?.id).toBe("course-acsd");
    expect(pickDefaultCourse([courses[2]], null)?.id).toBe("course-ended");
    const stale = courses.map((course) =>
      course.id === "course-foundation" ? { ...course, updatedAt: "2026-11-01T00:00:00.000Z" } : course,
    );
    expect(pickDefaultCourse(stale, null)?.id).toBe("course-foundation");
  });

  it("hides inactive courses from teachers and limits coordinators to assignments", () => {
    const assignments = [
      {
        teacherId: "coord-1",
        courseId: "course-acsd",
        role: "coordinator" as const,
        roleStart: "2026-10-01",
        roleEnd: "2026-10-31",
      },
    ];
    const teacher = coursesForViewer(courses, "teacher", "teacher-1", assignments, "2026-10-22");
    expect(teacher.map((course) => course.id)).toEqual(["course-acsd", "course-foundation", "course-ended"]);
    expect(teacher.every((course) => !course.canEdit)).toBe(true);

    const coordinator = coursesForViewer(courses, "coordinator", "coord-1", assignments, "2026-10-22");
    expect(coordinator.map((course) => course.id)).toEqual(["course-acsd"]);
    expect(coordinator[0]?.canEdit).toBe(true);

    const expired = coursesForViewer(courses, "coordinator", "coord-1", assignments, "2026-11-02");
    expect(expired[0]?.canEdit).toBe(false);

    const admin = coursesForViewer(courses, "super_admin", "superadmin", [], "2026-10-22");
    expect(admin).toHaveLength(4);
    expect(admin.every((course) => course.canEdit)).toBe(true);
  });

  it("reads a my_courses row and notices a missing RPC", () => {
    expect(
      courseFromRow({
        id: "abc",
        name: "Foundation Course",
        code: "  ",
        status: "ended",
        start_date: "2026-01-02T00:00:00Z",
        end_date: null,
        schedule_id: "abc",
        can_edit: false,
        updated_at: "2026-03-01T00:00:00Z",
      }),
    ).toMatchObject({ code: null, status: "ended", startDate: "2026-01-02", courseId: "abc", canEdit: false });
    expect(courseFromRow({ id: "abc", name: "X", status: "nope", schedule_id: "abc" })).toBeNull();
    expect(missingCoursesRpc("Could not find the function public.my_courses")).toBe(true);
    expect(missingCoursesRpc("Only a super admin can create a course")).toBe(false);
    expect(legacyCourse(true).courseId).toBeNull();
    expect(courseStatusLabel("inactive")).toBe("Inactive");
  });

  it("puts the course name on the title line and the footer", () => {
    const next = withCourseTitle(
      {
        header: [
          { id: "h1", style: "normal", text: "NAEM" },
          { id: "h5", style: "title", text: "Old course" },
        ],
        footer: { courseName: "Old course", lines: ["Course Coordinator", "Old course"] },
      },
      "Foundation Course",
    );
    expect(next.header.find((line) => line.style === "title")?.text).toBe("Foundation Course");
    expect(next.header[0]?.text).toBe("NAEM");
    expect(next.footer.courseName).toBe("Foundation Course");
    expect(next.footer.lines[1]).toBe("Foundation Course");
  });

  it("shows a coordinator two active courses in the screenshot list", () => {
    const visible = screenshotCourses("coordinator");
    expect(visible.map((course) => course.name)).toEqual([
      "Advanced Course on Skill Development",
      "Foundation Course",
    ]);
    expect(visible.every((course) => course.canEdit)).toBe(true);
    expect(screenshotCourses("teacher").some((course) => course.status === "inactive")).toBe(false);
    expect(pickDefaultCourse(visible, null)?.name).toBe("Advanced Course on Skill Development");
  });
});
