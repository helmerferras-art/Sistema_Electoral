/**
 * Columnas de `users` legibles desde la API (ver migración users_column_privileges).
 * curp, address, id_card_key, password_hash, temp_code y temp_code_expires_at NO son legibles:
 * usar `select('*')` sobre users falla con "permission denied".
 */
export const USER_COLUMNS = 'id, tenant_id, auth_id, created_at, name, phone, role, parent_id, assigned_territory, assigned_targets, xp, rank_name, current_streak, last_action_date, is_active, seccion_id, is_first_login, photo_url, code_sent, two_factor_enabled' as const;

/**
 * Columnas de `supporters` legibles desde la API (ver migración supporters_team_scope_and_columns).
 * curp, clave_elector, domicilio y vigencia solo se obtienen con la RPC `fn_supporters_export`
 * (candidato / coordinador de campaña / superadmin).
 */
export const SUPPORTER_COLUMNS = 'id, tenant_id, created_at, name, phone, latitude, longitude, commitment_level, offline_id, recruiter_id, section_id, status, photo_evidence_url, seccion, birth_date' as const;
