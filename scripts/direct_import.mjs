import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
const supabaseAnonKey = 'sb_publishable_buJLb0kzN4uj3fi9XEqF3Q_8CatXXaC';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const cleanNum = (val) => {
    if (!val || val === '-' || val === 'N/A') return 0;
    return parseInt(String(val).replace(/[^\d]/g, '') || '0') || 0;
};

// BETTER CSV PARSER (handles newlines in quotes)
const parseCsvCustom = (text, delim) => {
    const rows = [];
    let curRow = [];
    let curField = '';
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (char === '"') {
            inQuote = !inQuote;
        } else if (char === delim && !inQuote) {
            curRow.push(curField.trim());
            curField = '';
        } else if ((char === '\n' || char === '\r') && !inQuote) {
            if (curField || curRow.length > 0) {
                curRow.push(curField.trim());
                rows.push(curRow);
                curRow = [];
                curField = '';
            }
            if (char === '\r' && text[i + 1] === '\n') i++;
        } else {
            curField += char;
        }
    }
    if (curField || curRow.length > 0) {
        curRow.push(curField.trim());
        rows.push(curRow);
    }
    return rows;
};

function loadCandidateMap(filePath, type) {
    const text = fs.readFileSync(filePath, 'utf8');
    const rows = parseCsvCustom(text, text.includes(';') ? ';' : ',');
    const headers = rows[0].map(h => h.toUpperCase().replace(/[\n\r]/g, ' '));

    const partyIdx = headers.indexOf('PARTIDO_CI');
    const nameIdx = headers.findIndex(h => h.includes('CANDIDATURA'));
    const muniIdx = headers.indexOf('ID_MUNICIPIO_LOCAL');

    const map = {};
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const party = row[partyIdx]?.toUpperCase();
        const candidate = row[nameIdx];
        if (type === 'gubernatura') {
            map[party] = candidate;
        } else {
            const muniId = row[muniIdx];
            if (!map[muniId]) map[muniId] = {};
            map[muniId][party] = candidate;
        }
    }
    return map;
}

// FUZZY MATCH: If candidate mapping for 'MORENA' is missing, search in coalitions
function getCandidateFuzzy(partyKey, muniId, candidateMap, type) {
    const party = partyKey.toUpperCase();
    if (type === 'gubernatura') {
        if (candidateMap[party]) return candidateMap[party];
        // Search in coalition strings
        for (const [key, name] of Object.entries(candidateMap)) {
            if (key.includes(party)) return name;
        }
    } else {
        const muniMap = candidateMap[muniId];
        if (!muniMap) return null;
        if (muniMap[party]) return muniMap[party];
        for (const [key, name] of Object.entries(muniMap)) {
            if (key.includes(party)) return name;
        }
    }
    return null;
}

async function importResults(filePath, electionType, year, candidateMap) {
    console.log(`\n--- Importing Results ${filePath} ---`);
    const text = fs.readFileSync(filePath, 'utf8');
    const allRows = parseCsvCustom(text, text.includes(';') ? ';' : ',');
    const headers = allRows[0].map(h => h.toUpperCase().replace(/[\n\r]/g, ' ').trim());

    const seccionIdx = headers.indexOf('SECCION');
    const municipalityIdx = headers.findIndex(h => (h.includes('MUNICIPIO') || h.includes('NOMBRE_MUN')) && !h.includes('ID_'));
    const muniIdIdx = headers.indexOf('ID_MUNICIPIO_LOCAL');
    const totalVotosIdx = headers.findIndex(h => h.includes('TOTAL_VOTO') || h.includes('TOTAL_VOTACION'));
    const listaNominalIdx = headers.findIndex(h => h.includes('LISTA_NOMINAL') || h.includes('LISTA_NOMINAL_CASILLA'));

    const standardHeaders = ['SECCION', 'SEC', 'MUNICIPIO', 'TOTAL_VOTACION', 'TOTAL_VOTOS', 'LISTA_NOMINAL', 'ID_ENTIDAD', 'ID_MUNICIPIO_LOCAL', 'MUNICIPIO_LOCAL', 'LISTA_NOMINAL_CASILLA', 'ID_DISTRITO_LOCAL', 'CABECERA_DISTRITAL_LOC'];
    const partyColumns = headers.map((h, i) => ({ name: h, index: i }))
        .filter(h => h.name && !standardHeaders.includes(h.name));

    const sectionData = {};

    for (let i = 1; i < allRows.length; i++) {
        const rowData = allRows[i];
        if (!rowData[seccionIdx] || rowData[seccionIdx] === 'N/A') continue;

        const seccion = rowData[seccionIdx].trim();
        const muniName = rowData[municipalityIdx]?.trim() || (electionType === 'gubernatura' ? 'CHIAPAS' : 'DESCONOCIDO');
        const muniId = rowData[muniIdIdx];

        const key = `${muniName}_${seccion}`;
        if (!sectionData[key]) {
            sectionData[key] = {
                election_year: year,
                election_type: electionType,
                municipality: muniName,
                section_id: seccion,
                party_results: {},
                candidate_names: {},
                total_votes: 0,
                nominal_list_size: 0
            };
        }

        sectionData[key].total_votes += totalVotosIdx !== -1 ? cleanNum(rowData[totalVotosIdx]) : 0;
        sectionData[key].nominal_list_size += listaNominalIdx !== -1 ? cleanNum(rowData[listaNominalIdx]) : 0;

        partyColumns.forEach(p => {
            const v = cleanNum(rowData[p.index]);
            sectionData[key].party_results[p.name] = (sectionData[key].party_results[p.name] || 0) + v;

            const candidate = getCandidateFuzzy(p.name, muniId, candidateMap, electionType);
            if (candidate) {
                sectionData[key].candidate_names[p.name] = candidate;
            }
        });
    }

    const records = Object.values(sectionData).map(s => {
        const partyEntries = Object.entries(s.party_results).sort((a, b) => b[1] - a[1]);
        return {
            ...s,
            winning_votes: partyEntries[0]?.[1] || 0,
            second_place_votes: partyEntries[1]?.[1] || 0,
            target_votes_calculated: Math.ceil((partyEntries[0]?.[1] || 0) * 1.1)
        };
    });

    console.log(`Upserting ${records.length} results...`);
    const { error } = await supabase.from('historical_election_results').upsert(records);
    if (error) console.error("ErrorResults:", error);
}

