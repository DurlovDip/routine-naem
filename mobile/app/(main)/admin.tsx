import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import { useAccess, useAuth, type DirectoryRow } from "../../src/auth";
import { addModuleEntry, withModules } from "../../src/catalog";
import { roleLabel, type StoredRole } from "../../src/lib/roles";
import { cleanBatchNumber, formatModuleCode, normalizeModuleNumber, normalizeSubNumber } from "../../src/lib/text";
import { isIsoDate } from "../../src/lib/time";
import { designationChoices } from "../../src/lib/designations";
import { type ModuleEntry, type Teacher } from "../../src/lib/types";
import { useSchedule } from "../../src/store";
import { colors } from "../../src/theme";
import { Button, Field, Label, Segmented, Select, T } from "../../src/ui";

type Panel = "teachers" | "modules" | "batches" | "roles";
type Assignable = Exclude<StoredRole, "super_admin">;

export default function AdminScreen() {
  const access = useAccess();
  const [panel, setPanel] = useState<Panel>("teachers");
  if (!access.canAdmin) return <Redirect href="/(main)/routine" />;

  return (
    <View style={{ flex: 1, backgroundColor: colors.desk }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <Segmented
          label="Manage"
          value={panel}
          onChange={setPanel}
          options={[
            { value: "teachers", label: "Teachers" },
            { value: "modules", label: "Modules" },
            { value: "batches", label: "Batches" },
            { value: "roles", label: "Roles" },
          ]}
        />
      </View>
      {panel === "teachers" ? <TeachersPanel /> : null}
      {panel === "modules" ? <ModulesPanel /> : null}
      {panel === "batches" ? <BatchesPanel /> : null}
      {panel === "roles" ? <RolesPanel /> : null}
    </View>
  );
}

function TeachersPanel() {
  const { state, dispatch, designations } = useSchedule();
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState<string>("Assistant Director");
  const choices = designationChoices(designations, [designation]);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <T style={{ color: colors.muted, fontSize: 12 }}>Names and designations saved with the teacher list.</T>
      {state.teachers.map((teacher) => (
        <TeacherRow key={teacher.id} teacher={teacher} />
      ))}
      <View style={card}>
        <Label>New teacher</Label>
        <Field value={name} onChangeText={setName} placeholder="Name" autoCapitalize="words" />
        <View style={{ height: 8 }} />
        <Select
          label="Designation"
          value={designation}
          options={["", ...choices]}
          placeholder="No designation"
          onChange={setDesignation}
        />
        <View style={{ height: 8 }} />
        <Button
          label="Add teacher"
          tone="primary"
          onPress={() => {
            if (!name.trim()) return;
            dispatch({ type: "add-teacher", name, designation });
            setName("");
          }}
        />
      </View>
    </ScrollView>
  );
}

function TeacherRow({ teacher }: { teacher: Teacher }) {
  const { dispatch, designations } = useSchedule();
  const [name, setName] = useState(teacher.name);
  useEffect(() => setName(teacher.name), [teacher.name]);
  const options = designationChoices(designations, [teacher.designation]);
  return (
    <View style={card}>
      <Field
        value={name}
        autoCapitalize="words"
        onChangeText={setName}
        onBlur={() => {
          const trimmed = name.trim();
          if (!trimmed) setName(teacher.name);
          else dispatch({ type: "rename-teacher", id: teacher.id, name: trimmed });
        }}
      />
      <View style={{ height: 8 }} />
      <Select
        label={`Designation for ${teacher.name}`}
        value={teacher.designation || ""}
        options={["", ...options]}
        placeholder="No designation"
        onChange={(value) => dispatch({ type: "set-teacher-designation", id: teacher.id, designation: value })}
      />
      <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
        <Button
          small
          tone="danger"
          label="Remove"
          onPress={() =>
            Alert.alert(`Remove ${teacher.name}?`, "Their account row is removed the next time the teacher list is saved.", [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: () => dispatch({ type: "remove-teacher", id: teacher.id }) },
            ])
          }
        />
      </View>
    </View>
  );
}

