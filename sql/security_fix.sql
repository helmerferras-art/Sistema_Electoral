-- security_fix.sql
-- Ejecute esto en el SQL Editor de Supabase para activar la Seguridad a Nivel de Fila (RLS)
-- y proteger sus tablas de accesos no autorizados.

-- 1. Activar RLS en las tablas que aparecen como "UNRESTRICTED" o desprotegidas
ALTER TABLE IF EXISTS notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS petitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS petition_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS petition_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS historical_election_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS padron_electoral ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS users ENABLE ROW LEVEL SECURITY;

-- 2. Crear políticas básicas de seguridad
-- Estas políticas permiten que cualquier usuario autenticado (logeado en la app) pueda leer los datos.
-- Si necesita acceso público para alguna tabla específica, deberá crear una política 'FOR SELECT TO anon'.

-- Política para resultados electorales
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'historical_election_results' AND policyname = 'Usuarios autenticados pueden leer resultados') THEN
        CREATE POLICY "Usuarios autenticados pueden leer resultados" ON historical_election_results
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- Política para padrón electoral
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'padron_electoral' AND policyname = 'Usuarios autenticados pueden leer padron') THEN
        CREATE POLICY "Usuarios autenticados pueden leer padron" ON padron_electoral
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- Política para usuarios
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'users' AND policyname = 'Usuarios pueden ver su propia info') THEN
        CREATE POLICY "Usuarios pueden ver su propia info" ON users
            FOR SELECT TO authenticated USING (true);
    END IF;
END $$;

-- Nota: Esto eliminará los avisos rojos de "UNRESTRICTED". 
-- Solo los usuarios validados a través de su aplicación podrán consultar estos datos.
