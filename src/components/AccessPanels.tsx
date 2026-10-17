import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import type { DelegationRow, DirectoryRow } from "../lib/mockAuth";
import { roleLabel } from "../lib/roles";
import { Button } from "./ui";

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

  async function run(teacherId: string, action: "assign" | "revoke") {
    setBusyId(teacherId);
    const message =
      action === "assign" ? await auth.assignCoordinator(teacherId) : await auth.revokeCoordinator(teacherId);
    setBusyId(null);
    if (message) setError(message);
    else await load();
  }

  return (
    <div className="access-panel" id="people-panel">
      <p className="hint">
        Assign coordinators by teacher. A teacher without an account can still be assigned; the role applies when they sign up.
      </p>
      {error ? <p className="auth-error">{error}</p> : null}
      <ul className="account-list">
        {rows.map((row) => {
          const label =
            row.baseRole === "super_admin"
              ? "Super admin"
              : row.role
                ? roleLabel(row.role)
                : row.hasPermanent || row.temporaryUntil
                  ? "Coordinator when they sign in"
                  : "No account";
          return (
            <li key={row.teacherId} className="account-row">
              <div>
                <strong>{row.teacherName}</strong>
                <span className="hint">
                  {row.username ? `@${row.username}` : "No account yet"} · {label}
                  {row.temporaryUntil ? ` · delegated through ${row.temporaryUntil}` : ""}
                </span>
              </div>
              {row.baseRole === "super_admin" ? null : row.hasPermanent || row.role === "coordinator" ? (
                <Button tone="danger" disabled={busyId === row.teacherId} onClick={() => void run(row.teacherId, "revoke")}>
                  End coordination
                </Button>
              ) : (
                <Button tone="primary" disabled={busyId === row.teacherId} onClick={() => void run(row.teacherId, "assign")}>
                  Make coordinator
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DelegationSection() {
  const auth = useAuth();
  const [rows, setRows] = useState<DirectoryRow[]>([]);
  const [delegations, setDelegations] = useState<DelegationRow[]>([]);
  const [teacherId, setTeacherId] = useState("");
  const [kind, setKind] = useState<"permanent" | "temporary">("temporary");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const [directory, openRows] = await Promise.all([auth.directory(), auth.delegations()]);
      setRows(directory.filter((row) => row.teacherId !== auth.session?.teacherId));
      setDelegations(openRows);
      setTeacherId((current) => current || directory.find((row) => row.teacherId !== auth.session?.teacherId)?.teacherId || "");
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes("Teachers")) setError(message);
    }
  }

  useEffect(() => {
    void load();
  }, [auth.session?.userId, auth.session?.role]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const message =
      kind === "permanent"
        ? await auth.transferCoordination(teacherId)
        : await auth.delegateCoordination(teacherId, startsOn, endsOn);
    setBusy(false);
    if (message) setError(message);
    else {
      setError(null);
      await load();
    }
  }

  async function cancel(id: string) {
    const message = await auth.cancelDelegation(id);
    if (message) setError(message);
    else await load();
  }

  return (
    <div className="access-panel" id="delegation-panel">
      <p className="hint">
        Hand coordination to another teacher for good, or for a vacation or emergency. A temporary delegation ends on its own after the end date.
      </p>
      <form className="delegation-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span className="field-label">Teacher</span>
          <select className="field" aria-label="Teacher to coordinate" value={teacherId} onChange={(event) => setTeacherId(event.target.value)}>
            {rows.map((row) => (
              <option key={row.teacherId} value={row.teacherId}>
                {row.teacherName}
              </option>
            ))}
          </select>
        </label>
        <div className="segmented" role="group" aria-label="How to hand off">
          <button type="button" aria-pressed={kind === "temporary"} onClick={() => setKind("temporary")}>
            Temporary
          </button>
          <button type="button" aria-pressed={kind === "permanent"} onClick={() => setKind("permanent")}>
            Permanent transfer
          </button>
        </div>
        {kind === "temporary" ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <label>
              <span className="field-label">Starts</span>
              <input className="field" type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} required />
            </label>
            <label>
              <span className="field-label">Ends</span>
              <input className="field" type="date" value={endsOn} onChange={(event) => setEndsOn(event.target.value)} required />
            </label>
          </div>
        ) : (
          <p className="hint">A permanent transfer gives them coordination and ends yours.</p>
        )}
        {error ? <p className="auth-error">{error}</p> : null}
        <Button tone="primary" type="submit" disabled={busy || !teacherId}>
          {kind === "permanent" ? "Transfer coordination" : "Delegate"}
        </Button>
      </form>
      <ul className="account-list">
        {delegations.map((row) => (
          <li key={row.id} className="account-row">
            <div>
              <strong>{row.teacherName}</strong>
              <span className="hint">
                {row.kind === "permanent"
                  ? "Permanent"
                  : `${row.startsOn} – ${row.endsOn}${row.active ? "" : " · not active today"}`}
              </span>
            </div>
            {row.kind === "temporary" ? (
              <Button tone="ghost" onClick={() => void cancel(row.id)}>
                Cancel
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
