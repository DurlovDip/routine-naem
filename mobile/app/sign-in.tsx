import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";
import { Button, Field, Label, Select, T } from "../src/ui";

export default function SignInScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
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

  if (auth.session) return <Redirect href="/(main)/routine" />;

  const selected = teachers.find((teacher) => teacher.id === teacherId);

  async function submit() {
    setError(null);
    setBusy(true);
    const message = await auth.signIn(teacherId, pin);
    setBusy(false);
    if (message) setError(message);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.desk }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={card}>
          <T weight="bold" style={{ fontSize: 22 }}>Daily Schedule</T>
          <T style={{ color: colors.muted, marginTop: 6, marginBottom: 16, lineHeight: 20 }}>
            Pick your name and enter your PIN.
          </T>
          {auth.setupError ? <T style={errorText}>{auth.setupError}</T> : null}
          <Label>Name</Label>
          <Select
            label="Name"
            value={selected?.name ?? ""}
            options={teachers.map((teacher) => teacher.name)}
            placeholder="Pick your name"
            onChange={(name) => setTeacherId(teachers.find((teacher) => teacher.name === name)?.id ?? "")}
          />
          {teachersError ? <T style={errorText}>{teachersError}</T> : null}
          <T style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>
            {teachers.length === 0 && !teachersError
              ? "No teachers were returned. Run supabase/migration_add_teacher_pin.sql."
              : "The starting PIN for every teacher is 6832."}
          </T>
          <View style={{ marginTop: 12 }}>
            <Label>PIN</Label>
            <Field
              testID="pin"
              value={pin}
              onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 4))}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={4}
            />
          </View>
          {error ? <T style={errorText}>{error}</T> : null}
          <View style={{ height: 16 }} />
          <Button
            testID="sign-in-button"
            label={busy ? "Please wait…" : "Sign in"}
            tone="primary"
            disabled={busy || teachers.length === 0 || !teacherId}
            onPress={() => void submit()}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const card = {
  backgroundColor: colors.surface,
  borderColor: colors.line,
  borderWidth: 1,
  borderRadius: 16,
  padding: 18,
} as const;

const errorText = { color: colors.danger, marginTop: 10, fontSize: 13 } as const;
