import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { loginWithUsername } from "@/lib/auth.functions";
import { validateDisplayName, validatePassword, validateUsername } from "@/lib/zchecklist";

const input = "w-full rounded-2xl border border-glass-border bg-card px-4 py-3 text-foreground outline-none focus:ring-4 focus:ring-ring/30";
const action = "btn-blue min-h-11 rounded-2xl px-5 py-3 font-semibold";
export function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [visible, setVisible] = useState(false);
  return <label className="block text-sm font-semibold">{label}<span className="relative mt-2 block"><input aria-label={label} type={visible ? "text" : "password"} autoComplete="current-password" value={value} onChange={(e) => onChange(e.target.value)} className={`${input} pr-12`} /><Button type="button" variant="ghost" size="icon" aria-label={visible ? "Hide password" : "Show password"} onClick={() => setVisible(!visible)} className="absolute right-2 top-2">{visible ? <EyeOff /> : <Eye />}</Button></span></label>;
}

export function AccountAuth() {
  const login = useServerFn(loginWithUsername);
  const [mode, setMode] = useState<"in" | "up" | "verify" | "forgot">("in");
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [username, setUsername] = useState(""); const [password, setPassword] = useState("");
  const [code, setCode] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [cooldown, setCooldown] = useState(0);
  const resend = async () => {
    if (Date.now() < cooldown || busy) return;
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: window.location.origin } });
    setBusy(false); if (error) setError(error.message); else { setCooldown(Date.now() + 60000); toast.success("Confirmation email requested."); }
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return; setError(""); setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        toast.success("If this email is registered, recovery instructions have been requested.", { duration: 5000 }); setMode("in");
      } else if (mode === "verify") {
        const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "signup" });
        if (error) throw new Error("That code is invalid or expired. Try again or resend the email.");
        await supabase.auth.signOut(); setPassword(""); setMode("in"); toast.success("Account verified. Please log in now.");
      } else {
        const u = validateUsername(username); if (!u.ok) throw new Error(u.error);
        if (mode === "up") {
          const n = validateDisplayName(name); if (!n.ok) throw new Error(n.error);
          const p = validatePassword(password); if (!p.ok) throw new Error(p.error);
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) throw new Error("Enter a valid email address.");
          const { error, data } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: window.location.origin, data: { name: n.value, username: u.value } } });
          if (error || data.user?.identities?.length === 0) throw new Error("Couldn't create this account. The username or email may already be registered.");
          setMode("verify"); setCooldown(Date.now() + 60000);
        } else {
          const result = await login({ data: { username: u.value, password } });
          if (!result.ok) throw new Error("Wrong username or password, or email not yet verified.");
          const { error } = await supabase.auth.setSession(result.session); if (error) throw error;
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't connect. Please try again."); }
    finally { setBusy(false); }
  };
  return <div className="mx-auto flex min-h-[calc(100vh-88px)] max-w-md items-center px-4 py-8"><form onSubmit={submit} className="glass w-full space-y-5 rounded-[28px] p-7">
    <div className="flex gap-3"><Button type="button" variant="ghost" onClick={() => setMode("in")}>Log In</Button><Button type="button" variant="ghost" onClick={() => setMode("up")}>Create Account</Button></div>
    <h1 className="text-3xl font-extrabold">{mode === "verify" ? "Verify your email" : mode === "forgot" ? "Password recovery" : mode === "up" ? "Create your account" : "Welcome back"}</h1>
    {mode === "up" && <label className="block text-sm font-semibold">Name<input aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-2`} autoComplete="name" /></label>}
    {(mode === "up" || mode === "forgot") && <label className="block text-sm font-semibold">Email address<input aria-label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mt-2`} autoComplete="email" required /></label>}
    {(mode === "up" || mode === "in") && <><label className="block text-sm font-semibold">Username<input aria-label="Username" value={username} onChange={(e) => setUsername(e.target.value)} className={`${input} mt-2`} autoComplete="username" autoCapitalize="none" /></label><PasswordField label="Password" value={password} onChange={setPassword} /></>}
    {mode === "in" && <Button type="button" variant="link" onClick={() => setMode("forgot")} className="px-0">Forgot Password?</Button>}
    {mode === "verify" && <><p className="text-sm text-muted-foreground">Check your email to confirm your account. If your email contains a code, enter it below; otherwise follow its confirmation link.</p><input aria-label="Verification code" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" className={input} /><Button type="button" variant="link" onClick={resend} disabled={busy}>Resend confirmation email</Button></>}
    {error && <p role="alert" className="text-sm text-notdone-ink">{error}</p>}
    <Button type="submit" disabled={busy} className={`${action} w-full`}>{busy ? "One moment…" : mode === "up" ? "Create My Account" : mode === "verify" ? "Verify" : mode === "forgot" ? "Send recovery email" : "Log In"}</Button>
  </form></div>;
}

export function ProfileScreen({ user, onSaved }: { user: User; onSaved: () => void }) {
  const [name, setName] = useState(""); const [username, setUsername] = useState(""); const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!loaded) { setLoaded(true); void supabase.from("profiles").select("name, username").eq("id", user.id).single().then(({ data }) => { if (data) { setName(data.name); setUsername(data.username); } }); }
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (busy) return;
    const n = validateDisplayName(name), u = validateUsername(username);
    if (!n.ok) return toast.error(n.error); if (!u.ok) return toast.error(u.error);
    setBusy(true); const { error } = await supabase.from("profiles").update({ name: n.value, username: u.value }).eq("id", user.id); setBusy(false);
    if (error) toast.error("Couldn't save. This username may already be taken."); else { toast.success("Profile saved."); onSaved(); }
  };
  return <form onSubmit={save} className="glass mx-auto max-w-lg space-y-5 rounded-[28px] p-7"><h1 className="text-3xl font-extrabold">Profile</h1><label className="block">Name<input aria-label="Name" className={input} value={name} onChange={(e) => setName(e.target.value)} /></label><label className="block">Username<input aria-label="Username" className={input} value={username} onChange={(e) => setUsername(e.target.value)} /></label><p className="break-all text-sm text-muted-foreground">Email: {user.email}</p><Button disabled={busy} className={action}>Save Profile</Button><h2 className="text-xl font-bold">Security &amp; Password</h2><Button type="button" variant="outline" onClick={async () => { if (!user.email) return; const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/reset-password` }); if (error) toast.error("Couldn't request recovery."); else toast.success("Password recovery instructions requested. Check your email."); }}>Reset Password</Button></form>;
}

export function RecoveryScreen() {
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false);
  const start = async () => { const { data } = await supabase.auth.getUser(); setReady(!!data.user); };
  return <form onSubmit={async (e) => { e.preventDefault(); const p = validatePassword(password); if (!p.ok) return toast.error(p.error); if (password !== confirm) return toast.error("Passwords don't match."); setBusy(true); const { error } = await supabase.auth.updateUser({ password }); setBusy(false); if (error) toast.error(error.message); else { await supabase.auth.signOut(); window.location.assign("/"); } }} className="glass mx-auto mt-16 max-w-md space-y-5 rounded-[28px] p-7"><h1 className="text-3xl font-extrabold">Set a new password</h1>{!ready ? <Button type="button" onClick={start}>Continue with recovery link</Button> : <><PasswordField label="New password" value={password} onChange={setPassword} /><PasswordField label="Confirm new password" value={confirm} onChange={setConfirm} /><Button disabled={busy} className={action}>Save New Password</Button></>}</form>;
}