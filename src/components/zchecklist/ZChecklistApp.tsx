import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button as DesignButton, type ButtonProps } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { AccountAuth, ProfileScreen } from "./AccountScreens";
import { buildWorkbook } from "@/lib/workbook";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  AlertTriangle, BarChart3, Check, CheckCheck, ChevronDown, CircleDashed, Download, FileSpreadsheet,
  History, Home as HomeIcon, UserRound, CalendarDays, BookOpen, GraduationCap, Layers, LogOut, Pencil, Plus, Trash2, UserX, X,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import {
  CATEGORIES, blankStatuses, buildReportText, categoryLabel, fileBase, formatDDMMYY, groupHistory,
  longDate, monthLabel, parseDDMMYY, pct, readLegacy, setStatusAt, summarize, toISODate, validateChecklistName,
  validateCount, validateDisplayName, validatePassword, validateUsername, usernameToEmail,
  type Category, type Checklist, type StatusCode,
} from "@/lib/zchecklist";
import {
  ConflictError, createChecklist, deleteChecklist, fetchProfile, getChecklist, listChecklists, updateChecklist,
} from "@/lib/api";
import { computeAnalytics } from "@/lib/analytics";

type Screen = "welcome" | "auth" | "home" | "setup" | "checklist" | "report" | "history" | "analytics" | "profile";
type Prompt =
  | null
  | "unmarked"
  | "signOut"
  | { kind: "delete"; item: Checklist };

const GREETINGS = ["Hello", "こんにちは", "नमस्ते", "Bonjour", "Ciao", "你好", "안녕하세요", "Guten Morgen", "Olá", "Hola"];

const todayISO = () => {
  const n = new Date();
  return toISODate(n.getFullYear(), n.getMonth() + 1, n.getDate());
};

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function downloadTxt(c: Checklist) {
  saveBlob(new Blob([buildReportText(c)], { type: "text/plain;charset=utf-8" }), `${fileBase(c.name, c.checklist_date)}.txt`);
}

