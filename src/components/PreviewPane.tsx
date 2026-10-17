import { useLayoutEffect, useState, type RefObject } from "react";
import { findConflicts } from "../lib/schedule";
import type { DayPlan } from "../lib/types";
import { useSchedule } from "../state";
import { ScheduleSheet } from "./ScheduleSheet";

export function PreviewPane({
  day,
  sheetRef,
}: {
  day: DayPlan;
  sheetRef: RefObject<HTMLDivElement | null>;
}) {
  const { state } = useSchedule();
  const [box, setBox] = useState({ scale: 1, width: 1100, height: 760 });
  const conflicts = state.showConflicts ? findConflicts(state.batches, day) : [];

  useLayoutEffect(() => {
    const outer = document.getElementById("preview-scroll");
    const sheet = sheetRef.current;
    if (!outer || !sheet) return;
    const update = () => {
      const sheetWidth = sheet.offsetWidth || 1;
      const sheetHeight = sheet.offsetHeight || 1;
      const available = Math.max(outer.clientWidth - 36, 160);
      setBox({
        scale: Math.min(1, available / sheetWidth),
        width: sheetWidth,
        height: sheetHeight,
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(outer);
    observer.observe(sheet);
    return () => observer.disconnect();
  }, [day, sheetRef, state]);

  return (
    <div id="preview-scroll" className="preview-pane">
      <p className="preview-note no-print">
        A4 landscape preview. Print / PDF uses this page. Choose landscape if the dialog does not.
        {conflicts.length > 0
          ? ` ${conflicts.length} teacher clash${conflicts.length === 1 ? "" : "es"} on this day — they stay off the printed sheet.`
          : ""}
      </p>
      <div className="scale-sizer" style={{ width: box.width * box.scale, height: box.height * box.scale }}>
        <div className="scale-box" style={{ width: box.width, transform: `scale(${box.scale})` }}>
          <ScheduleSheet state={state} day={day} sheetRef={sheetRef} />
        </div>
      </div>
    </div>
  );
}
