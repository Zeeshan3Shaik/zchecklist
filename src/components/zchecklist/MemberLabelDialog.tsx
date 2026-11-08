import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { validateLabel } from '@/lib/zchecklist';

export function MemberLabelDialog({ member, initial, onSave, onClose }: { member: number; initial: string; onSave: (name: string | null) => void; onClose: () => void }) {
  const [name, setName] = useState(initial), [error, setError] = useState('');
  return <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}><DialogContent className="glass rounded-[28px]"><DialogTitle>Add Label · Member {member}</DialogTitle><form className="space-y-4" onSubmit={(e) => { e.preventDefault(); const result = name.trim() ? validateLabel(name) : { ok: true as const, value: null }; if (!result.ok) { setError(result.error); return; } onSave(result.value); onClose(); }}><input autoFocus aria-label={`Name for member ${member}`} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-2xl border border-glass-border bg-card p-3 text-foreground" />{error && <p role="alert" className="text-notdone-ink">{error}</p>}<div className="flex gap-2"><Button type="submit" className="btn-blue">Save Label</Button><Button type="button" variant="outline" onClick={() => { onSave(null); onClose(); }}>Clear Label</Button></div></form></DialogContent></Dialog>;
}