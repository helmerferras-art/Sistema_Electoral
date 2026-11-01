-- PROTOCOLO DE PURGA C4I: Limpieza Absoluta de Campo
-- Elimina toda la estructura inyectada anteriormente respetando jerarquías relacionales y limpiando el padrón, notificaciones e IA.

-- 1. Detonar periféricos pesados
DELETE FROM ai_responses;
DELETE FROM ai_advisors;
DELETE FROM notifications;
DELETE FROM broadcast_messages;
DELETE FROM social_inbox;

-- 2. Limpiar padrón local (Simpatizantes)
DELETE FROM supporters;

-- 3. Destruir jerarquías organizacionales para prevenir dead-locks (referencias circulares)
UPDATE users SET parent_id = NULL;

-- 4. Extinguir usuarios (Exceptuando nivel Dios)
DELETE FROM users WHERE role != 'superadmin';

-- 5. Extinguir Campañas Base
DELETE FROM tenants WHERE owner_id NOT IN (SELECT id FROM users WHERE role = 'superadmin') OR owner_id IS NULL;

-- 6. Mensaje Confirmación (Opcional)
-- SELECT 'TABULA RASA: Sistema Legion Vaciado' AS Status;
