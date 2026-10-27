import {
  Check,
  ChevronDown,
  CircleUserRound,
  KeyRound,
  LogOut,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "../auth";
import { useCourses } from "../courses";
import { courseStatusLabel, type CourseStatus } from "../lib/courses";
import { designationChoices } from "../lib/designations";
import { routineCoordinatorLabel } from "../lib/header";
import { useDesignations } from "../designations";
import { roleLabel } from "../lib/roles";
import { readSignatureFile } from "../lib/signature";
import { useSchedule } from "../state";
import { colors, radius, type } from "../theme";
import { ChangePinModal } from "./ChangePin";
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

export function AppHeader() {
  const auth = useAuth();
  const courses = useCourses();
  const { state, dispatch } = useSchedule();
  const { names: designationNames } = useDesignations();
  const [coursesOpen, setCoursesOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const session = auth.session;
  const selected = courses.selected;
  const assignedCoordinator =
    session && (session.role === "coordinator" || session.role === "temp_coordinator")
      ? session.teacherName
      : "";
  const selectedCoordinators =
    (courses.selectedCoordinators?.length
      ? courses.selectedCoordinators
      : state.footer.coordinators) ?? [];
  const coordinator = routineCoordinatorLabel(
    state.footer.name,
    assignedCoordinator,
    selectedCoordinators,
  );

  return (
    <header
      className="w-full flex items-center justify-between px-4 sm:px-6 py-2.5 z-30 select-none border-b sm:border-b-0"
      style={{
        backgroundColor: colors.surface,
        borderColor: colors.line,
      }}
    >
      <button
        type="button"
        data-testid="course-menu"
        aria-label={selected ? `Course ${selected.name}${coordinator ? `, ${coordinator}` : ""}` : "Choose a course"}
        onClick={() => setCoursesOpen(true)}
        className="flex flex-col items-start text-left cursor-pointer transition-opacity hover:opacity-85 min-w-0 pr-3"
      >
        <div className="flex items-center gap-1.5 max-w-full">
          <T weight="bold" className="truncate text-base sm:text-lg" style={{ color: colors.ink }}>
            {selected?.name ?? "No course"}
          </T>
          <ChevronDown size={16} style={{ color: colors.ink }} className="flex-none" />
        </div>
        {coordinator ? (
          <T className="truncate text-xs" style={{ color: colors.muted, lineHeight: "16px" }}>
            {coordinator}
          </T>
        ) : null}
      </button>

      <button
        type="button"
        data-testid="profile-button"
        aria-label="Profile"
        onClick={() => setProfileOpen(true)}
        className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer hover:opacity-85 transition-opacity flex-none"
        style={{ color: colors.ink }}
      >
        <CircleUserRound size={32} />
      </button>

      {/* Courses Modal */}
      {coursesOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(28, 28, 26, 0.28)" }}
          onClick={() => setCoursesOpen(false)}
        >
          <div
            data-testid="course-picker"
            className="w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in"
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              borderRadius: undefined,
              boxShadow: "0 12px 32px rgba(28, 28, 26, 0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 sm:p-5 border-b flex items-center justify-between" style={{ borderColor: colors.line }}>
              <T weight="semibold" style={{ fontSize: type.title }}>
                Courses
              </T>
              <button
                type="button"
                onClick={() => setCoursesOpen(false)}
                className="p-1 rounded-md text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            {courses.error ? (
              <div className="px-5 py-2 text-xs" style={{ color: colors.danger }}>
                {courses.error}
              </div>
            ) : null}
            <div className="overflow-y-auto p-3 space-y-1 max-h-[460px]">
              {courses.courses.length === 0 ? (
                <div className="p-4 text-center text-sm" style={{ color: colors.muted }}>
                  No courses yet.
                </div>
              ) : null}
              {courses.courses.map((course) => {
                const on = course.id === selected?.id;
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => {
                      courses.selectCourse(course.id);
                      setCoursesOpen(false);
                    }}
                    className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-colors cursor-pointer"
                    style={{
                      backgroundColor: on ? colors.accentSoft : "transparent",
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <T weight="semibold" className="block truncate text-sm" style={{ color: colors.ink }}>
                        {course.name}
                      </T>
                      {course.code ? (
                        <div className="text-xs" style={{ color: colors.muted }}>
                          {course.code}
                        </div>
                      ) : null}
                    </div>
                    <StatusChip status={course.status} />
                    {on ? <Check size={18} style={{ color: colors.accent }} className="flex-none" /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Profile Modal */}
      {profileOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ backgroundColor: "rgba(28, 28, 26, 0.28)" }}
          onClick={() => setProfileOpen(false)}
        >
          <div
            data-testid="profile-sheet"
            className="w-full max-w-md max-h-[90vh] flex flex-col overflow-y-auto animate-in fade-in p-5 sm:p-6"
            style={{
              backgroundColor: colors.surface,
              borderTopLeftRadius: radius.lg,
              borderTopRightRadius: radius.lg,
              boxShadow: "0 12px 32px rgba(28, 28, 26, 0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {session ? (
              <ProfileBody
                name={session.teacherName}
                role={roleLabel(session.role)}
                teacherId={session.teacherId}
                choices={designationChoices(
                  designationNames,
                  state.teachers.map((teacher) => teacher.designation),
                )}
                onChangePin={() => {
                  setProfileOpen(false);
                  setPinOpen(true);
                }}
                onSignOut={() => {
                  setProfileOpen(false);
                  void auth.signOut();
                }}
                onSaved={(value) => {
                  if (state.teachers.some((teacher) => teacher.id === session.teacherId)) {
                    dispatch({
                      type: "set-teacher-designation",
                      id: session.teacherId,
                      designation: value,
                    });
                  }
                }}
                onClose={() => setProfileOpen(false)}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      <ChangePinModal open={pinOpen} onClose={() => setPinOpen(false)} />
    </header>
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
  onClose,
}: {
  name: string;
  role: string;
  teacherId: string;
  choices: string[];
  onChangePin: () => void;
  onSignOut: () => void;
  onSaved: (value: string) => void;
  onClose: () => void;
}) {
  const auth = useAuth();
  const { dispatch } = useSchedule();
  const [designation, setDesignation] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [busySig, setBusySig] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const version = "1.3.0";

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
    void auth.loadSignature().then((sig) => {
      if (!mounted) return;
      setSignature(sig);
    });
    return () => {
      mounted = false;
    };
  }, [auth, teacherId]);

  async function storeSignature(sig: string) {
    setBusySig(true);
    try {
      await auth.saveSignature(sig);
      setSignature(sig);
      dispatch({ type: "set-footer", patch: { signature: sig } });
    } catch {
      alert("Could not save your signature.");
    } finally {
      setBusySig(false);
    }
  }

  async function removeSignature() {
    setBusySig(true);
    try {
      await auth.saveSignature(null);
      setSignature(null);
      dispatch({ type: "set-footer", patch: { signature: null } });
    } catch {
      // ignore
    } finally {
      setBusySig(false);
    }
  }

  async function fromFile(file: Blob | undefined) {
    if (!file) return;
    setBusySig(true);
    try {
      await storeSignature(await readSignatureFile(file));
    } catch {
      alert("Could not read that image. Choose a PNG or JPEG signature.");
    } finally {
      setBusySig(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center font-semibold text-base flex-none"
            style={{ backgroundColor: colors.accentSoft, color: colors.accentDark }}
          >
            {initials(name)}
          </div>
          <div className="min-w-0">
            <T weight="semibold" className="block truncate text-base" style={{ color: colors.ink }}>
              {name}
            </T>
            <div className="text-xs" style={{ color: colors.muted }}>
              {role}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-md text-stone-400 hover:text-stone-700 cursor-pointer"
        >
          <X size={18} />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-xs font-semibold" style={{ color: colors.muted }}>
          Designation
        </div>
        {editing ? (
          <div className="flex flex-col gap-2">
            <Select
              label="Designation"
              value={draft}
              options={choices}
              placeholder="Choose a designation"
              onChange={setDraft}
            />
            <div className="flex gap-2 justify-end">
              <Button
                small
                label="Cancel"
                onClick={() => {
                  setEditing(false);
                  setDraft(designation);
                }}
              />
              <Button
                small
                label={busy ? "Saving…" : "Save"}
                tone="primary"
                disabled={busy || !draft.trim()}
                onClick={() => {
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
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between py-1">
            <T weight="medium" className="text-sm">
              {designation || "No designation"}
            </T>
            <Button small label="Edit designation" onClick={() => setEditing(true)} />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <div className="text-xs font-semibold" style={{ color: colors.muted }}>
          Signature
        </div>
        <div className="flex items-center gap-3">
          <div
            className="w-36 h-16 rounded-md border border-dashed flex items-center justify-center p-1 bg-white overflow-hidden flex-none"
            style={{ borderColor: "#ddd4c6" }}
          >
            {signature ? (
              <img src={signature} alt="Signature" className="max-h-full max-w-full object-contain" />
            ) : (
              <span className="text-xs text-stone-400">No signature</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5 items-start">
            <Button
              small
              label={busySig ? "Reading…" : "Upload signature"}
              disabled={busySig}
              onClick={() => fileRef.current?.click()}
            />
            {signature ? (
              <Button small tone="quiet" label="Remove" onClick={removeSignature} />
            ) : null}
          </div>
        </div>
        <div className="text-xs" style={{ color: colors.muted }}>
          Your signature appears automatically on routine footers and exported PDFs.
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          void fromFile(file);
        }}
      />

      {error ? (
        <div className="text-xs p-2 rounded-md" style={{ color: colors.danger, backgroundColor: colors.dangerBg }}>
          {error}
        </div>
      ) : null}

      <div className="pt-2 flex flex-col gap-2">
        <Button
          label="Change PIN"
          icon={<KeyRound size={16} />}
          onClick={onChangePin}
        />
        <Button
          label="Sign out"
          tone="danger"
          icon={<LogOut size={16} />}
          onClick={onSignOut}
        />
      </div>

      <div className="text-xs text-center pt-2" style={{ color: colors.muted }}>
        Version {version}
      </div>
    </div>
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
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full flex-none"
      style={{ backgroundColor: palette.backgroundColor, color: palette.color }}
    >
      {courseStatusLabel(status)}
    </span>
  );
}
