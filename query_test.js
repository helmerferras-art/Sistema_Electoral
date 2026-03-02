import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

sb.from('historical_election_results')
    .select('*')
    .eq('election_type', 'gubernatura')
    .limit(1)
    .then(res => {
        fs.writeFileSync('gubenatura_sample.json', JSON.stringify(res.data[0], null, 2));
    });
