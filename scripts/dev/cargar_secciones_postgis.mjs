// Carga las secciones electorales del INE (GeoJSON) en la tabla electoral_sections (PostGIS)
// y recalcula la sección de todos los simpatizantes con coordenadas.
// Uso (desde la raíz del proyecto):
//   node scripts/dev/cargar_secciones_postgis.mjs "C:\Users\helme\Downloads\Capas\07\07\SECCION.json"
// Usa el SECCION.json ORIGINAL (precisión completa) para no asignar mal en los bordes.
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

const file = process.argv[2];
if (!file) { console.error('Falta la ruta de SECCION.json'); process.exit(1); }
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const features = JSON.parse(fs.readFileSync(file, 'utf8')).features;
console.log(`Secciones en el archivo: ${features.length}`);
const LOTE = 50;
let total = 0;
for (let i = 0; i < features.length; i += LOTE) {
  const lote = features.slice(i, i + LOTE);
  const { data, error } = await supabase.rpc('fn_load_sections', { p_features: lote });
  if (error) { console.error(`❌ Lote ${i}-${i + lote.length}:`, error.message); process.exit(1); }
  total += data;
  process.stdout.write(`\r  Cargadas: ${total}/${features.length}`);
}
console.log('\n✅ Secciones cargadas.');
const { data: n, error: e2 } = await supabase.rpc('fn_recompute_supporter_sections');
console.log(e2 ? `❌ Recalcular: ${e2.message}` : `✅ Simpatizantes recalculados: ${n}`);
