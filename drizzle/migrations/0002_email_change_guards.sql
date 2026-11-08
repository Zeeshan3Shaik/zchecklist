CREATE TABLE public.email_change_requests (user_id uuid PRIMARY KEY, pending_email text NOT NULL, sent_at timestamptz NOT NULL DEFAULT now(), attempts integer NOT NULL DEFAULT 0);
GRANT ALL ON public.email_change_requests TO service_role;
ALTER TABLE public.email_change_requests ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.reserve_email_change(_user_id uuid, _email text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE last_sent timestamptz;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext(_user_id::text));
 IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email) = lower(_email) AND id <> _user_id) THEN RETURN 'unavailable'; END IF;
 SELECT sent_at INTO last_sent FROM public.email_change_requests WHERE user_id = _user_id;
 IF last_sent > now() - interval '60 seconds' THEN RETURN 'cooldown'; END IF;
 INSERT INTO public.email_change_requests(user_id,pending_email,sent_at,attempts) VALUES (_user_id,lower(_email),now(),0) ON CONFLICT(user_id) DO UPDATE SET pending_email=excluded.pending_email,sent_at=excluded.sent_at,attempts=0;
 RETURN 'ready';
END $$;
REVOKE ALL ON FUNCTION public.reserve_email_change(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_email_change(uuid,text) TO service_role;
CREATE OR REPLACE FUNCTION public.claim_email_change_attempt(_user_id uuid, _email text) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE req public.email_change_requests;
BEGIN
 SELECT * INTO req FROM public.email_change_requests WHERE user_id=_user_id FOR UPDATE;
 IF NOT FOUND OR req.pending_email <> lower(_email) OR req.sent_at < now()-interval '1 hour' THEN RETURN 'expired'; END IF;
 IF req.attempts >= 5 THEN RETURN 'limited'; END IF;
 UPDATE public.email_change_requests SET attempts=attempts+1 WHERE user_id=_user_id;
 IF EXISTS (SELECT 1 FROM auth.users WHERE lower(email)=lower(_email) AND id<>_user_id) THEN RETURN 'unavailable'; END IF;
 RETURN 'ready';
END $$;
REVOKE ALL ON FUNCTION public.claim_email_change_attempt(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_change_attempt(uuid,text) TO service_role;