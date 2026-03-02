import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function check() {
    console.log("--- Checking Historical Results (All) ---");
    let allResults = [];
    let from = 0;
    while (true) {
        const { data, error } = await supabase
            .from('historical_election_results')
            .select('election_type, election_year, municipality, section_id')
            .order('election_year', { ascending: false })
            .range(from, from + 999);

        if (error || !data || data.length === 0) break;
        allResults = allResults.concat(data);
        from += 1000;
        if (from >= 10000) break; // Safety
    }

    const rCounts = {};
    allResults.forEach(r => {
        const key = `${r.election_year} | ${r.election_type} | ${r.municipality}`;
        rCounts[key] = (rCounts[key] || 0) + 1;
    });
    console.log("Total Results Rows fetched:", allResults.length);
    console.log("Summary by key (Year | Type | Muni):");
    Object.entries(rCounts).forEach(([k, v]) => {
        if (v > 1) console.log(`  - ${k}: ${v}`);
    });

    console.log("\n--- Checking for Specific Ayuntamientos ---");
    const ayunts = allResults.filter(r => r.election_type === 'ayuntamiento' && r.election_year === 2024);
    console.log("Ayuntamientos 2024 found:", ayunts.length);
    if (ayunts.length > 0) {
        console.log("Unique municipalities in Ayunts 2024:", [...new Set(ayunts.map(a => a.municipality))].slice(0, 10));
    }
}

check();
