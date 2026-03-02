import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function seedDiaD() {
    console.log("Seeding Día D Targets based on 2024 Historical Data...");

    // 1. Get a sample tenant (the first one)
    const { data: tenants } = await supabase.from('tenants').select('id').limit(1);
    if (!tenants || tenants.length === 0) {
        console.error("No tenants found to seed data for.");
        return;
    }
    const tenantId = tenants[0].id;

    // 2. Clear existing targets for this tenant
    await supabase.from('d_day_targets').delete().eq('tenant_id', tenantId);

    // 3. Fetch some historical results to use as targets
    const { data: history } = await supabase
        .from('historical_election_results')
        .select('section_id, target_votes_calculated')
        .eq('election_year', 2024)
        .limit(20);

    if (!history) return;

    const targets = history.map(h => ({
        tenant_id: tenantId,
        casilla_id: h.section_id + " CONTIGUA 1", // Simulating a specific casilla
        target_votes: h.target_votes_calculated,
        current_votes: Math.floor(h.target_votes_calculated * (Math.random() * 0.3)), // Start with some random progress
        status: 'en_combate'
    }));

    const { error } = await supabase.from('d_day_targets').insert(targets);

    if (error) {
        console.error("Error seeding Día D targets:", error.message);
    } else {
        console.log(`Successfully seeded ${targets.length} targets for tenant ${tenantId}`);
    }
}

seedDiaD();
