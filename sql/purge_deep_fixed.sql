-- PROTOCOLO DE PURGA C4I CORREGIDO: Limpieza de Campo

-- 1. Detonar periféricos (Tablas que sí existen)
DELETE FROM notifications;
DELETE FROM broadcast_messages;
DELETE FROM social_inbox;

-- 2. Limpiar padrón local (Simpatizantes)
DELETE FROM supporters;

-- 3. Destruir jerarquías organizacionales para prevenir dead-locks
UPDATE users SET parent_id = NULL;

-- 4. Extinguir usuarios (Exceptuando nivel Dios)
DELETE FROM users WHERE role != 'superadmin';

-- 5. Extinguir Campañas Base
DELETE FROM tenants WHERE owner_id NOT IN (SELECT id FROM users WHERE role = 'superadmin') OR owner_id IS NULL;
