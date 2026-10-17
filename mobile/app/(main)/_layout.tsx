import { Redirect, Tabs } from "expo-router";
import { Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccess, useAuth } from "../../src/auth";
import { roleLabel } from "../../src/lib/roles";
import { useSchedule } from "../../src/store";
import { colors } from "../../src/theme";
import { T } from "../../src/ui";

export default function MainLayout() {
  const auth = useAuth();
  const access = useAccess();
  const insets = useSafeAreaInsets();
  const { syncStatus, refreshFromCloud } = useSchedule();
  if (!auth.ready) return null;
  if (!auth.session) return <Redirect href="/sign-in" />;

  const sync =
    syncStatus === "saving" ? "Saving…" : syncStatus === "error" ? "Sync failed" : syncStatus === "local" ? "On this phone" : "Saved";

  return (
    <View style={{ flex: 1, backgroundColor: colors.desk, paddingTop: insets.top }}>
      <View style={bar}>
        <View style={{ flex: 1 }}>
          <T weight="bold" style={{ fontSize: 17 }}>Daily Schedule</T>
          <T style={{ color: colors.muted, fontSize: 12 }} numberOfLines={1}>
            {auth.session.teacherName} · {roleLabel(auth.session.role)}
          </T>
        </View>
        <View style={{ alignItems: "flex-end", gap: 2 }}>
          <Pressable onPress={() => void auth.signOut()} hitSlop={8}>
            <T weight="semibold" style={{ color: colors.accent, fontSize: 13 }}>Sign out</T>
          </Pressable>
          <Pressable onPress={() => void refreshFromCloud()} hitSlop={8}>
            <T style={{ color: syncStatus === "error" ? colors.danger : colors.muted, fontSize: 11 }}>{sync}</T>
          </Pressable>
        </View>
      </View>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.line },
          tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        }}
      >
        <Tabs.Screen name="routine" options={{ title: "Routine" }} />
        <Tabs.Screen name="editor" options={{ title: "Editor", href: access.canEdit ? undefined : null }} />
        <Tabs.Screen name="admin" options={{ title: "Manage", href: access.canAdmin ? undefined : null }} />
      </Tabs>
    </View>
  );
}

const bar = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 12,
  paddingHorizontal: 16,
  paddingVertical: 10,
  backgroundColor: colors.surface,
  borderBottomWidth: 1,
  borderBottomColor: colors.line,
};
