import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../.env') }); // Load root .env

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Realistic (simulated) section numbers for all of Chiapas (approx 1 - 3500)
const chiapasSections = Array.from({ length: 3500 }, (_, i) => (1 + i).toString().padStart(4, '0'));

const electionYears = [2015, 2018, 2021, 2024];

async function seedHistoricalData() {
    console.log("Seeding Historical Election Results for the entire state of Chiapas (3500 sections)...");

    // Clear existing data for a clean slate
    await supabase.from('historical_election_results').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    let records = [];

    for (const year of electionYears) {
        for (const section of chiapasSections) {
            // Simulate realistic logic: List size between 800-2000, 50% participation
            const listSize = Math.floor(Math.random() * 1200) + 800;
            const participation = listSize * (Math.random() * 0.2 + 0.4); // 40-60% turnout

            // Winning votes = usually 35-45% of total votes participating
            const winningVotes = Math.floor(participation * (Math.random() * 0.15 + 0.35));
            const secondPlaceVotes = Math.floor(winningVotes * (Math.random() * 0.4 + 0.5)); // 50-90% of winner's votes

            records.push({
                election_year: year,
                election_type: 'ayuntamiento',
                state: 'Chiapas',
                municipality: 'Varios', // En simulación lo dejamos genérico o mapeado si tuviéramos un JSON de secciones a municipios
                section_id: section,
                total_votes: Math.floor(participation),
                winning_votes: winningVotes,
                second_place_votes: secondPlaceVotes,
                nominal_list_size: listSize,
                target_votes_calculated: winningVotes + 1 // To win, we need at least winner's votes + 1
            });
        }
    }

    // Insert in batches of 1000 to avoid Supabase limits
    for (let i = 0; i < records.length; i += 1000) {
        const batch = records.slice(i, i + 1000);
        const { error } = await supabase.from('historical_election_results').insert(batch);

        if (error) {
            console.error(`Error inserting batch ${i}:`, error.message);
        } else {
            console.log(`Successfully inserted batch ${i} to ${i + batch.length} of ${records.length}`);
        }
    }

    console.log("Seeding complete!");
}

seedHistoricalData();
