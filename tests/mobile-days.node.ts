import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayWhen, todayInDhaka } from "../mobile/src/lib/time.ts";

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
});
