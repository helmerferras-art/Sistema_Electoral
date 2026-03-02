import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { Layers, Shield, PlusCircle, Upload, LogOut, Trash2, Activity, Settings, BarChart2, Search, FileText, Users } from 'lucide-react';
import { AdminManager } from './AdminManager';
import { SecuritySettings } from './SecuritySettings';




export const SuperAdminDashboard = () => {
    const { user, signOut } = useAuth();
    const [tenants, setTenants] = useState<any[]>([]);
    const [globalLayers, setGlobalLayers] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState<'gestion' | 'monitoreo' | 'estadistica' | 'padron' | 'usuarios' | 'sistema'>('gestion');

    // OTA Deployment State
    const [otaVersion, setOtaVersion] = useState('1.0.1');
    const [otaNotes, setOtaNotes] = useState('Mejoras de rendimiento y seguridad táctica.');
    const [deployingOta, setDeployingOta] = useState(false);
    const [otaMessage, setOtaMessage] = useState('');


    const [tenantStats, setTenantStats] = useState<Record<string, { users: number, convencidos: number, adminName: string, adminPhone: string }>>({});
    const [downloadingDb, setDownloadingDb] = useState<string | null>(null);

    // Padrón Electoral
    const [padronResults, setPadronResults] = useState<any[]>([]);
    const [padronHistory, setPadronHistory] = useState<any[]>([]);
    const [uploadingPadron, setUploadingPadron] = useState(false);
    const [padronYear, setPadronYear] = useState(2024);
    const [padronStatSearch, setPadronStatSearch] = useState('');

    const [newTenantName, setNewTenantName] = useState('');
    const [newSlug, setNewSlug] = useState('');
    const [newAdminPhone, setNewAdminPhone] = useState('');
    const [electionType, setElectionType] = useState('local');
    const [position, setPosition] = useState('presidencia_municipal');
    const [geographicScope, setGeographicScope] = useState('');
    const [availableRegions, setAvailableRegions] = useState<string[]>([]);
    const [loadingRegions, setLoadingRegions] = useState(false);
    const [message, setMessage] = useState('');

    // Electoral Statistics
    const [historicalResults, setHistoricalResults] = useState<any[]>([]);
    const [statSearch, setStatSearch] = useState('');
    const [uploadingStats, setUploadingStats] = useState(false);
    const [uploadElectionType, setUploadElectionType] = useState('ayuntamiento');
    const [uploadYear, setUploadYear] = useState(2024);
    const [searchYear, setSearchYear] = useState(2024);
    const [searchType, setSearchType] = useState('ayuntamiento');
    const [uploadHistory, setUploadHistory] = useState<any[]>([]);
    const [searchingResults, setSearchingResults] = useState(false);

    // Layer Upload Form
    const [layerType, setLayerType] = useState('municipio');
    const [uploadingLayer, setUploadingLayer] = useState(false);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            // Load Tenants
            const { data: tenantsData } = await supabase.from('tenants').select('*').order('created_at', { ascending: false });
            if (tenantsData) {
                setTenants(tenantsData);

                // Fetch aggregations for Monitoreo (Optimized multi-tenant fetch)
                const { data: usersData } = await supabase.from('users').select('tenant_id, role, name, phone');
                const { data: supportersData } = await supabase.from('supporters').select('tenant_id').eq('commitment_level', 5);

                if (usersData && supportersData) {
                    const stats: Record<string, { users: number, convencidos: number, adminName: string, adminPhone: string }> = {};

                    tenantsData.forEach(t => {
                        stats[t.id] = { users: 0, convencidos: 0, adminName: 'Sin Admin', adminPhone: 'N/A' };
                    });

                    usersData.forEach(u => {
                        if (stats[u.tenant_id]) {
                            stats[u.tenant_id].users++;
                            if (u.role === 'candidato') {
                                stats[u.tenant_id].adminName = u.name;
                                stats[u.tenant_id].adminPhone = u.phone;
                            }
                        }
                    });

                    supportersData.forEach(s => {
                        if (stats[s.tenant_id]) {
                            stats[s.tenant_id].convencidos++;
                        }
                    });

                    setTenantStats(stats);
                }
            }

            // Load Global Layers
            const { data: layersData } = await supabase.from('global_map_layers').select('*').order('created_at', { ascending: false });
            if (layersData) setGlobalLayers(layersData);

            // Load Historical Results (Summary grouping) - Exhaustive Fetch
            let allSummaryData: any[] = [];
            let from = 0;
            let to = 999;
            let hasMore = true;

            console.log("🔍 Iniciando carga de historial electoral...");
            while (hasMore) {
                const { data, error } = await supabase
                    .from('historical_election_results')
                    .select('election_year, election_type, municipality')
                    .range(from, to);

                if (error) {
                    console.error("❌ Error cargando fragmento de historial:", error);
                    break;
                }
                if (data && data.length > 0) {
                    allSummaryData = [...allSummaryData, ...data];
                    if (data.length < 1000) hasMore = false;
                    else {
                        from += 1000;
                        to += 1000;
                    }
                } else {
                    hasMore = false;
                }
            }
            console.log(`✅ Historial cargado: ${allSummaryData.length} registros totales.`);

            if (allSummaryData.length > 0) {
                const historyMap = new Map();
                allSummaryData.forEach(r => {
                    const isMunicipal = r.election_type === 'ayuntamiento';
                    const key = isMunicipal
                        ? `${r.election_year}-${r.election_type}-${r.municipality}`
                        : `${r.election_year}-${r.election_type}`;

                    if (!historyMap.has(key)) {
                        historyMap.set(key, {
                            year: r.election_year,
                            type: r.election_type,
                            municipality: isMunicipal ? r.municipality : null,
                            sections: 0
                        });
                    }
                    historyMap.get(key).sections++;
                });
                setUploadHistory(Array.from(historyMap.values()));
            }

            // Load Detailed Results for the table (limited sample)
            const { data: historyData } = await supabase
                .from('historical_election_results')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);

            if (historyData) setHistoricalResults(historyData);

            // Initial search to populate the table with the default view
            searchDetailedResults(searchYear, searchType, '');

            // Load Padrón Summary
            const { data: padronSummary, error: padronError } = await supabase
                .from('padron_electoral')
                .select('year, section_id')
                .limit(10000);

            if (padronError && padronError.code === '42P01') {
                console.warn("Table padron_electoral not found. Please run the SQL script.");
            } else if (padronSummary) {
                const pMap = new Map();
                padronSummary.forEach(p => {
                    if (!pMap.has(p.year)) pMap.set(p.year, { year: p.year, sections: 0 });
                    pMap.get(p.year).sections++;
                });
                setPadronHistory(Array.from(pMap.values()));
            }

            // Load Padrón Detailed
            const { data: padronData } = await supabase
                .from('padron_electoral')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(100);
            if (padronData) setPadronResults(padronData);
        } catch (error) {
            console.error("Error loading superadmin data", error);
        } finally {
            // Loading handled locally if needed, but removed for clean-up
        }
    };

    const searchDetailedResults = async (year: number, type: string, search: string) => {
        setSearchingResults(true);
        try {
            console.log(`🔎 Buscando resultados: ${year}, ${type}, "${search}"`);
            let query = supabase
                .from('historical_election_results')
                .select('*')
                .eq('election_year', year)
                .eq('election_type', type)
                .order('municipality', { ascending: true })
                .order('section_id', { ascending: true });

            if (search) {
                if (!isNaN(parseInt(search))) {
                    query = query.ilike('section_id', `%${search}%`);
                } else {
                    query = query.ilike('municipality', `%${search}%`);
                }
            }

            const { data, error } = await query.limit(1000);
            if (error) throw error;
            if (data) {
                console.log(`✅ Se encontraron ${data.length} registros detallados.`);
                setHistoricalResults(data);
            }
        } catch (error) {
            console.error("Error searching detailed results", error);
        } finally {
            setSearchingResults(false);
        }
    };

    // Dynamically fetch regions based on the selected position and the uploaded layers
    useEffect(() => {
        const fetchRegions = async () => {
            const positionToLayerType: Record<string, string> = {
                'presidencia_municipal': 'municipio',
                'diputacion_local': 'distrito_local',
                'diputacion_federal': 'distrito_federal',
                'gubernatura': 'entidad',
                'senaduria': 'entidad',
                'presidencia': 'entidad'
            };

            const layerTypeNeeded = positionToLayerType[position];
            const layer = globalLayers.find(l => l.layer_type === layerTypeNeeded);

            if (!layer) {
                setAvailableRegions([]);
                return;
            }

            setLoadingRegions(true);
            try {
                const targetUrl = layer.layer_url || layer.geojson_url;
                if (!targetUrl) throw new Error("No se encontró una URL válida para la capa.");

                const response = await fetch(targetUrl);
                const contentType = response.headers.get('content-type');

                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: No se pudo obtener el archivo del servidor.`);
                }

                if (!contentType || !contentType.includes('application/json')) {
                    throw new Error("El archivo descargado no es un JSON válido (posible error 404/Redirección).");
                }

                const geojson = await response.json();

                if (geojson.features) {
                    const regions = geojson.features.map((f: any) => {
                        const props = f.properties;
                        // Heuristics for finding the region name in properties
                        if (props.municipio) return props.municipio;
                        if (props.NOM_MUN) return props.NOM_MUN;
                        if (props.NOMGEO) return props.NOMGEO;
                        if (props.distrito) return `Distrito ${props.distrito}`;
                        if (props.ID_DISTRIT) return `Distrito ${props.ID_DISTRIT}`;
                        if (props.distrito_f) return `Distrito Federal ${props.distrito_f}`;
                        if (props.ENTIDAD) return props.ENTIDAD;

                        const nameKey = Object.keys(props).find(k => (k.toLowerCase().includes('nom') || k.toLowerCase().includes('name') || k.toLowerCase().includes('mun')) && typeof props[k] === 'string' && isNaN(Number(props[k])));
                        if (nameKey) return props[nameKey];

                        const anyStringKey = Object.keys(props).find(k => typeof props[k] === 'string' && isNaN(Number(props[k])) && props[k].trim().length > 2);
                        if (anyStringKey) return props[anyStringKey];

                        return props.name || props.MUNICIPIO || props.CVE_MUN || props.id || props.ID || props.CVEGEO || null;
                    }).filter(Boolean);

                    const uniqueRegions = Array.from(new Set(regions)).map(String).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
                    setAvailableRegions(uniqueRegions);

                    if (uniqueRegions.length > 0 && !uniqueRegions.includes(geographicScope)) {
                        setGeographicScope(uniqueRegions[0]);
                    }
                }
            } catch (error) {
                console.error(`Error fetching regions from ${layer?.layer_url || 'unknown URL'}:`, error);
                setAvailableRegions([]);
            } finally {
                setLoadingRegions(false);
            }
        };

        fetchRegions();
    }, [position, globalLayers]);

    const handleCreateTenant = async (e: React.FormEvent) => {
        e.preventDefault();
        setMessage('');

        const { data: tenantData, error: tenantError } = await supabase
            .from('tenants')
            .insert([{
                name: newTenantName,
                slug: newSlug.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, ''),
                election_type: electionType,
                position: position,
                geographic_scope: geographicScope
            }])
            .select()
            .single();

        if (tenantError) {
            setMessage(`Error al crear campaña: ${tenantError.message}`);
            return;
        }

        // Generar Código Táctico de 6 dígitos
        const tacticalCode = Math.floor(100000 + Math.random() * 900000).toString();

        const { error: userError } = await supabase
            .from('users')
            .insert([{
                tenant_id: tenantData.id,
                name: `Candidato - ${newTenantName}`,
                phone: newAdminPhone.startsWith('+52') ? newAdminPhone : `+52${newAdminPhone}`,
                role: 'candidato',
                rank_name: 'Comandante Supremo',
                temp_code: tacticalCode,
                is_first_login: true
            }]);

        if (userError) {
            setMessage(`Error al crear usuario administrador: ${userError.message}`);
            return;
        }

        setMessage('¡Campaña y Administrador creados con éxito!');
        setNewTenantName('');
        setNewSlug('');
        setNewAdminPhone('');
        setGeographicScope('');
        loadData();
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploadingLayer(true);
        setMessage('Subiendo y procesando capa cartográfica...');

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `${layerType}_${Date.now()}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('map_layers')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage.from('map_layers').getPublicUrl(fileName);

            const { error: dbError } = await supabase
                .from('global_map_layers')
                .insert([{
                    layer_type: layerType,
                    layer_name: file.name,
                    layer_url: publicUrl
                }]);

            if (dbError) throw dbError;

            setMessage('✅ Capa maestra subida exitosamente.');
            loadData();
        } catch (error: any) {
            console.error('Upload error:', error);
            setMessage(`❌ Error al subir: ${error.message}`);
        } finally {
            setUploadingLayer(false);
        }
    };

    const handleDeleteLayer = async (id: string, layerName: string) => {
        if (!confirm(`¿Estás seguro de eliminar la capa ${layerName}?`)) return;

        try {
            const { error: dbError } = await supabase.from('global_map_layers').delete().eq('id', id);
            if (dbError) throw dbError;

            await supabase.storage.from('map_layers').remove([layerName]);

            setMessage('✅ Capa eliminada exitosamente.');
            loadData();
        } catch (error: any) {
            console.error('Delete error:', error);
            setMessage(`❌ Error al eliminar: ${error.message}`);
        }
    };

    const handleBackup = async (tenantId: string, tenantName: string) => {
        setDownloadingDb(tenantId);
        try {
            const { data: usersData } = await supabase.from('users').select('*').eq('tenant_id', tenantId);
            const { data: supportersData } = await supabase.from('supporters').select('*').eq('tenant_id', tenantId);
            const { data: assignmentsData } = await supabase.from('resource_assignments').select('*').eq('tenant_id', tenantId);

            const backupData = {
                timestamp: new Date().toISOString(),
                tenant: tenantName,
                users: usersData || [],
                supporters: supportersData || [],
                assignments: assignmentsData || []
            };

            const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `backup_c4i_${tenantName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error: any) {
            alert(`Error al generar respaldo: ${error.message}`);
        } finally {
            setDownloadingDb(null);
        }
    };

    const handleCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploadingStats(true);
        setMessage('Procesando archivo CSV...');

        const reader = new FileReader();
        reader.onload = async (e) => {
            console.log("📂 Iniciando procesamiento de CSV...");
            try {
                const text = e.target?.result as string;
                console.log(`📊 Caracteres leídos: ${text?.length || 0}`);
                // Detección robusta de delimitadores y filas
                let delimiter = ',';
                const firstLines = text.slice(0, 5000).split(/\r?\n/).filter(line => line.trim().length > 0);
                if (firstLines.length > 0) {
                    const delimiters = [',', ';', '\t', '|'];
                    let bestDelim = ',';
                    let maxFields = 0;
                    delimiters.forEach(d => {
                        const count = firstLines[0].split(d).length;
                        if (count > maxFields) {
                            maxFields = count;
                            bestDelim = d;
                        }
                    });
                    delimiter = bestDelim;
                }

                const rows = text.split(/\r?\n/).filter(r => r.trim().length > 0);

                const parseCsvLine = (line: string, delim: string) => {
                    const result = [];
                    let current = '';
                    let inQuotes = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') inQuotes = !inQuotes;
                        else if (char === delim && !inQuotes) {
                            result.push(current.trim());
                            current = '';
                        } else current += char;
                    }
                    result.push(current.trim());
                    return result;
                };

                // Buscar la fila de encabezados (a veces hay basura al inicio)
                let headerRowIndex = 0;
                for (let i = 0; i < Math.min(rows.length, 15); i++) {
                    const testLine = rows[i].toUpperCase();
                    if (testLine.includes('SECCION') || testLine.includes('MUNICIPIO') || testLine.includes('TOTAL_VOTO')) {
                        headerRowIndex = i;
                        break;
                    }
                }

                const headers = parseCsvLine(rows[headerRowIndex], delimiter)
                    .map(h => h.trim().replace(/^\ufeff/, '').toUpperCase());

                const seccionIdx = headers.findIndex(h => h === 'SECCION' || h === 'SEC' || h === 'CLAVE_SECCION');
                const municipalityIdx = headers.findIndex(h =>
                    (h.includes('MUNICIPIO') || h.includes('NOMBRE_MUN') || h.includes('MUNICIPIO_LOCAL')) && !h.includes('ID_')
                );
                const totalVotosIdx = headers.findIndex(h => h.includes('TOTAL_VOTO') || h.includes('TOTAL_VOTACION') || h.includes('TOTAL VOTOS'));
                const listaNominalIdx = headers.findIndex(h => h.includes('LISTA_NOMINAL') || h === 'L.N.' || h === 'NOMINAL' || h.includes('LISTA_NOMINAL_CASILLA'));

                // Demographic Indexes (para archivos que traen ambos)
                const padronIdx = headers.findIndex(h => h === 'PADRON' || h === 'PADRON_TOTAL' || h === 'TOTAL_PADRON');
                const hombresIdx = headers.findIndex(h => h === 'HOMBRES' || h === 'PADRON_HOMBRES' || h === 'SEXO_H');
                const mujeresIdx = headers.findIndex(h => h === 'MUJERES' || h === 'PADRON_MUJERES' || h === 'SEXO_M');

                if (seccionIdx === -1) {
                    console.error("❌ Los encabezados no contienen 'SECCION':", headers);
                    throw new Error("No se encontró la columna 'SECCION'. Encabezados detectados: " + JSON.stringify(headers));
                }
                console.log("✅ Encabezados validados:", { seccionIdx, municipalityIdx, totalVotosIdx });

                // Identificar columnas de partidos/coaliciones
                const demographicHeaders = ['PADRON', 'PADRON_TOTAL', 'TOTAL_PADRON', 'HOMBRES', 'PADRON_HOMBRES', 'SEXO_H', 'MUJERES', 'PADRON_MUJERES', 'SEXO_M'];
                const standardHeaders = [
                    'SECCION', 'SEC', 'CLAVE_SECCION', 'TOTAL_VOTOS', 'TOTAL_VOTO', 'TOTAL_VOTACION', 'TOTAL VOTOS',
                    'LISTA_NOMINAL', 'LISTA_NOMINAL_CASILLA', 'NOMINAL', 'L.N.', 'CASILLA', 'ID_MUNICIPIO', 'ID_MUNICIPI', 'ID_MUNICIPIO_LOCAL',
                    'MUNICIPIO', 'NOMBRE_MUN', 'MUNICIPIO_LOCAL', 'DISTRITO', 'ID_DISTRITO', 'CABECERA', 'COLONIA', 'ID_ENTIDAD', 'ENTIDAD',
                    ...demographicHeaders
                ];

                // Detección de columnas de edad
                const ageRangeColumns = headers.map((h, i) => ({ name: h, index: i }))
                    .filter(h => (h.name.includes('-') || h.name.startsWith('E') || h.name.includes('AÑOS')) && /\d/.test(h.name));

                const partyColumns = headers.map((h, i) => ({ name: h, index: i }))
                    .filter(h => h.name && !standardHeaders.includes(h.name) && !ageRangeColumns.some(a => a.name === h.name));

                const cleanNum = (val: string) => {
                    if (!val || val === '-') return 0;
                    return parseInt(val.replace(/[^\d]/g, '') || '0') || 0;
                };
                const sectionData: Record<string, any> = {};

                for (let i = headerRowIndex + 1; i < rows.length; i++) {
                    const rowData = parseCsvLine(rows[i], delimiter);
                    if (rowData.length < seccionIdx + 1) continue;

                    const seccion = rowData[seccionIdx]?.trim();
                    if (!seccion || isNaN(parseInt(seccion))) continue;

                    if (!sectionData[seccion]) {
                        sectionData[seccion] = {
                            election_year: uploadYear,
                            election_type: uploadElectionType,
                            municipality: (municipalityIdx !== -1 ? rowData[municipalityIdx]?.trim() : '') || geographicScope || 'TUXTLA GUTIERREZ',
                            section_id: seccion,
                            total_votes: 0,
                            nominal_list_size: 0,
                            winning_votes: 0,
                            second_place_votes: 0,
                            target_votes_calculated: 0,
                            party_results: {} as Record<string, number>,
                            padron_total: 0,
                            padron_hombres: 0,
                            padron_mujeres: 0,
                            padron_edad_rangos: {} as Record<string, number>
                        };
                    }

                    sectionData[seccion].total_votes += totalVotosIdx !== -1 ? cleanNum(rowData[totalVotosIdx]) : 0;
                    sectionData[seccion].nominal_list_size += listaNominalIdx !== -1 ? cleanNum(rowData[listaNominalIdx]) : 0;

                    // Aggregate party votes
                    partyColumns.forEach(p => {
                        const votes = cleanNum(rowData[p.index]);
                        sectionData[seccion].party_results[p.name] = (sectionData[seccion].party_results[p.name] || 0) + votes;
                    });

                    // Aggregate demographic data
                    if (padronIdx !== -1) sectionData[seccion].padron_total += cleanNum(rowData[padronIdx]);
                    if (hombresIdx !== -1) sectionData[seccion].padron_hombres += cleanNum(rowData[hombresIdx]);
                    if (mujeresIdx !== -1) sectionData[seccion].padron_mujeres += cleanNum(rowData[mujeresIdx]);

                    ageRangeColumns.forEach(p => {
                        sectionData[seccion].padron_edad_rangos[p.name] = (sectionData[seccion].padron_edad_rangos[p.name] || 0) + cleanNum(rowData[p.index]);
                    });
                }

                const recordsToInsert = Object.values(sectionData).map((s: any) => {
                    // Calculate Winner and Second Place from party_results
                    const partyEntries = Object.entries(s.party_results as Record<string, number>)
                        .sort((a, b) => b[1] - a[1]);

                    const winnerVotes = partyEntries.length > 0 ? partyEntries[0][1] : 0;
                    const secondVotes = partyEntries.length > 1 ? partyEntries[1][1] : 0;

                    // If Total Votos header was missing, sum up parties
                    if (s.total_votes === 0) {
                        s.total_votes = Object.values(s.party_results as Record<string, number>).reduce((a, b) => a + b, 0);
                    }

                    return {
                        ...s,
                        winning_votes: winnerVotes,
                        second_place_votes: secondVotes,
                        // Goal: Winner + 10%
                        target_votes_calculated: Math.ceil(winnerVotes * 1.1) || Math.ceil((s.total_votes / 2) * 1.1)
                    };
                });

                console.log(`🚀 Enviando ${recordsToInsert.length} registros a Supabase...`);
                const { error } = await supabase
                    .from('historical_election_results')
                    .upsert(recordsToInsert, {
                        onConflict: 'election_year,election_type,municipality,section_id'
                    });

                if (error) {
                    console.error("❌ Error de Supabase:", error);
                    throw error;
                }
                console.log("💎 Importación finalizada con éxito.");

                setMessage(`✅ ${recordsToInsert.length} secciones cargadas exitosamente.`);
                loadData();
                event.target.value = ''; // Reset file input
            } catch (err: any) {
                console.error("CSV Upload Error:", err);
                setMessage(`❌ Error: ${err.message}`);
                event.target.value = ''; // Reset on error too
            } finally {
                setUploadingStats(false);
            }
        };
        reader.readAsText(file);
    };

    const handlePadronCsvUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setUploadingPadron(true);
        setMessage('Procesando Padrón Electoral...');

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;

                // 1. Detección de Delimitador más robusta (cuenta ocurrencias por línea)
                const possibleDelimiters = [',', ';', '\t', '|'];
                let delimiter = ',';
                let maxConsistency = 0;

                const linesForDetection = text.slice(0, 5000).split(/\r?\n/).filter(l => l.trim().length > 0).slice(0, 5);

                possibleDelimiters.forEach(d => {
                    const counts = linesForDetection.map(l => l.split(d).length);
                    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
                    const isConsistent = counts.every(c => c === counts[0] && c > 1);
                    if (isConsistent && avg > maxConsistency) {
                        maxConsistency = avg;
                        delimiter = d;
                    } else if (avg > maxConsistency) {
                        maxConsistency = avg;
                        delimiter = d;
                    }
                });

                const rawRows = text.split(/\r?\n/).filter(r => r.trim().length > 0);

                // Función para parsear una línea de CSV respetando comillas
                const parseCsvLine = (line: string, delim: string) => {
                    const result = [];
                    let cur = '';
                    let inQuote = false;
                    for (let i = 0; i < line.length; i++) {
                        const char = line[i];
                        if (char === '"') inQuote = !inQuote;
                        else if (char === delim && !inQuote) {
                            result.push(cur.trim().replace(/^"|"$/g, ''));
                            cur = '';
                        } else cur += char;
                    }
                    result.push(cur.trim().replace(/^"|"$/g, ''));
                    return result;
                };

                // 2. Buscar la Fila de Encabezados
                let headers: string[] = [];
                let headerRowIndex = -1;

                for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                    const currentHeaders = parseCsvLine(rawRows[i], delimiter).map(h =>
                        h.toUpperCase().normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "")
                            .replace(/[\n\r]/g, " ") // ELIMINAR SALTOS DE LÍNEA EN ENCABEZADOS
                            .trim()
                    );
                    if (currentHeaders.some(h => h === 'SECCION' || h.includes('SECCION') || h === 'SEC' || h === 'ID_SECCION' || h.includes('CLAVE_SECCION'))) {
                        headers = currentHeaders;
                        headerRowIndex = i;
                        break;
                    }
                }

                if (headerRowIndex === -1) {
                    const firstLinePreview = parseCsvLine(rawRows[0], delimiter).slice(0, 5).join(' | ');
                    throw new Error(`No se encontró la columna 'SECCION'. Encabezados detectados: [${firstLinePreview}]. Revisa si el archivo está delimitado por '${delimiter}' o si los encabezados están en las primeras 10 filas.`);
                }

                const seccionIdx = headers.findIndex(h => h.includes('SECCION') || h === 'SEC' || h.includes('CLAVE_SECCION'));
                const municipalityIdx = headers.findIndex(h => h.includes('NOMBRE MUNICIPIO') || (h.includes('MUNICIPIO') && !h.includes('CLAVE')));
                const padronIdx = headers.findIndex(h => h.includes('PADRON ELECTORAL') || h.includes('LISTA NOMINAL') || h === 'PADRON' || h === 'PADRON_ELECTORAL');
                const hombresIdx = headers.findIndex(h => h.includes('HOMBRES') || h.includes('PADRON HOMBRES') || h.includes('PADRON_HOMBRES'));
                const mujeresIdx = headers.findIndex(h => h.includes('MUJERES') || h.includes('PADRON MUJERES') || h.includes('PADRON_MUJERES'));

                const ageRangeColumns = headers.map((h, i) => ({ name: h, index: i }))
                    .filter(h =>
                        (h.name.includes('PADRON') || h.name.includes('EDAD') || h.name.includes('-')) &&
                        /\d/.test(h.name) &&
                        h.index !== hombresIdx && h.index !== mujeresIdx && h.index !== padronIdx && h.index !== seccionIdx
                    );

                const sectionData: Record<string, any> = {};

                for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
                    const row = parseCsvLine(rawRows[i], delimiter);
                    if (row.length < seccionIdx + 1) continue;

                    const seccion = row[seccionIdx]?.trim();
                    if (!seccion || isNaN(parseInt(seccion))) continue;

                    if (!sectionData[seccion]) {
                        sectionData[seccion] = {
                            section_id: seccion,
                            municipality: (municipalityIdx !== -1 ? row[municipalityIdx]?.trim() : '') || geographicScope || 'TUXTLA GUTIERREZ',
                            year: padronYear,
                            padron_total: 0,
                            hombres: 0,
                            mujeres: 0,
                            edad_rangos: {} as Record<string, number>
                        };
                    }

                    const cleanNum = (val: string) => {
                        if (!val) return 0;
                        const cleaned = val.replace(/[^\d]/g, '');
                        return parseInt(cleaned) || 0;
                    };

                    if (padronIdx !== -1) sectionData[seccion].padron_total += cleanNum(row[padronIdx]);
                    if (hombresIdx !== -1) sectionData[seccion].hombres += cleanNum(row[hombresIdx]);
                    if (mujeresIdx !== -1) sectionData[seccion].mujeres += cleanNum(row[mujeresIdx]);

                    ageRangeColumns.forEach(p => {
                        const val = cleanNum(row[p.index]);
                        const groupKey = p.name.replace('PADRON', '').trim(); // Limpiar "PADRON 18" a "18"
                        sectionData[seccion].edad_rangos[groupKey] = (sectionData[seccion].edad_rangos[groupKey] || 0) + val;
                    });
                }

                if (Object.keys(sectionData).length === 0) {
                    throw new Error("No se extrajeron datos válidos. Verifica que las columnas de números contengan dígitos.");
                }

                const { error } = await supabase
                    .from('padron_electoral')
                    .upsert(Object.values(sectionData), { onConflict: 'section_id,year' });

                if (error) throw error;
                setMessage(`✅ ${Object.keys(sectionData).length} secciones del padrón cargadas.`);
                loadData();
                event.target.value = '';
            } catch (err: any) {
                console.error("Padron Upload Error:", err);
                if (err.code === '42P01' || err.message?.includes('404')) {
                    setMessage(`❌ Error: La tabla 'padron_electoral' no existe. Por favor ejecuta el archivo padron_electoral.sql en el SQL Editor de Supabase.`);
                } else {
                    setMessage(`❌ Error: ${err.message}`);
                }
            } finally {
                setUploadingPadron(false);
            }
        };
        reader.readAsText(file, "ISO-8859-1");
    };

    if (user?.role !== 'superadmin') {
        return <div className="flex-center flex-col" style={{ height: '80vh', gap: '1rem' }}>
            <Shield size={64} color="var(--primary)" />
            <h2 style={{ color: 'var(--primary)' }}>ACCESO DENEGADO</h2>
            <p style={{ color: '#64748B' }}>Solo el Alto Mando tiene acceso a este sistema maestro.</p>
        </div>;
    }

    const handleDeployOta = async () => {
        if (!confirm(`¿Estás seguro de lanzar la versión ${otaVersion} a todos los nodos? Esto compilará el sistema de forma remota.`)) return;

        setDeployingOta(true);
        setOtaMessage('Iniciando protocolo de despliegue remoto...');

        try {
            // Se asume que el token está configurado de forma segura en tus variables de entorno o preferiblemente en la tabla de configuraciones Supabase
            // Para propósitos de este entorno, requeriríamos que el Token de GitHub se pase o se almacene de forma segura.
            // Sustituye GITHUB_TOKEN por tu token real de Personal Access Token (PAT) con permisos repo y workflow.
            // @ts-ignore
            const GITHUB_TOKEN = import.meta.env.VITE_GITHUB_TOKEN || window.prompt("Ingresa tu GitHub Personal Access Token (PAT) para autorizar el despliegue:");

            if (!GITHUB_TOKEN) {
                throw new Error("Se requiere un Token de GitHub válido para proceder.");
            }

            const response = await fetch('https://api.github.com/repos/Helmer-2000/C4I-Secure-Node/actions/workflows/build-release.yml/dispatches', {
                method: 'POST',
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'X-GitHub-Api-Version': '2022-11-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ref: 'main',
                    inputs: {
                        version: otaVersion,
                        release_notes: otaNotes
                    }
                })
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(`GitHub API Error (${response.status}): ${errData.message || 'Error desconocido'}`);
            }

            setOtaMessage('✅ ¡Orden de Despliegue enviada con éxito! La nube de GitHub está compilando la versión ' + otaVersion + '. Los nodos locales la descargarán en aproximadamente 10-15 minutos.');

        } catch (error: any) {
            console.error("OTA Deploy Error:", error);
            setOtaMessage(`❌ Error de Despliegue: ${error.message}`);
        } finally {
            setDeployingOta(false);
        }
    };

    return (
        <div style={{ display: 'flex', justifyContent: 'center', width: '100%', minHeight: '100vh', background: 'var(--bg-color)' }}>
            <div className="flex-col gap-4" style={{
                maxWidth: '1400px',
                width: '100%',
                padding: 'clamp(1rem, 3vw, 2rem)',
                alignItems: 'center'
            }}>
                {/* CENTRAL COMMAND HEADER */}
                <header className="tactile-card" style={{
                    background: 'linear-gradient(135deg, rgba(15, 18, 24, 0.95) 0%, rgba(30, 35, 45, 0.95) 100%)',
                    padding: '1.5rem',
                    border: '1px solid var(--primary)',
                    boxShadow: '0 8px 32px rgba(255, 90, 54, 0.1)',
                    position: 'relative', overflow: 'hidden',
                    width: '100%'
                }}>
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundImage: 'radial-gradient(var(--primary) 1px, transparent 1px)',
                        backgroundSize: '30px 30px', opacity: 0.05, pointerEvents: 'none'
                    }} />

                    <div className="flex-row-resp" style={{ position: 'relative', zIndex: 1, justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <div style={{ padding: '0.8rem', background: 'rgba(255,90,54,0.1)', borderRadius: '12px', border: '1px solid var(--primary)' }}>
                                <Shield size={32} color="var(--primary)" />
                            </div>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.5rem', color: 'white', letterSpacing: '1px' }}>CENTRAL COMMAND</h1>
                                <p className="tactical-font" style={{ margin: 0, color: 'var(--primary)', fontSize: '0.7rem' }}>SISTEMA MAESTRO SAAS</p>
                            </div>
                        </div>
                        <button onClick={signOut} className="squishy-btn danger" style={{ background: 'transparent', border: '1px solid #EF4444', color: '#EF4444' }}>
                            <LogOut size={18} /> SALIR
                        </button>
                    </div>

                    {/* Tabs Selection */}
                    <div className="scroll-tabs" style={{ marginTop: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                        <button
                            onClick={() => setActiveTab('gestion')}
                            style={{
                                background: 'transparent', border: 'none',
                                color: activeTab === 'gestion' ? 'var(--tertiary)' : '#64748B',
                                padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                borderBottom: activeTab === 'gestion' ? '2px solid var(--tertiary)' : '2px solid transparent',
                                fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                            }}
                        >
                            <Layers size={18} /> GESTIÓN DE RED Y CUENTAS
                        </button>
                        <button
                            onClick={() => setActiveTab('monitoreo')}
                            style={{
                                background: 'transparent', border: 'none',
                                color: activeTab === 'monitoreo' ? 'var(--primary)' : '#64748B',
                                padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                borderBottom: activeTab === 'monitoreo' ? '2px solid var(--primary)' : '2px solid transparent',
                                fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                            }}
                        >
                            <Activity size={18} /> MONITOREO GLOBAL
                        </button>
                        <button
                            onClick={() => setActiveTab('estadistica')}
                            style={{
                                background: 'transparent', border: 'none',
                                color: activeTab === 'estadistica' ? 'var(--secondary)' : '#64748B',
                                padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                borderBottom: activeTab === 'estadistica' ? '2px solid var(--secondary)' : '2px solid transparent',
                                fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                            }}
                        >
                            <BarChart2 size={18} /> ESTADÍSTICA ELECTORAL
                        </button>
                        <button
                            onClick={() => setActiveTab('padron')}
                            style={{
                                background: 'transparent', border: 'none',
                                color: activeTab === 'padron' ? 'var(--tertiary)' : '#64748B',
                                padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                borderBottom: activeTab === 'padron' ? '2px solid var(--tertiary)' : '2px solid transparent',
                                fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                            }}
                        >
                            <Users size={18} /> PADRÓN ELECTORAL
                        </button>

                        <button
                            onClick={() => setActiveTab('sistema')}
                            style={{
                                background: 'transparent', border: 'none',
                                color: activeTab === 'sistema' ? 'var(--tertiary)' : '#64748B',
                                padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                                borderBottom: activeTab === 'sistema' ? '2px solid var(--tertiary)' : '2px solid transparent',
                                fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                                display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                            }}
                        >
                            <Settings size={18} /> SISTEMA Y DESPLIEGUES
                        </button>
                    </div>

                </header>

                {/* TAB CONTENT */}
                <main className="flex-col gap-4" style={{ width: '100%' }}>
                    {activeTab === 'gestion' && (
                        <>
                            <div className="flex-row-resp" style={{ justifyContent: 'center', alignItems: 'stretch', gap: '2rem', width: '100%' }}>
                                {/* New Tenant Form */}
                                <div className="tactile-card flex-col gap-4" style={{ maxWidth: '480px', flex: '1 1 400px' }}>
                                    <h2 style={{ margin: 0, color: 'var(--secondary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <PlusCircle size={20} /> NUEVA INSTANCIA
                                    </h2>
                                    <form onSubmit={handleCreateTenant} className="flex-col gap-4">
                                        <div className="flex-col gap-1">
                                            <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold', marginLeft: '0.5rem' }}>NOMBRE DE LA CAMPAÑA</label>
                                            <input
                                                className="squishy-input"
                                                placeholder="Ej: Elecciones 2024"
                                                value={newTenantName}
                                                onChange={e => setNewTenantName(e.target.value)}
                                                required
                                            />
                                        </div>
                                        <div className="flex-col gap-1">
                                            <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold', marginLeft: '0.5rem' }}>IDENTIFICADOR DE RUTA (URL SLUG)</label>
                                            <input
                                                className="squishy-input"
                                                placeholder="ej: juan-perez"
                                                value={newSlug}
                                                onChange={e => setNewSlug(e.target.value)}
                                                required
                                            />
                                            {newSlug && <p style={{ fontSize: '0.6rem', color: 'var(--primary)', marginLeft: '0.5rem' }}>URL: nemia.lat/{newSlug.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^\w-]/g, '')}</p>}
                                        </div>
                                        <div className="responsive-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                                            <div className="flex-col gap-1">
                                                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold', marginLeft: '0.5rem' }}>TIPO</label>
                                                <select className="squishy-input" value={electionType} onChange={e => setElectionType(e.target.value)}>
                                                    <option value="local">Local</option>
                                                    <option value="federal">Federal</option>
                                                </select>
                                            </div>
                                            <div className="flex-col gap-1">
                                                <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold', marginLeft: '0.5rem' }}>CARGO</label>
                                                <select className="squishy-input" value={position} onChange={e => setPosition(e.target.value)}>
                                                    {electionType === 'local' ? (
                                                        <>
                                                            <option value="presidencia_municipal">Presidencia Municipal</option>
                                                            <option value="diputacion_local">Diputación Local</option>
                                                            <option value="gubernatura">Gubernatura</option>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <option value="presidencia">Presidencia Rep.</option>
                                                            <option value="senaduria">Senaduría</option>
                                                            <option value="diputacion_federal">Diputación Fed.</option>
                                                        </>
                                                    )}
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex-col gap-1">
                                            <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold', marginLeft: '0.5rem' }}>JURISDICCIÓN</label>
                                            {loadingRegions ? <p style={{ color: 'var(--tertiary)', fontSize: '0.8rem', padding: '0.6rem' }}>Analizando archivos cartográficos...</p> : (
                                                availableRegions.length > 0 ? (
                                                    <select className="squishy-input" value={geographicScope} onChange={e => setGeographicScope(e.target.value)} required>
                                                        <option value="" disabled>Seleccionar Jurisdicción</option>
                                                        {availableRegions.map(r => <option key={r} value={r}>{r}</option>)}
                                                    </select>
                                                ) : (
                                                    <input className="squishy-input" placeholder="Ej: Tuxtla Gutiérrez" value={geographicScope} onChange={e => setGeographicScope(e.target.value)} required />
                                                )
                                            )}
                                        </div>
                                        <div className="flex-col gap-1">
                                            <label style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 'bold', marginLeft: '0.5rem' }}>CELULAR ADMIN</label>
                                            <input className="squishy-input" type="tel" placeholder="10 dígitos" value={newAdminPhone} onChange={e => setNewAdminPhone(e.target.value)} required />
                                        </div>
                                        <button type="submit" className="squishy-btn primary" style={{ background: 'var(--secondary)' }}>
                                            DESPLEGAR INSTANCIA
                                        </button>
                                    </form>
                                    {message && <p style={{ color: 'var(--secondary)', fontSize: '0.9rem' }}>{message}</p>}
                                </div>

                                {/* Master Map Layers */}
                                <div className="tactile-card flex-col gap-4" style={{ maxWidth: '480px', flex: '1 1 400px' }}>
                                    <h2 style={{ margin: 0, color: 'var(--tertiary)', fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <Layers size={20} /> CAPAS MAESTRAS (.geojson)
                                    </h2>
                                    <div className="flex-col gap-2">
                                        <select className="squishy-input" value={layerType} onChange={e => setLayerType(e.target.value)}>
                                            <option value="municipio">Municipios</option>
                                            <option value="distrito_local">Distritos Locales</option>
                                            <option value="distrito_federal">Distritos Federales</option>
                                            <option value="entidad">Entidad Federativa</option>
                                            <option value="seccion">Secciones</option>
                                        </select>
                                        <input type="file" id="layer-upload" hidden onChange={handleFileUpload} disabled={uploadingLayer} />
                                        <label htmlFor="layer-upload" style={{
                                            border: '2px dashed var(--tertiary)', padding: '1.5rem', textAlign: 'center', borderRadius: '12px',
                                            cursor: uploadingLayer ? 'not-allowed' : 'pointer', background: 'rgba(0, 212, 255, 0.05)',
                                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                                            minHeight: '120px'
                                        }}>
                                            <Upload size={24} color="var(--tertiary)" />
                                            <p style={{ margin: 0, color: 'var(--tertiary)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                                                {uploadingLayer ? 'SUBIENDO...' : 'SUBIR .GEOJSON'}
                                            </p>
                                        </label>
                                    </div>
                                    <div className="flex-col gap-2" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                                        {globalLayers.map(l => (
                                            <div key={l.id} className="flex-row-resp" style={{
                                                background: 'rgba(255,255,255,0.03)',
                                                padding: '0.75rem 1rem',
                                                borderRadius: '8px',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                gap: '1rem'
                                            }}>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 'bold', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.layer_name}</p>
                                                    <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--tertiary)' }}>{l.layer_type.toUpperCase()}</p>
                                                </div>
                                                <button onClick={() => handleDeleteLayer(l.id, l.layer_name)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '0.5rem' }}>
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            <div style={{ marginTop: '2rem', width: '100%' }}>
                                <AdminManager />
                            </div>
                        </>
                    )}

                    {activeTab === 'monitoreo' && (
                        <div className="flex-col gap-4">
                            <div className="flex-row-resp" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <h2 style={{ margin: 0, fontFamily: 'Oswald' }}>ESTADO DE LA FLOTA</h2>
                                <button onClick={loadData} className="squishy-btn mini"><Activity size={14} /> REFRESCAR</button>
                            </div>
                            {tenants.map(t => {
                                const stats = tenantStats[t.id] || { users: 0, convencidos: 0, adminName: '...', adminPhone: '...' };
                                return (
                                    <div key={t.id} className="tactile-card flex-row-resp" style={{ gap: '1.5rem', alignItems: 'center', borderLeft: '4px solid var(--tertiary)' }}>
                                        <div style={{ flex: 1 }}>
                                            <h3 style={{ margin: 0, fontSize: '1.3rem' }}>{t.name}</h3>
                                            <p style={{ margin: 0, color: '#64748B', fontSize: '0.8rem' }}>{t.position.replace('_', ' ').toUpperCase()} - {t.geographic_scope}</p>
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}>ADMINISTRADOR</p>
                                            <p style={{ margin: 0, fontWeight: 'bold' }}>{stats.adminName}</p>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--tertiary)' }}>{stats.adminPhone}</p>
                                        </div>
                                        <div className="responsive-grid" style={{ flex: 1, gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
                                            <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '8px' }}>
                                                <p style={{ margin: 0, fontSize: '1.2rem', fontFamily: 'Oswald' }}>{stats.users}</p>
                                                <p style={{ margin: 0, fontSize: '0.6rem', color: '#64748B' }}>USER</p>
                                            </div>
                                            <div style={{ textAlign: 'center', background: 'rgba(0,212,255,0.05)', padding: '0.5rem', borderRadius: '8px' }}>
                                                <p style={{ margin: 0, fontSize: '1.2rem', fontFamily: 'Oswald', color: 'var(--tertiary)' }}>{stats.convencidos}</p>
                                                <p style={{ margin: 0, fontSize: '0.6rem', color: '#64748B' }}>VOTES</p>
                                            </div>
                                        </div>
                                        <div className="flex-col gap-2">
                                            <button onClick={() => handleBackup(t.id, t.name)} disabled={downloadingDb === t.id} className="squishy-btn mini secondary" style={{ width: '100%' }}>
                                                {downloadingDb === t.id ? 'EXTRACT...' : 'BACKUP'}
                                            </button>
                                            <button className="squishy-btn mini" style={{ width: '100%', opacity: 0.5 }}><Settings size={14} /> RESCUE</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {activeTab === 'estadistica' && (
                        <div className="flex-col gap-4">
                            <div className="flex-row-resp" style={{ justifyContent: 'center', alignItems: 'stretch', gap: '1rem' }}>
                                <div className="tactile-card flex-col gap-4">
                                    <div className="flex-row-resp" style={{ justifyContent: 'space-between' }}>
                                        <h2 style={{ margin: 0, color: 'var(--secondary)' }}>IMPORTAR HISTORIAL (.CSV)</h2>
                                        <div className="flex-row-resp" style={{ gap: '0.5rem' }}>
                                            <select className="squishy-input mini" value={uploadYear} onChange={e => setUploadYear(parseInt(e.target.value))}>
                                                <option value={2024}>2024</option>
                                                <option value={2021}>2021</option>
                                            </select>
                                            <select className="squishy-input mini" value={uploadElectionType} onChange={e => setUploadElectionType(e.target.value)}>
                                                <option value="ayuntamiento">Ayuntamiento</option>
                                                <option value="gubernatura">Gubernatura</option>
                                                <option value="diputacion_local">Diputación Local</option>
                                                <option value="diputacion_federal">Diputación Federal</option>
                                                <option value="senaduria">Senaduría</option>
                                            </select>
                                        </div>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Sube el cierre de actas de la última elección. El sistema detectará automáticamente los votos por partido para calcular metas.</p>
                                    <input type="file" id="csv-upload" hidden accept=".csv" onChange={handleCsvUpload} disabled={uploadingStats} />
                                    <label htmlFor="csv-upload" style={{
                                        border: '2px dashed var(--secondary)', padding: '2rem', textAlign: 'center', borderRadius: '12px',
                                        cursor: uploadingStats ? 'not-allowed' : 'pointer', background: 'rgba(255, 90, 54, 0.05)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                    }}>
                                        <FileText size={32} color="var(--secondary)" />
                                        <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--secondary)' }}>
                                            {uploadingStats ? 'PROCESANDO...' : 'SELECCIONAR CSV'}
                                        </p>
                                        <p style={{ fontSize: '0.6rem', color: '#64748B' }}>Columnas req: SECCION. Opcional: Total Votos, Lista Nominal, Partidos...</p>
                                    </label>
                                </div>

                                <div className="tactile-card flex-col gap-4">
                                    <h2 style={{ margin: 0, color: 'var(--tertiary)' }}>BUSCADOR ELECTORAL</h2>
                                    <div className="flex-row-resp" style={{ gap: '0.5rem' }}>
                                        <input
                                            className="squishy-input"
                                            placeholder="Buscar por Sección o Municipio..."
                                            style={{ flex: 1 }}
                                            value={statSearch}
                                            onChange={e => setStatSearch(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && searchDetailedResults(searchYear, searchType, statSearch)}
                                        />
                                        <button
                                            className="squishy-btn mini"
                                            onClick={() => searchDetailedResults(searchYear, searchType, statSearch)}
                                            disabled={searchingResults}
                                        >
                                            <Search size={16} />
                                        </button>
                                    </div>
                                    <div className="flex-row-resp" style={{ gap: '0.5rem' }}>
                                        <div className="flex-row-resp" style={{ gap: '0.5rem' }}>
                                            <select className="squishy-input mini" style={{ flex: 1 }} value={searchYear} onChange={e => setSearchYear(parseInt(e.target.value))}>
                                                <option value={2024}>2024</option>
                                                <option value={2021}>2021</option>
                                            </select>
                                            <select className="squishy-input mini" style={{ flex: 1 }} value={searchType} onChange={e => setSearchType(e.target.value)}>
                                                <option value="ayuntamiento">Ayuntamiento</option>
                                                <option value="gubernatura">Gubernatura</option>
                                                <option value="diputacion_local">Diputación Local</option>
                                                <option value="diputacion_federal">Diputación Federal</option>
                                                <option value="senaduria">Senaduría</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Upload History Summary */}
                            <div className="tactile-card flex-col gap-2">
                                <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--tertiary)' }}>DATOS CARGADOS EN EL SISTEMA</h3>
                                <div className="flex-row-resp" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                                    {uploadHistory.map((h, i) => (
                                        <div
                                            key={i}
                                            onClick={() => {
                                                setSearchYear(h.year);
                                                setSearchType(h.type);
                                                setStatSearch(h.municipality || '');
                                                searchDetailedResults(h.year, h.type, h.municipality || '');
                                            }}
                                            style={{
                                                background: 'rgba(0, 212, 255, 0.05)',
                                                padding: '0.8rem 1.2rem',
                                                borderRadius: '12px',
                                                border: '1px solid rgba(0, 212, 255, 0.2)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '0.8rem',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                opacity: searchingResults ? 0.6 : 1
                                            }}
                                            className="history-card-hover"
                                        >
                                            <div style={{ padding: '0.4rem', background: 'var(--tertiary)', borderRadius: '6px' }}>
                                                <FileText size={16} color="black" />
                                            </div>
                                            <div>
                                                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.9rem' }}>
                                                    {h.municipality ? `${h.municipality} - ` : ''}{h.type.toUpperCase()} {h.year}
                                                </p>
                                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}>{h.sections} secciones activas</p>
                                            </div>
                                        </div>
                                    ))}
                                    {uploadHistory.length === 0 && (
                                        <p style={{ color: '#64748B', fontSize: '0.8rem' }}>No hay archivos históricos detectados.</p>
                                    )}
                                </div>
                            </div>

                            <div className="tactile-card" style={{ padding: 0, overflow: 'hidden' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                    <thead style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--tertiary)', textTransform: 'uppercase', position: 'relative' }}>
                                        {searchingResults && (
                                            <div style={{
                                                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                                background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                zIndex: 10
                                            }}>
                                                <Activity className="spin" size={24} />
                                            </div>
                                        )}
                                        <tr>
                                            <th style={{ padding: '1rem' }}>Sección</th>
                                            <th style={{ padding: '1rem' }}>Municipio</th>
                                            <th style={{ padding: '1rem' }}>Votos Totales</th>
                                            <th style={{ padding: '1rem' }}>Ganador</th>
                                            <th style={{ padding: '1rem' }}>Lista Nominal</th>
                                            <th style={{ padding: '1rem', color: 'var(--secondary)' }}>Meta Sugerida</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historicalResults.map(r => (
                                            <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '1rem', fontWeight: 'bold' }}>{r.section_id}</td>
                                                <td style={{ padding: '1rem' }}>{r.municipality}</td>
                                                <td style={{ padding: '1rem' }}>{r.total_votes.toLocaleString()}</td>
                                                <td style={{ padding: '1rem' }}>
                                                    {(() => {
                                                        const results = r.party_results as Record<string, number>;
                                                        if (!results) return '-';
                                                        const winnerKey = Object.entries(results).sort((a, b) => b[1] - a[1])[0]?.[0];
                                                        const candidate = r.candidate_names?.[winnerKey];
                                                        return (
                                                            <div className="flex-col">
                                                                <span style={{ fontWeight: 'bold', fontSize: '0.8rem', color: 'var(--tertiary)' }}>{candidate || winnerKey}</span>
                                                                <span style={{ fontSize: '0.65rem', color: '#64748B' }}>{r.winning_votes.toLocaleString()} votos</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td style={{ padding: '1rem' }}>{r.nominal_list_size.toLocaleString()}</td>
                                                <td style={{ padding: '1rem', color: 'var(--secondary)', fontWeight: 'bold' }}>{r.target_votes_calculated.toLocaleString()}</td>
                                            </tr>
                                        ))}
                                        {historicalResults.length === 0 && (
                                            <tr>
                                                <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: '#64748B' }}>
                                                    No hay datos históricos cargados. Sube un CSV para comenzar.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {activeTab === 'padron' && (
                        <div className="flex-col gap-4">
                            <div className="responsive-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="tactile-card flex-col gap-4">
                                    <div className="flex-row-resp" style={{ justifyContent: 'space-between' }}>
                                        <h2 style={{ margin: 0, color: 'var(--tertiary)' }}>IMPORTAR PADRÓN (.CSV)</h2>
                                        <select className="squishy-input mini" value={padronYear} onChange={e => setPadronYear(parseInt(e.target.value))}>
                                            <option value={2024}>2024</option>
                                            <option value={2021}>2021</option>
                                        </select>
                                    </div>
                                    <p style={{ fontSize: '0.8rem', color: '#64748B' }}>Sube el registro demográfico (Padrón INE) por sección. Se usará para calcular la penetración real en el C4I.</p>
                                    <input type="file" id="padron-upload" hidden accept=".csv" onChange={handlePadronCsvUpload} disabled={uploadingPadron} />
                                    <label htmlFor="padron-upload" style={{
                                        border: '2px dashed var(--tertiary)', padding: '2rem', textAlign: 'center', borderRadius: '12px',
                                        cursor: uploadingPadron ? 'not-allowed' : 'pointer', background: 'rgba(0, 212, 255, 0.05)',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                                    }}>
                                        <Users size={32} color="var(--tertiary)" />
                                        <p style={{ margin: 0, fontWeight: 'bold', color: 'var(--tertiary)' }}>
                                            {uploadingPadron ? 'PROCESANDO...' : 'SUBIR PADRÓN'}
                                        </p>
                                        <p style={{ fontSize: '0.6rem', color: '#64748B' }}>Columnas: SECCION, PADRON, HOMBRES, MUJERES...</p>
                                    </label>
                                </div>

                                <div className="tactile-card flex-col gap-4">
                                    <h2 style={{ margin: 0, color: 'var(--tertiary)' }}>HISTORIAL DE PADRÓN</h2>
                                    <div className="flex-col gap-2">
                                        {padronHistory.map((h, i) => (
                                            <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <div style={{ padding: '0.5rem', background: 'rgba(0, 212, 255, 0.1)', borderRadius: '8px' }}>
                                                    <Activity size={20} color="var(--tertiary)" />
                                                </div>
                                                <div>
                                                    <p style={{ margin: 0, fontWeight: 'bold' }}>AÑO {h.year}</p>
                                                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}>{h.sections} SECCIONES REGISTRADAS</p>
                                                </div>
                                            </div>
                                        ))}
                                        {padronHistory.length === 0 && <p style={{ color: '#64748B', fontSize: '0.8rem' }}>No hay datos del padrón cargados.</p>}
                                    </div>
                                </div>
                            </div>

                            <div className="tactile-card flex-col gap-4">
                                <div className="flex-row-resp" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                    <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>BUSCADOR DEMOGRÁFICO</h2>
                                    <input
                                        className="squishy-input mini"
                                        placeholder="Buscar sección..."
                                        value={padronStatSearch}
                                        onChange={e => setPadronStatSearch(e.target.value)}
                                        style={{ width: '200px' }}
                                    />
                                </div>
                                <div style={{ overflow: 'hidden', borderRadius: '8px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                                        <thead style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--tertiary)' }}>
                                            <tr>
                                                <th style={{ padding: '1rem' }}>SECCIÓN</th>
                                                <th style={{ padding: '1rem' }}>MUNICIPIO</th>
                                                <th style={{ padding: '1rem' }}>PADRÓN TOTAL</th>
                                                <th style={{ padding: '1rem' }}>HOMBRES</th>
                                                <th style={{ padding: '1rem' }}>MUJERES</th>
                                                <th style={{ padding: '1rem' }}>% GENERO</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {padronResults.filter(r => r.section_id.includes(padronStatSearch)).map(r => (
                                                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                    <td style={{ padding: '1rem', fontWeight: 'bold' }}>{r.section_id}</td>
                                                    <td style={{ padding: '1rem' }}>{r.municipality}</td>
                                                    <td style={{ padding: '1rem' }}>{r.padron_total}</td>
                                                    <td style={{ padding: '1rem' }}>{r.hombres}</td>
                                                    <td style={{ padding: '1rem' }}>{r.mujeres}</td>
                                                    <td style={{ padding: '1rem' }}>{((r.mujeres / (r.padron_total || 1)) * 100).toFixed(1)}% M</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'sistema' && (
                        <div className="flex-col gap-4">
                            <SecuritySettings />

                            {/* Panel de Despliegue Táctico OTA */}
                            <div className="tactile-card flex-col gap-4" style={{
                                background: 'linear-gradient(145deg, rgba(239, 68, 68, 0.05) 0%, rgba(0,0,0,0) 100%)',
                                border: '1px solid rgba(239, 68, 68, 0.2)'
                            }}>
                                <div className="flex-row-resp" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h2 style={{ margin: 0, color: '#ef4444', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <Activity size={24} /> COMANDO CENTRAL OTA (OVER-THE-AIR)
                                        </h2>
                                        <p style={{ color: '#94a3b8', fontSize: '0.85rem', margin: '0.5rem 0 0 0' }}>
                                            Lanza nuevas versiones de la aplicación web a todos los cuarteles de forma remota.
                                        </p>
                                    </div>
                                </div>

                                {otaMessage && (
                                    <div style={{ padding: '1rem', background: otaMessage.includes('❌') ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', borderRadius: '8px', borderLeft: `4px solid ${otaMessage.includes('❌') ? '#ef4444' : '#22c55e'}` }}>
                                        <p style={{ margin: 0, color: otaMessage.includes('❌') ? '#fca5a5' : '#86efac', fontSize: '0.9rem' }}>{otaMessage}</p>
                                    </div>
                                )}

                                <div className="responsive-grid" style={{ gridTemplateColumns: '1fr', gap: '1rem' }}>
                                    <div className="flex-col gap-2">
                                        <label style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 'bold' }}>NUEVA VERSIÓN (EJ. 1.0.2)</label>
                                        <input
                                            className="squishy-input"
                                            value={otaVersion}
                                            onChange={e => setOtaVersion(e.target.value)}
                                            placeholder="1.0.2"
                                            disabled={deployingOta}
                                        />
                                    </div>
                                    <div className="flex-col gap-2">
                                        <label style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 'bold' }}>NOTAS DEL PARCHE (QUÉ CAMBIÓ)</label>
                                        <textarea
                                            className="squishy-input"
                                            value={otaNotes}
                                            onChange={e => setOtaNotes(e.target.value)}
                                            rows={3}
                                            placeholder="Detalla las mejoras incluidas en esta actualización..."
                                            disabled={deployingOta}
                                        />
                                    </div>
                                    <button
                                        className="btn-danger"
                                        onClick={handleDeployOta}
                                        disabled={deployingOta || !otaVersion}
                                        style={{
                                            padding: '1rem',
                                            fontSize: '1rem',
                                            display: 'flex',
                                            justifyContent: 'center',
                                            gap: '0.5rem',
                                            opacity: deployingOta ? 0.7 : 1
                                        }}
                                    >
                                        <Upload size={20} className={deployingOta ? 'spin' : ''} />
                                        {deployingOta ? 'INICIANDO SECUENCIA LIBRACIÓN...' : 'LANZAR NUEVA ACTUALIZACIÓN A NODOS LOCALES'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </main>


            </div>
        </div >
    );
};
