// Sube las capas ligeras (Capas/07/07/ligeras) al bucket map_layers y las registra en global_map_layers.
// Uso (desde la raíz del proyecto): node scripts/dev/subir_capas_ligeras.mjs <carpeta_ligeras>
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

const dir = process.argv[2];
if (!dir) { console.error('Falta la carpeta de capas ligeras'); process.exit(1); }
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } });

const capas = [
  ['ENTIDAD.json', 'entidad', 'Chiapas · Entidad (INE, ligera)', '#FFFFFF'],
  ['MUNICIPIO.json', 'municipio', 'Chiapas · Municipios (INE, ligera)', '#00D4FF'],
  ['DISTRITO_FEDERAL.json', 'distrito_federal', 'Chiapas · Distritos federales (INE, ligera)', '#FFB000'],
  ['DISTRITO_LOCAL.json', 'distrito_local', 'Chiapas · Distritos locales (INE, ligera)', '#FF6B6B'],
  ['SECCION.json', 'seccion', 'Chiapas · Secciones electorales (INE, ligera)', '#B7F0AD'],
  ['COLONIA.json', 'colonia', 'Chiapas · Colonias (INE, ligera)', '#C084FC'],
  ['LOCALIDAD.json', 'localidad', 'Chiapas · Localidades 2020 (INEGI, ligera)', '#F59E0B'],
];

for (const [archivo, tipo, nombre, color] of capas) {
  const destino = `ligeras/${tipo}.json`;
  const buf = fs.readFileSync(path.join(dir, archivo));
  const { error: upErr } = await supabase.storage.from('map_layers')
    .upload(destino, buf, { contentType: 'application/json', upsert: true, cacheControl: '86400' });
  if (upErr) { console.error(`❌ ${tipo}:`, upErr.message); continue; }
  const { data: { publicUrl } } = supabase.storage.from('map_layers').getPublicUrl(destino);
  await supabase.from('global_map_layers').delete().eq('layer_type', tipo).eq('geojson_url', publicUrl);
  const { error: dbErr } = await supabase.from('global_map_layers')
    .insert({ layer_type: tipo, layer_name: nombre, geojson_url: publicUrl, is_active: true, color_hex: color });
  console.log(dbErr ? `❌ ${tipo}: ${dbErr.message}` : `✅ ${tipo} (${(buf.length / 1024 / 1024).toFixed(1)} MB)`);
}
