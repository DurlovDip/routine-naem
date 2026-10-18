import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";
import { Button, Field, Label, Segmented, Select, T } from "../src/ui";

type Tab = "signin" | "signup";

export default function SignInScreen() {
  const auth = useAuth();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [teachers, setTeachers] = useState<Array<{ id: string; name: string }>>([]);
  const [teachersError, setTeachersError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tab !== "signup") return;
    let mounted = true;
    void auth.unclaimedTeachers().then(
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
  }, [auth, tab]);

  if (auth.session) return <Redirect href="/(main)/routine" />;

  async function submit() {
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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.desk }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 20, paddingTop: insets.top + 28, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled">
        <View style={card}>
          <T weight="bold" style={{ fontSize: 22 }}>Daily Schedule</T>
          <T style={{ color: colors.muted, marginTop: 6, marginBottom: 16, lineHeight: 20 }}>
            Sign in with the username you chose. There is no separate email.
          </T>
          {auth.setupError ? <T style={errorText}>{auth.setupError}</T> : null}
          <Segmented
            label="Account"
            value={tab}
            onChange={setTab}
            options={[
              { value: "signin", label: "Sign in" },
              { value: "signup", label: "Create account" },
            ]}
          />
          <View style={{ height: 14 }} />
          <Label>Username</Label>
          <Field
            testID="username"
            value={username}
            onChangeText={setUsername}
            autoComplete="username"
            placeholder="username"
          />
          {tab === "signup" ? (
            <View style={{ marginTop: 12 }}>
              <Label>Name</Label>
              <Select
                label="Name"
                value={teachers.find((teacher) => teacher.id === teacherId)?.name ?? ""}
                options={teachers.map((teacher) => teacher.name)}
                placeholder="Choose a teacher"
                onChange={(name) => setTeacherId(teachers.find((teacher) => teacher.name === name)?.id ?? "")}
              />
              {teachersError ? <T style={errorText}>{teachersError}</T> : null}
              {!teachersError && teachers.length === 0 ? (
                <T style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>No unclaimed teachers yet.</T>
              ) : (
                <T style={{ color: colors.muted, fontSize: 12, marginTop: 6 }}>Each teacher can claim only one account.</T>
              )}
            </View>
          ) : null}
          <View style={{ marginTop: 12 }}>
            <Label>Password</Label>
            <Field testID="password" value={password} onChangeText={setPassword} secureTextEntry autoComplete={tab === "signup" ? "new-password" : "current-password"} />
          </View>
          {tab === "signup" ? (
            <View style={{ marginTop: 12 }}>
              <Label>Confirm password</Label>
              <Field value={confirm} onChangeText={setConfirm} secureTextEntry />
            </View>
          ) : null}
          {error ? <T style={errorText}>{error}</T> : null}
          <View style={{ height: 16 }} />
          <Button
            testID="sign-in-button"
            label={busy ? "Please wait…" : tab === "signup" ? "Create account" : "Sign in"}
            tone="primary"
            disabled={busy || (tab === "signup" && teachers.length === 0)}
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
