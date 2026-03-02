import { execSync } from 'child_process';
import path from 'path';

// The path the user provided with the shapefiles
const inputDir = 'C:\\Users\\helme\\Downloads\\Capas\\07\\07';
// Output directory (saving in the same place)
const outputDir = inputDir;

const filesToConvert = [
    'SECCION',
    'MUNICIPIO',
    'DISTRITO_LOCAL',
    'DISTRITO_FEDERAL',
    'ENTIDAD',
    'COLONIA',
    'localidades_2020'
];

console.log('--- Iniciando Conversor Mapshaper Local ---');

filesToConvert.forEach(fileBase => {
    const inputFile = path.join(inputDir, `${fileBase}.shp`);
    const outputFile = path.join(outputDir, `${fileBase}.json`);

    console.log(`\nProcesando: ${fileBase}...`);

    // Let mapshaper automatically read the .prj file (UTM 15N) and project to wgs84
    const command = `npx mapshaper -i "${inputFile}" -proj wgs84 -o format=geojson "${outputFile}"`;

    try {
        console.log(`Ejecutando: ${command}`);
        const result = execSync(command, { encoding: 'utf-8' });
        console.log(`✅ Éxito: ${fileBase}.json creado.`);
        if (result) console.log(result);
    } catch (error) {
        console.error(`❌ Error procesando ${fileBase}:`, error.message);
    }
});

console.log('\n--- Conversión Terminada ---');
console.log('Ahora puedes subir los archivos .json resultantes en el panel de SuperAdmin.');
