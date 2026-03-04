import { createClient } from '@supabase/supabase-js';
const s = createClient('https://dlpbgbldfzxyxhbnmjfn.supabase.co', 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC');
async function f() {
    const { data } = await s.from('global_map_layers').select('geojson_url, layer_type').eq('layer_type', 'municipio').limit(1);
    if (data && data.length > 0) {
        console.log("URL:", data[0].geojson_url);
        const res = await fetch(data[0].geojson_url);
        const json = await res.json();
        console.log("First Feature Props:", json.features[0].properties);
    }
}
f();
