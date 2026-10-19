import { useEffect, useState, type KeyboardEvent } from "react";
import { useAuth } from "../auth";
import { useDesignations } from "../designations";
import { designationChoices } from "../lib/designations";
import type { DirectoryRow } from "../lib/mockAuth";
import { roleLabel, type StoredRole } from "../lib/roles";
import type { Teacher } from "../lib/types";
import { useSchedule } from "../state";
import { Button } from "./ui";

type Assignable = Exclude<StoredRole, "super_admin">;

function rowsFromSchedule(teachers: Teacher[]): DirectoryRow[] {
  return teachers.map((teacher) => ({
    teacherId: teacher.id,
    teacherName: teacher.name,
    designation: teacher.designation ?? "",
    username: null,
    storedRole: "teacher",
    role: "teacher",
    roleStart: null,
    roleEnd: null,
  }));
}

export function PeopleSection() {
  const auth = useAuth();
  const { state, dispatch } = useSchedule();
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    try {
      const result = await auth.directory();
      setRows(result.rows);
      setNotice(result.notice);
      setError(null);
    } catch (err) {
      setRows([]);
      setNotice(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void load();
  }, [auth.session?.role]);

  async function saveProfile(teacherId: string, patch: { name?: string; designation?: string }) {
    const message = await auth.updateTeacher(teacherId, patch);
    if (message) {
      setError(message);
      return message;
    }
    if (patch.name) dispatch({ type: "rename-teacher", id: teacherId, name: patch.name });
    if (patch.designation !== undefined) {
      dispatch({ type: "set-teacher-designation", id: teacherId, designation: patch.designation });
    }
    setError(null);
    await load();
    return null;
  }

  const scheduleRows = rowsFromSchedule(state.teachers);
  const shown = (rows.length > 0 ? rows : scheduleRows).map((row) => {
    const local = state.teachers.find((teacher) => teacher.id === row.teacherId);
    return {
      ...row,
      designation: row.designation || local?.designation || "",
      teacherName: row.teacherName || local?.name || row.teacherId,
    };
  });

  return (
    <div className="access-panel" id="people-panel">
      <p className="hint">
        Assign coordinator or temporary coordinator for a date range. Outside that range the person acts as a teacher. A super admin has no dates. Name and designation save when you leave the field. Reset PIN sets a new 4-digit PIN for that teacher.
      </p>
      {notice ? (
        <p className="auth-error" id="roles-notice">
          {notice}
        </p>
      ) : null}
      {error ? <p className="auth-error">{error}</p> : null}
      {!notice && !error && shown.length === 0 ? (
        <p className="hint">No teachers were returned from the teachers table.</p>
      ) : null}
      <ul className="account-list">
        {shown.map((row) => (
          <RoleRow
            key={row.teacherId}
            row={row}
            busy={busyId === row.teacherId}
            onSaveProfile={saveProfile}
            onSave={async (role, start, end) => {
              setBusyId(row.teacherId);
              const message = await auth.assignRole(row.teacherId, role, start, end);
              setBusyId(null);
              if (message) setError(message);
              else {
                setError(null);
                await load();
              }
            }}
            onResetPin={async (nextPin) => {
              const message = await auth.adminResetPin(row.teacherId, nextPin);
              if (message) setError(message);
              else setError(null);
              return message;
            }}
          />
        ))}
      </ul>
    </div>
  );
}

