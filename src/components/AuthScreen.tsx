import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { Button } from "./ui";

type Tab = "signin" | "signup";

export function AuthScreen() {
  const auth = useAuth();
  const [tab, setTab] = useState<Tab>("signup");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>([]);
  const [teachersError, setTeachersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    void auth.unclaimedTeachers().then(
      (rows) => {
        if (!mounted) return;
        setTeachers(rows);
        setTeacherId((current) => current || rows[0]?.id || "");
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
    if (tab === "signup" && password !== confirm) {
      setError("Those passwords don’t match.");
      return;
    }
    setBusy(true);
    const message =
      tab === "signup"
        ? await auth.signUp({ username, teacherId, password })
        : await auth.signIn(username, password);
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={(event) => void submit(event)}>
        <h1>Daily Schedule</h1>
        <p className="auth-lead">Sign in with the username you chose. There is no separate email.</p>
        {auth.mock ? <p className="hint">This screen is a local preview. Accounts stay in this browser.</p> : null}
        {auth.setupError ? <p className="auth-error">{auth.setupError}</p> : null}
        <div className="segmented" role="group" aria-label="Account">
          <button type="button" aria-pressed={tab === "signin"} onClick={() => setTab("signin")}>
            Sign in
          </button>
          <button type="button" aria-pressed={tab === "signup"} onClick={() => setTab("signup")}>
            Create account
          </button>
        </div>
        <label>
          <span className="field-label">Username</span>
          <input
            className="field"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>
        {tab === "signup" ? (
          <label>
            <span className="field-label">Name</span>
            <select
              className="field"
              name="teacher"
              aria-label="Name"
              value={teacherId}
              onChange={(event) => setTeacherId(event.target.value)}
              required
            >
              {teachers.length === 0 ? <option value="">No teachers available</option> : null}
              {teachers.map((teacher) => (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.name}
                </option>
              ))}
            </select>
            {teachersError ? <span className="auth-error">{teachersError}</span> : null}
            {!teachersError && teachers.length === 0 ? (
              <span className="hint">Add teachers in Supabase before the first account, or run the seed script.</span>
            ) : (
              <span className="hint">Each teacher can claim only one account.</span>
            )}
          </label>
        ) : null}
        <label>
          <span className="field-label">Password</span>
          <input
            className="field"
            name="password"
            type="password"
            autoComplete={tab === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={8}
            required
          />
        </label>
        {tab === "signup" ? (
          <label>
            <span className="field-label">Confirm password</span>
            <input
              className="field"
              name="confirm"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              minLength={8}
              required
            />
          </label>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}
        <Button tone="primary" type="submit" disabled={busy || (tab === "signup" && teachers.length === 0)}>
          {busy ? "Please wait…" : tab === "signup" ? "Create account" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
