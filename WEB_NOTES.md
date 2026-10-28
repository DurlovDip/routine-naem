# Routine NAEM — Web Match App Notes (`WEB_NOTES.md`)

Branch: `web-match-app`  
Reference: `routine-naem/mobile/` (Expo React Native app)

---

## 1. Executive Summary
The Routine NAEM web application (`src/`) has been completely rebuilt to match the Expo mobile application (`mobile/`) in user interface aesthetics, structure, navigation, workflows, and database interactions.

The design system incorporates the mobile theme tokens:
- **Palette**: Desk (`#f6f5f2`), Surface (`#ffffff`), Paper (`#fbfaf8`), Line (`#e8e6e1`), Ink (`#1c1814`), Muted (`#7a746b`), Accent Forest Green (`#2c6b58`), Accent Soft (`#eaf3ef`), Accent Dark (`#1b4337`), Warn (`#92400e`), Danger (`#b91c1c`).
- **Typography & Scale**: Inter font with semibold/medium weights, clear hierarchy (title, subtitle, body, caption).
- **Responsive Navigation**: Top navigation on desktop/tablet viewports; fixed bottom tab bar on narrow mobile viewports (`sm:hidden`).

---

## 2. What Was Mirrored

### Auth & PIN Sign-In
- **Sign-In Flow** (`src/components/SignIn.tsx`): DS badge, "Daily Schedule" title, teacher selection dropdown, 4-digit PIN input, sign-in button, session persistence.
- **Session & Permissions** (`src/auth.tsx`): Role resolution (`super_admin`, `coordinator`, `temp_coordinator`, `teacher`), `canEdit`, `canAdmin`, `adminResetPin`, `loadSignature`, `saveSignature`, `loadDesignation`, `saveDesignation`.
- **Change PIN** (`src/components/ChangePin.tsx`): Current PIN verification, new 4-digit PIN input, confirmation, success feedback.

### App Header & Profile Sheet
- **Header Bar** (`src/components/AppHeader.tsx`):
  - Left: Course dropdown trigger showing course name and coordinator subtitle ("Course Coordinator: <name>").
  - Course Popover: Lists all active and accessible courses with status badges.
  - Right: Dark profile circle avatar.
  - Profile Sheet Popover: Displays user name, role, designation selector, signature file uploader (HTML5 canvas resizing to 200×60px JPEG base64), Change PIN modal trigger, Sign Out button, and app version.

### Tab Navigation (`src/components/TabNav.tsx`)
- Tab order: **Routine**, **Editor** (visible only to coordinators and admins), **Manage** (visible to coordinators and admins; courses tab for super_admin), and **Tools**.
- Desktop: Horizontal top navigation below header with active border indicator.
- Mobile: Fixed bottom tab bar with Ionicons-equivalent SVG icons and labels.

### Routine Tab (`src/components/RoutineTab.tsx`)
- **`[ Mine | Routine ⊞ ]` Switch**: Integrated view toggle icon inside the Routine segment button. Clicking the label activates Routine; clicking the grid icon toggles between batch card view and table matrix view.
- **Routine Pane**: Horizontal day chips (past=grey, selected=green, future=white), selected date line with published/draft badge.
- **Mine Pane**: Shows upcoming sessions for the logged-in teacher grouped under Today / Tomorrow / Day NN headers with dates. Past sessions are hidden. Shows "No upcoming sessions" empty state when free.
- **PDF Export**: Plain dark icon in a fixed position. Generates A4 landscape routine layout with header lines, batch matrix, recap, and signature footer, printing via an off-screen iframe.

### Editor Tab (`src/components/EditorTab.tsx`)
- **Day Navigation**: Horizontal day chips with active indicator, add day (+) button, and pencil edit button opening `EditDayModal` (edit date, day number, duplicate to next, blank next, delete day).
- **Batch Chips**: List of active batches with student counts, add batch (+) button, and pencil edit button opening `EditBatchModal` (name, student count, remove batch).
- **Session Editor**: Timeline of sessions with module code picker, sub-number picker, teacher multi-select, cell span (merge across batches), add/remove slot, adjust session duration.
- **Header & Footer Modal** (`src/components/HeaderFooterModal.tsx`): Header line text and style editor, footer signature signee and designation editor.
- **Draft Routine Modal** (`src/components/DraftRoutineModal.tsx`): Full table matrix and batch card preview of draft schedule with conflict badges and publish button.

### Manage Tab (`src/components/ManageTab.tsx`)
- **Segmented Switcher**: Courses (super admin only), Modules, Teachers.
- **Courses Panel** (`src/components/CoursesPanel.tsx`):
  - New course card (name, short code, start/end dates, status segmented switch).
  - Filter segmented bar (All, Active, Inactive, Ended).
  - Course cards with date range and coordinator count.
  - Edit course modal: super admins can edit metadata, assign coordinators from directory, remove coordinators, and switch course routine via "Open routine".
  - Ended course confirmation dialog.
- **Modules Panel**: New module card (number, sub-number, name), catalog list, `EditModuleModal` with live preview and removal.
- **Teachers Panel**: New teacher card (name, designation dropdown, default PIN 6832), directory list, `EditTeacherModal` with designation picker, 4-digit PIN reset tool, and account removal.

### Tools Tab (`src/components/ToolsTab.tsx`)
- **Automatic Routine Generator**: 3-step wizard:
  - Step 1: Participating teachers selection with search, quick select all / clear, and count validation.
  - Step 2: Teacher availability matrix with session chips (S1–S5 Free/Busy) and All Free / All Busy shortcuts.
  - Step 3: Conflict-free schedule generator using Min-Cost Bipartite Matching algorithm (`src/lib/scheduleAlgorithm.ts`), preview matrix (Batches × Sessions), workload distribution summary, and one-click application to current day routine with "Go to Editor" shortcut.
- **Voice Assistant**: Informative card explaining that the live AI voice assistant is supported in the Android mobile app (preventing API key exposure on static web).

---

## 3. Browser Adaptations & Differences
1. **PDF Export**:
   - Mobile uses `expo-print`.
   - Web uses an isolated off-screen `<iframe>` loaded with the routine HTML and styled with `@page { size: A4 landscape; margin: 10mm; }`, triggering `iframe.contentWindow.print()`. This enables native PDF download across all desktop and mobile browsers with zero external dependencies.
2. **Signature Processing**:
   - Mobile uses `expo-document-picker` and native file reading.
   - Web uses an HTML file input and an HTML5 Canvas to resize signatures to 200×60px JPEG at 0.8 quality, encoding to base64 string matching the exact format expected by Supabase and the mobile app.
3. **Voice Assistant**:
   - Mobile includes Gemini voice streaming with native microphone integration.
   - Web does not bundle API keys in static assets per `.agents/rules/safety.md`, and instead directs users to the mobile app for voice interactions.

---

## 4. Safety & Rules Verification
- **No Schema Changes**: No SQL migrations were run against live Supabase.
- **Anon Key Only**: Client uses existing anon key via `src/lib/supabase.ts`. No `service_role` key and no Gemini API keys in web bundle.
- **No Push / No PR**: All commits are made locally on branch `web-match-app`.
- **Read-Only Mobile**: `mobile/` was not modified.
- **Build & Tests**: `npm run build`, `npm run lint`, and `npm test` all pass cleanly.
