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

-- Habilitar RLS (para evitar advertencias, y usar políticas públicas por ahora para MVP)
ALTER TABLE polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE poll_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "polls_public" ON polls FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "poll_questions_public" ON poll_questions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "poll_options_public" ON poll_options FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "poll_responses_public" ON poll_responses FOR ALL USING (true) WITH CHECK (true);