async function importPadron(filePath, year) {
    console.log(`\n--- Importing Padron ${filePath} ---`);
    const text = fs.readFileSync(filePath, 'utf8');
    const allRows = parseCsvCustom(text, text.includes(';') ? ';' : ',');
    const headers = allRows[0].map(h => h.toUpperCase().replace(/[\n\r]/g, ' ').trim());

    const seccionIdx = headers.indexOf('SECCION');
    const municipalityIdx = headers.findIndex(h => h.includes('NOMBRE MUNICIPIO') || (h.includes('MUNICIPIO') && !h.includes('CLAVE')));
    const totalIdx = headers.findIndex(h => h.includes('PADRON ELECTORAL') || h === 'PADRON_TOTAL' || h === 'PADRON');
    const homIdx = headers.findIndex(h => h.includes('PADRON HOMBRES') || h === 'HOMBRES');
    const mujIdx = headers.findIndex(h => h.includes('PADRON MUJERES') || h === 'MUJERES');

    console.log("Headers detected:", headers);
    console.log("Indices:", { seccionIdx, municipalityIdx, totalIdx, homIdx, mujIdx });

    const records = [];
    for (let i = 1; i < allRows.length; i++) {
        const row = allRows[i];
        if (!row[seccionIdx]) continue;

        records.push({
            year: year,
            section_id: row[seccionIdx],
            municipality: row[municipalityIdx]?.trim() || 'DESCONOCIDO',
            padron_total: cleanNum(row[totalIdx]),
            hombres: cleanNum(row[homIdx]),
            mujeres: cleanNum(row[mujIdx]),
            edad_rangos: {}
        });
    }

    console.log(`Upserting ${records.length} padron records...`);
    // Batch upsert to avoid payload limits
    const batchSize = 1000;
    for (let i = 0; i < records.length; i += batchSize) {
        const { error } = await supabase.from('padron_electoral').upsert(records.slice(i, i + batchSize));
        if (error) {
            console.error("ErrorPadron:", error);
            throw error;
        }
    }
}

async function main() {
    try {
        const govCandidates = loadCandidateMap('C:/Users/helme/Downloads/Subir CSV/Candidatos_Gobernador.csv', 'gubernatura');
        const ayuntCandidates = loadCandidateMap('C:/Users/helme/Downloads/Subir CSV/Candidatos_Ayuntamientos.csv', 'ayuntamiento');

        console.log("Cleaning 2024 results...");
        await supabase.from('historical_election_results').delete().eq('election_year', 2024);

        await importResults('C:/Users/helme/Downloads/Subir CSV/Ayuntamientos_Eleccion.csv', 'ayuntamiento', 2024, ayuntCandidates);
        await importResults('C:/Users/helme/Downloads/Subir CSV/Gobernador.csv', 'gubernatura', 2024, govCandidates);

        console.log("Cleaning 2024 padron...");
        await supabase.from('padron_electoral').delete().eq('year', 2024);
        await importPadron('C:/Users/helme/Downloads/Subir CSV/padron_edad_sexo.csv', 2024);

        console.log("\n--- EVERYTHING FINISHED SUCCESSFULLY ---");
    } catch (e) {
        console.error("CRITICAL ERROR:", e);
    }
}

main();
