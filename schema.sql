-- Drop existing tables if they exist (for MVP setup)
DROP TABLE IF EXISTS d_day_reports CASCADE;
DROP TABLE IF EXISTS d_day_targets CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS broadcast_messages CASCADE;
DROP TABLE IF EXISTS critical_path CASCADE;
DROP TABLE IF EXISTS resource_logs CASCADE;
DROP TABLE IF EXISTS resource_assignments CASCADE;
DROP TABLE IF EXISTS resources CASCADE;
DROP TABLE IF EXISTS supporters CASCADE;
DROP TABLE IF EXISTS map_layers CASCADE;
DROP TABLE IF EXISTS global_map_layers CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- Create Tenants (Candidates / Campaigns)
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL, -- e.g., "Campaña Juan Pérez V6"
  description TEXT,
  owner_id UUID, -- Will link to the superadmin or primary admin user
  is_active BOOLEAN DEFAULT true,
  -- Political Scope for Map Filtering
  election_type TEXT CHECK (election_type IN ('federal', 'local')),
  position TEXT, -- e.g., 'presidencia', 'senaduria', 'diputacion_federal', 'gubernatura', 'diputacion_local', 'presidencia_municipal'
  geographic_scope TEXT -- e.g., 'Tuxtla Gutiérrez', 'Distrito 6' (This matches the GeoJSON name property)
);

-- Create users table (with SaaS Roles and RPG Elements)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- SaaS Isolation
  auth_id UUID, -- For future Supabase Auth linkage
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE,
  -- SaaS & Custom RPG Ranks
  -- superadmin (Global), candidato (Tenant Manager), coordinador_logistica (Inventario), coordinador, lider, brigadista
  role TEXT CHECK (role IN ('superadmin', 'candidato', 'coordinador_campana', 'comunicacion_digital', 'coordinador_logistica', 'coordinador', 'lider', 'brigadista')) DEFAULT 'brigadista',
  parent_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Pyramid hierarchy within tenant
  
  -- Territorial Jurisdiction for the Map
  -- e.g., {"layer_type": "seccion", "zone_ids": ["1204", "1205"]}
  assigned_territory JSONB,

  -- Gamification Stats
  xp INTEGER DEFAULT 0,
  rank_name TEXT DEFAULT 'Brigadista Nivel 1',
  current_streak INTEGER DEFAULT 0,
  last_action_date DATE
);

-- Add ForeignKey after table creation to avoid circular dependency
ALTER TABLE tenants ADD CONSTRAINT fk_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL;

-- Create supporters table (Base level) with XP tracking
CREATE TABLE supporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  phone TEXT,
  curp TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  commitment_level INTEGER CHECK (commitment_level >= 1 AND commitment_level <= 5) DEFAULT 1,
  offline_id TEXT UNIQUE,
  recruiter_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Brigadista that captured it
  section_id TEXT, -- For Fog of War logic
  status TEXT CHECK (status IN ('pendiente', 'aprobado', 'rechazado')) DEFAULT 'pendiente',
  photo_evidence_url TEXT -- Extra XP if provided
);

-- ----------------------------------------------------
-- NOTIFICATIONS (HUD & Gamification)
-- ----------------------------------------------------
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT CHECK (type IN ('achievement', 'mission', 'alert', 'system')) DEFAULT 'system',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------
-- HISTORICAL ELECTION RESULTS (15 Years Analytics)
-- ----------------------------------------------------
CREATE TABLE historical_election_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  election_year INTEGER NOT NULL, -- e.g., 2009, 2012, 2015, 2018, 2021, 2024
  election_type TEXT NOT NULL, -- 'ayuntamiento', 'gubernatura', 'diputacion_local', 'presidencia'
  state TEXT DEFAULT 'Chiapas',
  municipality TEXT NOT NULL, -- e.g., 'Tuxtla Gutiérrez'
  section_id TEXT NOT NULL, -- e.g., '1683'
  total_votes INTEGER DEFAULT 0,
  winning_votes INTEGER DEFAULT 0, -- Votes of the 1st place
  second_place_votes INTEGER DEFAULT 0, -- Votes of the 2nd place
  nominal_list_size INTEGER DEFAULT 0, -- Tamaño de la lista nominal
  target_votes_calculated INTEGER DEFAULT 0,
  party_results JSONB, -- party_name: votes
  colonia TEXT,
  municipality_id TEXT -- Logical grouping for campaigns
);

