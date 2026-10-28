import { useEffect, useState } from "react";
import { isAuthMock, useAccess, useAuth, type DirectoryRow } from "../auth";
import { addModuleEntry, withModules } from "../catalog";
import { CoursesPanel } from "./CoursesPanel";
import { useDesignations } from "../designations";
import { designationChoices } from "../lib/designations";
import { supabase } from "../lib/supabase";
import { formatModuleCode, normalizeModuleNumber, normalizeSubNumber } from "../lib/text";
import type { ModuleEntry } from "../lib/types";
import { useSchedule } from "../state";
import { colors } from "../theme";
import { Button, Field, Label, Segmented, Select, T } from "./ui";

type Panel = "courses" | "modules" | "teachers";

export function ManageTab({ onOpenRoutine }: { onOpenRoutine?: () => void }) {
  const access = useAccess();
  const showCourses = access.role === "super_admin";
  const [panel, setPanel] = useState<Panel>(showCourses ? "courses" : "teachers");

  if (!access.canAdmin) {
    return (
      <div className="w-full max-w-xl mx-auto p-8 text-center">
        <T style={{ color: colors.muted }}>You do not have administrative access.</T>
      </div>
    );
  }

  const panels: { value: Panel; label: string }[] = [
    ...(showCourses ? [{ value: "courses" as const, label: "Courses" }] : []),
    { value: "modules", label: "Modules" },
    { value: "teachers", label: "Teachers" },
  ];

  return (
    <div className="w-full max-w-3xl mx-auto px-4 sm:px-6 py-4 space-y-4">
      <div>
        <Segmented
          label="Manage"
          value={panel}
          onChange={(val) => setPanel(val as Panel)}
          options={panels}
        />
      </div>

      {panel === "courses" && showCourses ? (
        <CoursesPanel onOpenRoutine={onOpenRoutine} />
      ) : null}

      {panel === "modules" ? <ModulesPanel /> : null}

      {panel === "teachers" ? <TeachersPanel /> : null}
    </div>
  );
}

