import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "../src/auth";
import { colors } from "../src/theme";

export default function Index() {
  const auth = useAuth();
  if (!auth.ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.desk, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (!auth.session) return <Redirect href="/sign-in" />;
  return <Redirect href="/(main)/routine" />;
}
