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

  it("deduplicates options and ensures at most one clear row is produced", () => {
    const rawOptions = ["", "Professor", "Lecturer", "Professor", ""];
    const clean = rawOptions.map((opt) => (typeof opt === "string" ? opt.trim() : "")).filter(Boolean);
    const unique = clean.filter((option, index) => clean.indexOf(option) === index);
    const rowsWithEmpty = ["", ...unique];
    expect(rowsWithEmpty.filter((r) => r === "")).toHaveLength(1);
    expect(unique).toEqual(["Professor", "Lecturer"]);
  });
});