function ModulesPanel() {
  const { state, dispatch } = useSchedule();
  const [number, setNumber] = useState("");
  const [sub, setSub] = useState("");
  const [name, setName] = useState("");
  const [editingModule, setEditingModule] = useState<ModuleEntry | null>(null);

  function handleSaveModule(
    module: ModuleEntry,
    nextNumber: string,
    nextSub: string,
    nextName: string,
  ) {
    const major = normalizeModuleNumber(nextNumber);
    const minor = normalizeSubNumber(nextSub);
    const title = nextName.trim();
    const modules = state.modules.map((item) =>
      item.id === module.id
        ? {
            ...item,
            moduleNumber: major.replace(/^M-/, ""),
            moduleSubnumber: minor.replace(/^\./, ""),
            moduleName: title,
            title,
            code: formatModuleCode(major, minor),
          }
        : item,
    );
    dispatch({ type: "replace", state: withModules(state, modules) });
    if (supabase && !isAuthMock) {
      try {
        void supabase
          .from("modules")
          .update({
            module_number: major.replace(/^M-/, ""),
            module_subnumber: minor.replace(/^\./, ""),
            module_name: title,
          })
          .eq("id", module.id);
      } catch {
        // best-effort
      }
    }
  }

  function handleRemoveModule(module: ModuleEntry) {
    dispatch({
      type: "replace",
      state: withModules(
        state,
        state.modules.filter((item) => item.id !== module.id),
      ),
    });
    if (supabase && !isAuthMock) {
      try {
        void supabase.from("modules").delete().eq("id", module.id);
      } catch {
        // best-effort
      }
    }
  }

  return (
    <div className="space-y-4">
      <T style={{ color: colors.muted, fontSize: 13, lineHeight: 1.4 }}>
        A cell prints as M- 7.04. Numbers fill the editor dropdowns.
      </T>

      {/* New Module Card */}
      <div
        className="p-5 rounded-2xl border space-y-3"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.line,
        }}
      >
        <T weight="bold" style={{ fontSize: 15, color: colors.ink }}>
          New module
        </T>

        <div>
          <Label>Module number</Label>
          <Field value={number} onChangeText={setNumber} placeholder="M-7" />
        </div>

        <div>
          <Label>Sub-number</Label>
          <Field value={sub} onChangeText={setSub} placeholder=".04" />
        </div>

        <div>
          <Label>Name</Label>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Module name"
            autoCapitalize="sentences"
          />
        </div>

        <div className="pt-1">
          <Button
            label="Add module"
            tone="primary"
            disabled={!number.trim() && !name.trim()}
            onPress={() => {
              const next = addModuleEntry(state, { number, sub, name });
              if (next === state) return;
              dispatch({ type: "replace", state: next });
              setNumber("");
              setSub("");
              setName("");
            }}
          />
        </div>
      </div>

      {/* Modules List Header */}
      <div className="pt-1">
        <T weight="bold" style={{ fontSize: 14, color: colors.ink }}>
          Modules catalog ({state.modules.length})
        </T>
      </div>

      {state.modules.length === 0 ? (
        <T style={{ color: colors.muted, fontSize: 13 }}>No modules added yet.</T>
      ) : null}

      <div className="space-y-2">
        {state.modules.map((module) => {
          const isEditing = editingModule?.id === module.id;
          return (
            <div
              key={module.id}
              onClick={() => setEditingModule(module)}
              className="p-3.5 sm:p-4 rounded-xl border flex items-center justify-between cursor-pointer transition hover:opacity-95"
              style={{
                backgroundColor: colors.surface,
                borderColor: isEditing ? colors.accent : colors.line,
              }}
            >
              <div className="flex-1 mr-3 space-y-0.5">
                <T weight="semibold" style={{ fontSize: 15, color: colors.ink }}>
                  {module.code || "Unnamed Module"}
                </T>
                <T style={{ color: colors.muted, fontSize: 12 }}>
                  {module.moduleName || module.title || "No description"}
                </T>
              </div>

              <button
                type="button"
                aria-label={`Edit ${module.code || module.title}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingModule(module);
                }}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition hover:bg-black/5"
                style={{ backgroundColor: colors.paper, color: colors.ink }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <EditModuleModal
        module={editingModule}
        visible={editingModule !== null}
        onClose={() => setEditingModule(null)}
        onSave={(modNum, modSub, modName) => {
          if (editingModule) {
            handleSaveModule(editingModule, modNum, modSub, modName);
          }
        }}
        onRemove={() => {
          if (editingModule) {
            handleRemoveModule(editingModule);
          }
        }}
      />
    </div>
  );
}

function EditModuleModal({
  module,
  visible,
  onClose,
  onSave,
  onRemove,
}: {
  module: ModuleEntry | null;
  visible: boolean;
  onClose: () => void;
  onSave: (moduleNumber: string, moduleSubnumber: string, moduleName: string) => void;
  onRemove: () => void;
}) {
  const [number, setNumber] = useState("");
  const [sub, setSub] = useState("");
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (module && visible) {
      setNumber(module.moduleNumber ?? "");
      setSub(module.moduleSubnumber ?? "");
      setName(module.moduleName || module.title || "");
      setConfirmDelete(false);
    }
  }, [module, visible]);

  if (!module || !visible) return null;

  const previewCode = formatModuleCode(normalizeModuleNumber(number), normalizeSubNumber(sub));

  function handleSave() {
    onSave(number, sub, name);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(26,26,24,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md p-6 rounded-2xl shadow-xl space-y-4 my-8"
        style={{ backgroundColor: colors.surface }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="space-y-0.5">
            <T weight="bold" style={{ fontSize: 17, color: colors.ink }}>
              Edit module
            </T>
            {previewCode ? (
              <T style={{ color: colors.accentDark, fontSize: 12, fontWeight: "600" }}>
                Preview: {previewCode}
              </T>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-700 transition"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div>
          <Label>Module number</Label>
          <Field value={number} onChangeText={setNumber} placeholder="M-7" />
        </div>

        <div>
          <Label>Sub-number</Label>
          <Field value={sub} onChangeText={setSub} placeholder=".04" />
        </div>

        <div>
          <Label>Name</Label>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Module name"
            autoCapitalize="sentences"
          />
        </div>

        {/* Remove module */}
        <div className="pt-2">
          {!confirmDelete ? (
            <Button
              small
              tone="danger"
              label="Remove module"
              onPress={() => setConfirmDelete(true)}
            />
          ) : (
            <div className="p-3 rounded-xl border space-y-2 bg-red-50/50" style={{ borderColor: colors.line }}>
              <T style={{ fontSize: 12, color: colors.ink }}>
                Remove {previewCode || module.code || "this module"} from the catalog?
              </T>
              <div className="flex gap-2">
                <Button small label="Cancel" onPress={() => setConfirmDelete(false)} />
                <Button
                  small
                  tone="danger"
                  label="Confirm remove"
                  onPress={() => {
                    onRemove();
                    onClose();
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button label="Cancel" onPress={onClose} />
          <Button
            label="Save changes"
            tone="primary"
            disabled={!number.trim() && !name.trim()}
            onPress={handleSave}
          />
        </div>
      </div>
    </div>
  );
}

function TeachersPanel() {
  const auth = useAuth();
  const { state, dispatch } = useSchedule();
  const { names: designationNames } = useDesignations();
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<DirectoryRow | null>(null);

  // New Teacher Form State
  const [newName, setNewName] = useState("");
  const [newDesignation, setNewDesignation] = useState("Assistant Director");
  const [newPin, setNewPin] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const designationOptions = designationChoices(designationNames, [newDesignation]);

  async function load() {
    try {
      setRows(await auth.directory());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, [auth.session?.role]);

  async function handleAddTeacher() {
    const trimmedName = newName.trim();
    if (!trimmedName) return;
    setIsAdding(true);
    setError(null);
    try {
      const teacherId = `teacher-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const finalPin = newPin.trim() || "6832";

      // 1. Insert into database
      if (supabase && !isAuthMock) {
        try {
          await supabase.from("teachers").insert({
            id: teacherId,
            name: trimmedName,
            designation: newDesignation.trim(),
            updated_at: new Date().toISOString(),
          });
        } catch (err) {
          console.warn("Direct teacher insert warning:", err);
        }
      }

      // 2. Set PIN (default 6832 if not provided)
      try {
        await auth.adminResetPin(teacherId, finalPin);
      } catch (err) {
        console.warn("Reset PIN warning:", err);
      }

      // 3. Update local schedule state
      dispatch({
        type: "add-teacher",
        name: trimmedName,
        designation: newDesignation.trim(),
      });

      // 4. Reset inputs & reload
      setNewName("");
      setNewDesignation("Assistant Director");
      setNewPin("");

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <div className="space-y-4">
      <T style={{ color: colors.muted, fontSize: 13, lineHeight: 1.4 }}>
        Manage teacher directory, designations, and account PINs. Course coordinators can be assigned directly inside each course under the Courses tab.
      </T>
      {error ? <T style={{ color: colors.danger, fontSize: 13 }}>{error}</T> : null}

      {/* New Teacher Card */}
      <div
        className="p-5 rounded-2xl border space-y-3"
        style={{
          backgroundColor: colors.surface,
          borderColor: colors.line,
        }}
      >
        <T weight="bold" style={{ fontSize: 15, color: colors.ink }}>
          New teacher
        </T>

        <div>
          <Label>Name</Label>
          <Field
            value={newName}
            onChangeText={setNewName}
            placeholder="Name"
            autoCapitalize="words"
          />
        </div>

        <div>
          <Select
            label="Designation"
            value={newDesignation}
            options={designationOptions}
            placeholder="No designation"
            onChange={setNewDesignation}
          />
        </div>

        <div>
          <Label>PIN (default 6832)</Label>
          <Field
            value={newPin}
            onChangeText={(val) => setNewPin(val.replace(/\D/g, "").slice(0, 4))}
            placeholder="6832"
            maxLength={4}
          />
        </div>

        <div className="pt-1">
          <Button
            label={isAdding ? "Adding…" : "Add teacher"}
            tone="primary"
            disabled={isAdding || !newName.trim()}
            onPress={handleAddTeacher}
          />
        </div>
      </div>

      {/* Teachers Directory */}
      <div className="pt-1">
        <T weight="semibold" style={{ fontSize: 13, color: colors.ink }}>
          Teachers directory ({rows.length})
        </T>
      </div>

      <div className="space-y-2">
        {rows.map((row) => {
          const local = state.teachers.find((t) => t.id === row.teacherId);
          const currentDesignation = row.designation || local?.designation || "";
          const isEditing = editingTeacher?.teacherId === row.teacherId;

          return (
            <div
              key={row.teacherId}
              onClick={() => setEditingTeacher(row)}
              className="p-3.5 sm:p-4 rounded-xl border flex items-center justify-between cursor-pointer transition hover:opacity-95"
              style={{
                backgroundColor: colors.surface,
                borderColor: isEditing ? colors.accent : colors.line,
              }}
            >
              <div className="flex-1 mr-3 space-y-0.5">
                <T weight="semibold" style={{ fontSize: 15, color: colors.ink }}>
                  {row.teacherName}
                </T>
                <T style={{ color: colors.muted, fontSize: 12 }}>
                  {currentDesignation || "No designation"}
                </T>
              </div>

              <button
                type="button"
                aria-label={`Edit ${row.teacherName}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingTeacher(row);
                }}
                className="w-9 h-9 rounded-lg flex items-center justify-center transition hover:bg-black/5"
                style={{ backgroundColor: colors.paper, color: colors.ink }}
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
            </div>
          );
        })}
      </div>

      <EditTeacherModal
        teacher={editingTeacher}
        visible={editingTeacher !== null}
        designations={designationNames}
        onClose={() => setEditingTeacher(null)}
        isSuper={editingTeacher?.storedRole === "super_admin"}
        onSave={async (updatedName, updatedDesignation) => {
          if (!editingTeacher) return;
          if (updatedName && updatedName !== editingTeacher.teacherName) {
            dispatch({ type: "rename-teacher", id: editingTeacher.teacherId, name: updatedName });
          }
          if (updatedDesignation !== undefined) {
            dispatch({
              type: "set-teacher-designation",
              id: editingTeacher.teacherId,
              designation: updatedDesignation,
            });
          }
          if (supabase && !isAuthMock) {
            try {
              await supabase
                .from("teachers")
                .update({ name: updatedName, designation: updatedDesignation })
                .eq("id", editingTeacher.teacherId);
            } catch {
              // best effort
            }
          }
          await load();
        }}
        onRemove={async () => {
          if (!editingTeacher) return;
          dispatch({ type: "remove-teacher", id: editingTeacher.teacherId });
          if (supabase && !isAuthMock) {
            try {
              await supabase.from("teachers").delete().eq("id", editingTeacher.teacherId);
            } catch {
              // best effort
            }
          }
          await load();
        }}
      />
    </div>
  );
}

function EditTeacherModal({
  teacher,
  visible,
  designations,
  onClose,
  onSave,
  onRemove,
  isSuper,
}: {
  teacher: DirectoryRow | null;
  visible: boolean;
  designations: string[];
  onClose: () => void;
  onSave: (name: string, designation: string) => Promise<void>;
  onRemove: () => Promise<void>;
  isSuper: boolean;
}) {
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (teacher && visible) {
      setName(teacher.teacherName);
      setDesignation(teacher.designation || "");
      setError(null);
      setBusy(false);
      setConfirmDelete(false);
    }
  }, [teacher, visible]);

  if (!teacher || !visible) return null;

  const designationOptions = designationChoices(designations, [designation]);

  async function handleSave() {
    if (!name.trim()) {
      setError("Teacher name cannot be empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(name.trim(), designation.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(26,26,24,0.45)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md p-6 rounded-2xl shadow-xl space-y-4 my-8"
        style={{ backgroundColor: colors.surface }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <T weight="semibold" style={{ fontSize: 16, color: colors.ink }}>
            Edit teacher
          </T>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-stone-400 hover:text-stone-700 transition"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error ? <T style={{ color: colors.danger, fontSize: 12 }}>{error}</T> : null}

        {/* Name */}
        <div>
          <Label>Name</Label>
          <Field
            value={name}
            onChangeText={setName}
            placeholder="Name"
            autoCapitalize="words"
          />
        </div>

        {/* Designation */}
        <div>
          <Select
            label="Designation"
            value={designation}
            options={designationOptions}
            placeholder="No designation"
            onChange={setDesignation}
          />
        </div>

        {/* PIN Reset */}
        <PinReset teacherId={teacher.teacherId} teacherName={teacher.teacherName} />

        {/* Remove Teacher */}
        {!isSuper && (
          <div className="pt-2">
            {!confirmDelete ? (
              <Button
                small
                tone="danger"
                label="Remove teacher"
                onPress={() => setConfirmDelete(true)}
              />
            ) : (
              <div className="p-3 rounded-xl border space-y-2 bg-red-50/50" style={{ borderColor: colors.line }}>
                <T style={{ fontSize: 12, color: colors.ink }}>
                  Remove {teacher.teacherName}? Their account row will be removed.
                </T>
                <div className="flex gap-2">
                  <Button small label="Cancel" onPress={() => setConfirmDelete(false)} />
                  <Button
                    small
                    tone="danger"
                    label="Confirm remove"
                    onPress={async () => {
                      await onRemove();
                      onClose();
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button label="Cancel" onPress={onClose} />
          <Button
            label={busy ? "Saving…" : "Save changes"}
            tone="primary"
            disabled={busy || !name.trim()}
            onPress={handleSave}
          />
        </div>
      </div>
    </div>
  );
}

function PinReset({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const auth = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="pt-2 space-y-2 border-t" style={{ borderColor: colors.line }}>
      <Label>New PIN</Label>
      <Field
        aria-label={`New PIN for ${teacherName}`}
        value={pin}
        onChangeText={(value: string) => {
          setNote(null);
          setError(null);
          setPin(value.replace(/\D/g, "").slice(0, 4));
        }}
        maxLength={4}
        placeholder="4 digits"
      />
      {error ? <T style={{ color: colors.danger, fontSize: 12 }}>{error}</T> : null}
      {note ? <T style={{ color: colors.accentDark, fontSize: 12 }}>{note}</T> : null}
      <div className="pt-1">
        <Button
          small
          label={busy ? "Saving…" : "Reset PIN"}
          tone="primary"
          disabled={busy || pin.length !== 4}
          onPress={() => {
            setBusy(true);
            void auth.adminResetPin(teacherId, pin).then((message) => {
              setBusy(false);
              if (message) setError(message);
              else {
                setError(null);
                setNote("PIN reset.");
                setPin("");
              }
            });
          }}
        />
      </div>
    </div>
  );
}
