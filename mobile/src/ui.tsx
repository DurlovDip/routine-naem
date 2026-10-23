import { useState, type ReactNode } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from "react-native";
import type { DayWhen } from "./lib/time";
import { colors, font, radius, shadow, space, type as typeScale, type FontWeight } from "./theme";

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
  square,
  testID,
  accessibilityLabel,
}: {
  label?: string;
  icon?: ReactNode;
  onPress: () => void;
  tone?: "primary" | "ghost" | "danger" | "quiet";
  disabled?: boolean;
  small?: boolean;
  /** Icon-only control with a 44px touch target. */
  square?: boolean;
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
        square && styles.buttonSquare,
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

export function DayChip({
  label,
  selected,
  when,
  onPress,
}: {
  label: string;
  selected: boolean;
  when: DayWhen;
  onPress: () => void;
}) {
  const palette = selected
    ? { backgroundColor: colors.accent, color: "#fff", borderColor: colors.accent }
    : when === "past"
      ? { backgroundColor: colors.chipPast, color: colors.chipPastText, borderColor: colors.chipPast }
      : { backgroundColor: colors.surface, color: colors.ink, borderColor: colors.chipOpenBorder };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.button, styles.buttonSmall, { backgroundColor: palette.backgroundColor, borderWidth: 1, borderColor: palette.borderColor }]}
    >
      <T weight="semibold" numberOfLines={1} style={{ fontSize: 12, color: palette.color }}>
        {label}
      </T>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  scrollable = false,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
  scrollable?: boolean;
}) {
  const buttons = options.map((option) => {
    const on = option.value === value;
    return (
      <Pressable
        key={option.value}
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => onChange(option.value)}
        style={[scrollable ? styles.segmentBtnScroll : styles.segmentBtn, on && styles.segmentOn]}
      >
        <T numberOfLines={1} weight={on ? "semibold" : "medium"} style={{ color: on ? colors.accent : colors.muted, fontSize: 13 }}>
          {option.label}
        </T>
      </Pressable>
    );
  });
  return (
    <View accessibilityRole="tablist" accessibilityLabel={label} style={[styles.segment, scrollable && styles.segmentScrollable]}>
      {scrollable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.segmentScroller}
          contentContainerStyle={styles.segmentScroll}
        >
          {buttons}
        </ScrollView>
      ) : (
        buttons
      )}
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
  text: { color: colors.ink, fontSize: typeScale.body },
  field: {
    backgroundColor: colors.paper,
    color: colors.ink,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: typeScale.body,
    minHeight: 48,
  },
  button: {
    borderRadius: radius.md,
    paddingHorizontal: space.lg,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: space.sm,
    minHeight: 48,
  },
  buttonSmall: { paddingHorizontal: space.md, paddingVertical: space.sm, minHeight: 36 },
  buttonSquare: { width: 44, height: 44, minHeight: 44, paddingHorizontal: 0, paddingVertical: 0 },
  buttonText: { fontSize: typeScale.label },
  primary: { backgroundColor: colors.accent },
  ghost: { backgroundColor: colors.paper },
  danger: { backgroundColor: colors.dangerBg },
  quiet: { backgroundColor: "transparent", paddingHorizontal: space.xs, minHeight: 36 },
  disabled: { opacity: 0.45 },
  segment: {
    flexDirection: "row",
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    padding: 3,
  },
  segmentScrollable: { flexDirection: "column", width: "100%", overflow: "hidden" },
  segmentScroller: { width: "100%" },
  segmentScroll: { flexDirection: "row", alignItems: "center" },
  segmentBtn: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.sm },
  segmentBtnScroll: {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
  },
  segmentOn: { backgroundColor: colors.surface, ...shadow },
  check: { flexDirection: "row", alignItems: "center", gap: space.sm },
  checkBox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    backgroundColor: colors.paper,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: { backgroundColor: colors.accent },
  checkMark: { color: "#fff", fontSize: 12, lineHeight: 14 },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    backgroundColor: colors.paper,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    minHeight: 48,
    flexGrow: 1,
    flexShrink: 1,
  },
  selectText: { flex: 1, fontSize: typeScale.body },
  chevron: { color: colors.muted, fontSize: 12 },
  backdrop: { flex: 1, backgroundColor: "rgba(28,28,26,0.28)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "70%",
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingBottom: space.xl,
  },
  sheetTitle: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm, fontSize: typeScale.title },
  option: { paddingHorizontal: space.lg, paddingVertical: 14 },
  optionOn: { backgroundColor: colors.accentSoft },
  label: { fontSize: typeScale.caption, color: colors.muted, marginBottom: space.xs, letterSpacing: 0.2 },
});
