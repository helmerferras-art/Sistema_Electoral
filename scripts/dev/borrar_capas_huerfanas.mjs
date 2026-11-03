// Borra del bucket map_layers las 45 capas viejas (nombre_<timestamp>.json) que ya no usa el sistema.
// NO toca la carpeta ligeras/ (las capas nuevas). El borrado es definitivo.
// Uso (desde la raíz del proyecto): node scripts/dev/borrar_capas_huerfanas.mjs
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const { data: usadas } = await supabase.from('global_map_layers').select('geojson_url');
const enUso = new Set((usadas || []).map(r => decodeURIComponent((r.geojson_url || '').split('/map_layers/')[1] || '')));

const { data, error } = await supabase.storage.from('map_layers').list('', { limit: 1000 });
if (error) { console.error('❌', error.message); process.exit(1); }
const viejas = data.filter(f => f.id && /^[a-z_]+_\d{13}\.json$/.test(f.name) && !enUso.has(f.name)).map(f => f.name);
console.log(`Capas viejas encontradas: ${viejas.length}`);
for (let i = 0; i < viejas.length; i += 20) {
  const { error: e } = await supabase.storage.from('map_layers').remove(viejas.slice(i, i + 20));
  if (e) { console.error('❌', e.message); process.exit(1); }
}
console.log(`✅ Borradas: ${viejas.length}`);
