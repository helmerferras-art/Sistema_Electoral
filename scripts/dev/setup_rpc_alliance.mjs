import pg from 'pg';
const { Client } = pg;
const connectionString = "postgresql://postgres.dlpbgbldfzxyxhbnmjfn:Pulsar_V15_1985@aws-0-us-east-1.pooler.supabase.com:6543/postgres";

async function run() {
    const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    try {
        await client.connect();

        await client.query(`
        CREATE OR REPLACE FUNCTION fn_request_alliance_by_code(p_code TEXT, p_inferior_tenant_id UUID)
        RETURNS jsonb
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        DECLARE
            v_superior_id UUID;
            v_superior_name TEXT;
        BEGIN
            -- Find superior
            SELECT id, name INTO v_superior_id, v_superior_name
            FROM tenants
            WHERE alliance_code = p_code;

            IF v_superior_id IS NULL THEN
                RETURN jsonb_build_object('success', false, 'error', 'Código inválido o ya ha sido utilizado.');
            END IF;

            IF v_superior_id = p_inferior_tenant_id THEN
                RETURN jsonb_build_object('success', false, 'error', 'No puedes aliarte contigo mismo.');
            END IF;

            -- Check if alliance already exists
            IF EXISTS (SELECT 1 FROM tenant_alliances WHERE superior_tenant_id = v_superior_id AND inferior_tenant_id = p_inferior_tenant_id) THEN
                RETURN jsonb_build_object('success', false, 'error', 'La alianza ya existe o está pendiente de revisión.');
            END IF;

            -- Create pending request
            INSERT INTO tenant_alliances (superior_tenant_id, inferior_tenant_id, status)
            VALUES (v_superior_id, p_inferior_tenant_id, 'pending');

            -- Consume the code (Set to NULL to guarantee single-use and avoid spam)
            UPDATE tenants SET alliance_code = NULL WHERE id = v_superior_id;

            RETURN jsonb_build_object('success', true, 'superior_name', v_superior_name);
        END;
        $$;
        `);

        console.log("RPC fn_request_alliance_by_code created successfully.");
    } catch (e) {
        console.error("Migration error detail:", e.message);
    } finally {
        await client.end();
    }
}
run();
