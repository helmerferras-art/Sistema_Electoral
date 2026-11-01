-- schema_digital_comms.sql
-- Run this on Supabase SQL Editor to enable persistence for the C4I module.

-- WhatsApp Campaigns Table
CREATE TABLE IF NOT EXISTS whatsapp_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    name TEXT NOT NULL,
    message_template TEXT NOT NULL,
    target_role TEXT,
    status TEXT CHECK (status IN ('draft', 'running', 'paused', 'completed')) DEFAULT 'draft',
    stats JSONB DEFAULT '{"sent": 0, "total": 0, "failed": 0}'::jsonb
);

-- Social Media Posts Table
CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    network TEXT CHECK (network IN ('facebook', 'instagram', 'tiktok')) NOT NULL,
    content TEXT NOT NULL,
    status TEXT CHECK (status IN ('scheduled', 'published')) DEFAULT 'scheduled',
    scheduled_at TIMESTAMPTZ
);

-- Social Media Inbox Table
CREATE TABLE IF NOT EXISTS social_inbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    network TEXT,
    comment TEXT NOT NULL,
    author TEXT,
    sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative', 'hostile')),
    author_avatar TEXT,
    suggested_response TEXT,
    status TEXT CHECK (status IN ('pending', 'replied', 'discarded')) DEFAULT 'pending'
);

-- Enable RLS
ALTER TABLE whatsapp_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_inbox ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Tenant access whatsapp_campaigns" ON whatsapp_campaigns
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Tenant access social_posts" ON social_posts
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Tenant access social_inbox" ON social_inbox
    FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE whatsapp_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE social_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE social_inbox;
