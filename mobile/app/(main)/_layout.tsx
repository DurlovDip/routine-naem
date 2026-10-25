import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAccess, useAuth } from "../../src/auth";
import { AppHeader } from "../../src/AppHeader";
import { useCourses } from "../../src/courses";
import { colors } from "../../src/theme";

export default function MainLayout() {
  const auth = useAuth();
  const access = useAccess();
  const courses = useCourses();
  const isSuperAdmin = access.role === "super_admin";
  const courseEditable = courses.ready && Boolean(courses.selected?.canEdit);
  const canAccessEditor = !isSuperAdmin && access.canEdit && courseEditable;
  const insets = useSafeAreaInsets();
  if (!auth.ready) return null;
  if (!auth.session) return <Redirect href="/sign-in" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.desk, paddingTop: insets.top }}>
      <AppHeader />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.muted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopWidth: 0,
            elevation: 8,
            shadowColor: colors.shadow,
            shadowOpacity: 0.05,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: -4 },
          },
          tabBarLabelStyle: { fontSize: 12, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="routine"
          options={{
            title: "Routine",
            tabBarIcon: ({ color, size }) => <Ionicons name="calendar-outline" color={typeof color === "string" ? color : colors.muted} size={size} />,
          }}
        />
        <Tabs.Screen
          name="editor"
          options={{
            title: "Editor",
            href: canAccessEditor ? undefined : null,
            tabBarIcon: ({ color, size }) => <Ionicons name="create-outline" color={typeof color === "string" ? color : colors.muted} size={size} />,
          }}
        />
        <Tabs.Screen
          name="admin"
          options={{
            title: "Manage",
            href: access.canAdmin ? undefined : null,
            tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" color={typeof color === "string" ? color : colors.muted} size={size} />,
          }}
        />
        <Tabs.Screen
          name="tools"
          options={{
            href: null,
          }}
        />
      </Tabs>
    </View>
  );
}