function DesignationField({
  teacherName,
  value,
  onChange,
}: {
  teacherName: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const { names } = useDesignations();
  const choices = designationChoices(names, [value]);
  const selected = choices.find((name) => name.toLowerCase() === value.trim().toLowerCase()) ?? "";
  return (
    <label>
      <span className="field-label">Designation</span>
      <select
        className="field"
        aria-label={`Designation for ${teacherName}`}
        value={selected}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">No designation</option>
        {choices.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

function blurOnEnter(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key === "Enter") {
    event.preventDefault();
    event.currentTarget.blur();
  }
}

function PinReset({
  teacherName,
  onReset,
}: {
  teacherName: string;
  onReset: (pin: string) => Promise<string | null>;
}) {
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  return (
    <div className="role-form">
      <label>
        <span className="field-label">New PIN</span>
        <input
          className="field"
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          aria-label={`New PIN for ${teacherName}`}
          value={pin}
          onChange={(event) => {
            setNote(null);
            setPin(event.target.value.replace(/\D/g, "").slice(0, 4));
          }}
        />
      </label>
      <Button
        tone="primary"
        disabled={busy || pin.length !== 4}
        onClick={() => {
          setBusy(true);
          void onReset(pin).then((message) => {
            setBusy(false);
            if (!message) {
              setNote("PIN reset.");
              setPin("");
            }
          });
        }}
      >
        {busy ? "Saving…" : "Reset PIN"}
      </Button>
      {note ? <span className="hint">{note}</span> : null}
    </div>
  );
}

function RoleRow({
  row,
  busy,
  onSave,
  onSaveProfile,
  onResetPin,
}: {
  row: DirectoryRow;
  busy: boolean;
  onSave: (role: Assignable, start: string | null, end: string | null) => Promise<void>;
  onSaveProfile: (teacherId: string, patch: { name?: string; designation?: string }) => Promise<string | null>;
  onResetPin: (pin: string) => Promise<string | null>;
}) {
  const initial = row.storedRole === "super_admin" ? "teacher" : row.storedRole;
  const [role, setRole] = useState<Assignable>(initial);
  const [start, setStart] = useState(row.roleStart ?? "");
  const [end, setEnd] = useState(row.roleEnd ?? "");
  const [name, setName] = useState(row.teacherName);
  const [designation, setDesignation] = useState(row.designation ?? "");
  const dated = role === "coordinator" || role === "temp_coordinator";
  const activeNote =
    row.storedRole === row.role ? roleLabel(row.role) : `${roleLabel(row.storedRole)} stored · ${roleLabel(row.role)} today`;

  useEffect(() => {
    setName(row.teacherName);
    setDesignation(row.designation ?? "");
  }, [row.teacherName, row.designation]);

  async function commitName() {
    const next = name.trim();
    if (!next || next === row.teacherName) {
      setName(row.teacherName);
      return;
    }
    const message = await onSaveProfile(row.teacherId, { name: next });
    if (message) setName(row.teacherName);
  }

  async function commitDesignation(next: string) {
    setDesignation(next);
    if (next === (row.designation ?? "")) return;
    const message = await onSaveProfile(row.teacherId, { designation: next });
    if (message) setDesignation(row.designation ?? "");
  }

  const identity = (
    <div className="role-form">
      <label>
        <span className="field-label">Name</span>
        <input
          className="field"
          aria-label={`Name for ${row.teacherName}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => void commitName()}
          onKeyDown={blurOnEnter}
        />
      </label>
      <DesignationField teacherName={row.teacherName} value={designation} onChange={(next) => void commitDesignation(next)} />
    </div>
  );

  if (row.storedRole === "super_admin") {
    return (
      <li className="account-row role-row">
        <div>
          <strong>{row.teacherName}</strong>
          <span className="hint">PIN sign-in · Super admin</span>
        </div>
        {identity}
        <PinReset teacherName={row.teacherName} onReset={onResetPin} />
      </li>
    );
  }

  return (
    <li className="account-row role-row">
      <div>
        <strong>{row.teacherName}</strong>
        <span className="hint">
          PIN sign-in · {activeNote}
        </span>
      </div>
      <div className="role-form">
        <label>
          <span className="field-label">Name</span>
          <input
            className="field"
            aria-label={`Name for ${row.teacherName}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={blurOnEnter}
          />
        </label>
        <DesignationField teacherName={row.teacherName} value={designation} onChange={(next) => void commitDesignation(next)} />
        <label>
          <span className="field-label">Role</span>
          <select
            className="field"
            aria-label={`Role for ${row.teacherName}`}
            value={role}
            onChange={(event) => setRole(event.target.value as Assignable)}
          >
            <option value="teacher">Teacher</option>
            <option value="coordinator">Coordinator</option>
            <option value="temp_coordinator">Temporary coordinator</option>
          </select>
        </label>
        {dated ? (
          <>
            <label>
              <span className="field-label">Starts</span>
              <input
                className="field"
                type="date"
                aria-label={`Start for ${row.teacherName}`}
                value={start}
                onChange={(event) => setStart(event.target.value)}
                required
              />
            </label>
            <label>
              <span className="field-label">Ends</span>
              <input
                className="field"
                type="date"
                aria-label={`End for ${row.teacherName}`}
                value={end}
                onChange={(event) => setEnd(event.target.value)}
                required
              />
            </label>
          </>
        ) : null}
        <Button
          tone="primary"
          disabled={busy || (dated && (!start || !end))}
          onClick={() => void onSave(role, dated ? start : null, dated ? end : null)}
        >
          Save role
        </Button>
      </div>
      <PinReset teacherName={row.teacherName} onReset={onResetPin} />
    </li>
  );
}
