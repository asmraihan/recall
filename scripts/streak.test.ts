import assert from "node:assert/strict";
import { test } from "node:test";
import { streakSummary } from "../src/lib/streak";

const now = new Date("2026-09-27T12:00:00Z");
const dates = (...days: number[]) => days.map((day) => new Date(`2026-09-${day}T18:00:00Z`));
test("a missed day breaks the streak even when today is completed", () => {
  assert.equal(streakSummary(dates(27, 25, 24), now).streak, 1);
});
test("today preserves streak until the end of tomorrow", () => {
  const result = streakSummary(dates(27, 27, 26, 25), now);
  assert.equal(result.streak, 3);
  assert.equal(result.streakResetsAt, Date.parse("2026-09-29T00:00:00Z"));
  assert.equal(result.dayEndsAt, Date.parse("2026-09-28T00:00:00Z"));
});
test("yesterday's streak expires at upcoming UTC midnight", () => {
  const result = streakSummary(dates(26, 25), now);
  assert.equal(result.streak, 2);
  assert.equal(result.streakResetsAt, Date.parse("2026-09-28T00:00:00Z"));
});
test("expired and absent streaks have no reset countdown", () => {
  assert.equal(streakSummary(dates(25, 24), now).streak, 0);
  assert.equal(streakSummary([], now).streakResetsAt, null);
});
test("day boundaries do not depend on device timezone or daylight saving", () => {
  const result = streakSummary([new Date("2026-10-25T00:30:00Z")], new Date("2026-10-25T23:30:00Z"));
  assert.equal(result.streak, 1);
  assert.equal(result.streakResetsAt, Date.parse("2026-10-27T00:00:00Z"));
});
