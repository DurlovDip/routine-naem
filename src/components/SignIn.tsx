import { useEffect, useState } from "react";
import { useAuth } from "../auth";
import { colors, radius, space, type } from "../theme";
import { Button, Field, Label, Select, T } from "./ui";

export function SignIn() {
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
        setTeacherId((current) => current || rows[0]?.id || "");
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

  const selected = teachers.find((teacher) => teacher.id === teacherId);

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setError(null);
    setBusy(true);
    const message = await auth.signIn(teacherId, pin);
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 sm:p-6"
      style={{ backgroundColor: colors.desk }}
    >
      <div
        className="w-full max-w-md p-6 sm:p-8"
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          boxShadow: "0 8px 18px rgba(28, 28, 26, 0.06)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              backgroundColor: colors.accentSoft,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <T weight="bold" style={{ color: colors.accent, fontSize: type.title }}>
              DS
            </T>
          </div>

          <div>
            <T
              as="h1"
              weight="bold"
              style={{
                fontSize: type.display,
                letterSpacing: "-0.4px",
                lineHeight: 1.15,
                margin: 0,
              }}
            >
              Daily Schedule
            </T>
            <T style={{ color: colors.muted, lineHeight: "22px", marginTop: 4, display: "block" }}>
              Pick your name and enter your PIN.
            </T>
          </div>

          {auth.setupError ? (
            <div
              style={{
                color: colors.danger,
                fontSize: type.label,
                backgroundColor: colors.dangerBg,
                padding: "8px 12px",
                borderRadius: radius.sm,
              }}
            >
              {auth.setupError}
            </div>
          ) : null}

          <div>
            <Label>Name</Label>
            <Select
              label="Name"
              value={selected?.name ?? ""}
              options={teachers.map((teacher) => teacher.name)}
              placeholder="Pick your name"
              onChange={(name) =>
                setTeacherId(teachers.find((teacher) => teacher.name === name)?.id ?? "")
              }
            />
            {teachersError ? (
              <div style={{ color: colors.danger, fontSize: type.label, marginTop: 4 }}>
                {teachersError}
              </div>
            ) : null}
            <div style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
              {teachers.length === 0 && !teachersError
                ? "No teachers were returned. Run supabase/migration_add_teacher_pin.sql."
                : "The starting PIN for every teacher is 6832."}
            </div>
          </div>

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: space.md }}>
            <div>
              <Label>PIN</Label>
              <Field
                data-testid="pin"
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                inputMode="numeric"
                maxLength={4}
                placeholder="••••"
              />
            </div>

            {error ? (
              <div
                style={{
                  color: colors.danger,
                  fontSize: type.label,
                  backgroundColor: colors.dangerBg,
                  padding: "8px 12px",
                  borderRadius: radius.sm,
                }}
              >
                {error}
              </div>
            ) : null}

            <div style={{ height: 8 }} />

            <Button
              testID="sign-in-button"
              label={busy ? "Please wait…" : "Sign in"}
              tone="primary"
              type="submit"
              disabled={busy || teachers.length === 0 || !teacherId}
            />
          </form>
        </div>
      </div>
    </div>
  );
}

export default SignIn;
