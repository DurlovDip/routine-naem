import Ionicons from "@expo/vector-icons/Ionicons";
import Constants from "expo-constants";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "./auth";
import { ChangePinModal } from "./ChangePin";
import { useCourses } from "./courses";
import { courseStatusLabel, type CourseStatus } from "./lib/courses";
import { designationChoices } from "./lib/designations";
import { roleLabel } from "./lib/roles";
import { routineCoordinatorLabel } from "./lib/header";
import { useSchedule } from "./store";
import { colors, radius, shadow, space, type } from "./theme";
import { Button, Select, T } from "./ui";

export function initials(name: string): string {
  const words = name
    .replace(/\./g, "")
    .split(/\s+/)
    .filter((word) => word && !/^(dr|prof|md|mst|mr|mrs)$/i.test(word));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

const TAB_BAR_HEIGHT = 49;

export function AppHeader() {
  const auth = useAuth();
  const courses = useCourses();
  const insets = useSafeAreaInsets();
  const aboveTabBar = TAB_BAR_HEIGHT + insets.bottom;
  const { state, dispatch, designations } = useSchedule();
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const session = auth.session;
  const selected = courses.selected;
  const assignedCoordinator =
    session && (session.role === "coordinator" || session.role === "temp_coordinator") ? session.teacherName : "";
  const coordinator = routineCoordinatorLabel(state.footer.name, assignedCoordinator);

  return (
    <View style={bar}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <Pressable
          testID="course-menu"
          accessibilityRole="button"
          accessibilityLabel={selected ? `Course ${selected.name}${coordinator ? `, ${coordinator}` : ""}` : "Choose a course"}
          onPress={() => setCoursesOpen(true)}
          style={courseMenu}
        >
          <View style={titleRow}>
            <T weight="bold" numberOfLines={1} style={titleText}>
              {selected?.name ?? "No course"}
            </T>
            <Ionicons name="chevron-down" size={16} color={colors.ink} />
          </View>
          {coordinator ? (
            <T numberOfLines={1} style={coordinatorLine}>
              {coordinator}
            </T>
          ) : null}
        </Pressable>
        <Pressable
          testID="profile-button"
          accessibilityRole="button"
          accessibilityLabel="Profile"
          onPress={() => setProfileOpen(true)}
          style={profileButton}
        >
          <Ionicons name="person-circle" size={32} color={colors.ink} />
        </Pressable>
      </View>
      <Modal visible={coursesOpen} transparent animationType="fade" onRequestClose={() => setCoursesOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <View style={[sheetHost, { paddingBottom: aboveTabBar }]}>
          <View style={backdrop}>
          <Pressable style={{ flex: 1 }} accessibilityLabel="Close courses" onPress={() => setCoursesOpen(false)} />
          <View testID="course-picker" style={sheet}>
            <View style={handle} />
            <T weight="semibold" style={{ fontSize: type.title, marginBottom: space.sm }}>Courses</T>
            {courses.error ? <T style={{ color: colors.danger, marginBottom: space.sm }}>{courses.error}</T> : null}
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={{ paddingBottom: space.md }}>
              {courses.courses.length === 0 ? <T style={{ color: colors.muted }}>No courses yet.</T> : null}
              {courses.courses.map((course) => {
                const on = course.id === selected?.id;
                return (
                  <Pressable
                    key={course.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Course ${course.name}`}
                    onPress={() => {
                      courses.selectCourse(course.id);
                      setCoursesOpen(false);
                    }}
                    style={[courseRow, on && { backgroundColor: colors.accentSoft }]}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <T weight="semibold" numberOfLines={2}>{course.name}</T>
                      {course.code ? <T style={{ color: colors.muted, fontSize: type.caption }}>{course.code}</T> : null}
                    </View>
                    <StatusChip status={course.status} />
                    {on ? <Ionicons name="checkmark" size={18} color={colors.accent} /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
          </View>
        </View>
      </Modal>
      <Modal visible={profileOpen} transparent animationType="fade" onRequestClose={() => setProfileOpen(false)} statusBarTranslucent navigationBarTranslucent>
        <View style={[sheetHost, { paddingBottom: aboveTabBar }]}>
          <View style={backdrop}>
          <Pressable style={{ flex: 1 }} accessibilityLabel="Close profile" onPress={() => setProfileOpen(false)} />
          <View testID="profile-sheet" style={sheet}>
            <View style={handle} />
            {session ? (
              <ProfileBody
                name={session.teacherName}
                role={roleLabel(session.role)}
                teacherId={session.teacherId}
                choices={designationChoices(designations, state.teachers.map((teacher) => teacher.designation))}
                onChangePin={() => setPinOpen(true)}
                onSignOut={() => {
                  setProfileOpen(false);
                  void auth.signOut();
                }}
                onSaved={(value) => {
                  if (state.teachers.some((teacher) => teacher.id === session.teacherId)) {
                    dispatch({ type: "set-teacher-designation", id: session.teacherId, designation: value });
                  }
                }}
              />
            ) : null}
          </View>
          </View>
        </View>
      </Modal>
      <ChangePinModal open={pinOpen} onClose={() => setPinOpen(false)} />
    </View>
  );
}

function ProfileBody({
  name,
  role,
  teacherId,
  choices,
  onChangePin,
  onSignOut,
  onSaved,
}: {
  name: string;
  role: string;
  teacherId: string;
  choices: string[];
  onChangePin: () => void;
  onSignOut: () => void;
  onSaved: (value: string) => void;
}) {
  const auth = useAuth();
  const [designation, setDesignation] = useState("");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const version = Constants.expoConfig?.version ?? "1.1.9";

  useEffect(() => {
    let mounted = true;
    void auth.loadDesignation().then(
      (value) => {
        if (!mounted) return;
        setDesignation(value);
        setDraft(value);
      },
      (err: unknown) => {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      mounted = false;
    };
  }, [auth, teacherId]);

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <View style={avatarLarge}>
          <T weight="semibold" style={{ color: colors.accentDark, fontSize: type.title }}>{initials(name)}</T>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <T weight="semibold" style={{ fontSize: type.title }}>{name}</T>
          <T style={{ color: colors.muted }}>{role}</T>
        </View>
      </View>
      <View style={{ gap: space.xs }}>
        <T style={{ color: colors.muted, fontSize: type.caption }}>Designation</T>
        {editing ? (
          <View style={{ gap: space.sm }}>
            <Select
              label="Designation"
              value={draft}
              options={choices}
              placeholder="Choose a designation"
              onChange={setDraft}
            />
            <View style={{ flexDirection: "row", gap: space.sm }}>
              <Button label="Cancel" onPress={() => { setEditing(false); setDraft(designation); }} />
              <Button
                label={busy ? "Saving…" : "Save"}
                tone="primary"
                disabled={busy || !draft.trim()}
                onPress={() => {
                  setBusy(true);
                  void auth.saveDesignation(draft).then((message) => {
                    setBusy(false);
                    if (message) setError(message);
                    else {
                      setDesignation(draft.trim());
                      setEditing(false);
                      setError(null);
                      onSaved(draft.trim());
                    }
                  });
                }}
              />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
            <T weight="medium">{designation || "No designation"}</T>
            <Button small label="Edit designation" onPress={() => setEditing(true)} />
          </View>
        )}
      </View>
      {error ? <T style={{ color: colors.danger }}>{error}</T> : null}
      <Button label="Change PIN" icon={<Ionicons name="key-outline" size={16} color={colors.ink} />} onPress={onChangePin} />
      <Button label="Sign out" tone="danger" icon={<Ionicons name="log-out-outline" size={16} color={colors.danger} />} onPress={onSignOut} />
      <T style={{ color: colors.muted, fontSize: type.caption, textAlign: "center" }}>Version {version}</T>
    </View>
  );
}

function StatusChip({ status }: { status: CourseStatus }) {
  const palette =
    status === "active"
      ? { backgroundColor: colors.accentSoft, color: colors.accentDark }
      : status === "ended"
        ? { backgroundColor: colors.warnBg, color: colors.warn }
        : { backgroundColor: colors.paper, color: colors.muted };
  return (
    <View style={{ backgroundColor: palette.backgroundColor, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
      <T weight="semibold" style={{ color: palette.color, fontSize: type.caption }}>{courseStatusLabel(status)}</T>
    </View>
  );
}

const bar = {
  backgroundColor: colors.surface,
  paddingHorizontal: space.lg,
  paddingVertical: space.sm,
  justifyContent: "center" as const,
};

const courseMenu = {
  flex: 1,
  justifyContent: "center" as const,
  minHeight: 44,
  gap: 1,
  outlineWidth: 0,
  outlineStyle: "solid" as const,
};

const titleRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 4,
};

const titleText = {
  flexShrink: 1,
  fontSize: type.title,
};

const coordinatorLine = {
  color: colors.muted,
  fontSize: type.caption,
  lineHeight: 16,
};

const profileButton = {
  width: 44,
  height: 44,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const avatar = {
  width: 40,
  height: 40,
  borderRadius: 20,
  backgroundColor: colors.accentSoft,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const avatarLarge = {
  width: 52,
  height: 52,
  borderRadius: 26,
  backgroundColor: colors.accentSoft,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const sheetHost = {
  flex: 1,
};

const backdrop = {
  flex: 1,
  backgroundColor: "rgba(28,28,26,0.28)",
  justifyContent: "flex-end" as const,
};

const sheet = {
  backgroundColor: colors.surface,
  borderTopLeftRadius: radius.lg,
  borderTopRightRadius: radius.lg,
  paddingHorizontal: space.lg,
  paddingBottom: space.xxl,
  paddingTop: space.sm,
  maxHeight: "80%" as const,
  ...shadow,
};

const handle = {
  alignSelf: "center" as const,
  width: 36,
  height: 4,
  borderRadius: 2,
  backgroundColor: colors.line,
  marginBottom: space.md,
};

const courseRow = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: space.sm,
  paddingVertical: space.md,
  paddingHorizontal: space.sm,
  borderRadius: radius.md,
};
