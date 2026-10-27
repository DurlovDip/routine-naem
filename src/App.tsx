import { useEffect, useRef, useState } from "react";
import { AuthProvider, useAccess, useAuth } from "./auth";
import { AppHeader } from "./components/AppHeader";
import { CoursesPanel } from "./components/CoursesPanel";
import { PeopleSection } from "./components/AccessPanels";
import { GridEditor } from "./components/GridEditor";
import { PreviewPane } from "./components/PreviewPane";
import { SignIn } from "./components/SignIn";
import { TabNav, type TabId } from "./components/TabNav";
import { CourseProvider, useCourses } from "./courses";
import { DesignationsProvider } from "./designations";
import { ScheduleProvider, useSchedule } from "./state";
import { colors } from "./theme";

function MainLayout() {
  const access = useAccess();
  const courses = useCourses();
  const { day } = useSchedule();
  const sheetRef = useRef<HTMLDivElement>(null);
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
        {tab === "routine" && (
          <div className="w-full h-full p-4 max-w-6xl mx-auto">
            <PreviewPane day={day} sheetRef={sheetRef} />
          </div>
        )}

        {tab === "editor" && (
          <div className="w-full h-full p-4 max-w-6xl mx-auto">
            <GridEditor day={day} />
          </div>
        )}

        {tab === "admin" && (
          <div className="w-full max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
            <CoursesPanel />
            <PeopleSection />
          </div>
        )}

        {tab === "tools" && (
          <div className="w-full max-w-3xl mx-auto p-6 sm:p-10 text-center">
            <div
              className="p-8 rounded-2xl border"
              style={{
                backgroundColor: colors.surface,
                borderColor: colors.line,
              }}
            >
              <h2 className="text-xl font-bold mb-2" style={{ color: colors.ink }}>
                Tools
              </h2>
              <p className="text-sm" style={{ color: colors.muted }}>
                Automatic schedule generation and routine utilities.
              </p>
            </div>
          </div>
        )}
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