async function downloadExcel(c: Checklist) {
  const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 400;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Chart unavailable");
  const styles = getComputedStyle(document.documentElement), s = summarize(c.statuses);
  ctx.fillStyle = styles.getPropertyValue("--background"); ctx.fillRect(0, 0, 800, 400);
  const groups = [["Done", s.done.length, "--done"], ["Not Done", s.notDone.length, "--notdone"], ["Absent", s.absent.length, "--ink"], ["Unmarked", s.unmarked.length, "--amber"]] as const;
  groups.forEach(([label, value, token], i) => {
    const x = 60 + i * 185, height = value / s.total * 270;
    ctx.fillStyle = styles.getPropertyValue(token); ctx.fillRect(x, 320 - height, 110, height);
    ctx.fillStyle = styles.getPropertyValue("--foreground"); ctx.font = "20px sans-serif";
    ctx.fillText(`${label}: ${value}`, x, 355);
  });
  const wb = await buildWorkbook(c, canvas.toDataURL("image/png"));
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([new Uint8Array(buf)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${fileBase(c.name, c.checklist_date)}.xlsx`);
}

/* ---------------- shared bits ---------------- */
function Button(props: ButtonProps) { return <DesignButton variant="glass" size="natural" {...props} />; }

function Brand({ onClick }: { onClick: () => void }) {
  return (
    <Button onClick={onClick} className="select-none text-xl font-extrabold sm:text-2xl" aria-label="ZChecklist Home">
      <span className="text-brand-z">Z</span>
      <span className="text-brand-word">Checklist</span>
    </Button>
  );
}

function Dialog({ title, children, onClose, icon }: { title: string; children: ReactNode; onClose?: () => void; icon?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-foreground/25 p-4" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlg-title"
        onClick={(e) => e.stopPropagation()}
        className="glass anim-pop w-full max-w-md rounded-[28px] p-6 sm:p-8"
      >
        {icon && <div className="mb-4">{icon}</div>}
        <h2 id="dlg-title" className="text-2xl font-bold tracking-normal text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-50";
const btnGhost = `${btn} glass text-foreground hover:brightness-100 hover:bg-secondary`;
const inputCls = "w-full rounded-2xl border border-glass-border bg-card px-4 py-3 text-base font-medium text-foreground outline-none transition focus:ring-4 focus:ring-ring/30";

function Field({ label, error, children, htmlFor }: { label: string; error?: string | null | undefined; children: ReactNode; htmlFor?: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold text-foreground">{label}</label>
      {children}
      <p role="alert" className={`mt-1.5 min-h-5 text-sm font-medium text-notdone-ink transition-opacity ${error ? "opacity-100" : "opacity-0"}`}>
        {error}
      </p>
    </div>
  );
}

/* ---------------- Welcome ---------------- */
function Welcome({ onContinue }: { onContinue: () => void }) {
  const [i, setI] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (leaving) return;
    const t = setInterval(() => setI((x) => (x + 1) % GREETINGS.length), 3000);
    return () => clearInterval(t);
  }, [leaving]);
  const go = () => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(onContinue, 320);
  };
  return (
    <Button
      type="button"
      onClick={go}
      aria-label="Welcome. Click anywhere to continue"
      className={`flex min-h-[calc(100vh-88px)] w-full flex-col items-center justify-center gap-10 transition-all duration-300 focus-visible:outline-none ${leaving ? "scale-95 opacity-0 blur-sm" : ""}`}
    >
      <div className="flex h-32 items-center justify-center sm:h-44" aria-live="polite">
        <h1 key={i} className="anim-rise text-6xl font-extrabold tracking-normal text-foreground sm:text-8xl lg:text-9xl">
          {GREETINGS[i]}
        </h1>
      </div>
      <p className="animate-pulse text-sm font-medium tracking-wide text-muted-foreground">Click anywhere to continue</p>
    </Button>
  );
}

/* ---------------- Auth ---------------- */
/* ---------------- Home ---------------- */
function Home({ name, items, onNew, onHistory, onAnalytics, onImportLegacy }: {
  name: string;
  items: Checklist[];
  onNew: (date: string) => void;
  onHistory: () => void;
  onAnalytics: () => void;
  onImportLegacy: () => void;
}) {
  const legacy = useMemo(() => readLegacy(), []);
  const [date, setDate] = useState("");
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-20 sm:px-6">
      <div className="anim-rise pt-6 sm:pt-10">
        <h1 className="text-4xl font-extrabold greeting-glass sm:text-6xl">Hello, {name}</h1>
        <div className="mt-7 max-w-sm"><DatePicker value={date} onChange={setDate} /><Button disabled={!date} onClick={() => onNew(date)} className={`${btn} btn-blue mt-3 w-full`}>Continue</Button></div>
      </div>

      {legacy && items.length === 0 && (
        <div className="anim-rise glass mt-8 flex flex-col items-start justify-between gap-4 rounded-[24px] p-5 sm:flex-row sm:items-center">
          <p className="text-sm font-medium text-foreground">
            We found a checklist with {legacy.total} members saved on this device. Import it into your account?
          </p>
          <Button onClick={onImportLegacy} className={`${btn} btn-blue shrink-0`}>Import It</Button>
        </div>
      )}

      <div className="home-frame relative mt-8 grid gap-4 pb-8 sm:grid-cols-3">
        <Button onClick={() => { if (date) onNew(date); else toast.error("Select a date first."); }} className="glass anim-rise group flex flex-col items-start gap-6 rounded-[28px] px-6 py-9 text-left transition hover:-translate-y-1 hover:shadow-lg" style={{ animationDelay: "80ms" }}>
          <span className="btn-blue flex h-12 w-12 items-center justify-center rounded-2xl"><Plus className="h-6 w-6" strokeWidth={2.5} /></span>
          <span>
            <span className="block text-xl font-bold text-foreground">New Checklist</span>
            <span className="mt-1 block text-sm text-muted-foreground"></span>
          </span>
        </Button>
        <Button onClick={onHistory} className="glass anim-rise group flex flex-col items-start gap-6 rounded-[28px] px-6 py-9 text-left transition hover:-translate-y-1 hover:shadow-lg" style={{ animationDelay: "160ms" }}>
          <span className="btn-ink flex h-12 w-12 items-center justify-center rounded-2xl"><History className="h-6 w-6" /></span>
          <span>
            <span className="block text-xl font-bold text-foreground">History</span>
            <span className="mt-1 block text-sm text-muted-foreground">{items.length === 0 ? "No saved checklists yet" : `${items.length} saved ${items.length === 1 ? "checklist" : "checklists"}`}</span>
          </span>
        </Button>
        <Button onClick={onAnalytics} className="glass anim-rise group flex flex-col items-start gap-6 rounded-[28px] px-6 py-9 text-left transition hover:-translate-y-1 hover:shadow-lg" style={{ animationDelay: "240ms" }}>
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-done-soft text-done-ink"><BarChart3 className="h-6 w-6" /></span>
          <span>
            <span className="block text-xl font-bold text-foreground">Analytics</span>
            <span className="mt-1 block text-sm text-muted-foreground">Trends and member insights</span>
          </span>
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Setup ---------------- */
function DatePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Date | undefined>();
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button className={`${inputCls} justify-between`} aria-label="Choose date"><span>{value ? formatDDMMYY(value) : "DD/MM/YY"}</span><CalendarDays className="h-5 w-5" /></Button></PopoverTrigger><PopoverContent className="glass w-auto rounded-2xl p-3"><Calendar mode="single" selected={selected} onSelect={setSelected} defaultMonth={value ? new Date(`${value}T12:00:00`) : new Date()} /><Button disabled={!selected} className={`${btn} btn-blue w-full`} onClick={() => { if (!selected) return; onChange(toISODate(selected.getFullYear(), selected.getMonth() + 1, selected.getDate())); setOpen(false); }}>Done</Button></PopoverContent></Popover>;
}

function Setup({ date, onCreate, onCancel }: { date: string; onCreate: (input: { name: string; date: string; category: Category; count: number }) => Promise<void>; onCancel: () => void }) {
  const [name, setName] = useState(""); const [category, setCategory] = useState<Category | null>(null);
  const [count, setCount] = useState(""); const [step, setStep] = useState<"category" | "count" | "name">("category");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const icons = [BookOpen, GraduationCap, CalendarDays, Layers];
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    const c = validateCount(count); if (!c.ok) return setError(c.error);
    if (step === "count") { setError(""); return setStep("name"); }
    const n = validateChecklistName(name); if (!n.ok) return setError(n.error);
    if (!category) return; setBusy(true);
    try { await onCreate({ name: n.value, date, category, count: c.value }); } finally { setBusy(false); }
  };
  return <div className="mx-auto w-full max-w-2xl px-4 py-8"><h1 className="text-3xl font-extrabold">{step === "category" ? "Select a category" : step === "count" ? "Enter the total number of members to be checked." : "Name your checklist"}</h1><p className="mt-3 text-muted-foreground">{formatDDMMYY(date)}{category ? ` · ${categoryLabel(category)}` : ""}</p>
    {step === "category" ? <div className="mt-8 grid grid-cols-2 gap-4">{CATEGORIES.map((c, i) => { const Icon = icons[i] ?? Layers; return <Button key={c.id} onClick={() => { setCategory(c.id); setStep("count"); }} className="glass flex min-h-36 flex-col gap-4 rounded-2xl p-5 text-lg font-bold"><Icon className="h-7 w-7 text-primary" />{c.label}</Button>; })}</div> : <form onSubmit={submit} className="mt-8 space-y-4"><Field label={step === "count" ? "Number of members · Maximum 100" : "Checklist name"} error={error}>{step === "count" ? <input aria-label="Number of members" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} className={inputCls} placeholder="1–100" /> : <input aria-label="Checklist name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} className={inputCls} placeholder="Monday Maths Homework" />}</Field><Button type="submit" disabled={busy} className={`${btn} btn-blue`}>{busy ? "Creating…" : step === "count" ? "Continue" : "Create Checklist"}</Button></form>}
    <Button className={`${btnGhost} mt-5`} onClick={() => { setError(""); if (step === "name") setStep("count"); else if (step === "count") setStep("category"); else onCancel(); }}>Back</Button>
  </div>;
}

/* ---------------- Checklist ---------------- */
function ChecklistScreen({ checklist, saving, saveError, onRetry, onMark, onComplete }: {
  checklist: Checklist;
  saving: boolean;
  saveError: boolean;
  onRetry: () => void;
  onMark: (member: number, s: StatusCode) => void;
  onComplete: () => void;
}) {
  const [menu, setMenu] = useState<{ n: number; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const sum = useMemo(() => summarize(checklist.statuses), [checklist.statuses]);

  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    const close = () => setMenu(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const open = (n: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const W = 200, H = 170, pad = 8;
    let x = r.left + r.width / 2 - W / 2;
    x = Math.max(pad, Math.min(x, window.innerWidth - W - pad));
    let y = r.bottom + 8;
    if (y + H > window.innerHeight - pad) y = Math.max(pad, r.top - H - 8);
    setMenu({ n, x, y });
  };
  const pick = (s: StatusCode) => {
    if (!menu) return;
    const n = menu.n;
    setMenu(null);
    onMark(n, s);
  };
  const label = (c: string) => (c === "d" ? "Done" : c === "n" ? "Not done" : c === "a" ? "Absent" : "Unmarked");

  return (
    <div className="anim-rise mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-extrabold tracking-normal text-foreground sm:text-3xl">{checklist.name}</h1>
        <p className="text-sm font-medium text-muted-foreground">
          {categoryLabel(checklist.category)} · {formatDDMMYY(checklist.checklist_date)}
          {saving ? <span className="ml-2 animate-pulse">Saving…</span> : <span className="ml-2">{saveError ? "Save failed" : "Saved"}</span>}
        </p>
      </div>
      <div className="mb-6 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="glass rounded-full px-3 py-1.5 text-foreground">{sum.total} members</span>
        <span className="rounded-full bg-done-soft px-3 py-1.5 text-done-ink">{sum.done.length} done</span>
        <span className="rounded-full bg-notdone-soft px-3 py-1.5 text-notdone-ink">{sum.notDone.length} not done</span>
        <span className="rounded-full bg-ink px-3 py-1.5 text-ink-foreground">{sum.absent.length} absent</span>
        <span className="rounded-full bg-amber-soft px-3 py-1.5 text-amber-ink">{sum.unmarked.length} unmarked</span>
      </div>
      {saveError && <Button onClick={onRetry} className={`${btn} btn-red mb-4`}>Retry saving</Button>}
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: checklist.member_count }, (_, i) => i + 1).map((n) => {
          const st = checklist.statuses[n - 1] ?? "u";
          return (
            <li key={n} className={checklist.member_count > 300 ? "cv-auto" : undefined}>
              <Button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menu?.n === n}
                aria-label={`Member ${n}, ${label(st)}`}
                onClick={(ev) => open(n, ev.currentTarget)}
                className={`relative flex h-24 w-full items-center justify-center rounded-[22px] border border-glass-border shadow-[var(--shadow-glass)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg active:scale-95 ${
                  st === "d" ? "card-done" : st === "n" ? "card-notdone" : st === "a" ? "bg-ink text-ink-foreground" : "card-unmarked"
                } ${menu?.n === n ? "ring-4 ring-ring/40" : ""}`}
              >
                <span className="text-3xl font-extrabold tracking-normal">{n}</span>
                {st === "d" && <Check className="absolute right-3 top-3 h-5 w-5" strokeWidth={3} aria-hidden />}
                {st === "n" && <X className="absolute right-3 top-3 h-5 w-5" strokeWidth={3} aria-hidden />}
                {st === "a" && <UserX className="absolute right-3 top-3 h-5 w-5" aria-hidden />}
              </Button>
            </li>
          );
        })}
      </ul>

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} aria-hidden />
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions for member ${menu.n}`}
            style={{ left: menu.x, top: menu.y, width: 200 }}
            className="glass anim-pop fixed z-50 flex flex-col gap-1.5 rounded-[20px] p-2"
          >
            <p className="px-2 pb-1 text-xs font-semibold text-muted-foreground">Member #{menu.n}</p>
            <Button role="menuitem" onClick={() => pick("d")} className={`${btn} justify-start bg-done-soft text-done-ink`}>
              <Check className="h-4 w-4" strokeWidth={3} /> Done
            </Button>
            <Button role="menuitem" onClick={() => pick("n")} className={`${btn} justify-start bg-notdone-soft text-notdone-ink`}>
              <X className="h-4 w-4" strokeWidth={3} /> Not Done
            </Button>
            <Button role="menuitem" onClick={() => pick("a")} className={`${btn} btn-ink justify-start`}>
              <UserX className="h-4 w-4" /> Absent
            </Button>
          </div>
        </>
      )}

      <div className="mt-10 flex justify-center">
        <Button onClick={onComplete} className={`${btn} btn-blue px-8 py-4 text-base`}>
          <CheckCheck className="h-5 w-5" aria-hidden /> Checklist Complete
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Report ---------------- */
type Tone = "done" | "notdone" | "ink" | "amber";
const toneCls: Record<Tone, { box: string; ink: string }> = {
  done: { box: "bg-done-soft", ink: "text-done-ink" },
  notdone: { box: "bg-notdone-soft", ink: "text-notdone-ink" },
  ink: { box: "bg-ink", ink: "text-ink-foreground" },
  amber: { box: "bg-amber-soft", ink: "text-amber-ink" },
};

function Section({ title, nums, tone }: { title: string; nums: number[]; tone: Tone }) {
  const [open, setOpen] = useState(false);
  const id = `sec-${title.replace(/\s/g, "")}`;
  return (
    <div className="glass overflow-hidden rounded-[24px]">
      <Button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6"
      >
        <span className="flex items-center gap-3">
          <span className={`h-3 w-3 rounded-full ${tone === "done" ? "bg-done" : tone === "notdone" ? "bg-notdone" : tone === "ink" ? "bg-ink" : "bg-amber"}`} aria-hidden />
          <span className="text-lg font-bold text-foreground">{title}</span>
          <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold ${toneCls[tone].box} ${toneCls[tone].ink}`}>{nums.length}</span>
        </span>
        <span className="flex items-center gap-1 text-sm font-medium text-muted-foreground">
          {open ? "Collapse" : "Expand"}
          <ChevronDown className={`h-5 w-5 transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden />
        </span>
      </Button>
      <div id={id} className={`grid transition-[grid-template-rows] duration-300 ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
        <div className="overflow-hidden">
          <div className="max-h-72 overflow-y-auto px-5 pb-5 sm:px-6">
            {nums.length === 0 ? (
              <p className="text-sm text-muted-foreground">(None)</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {nums.map((n) => (
                  <span key={n} className={`rounded-lg px-2.5 py-1 text-sm font-semibold ${toneCls[tone].box} ${toneCls[tone].ink}`}>{n}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Report({ checklist, onEdit, onHome }: { checklist: Checklist; onEdit: () => void; onHome: () => void }) {
  const s = useMemo(() => summarize(checklist.statuses), [checklist.statuses]);
  const stats: { label: string; value: number; tone: Tone; icon: ReactNode }[] = [
    { label: "Done", value: s.done.length, tone: "done", icon: <Check className="h-5 w-5" strokeWidth={3} /> },
    { label: "Not Done", value: s.notDone.length, tone: "notdone", icon: <X className="h-5 w-5" strokeWidth={3} /> },
    { label: "Absent", value: s.absent.length, tone: "ink", icon: <UserX className="h-5 w-5" /> },
    { label: "Unmarked", value: s.unmarked.length, tone: "amber", icon: <CircleDashed className="h-5 w-5" /> },
  ];
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 sm:px-6">
      <div className="anim-rise">
        <h1 className="text-4xl font-extrabold tracking-normal text-foreground sm:text-6xl">{checklist.name}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          {categoryLabel(checklist.category)} · {longDate(checklist.checklist_date)}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {checklist.completed_at ? `Completed ${new Date(checklist.completed_at).toLocaleString()}` : "Not completed yet"} · Created {new Date(checklist.created_at).toLocaleString()} · Updated {new Date(checklist.updated_at).toLocaleString()}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {stats.map((st, i) => (
          <div key={st.label} style={{ animationDelay: `${80 + i * 70}ms` }} className={`anim-rise rounded-[24px] p-5 ${toneCls[st.tone].box} ${toneCls[st.tone].ink}`}>
            <div className="flex items-center justify-between text-sm font-semibold">{st.label}{st.icon}</div>
            <div className="mt-3 text-5xl font-extrabold tracking-normal">{st.value}</div>
          </div>
        ))}
      </div>

      <div className="anim-rise glass mt-4 grid grid-cols-1 gap-4 rounded-[28px] p-6 sm:grid-cols-3" style={{ animationDelay: "380ms" }}>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Total members</p>
          <p className="text-3xl font-extrabold text-foreground">{s.total}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Done (of total)</p>
          <p className="text-3xl font-extrabold text-primary">{pct(s.done.length, s.total)}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(s.donePct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full btn-blue transition-all duration-700" style={{ width: `${s.donePct}%` }} />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Marked (of total)</p>
          <p className="text-3xl font-extrabold text-foreground">{pct(s.total - s.unmarked.length, s.total)}</p>
        </div>
      </div>

      <div className="anim-rise mt-6 flex flex-col gap-3" style={{ animationDelay: "450ms" }}>
        <Section title="Done" nums={s.done} tone="done" />
        <Section title="Not Done" nums={s.notDone} tone="notdone" />
        <Section title="Absent" nums={s.absent} tone="ink" />
        <Section title="Unmarked" nums={s.unmarked} tone="amber" />
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <Button onClick={() => downloadTxt(checklist)} className={`${btn} btn-blue w-full px-8 py-4 text-base sm:w-auto`}>
          <Download className="h-5 w-5" /> Download TXT
        </Button>
        <Button
          onClick={() => { downloadExcel(checklist).catch(() => toast.error("Couldn't build the Excel file.")); }}
          className={`${btn} btn-ink w-full px-8 py-4 text-base sm:w-auto`}
        >
          <FileSpreadsheet className="h-5 w-5" /> Download Excel
        </Button>
        <Button onClick={onEdit} className={`${btnGhost} w-full sm:w-auto`}>
          <Pencil className="h-4 w-4" /> Edit Report
        </Button>
        <Button onClick={onHome} className={`${btnGhost} w-full sm:w-auto`}>Home</Button>
      </div>
    </div>
  );
}

/* ---------------- History ---------------- */
function HistoryScreen({ items, onOpen, onEdit, onDelete, onBack }: {
  items: Checklist[];
  onOpen: (c: Checklist) => void;
  onEdit: (c: Checklist) => void;
  onDelete: (c: Checklist) => void;
  onBack: () => void;
}) {
  const groups = useMemo(() => groupHistory(items), [items]);
  return (
    <div className="anim-rise mx-auto w-full max-w-4xl px-4 pb-20 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-4xl font-extrabold tracking-normal text-foreground sm:text-5xl">History</h1>
        <Button onClick={onBack} className={btnGhost}>Back Home</Button>
      </div>
      {groups.length === 0 ? (
        <div className="glass mt-8 rounded-[28px] p-10 text-center text-muted-foreground">
          No checklists yet. Create your first one from the home screen.
        </div>
      ) : (
        groups.map((g) => (
          <details key={g.key} className="mt-8" open>
            <summary className="cursor-pointer text-xl font-bold text-foreground">{g.label}</summary>
            {g.dates.map((d) => (
              <details key={d.date} className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-muted-foreground">{longDate(d.date)}</summary>
                <div className="mt-2 flex flex-col gap-2">
                  {d.items.map((c) => {
                    const s = summarize(c.statuses);
                    return (
                      <div key={c.id} className="glass flex flex-col gap-3 rounded-[22px] p-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-lg font-bold text-foreground">
                            {c.name}
                            {!c.completed_at && <span className="ml-2 rounded-full bg-amber-soft px-2 py-0.5 text-xs font-bold text-amber-ink">In progress</span>}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {categoryLabel(c.category)} · {s.total} members · {s.done.length} done · {s.notDone.length} not done · {s.absent.length} absent
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-2">
                          <Button onClick={() => onOpen(c)} className={`${btn} btn-blue px-4`}>Report</Button>
                          <Button onClick={() => onEdit(c)} className={`${btnGhost} px-4`} aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" /></Button>
                          <Button onClick={() => onDelete(c)} className={`${btn} btn-red px-4`} aria-label={`Delete ${c.name}`}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </details>
        ))
      )}
    </div>
  );
}

/* ---------------- Analytics ---------------- */
function RankTable({ title, rows, empty }: { title: string; rows: { member: number; numerator: number; denominator: number; rate: number }[]; empty: string }) {
  return (
    <div className="glass rounded-[24px] p-5">
      <h3 className="text-lg font-bold text-foreground">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-1.5">
          {rows.map((r) => (
            <li key={r.member} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/70 px-3 py-2 text-sm">
              <span className="font-bold text-foreground">#{r.member}</span>
              <span className="text-muted-foreground">{r.numerator}/{r.denominator}</span>
              <span className="font-bold text-foreground">{r.rate.toFixed(0)}%</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function AnalyticsScreen({ items, onBack }: { items: Checklist[]; onBack: () => void }) {
  const [cats, setCats] = useState<Category[]>(CATEGORIES.map((c) => c.id));
  const months = useMemo(() => groupHistory(items), [items]);
  const [month, setMonth] = useState(months[0]?.key ?? "");
  const [selection, setSelection] = useState<{ month: string; cats: Category[] } | null>(null);
  const toggle = (c: Category) => setCats((cur) => cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]);
  const a = useMemo(() => computeAnalytics(items.filter((c) => c.checklist_date.slice(0, 7) === selection?.month), selection?.cats ?? []), [items, selection]);

  return (
    <div className="anim-rise mx-auto w-full max-w-5xl px-4 pb-20 sm:px-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-4xl font-extrabold tracking-normal text-foreground sm:text-5xl">Analytics</h1>
        <Button onClick={onBack} className={btnGhost}>Back Home</Button>
      </div>

      <label className="mt-6 block text-sm font-semibold">Month<select aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)} className={`${inputCls} mt-2`}>{months.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Filter by category">
        {CATEGORIES.map((c) => (
          <Button
            key={c.id}
            onClick={() => toggle(c.id)}
            aria-pressed={cats.includes(c.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${cats.includes(c.id) ? "btn-blue" : "glass text-foreground hover:bg-secondary"}`}
          >
            {c.label}
          </Button>
        ))}
      </div>

      <Button onClick={() => setCats(CATEGORIES.map((c) => c.id))} className={`${btnGhost} mt-4 mr-2`}>Select All</Button>
      <Button disabled={!month || !cats.length} onClick={() => setSelection({ month, cats: [...cats] })} className={`${btn} btn-blue mt-4`}>Get Analytics</Button>
      {selection && <p className="mt-4 text-sm text-muted-foreground">{monthLabel(selection.month)} · matching roll numbers in the selected reports, not verified student identities. Consistency: Done / (Done + Not Done), minimum two eligible observations. Absence rankings use Attendance only.</p>}
      {a.reports === 0 ? (
        <div className="glass mt-8 rounded-[28px] p-10 text-center text-muted-foreground">
          No checklists in the selected categories yet. Analytics appear once you have saved checklists.
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Reports", value: a.reports },
              { label: "Days covered", value: a.dates },
              { label: "Done rate", value: pct(a.totals.done, a.totals.obs) },
              { label: "Absent observations", value: a.totals.absent },
              { label: "Member observations", value: a.totals.obs }, { label: "Done", value: a.totals.done }, { label: "Not Done", value: a.totals.notDone }, { label: "Unmarked", value: a.totals.unmarked }, { label: "Marked / observations", value: pct(a.totals.obs - a.totals.unmarked, a.totals.obs) },
            ].map((s) => (
              <div key={s.label} className="glass rounded-[24px] p-5">
                <p className="text-sm font-medium text-muted-foreground">{s.label}</p>
                <p className="mt-2 text-4xl font-extrabold tracking-normal text-foreground">{s.value}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2">{a.byCategory.map((c) => <div key={c.category} className="glass rounded-2xl p-5"><h3 className="font-bold">{categoryLabel(c.category)}</h3><p className="mt-2 text-sm">{c.reports} reports · Done / observations: {pct(c.totals.done, c.totals.obs)}</p></div>)}</div>
          <div className="glass mt-6 rounded-[28px] p-5 sm:p-6">
            <h3 className="text-lg font-bold text-foreground">Done rate over time</h3>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={a.trend.map((t) => ({ ...t, date: formatDDMMYY(t.date), rate: t.doneRate == null ? null : +t.doneRate.toFixed(1) }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" fontSize={12} stroke="var(--muted-foreground)" />
                  <YAxis domain={[0, 100]} unit="%" fontSize={12} stroke="var(--muted-foreground)" />
                  <Tooltip formatter={(v) => [`${v}%`, "Done rate"]} />
                  <Line type="monotone" dataKey="rate" stroke="var(--primary)" strokeWidth={3} dot={{ r: 4 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {a.attendanceTrend.length > 0 && (
            <div className="glass mt-6 rounded-[28px] p-5 sm:p-6">
              <h3 className="text-lg font-bold text-foreground">Attendance over time</h3>
              <div className="mt-4 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={a.attendanceTrend.map((t) => ({ ...t, date: formatDDMMYY(t.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" fontSize={12} stroke="var(--muted-foreground)" />
                    <YAxis allowDecimals={false} fontSize={12} stroke="var(--muted-foreground)" />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="present" stackId="a" fill="var(--done)" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="absent" stackId="a" fill="var(--notdone)" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <RankTable title="Most consistent" rows={a.mostConsistent} empty={`Needs at least ${a.minObs} marked appearances per member.`} />
            <RankTable title="Least consistent" rows={a.leastConsistent} empty={`Needs at least ${a.minObs} marked appearances per member.`} />
            <RankTable title="Most absent" rows={a.mostAbsent} empty={`Needs at least ${a.minObs} attendance marks per member.`} />
            <div className="glass rounded-[24px] p-5">
              <h3 className="text-lg font-bold text-foreground">Most improved</h3>
              {a.mostImproved.length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">{a.improvementNote}</p>
              ) : (
                <ol className="mt-3 flex flex-col gap-1.5">
                  {a.mostImproved.map((r) => (
                    <li key={r.member} className="flex items-center justify-between gap-3 rounded-xl bg-secondary/70 px-3 py-2 text-sm">
                      <span className="font-bold text-foreground">#{r.member}</span>
                      <span className="text-muted-foreground">{r.baseline.toFixed(0)}% → {r.later.toFixed(0)}%</span>
                      <span className="font-bold text-done-ink">+{r.change.toFixed(0)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- App ---------------- */
export function ZChecklistApp() {
  const queryClient = useQueryClient();
  const [draftDate, setDraftDate] = useState("");
  const [saveError, setSaveError] = useState(false);
  const failedRef = useRef(false);
  const userRef = useRef<User | null>(null);
  const [booted, setBooted] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [profileName, setProfileName] = useState<string>("there");
  const [items, setItems] = useState<Checklist[]>([]);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [current, setCurrent] = useState<Checklist | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [saving, setSaving] = useState(false);

  const currentRef = useRef<Checklist | null>(null);
  const confirmedRef = useRef<Checklist | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  currentRef.current = current;
  userRef.current = user;

  /* ----- session ----- */
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      setUser(session?.user ?? null);
    });
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setBooted(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setProfileName("there");
      setCurrent(null);
      confirmedRef.current = null;
      setScreen((s) => s === "welcome" || s === "auth" ? s : "auth");
      return;
    }
    let active = true;
    fetchProfile(user.id).then((p) => { if (active) setProfileName(p?.name || "there"); }).catch(() => {});
    listChecklists().then((rows) => {
      if (!active) return; setItems(rows);
      try {
        const raw = localStorage.getItem(`zchecklist_draft_${user.id}`);
        const draft = raw ? JSON.parse(raw) as Checklist : null;
        const saved = draft ? rows.find((r) => r.id === draft.id) : null;
        if (draft && saved && saved.version === draft.version && draft.statuses !== saved.statuses) {
          confirmedRef.current = saved; currentRef.current = draft; setCurrent(draft); failedRef.current = true; setSaveError(true); setScreen("checklist");
        }
      } catch { /* corrupted local protection never replaces cloud records */ }
    }).catch(() => toast.error("Couldn't load your checklists. Check your connection."));
    setScreen((s) => (s === "auth" ? "home" : s));
    return () => { active = false; };
  }, [user?.id]);

  const replaceItem = useCallback((row: Checklist) => {
    setItems((cur) => {
      const i = cur.findIndex((x) => x.id === row.id);
      if (i === -1) return [row, ...cur];
      const next = [...cur];
      next[i] = row;
      return next;
    });
  }, []);

  /* ----- saving (optimistic, serialized, version-checked) ----- */
  const queueSave = useCallback((next: Checklist) => {
    const owner = userRef.current?.id;
    if (!owner) return;
    try { localStorage.setItem(`zchecklist_draft_${owner}`, JSON.stringify(next)); } catch { /* in-memory draft remains */ }
    setSaving(true);
    saveChain.current = saveChain.current.then(async () => {
      const base = confirmedRef.current;
      if (!base || base.id !== next.id || userRef.current?.id !== owner || failedRef.current) return;
      try {
        const row = await updateChecklist(next.id, base.version, { statuses: next.statuses });
        if (userRef.current?.id !== owner) return;
        confirmedRef.current = row; replaceItem(row);
        const latest = currentRef.current;
        if (latest?.id === row.id) {
          const merged = { ...latest, version: row.version, updated_at: row.updated_at };
          currentRef.current = merged; setCurrent(merged);
          try { if (merged.statuses === row.statuses) localStorage.removeItem(`zchecklist_draft_${owner}`); else localStorage.setItem(`zchecklist_draft_${owner}`, JSON.stringify(merged)); } catch { /* optional protection */ }
        }
      } catch (e) {
        failedRef.current = true; setSaveError(true);
        toast.error(e instanceof ConflictError ? "Another device changed this checklist. Your draft is retained; retry will reload the latest version before saving." : "Save failed. Your work is retained. Retry before leaving.");
      }
    }).finally(() => setSaving(false));
  }, [replaceItem]);

  const retrySave = async () => {
    const draft = currentRef.current;
    if (!draft) return;
    const fresh = await getChecklist(draft.id).catch(() => null);
    if (!fresh) { toast.error("Still unable to connect."); return; }
    if (fresh.version !== confirmedRef.current?.version) {
      toast.error("The cloud copy has changed. Your local draft remains protected. Reload to use the cloud copy rather than overwrite another device.");
      return;
    }
    failedRef.current = false; setSaveError(false); confirmedRef.current = fresh; queueSave(draft);
  };

  const leave = async (destination: Screen) => {
    await saveChain.current;
    if (failedRef.current) { toast.error("Retry saving before leaving; your work has not been discarded."); return; }
    setScreen(destination);
    return;
  };

  const mark = useCallback((member: number, s: StatusCode) => {
    const cur = currentRef.current;
    if (!cur) return;
    const next = { ...cur, statuses: setStatusAt(cur.statuses, member, s) };
    currentRef.current = next;
    setCurrent(next);
    queueSave(next);
  }, [queueSave]);

  /* ----- actions ----- */
  const create = async (input: { name: string; date: string; category: Category; count: number }) => {
    try {
      const row = await createChecklist({
        checklist_date: input.date,
        category: input.category,
        name: input.name,
        member_count: input.count,
        statuses: blankStatuses(input.count),
      });
      failedRef.current = false; setSaveError(false);
      confirmedRef.current = row;
      currentRef.current = row;
      setCurrent(row);
      replaceItem(row);
      setScreen("checklist");
    } catch {
      toast.error("Couldn't create the checklist. Check your connection.");
    }
  };

  const complete = async () => {
    setPrompt(null);
    await saveChain.current;
    if (failedRef.current) { toast.error("Please retry saving before completing."); return; }
    const cur = confirmedRef.current;
    if (!cur) return;
    setSaving(true);
    try {
      const row = await updateChecklist(cur.id, cur.version, { completed_at: new Date().toISOString() });
      confirmedRef.current = row;
      currentRef.current = row;
      setCurrent(row);
      replaceItem(row);
      setScreen("report");
    } catch {
      toast.error("Couldn't finish the checklist. Check your connection.");
    } finally { setSaving(false); }
  };

  const onCompleteClick = () => {
    const cur = currentRef.current;
    if (!cur) return;
    const s = summarize(cur.statuses);
    if (s.unmarked.length > 0) setPrompt("unmarked");
    else void complete();
  };

  const reopen = (c: Checklist) => {
    failedRef.current = false; setSaveError(false);
    confirmedRef.current = c;
    currentRef.current = c;
    setCurrent(c);
    setScreen("checklist");
  };

  const openReport = (c: Checklist) => {
    failedRef.current = false; setSaveError(false);
    confirmedRef.current = c;
    currentRef.current = c;
    setCurrent(c);
    setScreen("report");
  };

  const editFromReport = async () => {
    const cur = currentRef.current;
    if (!cur) return;
    if (!cur.completed_at) return reopen(cur);
    try {
      const row = await updateChecklist(cur.id, cur.version, { completed_at: null });
      confirmedRef.current = row;
      replaceItem(row);
      reopen(row);
    } catch {
      toast.error("Couldn't reopen the checklist. Check your connection.");
    }
  };

  const confirmDelete = async () => {
    if (typeof prompt !== "object" || prompt?.kind !== "delete") return;
    const item = prompt.item;
    setPrompt(null);
    try {
      await deleteChecklist(item.id);
      setItems((cur) => cur.filter((x) => x.id !== item.id));
      if (currentRef.current?.id === item.id) {
        currentRef.current = null;
        confirmedRef.current = null;
        setCurrent(null);
      }
      toast.success(`Deleted "${item.name}".`);
    } catch {
      toast.error("Couldn't delete that checklist.");
    }
  };

  const signOut = async () => {
    setPrompt(null);
    await saveChain.current;
    if (failedRef.current) { toast.error("Save your pending changes before signing out."); return; }
    await queryClient.cancelQueries(); queryClient.clear();
    await supabase.auth.signOut();
    setItems([]); setCurrent(null); confirmedRef.current = null; currentRef.current = null;
    setScreen("auth");
  };

  const importLegacy = async () => {
    const legacy = readLegacy();
    if (!legacy) return;
    try {
      const row = await createChecklist({ name: "Imported checklist", checklist_date: todayISO(), category: "miscellaneous", member_count: legacy.total, statuses: legacy.statuses });
      replaceItem(row); reopen(row);
      localStorage.removeItem("zchecklist_session_v1");
    } catch { toast.error("Import failed. Your original checklist is still on this device."); }
  };

  const sum = current ? summarize(current.statuses) : null;

  return (
    <div className="relative min-h-screen">
      <div className="aurora" aria-hidden>
        <div className="blob left-[-10%] top-[-10%] h-[55vh] w-[55vh] bg-brand-word/40" />
        <div className="blob right-[-10%] top-[10%] h-[60vh] w-[60vh] bg-primary/35" style={{ animationDelay: "-8s" }} />
        <div className="blob bottom-[-15%] left-[25%] h-[50vh] w-[50vh] bg-brand-z/25" style={{ animationDelay: "-16s" }} />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-[88px] items-center justify-between gap-3 px-4 sm:px-8">
          <div className="flex min-w-0 items-center gap-2"><Brand onClick={() => void leave(user ? "home" : "auth")} />{user && <Button onClick={() => void leave("home")} className={`${btnGhost} px-3`} aria-label="Home"><HomeIcon className="h-4 w-4" /></Button>}</div>
          {user && <div className="flex items-center gap-2">
            {screen === "home" && <Button onClick={() => void leave("history")} className={`${btnGhost} px-3`} aria-label="History"><History className="h-4 w-4" /><span className="hidden sm:inline">History</span></Button>}
            {screen === "history" && <Button onClick={() => setScreen("analytics")} className={`${btn} btn-blue px-3`} aria-label="Analytics"><BarChart3 className="h-4 w-4" /><span className="hidden sm:inline">Analytics</span></Button>}
            {screen === "checklist" ? <><Button onClick={() => void leave("welcome")} className={`${btn} btn-red px-3`} aria-label="Exit"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Exit</span></Button><Button onClick={onCompleteClick} disabled={saving || saveError} className={`${btn} btn-blue px-3`} aria-label="Checklist Complete"><CheckCheck className="h-4 w-4" /><span className="hidden sm:inline">Checklist Complete</span></Button></> : <><Button onClick={() => void leave("profile")} className={`${btnGhost} px-3`} aria-label="Profile"><UserRound className="h-4 w-4" /><span className="hidden sm:inline">Profile</span></Button><Button onClick={() => setPrompt("signOut")} className={`${btnGhost} px-3`} aria-label="Sign Out"><LogOut className="h-4 w-4" /><span className="hidden sm:inline">Sign Out</span></Button></>}
          </div>}
        </header>

        <main className="flex-1">
          {!booted ? (
            <div className="flex min-h-[calc(100vh-88px)] items-center justify-center">
              <p className="animate-pulse text-sm font-medium text-muted-foreground">Loading…</p>
            </div>
          ) : (
            <div key={screen} className={screen === "welcome" ? "" : "anim-rise"}>
              {screen === "welcome" && <Welcome onContinue={() => setScreen(user ? "home" : "auth")} />}
              {screen === "auth" && !user && <AccountAuth />}
              {screen === "home" && user && (
                <Home
                  name={profileName}
                  items={items}
                  onNew={(date) => { setDraftDate(date); setScreen("setup"); }}
                  onHistory={() => setScreen("history")}
                  onAnalytics={() => setScreen("analytics")}
                  onImportLegacy={importLegacy}
                />
              )}
              {screen === "setup" && <Setup date={draftDate} onCreate={create} onCancel={() => setScreen("home")} />}
              {screen === "checklist" && current && (
                <ChecklistScreen checklist={current} saving={saving} saveError={saveError} onRetry={retrySave} onMark={mark} onComplete={onCompleteClick} />
              )}
              {screen === "report" && current && (
                <Report checklist={current} onEdit={editFromReport} onHome={() => setScreen("home")} />
              )}
              {screen === "history" && (
                <HistoryScreen
                  items={items}
                  onOpen={openReport}
                  onEdit={reopen}
                  onDelete={(c) => setPrompt({ kind: "delete", item: c })}
                  onBack={() => setScreen("home")}
                />
              )}
              {screen === "profile" && user && <ProfileScreen user={user} onSaved={() => { fetchProfile(user.id).then((p) => setProfileName(p?.name ?? "there")); }} />}
              {screen === "analytics" && <AnalyticsScreen items={items} onBack={() => setScreen("history")} />}
            </div>
          )}
        </main>
      </div>

      {prompt === "unmarked" && sum && (
        <Dialog title="Some entries are still unmarked" onClose={() => setPrompt(null)} icon={<AlertTriangle className="h-8 w-8 text-amber-ink" />}>
          <p className="mt-2 text-muted-foreground">
            You have {sum.unmarked.length} {sum.unmarked.length === 1 ? "entry" : "entries"} without a status. Would you like to return and finish them, or continue to the final report?
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button data-autofocus onClick={() => setPrompt(null)} className={btnGhost}>Return to Checklist</Button>
            <Button onClick={complete} className={`${btn} btn-blue`}>Finish Anyway</Button>
          </div>
        </Dialog>
      )}

      {typeof prompt === "object" && prompt?.kind === "delete" && (
        <Dialog title={`Delete "${prompt.item.name}"?`} onClose={() => setPrompt(null)} icon={<Trash2 className="h-8 w-8 text-foreground" />}>
          <p className="mt-2 text-muted-foreground">This permanently removes the checklist and its report. This can't be undone.</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button data-autofocus onClick={() => setPrompt(null)} className={btnGhost}>Cancel</Button>
            <Button onClick={confirmDelete} className={`${btn} btn-red`}><Trash2 className="h-4 w-4" /> Delete</Button>
          </div>
        </Dialog>
      )}

      {prompt === "signOut" && (
        <Dialog title="Sign out?" onClose={() => setPrompt(null)} icon={<LogOut className="h-8 w-8 text-foreground" />}>
          <p className="mt-2 text-muted-foreground">Your checklists stay saved to your account and will be here when you sign back in.</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button data-autofocus onClick={() => setPrompt(null)} className={btnGhost}>Cancel</Button>
            <Button onClick={signOut} className={`${btn} btn-ink`}>Sign Out</Button>
          </div>
        </Dialog>
      )}

      <Toaster position="top-right" richColors duration={5000} />
    </div>
  );
}
