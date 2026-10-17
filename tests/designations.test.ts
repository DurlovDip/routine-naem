import { describe, expect, it } from "vitest";
import { builtinDesignations, designationChoices, isMissingDesignationsTable } from "../src/lib/designations";

describe("designation choices", () => {
  it("keeps the built-in titles and appends a teacher value that is not listed", () => {
    const names = designationChoices(
      builtinDesignations().map((row) => row.name),
      ["Deputy Director", "Course Director"],
    );
    expect(names.slice(0, 3)).toEqual(["Director General", "Director", "Deputy Director"]);
    expect(names).toContain("Guest Speaker");
    expect(names).toContain("Course Director");
    expect(names.filter((name) => name === "Deputy Director")).toHaveLength(1);
  });

  it("treats a missing designations table as a reason to use the built-in list", () => {
    expect(isMissingDesignationsTable("Could not find the table 'public.designations' in the schema cache")).toBe(true);
    expect(isMissingDesignationsTable("Only a super admin can edit designations")).toBe(false);
  });
});
