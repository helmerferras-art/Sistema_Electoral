import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function verify() {
    console.log("Checking columns for resource_assignments...");
    // We can use a query that fails if column doesn't exist, but let's try a generic select first
    const { data, error } = await supabase
        .from('resource_assignments')
        .select('*')
        .limit(1);

    if (error) {
        console.error("Error fetching resource_assignments:", error.message);
    } else if (data && data.length > 0) {
        console.log("Keys found in resource_assignments:", Object.keys(data[0]));
    } else {
        console.log("No data in resource_assignments to inspect keys.");
        // Try to insert a dummy to see if it fails
        const { error: insError } = await supabase
            .from('resource_assignments')
            .select('quantity')
            .limit(1);
        if (insError) console.log("Quantity check failed:", insError.message);
        else console.log("Quantity check PASSED.");
    }
}

verify();
