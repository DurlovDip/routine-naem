import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "../src/auth";
import { ScheduleProvider } from "../src/store";
import { colors } from "../src/theme";
import { markFontsReady } from "../src/ui";

export default function RootLayout() {
  const [loaded, error] = useFonts({
    ...Ionicons.font,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  if (!loaded && !error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.desk, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (loaded) markFontsReady();

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ScheduleProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.desk } }} />
        </ScheduleProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
