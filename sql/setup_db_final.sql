-- setup_c4i_audit_social.sql
-- Unified setup for Audit and Social Media features.
-- Run the FULL content of this script in the Supabase SQL Editor.

-- =====================================================
-- 1. TABLES (Audit)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.audit_pitch (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    script      TEXT NOT NULL DEFAULT '',
    updated_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_by  UUID REFERENCES public.users(id),
    CONSTRAINT  audit_pitch_tenant_unique UNIQUE (tenant_id)
);

CREATE TABLE IF NOT EXISTS public.audit_call_log (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    supporter_id UUID REFERENCES public.supporters(id) ON DELETE CASCADE,
    agent_id     UUID REFERENCES public.users(id),
    called_at    TIMESTAMPTZ DEFAULT NOW(),
    outcome      TEXT CHECK (outcome IN ('simpatiza', 'no_disponible', 'rechazo', 'sin_servicio', 'buzon'))
);

-- =====================================================
-- 2. TABLES (Social Media)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.social_accounts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    network     TEXT NOT NULL CHECK (network IN ('facebook', 'instagram', 'tiktok')),
    account_name TEXT NOT NULL,
    platform_account_id TEXT,
    access_token TEXT,
    status      TEXT DEFAULT 'connected',
    last_sync   TIMESTAMPTZ DEFAULT NOW(),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT  social_accounts_tenant_net_unique UNIQUE (tenant_id, network)
);

-- Ensure columns exist if table already existed without them
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS platform_account_id TEXT;
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS access_token TEXT;
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'connected';
ALTER TABLE public.social_accounts ADD COLUMN IF NOT EXISTS last_sync TIMESTAMPTZ DEFAULT NOW();


CREATE TABLE IF NOT EXISTS public.social_posts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    network      TEXT NOT NULL,
    content      TEXT NOT NULL,
    status       TEXT DEFAULT 'scheduled',
    scheduled_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled';
ALTER TABLE public.social_posts ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;


CREATE TABLE IF NOT EXISTS public.social_inbox (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    network      TEXT,
    author       TEXT,
    comment      TEXT NOT NULL,
    sentiment    TEXT,
    suggested_response TEXT,
    status       TEXT DEFAULT 'pending',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.social_inbox ADD COLUMN IF NOT EXISTS network TEXT;
ALTER TABLE public.social_inbox ADD COLUMN IF NOT EXISTS author TEXT;
ALTER TABLE public.social_inbox ADD COLUMN IF NOT EXISTS sentiment TEXT;
ALTER TABLE public.social_inbox ADD COLUMN IF NOT EXISTS suggested_response TEXT;
ALTER TABLE public.social_inbox ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';


-- =====================================================
-- 3. ENABLE RLS
-- =====================================================
ALTER TABLE public.audit_pitch    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_call_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_inbox    ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 4. POLICIES (Idempotent)
-- =====================================================

DO $$ 
BEGIN
    -- Audit Pitch
    DROP POLICY IF EXISTS "Tenant access audit_pitch" ON public.audit_pitch;
    CREATE POLICY "Tenant access audit_pitch" ON public.audit_pitch 
        FOR ALL USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

    -- Audit Call Log
    DROP POLICY IF EXISTS "Tenant access audit_call_log" ON public.audit_call_log;
    CREATE POLICY "Tenant access audit_call_log" ON public.audit_call_log 
        FOR ALL USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

    -- Social Accounts
    DROP POLICY IF EXISTS "Tenant access social_accounts" ON public.social_accounts;
    CREATE POLICY "Tenant access social_accounts" ON public.social_accounts 
        FOR ALL USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

    -- Social Posts
    DROP POLICY IF EXISTS "Tenant access social_posts" ON public.social_posts;
    CREATE POLICY "Tenant access social_posts" ON public.social_posts 
        FOR ALL USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

    -- Social Inbox
    DROP POLICY IF EXISTS "Tenant access social_inbox" ON public.social_inbox;
    CREATE POLICY "Tenant access social_inbox" ON public.social_inbox 
        FOR ALL USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));
END $$;

-- =====================================================
-- 5. REALTIME
-- =====================================================
DO $$ 
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_pitch;
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'Table audit_pitch already in publication';
    END;

    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.audit_call_log;
    EXCEPTION WHEN duplicate_object THEN
        RAISE NOTICE 'Table audit_call_log already in publication';
    END;
END $$;

