import type { Footer } from "./types";

/** Designation stored on a brand-new schedule before anyone has chosen one. */
export const STOCK_FOOTER_DESIGNATION = "Assistant Director";

export type Signee = {
  name: string;
  designation?: string;
  signature?: string | null;
  courseName?: string;
  signatureDate?: string;
};

/**
 * Fills an empty signee name from the signed-in teacher, missing designation,
 * course name from the course created by superadmin, published/last-modified date,
 * and signature from profile.
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

  if (signee.courseName && signee.courseName !== footer.courseName) {
    patch.courseName = signee.courseName;
  }

  if (signee.signatureDate && signee.signatureDate !== footer.signatureDate) {
    patch.signatureDate = signee.signatureDate;
  }

  if (!footer.signature && signee.signature) {
    patch.signature = signee.signature;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

export function signeeFromTeacher(
  session: { teacherId: string; teacherName: string },
  teachers: Array<{ id: string; name: string; designation?: string }>,
  extras?: {
    signature?: string | null;
    courseName?: string;
    signatureDate?: string;
  },
): Signee {
  const teacher =
    teachers.find((item) => item.id === session.teacherId) ??
    teachers.find((item) => item.name.trim() === session.teacherName.trim());
  const result: Signee = {
    name: session.teacherName.trim(),
    designation: (teacher?.designation ?? "").trim(),
  };
  if (extras?.signature !== undefined) result.signature = extras.signature;
  if (extras?.courseName !== undefined) result.courseName = extras.courseName;
  if (extras?.signatureDate !== undefined) result.signatureDate = extras.signatureDate;
  return result;
}
