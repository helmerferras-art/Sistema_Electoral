-- Tablas para el módulo de Redes Sociales (C4I Digital Hub)

-- 1. Cuentas de Redes Sociales vinculadas
CREATE TABLE IF NOT EXISTS social_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    network TEXT NOT NULL, -- 'facebook', 'instagram', 'tiktok'
    account_name TEXT NOT NULL,
    platform_account_id TEXT, -- ID real en la plataforma (ej: page_id de FB)
    access_token TEXT, -- Token de larga duración
    refresh_token TEXT, -- Token de refresco
    status TEXT DEFAULT 'connected',
    last_sync TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Publicaciones programadas/realizadas
CREATE TABLE IF NOT EXISTS social_posts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    network TEXT NOT NULL,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'scheduled', -- 'scheduled', 'published'
    scheduled_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Inbox Inteligente (Comentarios y mensajes)
CREATE TABLE IF NOT EXISTS social_inbox (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    network TEXT, -- 'facebook', 'instagram', 'tiktok'
    author TEXT,
    comment TEXT NOT NULL,
    sentiment TEXT, -- 'positive', 'neutral', 'negative', 'hostile'
    suggested_response TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'replied', 'discarded'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_inbox ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso para social_accounts
CREATE POLICY "Users can view accounts of their tenant" ON social_accounts
    FOR SELECT USING (true); -- Simplificado para desarrollo, o usar: (tenant_id = auth.uid_tenant_id())

CREATE POLICY "Users can manage accounts of their tenant" ON social_accounts
    FOR ALL USING (true) WITH CHECK (true);

-- Políticas de acceso para social_posts
CREATE POLICY "Users can view posts of their tenant" ON social_posts
    FOR SELECT USING (true);

CREATE POLICY "Users can manage posts of their tenant" ON social_posts
    FOR ALL USING (true) WITH CHECK (true);

-- Políticas de acceso para social_inbox
CREATE POLICY "Users can view inbox of their tenant" ON social_inbox
    FOR SELECT USING (true);

CREATE POLICY "Users can manage inbox of their tenant" ON social_inbox
    FOR ALL USING (true) WITH CHECK (true);
