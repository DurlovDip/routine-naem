import {
  CalendarDays,
  FileEdit,
  LayoutGrid,
  Wrench,
} from "lucide-react";
import type { ReactNode } from "react";
import { colors } from "../theme";

export type TabId = "routine" | "editor" | "admin" | "tools";

interface TabItem {
  id: TabId;
  label: string;
  icon: (color: string) => ReactNode;
  visible: boolean;
}

export function TabNav({
  activeTab,
  onChangeTab,
  canAccessEditor,
  canAdmin,
}: {
  activeTab: TabId;
  onChangeTab: (tab: TabId) => void;
  canAccessEditor: boolean;
  canAdmin: boolean;
}) {
  const tabs: TabItem[] = [
    {
      id: "routine",
      label: "Routine",
      icon: (color) => <CalendarDays size={20} color={color} />,
      visible: true,
    },
    {
      id: "editor",
      label: "Editor",
      icon: (color) => <FileEdit size={20} color={color} />,
      visible: canAccessEditor,
    },
    {
      id: "admin",
      label: "Manage",
      icon: (color) => <LayoutGrid size={20} color={color} />,
      visible: canAdmin,
    },
    {
      id: "tools",
      label: "Tools",
      icon: (color) => <Wrench size={20} color={color} />,
      // Mirrors mobile/app/(main)/_layout.tsx, where the tools screen has `href: null` for every role.
      visible: false,
    },
  ];

  const visibleTabs = tabs.filter((tab) => tab.visible);

  return (
    <>
      {/* Desktop / Tablet top nav */}
      <nav
        className="hidden sm:flex items-center px-6 border-b z-20 gap-2"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.line,
        }}
        aria-label="Main Navigation"
      >
        {visibleTabs.map((tab) => {
          const on = tab.id === activeTab;
          const color = on ? colors.accent : colors.muted;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChangeTab(tab.id)}
              className="flex items-center gap-2 py-3 px-4 border-b-2 text-sm font-semibold transition-colors cursor-pointer select-none"
              style={{
                borderColor: on ? colors.accent : "transparent",
                color,
              }}
            >
              {tab.icon(color)}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t"
        style={{
          height: 56,
          backgroundColor: colors.surface,
          borderColor: colors.line,
          boxShadow: "0 -4px 12px rgba(28, 28, 26, 0.05)",
        }}
        aria-label="Mobile Navigation"
      >
        {visibleTabs.map((tab) => {
          const on = tab.id === activeTab;
          const color = on ? colors.accent : colors.muted;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => onChangeTab(tab.id)}
              className="flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer select-none"
              style={{ color }}
            >
              {tab.icon(color)}
              <span className="text-[11px] font-semibold mt-0.5">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
