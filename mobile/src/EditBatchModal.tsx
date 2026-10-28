import { Ionicons } from "@expo/vector-icons";
import { useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, View } from "react-native";
import { useAccess } from "./auth";
import { cleanBatchNumber, ordinalSuffix, shortBatchLabel } from "./lib/text";
import type { Batch } from "./lib/types";
import { useSchedule } from "./store";
import { card, colors, radius, shadow, space, type } from "./theme";
import { Button, Field, Label, T } from "./ui";

function isAutoBatchName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  return /^\d+(?:st|nd|rd|th)?(?:\s*batch)?$/i.test(trimmed);
}

export function EditBatchModal({
  visible,
  batch,
  isNew = false,
  onClose,
  onAddBatch,
}: {
  visible: boolean;
  batch?: Batch | null;
  isNew?: boolean;
  onClose: () => void;
  onAddBatch?: (name?: string, count?: number, batchNum?: number) => void;
}) {
  const access = useAccess();
  const { state, dispatch } = useSchedule();
  const [batchNumberText, setBatchNumberText] = useState("");
  const [batchNameText, setBatchNameText] = useState("");
  const [studentCountText, setStudentCountText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isCustomName, setIsCustomName] = useState(false);

  useEffect(() => {
    if (!visible) return;

    if (isNew) {
      const lastNum = state.batches.reduce((max, item) => {
        const fromName = parseInt((item.name ?? "").replace(/\D/g, ""), 10);
        const fromId = parseInt((item.id ?? "").replace(/\D/g, ""), 10);
        const val = !isNaN(fromName) && fromName > 0 ? fromName : (!isNaN(fromId) && fromId > 0 ? fromId : 0);
        return Math.max(max, val);
      }, 0);
      const nextNum = lastNum > 0 ? lastNum + 1 : state.batches.length + 1;
      setBatchNumberText(String(nextNum));
      setBatchNameText(`${nextNum}${ordinalSuffix(nextNum)}`);
      setStudentCountText("40");
      setError(null);
      setConfirmDelete(false);
      setIsCustomName(false);
    } else if (batch) {
      const num = shortBatchLabel(batch.name, batch.id);
      setBatchNumberText(num);
      setBatchNameText(cleanBatchNumber(batch.name, batch.id) || (num ? `${num}${ordinalSuffix(Number(num))}` : ""));
      setStudentCountText(String(batch.numberOfStudents ?? batch.roster.length ?? 40));
      setError(null);
      setConfirmDelete(false);
      setIsCustomName(false);
    }
  }, [batch, visible, isNew, state.batches]);

  if (!visible || (!batch && !isNew)) return null;

  function onBatchNumberChange(val: string) {
    setBatchNumberText(val);
    setError(null);
    const parsed = parseInt(val.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      if (!isCustomName || isAutoBatchName(batchNameText)) {
        setBatchNameText(`${parsed}${ordinalSuffix(parsed)}`);
      }
    } else if (!val.trim()) {
      if (!isCustomName || isAutoBatchName(batchNameText)) {
        setBatchNameText("");
      }
    }
  }

  function handleSave() {
    const count = parseInt(studentCountText.trim(), 10);
    if (!Number.isFinite(count) || count < 1 || count > 200) {
      setError("Student count must be a number between 1 and 200.");
      return;
    }

    const num = parseInt(batchNumberText.trim(), 10);
    let finalName = batchNameText.trim();
    if (!finalName && Number.isFinite(num) && num > 0) {
      finalName = `${num}${ordinalSuffix(num)}`;
    }
    if (!finalName) {
      setError("Please enter a batch number or batch name.");
      return;
    }

    if (isNew) {
      if (onAddBatch) {
        onAddBatch(finalName, count, Number.isFinite(num) && num > 0 ? num : undefined);
      } else {
        const idSuffix = Number.isFinite(num) && num > 0 ? num : Date.now();
        let newId = `batch-${idSuffix}`;
        if (state.batches.some((b) => b.id === newId)) {
          newId = `batch-${Date.now()}`;
        }
        dispatch({ type: "add-batch", id: newId, name: finalName, count });
      }
      onClose();
      return;
    }

    if (!batch) return;

    dispatch({ type: "rename-batch", id: batch.id, name: finalName });
    dispatch({ type: "set-batch-student-count", id: batch.id, count });
    onClose();
  }

  function executeDelete() {
    if (!batch) return;
    dispatch({ type: "remove-batch", id: batch.id });
    onClose();
  }

  function handleDelete() {
    if (!batch) return;
    if (state.batches.length <= 1) {
      setError("Routine must have at least one batch.");
      return;
    }
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm(
        `Delete ${cleanBatchNumber(batch.name, batch.id) || "batch"}?\n\nThis removes the batch from all days in this routine.`
      );
      if (ok) {
        executeDelete();
        return;
      }
    } else if (Platform.OS !== "web") {
      Alert.alert(
        `Delete ${cleanBatchNumber(batch.name, batch.id) || "batch"}?`,
        "This removes the batch from every day in this routine.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete batch",
            style: "destructive",
            onPress: executeDelete,
          },
        ],
      );
      return;
    }
    setConfirmDelete(true);
  }

  const parsedCount = parseInt(studentCountText.trim(), 10);
  const maxIdDisplay = Number.isFinite(parsedCount) && parsedCount > 0 ? String(parsedCount).padStart(2, "0") : "40";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <View style={modalCard}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: space.sm }}>
              <T weight="bold" style={{ fontSize: type.title, color: colors.accent }}>
                {isNew ? "New Batch Info" : "Edit Batch Info"}
              </T>
              <T style={{ color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 }}>
                {isNew
                  ? "Enter batch number, name, and maximum student ID count."
                  : "Update batch number, name, and maximum student ID count."}
              </T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {!isNew && state.batches.length > 1 ? (
                <Pressable
                  testID="delete-batch-header-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Delete batch"
                  hitSlop={8}
                  onPress={handleDelete}
                  style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}
                >
                  <Ionicons name="trash-outline" size={20} color={colors.danger} />
                </Pressable>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={onClose}
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 4 }]}
              >
                <Ionicons name="close" size={22} color={colors.muted} />
              </Pressable>
            </View>
          </View>

          {error ? (
            <View style={errorBanner}>
              <Ionicons name="alert-circle" size={16} color={colors.danger} />
              <T style={{ color: colors.danger, fontSize: 12, flex: 1 }}>{error}</T>
            </View>
          ) : null}

          <View style={{ gap: space.xs }}>
            <Label>Batch number</Label>
            <Field
              testID="edit-batch-number-input"
              value={batchNumberText}
              keyboardType="number-pad"
              placeholder="e.g. 9"
              onChangeText={onBatchNumberChange}
            />
            <T style={{ color: colors.muted, fontSize: 11 }}>
              Displays on button as:{" "}
              <T weight="semibold" style={{ color: colors.ink }}>
                [{batchNumberText.trim() || "?"}]
              </T>
            </T>
          </View>

          <View style={{ gap: space.xs }}>
            <Label>Batch name</Label>
            <Field
              testID="edit-batch-name-input"
              value={batchNameText}
              placeholder="e.g. 9th or 9th Batch"
              onChangeText={(val) => {
                setBatchNameText(val);
                setIsCustomName(!isAutoBatchName(val));
                setError(null);
              }}
            />
            <T style={{ color: colors.muted, fontSize: 11 }}>
              Used in headers and PDF exports (e.g. {cleanBatchNumber(batchNameText) || (batchNumberText.trim() ? `${batchNumberText.trim()}${ordinalSuffix(Number(batchNumberText.trim()))}` : "9th")} Batch)
            </T>
          </View>

          <View style={{ gap: space.xs }}>
            <Label>Student count (ID max number)</Label>
            <Field
              testID="edit-batch-student-count-input"
              value={studentCountText}
              keyboardType="number-pad"
              placeholder="e.g. 40"
              onChangeText={(val) => {
                setStudentCountText(val);
                setError(null);
              }}
            />
            <T style={{ color: colors.muted, fontSize: 11 }}>
              Generates Day Manager IDs from 01 to{" "}
              <T weight="semibold" style={{ color: colors.ink }}>
                {maxIdDisplay}
              </T>
            </T>
          </View>

          {confirmDelete ? (
            <View
              testID="batch-delete-confirm-box"
              style={{
                backgroundColor: colors.dangerBg,
                borderColor: colors.danger,
                borderWidth: 1,
                borderRadius: radius.md,
                padding: space.sm,
                gap: 6,
                marginTop: space.sm,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Ionicons name="warning" size={16} color={colors.danger} />
                <T weight="bold" style={{ color: colors.danger, fontSize: 13 }}>
                  Delete {batch ? (cleanBatchNumber(batch.name, batch.id) || "batch") : "batch"}?
                </T>
              </View>
              <T style={{ color: colors.muted, fontSize: 11 }}>
                This will remove this batch and all its assignments from all days in this routine.
              </T>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: 4 }}>
                <Button small label="Keep batch" onPress={() => setConfirmDelete(false)} />
                <Button
                  testID="confirm-delete-batch-btn"
                  small
                  tone="danger"
                  icon={<Ionicons name="trash-outline" size={14} color="#fff" />}
                  label="Yes, delete batch"
                  onPress={executeDelete}
                />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm }}>
              {!isNew && state.batches.length > 1 ? (
                <Button
                  testID="delete-batch-modal-btn"
                  small
                  tone="danger"
                  icon={<Ionicons name="trash-outline" size={15} color={colors.danger} />}
                  label="Delete batch"
                  onPress={handleDelete}
                />
              ) : (
                <View />
              )}
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button label="Cancel" onPress={onClose} />
                <Button
                  testID="save-batch-info-btn"
                  label={isNew ? "Add batch" : "Save changes"}
                  tone="primary"
                  onPress={handleSave}
                />
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const backdrop = {
  flex: 1,
  backgroundColor: "rgba(28, 24, 20, 0.45)",
  justifyContent: "center" as const,
  padding: 20,
};

const modalCard = {
  ...card,
  gap: space.md,
  ...shadow,
};

const errorBanner = {
  flexDirection: "row" as const,
  alignItems: "center" as const,
  gap: 8,
  backgroundColor: "rgba(239, 68, 68, 0.1)",
  padding: space.sm,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: "rgba(239, 68, 68, 0.2)",
};
