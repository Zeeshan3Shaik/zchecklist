import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Resolves the sign-in identity only on the server; never exposes an email lookup. */
export const loginWithUsername = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ username: z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,24}$/), password: z.string().min(1).max(72) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin.from("profiles").select("id").eq("username", data.username).maybeSingle();
    const identity = profile ? await supabaseAdmin.auth.admin.getUserById(profile.id) : null;
    const email = identity?.data.user?.email ?? `${data.username}@users.zchecklist.app`;
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
    const url = process.env["SUPABASE_URL"];
    if (!key || !url) throw new Error("Sign in is temporarily unavailable.");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers });
    } } });
    // Cloud Auth owns password verification, confirmation checks and attempt limits.
    const { data: result, error } = await client.auth.signInWithPassword({ email, password: data.password });
    if (error || !result.session) return { ok: false as const };
    return { ok: true as const, session: { access_token: result.session.access_token, refresh_token: result.session.refresh_token } };
  });