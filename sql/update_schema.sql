-- Migración para Jerarquía Táctica y Metas Individuales
-- Ejecutar este archivo en el Supabase SQL Editor

ALTER TABLE users ADD COLUMN IF NOT EXISTS assigned_targets JSONB DEFAULT '[]'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE users ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- Asegurar que los roles tengan los permisos adecuados (RLS ya está habilitado en schema.sql)
-- La visibilidad jerárquica se manejará principalmente por lógica de aplicación y RLS existente.
