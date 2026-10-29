import { supabase } from "@/integrations/supabase/client";
import type { Category, Checklist } from "./zchecklist";

const COLS = "id, checklist_date, category, name, member_count, statuses, version, created_at, updated_at, completed_at";

export async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from("profiles").select("name, username").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function listChecklists(): Promise<Checklist[]> {
  const out: Checklist[] = [];
  const page = 500;
  for (let from = 0; ; from += page) {
    const { data, error } = await supabase.from("checklists").select(COLS)
      .order("checklist_date", { ascending: false }).order("created_at", { ascending: false })
      .range(from, from + page - 1);
    if (error) throw error;
    out.push(...(data as Checklist[]));
    if (!data || data.length < page) break;
  }
  return out;
}

export async function getChecklist(id: string): Promise<Checklist | null> {
  const { data, error } = await supabase.from("checklists").select(COLS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Checklist | null;
}

export async function createChecklist(input: { checklist_date: string; category: Category; name: string; member_count: number; statuses: string }) {
  const { data, error } = await supabase.from("checklists").insert(input).select(COLS).single();
  if (error) throw error;
  return data as Checklist;
}

export class ConflictError extends Error {
  constructor() { super("This checklist was changed on another device."); }
}

/** Optimistic-concurrency update: succeeds only when the stored version still matches. */
export async function updateChecklist(id: string, version: number, patch: { statuses?: string; completed_at?: string }) {
  const { data, error } = await supabase.from("checklists").update(patch).eq("id", id).eq("version", version).select(COLS).maybeSingle();
  if (error) throw error;
  if (!data) throw new ConflictError();
  return data as Checklist;
}

export async function deleteChecklist(id: string) {
  const { error, count } = await supabase.from("checklists").delete({ count: "exact" }).eq("id", id);
  if (error) throw error;
  if (!count) throw new Error("Report not found.");
}
