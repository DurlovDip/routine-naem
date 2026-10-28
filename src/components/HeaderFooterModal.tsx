import { Plus, Trash2, X } from "lucide-react";
import { useEffect } from "react";
import { useAuth } from "../auth";
import { useCourses } from "../courses";
import { HEADER_STYLES, headerStyleLabel } from "../lib/header";
import { formatSignatureDate, todayInDhaka } from "../lib/time";
import { useSchedule } from "../state";
import { colors } from "../theme";
import { Button, CheckRow, Field, Label, Select, T } from "./ui";

export function HeaderFooterModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { state, dispatch } = useSchedule();
  const auth = useAuth();
  const courses = useCourses();
  const footer = state.footer;

  const designation = footer.designation ?? "Assistant Director";
  const isCourseCoordinator = footer.isCourseCoordinator ?? true;
  const courseName = courses.selected?.name || footer.courseName || "";
  const signeeName = footer.name || auth.session?.teacherName || "";
  const rawDate = courses.selected?.updatedAt || footer.signatureDate || todayInDhaka();
  const displayDate = formatSignatureDate(rawDate);

  const resolvedDesignationLine = designation.trim()
    ? isCourseCoordinator
      ? `${designation.trim()} & Course Coordinator`
      : designation.trim()
    : isCourseCoordinator
      ? "Course Coordinator"
      : "";

  useEffect(() => {
    if (footer.signature) return;
    let mounted = true;
    void auth.loadSignature().then((sig) => {
      if (mounted && sig) {
        dispatch({ type: "set-footer", patch: { signature: sig } });
      }
    });
    return () => {
      mounted = false;
    };
  }, [auth, footer.signature, dispatch]);

  useEffect(() => {
    const patch: Partial<typeof footer> = {};
    if (courseName && courseName !== footer.courseName) patch.courseName = courseName;
    if (displayDate && displayDate !== footer.signatureDate) patch.signatureDate = displayDate;
    if (signeeName && signeeName !== footer.name) patch.name = signeeName;

    const lines = [resolvedDesignationLine, courseName].filter(Boolean);
    if (JSON.stringify(lines) !== JSON.stringify(footer.lines)) patch.lines = lines;

    if (Object.keys(patch).length > 0) {
      dispatch({ type: "set-footer", patch });
    }
  }, [courseName, displayDate, signeeName, resolvedDesignationLine, footer, dispatch]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6"
      style={{ backgroundColor: "rgba(28, 28, 26, 0.4)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[90vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-5 border-b" style={{ borderColor: colors.line }}>
          <div>
            <T weight="bold" className="text-lg" style={{ color: colors.ink }}>
              Header & footer
            </T>
            <div className="text-xs mt-0.5" style={{ color: colors.muted }}>
              Printed at the top and bottom of the routine and exported PDF.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-stone-400 hover:text-stone-700 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Header Lines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold" style={{ color: colors.ink }}>
                Routine Header Lines
              </span>
              <Button
                small
                label="Add Line"
                icon={<Plus size={14} />}
                onClick={() => dispatch({ type: "add-header-line" })}
              />
            </div>

            <div className="space-y-2.5">
              {state.header.map((line, index) => (
                <div key={line.id} className="flex items-center gap-2">
                  <div className="w-32 flex-none">
                    <Select
                      label="Style"
                      value={headerStyleLabel(line.style)}
                      options={HEADER_STYLES.map((s) => s.label)}
                      onChange={(label) => {
                        const style = HEADER_STYLES.find((s) => s.label === label)?.value ?? "normal";
                        dispatch({ type: "set-header-line", id: line.id, patch: { style } });
                      }}
                    />
                  </div>
                  <div className="flex-1">
                    <Field
                      value={line.text}
                      onChange={(e) =>
                        dispatch({ type: "set-header-line", id: line.id, patch: { text: e.target.value } })
                      }
                      placeholder={`Line ${index + 1}`}
                    />
                  </div>
                  {state.header.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => dispatch({ type: "remove-header-line", id: line.id })}
                      className="p-2 text-stone-400 hover:text-red-600 cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Footer Signature */}
          <div className="space-y-3 pt-4 border-t" style={{ borderColor: colors.line }}>
            <span className="text-sm font-bold" style={{ color: colors.ink }}>
              Routine Footer
            </span>

            <div className="space-y-3">
              <div>
                <Label>Signee Name</Label>
                <Field
                  value={signeeName}
                  onChange={(e) => dispatch({ type: "set-footer", patch: { name: e.target.value } })}
                  placeholder="Dr. Litan Kanti Halder"
                />
              </div>

              <div>
                <Label>Designation</Label>
                <Field
                  value={designation}
                  onChange={(e) =>
                    dispatch({ type: "set-footer", patch: { designation: e.target.value } })
                  }
                  placeholder="Assistant Director"
                />
              </div>

              <CheckRow
                label="Include '& Course Coordinator'"
                value={isCourseCoordinator}
                onChange={(value) =>
                  dispatch({ type: "set-footer", patch: { isCourseCoordinator: value } })
                }
              />
            </div>
          </div>
        </div>

        <div className="p-4 border-t flex justify-end" style={{ borderColor: colors.line }}>
          <Button label="Done" tone="primary" onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
