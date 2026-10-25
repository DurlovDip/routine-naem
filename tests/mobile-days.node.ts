import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createDemoState } from "../mobile/src/lib/demo.ts";
import { isDayDirty, scheduleReducer } from "../mobile/src/lib/reducer.ts";
import { dayWhen, formatLastUpdated, todayInDhaka } from "../mobile/src/lib/time.ts";

describe("day chip dates", () => {
  it("classifies a day as past, today, future, or undated", () => {
    const today = "2026-10-23";
    assert.equal(dayWhen("2026-10-22", today), "past");
    assert.equal(dayWhen("2026-10-23", today), "today");
    assert.equal(dayWhen("2026-10-24", today), "future");
    assert.equal(dayWhen("", today), "undated");
    assert.equal(dayWhen("18/10/2026", today), "undated");
    assert.equal(dayWhen("2026-02-31", today), "undated");
  });

  it("reads today as the Asia/Dhaka calendar date", () => {
    assert.equal(todayInDhaka(new Date("2026-10-23T18:30:00.000Z")), "2026-10-24");
    assert.equal(todayInDhaka(new Date("2026-10-23T17:30:00.000Z")), "2026-10-23");
  });

  it("renders an edit icon on active day chip and provides EditDayModal", () => {
    const ui = readFileSync(new URL("../mobile/src/ui.tsx", import.meta.url), "utf8");
    assert.match(ui, /testID="edit-day-chip"/);
    assert.match(ui, /chipDivider/);
    assert.match(ui, /name="pencil"/);

    const modal = readFileSync(new URL("../mobile/src/EditDayModal.tsx", import.meta.url), "utf8");
    assert.match(modal, /Edit Day Info/);
    assert.match(modal, /testID="edit-day-number-input"/);
    assert.match(modal, /testID="edit-day-date-input"/);
    assert.match(modal, /type: "update-day"/);
  });

  it("renders an edit icon on active batch chip and provides EditBatchModal", () => {
    const ui = readFileSync(new URL("../mobile/src/ui.tsx", import.meta.url), "utf8");
    assert.match(ui, /testID="edit-batch-chip"/);

    const modal = readFileSync(new URL("../mobile/src/EditBatchModal.tsx", import.meta.url), "utf8");
    assert.match(modal, /Edit Batch Info/);
    assert.match(modal, /testID="edit-batch-number-input"/);
    assert.match(modal, /testID="edit-batch-name-input"/);
    assert.match(modal, /testID="edit-batch-student-count-input"/);
    assert.match(modal, /type: "rename-batch"/);
    assert.match(modal, /type: "set-batch-student-count"/);
  });

  it("supports publishing a day and exposes floating publish button and draft protection", () => {
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    assert.match(editor, /testID="publish-routine-fab"/);
    assert.match(editor, /floatingPublishContainer/);
    assert.match(editor, /floatingPublishBtn/);
    assert.match(editor, /publish-day/);
    assert.match(editor, /publishRoutine/);

    const routine = readFileSync(new URL("../mobile/app/(main)/routine.tsx", import.meta.url), "utf8");
    assert.match(routine, /testID="routine-download"/);
    assert.match(routine, /badgePublished/);
    assert.match(routine, /badgeDraft/);
    assert.doesNotMatch(routine, /draftNoticeBanner/);
    assert.match(routine, /Routine in Draft/);
    assert.doesNotMatch(routine, /routine-add-day/);
    assert.doesNotMatch(routine, /EditDayModal/);
    assert.doesNotMatch(routine, /onEdit=/);
  });

  it("supports adding a new batch with proper ID and retains schedule batches across remote loads", () => {
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    assert.match(editor, /testID="add-batch-button"/);
    assert.match(editor, /dispatch\(\{\s*type:\s*"add-batch"/);
    assert.match(editor, /setBatchId\(newId\)/);

    const reducerCode = readFileSync(new URL("../mobile/src/lib/reducer.ts", import.meta.url), "utf8");
    assert.match(reducerCode, /case "add-batch":/);
    assert.match(reducerCode, /rosterRange\(1,\s*40\)/);

    const supabaseCode = readFileSync(new URL("../mobile/src/lib/supabase.ts", import.meta.url), "utf8");
    assert.match(supabaseCode, /!baseState\.batches \|\| baseState\.batches\.length === 0/);
  });

  it("supports auto rolling manager IDs each day (13 & 14 -> 15 & 16, or 13 -> 14)", () => {
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    assert.match(editor, /testID="auto-roll-ids-toggle"/);
    assert.match(editor, /testID="toggle-day-managers"/);
    assert.match(editor, /const \[expanded, setExpanded\] = useState\(false\)/);
    assert.match(editor, /Auto roll IDs each day/);
    assert.match(editor, /Next day rolls forward/);

    let state = createDemoState();
    state = scheduleReducer(state, { type: "add-batch", id: "batch-9", name: "9th" });
    state = scheduleReducer(state, { type: "duplicate-day", dayId: state.days[0].id });
    assert.equal(state.days.length, 2);

    // 1. With autoRotate = true, set Day 1 managers to ["13", "14"] -> Day 2 should auto-roll to ["15", "16"]
    state = scheduleReducer(state, { type: "set-auto-rotate", value: true });
    state = scheduleReducer(state, { type: "set-managers", dayId: state.days[0].id, batchId: "batch-9", ids: ["13", "14"] });
    assert.deepEqual(state.days[0].managers["batch-9"], ["13", "14"]);
    assert.deepEqual(state.days[1].managers["batch-9"], ["15", "16"]);

    // 2. Single ID: set Day 1 manager to ["13"] -> Day 2 should auto-roll to ["14"]
    state = scheduleReducer(state, { type: "set-managers", dayId: state.days[0].id, batchId: "batch-9", ids: ["13"] });
    assert.deepEqual(state.days[0].managers["batch-9"], ["13"]);
    assert.deepEqual(state.days[1].managers["batch-9"], ["14"]);

    // 3. When autoRotate = false, editing Day 1 does NOT change Day 2
    state = scheduleReducer(state, { type: "set-auto-rotate", value: false });
    state = scheduleReducer(state, { type: "set-managers", dayId: state.days[0].id, batchId: "batch-9", ids: ["01", "02"] });
    assert.deepEqual(state.days[0].managers["batch-9"], ["01", "02"]);
    assert.deepEqual(state.days[1].managers["batch-9"], ["14"]); // kept previous Day 2 value
  });

  it("does not fail schedule upsert when teachers catalog has permission restrictions", () => {
    const supabaseSrc = readFileSync(new URL("../mobile/src/lib/supabase.ts", import.meta.url), "utf8");
    // Ensure permission denied is handled gracefully and doesn't fail schedule save
    assert.match(supabaseSrc, /permission denied|violates row-level security|policy/i);
    // Ensure deleteMissingTeachers does not delete institutional teachers
    assert.match(supabaseSrc, /Institutional teachers are directory accounts/);
    // Ensure catalogWarnings are warned, not fatal errors that block schedule save
    assert.match(supabaseSrc, /console\.warn\("Catalog sync skipped or restricted:/);
  });

  it("isolates draft edits until published, shows last updated time, and sets publish button to ash Already published", () => {
    // 1. FormatLastUpdated helper checks
    assert.equal(formatLastUpdated(""), "");
    assert.equal(formatLastUpdated(null), "");
    assert.equal(formatLastUpdated("invalid-date"), "");
    const pastIso = "2026-05-10T14:30:00.000Z";
    assert.match(formatLastUpdated(pastIso), /10\/05\/2026/);

    // 2. Draft vs Published isolation via reducer
    let state = createDemoState();
    const dayId = state.days[0].id;
    assert.equal(isDayDirty(state.days[0]), true, "Initial draft day is dirty/unpublished");

    // Publish the day
    state = scheduleReducer(state, { type: "publish-day", dayId });
    const publishedDay = state.days.find((d) => d.id === dayId)!;
    assert.equal(publishedDay.isPublished, true);
    assert.ok(publishedDay.publishedAt);
    assert.ok(publishedDay.publishedSnapshot);
    assert.equal(isDayDirty(publishedDay), false, "Immediately after publishing, day has no unpublished changes");

    // Make an edit in the draft (e.g. set manager or update day start)
    state = scheduleReducer(state, {
      type: "update-day",
      id: dayId,
      patch: { dayStart: "08:30" },
    });
    const modifiedDay = state.days.find((d) => d.id === dayId)!;
    assert.equal(modifiedDay.dayStart, "08:30");
    // The published snapshot STILL has the original 09:00 start!
    assert.equal(modifiedDay.publishedSnapshot?.dayStart, "09:00");
    assert.equal(isDayDirty(modifiedDay), true, "Modified day has unpublished changes");

    // 3. UI checks in editor and routine screens
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    assert.match(editor, /hasChanges \? "Publish" : "Already published"/);
    assert.match(editor, /hasChanges \? colors\.accent : "#a3a39e"/);
    assert.match(editor, /disabled=\{!hasChanges \|\| isPublishing\}/);
    assert.match(editor, /Last modified: \$\{formatLastUpdated\(day\.publishedAt\)\}/);
    assert.doesNotMatch(editor, /statusBadgePublished/);

    const routine = readFileSync(new URL("../mobile/app/(main)/routine.tsx", import.meta.url), "utf8");
    assert.match(routine, /isPublished && activeDay\.publishedSnapshot \? activeDay\.publishedSnapshot : activeDay/);
    assert.match(routine, /Last updated: \{formatLastUpdated\(day\.publishedAt\)\}/);
  });

  it("supports Day + button to immediately add next day even if following day number exists", () => {
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    assert.match(editor, /testID="add-day-button"/);
    assert.match(editor, /dispatch\(\{\s*type:\s*"add-day"/);

    let state = createDemoState();
    // Simulate user scenario from screenshot: Day 15 and Day 16 already exist
    state.days[0].dayNumber = 15;
    state.days[0].date = "2026-10-25";
    state = scheduleReducer(state, { type: "add-day", dayId: state.days[0].id });
    assert.equal(state.days.length, 2);
    assert.equal(state.days[1].dayNumber, 16);

    // User is on Day 15 and clicks '+' again -> should add Day 17!
    state = scheduleReducer(state, { type: "add-day", dayId: state.days[0].id });
    assert.equal(state.days.length, 3);
    assert.equal(state.days[2].dayNumber, 17);
    assert.equal(state.activeDayId, state.days[2].id);
  });

  it("provides delete button and trash icon in EditBatchModal and EditDayModal", () => {
    const batchModal = readFileSync(new URL("../mobile/src/EditBatchModal.tsx", import.meta.url), "utf8");
    assert.match(batchModal, /testID="delete-batch-header-btn"/);
    assert.match(batchModal, /testID="delete-batch-modal-btn"/);
    assert.match(batchModal, /testID="confirm-delete-batch-btn"/);
    assert.match(batchModal, /testID="batch-delete-confirm-box"/);
    assert.match(batchModal, /type: "remove-batch"/);
    assert.doesNotMatch(batchModal, /access\.canAdmin/);

    const dayModal = readFileSync(new URL("../mobile/src/EditDayModal.tsx", import.meta.url), "utf8");
    assert.match(dayModal, /testID="delete-day-header-btn"/);
    assert.match(dayModal, /testID="delete-day-modal-btn"/);
    assert.match(dayModal, /testID="confirm-delete-day-btn"/);
    assert.match(dayModal, /testID="day-delete-confirm-box"/);
    assert.match(dayModal, /type: "delete-day"/);

    // Reducer test: removing batch cleans from state
    let state = createDemoState();
    state = scheduleReducer(state, { type: "add-batch", id: "b1", name: "1st" });
    state = scheduleReducer(state, { type: "add-batch", id: "b2", name: "2nd" });
    assert.equal(state.batches.length, 2);
    const batchToDelete = state.batches[0].id;
    state = scheduleReducer(state, { type: "remove-batch", id: batchToDelete });
    assert.equal(state.batches.length, 1);
    assert.ok(!state.batches.some((b) => b.id === batchToDelete));
  });

  it("opens modal on Day + and Batch + click for entry and supports arbitrary non-consecutive sequence", () => {
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    // Verify Day + opens new day modal
    assert.match(editor, /setIsNewDay\(true\)/);
    assert.match(editor, /<EditDayModal[^>]*visible=\{editingDay !== null \|\| isNewDay\}/);
    assert.match(editor, /isNew=\{isNewDay\}/);

    // Verify Batch + opens new batch modal
    assert.match(editor, /setIsNewBatch\(true\)/);
    assert.match(editor, /<EditBatchModal[^>]*visible=\{editingBatch !== null \|\| isNewBatch\}/);
    assert.match(editor, /isNew=\{isNewBatch\}/);

    const dayModal = readFileSync(new URL("../mobile/src/EditDayModal.tsx", import.meta.url), "utf8");
    assert.match(dayModal, /isNew \? "New Day Info" : "Edit Day Info"/);
    assert.match(dayModal, /isNew \? "Add day" : "Save changes"/);

    const batchModal = readFileSync(new URL("../mobile/src/EditBatchModal.tsx", import.meta.url), "utf8");
    assert.match(batchModal, /isNew \? "New Batch Info" : "Edit Batch Info"/);
    assert.match(batchModal, /isNew \? "Add batch" : "Save changes"/);

    // Reducer supports arbitrary non-consecutive day numbers (e.g. Day 15, Day 18, Day 25)
    let state = createDemoState();
    state.days[0].dayNumber = 15;
    state.days[0].date = "2026-10-25";

    // User creates Day 18 (skipping 16, 17)
    state = scheduleReducer(state, { type: "add-day", dayNumber: 18, date: "2026-10-28" });
    assert.equal(state.days.length, 2);
    assert.equal(state.days[1].dayNumber, 18);
    assert.equal(state.days[1].date, "2026-10-28");

    // Next add-day defaults to 19 (gradually increasing by one from max)
    state = scheduleReducer(state, { type: "add-day" });
    assert.equal(state.days.length, 3);
    assert.equal(state.days[2].dayNumber, 19);

    // User can also add non-consecutive Batch 6 or Batch 10
    state = scheduleReducer(state, { type: "add-batch", id: "batch-6", name: "6th", count: 45 });
    assert.equal(state.batches.length, 1);
    assert.equal(state.batches[0].id, "batch-6");
    assert.equal(state.batches[0].name, "6th");
    assert.equal(state.batches[0].numberOfStudents, 45);
    assert.equal(state.batches[0].roster.length, 45);

    state = scheduleReducer(state, { type: "add-batch", id: "batch-10", name: "10th", count: 50 });
    assert.equal(state.batches.length, 2);
    assert.equal(state.batches[1].id, "batch-10");
    assert.equal(state.batches[1].name, "10th");
    assert.equal(state.batches[1].numberOfStudents, 50);

    // Verify batch name in modal automatically syncs with batch number
    assert.match(batchModal, /function isAutoBatchName/);
    assert.match(batchModal, /setBatchNameText\(`\$\{parsed\}\$\{ordinalSuffix\(parsed\)\}`\)/);
  });
});


