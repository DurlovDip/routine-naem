import { useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";
import { colors, font, type FontWeight } from "./theme";

let fontsReady = false;

export function markFontsReady() {
  fontsReady = true;
}

export function T({
  weight = "regular",
  style,
  ...props
}: TextProps & { weight?: FontWeight }) {
  const family = fontsReady ? font[weight] : undefined;
  return <Text {...props} style={[styles.text, family ? { fontFamily: family } : null, style]} />;
}

export function Field({ style, ...props }: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.muted}
      autoCapitalize="none"
      {...props}
      style={[styles.field, fontsReady ? { fontFamily: font.regular } : null, style]}
    />
  );
}

export function Button({
  label,
  icon,
  onPress,
  tone = "ghost",
  disabled,
  small,
  testID,
  accessibilityLabel,
}: {
  label?: string;
  icon?: ReactNode;
  onPress: () => void;
  tone?: "primary" | "ghost" | "danger" | "quiet";
  disabled?: boolean;
  small?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        small && styles.buttonSmall,
        tone === "primary" && styles.primary,
        tone === "ghost" && styles.ghost,
        tone === "danger" && styles.danger,
        tone === "quiet" && styles.quiet,
        disabled && styles.disabled,
      ]}
    >
      {icon}
      {label ? (
        <T
          weight="semibold"
          numberOfLines={1}
          style={[
            styles.buttonText,
            small && { fontSize: 12 },
            tone === "primary" && { color: "#fff" },
            tone === "quiet" && { color: colors.accent },
            tone === "danger" && { color: colors.danger },
          ]}
        >
          {label}
        </T>
      ) : null}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={styles.segment}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(option.value)}
            style={[styles.segmentBtn, on && styles.segmentOn]}
          >
            <T weight={on ? "semibold" : "medium"} style={{ color: on ? colors.accent : colors.muted, fontSize: 13 }}>
              {option.label}
            </T>
          </Pressable>
        );
      })}
    </View>
  );
}

export function CheckRow({
  label,
  value,
  onChange,
  testID,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  testID?: string;
}) {
  return (
    <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked: value }} onPress={() => onChange(!value)} style={styles.check}>
      <View style={[styles.checkBox, value && styles.checkOn]}>{value ? <T style={styles.checkMark}>✓</T> : null}</View>
      <T style={{ flex: 1 }}>{label}</T>
    </Pressable>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
  placeholder = "—",
  allowEmpty = true,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const unique = options.filter((option, index) => options.indexOf(option) === index);
  const rows = allowEmpty ? ["", ...unique] : unique;
  return (
    <>
      <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={() => setOpen(true)} style={styles.select}>
        <T numberOfLines={1} weight={value ? "medium" : "regular"} style={[styles.selectText, !value && { color: colors.muted }]}>
          {value || placeholder}
        </T>
        <T style={styles.chevron}>▾</T>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <T weight="semibold" style={styles.sheetTitle}>
              {label}
            </T>
            <FlatList
              data={rows}
              keyExtractor={(item, index) => `${item}-${index}`}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => {
                const selected = item === value;
                return (
                  <Pressable
                    onPress={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                    style={[styles.option, selected && styles.optionOn]}
                  >
                    <T weight={selected ? "semibold" : "regular"} style={{ color: selected ? colors.accent : colors.ink }}>
                      {item || "Clear"}
                    </T>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <T weight="semibold" style={styles.label}>{children}</T>;
}

export function hintStyle(): TextStyle {
  return { color: colors.muted, fontSize: 12, marginTop: 4 };
}

const styles = StyleSheet.create({
  text: { color: colors.ink, fontSize: 14 },
  field: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    color: colors.ink,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    minHeight: 40,
  },
  button: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  buttonSmall: { paddingHorizontal: 8, paddingVertical: 6 },
  buttonText: { fontSize: 13 },
  primary: { backgroundColor: colors.accent },
  ghost: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  danger: { backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: "#e4c8c6" },
  quiet: { backgroundColor: "transparent", paddingHorizontal: 4 },
  disabled: { opacity: 0.45 },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.paper,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 2,
  },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 7 },
  segmentOn: { backgroundColor: colors.surface },
  check: { flexDirection: "row", alignItems: "center", gap: 8 },
  checkBox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  checkMark: { color: "#fff", fontSize: 11, lineHeight: 14 },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
    borderRadius: 8,
    paddingHorizontal: 8,
    minHeight: 34,
    flexGrow: 1,
    flexShrink: 1,
  },
  selectText: { flex: 1, fontSize: 13 },
  chevron: { color: colors.muted, fontSize: 11 },
  backdrop: { flex: 1, backgroundColor: "rgba(26,26,24,0.35)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "70%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 24,
  },
  sheetTitle: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8, fontSize: 15 },
  option: { paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  optionOn: { backgroundColor: colors.accentSoft },
  label: { fontSize: 12, color: colors.muted, marginBottom: 4 },
});
