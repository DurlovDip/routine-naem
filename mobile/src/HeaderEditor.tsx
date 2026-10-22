import Ionicons from "@expo/vector-icons/Ionicons";
import { View } from "react-native";
import { HEADER_STYLES, headerStyleFromLabel, headerStyleLabel } from "./lib/header";
import { useSchedule } from "./store";
import { colors } from "./theme";
import { Button, Field, Label, Select, T } from "./ui";

export function HeaderEditor() {
  const { state, dispatch } = useSchedule();
  return (
    <View testID="routine-header-editor" style={card}>
      <View>
        <T weight="bold" style={{ color: colors.accent, fontSize: 15 }}>Routine header & title</T>
        <T style={{ color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
          Scheme, course, and duration. The course title is the bold heading on the routine and the PDF.
        </T>
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

const card = {
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.line,
  borderRadius: 12,
  borderLeftWidth: 3,
  borderLeftColor: colors.accent,
  padding: 12,
  gap: 10,
} as const;
