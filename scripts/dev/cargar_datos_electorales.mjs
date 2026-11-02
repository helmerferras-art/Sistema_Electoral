// Carga los datos electorales de referencia para el cálculo de metas:
//   - Resultados 2024 por sección (gubernatura y ayuntamientos) → historical_election_results
//   - Padrón y lista nominal por sección, edad y sexo         → padron_electoral (+ columnas de padrón en historical)
//   - Cruce colonia → secciones (opcional)                     → colonia_secciones
//
// Uso (desde la raíz del proyecto):
//   node scripts/dev/cargar_datos_electorales.mjs "C:\Users\helme\Downloads\Subir CSV" [--colonias "<ruta>\colonia_seccion.csv"] [--anio-padron 2024] [--dry-run]
//
// --dry-run: solo lee y resume los archivos, no se conecta a Supabase.
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
dotenv.config();

const args = process.argv.slice(2);
const dir = args.find(a => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--colonias' && args[args.indexOf(a) - 1] !== '--anio-padron');
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const DRY = args.includes('--dry-run');
const PADRON_YEAR = parseInt(opt('--anio-padron') || '2024', 10);
const COLONIAS = opt('--colonias');
if (!dir) { console.error('Falta la carpeta con los CSV (Subir CSV)'); process.exit(1); }

// ─── Lectura robusta (UTF-8 con BOM o Latin-1; comillas con saltos de línea) ───
const readText = (file) => {
  const buf = fs.readFileSync(file);
  let t = buf.toString('utf8');
  if (t.includes('\uFFFD')) t = buf.toString('latin1');
  return t.replace(/^\uFEFF/, '');
};
const parseCsv = (text) => {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const header = rows.shift().map(h => h.replace(/\s+/g, ' ').trim());
  return rows.filter(r => r.length > 1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
};
const num = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const validSection = (s) => /^\d+$/.test(s) && Number(s) > 0;

// ─── Resultados por sección ───
const NON_PARTY = new Set(['ID_DISTRITO_LOCAL', 'CABECERA_DISTRITAL_LOC', 'ID_MUNICIPIO_LOCAL', 'MUNICIPIO_LOCAL', 'SECCION', 'LISTA_NOMINAL_CASILLA', 'TOTAL_VOTOS']);

const aggregateResults = (rows) => {
  const parties = Object.keys(rows[0] || {}).filter(k => !NON_PARTY.has(k));
  const secs = new Map();
  for (const r of rows) {
    if (!validSection(r.SECCION)) continue;
    const s = secs.get(r.SECCION) || { municipality: r.MUNICIPIO_LOCAL, municipality_id: r.ID_MUNICIPIO_LOCAL, ln: 0, tv: 0, votes: {} };
    s.ln += num(r.LISTA_NOMINAL_CASILLA); s.tv += num(r.TOTAL_VOTOS);
    for (const p of parties) s.votes[p] = (s.votes[p] || 0) + num(r[p]);
    secs.set(r.SECCION, s);
  }
  return secs;
};

// Votos por candidatura: suma de sus partidos + la columna de la coalición completa (si existe)
const candidateTotals = (votes, candidates) => {
  const out = {};
  for (const { key } of candidates) {
    const parts = key.split('_').filter(Boolean);
    let total = parts.reduce((a, p) => a + (votes[p] || 0), 0);
    if (parts.length > 1) {
      for (const [col, v] of Object.entries(votes)) {
        const colParts = col.split('_').filter(Boolean);
        if (colParts.length > 1 && colParts.every(p => parts.includes(p))) total += v;
      }
    }
    out[key] = total;
  }
  return out;
};

const buildHistorical = (secs, electionType, candidatesFor) => {
  const out = [];
  for (const [section_id, s] of secs) {
    const cands = candidatesFor(s);
    let totals;
    if (cands.length > 0) totals = candidateTotals(s.votes, cands);
    else totals = Object.fromEntries(Object.entries(s.votes).filter(([k]) => !k.includes('_') || k.split('_').filter(Boolean).length === 1));
    const ranked = Object.values(totals).sort((a, b) => b - a);
    out.push({
      election_year: 2024, election_type: electionType, state: 'CHIAPAS',
      municipality: (s.municipality || '').trim(), municipality_id: String(s.municipality_id || ''),
      section_id, total_votes: s.tv, nominal_list_size: s.ln,
      winning_votes: ranked[0] || 0, second_place_votes: ranked[1] || 0,
      target_votes_calculated: Math.ceil((ranked[0] || 0) * 1.1),
      party_results: totals,
      candidate_names: cands.length ? Object.fromEntries(cands.map(c => [c.key, c.name])) : null,
    });
  }
  return out;
};

// ─── Padrón ───
const AGE_GROUPS = ['18', '19', '20_24', '25_29', '30_34', '35_39', '40_44', '45_49', '50_54', '55_59', '60_64', '65_Y_MAS'];
const buildPadron = (rows) => rows.filter(r => validSection(r['SECCION'])).map(r => {
  const edad = {};
  for (const g of AGE_GROUPS) {
    edad[g.replace('_Y_MAS', '+').replace('_', '-')] =
      num(r[`PADRON_${g}_HOMBRES`]) + num(r[`PADRON_${g}_MUJERES`]) + num(r[`PADRON_${g}_NOBINARIO`]);
  }
  return {
    year: PADRON_YEAR, section_id: r['SECCION'], municipality: (r['NOMBRE MUNICIPIO'] || '').trim(),
    municipality_id: num(r['CLAVE MUNICIPIO']) || null, distrito_f: num(r['CLAVE DISTRITO']) || null,
    padron_total: num(r['PADRON ELECTORAL']), hombres: num(r['PADRON HOMBRES']), mujeres: num(r['PADRON MUJERES']),
    lista_nominal: num(r['LISTA NOMINAL']), edad_rangos: edad,
  };
});

// ─── Main ───
const file = (n) => path.join(dir, n);
const gobRows = parseCsv(readText(file('Gobernador.csv')));
const gobCands = parseCsv(readText(file('Candidatos_Gobernador.csv'))).map(c => ({ key: c.PARTIDO_CI, name: c.CANDIDATURA }));
const gob = buildHistorical(aggregateResults(gobRows), 'gubernatura', () => gobCands);

let ayu = [];
if (fs.existsSync(file('Ayuntamientos_Eleccion.csv'))) {
  const ayuRows = parseCsv(readText(file('Ayuntamientos_Eleccion.csv')));
  const ayuCands = fs.existsSync(file('Candidatos_Ayuntamientos.csv'))
    ? parseCsv(readText(file('Candidatos_Ayuntamientos.csv'))) : [];
  const byMun = new Map();
  for (const c of ayuCands) {
    const list = byMun.get(c.ID_MUNICIPIO_LOCAL) || [];
    list.push({ key: c.PARTIDO_CI, name: c.CANDIDATURA_PROPIETARIA });
    byMun.set(c.ID_MUNICIPIO_LOCAL, list);
  }
  ayu = buildHistorical(aggregateResults(ayuRows), 'ayuntamiento', (s) => byMun.get(String(s.municipality_id)) || []);
}

const padron = buildPadron(parseCsv(readText(file('padron_edad_sexo.csv'))));
const padronBySec = new Map(padron.map(p => [p.section_id, p]));
for (const h of [...gob, ...ayu]) {
  const p = padronBySec.get(h.section_id);
  if (p) Object.assign(h, { padron_total: p.padron_total, padron_hombres: p.hombres, padron_mujeres: p.mujeres, padron_edad_rangos: p.edad_rangos });
}

let colonias = [];
if (COLONIAS && fs.existsSync(COLONIAS)) {
  colonias = parseCsv(readText(COLONIAS)).map(r => ({
    colonia_id: num(r.colonia_id), municipio: num(r.municipio) || null, colonia: r.colonia, cp: r.cp || null,
    seccion: num(r.seccion), porcentaje: parseFloat(r.porcentaje) || 0,
  })).filter(r => r.colonia_id && r.seccion);
}

const sum = (arr, k) => arr.reduce((a, r) => a + (r[k] || 0), 0);
console.log(`Gubernatura 2024: ${gob.length} secciones · LN ${sum(gob, 'nominal_list_size')} · votos ${sum(gob, 'total_votes')} · ganador ${sum(gob, 'winning_votes')}`);
console.log(`Ayuntamientos 2024: ${ayu.length} secciones · votos ${sum(ayu, 'total_votes')}`);
console.log(`Padrón (año ${PADRON_YEAR}): ${padron.length} secciones · LN ${sum(padron, 'lista_nominal')}`);
console.log(`Colonia→sección: ${colonias.length} filas`);
const ejemplo = gob.find(g => g.section_id === '1702');
if (ejemplo) console.log('Ejemplo 1702:', JSON.stringify({ ln: ejemplo.nominal_list_size, votos: ejemplo.total_votes, ganador: ejemplo.winning_votes, segundo: ejemplo.second_place_votes, candidaturas: ejemplo.party_results }));
if (DRY) { console.log('Modo prueba (--dry-run): no se subió nada.'); process.exit(0); }

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY en .env'); process.exit(1); }
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const upsert = async (table, rows, onConflict) => {
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + 500), { onConflict });
    if (error) { console.error(`❌ ${table} (${i}):`, error.message); process.exit(1); }
    process.stdout.write(`\r  ${table}: ${Math.min(i + 500, rows.length)}/${rows.length}`);
  }
  console.log(`\n✅ ${table}`);
};
await upsert('historical_election_results', [...gob, ...ayu], 'election_year,election_type,section_id');
await upsert('padron_electoral', padron, 'section_id,year');
if (colonias.length) await upsert('colonia_secciones', colonias, 'colonia_id,seccion');
console.log('Listo. Las metas ya se pueden calcular desde la app (pestaña OBJETIVOS).');
