import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useAuth } from "./auth";
import { colors } from "./theme";
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

  async function submit() {
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
    <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: "rgba(28, 24, 20, 0.45)", justifyContent: "center", padding: 20 }}>
        <View style={card}>
          <T weight="bold" style={{ fontSize: 20 }}>Change PIN</T>
          <T style={{ color: colors.muted, marginTop: 6, marginBottom: 14, lineHeight: 20 }}>
            {auth.session ? `${auth.session.teacherName}. ` : ""}
            Use 4 digits. You stay signed in on this phone.
          </T>
          {done ? (
            <>
              <T style={{ color: colors.muted, marginBottom: 14 }}>Your PIN is updated. The next sign-in uses the new PIN.</T>
              <Button label="Done" tone="primary" onPress={close} />
            </>
          ) : (
            <>
              <Label>Current PIN</Label>
              <Field testID="current-pin" value={oldPin} onChangeText={(value) => setOldPin(digits(value))} secureTextEntry keyboardType="number-pad" maxLength={4} />
              <View style={{ height: 10 }} />
              <Label>New PIN</Label>
              <Field testID="new-pin" value={newPin} onChangeText={(value) => setNewPin(digits(value))} secureTextEntry keyboardType="number-pad" maxLength={4} />
              <View style={{ height: 10 }} />
              <Label>Confirm new PIN</Label>
              <Field testID="confirm-pin" value={confirm} onChangeText={(value) => setConfirm(digits(value))} secureTextEntry keyboardType="number-pad" maxLength={4} />
              {error ? <T style={{ color: colors.danger, marginTop: 10 }}>{error}</T> : null}
              <View style={{ height: 14 }} />
              <Button testID="change-pin-button" label={busy ? "Please wait…" : "Change PIN"} tone="primary" disabled={busy} onPress={() => void submit()} />
              <View style={{ height: 8 }} />
              <Pressable onPress={close} hitSlop={8}>
                <T weight="semibold" style={{ color: colors.accent, textAlign: "center" }}>Cancel</T>
              </Pressable>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function digits(value: string): string {
  return value.replace(/\D/g, "").slice(0, 4);
}

const card = {
  backgroundColor: colors.surface,
  borderRadius: 16,
  padding: 18,
} as const;
