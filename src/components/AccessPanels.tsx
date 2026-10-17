import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import type { DirectoryRow } from "../lib/mockAuth";
import { roleLabel, type StoredRole } from "../lib/roles";
import { supabase } from "../lib/supabase";
import { STANDARD_DESIGNATIONS } from "../lib/types";
import { useSchedule } from "../state";
import { Button } from "./ui";

type Assignable = Exclude<StoredRole, "super_admin">;

export function PeopleSection() {
  const auth = useAuth();
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

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
    <div className="access-panel" id="people-panel">
      <p className="hint">
        Assign coordinator or temporary coordinator for a date range. Outside that range the account acts as a teacher. A super admin has no dates.
      </p>
      {error ? <p className="auth-error">{error}</p> : null}
      <ul className="account-list">
        {rows.map((row) => (
          <RoleRow
            key={row.teacherId}
            row={row}
            busy={busyId === row.teacherId}
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
          />
        ))}
      </ul>
    </div>
  );
}

function RoleRow({
  row,
  busy,
  onSave,
}: {
  row: DirectoryRow;
  busy: boolean;
  onSave: (role: Assignable, start: string | null, end: string | null) => Promise<void>;
}) {
  const { state, dispatch } = useSchedule();
  const teacher = state.teachers.find((t) => t.id === row.teacherId);
  const currentDesignation = teacher?.designation ?? row.designation ?? "";

  const initial = row.storedRole === "super_admin" ? "teacher" : row.storedRole;
  const [role, setRole] = useState<Assignable>(initial);
  const [start, setStart] = useState(row.roleStart ?? "");
  const [end, setEnd] = useState(row.roleEnd ?? "");
  const dated = role === "coordinator" || role === "temp_coordinator";
  const activeNote =
    row.storedRole === row.role ? roleLabel(row.role) : `${roleLabel(row.storedRole)} stored · ${roleLabel(row.role)} today`;

  function updateDesignation(des: string) {
    dispatch({
      type: "set-teacher-designation",
      id: row.teacherId,
      designation: des,
    });
    if (supabase) {
      void supabase
        .from("teachers")
        .update({ designation: des, updated_at: new Date().toISOString() })
        .eq("id", row.teacherId);
    }
  }

  if (row.storedRole === "super_admin") {
    return (
      <li className="account-row role-row">
        <div>
          <strong>{row.teacherName}</strong>
          <span className="hint">
            {row.username ? `@${row.username}` : "No account yet"}
            {currentDesignation ? ` · ${currentDesignation}` : ""} · Super admin
          </span>
        </div>
        <div className="role-form">
          <label>
            <span className="field-label">Designation</span>
            <select
              className="field"
              aria-label={`Designation for ${row.teacherName}`}
              value={currentDesignation}
              onChange={(event) => updateDesignation(event.target.value)}
            >
              <option value="">(No Designation)</option>
              {STANDARD_DESIGNATIONS.map((des) => (
                <option key={des} value={des}>
                  {des}
                </option>
              ))}
              {currentDesignation && !STANDARD_DESIGNATIONS.includes(currentDesignation as any) && (
                <option value={currentDesignation}>{currentDesignation}</option>
              )}
            </select>
          </label>
          <div className="role-chip font-semibold">Super admin</div>
        </div>
      </li>
    );
  }

  return (
    <li className="account-row role-row">
      <div>
        <strong>{row.teacherName}</strong>
        <span className="hint">
          {row.username ? `@${row.username}` : "No account yet"}
          {currentDesignation ? ` · ${currentDesignation}` : ""} · {activeNote}
        </span>
      </div>
      <div className="role-form">
        <label>
          <span className="field-label">Designation</span>
          <select
            className="field"
            aria-label={`Designation for ${row.teacherName}`}
            value={currentDesignation}
            onChange={(event) => updateDesignation(event.target.value)}
          >
            <option value="">(No Designation)</option>
            {STANDARD_DESIGNATIONS.map((des) => (
              <option key={des} value={des}>
                {des}
              </option>
            ))}
            {currentDesignation && !STANDARD_DESIGNATIONS.includes(currentDesignation as any) && (
              <option value={currentDesignation}>{currentDesignation}</option>
            )}
          </select>
        </label>
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
    </li>
  );
}
