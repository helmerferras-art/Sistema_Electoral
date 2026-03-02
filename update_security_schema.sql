-- ACTUALIZACIÓN DE SEGURIDAD C4I V2
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS password_hash TEXT,
ADD COLUMN IF NOT EXISTS temp_code TEXT,
ADD COLUMN IF NOT EXISTS code_sent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS is_first_login BOOLEAN DEFAULT true;

-- Asegurar que el SuperAdmin maestro tenga privilegios y sepa que no ha logueado
UPDATE public.users 
SET is_first_login = true, 
    code_sent = true -- El SuperAdmin ya conoce su bypass '123456' por ahora
WHERE phone = '9617744829';

COMMENT ON COLUMN public.users.password_hash IS 'Hash de contraseña permanente elegida por el usuario.';
COMMENT ON COLUMN public.users.temp_code IS 'Código de 6 dígitos para el primer acceso.';
COMMENT ON COLUMN public.users.code_sent IS 'Indica si el hardware ya envió el código al dispositivo físico.';
