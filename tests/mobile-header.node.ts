import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createInitialState } from "../mobile/src/lib/demo.ts";
import { courseTitleText, headerStyleFromLabel, headerStyleLabel, isHeaderStyle } from "../mobile/src/lib/header.ts";
import { scheduleReducer } from "../mobile/src/lib/reducer.ts";
import { canEditSchedule, effectiveRole } from "../mobile/src/lib/roles.ts";
import { normalizeState } from "../mobile/src/lib/storage.ts";

describe("routine header editing", () => {
  it("uses the same styles as the printed sheet", () => {
    assert.equal(headerStyleLabel("title"), "Course title");
    assert.equal(headerStyleLabel("subtitle"), "Subtitle");
    assert.equal(headerStyleLabel("normal"), "Plain");
    assert.equal(headerStyleLabel("banner"), "");
    assert.equal(headerStyleFromLabel("Course title"), "title");
    assert.equal(headerStyleFromLabel("Clear"), null);
    assert.equal(
      courseTitleText([
        { style: "normal", text: "National Academy for Educational Management" },
        { style: "title", text: "Advanced Course on Skill Development" },
        { style: "subtitle", text: "For cadre officers" },
      ]),
      "Advanced Course on Skill Development",
    );
    assert.equal(courseTitleText([{ style: "normal", text: "Only a plain line" }]), "Only a plain line");
    assert.equal(courseTitleText([{ style: "title", text: "  " }, { style: "normal", text: "Fallback" }]), "Fallback");
    assert.equal(isHeaderStyle("subtitle"), true);
    assert.equal(isHeaderStyle("banner"), false);
  });

  it("edits the header text and course title, and keeps at least one line", () => {
    let state = createInitialState();
    const first = state.header[0];
    const title = state.header.find((line) => line.style === "title");
    assert.ok(title);

    state = scheduleReducer(state, {
      type: "set-header-line",
      id: first.id,
      patch: { text: "National Academy for Educational Management" },
    });
    state = scheduleReducer(state, {
      type: "set-header-line",
      id: title.id,
      patch: { text: "Updated Course on Skill Development" },
    });
    assert.equal(state.header[0].text, "National Academy for Educational Management");
    assert.equal(
      state.header.find((line) => line.style === "title")?.text,
      "Updated Course on Skill Development",
    );

    state = scheduleReducer(state, { type: "add-header-line" });
    const added = state.header[state.header.length - 1];
    assert.equal(added.text, "");
    assert.equal(added.style, "normal");
    state = scheduleReducer(state, {
      type: "set-header-line",
      id: added.id,
      patch: { text: "For cadre officers", style: "subtitle" },
    });
    state = scheduleReducer(state, { type: "move-header-line", id: added.id, dir: -1 });
    assert.notEqual(state.header[state.header.length - 1].id, added.id);
    assert.equal(state.header.find((line) => line.id === added.id)?.style, "subtitle");

    const lone = state.header[0];
    const kept = scheduleReducer(
      { ...state, header: [lone] },
      { type: "remove-header-line", id: lone.id },
    );
    assert.deepEqual(kept.header, [lone]);
    const unmoved = scheduleReducer(kept, { type: "move-header-line", id: lone.id, dir: -1 });
    assert.deepEqual(unmoved.header, [lone]);

    const again = normalizeState(JSON.parse(JSON.stringify(state)));
    assert.equal(
      again?.header.find((line) => line.style === "title")?.text,
      "Updated Course on Skill Development",
    );
    assert.equal(again?.header.find((line) => line.id === added.id)?.text, "For cadre officers");
  });

  it("lets a coordinator edit only inside the assignment window", () => {
    assert.equal(canEditSchedule("super_admin"), true);
    assert.equal(canEditSchedule("coordinator"), true);
    assert.equal(canEditSchedule("temp_coordinator"), true);
    assert.equal(canEditSchedule("teacher"), false);
    assert.equal(canEditSchedule(null), false);
    assert.equal(canEditSchedule(effectiveRole("coordinator", "2026-10-01", "2026-10-31", "2026-10-22")), true);
    assert.equal(canEditSchedule(effectiveRole("coordinator", "2026-10-01", "2026-10-31", "2026-11-01")), false);
    assert.equal(canEditSchedule(effectiveRole("temp_coordinator", "2026-10-01", "2026-10-20", "2026-10-22")), false);
    assert.equal(canEditSchedule(effectiveRole("coordinator", null, "2026-10-31", "2026-10-22")), false);
  });

  it("writes the header inside schedules.data, the same row the web saves", () => {
    const sql = readFileSync(new URL("../supabase/whole.sql", import.meta.url), "utf8");
    assert.match(sql, /create policy "schedules write editors"/);
    assert.match(
      sql,
      /public\.effective_role\(\) in \('super_admin', 'coordinator', 'temp_coordinator'\)/,
    );
    const save = readFileSync(new URL("../mobile/src/lib/supabase.ts", import.meta.url), "utf8");
    assert.match(save, /supabase\.from\(SCHEDULE_TABLE\)\.upsert/);
    assert.match(save, /id:\s*SCHEDULE_ROW_ID/);
    assert.match(save, /data:\s*state/);
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    const redirectAt = editor.indexOf('if (!access.canEdit) return <Redirect href="/(main)/routine" />');
    const buttonAt = editor.indexOf("Header & footer");
    assert.ok(redirectAt > -1);
    assert.ok(buttonAt > redirectAt);
    assert.match(editor, /open-header-footer/);
    assert.doesNotMatch(editor, /Routine header & title/);
    const headerScreen = readFileSync(new URL("../mobile/app/(main)/editor/header-footer.tsx", import.meta.url), "utf8");
    const screenRedirect = headerScreen.indexOf('if (!access.canEdit) return <Redirect href="/(main)/routine" />');
    const headerCard = headerScreen.indexOf("<HeaderEditor />");
    const footerCard = headerScreen.indexOf("<FooterEditor />");
    assert.ok(screenRedirect > -1);
    assert.ok(headerCard > screenRedirect);
    assert.ok(footerCard > headerCard);
    assert.match(headerScreen, /header-footer-back/);
    assert.match(headerScreen, /router\.back\(\)/);
    const stack = readFileSync(new URL("../mobile/app/(main)/editor/_layout.tsx", import.meta.url), "utf8");
    assert.match(stack, /<Stack/);
    const headerEditor = readFileSync(new URL("../mobile/src/HeaderEditor.tsx", import.meta.url), "utf8");
    assert.match(headerEditor, /Routine header & title/);
    assert.match(headerEditor, /type: "set-header-line"/);
    assert.match(headerEditor, /type: "add-header-line"/);
    const routine = readFileSync(new URL("../mobile/app/(main)/routine.tsx", import.meta.url), "utf8");
    assert.match(routine, /testID="routine-header"/);
    assert.match(routine, /useState\(false\)/);
    assert.match(routine, /courseTitleText\(header\)/);
    assert.match(routine, /lines\.map/);
    assert.match(routine, /Signature & footer/);
    assert.match(routine, /formatSlashDate\(day\.date\)/);
    assert.match(routine, /downloadRoutine\(state, day\)/);
    assert.doesNotMatch(routine, /canEdit \?[\s\S]{0,80}<RoutineHeader/);
  });
});
