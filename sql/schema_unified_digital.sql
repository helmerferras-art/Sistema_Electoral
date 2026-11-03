-- schema_unified_digital.sql
-- Master Schema for Digital Hub: SMS, WhatsApp, and Social Media
-- RUN THIS IN SUPABASE SQL EDITOR TO FIX 404 ERRORS

-- 1. SOCIAL ACCOUNTS (Platforms connections)
CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    network TEXT NOT NULL, -- 'facebook', 'instagram', 'tiktok'
    account_name TEXT NOT NULL,
    platform_account_id TEXT,
    access_token TEXT,
    refresh_token TEXT,
    status TEXT DEFAULT 'connected',
    last_sync TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. WHATSAPP CAMPAIGNS (Massive Messaging)
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    message_template TEXT NOT NULL,
    target_role TEXT,
    status TEXT CHECK (status IN ('draft', 'running', 'paused', 'completed')) DEFAULT 'draft',
    stats JSONB DEFAULT '{"sent": 0, "total": 0, "failed": 0}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. SOCIAL POSTS (Planned Content)
CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    network TEXT CHECK (network IN ('facebook', 'instagram', 'tiktok')) NOT NULL,
    content TEXT NOT NULL,
    status TEXT CHECK (status IN ('scheduled', 'published')) DEFAULT 'scheduled',
    scheduled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. SMART INBOX (Comments & Messages)
CREATE TABLE IF NOT EXISTS social_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    network TEXT,
    comment TEXT NOT NULL,
    author TEXT,
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'hostile', 'unknown')),
    author_avatar TEXT,
    suggested_response TEXT,
    status TEXT CHECK (status IN ('pending', 'replied', 'discarded')) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SECURITY: ENABLE ROW LEVEL SECURITY
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_inbox ENABLE ROW LEVEL SECURITY;

-- POLICIES: MULTI-TENANT ISOLATION
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenant access social_accounts') THEN
        CREATE POLICY "Tenant access social_accounts" ON social_accounts FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenant access whatsapp_campaigns') THEN
        CREATE POLICY "Tenant access whatsapp_campaigns" ON whatsapp_campaigns FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenant access social_posts') THEN
        CREATE POLICY "Tenant access social_posts" ON social_posts FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Tenant access social_inbox') THEN
        CREATE POLICY "Tenant access social_inbox" ON social_inbox FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));
    END IF;
END $$;

-- REAL-TIME PERSISTENCE
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_campaigns, social_posts, social_inbox;
