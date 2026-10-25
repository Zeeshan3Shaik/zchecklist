import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Check, ChevronDown, CircleDashed, Download, LogOut, Trash2, X, CheckCheck } from "lucide-react";
import {
  type Session, type EntryStatus, createSession, setStatus, summarize, loadSession, saveSession,
  validateCount, downloadReport, fmtDate, pct,
} from "@/lib/zchecklist";

type Screen = "welcome" | "setup" | "checklist" | "report";
type Prompt = null | "resume" | "confirmNew" | "deleteEntry" | "unmarked";

const GREETINGS = ["Hello", "こんにちは", "नमस्ते", "Bonjour", "Ciao", "你好", "안녕하세요", "Guten Morgen", "Olá", "Hola"];

function Brand() {
  return (
    <div className="select-none text-xl font-extrabold tracking-tight sm:text-2xl" aria-label="ZChecklist">
      <span className="text-brand-z">Z</span>
      <span className="text-brand-word">Checklist</span>
    </div>
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
        <h2 id="dlg-title" className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const btn = "inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 hover:brightness-110 active:scale-[0.97] disabled:opacity-50";
const btnGhost = `${btn} glass text-foreground hover:brightness-100 hover:bg-secondary`;

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
    <button
      type="button"
      onClick={go}
      aria-label="Welcome. Click anywhere to continue"
      className={`flex min-h-[calc(100vh-88px)] w-full flex-col items-center justify-center gap-10 transition-all duration-300 focus-visible:outline-none ${leaving ? "scale-95 opacity-0 blur-sm" : ""}`}
    >
      <div className="flex h-32 items-center justify-center sm:h-44" aria-live="polite">
        <h1 key={i} className="anim-rise text-6xl font-extrabold tracking-tight text-foreground sm:text-8xl lg:text-9xl">
          {GREETINGS[i]}
        </h1>
      </div>
      <p className="animate-pulse text-sm font-medium tracking-wide text-muted-foreground">Click anywhere to continue</p>
    </button>
  );
}

/* ---------------- Setup ---------------- */
function Setup({ onCreate }: { onCreate: (n: number) => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (busy.current) return;
    const r = validateCount(value);
    if (!r.ok) return setError(r.error);
    busy.current = true;
    onCreate(r.value);
  };
  return (
    <div className="flex min-h-[calc(100vh-88px)] items-center justify-center px-4">
      <form onSubmit={submit} noValidate className="glass anim-rise w-full max-w-lg rounded-[32px] p-7 sm:p-10">
        <label htmlFor="count" className="block text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl">
          Enter the total number of members to be checked
        </label>
        <input
          id="count"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoFocus
          autoComplete="off"
          placeholder="e.g. 50"
          value={value}
          aria-invalid={!!error}
          aria-describedby="count-err"
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          className="mt-6 w-full rounded-2xl border border-glass-border bg-card px-5 py-4 text-center text-4xl font-bold tracking-tight text-foreground outline-none transition focus:ring-4 focus:ring-ring/30"
        />
        <p id="count-err" role="alert" className={`mt-3 min-h-5 text-sm font-medium text-notdone-ink transition-opacity ${error ? "opacity-100" : "opacity-0"}`}>
          {error}
        </p>
        <button type="submit" className={`${btn} btn-blue mt-4 w-full py-4 text-base`}>Continue</button>
      </form>
    </div>
  );
}

