import Ionicons from "@expo/vector-icons/Ionicons";
import { View } from "react-native";
import { HEADER_STYLES, headerStyleFromLabel, headerStyleLabel } from "./lib/header";
import { useSchedule } from "./store";
import { card, colors, radius, space, type } from "./theme";
import { Button, Field, Label, Select, T } from "./ui";

export function HeaderEditor() {
  const { state, dispatch } = useSchedule();
  return (
    <View testID="routine-header-editor" style={headerCard}>
      <View>
        <T weight="semibold" style={{ fontSize: type.title }}>Routine header & title</T>
        <T style={{ color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
          Scheme, course, and duration. The course title is the bold heading on the routine and the PDF.
        </T>
      </View>

      <View testID="routine-header-preview" style={previewCard}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <T weight="bold" style={{ fontSize: 11, color: colors.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>
            Routine Header Preview
          </T>
          <View style={liveBadge}>
            <T weight="bold" style={{ fontSize: 10, color: "#065f46" }}>
              PRINTS AS
            </T>
          </View>
        </View>

        <View style={previewInner}>
          {state.header.map((line, idx) => {
            const isTitle = line.style === "title";
            const isSubtitle = line.style === "subtitle";
            return (
              <T
                key={line.id || idx}
                weight={isTitle || isSubtitle ? "bold" : "regular"}
                style={[
                  previewLine,
                  isTitle && previewTitle,
                  isSubtitle && previewSubtitle,
                  !line.text.trim() && { color: colors.muted, fontStyle: "italic" },
                ]}
              >
                {line.text.trim() || `(Header line ${idx + 1} is empty)`}
              </T>
            );
          })}
        </View>
      </View>

      {state.header.map((line, index) => (
        <View key={line.id} style={{ gap: 6 }}>
          <Label>{`Header line ${index + 1}`}</Label>
          <Field
            testID={`header-line-${index + 1}`}
            accessibilityLabel={`Header line ${index + 1}`}
            value={line.text}
            autoCapitalize="sentences"
            placeholder="Header text"
            onChangeText={(text) => dispatch({ type: "set-header-line", id: line.id, patch: { text } })}
          />
          <Select
            allowEmpty={false}
            label={`Style for header line ${index + 1}`}
            value={headerStyleLabel(line.style)}
            options={HEADER_STYLES.map((item) => item.label)}
            placeholder="Style"
            onChange={(label) => {
              const style = headerStyleFromLabel(label);
              if (!style) return;
              dispatch({ type: "set-header-line", id: line.id, patch: { style } });
            }}
          />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            <Button
              small
              label="Up"
              disabled={index === 0}
              accessibilityLabel="Move line up"
              onPress={() => dispatch({ type: "move-header-line", id: line.id, dir: -1 })}
            />
            <Button
              small
              label="Down"
              disabled={index === state.header.length - 1}
              accessibilityLabel="Move line down"
              onPress={() => dispatch({ type: "move-header-line", id: line.id, dir: 1 })}
            />
            <Button
              small
              tone="danger"
              label="Remove"
              disabled={state.header.length <= 1}
              accessibilityLabel="Remove line"
              onPress={() => dispatch({ type: "remove-header-line", id: line.id })}
            />
          </View>
        </View>
      ))}
      <Button
        testID="add-header-line"
        label="Add line"
        icon={<Ionicons name="add" size={16} color={colors.ink} />}
        onPress={() => dispatch({ type: "add-header-line" })}
      />
    </View>
  );
}

const headerCard = { ...card, gap: 10 } as const;

const previewCard = {
  backgroundColor: "#fcfbf9",
  borderRadius: radius.md,
  borderWidth: 1,
  borderColor: "#e5ded4",
  padding: space.md,
};

const liveBadge = {
  backgroundColor: "#d1fae5",
  paddingHorizontal: 7,
  paddingVertical: 2,
  borderRadius: 4,
};

const previewInner = {
  backgroundColor: "#ffffff",
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: "#ebe6de",
  paddingVertical: 14,
  paddingHorizontal: space.md,
  alignItems: "center" as const,
  gap: 3,
};

const previewLine = {
  textAlign: "center" as const,
  color: colors.ink,
  fontSize: 12.5,
  lineHeight: 18,
};

const previewTitle = {
  fontSize: 15.5,
  lineHeight: 21,
  color: colors.ink,
  marginTop: 2,
  marginBottom: 1,
};

const previewSubtitle = {
  fontSize: 13.5,
  lineHeight: 19,
  color: colors.ink,
  marginTop: 1,
  marginBottom: 1,
};
