import { useEffect, useState } from "react";
import { AuthProvider, useAccess, useAuth } from "./auth";
import { AppHeader } from "./components/AppHeader";
import { ManageTab } from "./components/ManageTab";
import { RoutineTab } from "./components/RoutineTab";
import { EditorTab } from "./components/EditorTab";
import { ToolsTab } from "./components/ToolsTab";
import { SignIn } from "./components/SignIn";
import { TabNav, type TabId } from "./components/TabNav";
import { CourseProvider, useCourses } from "./courses";
import { DesignationsProvider } from "./designations";
import { ScheduleProvider } from "./state";
import { colors } from "./theme";

function MainLayout() {
  const access = useAccess();
  const courses = useCourses();
  const isSuperAdmin = access.role === "super_admin";
  const courseEditable = courses.ready && Boolean(courses.selected?.canEdit);
  const canAccessEditor = !isSuperAdmin && access.canEdit && courseEditable;

  const [tab, setTab] = useState<TabId>("routine");

  // Fallback to routine if currently selected tab becomes inaccessible
  useEffect(() => {
    if (tab === "editor" && !canAccessEditor) {
      setTab("routine");
    } else if (tab === "admin" && !access.canAdmin) {
      setTab("routine");
    }
  }, [tab, canAccessEditor, access.canAdmin]);

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.desk }}>
      <AppHeader />
      <TabNav
        activeTab={tab}
        onChangeTab={setTab}
        canAccessEditor={canAccessEditor}
        canAdmin={access.canAdmin}
      />

      <main className="flex-1 pb-16 sm:pb-0 overflow-auto">
        {tab === "routine" && <RoutineTab />}
        {tab === "editor" && <EditorTab />}
        {tab === "admin" && <ManageTab onOpenRoutine={() => setTab("routine")} />}
        {tab === "tools" && <ToolsTab onGoToEditor={() => setTab("editor")} />}
      </main>
    </div>
  );
}

function Gate() {
  const auth = useAuth();

  if (!auth.ready) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: colors.desk }}
      >
        <p className="text-sm font-medium" style={{ color: colors.muted }}>
          Checking session…
        </p>
      </div>
    );
  }

  if (auth.required && !auth.session) {
    return <SignIn />;
  }

  return (
    <DesignationsProvider>
      <MainLayout />
    </DesignationsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CourseProvider>
        <ScheduleProvider>
          <Gate />
        </ScheduleProvider>
      </CourseProvider>
    </AuthProvider>
  );
}
