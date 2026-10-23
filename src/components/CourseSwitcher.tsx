import { useCourses } from "../courses";
import { courseOptionLabel } from "../lib/courses";

export function CourseSwitcher() {
  const { courses, selected, error, selectCourse } = useCourses();
  if (courses.length === 0 && !error) return null;
  return (
    <label className="course-switcher">
      <span className="field-label">Course</span>
      {courses.length > 0 ? (
        <select
          id="course-switcher"
          className="field"
          aria-label="Course"
          value={selected?.id ?? ""}
          onChange={(event) => selectCourse(event.target.value)}
        >
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {courseOptionLabel(course)}
            </option>
          ))}
        </select>
      ) : null}
      {error ? <span className="auth-error">{error}</span> : null}
    </label>
  );
}
