-- schema_social.sql
-- Run this in the Supabase SQL Editor to enable social media account tracking

CREATE TABLE IF NOT EXISTS social_accounts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
    network     TEXT NOT NULL CHECK (network IN ('facebook', 'instagram', 'tiktok')),
    account_name TEXT NOT NULL,
    platform_account_id TEXT,
    access_token TEXT,
    status      TEXT DEFAULT 'connected',
    last_sync   TIMESTAMPTZ DEFAULT NOW(),
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT  social_accounts_tenant_net_unique UNIQUE (tenant_id, network)
);

CREATE TABLE IF NOT EXISTS social_posts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
    network      TEXT NOT NULL,
    content      TEXT NOT NULL,
    status       TEXT DEFAULT 'scheduled',
    scheduled_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_inbox (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id    UUID REFERENCES tenants(id) ON DELETE CASCADE,
    network      TEXT,
    author       TEXT,
    comment      TEXT NOT NULL,
    sentiment    TEXT,
    suggested_response TEXT,
    status       TEXT DEFAULT 'pending',
    created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_inbox    ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to allow re-running script
DROP POLICY IF EXISTS "Tenant access social_accounts" ON social_accounts;
CREATE POLICY "Tenant access social_accounts" ON social_accounts FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Tenant access social_posts" ON social_posts;
CREATE POLICY "Tenant access social_posts" ON social_posts FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Tenant access social_inbox" ON social_inbox;
CREATE POLICY "Tenant access social_inbox" ON social_inbox FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

