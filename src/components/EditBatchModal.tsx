import { Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cleanBatchNumber, ordinalSuffix, shortBatchLabel } from "../lib/text";
import type { Batch } from "../lib/types";
import { useSchedule } from "../state";
import { colors } from "../theme";
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
        const val =
          !isNaN(fromName) && fromName > 0
            ? fromName
            : !isNaN(fromId) && fromId > 0
              ? fromId
              : 0;
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
      setBatchNameText(
        cleanBatchNumber(batch.name, batch.id) || (num ? `${num}${ordinalSuffix(Number(num))}` : ""),
      );
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
        onAddBatch(finalName, count, Number.isFinite(num) ? num : undefined);
      } else {
        const newId = `batch-${Number.isFinite(num) ? num : Date.now()}`;
        dispatch({ type: "add-batch", id: newId, name: finalName, count });
      }
      onClose();
      return;
    }

    if (!batch) return;
    dispatch({
      type: "rename-batch",
      id: batch.id,
      name: finalName,
    });
    dispatch({
      type: "set-batch-student-count",
      id: batch.id,
      count,
    });
    onClose();
  }

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
            {isNew ? "Add Batch" : "Edit Batch"}
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
            <Label>Number</Label>
            <Field
              type="number"
              min="1"
              value={batchNumberText}
              onChange={(e) => onBatchNumberChange(e.target.value)}
              placeholder="1"
            />
          </div>
          <div className="flex-1">
            <Label>Name</Label>
            <Field
              type="text"
              value={batchNameText}
              onChange={(e) => {
                setBatchNameText(e.target.value);
                setIsCustomName(true);
                setError(null);
              }}
              placeholder="1st"
            />
          </div>
        </div>

        <div>
          <Label>Number of students</Label>
          <Field
            type="number"
            min="1"
            max="200"
            value={studentCountText}
            onChange={(e) => {
              setStudentCountText(e.target.value);
              setError(null);
            }}
          />
        </div>

        {error ? (
          <div
            className="text-xs p-2.5 rounded-lg"
            style={{ color: colors.danger, backgroundColor: colors.dangerBg }}
          >
            {error}
          </div>
        ) : null}

        {!isNew && batch ? (
          <div className="pt-2 border-t" style={{ borderColor: colors.line }}>
            {confirmDelete ? (
              <div
                className="p-3 rounded-xl border flex flex-col gap-2"
                style={{ borderColor: colors.danger, backgroundColor: colors.dangerBg }}
              >
                <div className="text-xs font-semibold" style={{ color: colors.danger }}>
                  Delete this batch? Sessions in this batch will be lost.
                </div>
                <div className="flex gap-2 justify-end">
                  <Button small label="Cancel" onClick={() => setConfirmDelete(false)} />
                  <Button
                    small
                    tone="danger"
                    label="Confirm delete"
                    onClick={() => {
                      dispatch({ type: "remove-batch", id: batch.id });
                      onClose();
                    }}
                  />
                </div>
              </div>
            ) : (
              <Button
                small
                tone="danger"
                label="Delete batch"
                icon={<Trash2 size={14} />}
                disabled={state.batches.length <= 1}
                onClick={() => setConfirmDelete(true)}
              />
            )}
          </div>
        ) : null}

        <div className="flex justify-end gap-2 pt-3 border-t" style={{ borderColor: colors.line }}>
          <Button label="Cancel" onClick={onClose} />
          <Button label={isNew ? "Add Batch" : "Save Changes"} tone="primary" onClick={handleSave} />
        </div>
      </div>
    </div>
  );
}
