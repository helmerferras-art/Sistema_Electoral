import { Client } from 'pg';

const client = new Client({
    connectionString: 'postgresql://postgres:%1112Rocko@@@@db.dlpbgbldfzxyxhbnmjfn.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

const schema = `
-- Drop existing tables if they exist (for MVP setup)
DROP TABLE IF EXISTS d_day_reports CASCADE;
DROP TABLE IF EXISTS supporters CASCADE;

-- Create supporters table
CREATE TABLE supporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,
  phone TEXT,
  curp TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  commitment_level INTEGER CHECK (commitment_level >= 1 AND commitment_level <= 5) DEFAULT 1,
  offline_id TEXT UNIQUE,
  leader_id UUID REFERENCES supporters(id) ON DELETE SET NULL
);

-- Create d_day_reports table
CREATE TABLE d_day_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  casilla_id TEXT NOT NULL,
  report_text TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  photo_url TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  reporter_id UUID REFERENCES supporters(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE supporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE d_day_reports ENABLE ROW LEVEL SECURITY;

-- Anonymous users (for MVP auto-registration without auth, we allow insert/select public, but you should lock this down in production)
-- Given the MVP nature offline, we allow public inserts for now if offline_syncing
CREATE POLICY "Public profiles are viewable by everyone." ON supporters FOR SELECT USING (true);
CREATE POLICY "Public profiles can be created by everyone." ON supporters FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can update own records." ON supporters FOR UPDATE USING (true);

CREATE POLICY "Reports viewable by everyone." ON d_day_reports FOR SELECT USING (true);
CREATE POLICY "Reports creatable by everyone." ON d_day_reports FOR INSERT WITH CHECK (true);

-- Enable realtime
-- Drop publication first if needed, though in Supabase supabase_realtime usually exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime FOR ALL TABLES;
  ELSE
    ALTER PUBLICATION supabase_realtime ADD TABLE d_day_reports;
    ALTER PUBLICATION supabase_realtime ADD TABLE supporters;
  END IF;
END $$;
`;

async function initDb() {
    try {
        await client.connect();
        console.log("Connected to Supabase DB. Creating schema...");
        await client.query(schema);
        console.log("Schema created successfully.");
    } catch (err) {
        console.error("Error creating schema", err);
    } finally {
        await client.end();
    }
}

initDb();
