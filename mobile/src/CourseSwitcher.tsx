import { ScrollView } from "react-native";
import { useCourses } from "./courses";
import { courseStatusLabel } from "./lib/courses";
import { colors } from "./theme";
import { Button, T } from "./ui";

export function CourseSwitcher() {
  const { courses, selected, error, selectCourse } = useCourses();
  if (courses.length === 0 && !error) return null;
  return (
    <ScrollView
      horizontal
      testID="course-switcher"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, alignItems: "center" }}
    >
      {courses.map((course) => {
        const on = course.id === selected?.id;
        const suffix = course.status === "active" ? "" : ` · ${courseStatusLabel(course.status)}`;
        return (
          <Button
            key={course.id}
            small
            tone={on ? "primary" : "ghost"}
            label={`${course.name}${suffix}`}
            accessibilityLabel={`Course ${course.name}`}
            onPress={() => selectCourse(course.id)}
          />
        );
      })}
      {error ? <T style={{ color: colors.danger, fontSize: 12 }}>{error}</T> : null}
    </ScrollView>
  );
}
