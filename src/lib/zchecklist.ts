/* Pure checklist rules shared by the UI, downloads, history and analytics. */

export type StatusCode = "u" | "d" | "n" | "a"; // unmarked, done, not done, absent
export type Category = "classworks" | "homeworks" | "attendance" | "miscellaneous";

export const CATEGORIES: { id: Category; label: string }[] = [
  { id: "classworks", label: "Classworks" },
  { id: "homeworks", label: "Homeworks" },
  { id: "attendance", label: "Attendance" },
  { id: "miscellaneous", label: "Miscellaneous" },
];
export const categoryLabel = (c: Category | string) => CATEGORIES.find((x) => x.id === c)?.label ?? String(c);
export const STATUS_LABEL: Record<StatusCode, string> = { u: "Unmarked", d: "Done", n: "Not Done", a: "Absent" };

export interface Checklist {
  id: string;
  checklist_date: string; // YYYY-MM-DD calendar date, no timezone
  category: Category;
  name: string;
  member_count: number;
  statuses: string; // one StatusCode per member, index 0 = member 1
  version: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export const MAX_MEMBERS = 100;
export const MAX_NAME = 100;

type V<T> = { ok: true; value: T } | { ok: false; error: string };

export function validateCount(raw: string): V<number> {
  const s = raw.trim();
  if (!s) return { ok: false, error: "Please enter the number of members." };
  if (!/^\d+$/.test(s)) return { ok: false, error: "Please enter a positive whole number (no decimals or symbols)." };
  const v = Number(s);
  if (v < 1) return { ok: false, error: "The number of members must be at least 1." };
  if (v > MAX_MEMBERS) return { ok: false, error: `The maximum is ${MAX_MEMBERS} members.` };
  return { ok: true, value: v };
}

export function validateChecklistName(raw: string): V<string> {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return { ok: false, error: "Please give your checklist a name." };
  if (s.length > MAX_NAME) return { ok: false, error: `Please keep the name to ${MAX_NAME} characters or fewer.` };
  return { ok: true, value: s };
}

export const normalizeUsername = (raw: string) => raw.trim().toLowerCase();
export function validateUsername(raw: string): V<string> {
  const u = normalizeUsername(raw);
  if (!u) return { ok: false, error: "Please enter a username." };
  if (!/^[a-z0-9_]{3,24}$/.test(u)) return { ok: false, error: "Use 3–24 letters, numbers or underscores." };
  return { ok: true, value: u };
}
export function validateDisplayName(raw: string): V<string> {
  const s = raw.trim().replace(/\s+/g, " ");
  if (!s) return { ok: false, error: "Please enter your name." };
  if (s.length > 80) return { ok: false, error: "Please keep your name to 80 characters or fewer." };
  return { ok: true, value: s };
}
export function validatePassword(raw: string): V<string> {
  if (raw.length < 8) return { ok: false, error: "Password must be at least 8 characters." };
  if (raw.length > 72) return { ok: false, error: "Password must be 72 characters or fewer." };
  if (!/[A-Za-z]/.test(raw) || !/\d/.test(raw)) return { ok: false, error: "Use at least one letter and one number." };
  return { ok: true, value: raw };
}
/** Username accounts use an internal, non-deliverable sign-in address. */
export const usernameToEmail = (u: string) => `${normalizeUsername(u)}@users.zchecklist.app`;

export const blankStatuses = (n: number) => "u".repeat(n);
export function setStatusAt(statuses: string, member: number, s: StatusCode): string {
  const i = member - 1;
  if (i < 0 || i >= statuses.length) return statuses;
  return statuses.slice(0, i) + s + statuses.slice(i + 1);
}

export interface Summary {
  total: number;
  done: number[];
  notDone: number[];
  absent: number[];
  unmarked: number[];
  donePct: number; // done / total
  markedPct: number; // (done + not done + absent) / total
}
export function summarize(statuses: string): Summary {
  const done: number[] = [], notDone: number[] = [], absent: number[] = [], unmarked: number[] = [];
  for (let i = 0; i < statuses.length; i++) {
    const c = statuses[i];
    (c === "d" ? done : c === "n" ? notDone : c === "a" ? absent : unmarked).push(i + 1);
  }
  const total = statuses.length;
  return {
    total, done, notDone, absent, unmarked,
    donePct: total ? (done.length / total) * 100 : 0,
    markedPct: total ? ((total - unmarked.length) / total) * 100 : 0,
  };
}

export const pct = (part: number, whole: number) =>
  whole === 0 ? "0%" : `${((part / whole) * 100).toFixed(1).replace(/\.0$/, "")}%`;

/* ---------- dates (calendar dates are plain YYYY-MM-DD strings) ---------- */
const two = (n: number) => String(n).padStart(2, "0");
export const toISODate = (y: number, m: number, d: number) => `${y}-${two(m)}-${two(d)}`;
export function isValidISODate(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}
/** Parses DD/MM/YY (or DD/MM/YYYY) into YYYY-MM-DD. Two-digit years are 2000–2099. */
export function parseDDMMYY(raw: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(raw.trim());
  if (!m) return null;
  const ys = m[3] ?? "";
  const y = ys.length === 2 ? 2000 + Number(ys) : Number(ys);
  const iso = toISODate(y, Number(m[2]), Number(m[1]));
  return isValidISODate(iso) ? iso : null;
}
export function formatDDMMYY(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${(y ?? "").slice(2)}`;
}
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthKey = (iso: string) => iso.slice(0, 7);
export const monthLabel = (key: string) => `${MONTHS[+key.slice(5, 7) - 1]} ${key.slice(0, 4)}`;
export function longDate(iso: string) {
  const [y = 0, m = 1, d = 1] = iso.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", { weekday: "long", timeZone: "UTC" });
  return `${wd}, ${d} ${MONTHS[m - 1]} ${y}`;
}
export const fmtStamp = (t: string | number | Date) =>
  new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

/* ---------- history grouping ---------- */
export interface MonthGroup { key: string; label: string; dates: { date: string; items: Checklist[] }[] }
export function groupHistory(items: Checklist[]): MonthGroup[] {
  const months = new Map<string, Map<string, Checklist[]>>();
  for (const c of items) {
    const mk = monthKey(c.checklist_date);
    if (!months.has(mk)) months.set(mk, new Map());
    const dm = months.get(mk)!;
    if (!dm.has(c.checklist_date)) dm.set(c.checklist_date, []);
    dm.get(c.checklist_date)!.push(c);
  }
  return [...months.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, dm]) => ({
      key, label: monthLabel(key),
      dates: [...dm.entries()]
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([date, list]) => ({ date, items: list.sort((x, y) => y.created_at.localeCompare(x.created_at)) })),
    }));
}

/* ---------- downloads text ---------- */
export function fileBase(name: string, iso: string) {
  const safe = name.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/[\s-]+/g, "_").slice(0, 60) || "Checklist";
  return `ZChecklist_${safe}_${iso}`;
}

const list = (a: number[]) => (a.length ? a.join(", ") : "(None)");
const center = (s: string, w = 50) => " ".repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s;

export function buildReportText(c: Checklist, generated: Date = new Date()): string {
  const s = summarize(c.statuses);
  const bar = "=".repeat(50);
  return [
    bar, center("ZCHECKLIST"), center("CHECKLIST REPORT"), bar, "",
    `Checklist Name: ${c.name}`,
    `Checklist Date: ${formatDDMMYY(c.checklist_date)} (${longDate(c.checklist_date)})`,
    `Category: ${categoryLabel(c.category)}`, "",
    `Created: ${fmtStamp(c.created_at)}`,
    `Last Updated: ${fmtStamp(c.updated_at)}`,
    `Completed: ${c.completed_at ? fmtStamp(c.completed_at) : "Not completed"}`,
    `Report Generated: ${fmtStamp(generated)}`, "",
    `TOTAL MEMBERS: ${s.total}`, "",
    "------------------ SUMMARY -----------------------", "",
    `DONE: ${s.done.length}`, list(s.done), "",
    `NOT DONE: ${s.notDone.length}`, list(s.notDone), "",
    `ABSENT: ${s.absent.length}`, list(s.absent), "",
    `UNMARKED: ${s.unmarked.length}`, list(s.unmarked), "",
    "------------------ STATISTICS --------------------", "",
    `Done Percentage: ${pct(s.done.length, s.total)} (done / total members)`,
    `Marked Percentage: ${pct(s.total - s.unmarked.length, s.total)} (done + not done + absent / total members)`,
    `Not Done Percentage: ${pct(s.notDone.length, s.total)}`,
    `Absent Percentage: ${pct(s.absent.length, s.total)}`,
    `Unmarked Percentage: ${pct(s.unmarked.length, s.total)}`, "",
    bar, center("END OF ZCHECKLIST REPORT"), bar, "",
  ].join("\n");
}

/* ---------- legacy (pre-account) browser session ---------- */
export const LEGACY_KEY = "zchecklist_session_v1";
export function readLegacy(): { statuses: string; total: number } | null {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { total?: number; entries?: { status: string }[] };
    if (!p || !Array.isArray(p.entries) || typeof p.total !== "number" || p.entries.length !== p.total) return null;
    if (p.total < 1 || p.total > MAX_MEMBERS) return null;
    const map: Record<string, StatusCode> = { done: "d", not_done: "n", deleted: "a", unmarked: "u" };
    return { total: p.total, statuses: p.entries.map((e) => map[e.status] ?? "u").join("") };
  } catch {
    return null;
  }
}
