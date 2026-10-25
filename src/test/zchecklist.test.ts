import { describe, it, expect } from "vitest";
import { validateCount, createSession, setStatus, summarize, buildReportText } from "@/lib/zchecklist";

describe("zchecklist rules", () => {
  it("accepts 1000 and rejects 0, decimals, negatives, text", () => {
    expect(validateCount("1000")).toEqual({ ok: true, value: 1000 });
    expect(validateCount("0").ok).toBe(false);
    expect(validateCount("2.5").ok).toBe(false);
    expect(validateCount("-3").ok).toBe(false);
    expect(validateCount("abc").ok).toBe(false);
  });

  it("active excludes deleted and totals stay consistent", () => {
    let s = createSession(50);
    for (const n of [1, 2, 3]) s = setStatus(s, n, "deleted");
    for (let n = 4; n <= 16; n++) s = setStatus(s, n, "done");
    for (let n = 17; n <= 36; n++) s = setStatus(s, n, "not_done");
    const sum = summarize(s);
    expect(sum.active).toBe(47);
    expect(sum.unmarked.length).toBe(14);
    expect(sum.deleted).toEqual([1, 2, 3]);
  });

  it("deleted entries cannot be re-marked", () => {
    let s = createSession(5);
    s = setStatus(s, 2, "deleted");
    s = setStatus(s, 2, "done");
    expect(summarize(s).deleted).toEqual([2]);
  });

  it("completion is 0% when everything deleted", () => {
    let s = createSession(2);
    s = setStatus(setStatus(s, 1, "deleted"), 2, "deleted");
    expect(summarize(s).completion).toBe(0);
    expect(buildReportText(s)).toContain("Completion Percentage: 0%");
  });
});
