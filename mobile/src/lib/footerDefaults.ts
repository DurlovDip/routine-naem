import type { Footer } from "./types";

/** Designation stored on a brand-new schedule before anyone has chosen one. */
export const STOCK_FOOTER_DESIGNATION = "Assistant Director";

export type Signee = {
  name: string;
  designation?: string;
};

/**
 * Fills an empty signee name from the signed-in teacher, and a missing
 * designation from that teacher's designation. A name that is already stored
 * is left alone, including when the person later clears it during this visit
 * (the caller applies the patch once per loaded schedule).
 */
export function footerSigneePatch(footer: Footer, signee: Signee): Partial<Footer> | null {
  const patch: Partial<Footer> = {};
  const savedName = footer.name.trim();
  const nextName = signee.name.trim();
  if (!savedName && nextName) patch.name = nextName;

  const savedDesignation = (footer.designation ?? "").trim();
  const nextDesignation = (signee.designation ?? "").trim();
  const stockWhileUnsigned = !savedName && savedDesignation === STOCK_FOOTER_DESIGNATION;
  const designationMissing = !savedDesignation || stockWhileUnsigned;
  if (designationMissing && nextDesignation && nextDesignation !== savedDesignation) {
    patch.designation = nextDesignation;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function signeeFromTeacher(
  session: { teacherId: string; teacherName: string },
  teachers: Array<{ id: string; name: string; designation?: string }>,
): Signee {
  const teacher =
    teachers.find((item) => item.id === session.teacherId) ??
    teachers.find((item) => item.name.trim() === session.teacherName.trim());
  return {
    name: session.teacherName.trim(),
    designation: (teacher?.designation ?? "").trim(),
  };
}
