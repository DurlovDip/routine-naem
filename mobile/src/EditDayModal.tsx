import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { createElement, useEffect, useState } from "react";
import { Alert, Modal, Platform, Pressable, View } from "react-native";
import { addDays, formatSlashDate, isIsoDate, todayInDhaka, toIsoDate, weekdayName } from "./lib/time";
import type { DayPlan } from "./lib/types";
import { useSchedule } from "./store";
import { card, colors, radius, shadow, space, type } from "./theme";
import { Button, Field, Label, T } from "./ui";

export function EditDayModal({
  visible,
  day,
  isNew = false,
  onClose,
  onAddDay,
}: {
  visible: boolean;
  day?: DayPlan | null;
  isNew?: boolean;
  onClose: () => void;
  onAddDay?: (dayNumber?: number, date?: string) => void;
}) {
  const { state, dispatch } = useSchedule();
  const [dayNumberText, setDayNumberText] = useState("");
  const [dateText, setDateText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible) return;

    if (isNew) {
      const maxDayNum = Math.max(...state.days.map((item) => item.dayNumber), 0);
      const nextDayNum = maxDayNum > 0 ? maxDayNum + 1 : (day ? day.dayNumber + 1 : 1);
      const maxDate = state.days.reduce((max, d) => (d.date > max ? d.date : max), day?.date || todayInDhaka());
      let nextDate = addDays(maxDate, 1);
      while (state.days.some((d) => d.date === nextDate)) {
        nextDate = addDays(nextDate, 1);
      }
      setDayNumberText(String(nextDayNum));
      setDateText(nextDate);
      setError(null);
      setShowDatePicker(false);
      setConfirmDelete(false);
    } else if (day) {
      setDayNumberText(String(day.dayNumber));
      setDateText(day.date);
      setError(null);
      setShowDatePicker(false);
      setConfirmDelete(false);
    }
  }, [day, visible, isNew, state.days]);

  if (!visible || (!day && !isNew)) return null;

  const currentIso = toIsoDate(dateText) || (isIsoDate(dateText) ? dateText : "");

  function handleSave() {
    const num = parseInt(dayNumberText.trim(), 10);
    if (!Number.isFinite(num) || num < 1 || num > 999) {
      setError("Day number must be a valid number between 1 and 999.");
      return;
    }

    const numTaken = state.days.some((d) => (isNew ? true : d.id !== day?.id) && d.dayNumber === num);
    if (numTaken) {
      setError(`Day ${num} is already used by another day in this routine.`);
      return;
    }

    const cleanDate = toIsoDate(dateText.trim()) || dateText.trim();
    if (!isIsoDate(cleanDate)) {
      setError("Please enter a valid date in YYYY-MM-DD format.");
      return;
    }

    const dateTaken = state.days.some((d) => (isNew ? true : d.id !== day?.id) && d.date === cleanDate);
    if (dateTaken) {
      setError(`A day scheduled on ${cleanDate} already exists.`);
      return;
    }

    if (isNew) {
      if (onAddDay) {
        onAddDay(num, cleanDate);
      } else {
        dispatch({
          type: "add-day",
          dayId: day?.id,
          dayNumber: num,
          date: cleanDate,
        });
      }
      onClose();
      return;
    }

    if (!day) return;

    dispatch({
      type: "update-day",
      id: day.id,
      patch: {
        dayNumber: num,
        date: cleanDate,
      },
    });
    onClose();
  }

  function executeDelete() {
    if (!day) return;
    dispatch({ type: "delete-day", dayId: day.id });
    onClose();
  }

  function handleDelete() {
    if (!day) return;
    if (state.days.length <= 1) {
      setError("Routine must have at least one day.");
      return;
    }
    if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.confirm === "function") {
      const ok = window.confirm(
        `Delete Day ${day.dayNumber}?\n\nThe routines on other days stay.`
      );
      if (ok) {
        executeDelete();
        return;
      }
    } else if (Platform.OS !== "web") {
      Alert.alert(
        `Delete Day ${day.dayNumber}?`,
        "The routines on the other days stay.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete day",
            style: "destructive",
            onPress: executeDelete,
          },
        ],
      );
      return;
    }
    setConfirmDelete(true);
  }

  function pickerDateValue(stored: string): Date {
    const iso = toIsoDate(stored);
    if (!iso) return new Date();
    const [year, month, dayPart] = iso.split("-").map(Number);
    return new Date(year, (month || 1) - 1, dayPart || 1);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={backdrop}>
        <View style={modalCard}>
          <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
            <View style={{ flex: 1, paddingRight: space.sm }}>
              <T weight="bold" style={{ fontSize: type.title, color: colors.accent }}>
                {isNew ? "New Day Info" : "Edit Day Info"}
              </T>
              <T style={{ color: colors.muted, fontSize: 12, marginTop: 2, lineHeight: 16 }}>
                {isNew
                  ? "Enter the day number and scheduled date for the new day."
                  : `Change the day number and scheduled date for Day ${day?.dayNumber}.`}
              </T>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              {!isNew && state.days.length > 1 ? (
                <Pressable
                  testID="delete-day-header-btn"
                  accessibilityRole="button"
                  accessibilityLabel="Delete day"
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
            <Label>Day number</Label>
            <Field
              testID="edit-day-number-input"
              value={dayNumberText}
              keyboardType="number-pad"
              placeholder="e.g. 15"
              onChangeText={(val) => {
                setDayNumberText(val);
                setError(null);
              }}
            />
            <T style={{ color: colors.muted, fontSize: 11 }}>
              Displays as:{" "}
              <T weight="semibold" style={{ color: colors.ink }}>
                {dayNumberText.trim() ? `Day ${dayNumberText.trim()}` : (day ? `Day ${day.dayNumber}` : "Day")}
              </T>
            </T>
          </View>

          <View style={{ gap: space.xs }}>
            <Label>Date (YYYY-MM-DD)</Label>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ flex: 1 }}>
                <Field
                  testID="edit-day-date-input"
                  value={dateText}
                  autoCapitalize="none"
                  placeholder="YYYY-MM-DD"
                  onChangeText={(val) => {
                    setDateText(val);
                    setError(null);
                  }}
                />
              </View>
              {Platform.OS !== "web" ? (
                <Button
                  small
                  icon={<Ionicons name="calendar-outline" size={16} color={colors.ink} />}
                  accessibilityLabel="Pick date"
                  onPress={() => setShowDatePicker(true)}
                />
              ) : null}
              <Button
                small
                label="Today"
                tone="quiet"
                onPress={() => {
                  setDateText(todayInDhaka());
                  setError(null);
                }}
              />
            </View>

            {currentIso ? (
              <T style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                {weekdayName(currentIso)} · {formatSlashDate(currentIso)}
              </T>
            ) : null}
          </View>

          {showDatePicker && Platform.OS === "android" ? (
            <DateTimePicker
              value={pickerDateValue(dateText)}
              mode="date"
              onChange={(_event, selected) => {
                setShowDatePicker(false);
                if (selected) {
                  const m = String(selected.getMonth() + 1).padStart(2, "0");
                  const d = String(selected.getDate()).padStart(2, "0");
                  setDateText(`${selected.getFullYear()}-${m}-${d}`);
                  setError(null);
                }
              }}
            />
          ) : null}

          {showDatePicker && Platform.OS === "ios" ? (
            <View style={{ gap: 8, backgroundColor: colors.paper, borderRadius: radius.md, padding: space.sm }}>
              <DateTimePicker
                value={pickerDateValue(dateText)}
                mode="date"
                display="spinner"
                onChange={(_event, selected) => {
                  if (selected) {
                    const m = String(selected.getMonth() + 1).padStart(2, "0");
                    const d = String(selected.getDate()).padStart(2, "0");
                    setDateText(`${selected.getFullYear()}-${m}-${d}`);
                    setError(null);
                  }
                }}
              />
              <Button label="Done" onPress={() => setShowDatePicker(false)} />
            </View>
          ) : null}

          {confirmDelete ? (
            <View
              testID="day-delete-confirm-box"
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
                  Delete Day {day?.dayNumber}?
                </T>
              </View>
              <T style={{ color: colors.muted, fontSize: 11 }}>
                This removes Day {day?.dayNumber} ({day ? formatSlashDate(day.date) : ""}). The routines on other days stay.
              </T>
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: space.sm, marginTop: 4 }}>
                <Button small label="Keep day" onPress={() => setConfirmDelete(false)} />
                <Button
                  testID="confirm-delete-day-btn"
                  small
                  tone="danger"
                  icon={<Ionicons name="trash-outline" size={14} color="#fff" />}
                  label="Yes, delete day"
                  onPress={executeDelete}
                />
              </View>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.sm }}>
              {!isNew && state.days.length > 1 ? (
                <Button
                  testID="delete-day-modal-btn"
                  small
                  tone="danger"
                  icon={<Ionicons name="trash-outline" size={15} color={colors.danger} />}
                  label="Delete day"
                  onPress={handleDelete}
                />
              ) : (
                <View />
              )}
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <Button label="Cancel" onPress={onClose} />
                <Button
                  testID="save-day-info-btn"
                  label={isNew ? "Add day" : "Save changes"}
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
