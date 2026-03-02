import { Client } from 'pg';

const client = new Client({
    connectionString: 'postgresql://postgres:%1112Rocko@@@@db.dlpbgbldfzxyxhbnmjfn.supabase.co:5432/postgres',
    ssl: { rejectUnauthorized: false }
});

const schema = `
CREATE TABLE IF NOT EXISTS polls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  tenant_id UUID REFERENCES tenants(id),
  title TEXT NOT NULL,
  description TEXT,
  active BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS poll_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT DEFAULT 'single_choice'
);

CREATE TABLE IF NOT EXISTS poll_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID REFERENCES poll_questions(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS poll_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  poll_id UUID REFERENCES polls(id) ON DELETE CASCADE,
  question_id UUID REFERENCES poll_questions(id) ON DELETE CASCADE,
  option_id UUID REFERENCES poll_options(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION
);

-- Note: Policies intentionally omitted for simplicity in MVP, assuming RLS might be disabled or open for these for now. 
`;

async function createPollsSchema() {
    try {
        await client.connect();
        console.log("Connected to Supabase DB. Creating polls schema...");
        await client.query(schema);
        console.log("Polls schema created successfully.");
    } catch (err) {
        console.error("Error creating polls schema:", err);
    } finally {
        await client.end();
    }
}

createPollsSchema();
