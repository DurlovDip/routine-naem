import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { createInitialState } from "../mobile/src/lib/demo.ts";
import { footerSigneePatch, signeeFromTeacher } from "../mobile/src/lib/footerDefaults.ts";
import { scheduleReducer } from "../mobile/src/lib/reducer.ts";
import { SIGNATURE_MAX_WIDTH, signaturePixelSize } from "../mobile/src/lib/signature.ts";

function webCanvasSize(width: number, height: number) {
  const scale = Math.min(1, 900 / width);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

describe("signature footer", () => {
  it("sizes a signature the same way the web canvas does", () => {
    assert.equal(SIGNATURE_MAX_WIDTH, 900);
    for (const [width, height] of [
      [1800, 600],
      [400, 200],
      [900, 450],
      [901, 200],
      [1, 1],
      [1800, 1],
    ] as const) {
      assert.deepEqual(signaturePixelSize(width, height), webCanvasSize(width, height));
    }
    assert.deepEqual(signaturePixelSize(1800, 600), { width: 900, height: 300 });
    assert.deepEqual(signaturePixelSize(400, 200), { width: 400, height: 200 });
    assert.deepEqual(signaturePixelSize(0, 0), { width: 1, height: 1 });
  });

  it("stores a data-url signature and rebuilds the designation lines", () => {
    let state = createInitialState();
    state = scheduleReducer(state, {
      type: "set-footer",
      patch: {
        designation: "Director",
        isCourseCoordinator: true,
        courseName: "12th ACSD Training Course",
      },
    });
    assert.deepEqual(state.footer.lines, ["Director & Course Coordinator", "12th ACSD Training Course"]);

    state = scheduleReducer(state, {
      type: "set-footer",
      patch: { isCourseCoordinator: false },
    });
    assert.deepEqual(state.footer.lines, ["Director", "12th ACSD Training Course"]);

    const signature = "data:image/png;base64,iVBORw0KGgo=";
    state = scheduleReducer(state, {
      type: "set-footer",
      patch: { signature, signatureDate: "22.10.26", name: "Course Office" },
    });
    assert.equal(state.footer.signature, signature);
    assert.equal(state.footer.signatureDate, "22.10.26");
    assert.equal(state.footer.name, "Course Office");
    assert.deepEqual(state.footer.lines, ["Director", "12th ACSD Training Course"]);

    state = scheduleReducer(state, { type: "set-footer", patch: { signature: null } });
    assert.equal(state.footer.signature, null);
  });

  it("prefills an empty signee name and does not replace a saved one", () => {
    const blank = createInitialState();
    assert.equal(blank.footer.name, "");
    const filled = footerSigneePatch(blank.footer, {
      name: "Dr. Litan Kanti Halder",
      designation: "Deputy Director",
    });
    assert.deepEqual(filled, {
      name: "Dr. Litan Kanti Halder",
      designation: "Deputy Director",
    });

    const named = scheduleReducer(blank, { type: "set-footer", patch: { name: "Course Office" } });
    assert.equal(
      footerSigneePatch(named.footer, { name: "Dr. Litan Kanti Halder", designation: "Deputy Director" }),
      null,
    );

    const noDesignation = footerSigneePatch(blank.footer, { name: "Dr. Litan Kanti Halder", designation: "" });
    assert.deepEqual(noDesignation, { name: "Dr. Litan Kanti Halder" });

    const chosen = scheduleReducer(blank, {
      type: "set-footer",
      patch: { name: "", designation: "Director" },
    });
    assert.deepEqual(
      footerSigneePatch(chosen.footer, { name: "Dr. Litan Kanti Halder", designation: "Deputy Director" }),
      { name: "Dr. Litan Kanti Halder" },
    );

    const signee = signeeFromTeacher(
      { teacherId: "teacher-17", teacherName: "Dr. Litan Kanti Halder" },
      [{ id: "teacher-17", name: "Dr. Litan Kanti Halder", designation: "Assistant Director" }],
    );
    assert.deepEqual(signee, { name: "Dr. Litan Kanti Halder", designation: "Assistant Director" });
  });

  it("keeps the signature editor behind the editor gate and prints it on the routine and PDF", () => {
    const editor = readFileSync(new URL("../mobile/app/(main)/editor/index.tsx", import.meta.url), "utf8");
    const redirectAt = editor.indexOf('if (!access.canEdit) return <Redirect href="/(main)/routine" />');
    const openAt = editor.indexOf("open-header-footer");
    assert.ok(redirectAt > -1);
    assert.ok(openAt > redirectAt);
    assert.doesNotMatch(editor, /<FooterEditor/);
    const screen = readFileSync(new URL("../mobile/app/(main)/editor/header-footer.tsx", import.meta.url), "utf8");
    assert.ok(screen.indexOf("<FooterEditor />") > screen.indexOf("<HeaderEditor />"));

    const card = readFileSync(new URL("../mobile/src/FooterEditor.tsx", import.meta.url), "utf8");
    assert.match(card, /Signature & footer/);
    assert.match(card, /Upload signature/);
    assert.match(card, /readSignatureFile/);
    assert.match(card, /readSignatureUri/);
    assert.match(card, /launchImageLibraryAsync/);
    assert.match(card, /getDocumentAsync/);
    assert.match(card, /type: "set-footer"/);
    assert.match(card, /No signature/);
    assert.match(card, /Remove/);
    assert.match(card, /Signature date/);
    assert.match(card, /Signee full name/);
    assert.match(card, /Designation dropdown/);
    assert.match(card, /Course Coordinator/);
    assert.match(card, /Course name/);

    const helper = readFileSync(new URL("../mobile/src/lib/signature.ts", import.meta.url), "utf8");
    assert.match(helper, /createImageBitmap/);
    assert.match(helper, /toDataURL\("image\/png"\)/);
    assert.match(helper, /SaveFormat\.PNG/);
    assert.doesNotMatch(helper, /^import .*expo/m);

    const routine = readFileSync(new URL("../mobile/app/(main)/routine.tsx", import.meta.url), "utf8");
    assert.match(routine, /routineCoordinatorLabel/);
    assert.doesNotMatch(routine, /testID="routine-footer"/);
    assert.doesNotMatch(routine, /SignatureBlock/);

    const pdf = readFileSync(new URL("../mobile/src/pdf.ts", import.meta.url), "utf8");
    assert.match(pdf, /class="sign-img"/);
    assert.match(pdf, /class="sign-gap"/);
    assert.match(pdf, /formatSignatureDate\(state\.footer\.signatureDate\)/);
    assert.match(pdf, /state\.footer\.name/);
    assert.match(pdf, /state\.footer\.lines/);

    const manifest = readFileSync(new URL("../mobile/app.json", import.meta.url), "utf8");
    assert.match(manifest, /"version": "1.1.4"/);
    assert.match(manifest, /"versionCode": 14/);
    assert.match(manifest, /READ_MEDIA_IMAGES/);
    assert.match(manifest, /expo-image-picker/);
    assert.doesNotMatch(manifest, /service_role/);
  });
});
