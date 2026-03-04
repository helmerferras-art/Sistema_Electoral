import { createClient } from '@supabase/supabase-js';
import { CHIAPAS_MUNICIPIOS } from './src/lib/chiapas_municipios.ts';
import { CHIAPAS_DISTRITOS_FEDERALES, CHIAPAS_DISTRITOS_LOCALES } from './src/lib/chiapas_distritos.ts';

const removeAccents = (str) => {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

async function checkDistritoSeis() {
    const s = createClient('https://dlpbgbldfzxyxhbnmjfn.supabase.co', 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC');

    // Simulating MapView First Pass (getting Target Data for Dist 6 municipalities)
    const municipiosDistrito6 = CHIAPAS_DISTRITOS_FEDERALES[6] || [];
    console.log("Municipios in Dist 6:", municipiosDistrito6);

    const validMunicipalities = municipiosDistrito6.map(id => id.toString());

    // Quick peek at actual history data for these municipalities
    const { data: hist } = await s.from('historical_election_results')
        .select('id, municipality, target_votes_calculated')
        .eq('election_year', 2024)
        .in('municipality', validMunicipalities)
        .limit(5);

    console.log(`History Data Sample for Dist 6 Munis:`, hist);

    const muniToFed = {};
    Object.entries(CHIAPAS_DISTRITOS_FEDERALES).forEach(([d, ms]) => ms.forEach(m => muniToFed[m] = d));

    console.log("Translation map for Muni '102' (Tuxtla):", muniToFed[102]);
    console.log("If Data is {municipality: '102'}, will it map to 'dist_f:6'? Let's check logic.");
    // In MapView: 
    // const mNorm = removeAccents(pureData.municipality.toLowerCase()); -> '102'
    // const mId = (CHIAPAS_MUNICIPIOS as any)[mNorm]; -> UNDEFINED because CHIAPAS_MUNICIPIOS maps names to IDs, not IDs to IDs.

    const mNorm = removeAccents('102'.toLowerCase());
    const mId = CHIAPAS_MUNICIPIOS[mNorm];
    console.log(`Original logic: CHIAPAS_MUNICIPIOS['102'] = ${mId}`);
}
checkDistritoSeis();
