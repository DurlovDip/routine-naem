import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect } from "react";
import { Image, View } from "react-native";
import { useAuth } from "./auth";
import { useCourses } from "./courses";
import { formatSignatureDate, todayInDhaka } from "./lib/time";
import { useSchedule } from "./store";
import { card, colors, radius, space } from "./theme";
import { CheckRow, T } from "./ui";

export function FooterEditor() {
  const { state, dispatch } = useSchedule();
  const auth = useAuth();
  const courses = useCourses();
  const footer = state.footer;

  const designation = footer.designation ?? "Assistant Director";
  const isCourseCoordinator = footer.isCourseCoordinator ?? true;
  const courseName = courses.selected?.name || footer.courseName || "";
  const signeeName = footer.name || auth.session?.teacherName || "";
  const rawDate = courses.selected?.updatedAt || footer.signatureDate || todayInDhaka();
  const displayDate = formatSignatureDate(rawDate);

  const resolvedDesignationLine = designation.trim()
    ? isCourseCoordinator
      ? `${designation.trim()} & Course Coordinator`
      : designation.trim()
    : isCourseCoordinator
      ? "Course Coordinator"
      : "";

  useEffect(() => {
    if (footer.signature) return;
    let mounted = true;
    void auth.loadSignature().then((sig) => {
      if (mounted && sig) {
        dispatch({ type: "set-footer", patch: { signature: sig } });
      }
    });
    return () => {
      mounted = false;
    };
  }, [auth, footer.signature, dispatch]);

  useEffect(() => {
    const patch: Partial<typeof footer> = {};
    if (courseName && courseName !== footer.courseName) patch.courseName = courseName;
    if (displayDate && displayDate !== footer.signatureDate) patch.signatureDate = displayDate;
    if (signeeName && signeeName !== footer.name) patch.name = signeeName;

    const lines = [resolvedDesignationLine, courseName].filter(Boolean);
    if (JSON.stringify(lines) !== JSON.stringify(footer.lines)) patch.lines = lines;

    if (Object.keys(patch).length > 0) {
      dispatch({ type: "set-footer", patch });
    }
  }, [courseName, displayDate, signeeName, resolvedDesignationLine, footer, dispatch]);

  return (
    <View testID="signature-footer-editor" style={footerCard}>
      <View>
        <T weight="bold" style={{ color: colors.accent, fontSize: 15 }}>
          Signature & footer
        </T>
        <T style={{ color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
          Automatically generated from the course and your coordinator profile.
        </T>
      </View>

      <View style={coordinatorBox}>
        <CheckRow
          testID="course-coordinator"
          label="Course Coordinator"
          value={isCourseCoordinator}
          onChange={(checked) =>
            dispatch({ type: "set-footer", patch: { isCourseCoordinator: checked } })
          }
        />
        <T style={{ color: colors.muted, fontSize: 12, marginLeft: 26 }}>
          (appends & Course Coordinator)
        </T>
        <T style={{ color: colors.muted, fontSize: 12, marginLeft: 26 }}>
          Prints as:{" "}
          <T weight="semibold" style={{ color: colors.ink }}>
            {resolvedDesignationLine || "(empty)"}
          </T>
        </T>
      </View>

      <View style={previewCard}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <T weight="bold" style={{ fontSize: 11, color: colors.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>
            Routine Footer Preview
          </T>
          <View style={liveBadge}>
            <T weight="bold" style={{ fontSize: 10, color: "#065f46" }}>
              PRINTS AS
            </T>
          </View>
        </View>

        <View style={previewInner}>
          <View testID="signature-preview" style={signatureSlot}>
            {footer.signature ? (
              <Image
                source={{ uri: footer.signature }}
                accessibilityIgnoresInvertColors
                style={{ width: "100%", height: 56 }}
                resizeMode="contain"
              />
            ) : (
              <View style={emptySignatureSlot}>
                <Ionicons name="pencil-outline" size={14} color="#a8a29e" />
                <T style={{ color: "#a8a29e", fontSize: 11 }}>No signature</T>
              </View>
            )}
          </View>

          {displayDate ? (
            <T style={{ color: colors.ink, fontSize: 12, marginTop: 6 }}>
              {displayDate}
            </T>
          ) : null}

          <T weight="bold" style={{ color: colors.ink, fontSize: 13, marginTop: 3 }}>
            {signeeName || "Course Coordinator"}
          </T>

          {resolvedDesignationLine ? (
            <T style={{ color: colors.ink, fontSize: 12, marginTop: 1 }}>
              {resolvedDesignationLine}
            </T>
          ) : null}

          {courseName ? (
            <T style={{ color: colors.ink, fontSize: 12, marginTop: 1 }}>
              {courseName}
            </T>
          ) : null}
        </View>
      </View>

      <View style={sourceList}>
        <View style={sourceRow}>
          <Ionicons name="document-text-outline" size={15} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <T weight="semibold" style={{ fontSize: 12, color: colors.ink }}>
              Signature
            </T>
            <T style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
              {footer.signature
                ? "Active from your coordinator profile. To update, tap the profile icon in the top bar."
                : "To add your signature, tap the profile button in the top bar."}
            </T>
          </View>
        </View>

        <View style={sourceRow}>
          <Ionicons name="calendar-outline" size={15} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <T weight="semibold" style={{ fontSize: 12, color: colors.ink }}>
              Signature date
            </T>
            <T style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
              Automatically set to routine published / last modified date ({displayDate}).
            </T>
          </View>
        </View>

        <View style={sourceRow}>
          <Ionicons name="person-outline" size={15} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <T weight="semibold" style={{ fontSize: 12, color: colors.ink }}>
              Name & Designation
            </T>
            <T style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
              Fixed from coordinator account ({signeeName || "Course Coordinator"}). Edit in Profile.
            </T>
          </View>
        </View>

        <View style={sourceRow}>
          <Ionicons name="school-outline" size={15} color={colors.accent} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <T weight="semibold" style={{ fontSize: 12, color: colors.ink }}>
              Course name
            </T>
            <T style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>
              Fixed from active course created by superadmin ({courseName || "No course selected"}).
            </T>
          </View>
        </View>
      </View>
    </View>
  );
}

const footerCard = { ...card, gap: space.md } as const;

const coordinatorBox = {
  backgroundColor: colors.paper,
  borderRadius: radius.md,
  padding: space.md,
  gap: 4,
};

const previewCard = {
  backgroundColor: "#fcfbf9",
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: "#e5ded4",
  padding: space.md,
};

const liveBadge = {
  backgroundColor: "#d1fae5",
  paddingHorizontal: 7,
  paddingVertical: 2,
  borderRadius: 4,
};

const previewInner = {
  backgroundColor: "#ffffff",
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: "#ebe6de",
  padding: space.md,
  alignItems: "flex-end" as const,
};

const signatureSlot = {
  minHeight: 56,
  minWidth: 140,
  maxWidth: 220,
  borderWidth: 1,
  borderStyle: "dashed" as const,
  borderColor: "#ddd4c6",
  borderRadius: 4,
  alignItems: "center" as const,
  justifyContent: "center" as const,
  backgroundColor: "#faf9f6",
  paddingHorizontal: 8,
};

const emptySignatureSlot = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 6,
  paddingVertical: 12,
  paddingHorizontal: 8,
};

const sourceList = {
  backgroundColor: colors.paper,
  borderRadius: radius.md,
  padding: space.md,
  gap: 12,
};

const sourceRow = {
  flexDirection: "row" as const,
  alignItems: "flex-start" as const,
  gap: 10,
};
