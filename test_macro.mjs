import { createClient } from '@supabase/supabase-js';
import { CHIAPAS_MUNICIPIOS } from './src/lib/chiapas_municipios.ts';
import { CHIAPAS_DISTRITOS_FEDERALES, CHIAPAS_DISTRITOS_LOCALES } from './src/lib/chiapas_distritos.ts';

const removeAccents = (str) => {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

const getFeatureId = (properties, layerType) => {
    if (!properties) return null;
    const keys = Object.keys(properties);

    let bestKey;
    const type = layerType?.toLowerCase();
    if (type === 'seccion') {
        bestKey = keys.find(k => k.toLowerCase() === 'seccion' || k.toLowerCase() === 'sec');
    } else if (type === 'municipio') {
        bestKey = keys.find(k => k.toLowerCase() === 'municipio' || k.toLowerCase() === 'cve_mun');
    } else {
        bestKey = keys.find(k => ['nombre', 'nom', 'id', 'cve', 'distrito'].some(t => k.toLowerCase().includes(t))) || keys[0];
    }
    return bestKey ? String(properties[bestKey]) : null;
};

async function testMacro() {
    const s = createClient('https://dlpbgbldfzxyxhbnmjfn.supabase.co', 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC');

    // Check Mun layer
    let res = await s.from('global_map_layers').select('*').in('layer_type', ['municipio', 'distrito_federal']).order('layer_type');

    for (const layer of res.data) {
        console.log(`\n=== LAYER: ${layer.layer_type} ===`);
        const jsonRes = await fetch(layer.geojson_url);
        const json = await jsonRes.json();
        const features = json.features || json.FeatureCollection?.features;
        if (!features) continue;

        let p = features[0].properties;
        let fid = getFeatureId(p, layer.layer_type);
        console.log("Sample Props:", p);
        console.log("Extracted fid:", fid);

        let dictKey = fid;
        if (fid) {
            if (layer.layer_type === 'municipio') {
                const normalizedFid = isNaN(Number(fid)) ? removeAccents(String(fid).toLowerCase()) : fid;
                dictKey = `muni:${normalizedFid}`;
            } else if (layer.layer_type === 'distrito_federal') {
                dictKey = `dist_f:${fid}`;
            }
        }
        console.log("Generated DictKey used in MapView map rendering:", dictKey);
    }

    // Check Aggregation Side
    const muniToFed = {};
    Object.entries(CHIAPAS_DISTRITOS_FEDERALES).forEach(([d, ms]) => ms.forEach(m => muniToFed[m] = d));

    // Let's test San Cristobal (ID 77)
    console.log("\n=== AGGREGATION SIMULATION ===");
    console.log("MuniToFed for SCLC (77):", muniToFed[77]);
    console.log("Keys pushed for SCLC:");
    const mNorm = removeAccents("san cristobal de las casas".toLowerCase());
    console.log(`- muni:${mNorm}`);
    console.log(`- muni:77`);
    console.log(`- dist_f:${muniToFed[77]}`);
}

testMacro();
