import { useEffect, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { useAuth } from "../auth";
import { Button } from "./ui";

export function AuthScreen({ onClose }: { onClose?: () => void } = {}) {
  const auth = useAuth();
  const [teacherId, setTeacherId] = useState("");
  const [pin, setPin] = useState("");
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>([]);
  const [teachersError, setTeachersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void auth.signInTeachers().then(
      (rows) => {
        if (!mounted) return;
        setTeachers(rows);
        setTeachersError(null);
      },
      (err: unknown) => {
        if (!mounted) return;
        setTeachersError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => {
      mounted = false;
    };
  }, [auth]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const message = await auth.signIn(teacherId, pin);
    setBusy(false);
    if (message) setError(message);
    else if (onClose) onClose();
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" style={{ position: "relative" }} onSubmit={(event) => void submit(event)}>
        {onClose ? (
          <button
            type="button"
            aria-label="Close"
            className="icon-btn"
            style={{ position: "absolute", top: "0.85rem", right: "0.85rem" }}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        ) : null}
        <h1>Daily Schedule</h1>
        <p className="auth-lead">Pick your name and enter your PIN.</p>
        {auth.mock ? <p className="hint">This screen is a local preview. Sign-in stays in this browser.</p> : null}
        {auth.setupError ? <p className="auth-error">{auth.setupError}</p> : null}
        <label>
          <span className="field-label">Name</span>
          <select
            className="field"
            id="teacher-select"
            name="teacher"
            aria-label="Name"
            value={teacherId}
            onChange={(event) => setTeacherId(event.target.value)}
            required
          >
            <option value="">Pick your name</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
          </select>
          {teachersError ? <span className="auth-error">{teachersError}</span> : null}
          {!teachersError && teachers.length === 0 ? (
            <span className="hint">No teachers were returned. Run supabase/migration_add_teacher_pin.sql.</span>
          ) : (
            <span className="hint">The starting PIN for every teacher is 6832.</span>
          )}
        </label>
        <label>
          <span className="field-label">PIN</span>
          <input
            className="field"
            id="pin"
            name="pin"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{4}"
            maxLength={4}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
            required
          />
        </label>
        {error ? <p className="auth-error">{error}</p> : null}
        <Button id="sign-in-button" tone="primary" type="submit" disabled={busy || teachers.length === 0}>
          {busy ? "Please wait…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

export function ChangePinDialog({ onClose }: { onClose: () => void }) {
  const auth = useAuth();
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (newPin !== confirm) {
      setError("Those PINs don’t match.");
      return;
    }
    setBusy(true);
    const message = await auth.changePin(oldPin, newPin);
    setBusy(false);
    if (message) setError(message);
    else setDone(true);
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" style={{ position: "relative" }} onSubmit={(event) => void submit(event)}>
        <button
          type="button"
          aria-label="Close"
          className="icon-btn"
          style={{ position: "absolute", top: "0.85rem", right: "0.85rem" }}
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <h1>Change PIN</h1>
        <p className="auth-lead">
          {auth.session ? `${auth.session.teacherName}. ` : ""}
          Use 4 digits. You stay signed in on this browser.
        </p>
        {done ? (
          <>
            <p className="hint">Your PIN is updated. The next sign-in uses the new PIN.</p>
            <Button tone="primary" type="button" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <PinField label="Current PIN" value={oldPin} onChange={setOldPin} />
            <PinField label="New PIN" value={newPin} onChange={setNewPin} />
            <PinField label="Confirm new PIN" value={confirm} onChange={setConfirm} />
            {error ? <p className="auth-error">{error}</p> : null}
            <Button id="change-pin-button" tone="primary" type="submit" disabled={busy}>
              {busy ? "Please wait…" : "Change PIN"}
            </Button>
          </>
        )}
      </form>
    </div>
  );
}

function PinField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label>
      <span className="field-label">{label}</span>
      <input
        className="field"
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]{4}"
        maxLength={4}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, "").slice(0, 4))}
        required
      />
    </label>
  );
}
