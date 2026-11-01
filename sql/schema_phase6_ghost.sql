-- Añadir columna is_active para control maestro de cuentas (Pausar/Reactivar)
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Añadir contraseña hasheada parcial para el reset de credenciales
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS temp_code TEXT;

-- Añadir columna two_factor_enabled si no existe
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;
