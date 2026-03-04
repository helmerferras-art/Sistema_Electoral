import React, { useEffect, useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '../lib/AuthContext';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import booleanIntersects from '@turf/boolean-intersects';
import { point } from '@turf/helpers';
import { supabase } from '../lib/supabase';
import { getOfflineSupporters } from '../lib/indexedDB';
import { CHIAPAS_MUNICIPIOS } from '../lib/chiapas_municipios';
import { CHIAPAS_DISTRITOS_FEDERALES, CHIAPAS_DISTRITOS_LOCALES } from '../lib/chiapas_distritos';
import { Network } from 'lucide-react';

// Fix for default Leaflet marker icons in React
import L from 'leaflet';
// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

// Global declaration for our dirty debug flags
declare global {
    interface Window {
        hasLoggedFeatureProps?: boolean;
        hasLoggedMetrics?: boolean;
    }
}

const removeAccents = (str: string) => {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

const ID_TO_MUN_NAME: Record<string, string> = {};
Object.entries(CHIAPAS_MUNICIPIOS).forEach(([name, id]) => {
    ID_TO_MUN_NAME[id.toString()] = name;
});

// Global helper to create a consistent key: section_id
// Although we collect municipality, section IDs in Chiapas are unique statewide (INE standard).
// Using only section_id avoids mismatches between numeric IDs and string Names for municipalities.
const getCompKey = (_mun: string, sec: string) => {
    return isNaN(Number(sec)) ? sec : String(Number(sec));
};

// Helper component for Heatmap since react-leaflet doesn't have it natively
const HeatmapLayer = ({ points }: { points: [number, number, number][] }) => {
    const map = useMap();

    useEffect(() => {
        if (!points || points.length === 0) return;

        let heatLayer: any = null;
        let isMounted = true;

        // Dynamically import leaflet.heat to avoid SSR issues or missing types initially
        import('leaflet.heat' as any).then(() => {
            if (!isMounted || !(L as any).heatLayer) return;

            // Create heat layer with points [lat, lng, intensity]
            heatLayer = (L as any).heatLayer(points, {
                radius: 25,
                blur: 15,
                maxZoom: 17,
                gradient: {
                    0.2: 'blue',
                    0.4: 'cyan',
                    0.6: 'lime',
                    0.8: 'yellow',
                    1.0: 'red'
                }
            }).addTo(map);
        });

        return () => {
            isMounted = false;
            if (heatLayer) {
                map.removeLayer(heatLayer);
            }
        };
    }, [map, points]);

    return null;
};

// Helper Component to Auto-Fit the map to its active features
const AutoFitBounds = ({ geoJsonData, filterFn, centerFallback }: { geoJsonData: any, filterFn: any, centerFallback: [number, number] }) => {
    const map = useMap();
    const lastFittedData = useRef<any>(null);

    useEffect(() => {
        // Prevent re-fitting if data hasn't changed (avoids "stealing" focus on standard UI updates)
        if (lastFittedData.current === geoJsonData) return;

        if (!geoJsonData || !geoJsonData.features) {
            map.flyTo(centerFallback, 12);
            return;
        }

        try {
            const filteredFeatures = geoJsonData.features.filter(filterFn);
            if (filteredFeatures.length === 0) return;

            const tempLayer = L.geoJSON(filteredFeatures);
            const bounds = tempLayer.getBounds();

            if (bounds.isValid()) {
                lastFittedData.current = geoJsonData;
                map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 16, duration: 1.5 });
            }
        } catch (e) {
            console.error("AutoFitBounds Error:", e);
        }
    }, [geoJsonData, map, centerFallback]); // intentionally left filterFn out to prevent loops on state change

    return null;
};

// Helper to get a stable unique ID for a polygon based on its layer type
const getFeatureId = (properties: any, layerType: string) => {
    if (!properties) return null;
    const keys = Object.keys(properties);

    // Priority heuristics based on INEGI standards
    let bestKey;
    const type = layerType?.toLowerCase();
    if (type === 'seccion') {
        bestKey = keys.find(k => k.toLowerCase() === 'seccion' || k.toLowerCase() === 'sec');
    } else if (type === 'municipio') {
        bestKey = keys.find(k => k.toLowerCase() === 'municipio' || k.toLowerCase() === 'cve_mun');
    } else if (type === 'distrito_federal') {
        bestKey = keys.find(k => k.toLowerCase() === 'distrito_f' || k.toLowerCase() === 'distrito' || k.toLowerCase().includes('fed'));
    } else if (type === 'distrito_local') {
        bestKey = keys.find(k => k.toLowerCase() === 'distrito_l' || k.toLowerCase() === 'distrito' || k.toLowerCase().includes('loc'));
    } else {
        // fallback: first non-geometry property that describes an ID or Name
        bestKey = keys.find(k => ['nombre', 'nom', 'id', 'cve', 'distrito'].some(t => k.toLowerCase().includes(t))) || keys[0];
    }

    return bestKey ? String(properties[bestKey]) : null;
};