/* ---------------- Checklist ---------------- */
function Checklist({ session, onMark, onRequestDelete }: {
  session: Session;
  onMark: (n: number, s: EntryStatus) => void;
  onRequestDelete: (n: number) => void;
}) {
  const [menu, setMenu] = useState<{ n: number; x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = useMemo(() => session.entries.filter((e) => e.status !== "deleted"), [session.entries]);
  const sum = useMemo(() => summarize(session), [session]);

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
  const pick = (s: EntryStatus | "delete") => {
    if (!menu) return;
    const n = menu.n;
    setMenu(null);
    if (s === "delete") onRequestDelete(n);
    else onMark(n, s);
  };
  const label = (s: EntryStatus) => (s === "done" ? "Done" : s === "not_done" ? "Not done" : "Unmarked");

  return (
    <div className="anim-rise mx-auto w-full max-w-7xl px-4 pb-16 sm:px-6">
      <div className="mb-6 flex flex-wrap gap-2 text-xs font-semibold">
        <span className="glass rounded-full px-3 py-1.5 text-foreground">{sum.active} active</span>
        <span className="rounded-full bg-done-soft px-3 py-1.5 text-done-ink">{sum.done.length} done</span>
        <span className="rounded-full bg-notdone-soft px-3 py-1.5 text-notdone-ink">{sum.notDone.length} not done</span>
        <span className="rounded-full bg-amber-soft px-3 py-1.5 text-amber-ink">{sum.unmarked.length} unmarked</span>
        {sum.deleted.length > 0 && <span className="rounded-full bg-ink px-3 py-1.5 text-ink-foreground">{sum.deleted.length} deleted</span>}
      </div>
      {active.length === 0 ? (
        <div className="glass rounded-[28px] p-10 text-center text-muted-foreground">All entries have been deleted. Press Checklist Complete to see the report.</div>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 md:grid-cols-4 lg:grid-cols-6">
          {active.map((e) => (
            <li key={e.n} className={active.length > 300 ? "cv-auto" : undefined}>
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={menu?.n === e.n}
                aria-label={`Member ${e.n}, ${label(e.status)}`}
                onClick={(ev) => open(e.n, ev.currentTarget)}
                className={`relative flex h-24 w-full items-center justify-center rounded-[22px] border border-glass-border shadow-[var(--shadow-glass)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg active:scale-95 ${
                  e.status === "done" ? "card-done" : e.status === "not_done" ? "card-notdone" : "card-unmarked"
                } ${menu?.n === e.n ? "ring-4 ring-ring/40" : ""}`}
              >
                <span className="text-3xl font-extrabold tracking-tight">{e.n}</span>
                {e.status === "done" && <Check className="absolute right-3 top-3 h-5 w-5" strokeWidth={3} aria-hidden />}
                {e.status === "not_done" && <X className="absolute right-3 top-3 h-5 w-5" strokeWidth={3} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}

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
            <button role="menuitem" onClick={() => pick("done")} className={`${btn} justify-start bg-done-soft text-done-ink`}>
              <Check className="h-4 w-4" strokeWidth={3} /> Done
            </button>
            <button role="menuitem" onClick={() => pick("not_done")} className={`${btn} justify-start bg-notdone-soft text-notdone-ink`}>
              <X className="h-4 w-4" strokeWidth={3} /> Not Done
            </button>
            <button role="menuitem" onClick={() => pick("delete")} className={`${btn} btn-ink justify-start`}>
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ---------------- Report ---------------- */
type Tone = "done" | "notdone" | "ink" | "amber";
const toneCls: Record<Tone, { box: string; ink: string }> = {
  done: { box: "bg-done-soft", ink: "text-done-ink" },
  notdone: { box: "bg-notdone-soft", ink: "text-notdone-ink" },
  ink: { box: "btn-ink", ink: "text-ink-foreground" },
  amber: { box: "bg-amber-soft", ink: "text-amber-ink" },
};

function Section({ title, nums, tone }: { title: string; nums: number[]; tone: Tone }) {
  const [open, setOpen] = useState(false);
  const id = `sec-${title.replace(/\s/g, "")}`;
  return (
    <div className="glass overflow-hidden rounded-[24px]">
      <button
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
      </button>
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

function Report({ session, onNew }: { session: Session; onNew: () => void }) {
  const s = useMemo(() => summarize(session), [session]);
  const stats: { label: string; value: number; tone: Tone; icon: ReactNode }[] = [
    { label: "Done", value: s.done.length, tone: "done", icon: <Check className="h-5 w-5" strokeWidth={3} /> },
    { label: "Not Done", value: s.notDone.length, tone: "notdone", icon: <X className="h-5 w-5" strokeWidth={3} /> },
    { label: "Deleted", value: s.deleted.length, tone: "ink", icon: <Trash2 className="h-5 w-5" /> },
    { label: "Unmarked", value: s.unmarked.length, tone: "amber", icon: <CircleDashed className="h-5 w-5" /> },
  ];
  return (
    <div className="mx-auto w-full max-w-4xl px-4 pb-20 sm:px-6">
      <div className="anim-rise">
        <h1 className="text-4xl font-extrabold tracking-tight text-foreground sm:text-6xl">Checklist Report</h1>
        <p className="mt-2 text-lg text-muted-foreground">Here's the summary of your checklist.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Completed {fmtDate(session.completedAt ?? session.updatedAt)} · Started {fmtDate(session.createdAt)}
        </p>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-4">
        {stats.map((st, i) => (
          <div key={st.label} style={{ animationDelay: `${80 + i * 70}ms` }} className={`anim-rise rounded-[24px] p-5 ${toneCls[st.tone].box} ${toneCls[st.tone].ink}`}>
            <div className="flex items-center justify-between text-sm font-semibold">{st.label}{st.icon}</div>
            <div className="mt-3 text-5xl font-extrabold tracking-tight">{st.value}</div>
          </div>
        ))}
      </div>

      <div className="anim-rise glass mt-4 grid grid-cols-1 gap-4 rounded-[28px] p-6 sm:grid-cols-3" style={{ animationDelay: "380ms" }}>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Original total</p>
          <p className="text-3xl font-extrabold text-foreground">{s.total}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Active entries</p>
          <p className="text-3xl font-extrabold text-foreground">{s.active}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Completion (done ÷ active)</p>
          <p className="text-3xl font-extrabold text-primary">{pct(s.done.length, s.active)}</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={Math.round(s.completion)} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full btn-blue transition-all duration-700" style={{ width: `${s.completion}%` }} />
          </div>
        </div>
      </div>

      <div className="anim-rise mt-6 flex flex-col gap-3" style={{ animationDelay: "450ms" }}>
        <Section title="Done" nums={s.done} tone="done" />
        <Section title="Not Done" nums={s.notDone} tone="notdone" />
        <Section title="Deleted" nums={s.deleted} tone="ink" />
        <Section title="Unmarked" nums={s.unmarked} tone="amber" />
      </div>

      <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <button onClick={() => downloadReport(session)} className={`${btn} btn-blue w-full px-8 py-4 text-base sm:w-auto`}>
          <Download className="h-5 w-5" /> Download the Report
        </button>
        <button onClick={onNew} className={`${btnGhost} w-full sm:w-auto`}>Start a New Checklist</button>
      </div>
    </div>
  );
}

/* ---------------- App ---------------- */
export function ZChecklistApp() {
  const [ready, setReady] = useState(false);
  const [screen, setScreen] = useState<Screen>("welcome");
  const [session, setSession] = useState<Session | null>(null);
  const [prompt, setPrompt] = useState<Prompt>(null);
  const [pendingDelete, setPendingDelete] = useState<number | null>(null);
  const [storageFail, setStorageFail] = useState(false);

  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      setSession(saved);
      setPrompt("resume");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !session) return;
    setStorageFail(!saveSession(session));
  }, [session, ready]);

  const sum = useMemo(() => (session ? summarize(session) : null), [session]);

  const onWelcomeContinue = useCallback(() => {
    if (session) setPrompt("resume");
    else setScreen("setup");
  }, [session]);

  const resume = () => {
    if (!session) return;
    setPrompt(null);
    setScreen(session.stage === "report" ? "report" : "checklist");
  };

  const create = (n: number) => {
    setSession(createSession(n));
    setScreen("checklist");
  };

  const mark = (n: number, s: EntryStatus) => setSession((cur) => (cur ? setStatus(cur, n, s) : cur));

  const confirmDelete = () => {
    if (pendingDelete != null) setSession((cur) => (cur ? setStatus(cur, pendingDelete, "deleted") : cur));
    setPendingDelete(null);
    setPrompt(null);
  };

  const finish = () => {
    setPrompt(null);
    setSession((cur) => (cur ? { ...cur, stage: "report", completedAt: Date.now(), updatedAt: Date.now() } : cur));
    setScreen("report");
  };

  const onComplete = () => {
    if (sum && sum.unmarked.length > 0) setPrompt("unmarked");
    else finish();
  };

  const exit = () => {
    if (session) saveSession(session);
    setScreen("welcome");
  };

  const closePrompt = useCallback(() => { setPrompt(null); setPendingDelete(null); }, []);
  const isReport = session?.stage === "report";

  return (
    <div className="relative min-h-screen">
      <div className="aurora" aria-hidden>
        <div className="blob left-[-10%] top-[-10%] h-[55vh] w-[55vh] bg-brand-word/40" />
        <div className="blob right-[-10%] top-[10%] h-[60vh] w-[60vh] bg-primary/35" style={{ animationDelay: "-8s" }} />
        <div className="blob bottom-[-15%] left-[25%] h-[50vh] w-[50vh] bg-brand-z/25" style={{ animationDelay: "-16s" }} />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 flex h-[88px] items-center justify-between gap-3 px-4 sm:px-8">
          <Brand />
          {screen === "checklist" && (
            <div className="flex items-center gap-2">
              <button onClick={exit} className={`${btn} btn-red px-3 sm:px-5`} aria-label="Exit">
                <LogOut className="h-4 w-4 sm:hidden" aria-hidden /><span className="hidden sm:inline">Exit</span>
              </button>
              <button onClick={onComplete} className={`${btn} btn-blue px-3 sm:px-5`}>
                <CheckCheck className="h-4 w-4" aria-hidden /><span>Checklist Complete</span>
              </button>
            </div>
          )}
        </header>

        {storageFail && (
          <div role="status" className="mx-auto mb-4 flex items-center gap-2 rounded-full bg-amber-soft px-4 py-2 text-xs font-medium text-amber-ink">
            <AlertTriangle className="h-4 w-4" /> Saving isn't available in this browser — progress may not survive a refresh.
          </div>
        )}

        <main className="flex-1">
          {ready && (
            <div key={screen} className={screen === "welcome" ? "" : "anim-rise"}>
              {screen === "welcome" && <Welcome onContinue={onWelcomeContinue} />}
              {screen === "setup" && <Setup onCreate={create} />}
              {screen === "checklist" && session && (
                <Checklist session={session} onMark={mark} onRequestDelete={(n) => { setPendingDelete(n); setPrompt("deleteEntry"); }} />
              )}
              {screen === "report" && session && <Report session={session} onNew={() => setPrompt("confirmNew")} />}
            </div>
          )}
        </main>
      </div>

      {prompt === "resume" && session && (
        <Dialog title={isReport ? "Welcome back!" : "Welcome back!"} onClose={closePrompt}>
          <p className="mt-2 text-muted-foreground">
            {isReport
              ? "Your previous checklist is complete. Would you like to view its report or start a new checklist?"
              : "We found a saved checklist. Would you like to continue where you left off or start a new checklist?"}
          </p>
          <div className="mt-6 flex flex-col gap-2">
            <button data-autofocus onClick={resume} className={`${btn} btn-blue`}>
              {isReport ? "View Previous Report" : "Resume Existing Checklist"}
            </button>
            <button onClick={() => setPrompt("confirmNew")} className={btnGhost}>Start a New Checklist</button>
          </div>
        </Dialog>
      )}

      {prompt === "confirmNew" && (
        <Dialog title="Start a new checklist?" onClose={() => setPrompt(screen === "welcome" ? "resume" : null)}
          icon={<AlertTriangle className="h-8 w-8 text-amber-ink" />}>
          <p className="mt-2 text-muted-foreground">
            Your new checklist will replace the currently saved session once you create it.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button data-autofocus onClick={() => setPrompt(screen === "welcome" ? "resume" : null)} className={btnGhost}>Cancel</button>
            <button onClick={() => { setPrompt(null); setScreen("setup"); }} className={`${btn} btn-blue`}>Yes, start new</button>
          </div>
        </Dialog>
      )}

      {prompt === "deleteEntry" && pendingDelete != null && (
        <Dialog title={`Delete member #${pendingDelete}?`} onClose={closePrompt} icon={<Trash2 className="h-8 w-8 text-foreground" />}>
          <p className="mt-2 text-muted-foreground">This entry will be removed from the active checklist and preserved in your final report.</p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button data-autofocus onClick={closePrompt} className={btnGhost}>Cancel</button>
            <button onClick={confirmDelete} className={`${btn} btn-ink`}><Trash2 className="h-4 w-4" /> Delete</button>
          </div>
        </Dialog>
      )}

      {prompt === "unmarked" && sum && (
        <Dialog title="Some entries are still unmarked" onClose={closePrompt} icon={<AlertTriangle className="h-8 w-8 text-amber-ink" />}>
          <p className="mt-2 text-muted-foreground">
            You have {sum.unmarked.length} {sum.unmarked.length === 1 ? "entry" : "entries"} without a status. Would you like to return and finish them, or continue to the final report?
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button data-autofocus onClick={closePrompt} className={btnGhost}>Return to Checklist</button>
            <button onClick={finish} className={`${btn} btn-blue`}>Finish Anyway</button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