-- Resources Inventory (Loot / Assets)
CREATE TABLE resources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  type TEXT CHECK (type IN ('vehiculo', 'audio', 'gasolina', 'espacio', 'playeras', 'lonas', 'recompensa_loot')),
  quantity INTEGER DEFAULT 1,
  total_cost DOUBLE PRECISION DEFAULT 0
);

-- Resource/Loot Assignments to Leaders
CREATE TABLE resource_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  resource_id UUID REFERENCES resources(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_date TIMESTAMPTZ DEFAULT NOW(),
  return_date TIMESTAMPTZ,
  is_loot BOOLEAN DEFAULT false,
  quantity INTEGER DEFAULT 1
);

-- Resource Usage Logs with Photo and GPS
CREATE TABLE resource_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id UUID REFERENCES resource_assignments(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  photo_url TEXT,
  notes TEXT
);

-- Module 4: Dia D Boss Fight Targets
CREATE TABLE d_day_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  casilla_id TEXT NOT NULL,
  target_votes INTEGER NOT NULL,
  current_votes INTEGER DEFAULT 0,
  status TEXT CHECK (status IN ('en_combate', 'conquistada', 'perdida')) DEFAULT 'en_combate',
  UNIQUE(tenant_id, casilla_id)
);

-- Module 4: Dia D Attack Reports
CREATE TABLE d_day_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  casilla_id TEXT, -- Logical link, can be null if general report
  target_id UUID REFERENCES d_day_targets(id) ON DELETE CASCADE,
  report_text TEXT,
  damage_points INTEGER DEFAULT 0,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  photo_url TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  reporter_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- Module 5: Critical Path (Ruta Crítica)
CREATE TABLE critical_path (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT NOT NULL,
  description TEXT,
  phase TEXT CHECK (phase IN ('Candidatura', 'Eleccion')) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT CHECK (status IN ('pendiente', 'en_progreso', 'completado', 'retrasado')) DEFAULT 'pendiente',
  parent_task_id UUID REFERENCES critical_path(id) ON DELETE SET NULL
);

-- Module 6: Broadcast / Direct Candidate Communication (Legendary Missions)
CREATE TABLE broadcast_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  message_text TEXT NOT NULL,
  media_url TEXT,
  is_legendary_mission BOOLEAN DEFAULT false,
  target_level TEXT CHECK (target_level IN ('all', 'coordinador', 'lider', 'brigadista')) DEFAULT 'all'
);

-- Module 7: Global Master Geographic Layers (Multi-Tenant Base)
CREATE TABLE global_map_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  layer_name TEXT NOT NULL, -- e.g., "Distritos Federales de Chiapas", "Municipios"
  geojson_url TEXT NOT NULL, -- URL to Supabase Storage Bucket
  layer_type TEXT CHECK (layer_type IN ('entidad', 'municipio', 'distrito_local', 'distrito_federal', 'seccion', 'colonia', 'localidad')),
  is_active BOOLEAN DEFAULT true,
  color_hex TEXT DEFAULT '#00D4FF' -- Neon color for the outline
);

-- Module 8: Social Media & C4I Analytics (Reputation)
CREATE TABLE social_media_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  date DATE NOT NULL,
  platform TEXT CHECK (platform IN ('facebook', 'twitter', 'instagram', 'tiktok', 'news')),
  positive_mentions INTEGER DEFAULT 0,
  neutral_mentions INTEGER DEFAULT 0,
  negative_mentions INTEGER DEFAULT 0,
  total_engagement INTEGER DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  top_keywords TEXT[] -- Array of trending words (e.g. 'seguridad', 'debate')
);

