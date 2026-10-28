import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { useAccess, useAuth, type DirectoryRow } from "../../src/auth";
import { CoursesPanel } from "../../src/CoursesPanel";
import { addModuleEntry, withModules } from "../../src/catalog";
import { formatModuleCode, normalizeModuleNumber, normalizeSubNumber } from "../../src/lib/text";
import { designationChoices } from "../../src/lib/designations";
import { type ModuleEntry } from "../../src/lib/types";
import { supabase } from "../../src/lib/supabase";
import { useSchedule } from "../../src/store";
import { card, colors, radius, shadow, space } from "../../src/theme";
import { Button, Field, Label, Segmented, Select, T } from "../../src/ui";

type Panel = "courses" | "modules" | "teachers";

export default function AdminScreen() {
  const access = useAccess();
  const showCourses = access.role === "super_admin";
  const [panel, setPanel] = useState<Panel>(showCourses ? "courses" : "teachers");
  if (!access.canAdmin) return <Redirect href="/(main)/routine" />;
  const panels: { value: Panel; label: string }[] = [
    ...(showCourses ? [{ value: "courses" as const, label: "Courses" }] : []),
    { value: "modules", label: "Modules" },
    { value: "teachers", label: "Teachers" },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: colors.desk }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Segmented scrollable label="Manage" value={panel} onChange={setPanel} options={panels} />
      </View>
      {panel === "courses" && showCourses ? <CoursesPanel /> : null}
      {panel === "modules" ? <ModulesPanel /> : null}
      {panel === "teachers" ? <TeachersPanel /> : null}
    </View>
  );
}

