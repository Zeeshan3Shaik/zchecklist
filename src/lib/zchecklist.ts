export type EntryStatus = "unmarked" | "done" | "not_done" | "deleted";
export type Stage = "checklist" | "report";

export interface Entry {
  n: number;
  status: EntryStatus;
  updatedAt?: number;
}

export interface Session {
  version: 1;
  id: string;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  total: number;
  entries: Entry[];
  stage: Stage;
}

export const STORAGE_KEY = "zchecklist_session_v1";
export const MAX_MEMBERS = 100000;

export function validateCount(raw: string): { ok: true; value: number } | { ok: false; error: string } {
  const s = raw.trim();
  if (!s) return { ok: false, error: "Please enter the number of members." };
  if (!/^\d+$/.test(s)) return { ok: false, error: "Please enter a positive whole number (no decimals or symbols)." };
  const v = Number(s);
  if (v < 1) return { ok: false, error: "The number of members must be at least 1." };
  if (v > MAX_MEMBERS) return { ok: false, error: `Please enter ${MAX_MEMBERS.toLocaleString()} or fewer members.` };
  return { ok: true, value: v };
}

export function createSession(total: number): Session {
  const now = Date.now();
  const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `s-${now}-${Math.random().toString(36).slice(2)}`;
  return {
    version: 1,
    id,
    createdAt: now,
    updatedAt: now,
    total,
    entries: Array.from({ length: total }, (_, i) => ({ n: i + 1, status: "unmarked" as const })),
    stage: "checklist",
  };
}

export function setStatus(session: Session, n: number, status: EntryStatus): Session {
  const idx = n - 1;
  const cur = session.entries[idx];
  if (!cur || cur.status === "deleted" || cur.status === status) return session;
  const now = Date.now();
  const entries = session.entries.slice();
  entries[idx] = { n, status, updatedAt: now };
  return { ...session, entries, updatedAt: now };
}

export interface Summary {
  total: number;
  active: number;
  done: number[];
  notDone: number[];
  deleted: number[];
  unmarked: number[];
  completion: number;
}

export function summarize(session: Session): Summary {
  const done: number[] = [], notDone: number[] = [], deleted: number[] = [], unmarked: number[] = [];
  for (const e of session.entries) {
    if (e.status === "done") done.push(e.n);
    else if (e.status === "not_done") notDone.push(e.n);
    else if (e.status === "deleted") deleted.push(e.n);
    else unmarked.push(e.n);
  }
  const active = done.length + notDone.length + unmarked.length;
  return {
    total: session.total,
    active,
    done, notDone, deleted, unmarked,
    completion: active === 0 ? 0 : (done.length / active) * 100,
  };
}

export const pct = (part: number, whole: number) => (whole === 0 ? "0%" : `${((part / whole) * 100).toFixed(1).replace(/\.0$/, "")}%`);

function isValidSession(x: unknown): x is Session {
  if (!x || typeof x !== "object") return false;
  const s = x as Session;
  return (
    s.version === 1 && typeof s.id === "string" && typeof s.total === "number" && Array.isArray(s.entries) &&
    s.entries.length === s.total && (s.stage === "checklist" || s.stage === "report") &&
    s.entries.every((e, i) => e && e.n === i + 1 && ["unmarked", "done", "not_done", "deleted"].includes(e.status))
  );
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

const two = (n: number) => String(n).padStart(2, "0");
export function fileStamp(d: Date) {
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`;
}
export const fmtDate = (t: number) =>
  new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

const list = (a: number[]) => (a.length ? a.join(", ") : "(None)");
const center = (s: string, w = 50) => " ".repeat(Math.max(0, Math.floor((w - s.length) / 2))) + s;

export function buildReportText(session: Session, generated: Date = new Date()): string {
  const s = summarize(session);
  const bar = "=".repeat(50);
  return [
    bar, center("ZCHECKLIST"), center("CHECKLIST REPORT"), bar, "",
    `Report Generated: ${generated.toLocaleString()}`,
    `Session Started: ${new Date(session.createdAt).toLocaleString()}`, "",
    `ORIGINAL TOTAL ENTRIES: ${s.total}`,
    `ACTIVE ENTRIES: ${s.active}`, "",
    "------------------ SUMMARY -----------------------", "",
    `DONE: ${s.done.length}`, list(s.done), "",
    `NOT DONE: ${s.notDone.length}`, list(s.notDone), "",
    `DELETED: ${s.deleted.length}`, list(s.deleted), "",
    `UNMARKED: ${s.unmarked.length}`, list(s.unmarked), "",
    "------------------ STATISTICS --------------------", "",
    `Completion Percentage: ${pct(s.done.length, s.active)} (done / active entries)`,
    `Done Percentage: ${pct(s.done.length, s.active)}`,
    `Not Done Percentage: ${pct(s.notDone.length, s.active)}`,
    `Deleted Entries: ${s.deleted.length}`,
    `Unmarked Entries: ${s.unmarked.length}`, "",
    bar, center("END OF ZCHECKLIST REPORT"), bar, "",
  ].join("\n");
}

export function downloadReport(session: Session) {
  const now = new Date();
  const blob = new Blob([buildReportText(session, now)], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `ZChecklist_Report_${fileStamp(now)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