-- Allow anonymous inserts for MVP (Offline / Auto-Registration)
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE supporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE resource_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE d_day_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE d_day_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_path ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE global_map_layers ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE historical_election_results ENABLE ROW LEVEL SECURITY;

-- 1. Tenants: Only superadmins or members can see their own tenant info
CREATE POLICY "Tenants visibility" ON tenants FOR SELECT USING (true); -- Public for registration/lookup

-- 2. Users: Users can see themselves and their subordinates
CREATE POLICY "Users visibility" ON users FOR SELECT 
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- 3. Supporters: Granular hierarchical access
CREATE POLICY "Supporters hierarchical lookup" ON supporters FOR SELECT
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Brigadista insert own supporters" ON supporters FOR INSERT
WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()) AND recruiter_id = auth.uid());

CREATE POLICY "Brigadista update own supporters" ON supporters FOR UPDATE
USING (recruiter_id = auth.uid());

-- 4. Resources: Logistics & High Command only for mutations
CREATE POLICY "Resources visibility" ON resources FOR SELECT
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Logistics manage resources" ON resources FOR ALL
USING (auth.uid() IN (SELECT id FROM users WHERE role IN ('superadmin', 'coordinador_logistica', 'coordinador_campana')));

-- 5. Day D: Operations
CREATE POLICY "Day D targets visibility" ON d_day_targets FOR SELECT
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

CREATE POLICY "Day D reports insertion" ON d_day_reports FOR INSERT
WITH CHECK (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- 6. Notifications & Broadcast
CREATE POLICY "Notifications self-view" ON notifications FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Broadcast tenant-wide" ON broadcast_messages FOR SELECT
USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()));

-- 7. Historical Data
CREATE POLICY "Historical results visibility" ON historical_election_results FOR SELECT USING (true);

-- Enable realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE d_day_targets;
    ALTER PUBLICATION supabase_realtime ADD TABLE d_day_reports;
    ALTER PUBLICATION supabase_realtime ADD TABLE supporters;
    ALTER PUBLICATION supabase_realtime ADD TABLE users;
    ALTER PUBLICATION supabase_realtime ADD TABLE broadcast_messages;
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;

-- ----------------------------------------------------
-- GAMIFICATION LEVEL-UP TRIGGER
-- ----------------------------------------------------
CREATE OR REPLACE FUNCTION check_level_up()
RETURNS TRIGGER AS $$
DECLARE
  old_level INT;
  new_level INT;
  xp_required_per_level INT := 500;
  new_rank TEXT;
BEGIN
  -- Only run logic if XP actually changed
  IF NEW.xp IS DISTINCT FROM OLD.xp THEN
    old_level := COALESCE(floor(OLD.xp / xp_required_per_level), 0);
    new_level := COALESCE(floor(NEW.xp / xp_required_per_level), 0);

    IF new_level > old_level THEN
        -- Calculate new rank name based on level
        IF new_level = 1 THEN new_rank := 'Guardián Táctico';
        ELSIF new_level = 2 THEN new_rank := 'Operador de Campo';
        ELSIF new_level = 3 THEN new_rank := 'Centurión';
        ELSIF new_level = 4 THEN new_rank := 'Comandante en Jefe';
        ELSE new_rank := 'Leyenda Electoral ' || new_level;
        END IF;

        -- Update the user's rank
        NEW.rank_name := new_rank;

        -- Insert the achievement notification for the user
        INSERT INTO notifications (user_id, title, message, type)
        VALUES (
            NEW.id,
            '¡RANGO ASCENDIDO!',
            'Has acumulado ' || NEW.xp || ' XP y has sido promovido a ' || new_rank || '.',
            'achievement'
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_level_up_gamification ON users;
CREATE TRIGGER trigger_level_up_gamification
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION check_level_up();
