import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

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

const emailInput = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
const unavailable = 'An account is already associated with this email address. Please use a different email.';

export const requestEmailChange = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => emailInput.parse(input))
  .handler(async ({ data, context }) => {
    const { data: identity, error: identityError } = await context.supabase.auth.getUser();
    if (identityError || !identity.user) throw new Error('Please sign in again.');
    if (identity.user.email?.toLowerCase() === data.email) throw new Error('Enter a different email address.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: result, error } = await supabaseAdmin.rpc('reserve_email_change', { _user_id: context.userId, _email: data.email });
    if (error) throw new Error("Couldn't check this email. Please try again.");
    if (result === 'unavailable') throw new Error(unavailable);
    if (result !== 'ready') throw new Error('Please wait 60 seconds before requesting another code.');
    const { error: sendError } = await context.supabase.auth.updateUser({ email: data.email });
    if (sendError) throw new Error(sendError.code === 'email_exists' ? unavailable : "Couldn't send verification. Please retry after 60 seconds.");
    return { email: data.email };
  });

export const confirmEmailChange = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => emailInput.extend({ code: z.string().trim().regex(/^\d{6,8}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: result, error } = await supabaseAdmin.rpc('claim_email_change_attempt', { _user_id: context.userId, _email: data.email });
    if (error) throw new Error("Couldn't verify. Please try again.");
    if (result === 'unavailable') throw new Error(unavailable);
    if (result === 'limited') throw new Error('Too many attempts. Request a new code after the cooldown.');
    if (result !== 'ready') throw new Error('This request has expired. Request a new code.');
    const { data: verified, error: verifyError } = await context.supabase.auth.verifyOtp({ email: data.email, token: data.code, type: 'email_change' });
    if (verifyError) throw new Error(verifyError.code === 'email_exists' ? unavailable : 'That code is invalid or expired. Please try again or resend.');
    if (verified.user?.id !== context.userId) throw new Error('Please sign in again.');
    // Secure-email-change may confirm just one half. Never report success until Auth reads back the new address.
    const { data: identity, error: readError } = await context.supabase.auth.getUser();
    if (readError || identity.user?.email?.toLowerCase() !== data.email) return { complete: false as const };
    await supabaseAdmin.from('email_change_requests').delete().eq('user_id', context.userId);
    return { complete: true as const, email: data.email, session: verified.session ? { access_token: verified.session.access_token, refresh_token: verified.session.refresh_token } : null };
  });