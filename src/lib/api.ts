import { supabase } from "@/integrations/supabase/client";
import type { Category, Checklist } from "./zchecklist";

const COLS = "id, checklist_date, category, name, member_count, statuses, labels, version, created_at, updated_at, completed_at";

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

export async function createChecklist(input: { checklist_date: string; category: Category; name: string; member_count: number; statuses: string; labels?: Record<string, string> }) {
  const { data, error } = await supabase.from("checklists").insert(input).select(COLS).single();
  if (error) throw error;
  return data as Checklist;
}

export class ConflictError extends Error {
  constructor() { super("This checklist was changed on another device."); }
}

/** Optimistic-concurrency update: succeeds only when the stored version still matches. */
export async function updateChecklist(id: string, version: number, patch: { statuses?: string; labels?: Record<string, string>; completed_at?: string | null }) {
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

export interface Framework { id: string; name: string; member_count: number; labels: Record<string, string>; created_at: string; updated_at: string }
const FCOLS = "id, name, member_count, labels, created_at, updated_at";
export async function listFrameworks(): Promise<Framework[]> {
  const { data, error } = await supabase.from("frameworks").select(FCOLS).order("name");
  if (error) throw error;
  return data as Framework[];
}
export async function createFramework(input: { name: string; member_count: number; labels: Record<string, string> }) {
  const { data, error } = await supabase.from("frameworks").insert(input).select(FCOLS).single();
  if (error) throw error;
  return data as Framework;
}
export async function updateFramework(id: string, patch: { name?: string; labels?: Record<string, string> }) {
  const { data, error } = await supabase.from("frameworks").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).select(FCOLS).single();
  if (error) throw error;
  return data as Framework;
}
export async function deleteFramework(id: string) {
  const { error } = await supabase.from("frameworks").delete().eq("id", id);
  if (error) throw error;
}
