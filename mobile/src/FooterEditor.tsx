import DateTimePicker from "@react-native-community/datetimepicker";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { createElement, useRef, useState } from "react";
import { Alert, Image, Platform, Pressable, View } from "react-native";
import { readSignatureFile, readSignatureUri } from "./lib/signature";
import { formatSignatureDate, toIsoDate } from "./lib/time";
import { STANDARD_DESIGNATIONS } from "./lib/types";
import { useSchedule } from "./store";
import { card, colors, radius, space } from "./theme";
import { Button, CheckRow, Field, Label, Select, T } from "./ui";

export function FooterEditor() {
  const { state, dispatch } = useSchedule();
  const footer = state.footer;
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDate, setShowDate] = useState(false);

  const designation = footer.designation ?? "Assistant Director";
  const isCourseCoordinator = footer.isCourseCoordinator ?? true;
  const courseName = footer.courseName ?? (footer.lines[1] ?? "");
  const designationOptions = STANDARD_DESIGNATIONS.includes(designation as (typeof STANDARD_DESIGNATIONS)[number])
    ? [...STANDARD_DESIGNATIONS]
    : [...STANDARD_DESIGNATIONS, designation];

  const resolvedDesignationLine = designation.trim()
    ? isCourseCoordinator
      ? `${designation.trim()} & Course Coordinator`
      : designation.trim()
    : isCourseCoordinator
      ? "Course Coordinator"
      : "";

  async function store(signature: string) {
    dispatch({ type: "set-footer", patch: { signature } });
  }

  async function fromFile(file: Blob | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      await store(await readSignatureFile(file));
    } catch {
      Alert.alert("Could not read that image", "Choose a PNG or JPEG signature.");
    } finally {
      setBusy(false);
    }
  }

  async function fromUri(uri: string, size?: { width?: number; height?: number }) {
    setBusy(true);
    try {
      await store(await readSignatureUri(uri, size));
    } catch {
      Alert.alert("Could not read that image", "Choose a PNG or JPEG signature.");
    } finally {
      setBusy(false);
    }
  }

  async function pickLibrary() {
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      legacy: true,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset) return;
    await fromUri(asset.uri, { width: asset.width, height: asset.height });
  }

  async function pickFiles() {
    const picked = await DocumentPicker.getDocumentAsync({
      type: "image/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset) return;
    if (asset.file) {
      await fromFile(asset.file);
      return;
    }
    await fromUri(asset.uri);
  }

  function upload() {
    if (Platform.OS === "web") {
      fileRef.current?.click();
      return;
    }
    Alert.alert("Upload signature", "Choose a photo from the gallery or a file.", [
      { text: "Photo library", onPress: () => void pickLibrary() },
      { text: "Files", onPress: () => void pickFiles() },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function setSignatureDate(value: string) {
    dispatch({ type: "set-footer", patch: { signatureDate: formatSignatureDate(value) } });
  }

  return (
    <View testID="signature-footer-editor" style={footerCard}>
      <View>
        <T weight="bold" style={{ color: colors.accent, fontSize: 15 }}>Signature & footer</T>
        <T style={{ color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
          Printed at the bottom right of the routine and the PDF. Same fields as the website.
        </T>
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
        <View testID="signature-preview" style={preview}>
          {footer.signature ? (
            <Image
              source={{ uri: footer.signature }}
              accessibilityIgnoresInvertColors
              style={{ width: "100%", height: 64 }}
              resizeMode="contain"
            />
          ) : (
            <T style={{ color: "#a8a29e", fontSize: 12 }}>No signature</T>
          )}
        </View>
        <View style={{ gap: 8, alignItems: "flex-start" }}>
          <Button
            testID="upload-signature"
            label={busy ? "Reading…" : "Upload signature"}
            disabled={busy}
            onPress={upload}
          />
          {footer.signature ? (
            <Button
              testID="remove-signature"
              tone="quiet"
              label="Remove"
              onPress={() => dispatch({ type: "set-footer", patch: { signature: null } })}
            />
          ) : null}
        </View>
      </View>

      {Platform.OS === "web"
        ? createElement("input", {
            ref: fileRef,
            type: "file",
            accept: "image/*",
            "data-testid": "signature-file",
            "aria-label": "Upload signature",
            style: fileInput,
            onChange: (event: Event) => {
              const input = event.target as HTMLInputElement;
              const file = input.files?.[0];
              input.value = "";
              void fromFile(file);
            },
          })
        : null}

      <View>
        <Label>Signature date</Label>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {Platform.OS === "web" ? (
            createElement("input", {
              type: "date",
              "data-testid": "signature-date",
              "aria-label": "Signature date",
              value: toIsoDate(footer.signatureDate),
              onChange: (event: Event) => setSignatureDate((event.target as HTMLInputElement).value),
              style: dateInput,
            })
          ) : (
            <Pressable
              testID="signature-date"
              accessibilityRole="button"
              accessibilityLabel="Signature date"
              onPress={() => setShowDate(true)}
              style={dateButton}
            >
              <T style={{ color: footer.signatureDate ? colors.ink : colors.muted }}>
                {footer.signatureDate ? formatSignatureDate(footer.signatureDate) : "Choose date"}
              </T>
            </Pressable>
          )}
          <Button
            testID="signature-today"
            tone="quiet"
            label="Today"
            onPress={() => setSignatureDate(new Date().toISOString().slice(0, 10))}
          />
        </View>
        <T style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
          {footer.signatureDate
            ? `Prints as: ${formatSignatureDate(footer.signatureDate)}`
            : "Choose date for the signature line"}
        </T>
      </View>

      {showDate && Platform.OS === "android" ? (
        <DateTimePicker
          value={signatureDateValue(footer.signatureDate)}
          mode="date"
          onChange={(event, selected) => {
            setShowDate(false);
            if (event.type === "dismissed" || !selected) return;
            setSignatureDate(localIso(selected));
          }}
        />
      ) : null}
      {showDate && Platform.OS === "ios" ? (
        <View style={{ gap: 8 }}>
          <DateTimePicker
            value={signatureDateValue(footer.signatureDate)}
            mode="date"
            display="spinner"
            onChange={(_event, selected) => {
              if (selected) setSignatureDate(localIso(selected));
            }}
          />
          <Button label="Done" onPress={() => setShowDate(false)} />
        </View>
      ) : null}

      <View>
        <Label>Name</Label>
        <Field
          testID="signature-name"
          accessibilityLabel="Signee full name"
          placeholder="Signee full name"
          autoCapitalize="words"
          value={footer.name}
          onChangeText={(name) => dispatch({ type: "set-footer", patch: { name } })}
        />
      </View>

      <View>
        <Label>Designation</Label>
        <Select
          allowEmpty={false}
          label="Designation dropdown"
          value={designation}
          options={designationOptions}
          placeholder="Designation"
          onChange={(value) => dispatch({ type: "set-footer", patch: { designation: value } })}
        />
      </View>

      <View style={coordinatorBox}>
        <CheckRow
          testID="course-coordinator"
          label="Course Coordinator"
          value={isCourseCoordinator}
          onChange={(checked) => dispatch({ type: "set-footer", patch: { isCourseCoordinator: checked } })}
        />
        <T style={{ color: colors.muted, fontSize: 12, marginLeft: 26 }}>(appends & Course Coordinator)</T>
        <T style={{ color: colors.muted, fontSize: 12, marginLeft: 26 }}>
          Prints as:{" "}
          <T weight="semibold" style={{ color: colors.ink }}>
            {resolvedDesignationLine || "(empty)"}
          </T>
        </T>
      </View>

      <View>
        <Label>Course name</Label>
        <Field
          testID="signature-course"
          accessibilityLabel="Course name"
          placeholder="e.g. 12th ACSD Training Course"
          autoCapitalize="sentences"
          value={courseName}
          onChangeText={(value) => dispatch({ type: "set-footer", patch: { courseName: value } })}
        />
        <T style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>
          Printed as the last line in the bottom right corner
        </T>
      </View>
    </View>
  );
}

function signatureDateValue(stored: string): Date {
  const iso = toIsoDate(stored);
  if (!iso) return new Date();
  const [year, month, day] = iso.split("-").map((part) => Number(part));
  return new Date(year, month - 1, day);
}

function localIso(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

const footerCard = { ...card, gap: space.md } as const;

const preview = {
  height: 80,
  width: 176,
  borderWidth: 1,
  borderStyle: "dashed" as const,
  borderColor: "#ddd4c6",
  borderRadius: 6,
  backgroundColor: "#fff",
  alignItems: "center" as const,
  justifyContent: "center" as const,
  overflow: "hidden" as const,
};

const dateButton = {
  flex: 1,
  minHeight: 48,
  borderRadius: radius.md,
  backgroundColor: colors.paper,
  justifyContent: "center" as const,
  paddingHorizontal: space.md,
};

const fileInput = {
  position: "absolute" as const,
  width: 1,
  height: 1,
  opacity: 0.02,
};

const dateInput = {
  flex: 1,
  minHeight: 40,
  borderRadius: 8,
  border: `1px solid ${colors.line}`,
  padding: "8px 10px",
  fontSize: 14,
  background: "#fff",
  boxSizing: "border-box" as const,
};

const coordinatorBox = {
  backgroundColor: colors.paper,
  borderRadius: radius.md,
  padding: space.md,
  gap: 4,
};
