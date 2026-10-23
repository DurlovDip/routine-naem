import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { useAccess } from "../../../src/auth";
import { useCourses } from "../../../src/courses";
import { FooterEditor } from "../../../src/FooterEditor";
import { HeaderEditor } from "../../../src/HeaderEditor";
import { colors } from "../../../src/theme";
import { T } from "../../../src/ui";

export default function HeaderFooterScreen() {
  const access = useAccess();
  const courses = useCourses();
  const router = useRouter();
  if (!access.canEdit) return <Redirect href="/(main)/routine" />;
  if (courses.ready && !courses.selected?.canEdit) return <Redirect href="/(main)/routine" />;

  return (
    <ScrollView
      testID="header-footer-screen"
      style={{ flex: 1, backgroundColor: colors.desk }}
      contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 32 }}
      keyboardShouldPersistTaps="handled"
    >
      <Pressable
        testID="header-footer-back"
        accessibilityRole="button"
        accessibilityLabel="Back"
        onPress={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/(main)/editor");
        }}
        style={{ flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start", paddingVertical: 4 }}
      >
        <Ionicons name="chevron-back" size={22} color={colors.accent} />
        <T weight="semibold" style={{ color: colors.accent, fontSize: 16 }}>Back</T>
      </Pressable>
      <View>
        <T weight="bold" style={{ fontSize: 20 }}>Header & footer</T>
        <T style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
          Printed at the top and bottom of the routine and the PDF.
        </T>
      </View>
      <HeaderEditor />
      <FooterEditor />
    </ScrollView>
  );
}
