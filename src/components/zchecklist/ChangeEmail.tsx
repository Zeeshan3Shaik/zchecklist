import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { confirmEmailChange, requestEmailChange } from '@/lib/auth.functions';

export function ChangeEmail({ onChanged }: { onChanged: (email: string) => void }) {
  const request = useServerFn(requestEmailChange), confirm = useServerFn(confirmEmailChange);
  const [open, setOpen] = useState(false), [email, setEmail] = useState(''), [code, setCode] = useState('');
  const [sent, setSent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [remaining, setRemaining] = useState(0);
  useEffect(() => { if (!remaining) return; const timer = setTimeout(() => setRemaining((n) => n - 1), 1000); return () => clearTimeout(timer); }, [remaining]);
  const send = async () => { if (busy || remaining) return; setBusy(true); setError(''); try { const result = await request({ data: { email } }); setEmail(result.email); setSent(true); setCode(''); setRemaining(60); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't connect. Please retry."); } finally { setBusy(false); } };
  const verify = async (e: React.FormEvent) => { e.preventDefault(); if (busy) return; setBusy(true); setError(''); try {
    const result = await confirm({ data: { email, code } });
    if (!result.complete) { setError('Your email change needs an additional confirmation under the current account settings. Your email has not changed.'); return; }
    if (result.session) { const { error } = await supabase.auth.setSession(result.session); if (error) throw error; }
    await supabase.auth.refreshSession(); onChanged(result.email); setOpen(false); setSent(false); toast.success('Your email address has been updated successfully!');
  } catch (e) { setError(e instanceof Error ? e.message : "Couldn't verify. Please retry."); } finally { setBusy(false); } };
  return <><Button type="button" variant="outline" onClick={() => setOpen(true)}>Change Email</Button><Dialog open={open} onOpenChange={(value) => { if (!busy) setOpen(value); }}><DialogContent className="glass rounded-[28px]"><DialogTitle>{sent ? 'Verify new email' : 'Change Email'}</DialogTitle><form onSubmit={sent ? verify : (e) => { e.preventDefault(); void send(); }} className="space-y-4"><label className="block text-sm font-semibold">New email address<input aria-label="New email address" type="email" required disabled={sent || busy} value={email} onChange={(e) => setEmail(e.target.value)} className="mt-2 w-full rounded-2xl border border-glass-border bg-card p-3 text-foreground" /></label>{sent && <label className="block text-sm font-semibold">Verification code<input aria-label="Email change verification code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6,8}" required value={code} onChange={(e) => setCode(e.target.value)} className="mt-2 w-full rounded-2xl border border-glass-border bg-card p-3 text-foreground" /></label>}{error && <p role="alert" className="text-sm text-notdone-ink">{error}</p>}<Button type="submit" disabled={busy || (!sent && remaining > 0)} className="btn-blue">{busy ? 'One moment…' : sent ? 'Verify Email' : 'Send Verification Code'}</Button>{sent && <div className="flex flex-wrap gap-2"><Button type="button" variant="link" disabled={busy || remaining > 0} onClick={send}>{remaining ? `Resend in ${remaining}s` : 'Resend Code'}</Button><Button type="button" variant="link" disabled={busy} onClick={() => { setSent(false); setError(''); }}>Use Different Email</Button></div>}</form></DialogContent></Dialog></>;
}