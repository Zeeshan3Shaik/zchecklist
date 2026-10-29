import { type Category, type Checklist, summarize } from "./zchecklist";

export interface Totals { obs: number; done: number; notDone: number; absent: number; unmarked: number }
const zero = (): Totals => ({ obs: 0, done: 0, notDone: 0, absent: 0, unmarked: 0 });
function add(t: Totals, statuses: string) {
  const s = summarize(statuses);
  t.obs += s.total; t.done += s.done.length; t.notDone += s.notDone.length; t.absent += s.absent.length; t.unmarked += s.unmarked.length;
}
export const rate = (n: number, d: number) => (d === 0 ? null : (n / d) * 100);

export interface MemberRank { member: number; numerator: number; denominator: number; reports: number; rate: number }
export interface Improved { member: number; baseline: number; later: number; change: number; baseN: number; laterN: number }

export interface AnalyticsResult {
  reports: number;
  dates: number;
  totals: Totals;
  byCategory: { category: Category; reports: number; totals: Totals }[];
  trend: { date: string; obs: number; done: number; absent: number; doneRate: number | null }[];
  attendanceTrend: { date: string; present: number; absent: number }[];
  mostConsistent: MemberRank[];
  leastConsistent: MemberRank[];
  mostAbsent: MemberRank[];
  mostImproved: Improved[];
  minObs: number;
  improvementNote: string | null;
}

export const MIN_OBS = 2;

/**
 * Aggregates the given reports. Every member in every report is a separate observation.
 * Rankings compare matching roll numbers across the selected reports only.
 * Consistency = done / (done + not done); absent and unmarked are not eligible.
 */
export function computeAnalytics(items: Checklist[], cats: Category[]): AnalyticsResult {
  const reports = items.filter((c) => cats.includes(c.category));
  const totals = zero();
  const catMap = new Map<Category, { reports: number; totals: Totals }>();
  const dateMap = new Map<string, Totals & { attPresent: number; attAbsent: number; hasAtt: boolean }>();
  const perMember = new Map<number, { d: number; e: number; reports: number }>();
  const attMember = new Map<number, { a: number; e: number; reports: number }>();

  for (const c of reports) {
    add(totals, c.statuses);
    const cm = catMap.get(c.category) ?? { reports: 0, totals: zero() };
    cm.reports++; add(cm.totals, c.statuses); catMap.set(c.category, cm);
    const dm = dateMap.get(c.checklist_date) ?? { ...zero(), attPresent: 0, attAbsent: 0, hasAtt: false };
    add(dm, c.statuses);
    for (let i = 0; i < c.statuses.length; i++) {
      const s = c.statuses[i], m = i + 1;
      if (s === "d" || s === "n") {
        const pm = perMember.get(m) ?? { d: 0, e: 0, reports: 0 };
        pm.e++; if (s === "d") pm.d++; pm.reports++; perMember.set(m, pm);
      }
      if (c.category === "attendance" && s !== "u") {
        const am = attMember.get(m) ?? { a: 0, e: 0, reports: 0 };
        am.e++; if (s === "a") am.a++; am.reports++; attMember.set(m, am);
        dm.hasAtt = true;
        if (s === "a") dm.attAbsent++; else dm.attPresent++;
      }
    }
    dateMap.set(c.checklist_date, dm);
  }

  const dates = [...dateMap.keys()].sort();
  const ranks: MemberRank[] = [...perMember.entries()]
    .filter(([, v]) => v.e >= MIN_OBS)
    .map(([member, v]) => ({ member, numerator: v.d, denominator: v.e, reports: v.reports, rate: (v.d / v.e) * 100 }));
  const mostConsistent = [...ranks].sort((a, b) => b.rate - a.rate || b.denominator - a.denominator || a.member - b.member).slice(0, 10);
  const leastConsistent = [...ranks].sort((a, b) => a.rate - b.rate || b.denominator - a.denominator || a.member - b.member).slice(0, 10);
  const mostAbsent = [...attMember.entries()]
    .filter(([, v]) => v.e >= MIN_OBS && v.a > 0)
    .map(([member, v]) => ({ member, numerator: v.a, denominator: v.e, reports: v.reports, rate: (v.a / v.e) * 100 }))
    .sort((a, b) => b.rate - a.rate || b.denominator - a.denominator || a.member - b.member)
    .slice(0, 10);

  // Improvement: compare the earlier half of the available dates with the later half.
  let mostImproved: Improved[] = [];
  let improvementNote: string | null = null;
  if (dates.length < 2) {
    improvementNote = "Improvement needs reports on at least two different dates.";
  } else {
    const cut = dates[Math.floor(dates.length / 2) - 1];
    const early = new Map<number, [number, number]>(), late = new Map<number, [number, number]>();
    for (const c of reports) {
      const bucket = c.checklist_date <= cut ? early : late;
      for (let i = 0; i < c.statuses.length; i++) {
        const s = c.statuses[i];
        if (s !== "d" && s !== "n") continue;
        const v = bucket.get(i + 1) ?? [0, 0];
        v[1]++; if (s === "d") v[0]++; bucket.set(i + 1, v);
      }
    }
    mostImproved = [...early.entries()]
      .filter(([m]) => late.has(m))
      .map(([member, [bd, be]]) => {
        const [ld, le] = late.get(member)!;
        const baseline = (bd / be) * 100, later = (ld / le) * 100;
        return { member, baseline, later, change: later - baseline, baseN: be, laterN: le };
      })
      .filter((x) => x.change > 0)
      .sort((a, b) => b.change - a.change || a.member - b.member)
      .slice(0, 10);
    if (!mostImproved.length) improvementNote = "No member's Done rate rose between the earlier and later dates.";
  }

  return {
    reports: reports.length,
    dates: dates.length,
    totals,
    byCategory: cats.filter((c) => catMap.has(c)).map((category) => ({ category, ...catMap.get(category)! })),
    trend: dates.map((date) => {
      const t = dateMap.get(date)!;
      return { date, obs: t.obs, done: t.done, absent: t.absent, doneRate: rate(t.done, t.obs) };
    }),
    attendanceTrend: dates.filter((d) => dateMap.get(d)!.hasAtt).map((date) => ({ date, present: dateMap.get(date)!.attPresent, absent: dateMap.get(date)!.attAbsent })),
    mostConsistent, leastConsistent, mostAbsent, mostImproved, minObs: MIN_OBS, improvementNote,
  };
}