function ModulesPanel() {
  const { state, dispatch } = useSchedule();
  const [number, setNumber] = useState("");
  const [sub, setSub] = useState("");
  const [name, setName] = useState("");
  const [editingModule, setEditingModule] = useState<ModuleEntry | null>(null);

  function handleSaveModule(module: ModuleEntry, nextNumber: string, nextSub: string, nextName: string) {
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
    try {
      void supabase.from("modules").update({
        module_number: major.replace(/^M-/, ""),
        module_subnumber: minor.replace(/^\./, ""),
        module_name: title,
      }).eq("id", module.id);
    } catch {
      // best-effort
    }
  }

  function handleRemoveModule(module: ModuleEntry) {
    dispatch({ type: "replace", state: withModules(state, state.modules.filter((item) => item.id !== module.id)) });
    try {
      void supabase.from("modules").delete().eq("id", module.id);
    } catch {
      // best-effort
    }
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <T style={{ color: colors.muted, fontSize: 12 }}>
        A cell prints as M- 7.04. Numbers fill the editor dropdowns.
      </T>

      {/* New Module Card on Top */}
      <View style={[card, { borderWidth: 1, borderColor: colors.line }]}>
        <T weight="bold" style={{ fontSize: 15, color: colors.ink, marginBottom: 8 }}>
          New module
        </T>
        <Label>Module number</Label>
        <Field value={number} onChangeText={setNumber} placeholder="M-7" />
        <View style={{ height: 8 }} />

        <Label>Sub-number</Label>
        <Field value={sub} onChangeText={setSub} placeholder=".04" />
        <View style={{ height: 8 }} />

        <Label>Name</Label>
        <Field value={name} onChangeText={setName} placeholder="Module name" autoCapitalize="sentences" />
        <View style={{ height: 12 }} />
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
      </View>

      {/* Modules List */}
      <T weight="bold" style={{ fontSize: 14, color: colors.ink, marginTop: 4 }}>
        Modules catalog ({state.modules.length})
      </T>

      {state.modules.length === 0 ? (
        <T style={{ color: colors.muted, fontSize: 12 }}>No modules added yet.</T>
      ) : null}

      {state.modules.map((module) => {
        const isEditing = editingModule?.id === module.id;
        return (
          <Pressable
            key={module.id}
            testID={`module-item-${module.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Module ${module.code || module.title}`}
            onPress={() => setEditingModule(module)}
            style={({ pressed }) => [
              {
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: isEditing ? colors.accent : colors.line,
                paddingVertical: 12,
                paddingHorizontal: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={{ flex: 1, marginRight: 8, gap: 2 }}>
              <T weight="semibold" style={{ fontSize: 15, color: colors.ink }}>
                {module.code || "Unnamed Module"}
              </T>
              <T style={{ color: colors.muted, fontSize: 12 }}>
                {module.moduleName || module.title || "No description"}
              </T>
            </View>

            <Pressable
              testID={`edit-module-${module.id}`}
              accessibilityLabel={`Edit ${module.code || module.title}`}
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                setEditingModule(module);
              }}
              style={({ pressed }) => [
                {
                  width: 36,
                  height: 36,
                  borderRadius: radius.md,
                  backgroundColor: colors.paper,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons name="pencil" size={16} color={colors.ink} />
            </Pressable>
          </Pressable>
        );
      })}

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
    </ScrollView>
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

  useEffect(() => {
    if (module && visible) {
      setNumber(module.moduleNumber ?? "");
      setSub(module.moduleSubnumber ?? "");
      setName(module.moduleName || module.title || "");
    }
  }, [module, visible]);

  if (!module) return null;

  const previewCode = formatModuleCode(normalizeModuleNumber(number), normalizeSubNumber(sub));

  function handleSave() {
    onSave(number, sub, name);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <Pressable style={Platform.OS === "web" ? undefined : backdropDismiss} onPress={onClose} />
        <View style={modalCard}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T weight="bold" style={{ fontSize: 17, color: colors.ink }}>
                Edit module
              </T>
              {previewCode ? (
                <T style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
                  Preview: {previewCode}
                </T>
              ) : null}
            </View>
            <Pressable hitSlop={8} onPress={onClose} style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          <View>
            <Label>Module number</Label>
            <Field value={number} onChangeText={setNumber} placeholder="M-7" />
          </View>

          <View>
            <Label>Sub-number</Label>
            <Field value={sub} onChangeText={setSub} placeholder=".04" />
          </View>

          <View>
            <Label>Name</Label>
            <Field value={name} onChangeText={setName} placeholder="Module name" autoCapitalize="sentences" />
          </View>

          {/* Remove module */}
          <View style={{ marginTop: 4, alignSelf: "flex-start" }}>
            <Button
              small
              tone="danger"
              label="Remove module"
              onPress={() =>
                Alert.alert(`Remove ${previewCode || module.code || "this module"}?`, "It will be removed from the catalog.", [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => {
                      onRemove();
                      onClose();
                    },
                  },
                ])
              }
            />
          </View>

          {/* Footer Actions */}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: space.sm }}>
            <Button label="Cancel" onPress={onClose} />
            <Button
              label="Save changes"
              tone="primary"
              disabled={!number.trim() && !name.trim()}
              onPress={handleSave}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TeachersPanel() {
  const auth = useAuth();
  const { state, dispatch, designations } = useSchedule();
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editingTeacher, setEditingTeacher] = useState<DirectoryRow | null>(null);

  // New Teacher Form State
  const [newName, setNewName] = useState("");
  const [newDesignation, setNewDesignation] = useState("Assistant Director");
  const [newPin, setNewPin] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const designationOptions = designationChoices(designations, [newDesignation]);

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
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <T style={{ color: colors.muted, fontSize: 12 }}>
        Manage teacher directory, designations, and account PINs. Course coordinators can be assigned directly inside each course under the Courses tab.
      </T>
      {error ? <T style={{ color: colors.danger, fontSize: 13 }}>{error}</T> : null}

      {/* New Teacher Card */}
      <View style={[card, { borderWidth: 1, borderColor: colors.line }]}>
        <T weight="bold" style={{ fontSize: 15, color: colors.ink, marginBottom: 8 }}>
          New teacher
        </T>
        <Field value={newName} onChangeText={setNewName} placeholder="Name" autoCapitalize="words" />
        <View style={{ height: 8 }} />

        <Select
          label="Designation"
          value={newDesignation}
          options={designationOptions}
          placeholder="No designation"
          onChange={setNewDesignation}
        />
        <View style={{ height: 8 }} />

        <Label>PIN (default 6832)</Label>
        <Field
          value={newPin}
          onChangeText={(val) => setNewPin(val.replace(/\D/g, "").slice(0, 4))}
          placeholder="6832"
          keyboardType="number-pad"
          maxLength={4}
        />

        <View style={{ marginTop: 12 }}>
          <Button
            label={isAdding ? "Adding…" : "Add teacher"}
            tone="primary"
            disabled={isAdding || !newName.trim()}
            onPress={handleAddTeacher}
          />
        </View>
      </View>

      {/* Minimized Teacher List */}
      <T weight="semibold" style={{ fontSize: 13, color: colors.ink, marginTop: 4 }}>
        Teachers directory ({rows.length})
      </T>
      {rows.map((row) => {
        const local = state.teachers.find((t) => t.id === row.teacherId);
        const currentDesignation = row.designation || local?.designation || "";
        const isEditing = editingTeacher?.teacherId === row.teacherId;

        return (
          <Pressable
            key={row.teacherId}
            testID={`teacher-item-${row.teacherId}`}
            accessibilityRole="button"
            accessibilityLabel={`Teacher ${row.teacherName}`}
            onPress={() => setEditingTeacher(row)}
            style={({ pressed }) => [
              {
                backgroundColor: colors.surface,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
                paddingVertical: 12,
                paddingHorizontal: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <T weight="semibold" style={{ fontSize: 15, color: colors.ink }}>
                {row.teacherName}
              </T>
              <T style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
                {currentDesignation || "No designation"}
              </T>
            </View>

            <Pressable
              testID={`edit-teacher-${row.teacherId}`}
              accessibilityLabel={`Edit ${row.teacherName}`}
              hitSlop={8}
              onPress={(e) => {
                e.stopPropagation();
                setEditingTeacher(row);
              }}
              style={({ pressed }) => [
                {
                  width: 36,
                  height: 36,
                  borderRadius: radius.md,
                  backgroundColor: colors.paper,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name="pencil"
                size={16}
                color={colors.ink}
              />
            </Pressable>
          </Pressable>
        );
      })}

      <EditTeacherModal
        teacher={editingTeacher}
        visible={editingTeacher !== null}
        designations={designations}
        onClose={() => setEditingTeacher(null)}
        isSuper={editingTeacher?.storedRole === "super_admin"}
        onSave={async (updatedName, updatedDesignation) => {
          if (!editingTeacher) return;
          if (updatedName && updatedName !== editingTeacher.teacherName) {
            dispatch({ type: "rename-teacher", id: editingTeacher.teacherId, name: updatedName });
          }
          if (updatedDesignation !== undefined) {
            dispatch({ type: "set-teacher-designation", id: editingTeacher.teacherId, designation: updatedDesignation });
          }
          try {
            await supabase.from("teachers").update({ name: updatedName, designation: updatedDesignation }).eq("id", editingTeacher.teacherId);
          } catch {
            // best effort
          }
          await load();
        }}
        onRemove={async () => {
          if (!editingTeacher) return;
          dispatch({ type: "remove-teacher", id: editingTeacher.teacherId });
          try {
            await supabase.from("teachers").delete().eq("id", editingTeacher.teacherId);
          } catch {
            // best effort
          }
          await load();
        }}
      />
    </ScrollView>
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

  useEffect(() => {
    if (teacher && visible) {
      setName(teacher.teacherName);
      setDesignation(teacher.designation || "");
      setError(null);
      setBusy(false);
    }
  }, [teacher, visible]);

  if (!teacher) return null;

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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <Pressable style={Platform.OS === "web" ? undefined : backdropDismiss} onPress={onClose} />
        <View style={modalCard}>
          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T weight="semibold" style={{ fontSize: 16, color: colors.ink }}>
              Edit teacher
            </T>
            <Pressable
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}
            >
              <Ionicons name="close" size={22} color={colors.muted} />
            </Pressable>
          </View>

          {error ? (
            <T style={{ color: colors.danger, fontSize: 12 }}>{error}</T>
          ) : null}

          {/* Name */}
          <View>
            <Label>Name</Label>
            <Field value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" />
          </View>

          {/* Designation */}
          <View>
            <Label>Designation</Label>
            <Select
              label="Designation"
              value={designation}
              options={designationOptions}
              placeholder="No designation"
              onChange={setDesignation}
            />
          </View>

          {/* PIN Reset */}
          <PinReset teacherId={teacher.teacherId} teacherName={teacher.teacherName} />

          {/* Remove Teacher */}
          {!isSuper ? (
            <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
              <Button
                small
                tone="danger"
                label="Remove teacher"
                onPress={() =>
                  Alert.alert(`Remove ${teacher.teacherName}?`, "Their account row will be removed.", [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: async () => {
                        await onRemove();
                        onClose();
                      },
                    },
                  ])
                }
              />
            </View>
          ) : null}

          {/* Footer Actions */}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: space.sm }}>
            <Button label="Cancel" onPress={onClose} />
            <Button
              label={busy ? "Saving…" : "Save changes"}
              tone="primary"
              disabled={busy || !name.trim()}
              onPress={handleSave}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PinReset({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const auth = useAuth();
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <View style={{ marginTop: 10 }}>
      <Label>New PIN</Label>
      <Field
        value={pin}
        onChangeText={(value) => {
          setNote(null);
          setError(null);
          setPin(value.replace(/\D/g, "").slice(0, 4));
        }}
        keyboardType="number-pad"
        maxLength={4}
        secureTextEntry
        placeholder="4 digits"
        accessibilityLabel={`New PIN for ${teacherName}`}
      />
      {error ? <T style={{ color: colors.danger, marginTop: 6, fontSize: 12 }}>{error}</T> : null}
      {note ? <T style={{ color: colors.muted, marginTop: 6, fontSize: 12 }}>{note}</T> : null}
      <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
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
      </View>
    </View>
  );
}

const backdrop = {
  flex: 1,
  backgroundColor: "rgba(28, 24, 20, 0.45)",
  justifyContent: "center" as const,
  padding: 20,
};

const backdropDismiss = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const modalCard = {
  backgroundColor: colors.surface,
  borderRadius: radius.md,
  padding: space.lg,
  gap: space.md,
  ...shadow,
};