function ModulesPanel() {
  const { state, dispatch } = useSchedule();
  const [number, setNumber] = useState("");
  const [sub, setSub] = useState("");
  const [name, setName] = useState("");
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <T style={{ color: colors.muted, fontSize: 12 }}>A cell prints as M- 7.04. Numbers fill the editor dropdowns.</T>
      {state.modules.map((module) => (
        <ModuleRow key={module.id} module={module} />
      ))}
      <View style={card}>
        <Label>Module number</Label>
        <Field value={number} onChangeText={setNumber} placeholder="M-7" />
        <View style={{ height: 8 }} />
        <Label>Sub-number</Label>
        <Field value={sub} onChangeText={setSub} placeholder=".04" />
        <View style={{ height: 8 }} />
        <Label>Name</Label>
        <Field value={name} onChangeText={setName} placeholder="Module name" autoCapitalize="sentences" />
        <View style={{ height: 8 }} />
        <Button
          label="Add module"
          tone="primary"
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
    </ScrollView>
  );
}

function ModuleRow({ module }: { module: ModuleEntry }) {
  const { state, dispatch } = useSchedule();
  const [number, setNumber] = useState(module.moduleNumber ?? "");
  const [sub, setSub] = useState(module.moduleSubnumber ?? "");
  const [name, setName] = useState(module.moduleName || module.title);
  useEffect(() => {
    setNumber(module.moduleNumber ?? "");
    setSub(module.moduleSubnumber ?? "");
    setName(module.moduleName || module.title);
  }, [module]);

  function commit(nextNumber: string, nextSub: string, nextName: string) {
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
  }

  return (
    <View style={card}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Label>Number</Label>
          <Field value={number} onChangeText={setNumber} onBlur={() => commit(number, sub, name)} />
        </View>
        <View style={{ width: 88 }}>
          <Label>Sub</Label>
          <Field value={sub} onChangeText={setSub} onBlur={() => commit(number, sub, name)} />
        </View>
      </View>
      <View style={{ height: 8 }} />
      <Label>Name</Label>
      <Field value={name} onChangeText={setName} onBlur={() => commit(number, sub, name)} autoCapitalize="sentences" />
      <T style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{module.code}</T>
      <View style={{ marginTop: 8, alignSelf: "flex-start" }}>
        <Button
          small
          tone="danger"
          label="Remove"
          onPress={() => dispatch({ type: "replace", state: withModules(state, state.modules.filter((item) => item.id !== module.id)) })}
        />
      </View>
    </View>
  );
}

function BatchesPanel() {
  const { state, dispatch, day } = useSchedule();
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
      <T style={{ color: colors.muted, fontSize: 12 }}>Batch rows on the routine. Student count rebuilds the roster from 01.</T>
      {state.batches.map((batch, index) => (
        <View key={batch.id} style={card}>
          <Label>Name</Label>
          <Field
            value={batch.name}
            placeholder={cleanBatchNumber(batch.name, batch.id) || "9th"}
            onChangeText={(name) => dispatch({ type: "rename-batch", id: batch.id, name })}
          />
          <View style={{ height: 8 }} />
          <Label>Students</Label>
          <Field
            keyboardType="number-pad"
            value={String(batch.numberOfStudents ?? batch.roster.length ?? 40)}
            onChangeText={(value) => {
              const count = Number(value);
              if (Number.isFinite(count)) dispatch({ type: "set-batch-student-count", id: batch.id, count });
            }}
          />
          <T style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
            Today’s managers: {(day.managers[batch.id] ?? []).join(", ") || "—"}
          </T>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Button small label="Up" disabled={index === 0} onPress={() => dispatch({ type: "move-batch", id: batch.id, dir: -1 })} />
            <Button small label="Down" disabled={index === state.batches.length - 1} onPress={() => dispatch({ type: "move-batch", id: batch.id, dir: 1 })} />
            <Button
              small
              tone="danger"
              label="Remove"
              onPress={() =>
                Alert.alert("Remove this batch?", "Its cells are removed from every day.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Remove", style: "destructive", onPress: () => dispatch({ type: "remove-batch", id: batch.id }) },
                ])
              }
            />
          </View>
        </View>
      ))}
      <Button label="Add batch" tone="primary" onPress={() => dispatch({ type: "add-batch" })} />
    </ScrollView>
  );
}