export const MapView = () => {
    const { user } = useAuth();
    const [supporters, setSupporters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [rawGeoJson, setRawGeoJson] = useState<any>(null);
    const [availableLayers, setAvailableLayers] = useState<any[]>([]);
    const [activeLayerId, setActiveLayerId] = useState<string>('');
    const [viewMode, setViewMode] = useState<'niebla' | 'heatmap' | 'markers'>('niebla');
    const [selectedRegion, setSelectedRegion] = useState<any>(null);

    const [seccionGeoJson, setSeccionGeoJson] = useState<any>(null);
    const [dataUpdateTick, setDataUpdateTick] = useState(0);

    const [historicalTargets, setHistoricalTargets] = useState<Record<string, any>>({});
    const [tenantScope, setTenantScope] = useState<string>('');
    const [tenantConfig, setTenantConfig] = useState<any>(null);
    const [pollMode, setPollMode] = useState<{ pollId: string, title: string } | null>(null);
    const [pointsScope, setPointsScope] = useState<string | null>(null);
    const [markerSupporters, setMarkerSupporters] = useState<any[]>([]);
    const [markerStaff, setMarkerStaff] = useState<any[]>([]);
    const [selectedMun, setSelectedMun] = useState('');
    const [selectedSec, setSelectedSec] = useState('');
    const [availableSecs, setAvailableSecs] = useState<string[]>([]);

    // Spatial Pre-calculation Engine (Optimized with Grid Indexing)
    const processedGeoJson = React.useMemo(() => {
        if (!rawGeoJson) {
            return rawGeoJson;
        }

        if (window.console && (window.console as any).time && !(window as any)._radarTimerActive) {
            console.time("RadarOptimization");
            (window as any)._radarTimerActive = true;
        }
        // Deep clone so we don't mutate the raw state
        const processed = JSON.parse(JSON.stringify(rawGeoJson));

        const currentLayer = availableLayers.find(l => l.id === activeLayerId);
        const layerType = currentLayer?.layer_type?.toLowerCase() || 'seccion';

        // 1. Create a spatial grid index for supporters to avoid O(N*M) lookup
        // We'll use a simple 0.1 degree grid
        const grid: Record<string, any[]> = {};

        // 1.5 Pre-calculate section bounds if doing spatial intersections
        const sectionBounds: Array<{ feature: any, bounds: L.LatLngBounds, metricsKey: string }> = [];
        if ((layerType === 'colonia' || layerType === 'localidad') && seccionGeoJson) {
            seccionGeoJson.features.forEach((sf: any) => {
                const spropsKeys = Object.keys(sf.properties || {});
                const secK = spropsKeys.find(k => k.toLowerCase() === 'seccion' || k.toLowerCase() === 'sec');
                if (secK) {
                    const secId = String(sf.properties?.[secK]);
                    const fg = L.geoJSON(sf);
                    sectionBounds.push({ feature: sf, bounds: fg.getBounds(), metricsKey: secId });
                }
            });
        }

        supporters.forEach(s => {
            const gx = Math.floor(s.longitude * 10) / 10;
            const gy = Math.floor(s.latitude * 10) / 10;
            const gkey = `${gx}:${gy}`;
            if (!grid[gkey]) grid[gkey] = [];
            grid[gkey].push(s);
        });

        // 2. Iterate features and aggregate supporters using the grid
        processed.features.forEach((feature: any) => {
            if (!feature.geometry) return;

            // Simple point-in-polygon check for small datasets, but we'll optimize with grid
            let count = 0;
            let votersRaw = 0;
            let votersGoal = 0;

            const fid = getFeatureId(feature.properties, layerType);

            let dictKey = fid;
            if (fid) {
                if (layerType === 'municipio') {
                    const normalizedFid = isNaN(Number(fid)) ? removeAccents(String(fid).toLowerCase()) : fid;
                    dictKey = `muni:${normalizedFid}`;
                } else if (layerType === 'distrito_federal') {
                    dictKey = `dist_f:${fid}`;
                } else if (layerType === 'distrito_local') {
                    dictKey = `dist_l:${fid}`;
                } else if (layerType === 'estado') {
                    dictKey = `state:chiapas`;
                }
            }

            const h = dictKey ? historicalTargets[dictKey] : null;

            if (h) {
                votersRaw = h.actual_voted || 0;
                votersGoal = h.target || 0;
                // Inject metrics directly into properties for Leaflet to pick them up
                feature.properties._votersRaw = votersRaw;
                feature.properties._votersGoal = votersGoal;
                feature.properties._padronTotal = h.padron || 0;
                feature.properties._padronHombres = h.hombres || 0;
                feature.properties._padronMujeres = h.mujeres || 0;
                feature.properties._meta40 = h.meta_40 || 0;
                feature.properties._partyResults = h.party_results || {};
                feature.properties._edadRangos = h.edad_rangos || {};
            }

            // Optimization: Only check supporters in grid cells that intersect feature bounds
            try {
                const fg = L.geoJSON(feature);
                const bounds = fg.getBounds();
                const minGx = Math.floor(bounds.getWest() * 10) / 10;
                const maxGx = Math.floor(bounds.getEast() * 10) / 10;
                const minGy = Math.floor(bounds.getSouth() * 10) / 10;
                const maxGy = Math.floor(bounds.getNorth() * 10) / 10;

                for (let x = minGx; x <= maxGx; x = Number((x + 0.1).toFixed(1))) {
                    for (let y = minGy; y <= maxGy; y = Number((y + 0.1).toFixed(1))) {
                        const gkey = `${x}:${y}`;
                        const cellSupporters = grid[gkey];
                        if (cellSupporters) {
                            cellSupporters.forEach(s => {
                                const pt = point([s.longitude, s.latitude]);
                                if (booleanPointInPolygon(pt, feature)) {
                                    count++;
                                }
                            });
                        }
                    }
                }
            } catch (e) {
                // Fallback to simpler check if bounds fails
                supporters.forEach(s => {
                    const pt = point([s.longitude, s.latitude]);
                    if (booleanPointInPolygon(pt, feature)) count++;
                });
            }

            // 3. For Colony/Locality layers, perform a spatial intersection with the Section layer
            // to inherit historical targets.
            if ((layerType === 'colonia' || layerType === 'localidad') && sectionBounds.length > 0) {
                try {
                    const featureBounds = L.geoJSON(feature).getBounds();
                    const overlappingSections = sectionBounds.filter(sb => sb.bounds.intersects(featureBounds));

                    let inheritedVotersRaw = 0;
                    let inheritedVotersGoal = 0;
                    let inheritedPadronTotal = 0;
                    let inheritedPadronHombres = 0;
                    let inheritedPadronMujeres = 0;
                    let inheritedMeta40 = 0;

                    overlappingSections.forEach(sb => {
                        // Check if they actually intersect using turf for precision
                        if (booleanIntersects(feature, sb.feature)) {
                            const h = historicalTargets[sb.metricsKey];
                            if (h) {
                                inheritedVotersRaw += (h.actual_voted || 0);
                                inheritedVotersGoal += (h.target || 0);
                                inheritedPadronTotal += (h.padron || 0);
                                inheritedPadronHombres += (h.hombres || 0);
                                inheritedPadronMujeres += (h.mujeres || 0);
                                inheritedMeta40 += (h.meta_40 || 0);
                            }
                        }
                    });

                    feature.properties._votersRaw = inheritedVotersRaw;
                    feature.properties._votersGoal = inheritedVotersGoal;
                    feature.properties._padronTotal = inheritedPadronTotal;
                    feature.properties._padronHombres = inheritedPadronHombres;
                    feature.properties._padronMujeres = inheritedPadronMujeres;
                    feature.properties._meta40 = inheritedMeta40;

                } catch (e) { console.error("Spatial intersection error:", e); }
            }

            feature.properties._convincedCount = count;
        });

        if (window.console && (window.console as any).timeEnd && (window as any)._radarTimerActive) {
            console.timeEnd("RadarOptimization");
            (window as any)._radarTimerActive = false;
        }

        return processed;
    }, [rawGeoJson, supporters, historicalTargets, activeLayerId, availableLayers, seccionGeoJson, dataUpdateTick]);

    useEffect(() => {
        const pm = localStorage.getItem('radar_poll_mode');
        if (pm) setPollMode(JSON.parse(pm));
    }, []);

    useEffect(() => {
        // Auto-populate availableSecs for Municipal Presidents since they won't select a municipality
        if (processedGeoJson && tenantConfig) {
            const roleType = tenantConfig.position?.toLowerCase() || '';
            if (roleType.includes('presidente') || roleType.includes('presidencia_municipal')) {
                const secs = Array.from(new Set(processedGeoJson.features
                    .map((f: any) => String(f.properties?.seccion || f.properties?.sec || ''))
                )).filter(Boolean).sort((a: any, b: any) => parseInt(a) - parseInt(b)) as string[];
                setAvailableSecs(secs);
            }
        }
    }, [processedGeoJson, tenantConfig]);

    useEffect(() => {
        if (user?.tenant_id || user?.role === 'superadmin') {
            loadTenantMapScope();

            // REAL-TIME SUBSCRIPTION FOR RADAR
            const channel = supabase
                .channel('radar-supporters')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'supporters',
                    filter: user.tenant_id ? `tenant_id=eq.${user.tenant_id}` : undefined
                }, () => {
                    loadSupportersData();
                })
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [user]);

    useEffect(() => {
        if (viewMode !== 'markers') {
            loadSupportersData();
        } else if (!pointsScope) {
            setMarkerSupporters([]);
        }
    }, [user, pollMode, viewMode]);

    useEffect(() => {
        if (viewMode === 'markers' && pointsScope) {
            loadMarkersForZone(pointsScope);
        }
    }, [pointsScope, viewMode]);

    const [sidebarTab, setSidebarTab] = useState<'info' | 'coalition' | 'list'>('info');

    // Handle tactical focus from top-bar dropdown
    useEffect(() => {
        const handleFocus = (e: any) => {
            const feature = e.detail;
            if (!feature) return;

            const currentLayerType = availableLayers.find(l => l.id === activeLayerId)?.layer_type;
            const fid = getFeatureId(feature.properties, currentLayerType || 'seccion');

            // 1. Open Sidebar
            const count = feature.properties?._convincedCount || 0;
            setSelectedRegion({
                name: fid ? `#${fid}` : 'Zona Seleccionada',
                count,
                supportersList: supporters.filter(s => {
                    if (!s.latitude || !s.longitude || !feature.geometry) return false;
                    try {
                        const pt = point([s.longitude, s.latitude]);
                        return booleanPointInPolygon(pt, feature as any);
                    } catch { return false; }
                }),
                properties: feature.properties,
                type: currentLayerType || 'seccion'
            });

            // 2. Set scope for markers if in points mode
            if (viewMode === 'markers' && fid) {
                setPointsScope(fid);
            }
        };

        window.addEventListener('radar-focus-section' as any, handleFocus);
        return () => window.removeEventListener('radar-focus-section' as any, handleFocus);
    }, [processedGeoJson, availableLayers, activeLayerId, viewMode, supporters]);

    const loadTenantMapScope = async () => {
        try {
            // 1. Get Tenant Geographic Scope and Role
            let tenant = null;
            if (user?.tenant_id) {
                const { data } = await supabase
                    .from('tenants')
                    .select('geographic_scope, position, election_type')
                    .eq('id', user.tenant_id)
                    .single();
                tenant = data;
            } else if (user?.role === 'superadmin') {
                tenant = { geographic_scope: '', position: 'superadmin', election_type: 'statewide' };
            }

            if (tenant) {
                setTenantScope(tenant.geographic_scope || '');
                setTenantConfig(tenant);
            }

            // 2. Look for an uploaded master GeoJSON layer
            const { data: layers } = await supabase
                .from('global_map_layers')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (layers && layers.length > 0) {
                let filteredLayers = layers;
                const position = tenant?.position?.toLowerCase() || '';
                const electionType = tenant?.election_type?.toLowerCase() || '';
                const assigned = user?.assigned_territory;

                if (assigned && assigned.layer_type && assigned.zone_ids?.length > 0) {
                    const targetL = assigned.layer_type.toLowerCase();
                    filteredLayers = layers.filter((l: any) => l.layer_type.toLowerCase() === targetL);
                }
                else if (user?.role !== 'superadmin') {
                    if (position.includes('presidente municipal') || position.includes('presidencia_municipal')) {
                        const allowedTypes = ['municipio', 'seccion', 'colonia', 'localidad'];
                        filteredLayers = layers.filter((l: any) => allowedTypes.includes(l.layer_type.toLowerCase()));
                    } else if (position.includes('diputado') || position.includes('diputacion')) {
                        const allowedTypes = ['municipio', 'seccion', 'colonia', 'localidad'];
                        if (electionType === 'federal') allowedTypes.push('distrito_federal');
                        if (electionType === 'local') allowedTypes.push('distrito_local');
                        filteredLayers = layers.filter((l: any) => allowedTypes.includes(l.layer_type.toLowerCase()));
                    }
                }

                setAvailableLayers(filteredLayers);
                const defaultLayer = filteredLayers.find((l: any) => l.layer_type === 'seccion') || filteredLayers[0];
                if (defaultLayer) {
                    setActiveLayerId(defaultLayer.id);
                    loadGeoJsonFromServer(defaultLayer.geojson_url, defaultLayer.layer_name);
                }

                // Cache SECCION layer for spatial intersections (Colonies need to know what sections they overlap)
                const seccionLayer = layers.find((l: any) => l.layer_type === 'seccion');
                if (seccionLayer && seccionLayer.geojson_url) {
                    try {
                        const response = await fetch(seccionLayer.geojson_url);
                        if (response.ok) {
                            const data = await response.json();
                            setSeccionGeoJson(data);
                        } else {
                            console.error("Failed to fetch SECCION layer from url:", response.statusText);
                        }
                    } catch (e) {
                        console.error("Failed to cache SECCION layer", e);
                    }
                }

                // Priorizar los resultados de la misma elección del candidato.
                // Si la campaña es Ayuntamiento, traemos los resultados de ayuntamiento.
                // La meta y el historial base para todos (Gobernador, Diputados, Presidentes)
                // siempre será el resultado de la elección de Gobernador 2024.

                // RESOLVE TARGET MUNICIPALITIES
                let validMunicipalities: string[] = [];
                const roleType = tenant?.position?.toLowerCase() || '';
                const geoScope = tenant?.geographic_scope || '';

                if (roleType.includes('presidente municipal') || roleType.includes('presidencia_municipal')) {
                    if (geoScope) {
                        const mNorm = geoScope.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                        const mId = (CHIAPAS_MUNICIPIOS as any)[mNorm];
                        if (mId) validMunicipalities = [mId.toString()];
                    }
                } else if (roleType.includes('diputado') || roleType.includes('diputacion')) {
                    if (geoScope) {
                        const dNum = geoScope.replace(/\D/g, '');
                        if (dNum) {
                            const isLocal = tenant?.election_type?.toLowerCase() === 'local';
                            const mapObj = isLocal ? CHIAPAS_DISTRITOS_LOCALES : CHIAPAS_DISTRITOS_FEDERALES;
                            const distMunIds = (mapObj as any)[dNum];
                            if (distMunIds && distMunIds.length > 0) {
                                validMunicipalities = distMunIds.map((id: number) => id.toString());
                            }
                        }
                    }
                }

                let targetData: any[] = [];
                let t_start = 0;
                let t_limit = 1000;
                while (true) {
                    let query = supabase.from('historical_election_results')
                        .select('id, section_id, municipality, target_votes_calculated, nominal_list_size, padron_total, padron_hombres, padron_mujeres, total_votes, candidate_names, party_results, padron_edad_rangos')
                        .eq('election_year', 2024)
                        .eq('election_type', 'gubernatura');

                    if (validMunicipalities.length > 0) {
                        query = query.in('municipality', validMunicipalities);
                    }

                    const { data, error } = await query
                        .order('id', { ascending: true })
                        .range(t_start, t_start + t_limit - 1);

                    if (error) {
                        console.error("[RADAR-TRACE] Error fetching history chunk:", error);
                        break;
                    }
                    if (data && data.length > 0) {
                        targetData = [...targetData, ...data];
                    } else {
                        break;
                    }
                    t_start += t_limit;
                }
                console.log(`[RADAR-TRACE] 🗳️ GUBERNATURA 2024: ${targetData.length} registros recuperados.`);



                let demographicData: any[] = [];
                let d_start = 0;
                let d_limit = 1000;
                while (true) {
                    // Create a fresh query in each iteration to avoid re-using an exhausted query builder
                    let pQuery = supabase.from('padron_electoral')
                        .select('id, section_id, municipality, padron_total, hombres, mujeres, edad_rangos')
                        .eq('year', 2024);

                    if (validMunicipalities.length > 0) {
                        pQuery = pQuery.in('municipality', validMunicipalities);
                    }

                    const { data: chunk, error } = await pQuery
                        .order('id', { ascending: true })
                        .range(d_start, d_start + d_limit - 1);

                    if (error) {
                        console.error("[RADAR-TRACE] Error fetching padron chunk:", error);
                        break;
                    }
                    if (chunk && chunk.length > 0) {
                        demographicData = [...demographicData, ...chunk];
                    } else {
                        break;
                    }
                    d_start += d_limit;
                }
                console.log(`[RADAR-TRACE] 👥 PADRON 2024: ${demographicData.length} registros recuperados.`);


                console.log(`Radar: Construyendo consolidación de ${targetData.length} registros históricos y ${demographicData.length} sociodemográficos.`);

                const dict: Record<string, any> = {};
                const createEmpty = () => ({ target: 0, padron: 0, hombres: 0, mujeres: 0, actual_voted: 0, meta_40: 0, edad_rangos: {} });

                // 1. First Pass: Consolidate everything EXACTLY at the Sectional Layer (secKey).
                // This is critical because a single section can have multiple casillas (rows).
                // Votes are additive across casillas. Padron is NOT additive (it's the same total for the whole section repeated).
                const seccionalData: Record<string, any> = {};

                const getOrCreateSec = (secKey: string) => {
                    if (!seccionalData[secKey]) {
                        seccionalData[secKey] = {
                            municipality: '',
                            target: 0,
                            actual_voted: 0,
                            padron: 0,
                            hombres: 0,
                            mujeres: 0,
                            meta_40: 0,
                            edad_rangos: {}
                            // Padron fields will be overwritten, not added, to avoid multiplier bug
                        };
                    }
                    return seccionalData[secKey];
                };

                targetData.forEach(row => {
                    let rowMun = String(row.municipality || '').trim();
                    if (/^\d+$/.test(rowMun) && ID_TO_MUN_NAME[rowMun]) {
                        rowMun = ID_TO_MUN_NAME[rowMun];
                    }

                    const secKey = getCompKey(rowMun, row.section_id);
                    const sec = getOrCreateSec(secKey);
                    sec.municipality = rowMun;

                    let ramirezVotes = 0;
                    if (row.candidate_names && row.party_results) {
                        Object.entries(row.candidate_names).forEach(([party, name]) => {
                            if (String(name).includes('RAMIREZ')) ramirezVotes += (row.party_results[party] || 0);
                        });
                    }
                    if (ramirezVotes === 0) ramirezVotes = row.target_votes_calculated || 0;

                    // Additive for Casillas within same section
                    sec.target += ramirezVotes;
                    sec.actual_voted += (row.total_votes || 0);
                    sec.meta_40 += ramirezVotes;

                    // Padron: take largest observed (handles multiple rows having the sectional total)
                    const pFound = (row.padron_total || row.nominal_list_size || 0);
                    if (pFound > sec.padron) {
                        sec.padron = pFound;
                        sec.hombres = (row.padron_hombres || 0);
                        sec.mujeres = (row.padron_mujeres || 0);
                    }
                });

                demographicData.forEach(row => {
                    let rowMun = String(row.municipality || '').trim();
                    if (/^\d+$/.test(rowMun) && ID_TO_MUN_NAME[rowMun]) {
                        rowMun = ID_TO_MUN_NAME[rowMun];
                    }

                    const secKey = getCompKey(rowMun, row.section_id);
                    const sec = getOrCreateSec(secKey);
                    sec.municipality = rowMun;

                    // Padron 2024 overrides history padron entirely if exists
                    const pFound = (row.padron_total || row.nominal_list_size || 0);
                    if (pFound > 0) {
                        sec.padron = pFound;
                        sec.hombres = (row.hombres || row.padron_hombres || 0);
                        sec.mujeres = (row.mujeres || row.padron_mujeres || 0);
                    }

                    if (row.edad_rangos) {
                        // Since we don't have casilla-level demographic breakdowns usually, 
                        // we just take the first row's demographic ranges for the section.
                        if (Object.keys(sec.edad_rangos).length === 0) {
                            sec.edad_rangos = { ...row.edad_rangos };
                        }
                    }
                });

                // 2. Second Pass: Distribute the CLEAN Sectional Totals to Municipality, District, and State levels
                const muniToFed: Record<number, string> = {};
                Object.entries(CHIAPAS_DISTRITOS_FEDERALES).forEach(([d, ms]) => ms.forEach(m => muniToFed[m] = d));
                const muniToLoc: Record<number, string> = {};
                Object.entries(CHIAPAS_DISTRITOS_LOCALES).forEach(([d, ms]) => ms.forEach(m => muniToLoc[m] = d));

                const pushToDict = (key: string, data: any) => {
                    if (!dict[key]) dict[key] = createEmpty();
                    dict[key].target += data.target;
                    dict[key].actual_voted += data.actual_voted;
                    dict[key].meta_40 += data.meta_40;
                    dict[key].padron += data.padron;
                    dict[key].hombres += data.hombres;
                    dict[key].mujeres += data.mujeres;

                    Object.entries(data.edad_rangos).forEach(([k, v]) => {
                        dict[key].edad_rangos[k] = (dict[key].edad_rangos[k] || 0) + (Number(v) || 0);
                    });
                };

                Object.entries(seccionalData).forEach(([secKey, pureData]) => {
                    // Push to Section Layer
                    pushToDict(secKey, pureData);

                    // Push to Municipality Layer
                    const mNorm = removeAccents(pureData.municipality.toLowerCase());
                    pushToDict(`muni:${mNorm}`, pureData);

                    // Push to Districts Layer
                    let mId: number | undefined;
                    if (!isNaN(Number(mNorm)) && ID_TO_MUN_NAME[mNorm]) {
                        mId = Number(mNorm);
                    } else {
                        mId = (CHIAPAS_MUNICIPIOS as any)[mNorm];
                    }

                    if (mId) {
                        pushToDict(`muni:${mId}`, pureData); // Duplicate association for ID-based GEOJSONs
                        if (muniToFed[mId]) pushToDict(`dist_f:${muniToFed[mId]}`, pureData);
                        if (muniToLoc[mId]) pushToDict(`dist_l:${muniToLoc[mId]}`, pureData);
                    }

                    // Push to State Layer
                    pushToDict('state:chiapas', pureData);
                });

                setHistoricalTargets(dict);
                setDataUpdateTick(prev => prev + 1);
                console.log(`[RADAR-TRACE] 🛰️ Radar sincronizado. Secciones vinculadas: ${Object.keys(dict).length}. Tick: ${dataUpdateTick + 1}`);
            }
        } catch (error) {
            console.error("Error loading geographic scope:", error);
        }
    };


    const loadGeoJsonFromServer = async (url: string, layerName: string) => {
        try {
            setRawGeoJson(null);
            const response = await fetch(url);
            if (response.ok) {
                const jsonData = await response.json();

                // Sometimes QGIS or INEGI exports nest the features inside another object or just wrap it in an array
                let actualGeoJson = jsonData;
                if (!jsonData.features && jsonData.FeatureCollection?.features) {
                    actualGeoJson = jsonData.FeatureCollection;
                } else if (!jsonData.features && Object.keys(jsonData).length > 0) {
                    console.warn("Radar: El JSON descargado no tiene 'features' en la raíz. Estructura:", Object.keys(jsonData));
                    // Intento de encontrar la llave correcta si tiene otro nombre
                    const possibleFeatureKey = Object.keys(jsonData).find(k => Array.isArray(jsonData[k]));
                    if (possibleFeatureKey) {
                        const arr = jsonData[possibleFeatureKey];
                        // Ensure elements are valid GeoJSON Features
                        const formattedFeatures = arr.map((item: any) => {
                            if (item.type === 'Feature') return item;
                            // Otherwise, assume it's a raw geometry
                            return {
                                type: 'Feature',
                                geometry: item,
                                properties: {} // No properties available in this format
                            };
                        });
                        actualGeoJson = { type: 'FeatureCollection', features: formattedFeatures };
                    }
                }

                console.log(`Radar: Capa base '${layerName}' analizada. Polígonos: ${actualGeoJson.features?.length || 0}`);
                if (actualGeoJson.features && actualGeoJson.features.length > 0) {
                    const sampleFeature = actualGeoJson.features[0];
                    console.log("Radar Debug - Estructura del PRIMER elemento en features:", sampleFeature);
                    const firstGeom = actualGeoJson.features[0].geometry;
                    let firstCoord;
                    if (firstGeom) {
                        if (firstGeom.type === 'Point') {
                            firstCoord = firstGeom.coordinates;
                        } else if (firstGeom.type === 'Polygon') {
                            firstCoord = firstGeom.coordinates[0]?.[0];
                        } else if (firstGeom.type === 'MultiPolygon') {
                            firstCoord = firstGeom.coordinates[0]?.[0]?.[0];
                        } else if (firstGeom.type === 'LineString') {
                            firstCoord = firstGeom.coordinates[0];
                        }
                    }
                    console.log("Radar Debug - Primera coordenada de muestra:", firstCoord || "No coordinates found");
                }
                setRawGeoJson(actualGeoJson);
            } else {
                console.error("Radar: Error al descargar el GeoJSON desde Storage:", response.statusText);
            }
        } catch (error) {
            console.error("Error fetching map layer:", error);
        }
    };

    const loadMarkersForZone = async (zoneId: string) => {
        setLoading(true);
        try {
            // 1. Fetch Hierarchy IDs (Pyramidal aggregation)
            let teamIds: string[] = user ? [user.id] : [];

            if (user && !['superadmin', 'candidato', 'coordinador_campana'].includes(user.role)) {
                // Get all subordinates (recursive)
                const { data: teamFetch } = await supabase.rpc('get_team_ids', { root_user_id: user.id });
                if (teamFetch) teamIds = teamFetch;
            }

            // 2. Fetch STAFF (Users) in the zone
            let staffQuery = supabase
                .from('users')
                .select('id, name, phone, role, xp, rank_name, assigned_targets, latitude, longitude')
                .in('tenant_id', user?.tenantScope || [])
                .not('latitude', 'is', null);

            if (!['superadmin', 'candidato', 'coordinador_campana'].includes(user?.role || '')) {
                // Only see my team staff
                staffQuery = staffQuery.in('id', teamIds);
            }

            const { data: staffData } = await staffQuery;
            setMarkerStaff(staffData || []);

            // 3. Fetch SUPPORTERS (Convencidos + Volunteers) via Secure RPC
            let { data: supportersData, error: supErr } = await supabase.rpc('fn_get_map_supporters');

            if (supportersData) {
                // Client-side filtering for specific section since RPC returns all scoped supporters
                let filtered = supportersData.filter((s: any) => s.section_id === zoneId);

                // Hierarchical Visibility Filter for lower ranks
                if (!['superadmin', 'candidato', 'coordinador_campana'].includes(user?.role || '')) {
                    // Lower ranks only see their own recruits (we assume recruiter_id matches for simplicity or it's allied)
                    // (Assuming RPC returns safe generic data, we just show them)
                }

                setMarkerSupporters(filtered);
            } else {
                if (supErr) console.error("Error fetching secure supporters:", supErr);
                setMarkerSupporters([]);
            }
        } catch (error) {
            console.error('Error loading markers:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadSupportersData = async () => {
        setLoading(true);
        try {
            if (pollMode) {
                // LOAD POLL RESPONSES
                const { data } = await supabase
                    .from('poll_responses')
                    .select('id, lat, lng, poll_options(option_text), users(name)')
                    .eq('poll_id', pollMode.pollId)
                    .not('lat', 'is', null)
                    .not('lng', 'is', null);

                const formatted = (data || []).map((r: any) => ({
                    id: r.id,
                    latitude: r.lat,
                    longitude: r.lng,
                    commitment_level: 5,
                    name: r.users?.name || 'Operador',
                    option_text: r.poll_options?.option_text || ''
                }));
                setSupporters(formatted);
                return;
            }

            // Normal Supporters Load via Secure RPC
            const { data: onlineData } = await supabase.rpc('fn_get_map_supporters');

            let allData = onlineData || [];

            // Load offline data to show them on map even before sync
            const offlineData = await getOfflineSupporters();
            const offlineWithCoords = offlineData.filter((s: any) => s.latitude && s.longitude);

            // Tag them to distinguish visually if needed
            const offlineTagged = offlineWithCoords.map((s: any) => ({ ...s, isOffline: true }));

            setSupporters([...allData, ...offlineTagged]);
        } catch (error) {
            console.error('Error loading map data:', error);
        } finally {
            setLoading(false);
        }
    };

    // Prepare heatmap data: [lat, lng, intensity (based on commitment)]
    const heatPoints = supporters.map(s => [
        s.latitude,
        s.longitude,
        (s.commitment_level || 1) * 0.2 // Max intensity 1.0 for 5 stars
    ] as [number, number, number]);



    // GeoJSON Feature Filter Function based on Tenant Scope
    const geoJsonFilter = (feature: any) => {
        // If superadmin or no scope, show everything
        if (user?.role === 'superadmin' || !tenantScope) return true;

        if (!feature || !feature.properties || Object.keys(feature.properties).length === 0) {
            return true;
        }

        const normalizedSearch = removeAccents(tenantScope.toLowerCase());
        const props = feature.properties;
        const position = tenantConfig?.position?.toLowerCase() || '';
        const electionType = tenantConfig?.election_type?.toLowerCase() || '';

        // 0. Strict Tactical Assignment Override
        const assigned = user?.assigned_territory;
        if (assigned && assigned.zone_ids && assigned.zone_ids.length > 0) {
            const currentLayer = availableLayers.find(l => l.id === activeLayerId);
            if (currentLayer && currentLayer.layer_type.toLowerCase() === assigned.layer_type.toLowerCase()) {
                const keys = Object.keys(props);
                let bestKey;
                const type = assigned.layer_type.toLowerCase();
                if (type === 'seccion') {
                    bestKey = keys.find(k => k.toLowerCase() === 'seccion' || k.toLowerCase() === 'sec');
                } else if (type === 'municipio') {
                    bestKey = keys.find(k => k.toLowerCase() === 'municipio' || k.toLowerCase() === 'cve_mun');
                } else {
                    bestKey = keys.find(k => ['nombre', 'nom', 'id', 'cve'].some(t => k.toLowerCase().includes(t))) || keys[0];
                }

                if (bestKey) {
                    const featureId = String(props[bestKey]);
                    if (!assigned.zone_ids.includes(featureId)) {
                        return false; // STRICT DENIAL
                    } else {
                        return true; // Explicitly allowed
                    }
                }
            }
        }

        // 1. Gubernamental / Senado: Show entire state
        if (position === 'gobernador' || position === 'senador' || position === 'gobernatura' || position === 'senaduria') {
            return true;
        }

        // --- District Level Filtering Math --- 
        // Identify if the feature has a municipality property
        const munKey = Object.keys(props).find(k =>
            ['municipio', 'cve_mun', 'mun'].includes(k.toLowerCase())
        );
        const featureMunId = munKey ? parseInt(props[munKey], 10) : null;

        if (!window.hasLoggedFeatureProps && featureMunId) {
            console.log(`Radar Filter Auth: Resolving for ${position}. Scope: '${normalizedSearch}'. Target Mun ID:`, (CHIAPAS_MUNICIPIOS as any)[normalizedSearch]);
            window.hasLoggedFeatureProps = true;
        }

        // 2. Diputados (Federal / Local): Filter by multiple municipalities
        if (position.includes('diputado') || position.includes('diputacion')) {
            // Extract district number from string (e.g., "Distrito 13" -> 13)
            const match = normalizedSearch.match(/\d+/);
            const districtNumber = match ? match[0] : null;

            if (districtNumber) {
                // If it's a District layer, filter exactly by district ID
                if (electionType === 'federal' && Object.keys(props).find(k => k.toLowerCase() === 'distrito_f')) {
                    const dfKey = Object.keys(props).find(k => k.toLowerCase() === 'distrito_f');
                    return parseInt(props[dfKey!], 10) === parseInt(districtNumber, 10);
                }
                if (electionType === 'local' && Object.keys(props).find(k => k.toLowerCase() === 'distrito_l')) {
                    const dlKey = Object.keys(props).find(k => k.toLowerCase() === 'distrito_l');
                    return parseInt(props[dlKey!], 10) === parseInt(districtNumber, 10);
                }

                // If it's a sub-layer (Municipio, Colonia, Localidad), check if its municipality is inside this district
                const districtMap = electionType === 'federal' ? CHIAPAS_DISTRITOS_FEDERALES : CHIAPAS_DISTRITOS_LOCALES;
                const validMunicipalities = (districtMap as any)[districtNumber] || [];

                if (featureMunId) {
                    return validMunicipalities.includes(featureMunId);
                }
            }
        }

        // 3. Presidente Municipal: Filter by single municipality
        if (position.includes('presidente municipal') || position.includes('presidencia_municipal')) {
            const targetMunId = (CHIAPAS_MUNICIPIOS as any)[normalizedSearch];
            if (targetMunId && featureMunId) {
                return featureMunId === targetMunId;
            }
            // If the layer specifically HAS a municipality ID, and we are a Presidente Municipal, BUT it didn't match: 
            // We MUST return false early. Otherwise it falls through to the string matching which allows random other features.
            if (featureMunId) {
                return false;
            }
        }

        // 4. Strict Fallback: For any feature that completely lacks ID columns, do string matching
        const propsString = removeAccents(JSON.stringify(feature.properties).toLowerCase());
        return propsString.includes(normalizedSearch);
    };

    // Fog of War / Tactical Threshold Logic
    const getFogStyle = (feature: any) => {
        if (!feature || !feature.geometry || (feature.geometry.type !== 'Polygon' && feature.geometry.type !== 'MultiPolygon' && feature.geometry.type !== 'Point')) {
            return { fillColor: '#00D4FF', weight: 1.5, opacity: 1, color: '#00D4FF', fillOpacity: 0.1 };
        }

        const convincedCount = feature.properties?._convincedCount || 0;
        const target40 = feature.properties?._meta40;

        if (target40) {
            const percent = (convincedCount / target40) * 100;
            if (percent >= 100) return { fillColor: '#10B981', weight: 2, opacity: 1, color: '#10B981', fillOpacity: 0.5 }; // Won (Green)
            if (percent >= 50) return { fillColor: '#F59E0B', weight: 2, opacity: 1, color: '#F59E0B', fillOpacity: 0.4 }; // Contested (Orange)
            if (convincedCount > 0) return { fillColor: '#EF4444', weight: 2, opacity: 1, color: '#EF4444', fillOpacity: 0.3 }; // Losing (Red)
        }

        if (convincedCount > 0) {
            // General Conquered Zone (No Target Data)
            return { fillColor: '#FF3366', weight: 2, opacity: 1, color: '#FF3366', fillOpacity: 0.4 };
        }

        // Fog of War (Dark/Unknown)
        return { fillColor: '#00D4FF', weight: 1.5, opacity: 1, color: '#00D4FF', fillOpacity: 0.1 };
    };

    // Outline-only style for context in Heatmap and Marker modes
    const getOutlineStyle = (_feature: any) => {
        return { fillColor: 'transparent', weight: 1, opacity: 0.4, color: '#00D4FF', fillOpacity: 0 };
    };

    return (
        <div className="tactile-card flex-col gap-1" style={{ padding: '1rem', height: 'clamp(500px, 80vh, 800px)', border: '1px solid rgba(0, 212, 255, 0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h2 style={{ fontFamily: 'Oswald, sans-serif', color: 'var(--text-color)', margin: 0, fontSize: '1.4rem' }}>
                    <span style={{ color: 'var(--tertiary)' }}>//</span> {pollMode ? `MAPA DE CALOR: ENCUESTA` : 'RADAR ESTRATÉGICO'}
                    <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10B981', marginLeft: '10px', boxShadow: '0 0 5px #10B981', verticalAlign: 'middle' }}></span>
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    {/* Tactical Filter Bar */}
                    <div style={{ display: 'flex', gap: '0.5rem', marginRight: '1rem', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '1rem' }}>
                        {!(tenantConfig?.position?.toLowerCase().includes('presidente') || tenantConfig?.position?.toLowerCase().includes('presidencia_municipal')) && (
                            <select
                                className="squishy-input mini"
                                style={{ width: '150px', backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(0, 212, 255, 0.3)' }}
                                value={selectedMun}
                                onChange={(e) => {
                                    const mun = e.target.value;
                                    setSelectedMun(mun);
                                    if (processedGeoJson) {
                                        const secs = Array.from(new Set(processedGeoJson.features
                                            .filter((f: any) => removeAccents(String(f.properties?.municipio || '')) === removeAccents(mun))
                                            .map((f: any) => String(f.properties?.seccion || f.properties?.sec || ''))
                                        )).filter(Boolean).sort((a: any, b: any) => parseInt(a) - parseInt(b)) as string[];
                                        setAvailableSecs(secs);
                                    }
                                    setSelectedSec('');
                                }}
                            >
                                <option value="">MUNICIPIO...</option>
                                {processedGeoJson && Array.from(new Set(processedGeoJson.features.map((f: any) => f.properties?.municipio))).filter(Boolean).sort().map((m: any) => (
                                    <option key={m} value={m}>{m}</option>
                                ))}
                            </select>
                        )}
                        <select
                            className="squishy-input mini"
                            style={{ width: '100px', backgroundColor: 'rgba(0,0,0,0.3)', color: 'white', border: '1px solid rgba(0, 212, 255, 0.3)' }}
                            value={selectedSec}
                            onChange={(e) => {
                                const sec = e.target.value;
                                setSelectedSec(sec);
                                if (sec && processedGeoJson) {
                                    const feature = processedGeoJson.features.find((f: any) => String(f.properties?.seccion || f.properties?.sec || '') === sec);
                                    if (feature) {
                                        // Trigger auto-focus and sidebar opening
                                        const event = new CustomEvent('radar-focus-section', { detail: feature });
                                        window.dispatchEvent(event);
                                    }
                                }
                            }}
                            disabled={!(tenantConfig?.position?.toLowerCase().includes('presidente') || tenantConfig?.position?.toLowerCase().includes('presidencia_municipal')) && !selectedMun}
                        >
                            <option value="">SECCIÓN...</option>
                            {availableSecs.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>

                    {pollMode && (
                        <button
                            className="squishy-btn secondary"
                            onClick={() => {
                                localStorage.removeItem('radar_poll_mode');
                                setPollMode(null);
                            }}
                            style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', color: '#EF4444' }}
                        >
                            CERRAR MODO ENCUESTA
                        </button>
                    )}
                    {availableLayers.length > 1 && (
                        <select
                            className="squishy-input"
                            style={{ padding: '0.3rem', fontSize: '0.8rem', backgroundColor: '#0F1218', color: 'var(--tertiary)', border: '1px solid var(--tertiary)', margin: 0 }}
                            value={activeLayerId}
                            onChange={(e) => {
                                const newId = e.target.value;
                                setActiveLayerId(newId);
                                const l = availableLayers.find(al => al.id === newId);
                                if (l) loadGeoJsonFromServer(l.geojson_url, l.layer_name);
                            }}
                        >
                            {availableLayers.map(l => (
                                <option key={l.id} value={l.id}>{l.layer_type.toUpperCase()}</option>
                            ))}
                        </select>
                    )}
                    <button
                        className={`squishy-btn ${viewMode === 'niebla' ? 'primary' : ''}`}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        onClick={() => setViewMode('niebla')}
                    >
                        🌫️ NIEBLA
                    </button>
                    <button
                        className={`squishy-btn ${viewMode === 'heatmap' ? 'primary' : ''}`}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        onClick={() => setViewMode('heatmap')}
                    >
                        🔥 CALOR
                    </button>
                    <button
                        className={`squishy-btn ${viewMode === 'markers' ? 'secondary' : ''}`}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                        onClick={() => setViewMode('markers')}
                    >
                        📍 PUNTOS
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex-center" style={{ flex: 1, height: '100%', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', background: 'rgba(0,0,0,0.5)' }}>
                    <h3 style={{ fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em', animation: 'pulse 1.5s infinite', color: 'var(--tertiary)' }}>&gt; SINCRONIZANDO SATÉLITE...</h3>
                </div>
            ) : (
                <div style={{ flex: 1, minHeight: '400px', borderRadius: '8px', overflow: 'hidden', border: '2px solid var(--tertiary)', boxShadow: '0 0 15px rgba(0, 212, 255, 0.2)', position: 'relative' }}>
                    <MapContainer
                        center={[16.7569, -93.1292]}
                        zoom={12}
                        style={{ height: '100%', width: '100%', backgroundColor: '#0F1218' }}
                    >
                        {/* Using Carto Dark Matter base map for tactical feel */}
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                        />

                        {/* Auto-focus camera on filtered geometry */}
                        <AutoFitBounds
                            geoJsonData={processedGeoJson}
                            filterFn={geoJsonFilter}
                            centerFallback={[16.7569, -93.1292]}
                        />

                        {processedGeoJson && (
                            <GeoJSON
                                key={`radar-layer-${activeLayerId}-${dataUpdateTick}`}
                                data={processedGeoJson}
                                style={viewMode === 'niebla' ? getFogStyle : getOutlineStyle}
                                filter={geoJsonFilter}
                                pointToLayer={(_feature, latlng) => {
                                    // For point features like 'localidades', render a tactical circle marker
                                    return L.circleMarker(latlng, {
                                        radius: 6,
                                        fillColor: viewMode === 'niebla' ? '#00D4FF' : 'transparent',
                                        color: viewMode === 'niebla' ? '#0F1218' : '#00D4FF',
                                        weight: 1,
                                        opacity: viewMode === 'niebla' ? 1 : 0.5,
                                        fillOpacity: viewMode === 'niebla' ? 0.8 : 0
                                    });
                                }}
                                onEachFeature={(feature, layer) => {
                                    const propsKeys = Object.keys(feature.properties || {});

                                    // Debug: Log properties of the first few features to see what we actually have
                                    if (Math.random() < 0.01) { // Log roughly 1% of features to avoid freezing the console
                                        console.log("Radar Tooltip Debug - Properties:", feature.properties);
                                    }

                                    // Heuristic to find the best display name
                                    let displayValue = 'Zona Cartográfica';
                                    if (propsKeys.length > 0) {
                                        // Priority 1: explicitly 'nombre', 'nom', 'nom_col', 'colonia', 'seccion', 'sec', 'nom_loc', 'localidad'
                                        const nameKey = propsKeys.find(k =>
                                            ['nombre', 'nom', 'nom_col', 'colonia', 'seccion', 'sec', 'nom_loc', 'localidad'].some(term => k.toLowerCase().includes(term))
                                        );

                                        if (nameKey) {
                                            displayValue = String(feature.properties![nameKey]);
                                        } else {
                                            // Priority 2: Just show the first property value we can find
                                            const firstProp = feature.properties![propsKeys[0]];
                                            displayValue = String(firstProp);
                                        }

                                        // If it's just a number (like a section number), prefix it
                                        if (!isNaN(Number(displayValue))) {
                                            displayValue = `#${displayValue}`;
                                        }
                                    }

                                    const count = feature.properties?._convincedCount || 0;
                                    const meta40 = feature.properties?._meta40 || feature.properties?.meta_40;
                                    const padron = feature.properties?._padronTotal || feature.properties?.padron_total;
                                    const hombres = feature.properties?._padronHombres || feature.properties?.hombres || 0;
                                    const mujeres = feature.properties?._padronMujeres || feature.properties?.mujeres || 0;
                                    const votalHistory = feature.properties?._actualVoted || feature.properties?.total_votes;
                                    const edadRangos = feature.properties?._edadRangos || feature.properties?.edad_rangos;

                                    let detailsHtml = '';
                                    if (padron || votalHistory || meta40) {
                                        let edadStr = '';
                                        if (edadRangos && Object.keys(edadRangos).length > 0) {
                                            const topAges = Object.entries(edadRangos).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3);
                                            edadStr = `<div style="font-size: 0.70rem; color: #888; font-style: italic; margin-top: 2px;">RANGOS TOP: ${topAges.map(t => `${t[0]}`).join(' | ')}</div>`;
                                        }

                                        const pctGuber = padron > 0 ? ((meta40 || 0) / padron * 100).toFixed(1) : '0.0';
                                        detailsHtml = `
                                            <div style="margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
                                                <div style="font-size: 0.75rem; color: #aaa;">PADRÓN (LISTA NOMINAL): <b>${(padron || 0).toLocaleString()}</b> (H:${hombres} / M:${mujeres})</div>
                                                ${edadStr}
                                                <div style="font-size: 0.75rem; color: #aaa; margin-top: 3px;">PERSONAS QUE VOTARON (Historico): <b>${(votalHistory || 0).toLocaleString()}</b></div>
                                                <div style="margin-top: 3px; color: var(--tertiary); font-weight: bold; font-size: 0.85rem;">
                                                    🎯 META (GANADO GOBERNADOR): ${(meta40 || 0).toLocaleString()} (${pctGuber}%)
                                                </div>
                                            </div>
                                        `;
                                    }

                                    const isCustom = feature.properties?._isCustomTarget;
                                    const metaLabel = isCustom ? '🎯 META ASIGNADA' : '🎯 META (GOBER)';

                                    const statsHtml = `
                                        <div style="margin-top: 5px; color: ${count >= (meta40 || 1) ? '#10B981' : '#FF3366'}; font-size: 0.9em;">
                                            🤜 CONVENCIDOS ACTUALES: <b>${count}</b> / ${meta40 ?? '---'}
                                        </div>
                                        <div style="font-size: 0.75rem; color: ${isCustom ? 'var(--tertiary)' : '#888'}; font-weight: ${isCustom ? 'bold' : 'normal'}; margin-top: 2px;">
                                            ${metaLabel}: ${meta40 ?? '---'}
                                        </div>
                                        ${detailsHtml}
                                    `;

                                    layer.bindPopup(`<strong style="font-family: Oswald; color: #00D4FF; letter-spacing: 0.05em; text-transform: uppercase;">ZONA: ${displayValue}</strong>${statsHtml}`);
                                    layer.bindTooltip(`<span style="font-weight: bold; font-family: Inter;">${displayValue}</span><br/>${isCustom ? 'Meta Asignada' : 'Meta'}: ${meta40 ?? '---'}`, { sticky: true, className: 'tactile-tooltip' });

                                    layer.on({
                                        click: () => {
                                            const currentLayerType = availableLayers.find(l => l.id === activeLayerId)?.layer_type;
                                            const featureId = getFeatureId(feature.properties, currentLayerType || '');
                                            if (viewMode === 'markers' && featureId) {
                                                setMarkerSupporters([]);
                                                setPointsScope(featureId);
                                            }

                                            // Find supporters strictly inside this polygon
                                            let regionalSupporters: any[] = [];
                                            if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                                                regionalSupporters = supporters.filter(s => {
                                                    if (!s.latitude || !s.longitude) return false;
                                                    try {
                                                        const pt = point([s.longitude, s.latitude]);
                                                        return booleanPointInPolygon(pt, feature as any);
                                                    } catch (e) {
                                                        return false;
                                                    }
                                                });
                                            }

                                            setSelectedRegion({
                                                name: displayValue,
                                                count,
                                                supportersList: regionalSupporters,
                                                properties: feature.properties,
                                                type: availableLayers.find(l => l.id === activeLayerId)?.layer_type || 'Desconocido'
                                            });
                                        }
                                    });
                                }}
                            />
                        )}

                        {viewMode === 'heatmap' && <HeatmapLayer points={heatPoints} />}

                        {/* STAFF (STAFF) - MULTI-COLOR PINS */}
                        {viewMode === 'markers' && markerStaff.map((tm) => {
                            let pinColor = '#FFB800'; // Default Brigadista (Orange/Yellow)
                            if (tm.role === 'coordinador' || tm.role === 'coordinador_campana') pinColor = '#A855F7'; // Purple
                            if (tm.role === 'lider') pinColor = '#3B82F6'; // Blue

                            return (
                                <Marker
                                    key={tm.id}
                                    position={[tm.latitude, tm.longitude]}
                                    icon={L.divIcon({
                                        className: 'custom-marker',
                                        html: `<div style="background-color: ${pinColor}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 15px ${pinColor};"></div>`,
                                        iconSize: [16, 16]
                                    })}
                                >
                                    <Popup className="tactical-popup neon-border">
                                        <div style={{ color: 'white', fontFamily: 'Inter, sans-serif', minWidth: '180px' }}>
                                            <h4 style={{ margin: '0 0 0.2rem 0', color: pinColor, fontFamily: 'Oswald', textTransform: 'uppercase' }}>
                                                {tm.role}: {tm.name}
                                            </h4>
                                            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', color: '#888' }}>{tm.rank_name}</p>

                                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '0.5rem', borderRadius: '4px', marginBottom: '0.5rem' }}>
                                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#ccc' }}>
                                                    <strong>XP Acumulada:</strong> <span style={{ color: pinColor }}>{tm.xp}</span>
                                                </p>
                                                <p style={{ margin: 0, fontSize: '0.8rem', color: '#ccc' }}>
                                                    <strong>Meta del Sector:</strong> {tm.assigned_targets?.find((t: any) => t.zone_id === pointsScope)?.target || '---'}
                                                </p>
                                            </div>

                                            <div className="flex-col gap-1">
                                                <a href={`tel:${tm.phone}`} style={{ textDecoration: 'none' }}>
                                                    <button className="squishy-btn mini primary" style={{ width: '100%', fontSize: '0.7rem', padding: '0.3rem' }}>CONTACTAR</button>
                                                </a>
                                            </div>
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}

                        {/* SUPPORTERS (CONVENCIDOS + VOLUNTARIOS) */}
                        {viewMode === 'markers' && markerSupporters.map((s) => {
                            const isMyTenant = s.tenant_id === user?.tenant_id;
                            const isVolunteer = !s.recruiter_id;

                            // Color mapping for allies
                            const allyColors = ['#00D4FF', '#FFB800', '#A855F7', '#F43F5E', '#10B981', '#EC4899'];
                            const getAllyColor = (tid: string) => {
                                if (!tid) return '#25D366';
                                let hash = 0;
                                for (let i = 0; i < tid.length; i++) {
                                    hash = tid.charCodeAt(i) + ((hash << 5) - hash);
                                }
                                return allyColors[Math.abs(hash) % allyColors.length];
                            };

                            const pinColor = isMyTenant
                                ? (isVolunteer ? '#E2E8F0' : '#25D366')
                                : getAllyColor(s.tenant_id);

                            const handleBindVolunteer = async () => {
                                if (!user) return;
                                try {
                                    const { error } = await supabase
                                        .from('supporters')
                                        .update({ recruiter_id: user.id })
                                        .eq('id', s.id);

                                    if (!error) {
                                        // Update local state to reflect change immediately
                                        setMarkerSupporters(prev => prev.map(item =>
                                            item.id === s.id ? { ...item, recruiter_id: user.id } : item
                                        ));
                                    }
                                } catch (e) {
                                    console.error("Error binding volunteer", e);
                                }
                            };

                            return (
                                <Marker
                                    key={s.id || s.offline_id}
                                    position={[s.latitude, s.longitude]}
                                    icon={L.divIcon({
                                        className: 'custom-marker',
                                        html: `<div style="background-color: ${pinColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${pinColor}; ${!isMyTenant ? 'border-style: dashed;' : ''}"></div>`,
                                        iconSize: [12, 12]
                                    })}
                                >
                                    <Popup className="tactical-popup">
                                        <div style={{ color: 'white', fontFamily: 'Inter, sans-serif' }}>
                                            <h4 style={{ margin: '0 0 0.5rem 0', color: pinColor, fontFamily: 'Oswald' }}>
                                                {isVolunteer ? 'VOLUNTARIO PENDIENTE' : 'CONVENCIDO'}: {s.name}
                                            </h4>
                                            {!isMyTenant && (
                                                <div style={{ fontSize: '0.7rem', color: pinColor, fontWeight: 'bold', marginBottom: '0.5rem', textTransform: 'uppercase', background: 'rgba(255,255,255,0.05)', padding: '2px 5px', borderRadius: '3px' }}>
                                                    Candidato Aliado: {s.tenant_name || 'Desconocido'}
                                                </div>
                                            )}
                                            <p style={{ margin: 0, fontSize: '0.8rem' }}><strong>Tel:</strong> {s.phone}</p>
                                            <p style={{ margin: 0, fontSize: '0.8rem' }}><strong>Compromiso:</strong> {'⭐'.repeat(s.commitment_level)}</p>

                                            {isVolunteer && isMyTenant ? (
                                                <div style={{ marginTop: '0.8rem', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.8rem' }}>
                                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.7rem', color: 'var(--tertiary)', fontWeight: 'bold' }}>ESPERANDO VISITA DE CAMPAÑA</p>
                                                    <button
                                                        className="squishy-btn mini primary"
                                                        style={{ width: '100%', fontSize: '0.75rem' }}
                                                        onClick={handleBindVolunteer}
                                                    >
                                                        VINCULAR A MI EQUIPO
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    {s.isOffline && <div style={{ color: 'orange', fontWeight: 'bold', fontSize: '0.7rem', marginTop: '5px' }}>[Offline - Pendiente de Sync]</div>}
                                                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.7rem', color: '#888' }}>PROMOVIDO EN CAMPAÑA</p>
                                                </>
                                            )}
                                        </div>
                                    </Popup>
                                </Marker>
                            );
                        })}
                    </MapContainer>

                    {/* Instruction Overlay for Markers Mode */}
                    {viewMode === 'markers' && !pointsScope && !selectedRegion && (
                        <div style={{
                            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                            backgroundColor: 'rgba(10, 15, 25, 0.85)', padding: '1.5rem', borderRadius: '12px',
                            border: '1px solid var(--tertiary)', zIndex: 1000, textAlign: 'center', pointerEvents: 'none',
                            boxShadow: '0 0 30px rgba(0, 212, 255, 0.3)', backdropFilter: 'blur(10px)'
                        }}>
                            <h3 className="tactical-font" style={{ color: 'var(--tertiary)', margin: 0, fontSize: '1.2rem' }}>&gt; SISTEMA DE PRECISIÓN ACTIVO</h3>
                            <p style={{ color: '#ccc', margin: '0.5rem 0 0', fontSize: '0.9rem' }}>POR FAVOR, SELECCIONA UNA <b style={{ color: 'white' }}>SECCIÓN o COLONIA</b> EN EL MAPA PARA CARGAR LOS PUNTOS.</p>
                        </div>
                    )}

                    {/* Tactical Slide-Out Dashboard */}
                    {selectedRegion && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            right: 0,
                            bottom: 0,
                            width: '350px',
                            backgroundColor: 'rgba(15, 18, 24, 0.95)',
                            borderLeft: '2px solid var(--tertiary)',
                            boxShadow: '-5px 0 20px rgba(0, 0, 0, 0.7)',
                            zIndex: 1000,
                            display: 'flex',
                            flexDirection: 'column',
                            color: 'white'
                        }}>
                            <div style={{ padding: '1.2rem', borderBottom: '1px solid rgba(0, 212, 255, 0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'rgba(0, 212, 255, 0.05)' }}>
                                <div>
                                    <div style={{ fontSize: '0.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '0.1em' }}>REPORTE TÁCTICO - {String(selectedRegion.type).toUpperCase()}</div>
                                    <h3 style={{ margin: 0, fontFamily: 'Oswald', color: 'var(--tertiary)', fontSize: '1.4rem' }}>{selectedRegion.name}</h3>
                                </div>
                                <button onClick={() => {
                                    setSelectedRegion(null);
                                    setSidebarTab('info');
                                }} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.8rem', cursor: 'pointer', opacity: 0.7 }}>&times;</button>
                            </div>

                            {/* Tactical Tabs */}
                            <div style={{ display: 'flex', background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(0, 212, 255, 0.1)' }}>
                                {['info', 'coalition', 'list'].map((tab) => {
                                    const isActive = sidebarTab === tab;
                                    const hasAllies = selectedRegion.supportersList?.some((s: any) => s.tenant_id !== user?.tenant_id);
                                    if (tab === 'coalition' && !hasAllies) return null;

                                    return (
                                        <button
                                            key={tab}
                                            onClick={() => setSidebarTab(tab as any)}
                                            style={{
                                                flex: 1,
                                                padding: '0.8rem',
                                                backgroundColor: 'transparent',
                                                border: 'none',
                                                borderBottom: isActive ? '2px solid var(--tertiary)' : '2px solid transparent',
                                                color: isActive ? 'var(--tertiary)' : '#666',
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold',
                                                fontFamily: 'Oswald',
                                                textTransform: 'uppercase',
                                                cursor: 'pointer',
                                                transition: 'all 0.3s ease'
                                            }}
                                        >
                                            {tab === 'info' ? 'General' : tab === 'coalition' ? 'Coalición' : 'Listado'}
                                        </button>
                                    );
                                })}
                            </div>

                            <div style={{ padding: '1.2rem', flex: 1, overflowY: 'auto' }}>
                                {sidebarTab === 'info' && (
                                    <>
                                        <div style={{ backgroundColor: 'rgba(255, 51, 102, 0.1)', border: '1px solid #FF3366', borderRadius: '8px', padding: '1rem', textAlign: 'center', marginBottom: '1.5rem' }}>
                                            <div style={{ fontSize: '0.9rem', color: '#ff99b3', fontWeight: 'bold' }}>FUERZA DESPLEGADA</div>
                                            <div style={{ fontSize: '3rem', fontWeight: 'bold', fontFamily: 'Oswald', color: '#FF3366', textShadow: '0 0 15px rgba(255, 51, 102, 0.5)', lineHeight: 1 }}>
                                                {selectedRegion.count}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '0.5rem' }}>Simpatizantes Geo-verificados</div>
                                        </div>

                                        {(() => {
                                            const meta40 = selectedRegion.properties?._meta40 ?? selectedRegion.properties?.meta_40;
                                            if (!meta40 && meta40 !== 0) return null;
                                            return (
                                                <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10B981', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                                        <span style={{ fontSize: '0.9rem', color: '#6EE7B7', fontWeight: 'bold' }}>META GANADO GOBERNADOR</span>
                                                        <span style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'Oswald', color: '#10B981' }}>{meta40.toLocaleString()}</span>
                                                    </div>
                                                    <div style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${Math.min((selectedRegion.count / (meta40 || 1)) * 100, 100)}%`,
                                                            backgroundColor: '#10B981',
                                                            boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)'
                                                        }}></div>
                                                    </div>
                                                    <div style={{ fontSize: '0.85rem', color: '#fff', textAlign: 'right', fontFamily: 'Inter', fontWeight: 'bold' }}>
                                                        {((selectedRegion.count / (meta40 || 1)) * 100).toFixed(1)}% <span style={{ color: '#aaa', fontWeight: 'normal' }}>Efectividad Tactica</span>
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#888' }}>PADRÓN TOTAL</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{(selectedRegion.properties?._padronTotal ?? selectedRegion.properties?.padron_total ?? 0).toLocaleString()}</div>
                                                <div style={{ fontSize: '0.6rem', color: '#666' }}>Hombres: {selectedRegion.properties?._padronHombres ?? 0} / Mujeres: {selectedRegion.properties?._padronMujeres ?? 0}</div>
                                            </div>
                                            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                                <div style={{ fontSize: '0.65rem', color: '#888' }}>VOTACIÓN HIST</div>
                                                <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{(selectedRegion.properties?._actualVoted ?? selectedRegion.properties?.total_votes ?? 0).toLocaleString()}</div>
                                                <div style={{ fontSize: '0.6rem', color: '#10B981' }}>Participación Real</div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {sidebarTab === 'coalition' && (
                                    <div className="flex-col gap-4">
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.8rem', color: 'var(--tertiary)' }}>
                                            <Network className="w-5 h-5" />
                                            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', fontFamily: 'Oswald', textTransform: 'uppercase' }}>Fuerzas de Coalición</span>
                                        </div>
                                        <div className="flex-col gap-3">
                                            {Object.entries(
                                                (selectedRegion.supportersList || []).reduce((acc: any, curr: any) => {
                                                    if (curr.tenant_id === user?.tenant_id) return acc;
                                                    const key = curr.tenant_name || 'Aliado Externo';
                                                    acc[key] = (acc[key] || 0) + 1;
                                                    return acc;
                                                }, {})
                                            ).map(([candidate, total]: any) => (
                                                <div key={candidate} style={{ background: 'rgba(0, 212, 255, 0.08)', border: '1px solid rgba(0, 212, 255, 0.2)', padding: '1rem', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', color: '#888', textTransform: 'uppercase' }}>APORTACIÓN DE ALIADO</div>
                                                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'white' }}>{candidate}</div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '1.8rem', fontWeight: 'bold', color: 'var(--tertiary)', fontFamily: 'Oswald' }}>+{total}</div>
                                                        <div style={{ fontSize: '0.6rem', color: '#10B981' }}>EFECTIVOS</div>
                                                    </div>
                                                </div>
                                            ))}
                                            <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#666', fontStyle: 'italic', textAlign: 'center' }}>
                                                    * Solo se visualizan simpatizantes de aliados con estatus <b style={{ color: '#aaa' }}>"Auditado"</b> o <b style={{ color: '#aaa' }}>"Verificado"</b> para garantizar certeza en los datos compartidos.
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {sidebarTab === 'list' && (
                                    <>
                                        <h4 style={{ color: 'var(--tertiary)', borderBottom: '1px solid rgba(0, 212, 255, 0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', fontFamily: 'Oswald', fontSize: '1.1rem' }}>DESGLOSE DE EFECTIVOS</h4>

                                        {selectedRegion.supportersList.length === 0 ? (
                                            <div style={{ color: '#888', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                                No hay tropas registradas en esta zona.
                                            </div>
                                        ) : (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                                {selectedRegion.supportersList.map((s: any, idx: number) => {
                                                    const isMe = s.tenant_id === user?.tenant_id;
                                                    return (
                                                        <div key={idx} style={{
                                                            backgroundColor: 'rgba(255,255,255,0.05)',
                                                            border: isMe ? '1px solid rgba(255,255,255,0.1)' : '1px dashed var(--tertiary)',
                                                            borderRadius: '6px',
                                                            padding: '0.8rem'
                                                        }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                                                <span style={{ fontWeight: 'bold', color: isMe ? 'white' : 'var(--tertiary)' }}>{s.name}</span>
                                                                <span style={{ fontSize: '0.75rem', color: '#888' }}>{s.section_id}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontSize: '0.8rem', color: '#aaa' }}>{s.phone}</span>
                                                                <span style={{ fontSize: '0.8rem' }}>{'⭐'.repeat(s.commitment_level)}</span>
                                                            </div>
                                                            {!isMe && (
                                                                <div style={{ fontSize: '0.65rem', color: 'var(--tertiary)', marginTop: '0.4rem', textTransform: 'uppercase', fontStyle: 'italic' }}>
                                                                    Origen: {s.tenant_name}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
