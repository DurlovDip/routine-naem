import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { addDays, formatSlashDate, isIsoDate, todayInDhaka, toIsoDate, weekdayName } from "../lib/time";
import type { DayPlan } from "../lib/types";
import { useSchedule } from "../state";
import { colors } from "../theme";
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
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!visible) return;

    if (isNew) {
      const maxDayNum = Math.max(...state.days.map((item) => item.dayNumber), 0);
      const nextDayNum = maxDayNum > 0 ? maxDayNum + 1 : day ? day.dayNumber + 1 : 1;
      const maxDate = state.days.reduce(
        (max, d) => (d.date > max ? d.date : max),
        day?.date || todayInDhaka(),
      );
      let nextDate = addDays(maxDate, 1);
      while (state.days.some((d) => d.date === nextDate)) {
        nextDate = addDays(nextDate, 1);
      }
      setDayNumberText(String(nextDayNum));
      setDateText(nextDate);
      setError(null);
      setConfirmDelete(false);
    } else if (day) {
      setDayNumberText(String(day.dayNumber));
      setDateText(day.date);
      setError(null);
      setConfirmDelete(false);
    }
  }, [day, visible, isNew, state.days]);

  if (!visible || (!day && !isNew)) return null;

  function handleSave() {
    const num = parseInt(dayNumberText.trim(), 10);
    if (!Number.isFinite(num) || num < 1 || num > 999) {
      setError("Day number must be a valid number between 1 and 999.");
      return;
    }

    const numTaken = state.days.some(
      (d) => (isNew ? true : d.id !== day?.id) && d.dayNumber === num,
    );
    if (numTaken) {
      setError(`Day ${num} is already used by another day in this routine.`);
      return;
    }

    const cleanDate = toIsoDate(dateText.trim()) || dateText.trim();
    if (!isIsoDate(cleanDate)) {
      setError("Please enter a valid date in YYYY-MM-DD format.");
      return;
    }

    const dateTaken = state.days.some(
      (d) => (isNew ? true : d.id !== day?.id) && d.date === cleanDate,
    );
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
      patch: { dayNumber: num, date: cleanDate },
    });
    onClose();
  }

  const nextDate = day ? addDays(day.date, 1) : "";
  const nextDayNum = day ? day.dayNumber + 1 : 1;
  const nextDayExists = day
    ? state.days.some((d) => d.id !== day.id && (d.date === nextDate || d.dayNumber === nextDayNum))
    : false;
  const maxDayNum = Math.max(...state.days.map((item) => item.dayNumber), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(28, 28, 26, 0.3)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md p-6 bg-white rounded-2xl shadow-xl flex flex-col gap-4 animate-in fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b pb-3" style={{ borderColor: colors.line }}>
          <T weight="bold" className="text-lg" style={{ color: colors.ink }}>
            {isNew ? "Add Day" : `Edit Day ${day?.dayNumber}`}
          </T>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex gap-3">
          <div className="w-28 flex-none">
            <Label>Day number</Label>
            <Field
              type="number"
              min="1"
              max="999"
              value={dayNumberText}
              onChange={(e) => {
                setDayNumberText(e.target.value);
                setError(null);
              }}
              placeholder="1"
            />
          </div>
          <div className="flex-1">
            <Label>Date (YYYY-MM-DD)</Label>
            <Field
              type="date"
              value={dateText}
              onChange={(e) => {
                setDateText(e.target.value);
                setError(null);
              }}
            />
            {dateText && weekdayName(dateText) ? (
              <div className="text-xs mt-1" style={{ color: colors.muted }}>
                {weekdayName(dateText)}
              </div>
            ) : null}
          </div>
        </div>

        {error ? (
          <div
            className="text-xs p-2.5 rounded-lg"
            style={{ color: colors.danger, backgroundColor: colors.dangerBg }}
          >
            {error}
          </div>
        ) : null}

        {/* Existing day operations: Duplicate / Blank next / Delete */}
        {!isNew && day ? (
          <div className="flex flex-col gap-2 pt-2 border-t" style={{ borderColor: colors.line }}>
            <div className="flex flex-wrap gap-2">
              <Button
                small
                label="Duplicate to next day"
                tone="primary"
                disabled={nextDayExists}
                onClick={() => {
                  dispatch({ type: "duplicate-day", dayId: day.id });
                  onClose();
                }}
              />
              <Button
                small
                label="Blank next day"
                disabled={nextDayExists}
                onClick={() => {
                  dispatch({ type: "new-day", dayId: day.id });
                  onClose();
                }}
              />
            </div>

            {nextDayExists ? (
              <div
                className="text-xs p-2.5 rounded-lg flex flex-col gap-2"
                style={{ backgroundColor: colors.warnBg, color: colors.warn }}
              >
                <div>
                  Day {String(nextDayNum).padStart(2, "0")} ({formatSlashDate(nextDate)}) already exists.
                </div>
                <Button
                  small
                  label={`Duplicate as Day ${String(maxDayNum + 1).padStart(2, "0")}`}
                  onClick={() => {
                    dispatch({ type: "duplicate-day-to-end", dayId: day.id });
                    onClose();
                  }}
                />
              </div>
            ) : null}

            {confirmDelete ? (
              <div
                className="p-3 rounded-xl border flex flex-col gap-2 mt-1"
                style={{ borderColor: colors.danger, backgroundColor: colors.dangerBg }}
              >
                <div className="text-xs font-semibold" style={{ color: colors.danger }}>
                  Delete Day {day.dayNumber}? Other days will stay intact.
                </div>
                <div className="flex gap-2 justify-end">
                  <Button small label="Cancel" onClick={() => setConfirmDelete(false)} />
                  <Button
                    small
                    tone="danger"
                    label="Confirm delete"
                    onClick={() => {
                      dispatch({ type: "delete-day", dayId: day.id });
                      onClose();
                    }}
                  />
                </div>
              </div>
            ) : (
              <Button
                small
                tone="danger"
                label="Delete day"
                icon={<Trash2 size={14} />}
                disabled={state.days.length <= 1}
                onClick={() => setConfirmDelete(true)}
              />
            )}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: colors.line }}>
          <Button label="Cancel" onClick={onClose} />
          <Button label={isNew ? "Add Day" : "Save Changes"} tone="primary" onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}
