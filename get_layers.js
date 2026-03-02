const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const s = createClient('https://dlpbgbldfzxyxhbnmjfn.supabase.co', 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC');
s.from('global_map_layers').select('*').eq('is_active', true).then(({ data, error }) => {
    const outPath = path.join('C:', 'Proyecto_Electoral', 'layers_out.json');
    fs.writeFileSync(outPath, JSON.stringify(data || error, null, 2));
    console.log("Wrote to " + outPath);
    process.exit(0);
});