function RolesPanel() {
  const auth = useAuth();
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 28 }}>
      <T style={{ color: colors.muted, fontSize: 12 }}>
        Coordinator dates use Asia/Dhaka. Outside the range the account acts as a teacher.
      </T>
      {error ? <T style={{ color: colors.danger }}>{error}</T> : null}
      {rows.map((row) => (
        <RoleRow
          key={row.teacherId}
          row={row}
          onSave={async (role, start, end) => {
            const message = await auth.assignRole(row.teacherId, role, start, end);
            if (message) setError(message);
            else {
              setError(null);
              await load();
            }
          }}
        />
      ))}
    </ScrollView>
  );
}

function RoleRow({
  row,
  onSave,
}: {
  row: DirectoryRow;
  onSave: (role: Assignable, start: string | null, end: string | null) => Promise<void>;
}) {
  const initial = row.storedRole === "super_admin" ? "teacher" : row.storedRole;
  const [role, setRole] = useState<Assignable>(initial);
  const [start, setStart] = useState(row.roleStart ?? "");
  const [end, setEnd] = useState(row.roleEnd ?? "");
  const [busy, setBusy] = useState(false);
  const dated = role === "coordinator" || role === "temp_coordinator";
  const note =
    row.storedRole === row.role ? roleLabel(row.role) : `${roleLabel(row.storedRole)} stored · ${roleLabel(row.role)} today`;

  if (row.storedRole === "super_admin") {
    return (
      <View style={card}>
        <T weight="semibold">{row.teacherName}</T>
        <T style={{ color: colors.muted, fontSize: 12 }}>{row.username ? `@${row.username}` : "No account yet"} · Super admin</T>
      </View>
    );
  }

  return (
    <View style={card}>
      <T weight="semibold">{row.teacherName}</T>
      <T style={{ color: colors.muted, fontSize: 12, marginBottom: 8 }}>
        {row.username ? `@${row.username}` : "No account yet"} · {note}
      </T>
      <Select
        label={`Role for ${row.teacherName}`}
        value={role === "temp_coordinator" ? "Temporary coordinator" : role === "coordinator" ? "Coordinator" : "Teacher"}
        options={["Teacher", "Coordinator", "Temporary coordinator"]}
        onChange={(value) => {
          if (value === "Coordinator") setRole("coordinator");
          else if (value === "Temporary coordinator") setRole("temp_coordinator");
          else setRole("teacher");
        }}
      />
      {dated ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
          <View style={{ flex: 1 }}>
            <Label>Starts</Label>
            <Field value={start} onChangeText={setStart} placeholder="YYYY-MM-DD" />
          </View>
          <View style={{ flex: 1 }}>
            <Label>Ends</Label>
            <Field value={end} onChangeText={setEnd} placeholder="YYYY-MM-DD" />
          </View>
        </View>
      ) : null}
      <View style={{ marginTop: 8 }}>
        <Button
          label={busy ? "Saving…" : "Save role"}
          tone="primary"
          disabled={busy || (dated && (!isIsoDate(start) || !isIsoDate(end)))}
          onPress={() => {
            setBusy(true);
            void onSave(role, dated ? start : null, dated ? end : null).finally(() => setBusy(false));
          }}
        />
      </View>
    </View>
  );
}

const card = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: 12,
  padding: 12,
} as const;
