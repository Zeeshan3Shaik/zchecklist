import { describe, it, expect } from "vitest";
import {
  validateCount, validateUsername, validatePassword, parseDDMMYY, formatDDMMYY,
  setStatusAt, summarize, buildReportText, groupHistory, blankStatuses, type Checklist,
} from "@/lib/zchecklist";

const mk = (over: Partial<Checklist>): Checklist => ({
  id: "x", checklist_date: "2026-10-30", category: "classworks", name: "Test",
  member_count: 5, statuses: "uuuuu", version: 1,
  created_at: "2026-10-30T08:00:00Z", updated_at: "2026-10-30T08:00:00Z", completed_at: null,
  ...over,
});

describe("zchecklist rules", () => {
  it("accepts 1–100 members and rejects 0, 101, decimals, negatives, text", () => {
    expect(validateCount("1")).toEqual({ ok: true, value: 1 });
    expect(validateCount("100")).toEqual({ ok: true, value: 100 });
    expect(validateCount("101").ok).toBe(false);
    expect(validateCount("0").ok).toBe(false);
    expect(validateCount("2.5").ok).toBe(false);
    expect(validateCount("-3").ok).toBe(false);
    expect(validateCount("abc").ok).toBe(false);
  });

  it("marks statuses by member number and summarizes each bucket", () => {
    let s = blankStatuses(5);
    s = setStatusAt(s, 1, "d");
    s = setStatusAt(s, 2, "d");
    s = setStatusAt(s, 3, "n");
    s = setStatusAt(s, 5, "a");
    const sum = summarize(s);
    expect(sum.done).toEqual([1, 2]);
    expect(sum.notDone).toEqual([3]);
    expect(sum.absent).toEqual([5]);
    expect(sum.unmarked).toEqual([4]);
    expect(sum.total).toBe(5);
  });

  it("out-of-range member numbers leave statuses unchanged", () => {
    expect(setStatusAt("uuu", 0, "d")).toBe("uuu");
    expect(setStatusAt("uuu", 4, "d")).toBe("uuu");
  });

  it("parses DD/MM/YY and rejects impossible dates", () => {
    expect(parseDDMMYY("30/10/26")).toBe("2026-10-30");
    expect(parseDDMMYY("1/1/2026")).toBe("2026-01-01");
    expect(parseDDMMYY("31/02/26")).toBeNull();
    expect(parseDDMMYY("10-10-26")).toBeNull();
    expect(formatDDMMYY("2026-10-30")).toBe("30/10/26");
  });

  it("enforces username and password rules", () => {
    expect(validateUsername("Zeeshan_S")).toEqual({ ok: true, value: "zeeshan_s" });
    expect(validateUsername("ab").ok).toBe(false);
    expect(validateUsername("has space").ok).toBe(false);
    expect(validatePassword("passw0rd").ok).toBe(true);
    expect(validatePassword("short1").ok).toBe(false);
    expect(validatePassword("nodigitshere").ok).toBe(false);
  });

  it("report text matches the summary counts and percentages", () => {
    const c = mk({ statuses: "ddnau", name: "Morning class" });
    const text = buildReportText(c, new Date("2026-10-30T10:00:00Z"));
    expect(text).toContain("DONE: 2");
    expect(text).toContain("NOT DONE: 1");
    expect(text).toContain("ABSENT: 1");
    expect(text).toContain("UNMARKED: 1");
    expect(text).toContain("Done Percentage: 40%");
    expect(text).toContain("Marked Percentage: 80%");
  });

  it("groups history by month, newest first", () => {
    const groups = groupHistory([
      mk({ id: "a", checklist_date: "2026-09-02" }),
      mk({ id: "b", checklist_date: "2026-10-30" }),
      mk({ id: "c", checklist_date: "2026-10-01" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["October 2026", "September 2026"]);
    expect(groups[0]?.dates.map((d) => d.date)).toEqual(["2026-10-30", "2026-10-01"]);
  });
});
