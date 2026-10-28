import { useState } from "react";
import { useAuth } from "../auth";
import { colors, radius, space, type } from "../theme";
import { Button, Field, Label, T } from "./ui";

export function ChangePinModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const auth = useAuth();
  const [oldPin, setOldPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  function close() {
    setOldPin("");
    setNewPin("");
    setConfirm("");
    setError(null);
    setDone(false);
    onClose();
  }

  async function submit(e?: React.FormEvent) {
    if (e) e.preventDefault();
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(28, 24, 20, 0.45)" }}
      onClick={close}
    >
      <div
        className="w-full max-w-sm p-6"
        style={{
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          boxShadow: "0 12px 32px rgba(28, 28, 26, 0.15)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
          <T weight="semibold" style={{ fontSize: type.headline }}>
            Change PIN
          </T>
          <T style={{ color: colors.muted, marginTop: 4, marginBottom: 12, lineHeight: "20px" }}>
            {auth.session ? `${auth.session.teacherName}. ` : ""}
            Use 4 digits. You stay signed in on this computer.
          </T>

          {done ? (
            <>
              <T style={{ color: colors.muted, marginBottom: 14 }}>
                Your PIN is updated. The next sign-in uses the new PIN.
              </T>
              <Button label="Done" tone="primary" onClick={close} />
            </>
          ) : (
            <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: space.sm }}>
              <div>
                <Label>Current PIN</Label>
                <Field
                  data-testid="current-pin"
                  type="password"
                  value={oldPin}
                  onChange={(e) => setOldPin(digits(e.target.value))}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                  autoFocus
                />
              </div>

              <div>
                <Label>New PIN</Label>
                <Field
                  data-testid="new-pin"
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(digits(e.target.value))}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="••••"
                />
              </div>

              <div>
                <Label>Confirm new PIN</Label>
                <Field
                  data-testid="confirm-pin"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(digits(e.target.value))}
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
                    padding: "6px 10px",
                    borderRadius: radius.sm,
                    marginTop: 6,
                  }}
                >
                  {error}
                </div>
              ) : null}

              <div style={{ height: 10 }} />

              <Button
                testID="change-pin-button"
                label={busy ? "Please wait…" : "Change PIN"}
                tone="primary"
                type="submit"
                disabled={busy}
              />

              <button
                type="button"
                onClick={close}
                className="mt-2 py-1 text-sm font-semibold cursor-pointer hover:underline"
                style={{ color: colors.accent, textAlign: "center", background: "none", border: "none" }}
              >
                Cancel
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function digits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

export const ChangePinDialog = ChangePinModal;
