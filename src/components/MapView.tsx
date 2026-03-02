import React, { useEffect, useState } from 'react';
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
    }
}

// Helper to remove accents for robust searching
const removeAccents = (str: string) => {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
};

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
    } else {
        // fallback: first non-geometry property that describes an ID or Name
        bestKey = keys.find(k => ['nombre', 'nom', 'id', 'cve'].some(t => k.toLowerCase().includes(t))) || keys[0];
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

    const [historicalTargets, setHistoricalTargets] = useState<Record<string, any>>({});
    const [tenantScope, setTenantScope] = useState<string>('');
    const [tenantConfig, setTenantConfig] = useState<any>(null);
    const [pollMode, setPollMode] = useState<{ pollId: string, title: string } | null>(null);
    const [pointsScope, setPointsScope] = useState<string | null>(null);
    const [markerSupporters, setMarkerSupporters] = useState<any[]>([]);
    const [markerStaff, setMarkerStaff] = useState<any[]>([]);

    useEffect(() => {
        const pm = localStorage.getItem('radar_poll_mode');
        if (pm) setPollMode(JSON.parse(pm));
    }, []);

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

                // Force target query to always use Gubernatura 2024 to get Eduardo Ramirez's votes
                let targetQuery = supabase.from('historical_election_results')
                    .select('section_id, municipality, target_votes_calculated, padron_total, padron_hombres, padron_mujeres, total_votes, candidate_names, party_results, padron_edad_rangos')
                    .eq('election_year', 2024)
                    .eq('election_type', 'gubernatura');

                let targetData: any[] = [];
                let t_start = 0;
                let t_limit = 1000;
                while (true) {
                    const { data: chunk, error } = await targetQuery.range(t_start, t_start + t_limit - 1);
                    if (error) break;
                    if (chunk && chunk.length > 0) {
                        targetData = [...targetData, ...chunk];
                        if (chunk.length < t_limit) break;
                    } else {
                        break;
                    }
                    t_start += t_limit;
                }

                let padronQuery = supabase.from('padron_electoral')
                    .select('section_id, municipality, padron_total, hombres, mujeres, edad_rangos')
                    .eq('year', 2024);

                let demographicData: any[] = [];
                let d_start = 0;
                let d_limit = 1000;
                while (true) {
                    const { data: chunk, error } = await padronQuery.range(d_start, d_start + d_limit - 1);
                    if (error) break;
                    if (chunk && chunk.length > 0) {
                        demographicData = [...demographicData, ...chunk];
                        if (chunk.length < d_limit) break;
                    } else {
                        break;
                    }
                    d_start += d_limit;
                }


                if (targetData) {
                    const dict: Record<string, any> = {};
                    const createEmpty = () => ({ target: 0, padron: 0, hombres: 0, mujeres: 0, actual_voted: 0, meta_40: 0, edad_rangos: {} });

                    const muniToFed: Record<number, string> = {};
                    Object.entries(CHIAPAS_DISTRITOS_FEDERALES).forEach(([d, ms]) => ms.forEach(m => muniToFed[m] = d));
                    const muniToLoc: Record<number, string> = {};
                    Object.entries(CHIAPAS_DISTRITOS_LOCALES).forEach(([d, ms]) => ms.forEach(m => muniToLoc[m] = d));

                    const aggregate = (key: string, row: any, isTarget: boolean) => {
                        if (!dict[key]) dict[key] = createEmpty();

                        // Extract Eduardo Ramirez's specific votes
                        let ramirezVotes = 0;
                        if (row.candidate_names && row.party_results) {
                            Object.entries(row.candidate_names).forEach(([party, name]) => {
                                if (String(name).includes('RAMIREZ')) {
                                    ramirezVotes += (row.party_results[party] || 0);
                                }
                            });
                        }
                        if (ramirezVotes === 0) ramirezVotes = row.target_votes_calculated || 0;

                        if (isTarget) {
                            dict[key].target += ramirezVotes;
                            dict[key].actual_voted += (row.total_votes || 0);
                            dict[key].meta_40 += ramirezVotes; // We reuse meta_40 to store the universal target for backward compatibility

                            // Fallback to historical padron ONLY if demographic query failed (handled by the if statement below)
                            if (!demographicData || demographicData.length === 0) {
                                dict[key].padron += (row.padron_total || 0);
                                dict[key].hombres += (row.padron_hombres || 0);
                                dict[key].mujeres += (row.padron_mujeres || 0);

                                if (row.padron_edad_rangos) {
                                    Object.entries(row.padron_edad_rangos).forEach(([k, v]) => {
                                        dict[key].edad_rangos[k] = (dict[key].edad_rangos[k] || 0) + (Number(v) || 0);
                                    });
                                }
                            }
                        } else {
                            // Demographic data directly populates padron, overwriting or appending exclusively.
                            dict[key].padron += (row.padron_total || 0);
                            dict[key].hombres += (row.hombres || 0);
                            dict[key].mujeres += (row.mujeres || 0);

                            if (row.edad_rangos) {
                                Object.entries(row.edad_rangos).forEach(([k, v]) => {
                                    dict[key].edad_rangos[k] = (dict[key].edad_rangos[k] || 0) + (Number(v) || 0);
                                });
                            }
                        }
                    };

                    targetData.forEach(row => {
                        const secKey = getCompKey(row.municipality, row.section_id);
                        aggregate(secKey, row, true);
                        const mNorm = removeAccents(row.municipality.toLowerCase());
                        aggregate(`muni:${mNorm}`, row, true);
                        const mId = (CHIAPAS_MUNICIPIOS as any)[mNorm];
                        if (mId) {
                            if (muniToFed[mId]) aggregate(`dist_f:${muniToFed[mId]}`, row, true);
                            if (muniToLoc[mId]) aggregate(`dist_l:${muniToLoc[mId]}`, row, true);
                        }
                        aggregate('state:chiapas', row, true);
                    });

                    if (demographicData) {
                        demographicData.forEach(row => {
                            const secKey = getCompKey(row.municipality, row.section_id);

                            // Apply demographic data even if target data exists, to overwrite empty padron fields
                            aggregate(secKey, row, false);
                            const mNorm = removeAccents(row.municipality.toLowerCase());
                            aggregate(`muni:${mNorm}`, row, false);

                            const mId = (CHIAPAS_MUNICIPIOS as any)[mNorm];
                            if (mId) {
                                if (muniToFed[mId]) aggregate(`dist_f:${muniToFed[mId]}`, row, false);
                                if (muniToLoc[mId]) aggregate(`dist_l:${muniToLoc[mId]}`, row, false);
                            }
                            aggregate('state:chiapas', row, false);
                        });
                    }
                    setHistoricalTargets(dict);
                }
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
                .eq('tenant_id', user?.tenant_id)
                .not('latitude', 'is', null);

            if (!['superadmin', 'candidato', 'coordinador_campana'].includes(user?.role || '')) {
                // Only see my team staff
                staffQuery = staffQuery.in('id', teamIds);
            }

            const { data: staffData } = await staffQuery;
            setMarkerStaff(staffData || []);

            // 3. Fetch SUPPORTERS (Convencidos + Volunteers)
            let supQuery = supabase
                .from('supporters')
                .select('*')
                .eq('tenant_id', user?.tenant_id)
                .eq('section_id', zoneId)
                .not('latitude', 'is', null)
                .not('longitude', 'is', null);

            // Hierarchical Visibility Filter
            if (!['superadmin', 'candidato', 'coordinador_campana'].includes(user?.role || '')) {
                // See my team's supporters OR unassigned volunteers in my area
                supQuery = supQuery.or(`recruiter_id.in.(${teamIds.join(',')}),recruiter_id.is.null`);
            }

            const { data: supportersData } = await supQuery;
            setMarkerSupporters(supportersData || []);
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

            // Normal Supporters Load
            const { data: onlineData } = await supabase
                .from('supporters')
                .select('*')
                .not('latitude', 'is', null)
                .not('longitude', 'is', null);

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

    // Spatial Pre-calculation Engine (Optimized with Grid Indexing)
    const processedGeoJson = React.useMemo(() => {
        if (!rawGeoJson || !supporters.length) {
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
                const munK = spropsKeys.find(k => k.toLowerCase() === 'municipio' || k.toLowerCase() === 'municipality' || k.toLowerCase() === 'nom_mun' || k.toLowerCase() === 'municip');

                if (secK) {
                    const secIdRaw = String(sf.properties[secK]);
                    const normalizedSec = isNaN(Number(secIdRaw)) ? secIdRaw : String(Number(secIdRaw));
                    const rawMuni = sf.properties[munK || ''] || tenantScope || '';
                    const mKey = getCompKey(String(rawMuni), normalizedSec);

                    try {
                        const bounds = L.geoJSON(sf).getBounds();
                        sectionBounds.push({ feature: sf, bounds, metricsKey: mKey });
                    } catch (e) { }
                }
            });
        }

        supporters.forEach((s: any) => {
            if (s.latitude && s.longitude) {
                const gridX = Math.floor(s.longitude * 10);
                const gridY = Math.floor(s.latitude * 10);
                const gridKey = `${gridX},${gridY}`;
                if (!grid[gridKey]) grid[gridKey] = [];
                grid[gridKey].push(s);
            }
        });

        if (processed.features) {


            processed.features.forEach((feature: any) => {
                let count = 0;
                if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
                    // 2. Only check points in relevant grid cells (Bounding Box approximation)
                    // This is MUCH faster for thousands of points
                    const bbox = L.geoJSON(feature).getBounds();
                    const minX = Math.floor(bbox.getWest() * 10);
                    const maxX = Math.floor(bbox.getEast() * 10);
                    const minY = Math.floor(bbox.getSouth() * 10);
                    const maxY = Math.floor(bbox.getNorth() * 10);

                    for (let x = minX; x <= maxX; x++) {
                        for (let y = minY; y <= maxY; y++) {
                            const gridKey = `${x},${y}`;
                            const pointsInCell = grid[gridKey];
                            if (pointsInCell) {
                                pointsInCell.forEach((s: any) => {
                                    try {
                                        const pt = point([s.longitude, s.latitude]);
                                        if (booleanPointInPolygon(pt, feature)) {
                                            count++;
                                        }
                                    } catch (e) { }
                                });
                            }
                        }
                    }
                }
                if (!feature.properties) feature.properties = {};
                feature.properties._convincedCount = count;

                // Match Historical Target logically based on Layer Type
                const propsKeys = Object.keys(feature.properties);
                const sectionKey = propsKeys.find(k => k.toLowerCase() === 'seccion' || k.toLowerCase() === 'sec');
                const muniKey = propsKeys.find(k => k.toLowerCase() === 'municipio' || k.toLowerCase() === 'municipality' || k.toLowerCase() === 'nom_mun' || k.toLowerCase() === 'municip');
                const nombreKey = propsKeys.find(k => k.toLowerCase() === 'nombre');

                let metricsKey = '';
                if (layerType === 'seccion' && sectionKey) {
                    const secIdRaw = String(feature.properties[sectionKey]);
                    const normalizedSec = isNaN(Number(secIdRaw)) ? secIdRaw : String(Number(secIdRaw));
                    const rawMuni = feature.properties[muniKey || ''] || tenantScope || '';
                    metricsKey = getCompKey(String(rawMuni), normalizedSec);
                } else if (layerType === 'municipio') {
                    // For municipality layer, we look for the name property
                    let mName = feature.properties[nombreKey || ''] || feature.properties['NOM_MUN'] || feature.properties[muniKey || ''] || '';
                    if (!isNaN(Number(mName))) {
                        // If we got an ID, try explicitly grabbing 'nombre' or 'NOMBRE'
                        mName = feature.properties['nombre'] || feature.properties['NOMBRE'] || mName;
                    }
                    metricsKey = `muni:${removeAccents(String(mName).toLowerCase())}`;
                } else if (layerType === 'colonia' || layerType === 'localidad') {
                    // Handled specifically via spatial intersect below
                    metricsKey = 'SPATIAL_INTERSECT';
                } else if (layerType.includes('distrito_f')) {
                    const fedKey = propsKeys.find(k => k.toLowerCase().includes('distrito_f') || k.toLowerCase().includes('dist_fed') || k.toLowerCase() === 'distrito');
                    if (fedKey) metricsKey = `dist_f:${feature.properties[fedKey]}`;
                } else if (layerType.includes('distrito_l')) {
                    const locKey = propsKeys.find(k => k.toLowerCase().includes('distrito_l') || k.toLowerCase().includes('dist_loc') || k.toLowerCase() === 'distrito');
                    if (locKey) metricsKey = `dist_l:${feature.properties[locKey]}`;
                } else if (layerType === 'estado' || layerType === 'entidad' || layerType === 'chiapas') {
                    metricsKey = 'state:chiapas';
                }

                let metrics = historicalTargets[metricsKey];

                // If we are aggregating colonies/localities, sum the intersected sections
                if (layerType === 'colonia' || layerType === 'localidad') {
                    metrics = { target: 0, padron: 0, actual_voted: 0, hombres: 0, mujeres: 0, meta_40: 0 };

                    try {
                        const colBounds = L.geoJSON(feature).getBounds();
                        sectionBounds.forEach(sb => {
                            if (colBounds.intersects(sb.bounds)) {
                                // Double check with strict turf booleanIntersects
                                if (booleanIntersects(feature, sb.feature)) {
                                    const smet = historicalTargets[sb.metricsKey];
                                    if (smet) {
                                        metrics.target += smet.target;
                                        metrics.padron += smet.padron;
                                        metrics.actual_voted += smet.actual_voted;
                                        metrics.hombres += smet.hombres;
                                        metrics.mujeres += smet.mujeres;
                                        metrics.meta_40 += smet.meta_40;
                                        if (smet.edad_rangos) {
                                            if (!metrics.edad_rangos) metrics.edad_rangos = {};
                                            Object.entries(smet.edad_rangos).forEach(([k, v]) => {
                                                metrics.edad_rangos[k] = (metrics.edad_rangos[k] || 0) + Number(v);
                                            });
                                        }
                                    }
                                }
                            }
                        });
                    } catch (e) { }

                    if (metrics.target === 0 && metrics.padron === 0) {
                        metrics = null; // Mark as empty if no intersections found
                    }
                }



                const featureId = getFeatureId(feature.properties, layerType);
                const assignedTarget = user?.assigned_targets?.find((t: any) => String(t.zone_id) === String(featureId));

                if (metrics) {
                    feature.properties._historicalTarget = metrics.target;
                    feature.properties._padronTotal = metrics.padron;
                    feature.properties._padronHombres = metrics.hombres;
                    feature.properties._padronMujeres = metrics.mujeres;
                    feature.properties._actualVoted = metrics.actual_voted;
                    feature.properties._edadRangos = metrics.edad_rangos;

                    // Support custom target override
                    if (assignedTarget && assignedTarget.target > 0) {
                        feature.properties._meta40 = assignedTarget.target;
                        feature.properties._isCustomTarget = true;
                    } else {
                        feature.properties._meta40 = metrics.meta_40;
                        feature.properties._isCustomTarget = false;
                    }
                } else {
                    feature.properties._historicalTarget = null;
                    feature.properties._edadRangos = null;

                    if (assignedTarget && assignedTarget.target > 0) {
                        feature.properties._meta40 = assignedTarget.target;
                        feature.properties._isCustomTarget = true;
                    } else {
                        feature.properties._meta40 = null;
                        feature.properties._isCustomTarget = false;
                    }
                }
            });
            const matched = processed.features.filter((f: any) => f.properties._historicalTarget !== null);
            console.log(`Radar Logic: Matching summary [${layerType}] - Total: ${processed.features.length}, Matched: ${matched.length}`);

            if (matched.length === 0 && processed.features.length > 0 && Object.keys(historicalTargets).length > 0) {
                console.warn(`Radar Logic: 0 matches found for layer '${layerType}'!`);
                console.log("Radar Logic DEBUG: Keys available in properties:", Object.keys(processed.features[0].properties));
                console.log("Radar Logic DEBUG: Sample feature properties:", processed.features[0].properties);
            }

        }
        if ((window as any)._radarTimerActive) {
            console.timeEnd("RadarOptimization");
            (window as any)._radarTimerActive = false;
        }
        return processed;
    }, [rawGeoJson, supporters, historicalTargets, tenantScope]);


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
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
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

                        {processedGeoJson && (
                            <GeoJSON
                                key={`radar-layer-${activeLayerId}`}
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
                                    const meta40 = feature.properties?._meta40;
                                    const padron = feature.properties?._padronTotal;
                                    const hombres = feature.properties?._padronHombres;
                                    const mujeres = feature.properties?._padronMujeres;
                                    const votalHistory = feature.properties?._actualVoted;
                                    const edadRangos = feature.properties?._edadRangos;

                                    let detailsHtml = '';
                                    if (padron) {
                                        let edadStr = '';
                                        if (edadRangos && Object.keys(edadRangos).length > 0) {
                                            const topAges = Object.entries(edadRangos).sort((a: any, b: any) => b[1] - a[1]).slice(0, 3);
                                            edadStr = `<div style="font-size: 0.70rem; color: #888; font-style: italic; margin-top: 2px;">RANGOS TOP: ${topAges.map(t => `${t[0]}`).join(' | ')}</div>`;
                                        }

                                        const pctGuber = padron > 0 ? ((meta40 || 0) / padron * 100).toFixed(1) : '0.0';
                                        detailsHtml = `
                                            <div style="margin-top: 5px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 5px;">
                                                <div style="font-size: 0.75rem; color: #aaa;">PADRÓN TOTAL: <b>${padron.toLocaleString()}</b> (H:${hombres} / M:${mujeres})</div>
                                                ${edadStr}
                                                <div style="font-size: 0.75rem; color: #aaa; margin-top: 3px;">PARTICIPACIÓN HISTÓRICA: <b>${votalHistory?.toLocaleString() || 0}</b></div>
                                                <div style="margin-top: 3px; color: var(--tertiary); font-weight: bold; font-size: 0.85rem;">
                                                    🎯 META (EDO. RAMÍREZ): ${meta40?.toLocaleString() || 0} (${pctGuber}%)
                                                </div>
                                            </div>
                                        `;
                                    }

                                    const isCustom = feature.properties?._isCustomTarget;
                                    const metaLabel = isCustom ? '🎯 META ASIGNADA' : '🎯 META ESTRATÉGICA';

                                    const statsHtml = `
                                        <div style="margin-top: 5px; color: ${count >= (meta40 || 1) ? '#10B981' : '#FF3366'}; font-size: 0.9em;">
                                            🤜 CONVENCIDOS: <b>${count}</b> / ${meta40 || '---'}
                                        </div>
                                        <div style="font-size: 0.75rem; color: ${isCustom ? 'var(--tertiary)' : '#888'}; font-weight: ${isCustom ? 'bold' : 'normal'}; margin-top: 2px;">
                                            ${metaLabel}: ${meta40 || '---'}
                                        </div>
                                        ${detailsHtml}
                                    `;

                                    layer.bindPopup(`<strong style="font-family: Oswald; color: #00D4FF; letter-spacing: 0.05em; text-transform: uppercase;">ZONA: ${displayValue}</strong>${statsHtml}`);
                                    layer.bindTooltip(`<span style="font-weight: bold; font-family: Inter;">${displayValue}</span><br/>${isCustom ? 'Meta Asignada' : 'Meta'}: ${meta40 || '---'}`, { sticky: true, className: 'tactile-tooltip' });

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
                            const isVolunteer = !s.recruiter_id;
                            const pinColor = isVolunteer ? '#E2E8F0' : '#25D366'; // White/Grey for Volunteers, Green for Convincidos

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
                                        html: `<div style="background-color: ${pinColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 10px ${pinColor};"></div>`,
                                        iconSize: [12, 12]
                                    })}
                                >
                                    <Popup className="tactical-popup">
                                        <div style={{ color: 'white', fontFamily: 'Inter, sans-serif' }}>
                                            <h4 style={{ margin: '0 0 0.5rem 0', color: pinColor, fontFamily: 'Oswald' }}>
                                                {isVolunteer ? 'VOLUNTARIO PENDIENTE' : 'CONVENCIDO'}: {s.name}
                                            </h4>
                                            <p style={{ margin: 0, fontSize: '0.8rem' }}><strong>Tel:</strong> {s.phone}</p>
                                            <p style={{ margin: 0, fontSize: '0.8rem' }}><strong>Compromiso:</strong> {'⭐'.repeat(s.commitment_level)}</p>

                                            {isVolunteer ? (
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
                    {viewMode === 'markers' && !pointsScope && (
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
                                <button onClick={() => setSelectedRegion(null)} style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.8rem', cursor: 'pointer', opacity: 0.7 }}>&times;</button>
                            </div>

                            <div style={{ padding: '1.2rem', flex: 1, overflowY: 'auto' }}>
                                <div style={{ backgroundColor: 'rgba(255, 51, 102, 0.1)', border: '1px solid #FF3366', borderRadius: '8px', padding: '1rem', textAlign: 'center', marginBottom: '1.5rem' }}>
                                    <div style={{ fontSize: '0.9rem', color: '#ff99b3', fontWeight: 'bold' }}>FUERZA DESPLEGADA</div>
                                    <div style={{ fontSize: '3rem', fontWeight: 'bold', fontFamily: 'Oswald', color: '#FF3366', textShadow: '0 0 15px rgba(255, 51, 102, 0.5)', lineHeight: 1 }}>
                                        {selectedRegion.count}
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#ccc', marginTop: '0.5rem' }}>Simpatizantes Geo-verificados</div>
                                </div>

                                {selectedRegion.properties?._meta40 && (
                                    <div style={{ backgroundColor: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10B981', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.8rem' }}>
                                            <span style={{ fontSize: '0.9rem', color: '#6EE7B7', fontWeight: 'bold' }}>META 40% (ESTRATEGIA)</span>
                                            <span style={{ fontSize: '1.5rem', fontWeight: 'bold', fontFamily: 'Oswald', color: '#10B981' }}>{selectedRegion.properties._meta40}</span>
                                        </div>
                                        <div style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                                            <div style={{
                                                height: '100%',
                                                width: `${Math.min((selectedRegion.count / selectedRegion.properties._meta40) * 100, 100)}%`,
                                                backgroundColor: '#10B981',
                                                boxShadow: '0 0 10px rgba(16, 185, 129, 0.5)'
                                            }}></div>
                                        </div>
                                        <div style={{ fontSize: '0.85rem', color: '#fff', textAlign: 'right', fontFamily: 'Inter', fontWeight: 'bold' }}>
                                            {((selectedRegion.count / selectedRegion.properties._meta40) * 100).toFixed(1)}% <span style={{ color: '#aaa', fontWeight: 'normal' }}>Efectividad Tactica</span>
                                        </div>
                                    </div>
                                )}

                                <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#888' }}>PADRÓN TOTAL</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{selectedRegion.properties?._padronTotal?.toLocaleString()}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#666' }}>H: {selectedRegion.properties?._padronHombres} / M: {selectedRegion.properties?._padronMujeres}</div>
                                    </div>
                                    <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                        <div style={{ fontSize: '0.65rem', color: '#888' }}>VOTACIÓN HIST</div>
                                        <div style={{ fontSize: '1.1rem', fontWeight: 'bold' }}>{selectedRegion.properties?._actualVoted?.toLocaleString()}</div>
                                        <div style={{ fontSize: '0.6rem', color: '#10B981' }}>Participación Real</div>
                                    </div>
                                </div>

                                <h4 style={{ color: 'var(--tertiary)', borderBottom: '1px solid rgba(0, 212, 255, 0.2)', paddingBottom: '0.5rem', marginBottom: '1rem', fontFamily: 'Oswald', fontSize: '1.1rem' }}>DESGLOSE DE EFECTIVOS</h4>

                                {selectedRegion.supportersList.length === 0 ? (
                                    <div style={{ color: '#888', fontStyle: 'italic', textAlign: 'center', padding: '2rem 0', backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: '8px' }}>
                                        No hay tropas registradas en esta zona.
                                    </div>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                                        {selectedRegion.supportersList.map((s: any, idx: number) => (
                                            <div key={idx} style={{
                                                backgroundColor: 'rgba(255,255,255,0.05)',
                                                border: '1px solid rgba(255,255,255,0.1)',
                                                borderRadius: '6px',
                                                padding: '0.8rem',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}>
                                                <div>
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{s.name}</div>
                                                    <div style={{ fontSize: '0.75rem', color: '#aaa', marginTop: '0.2rem' }}>{s.phone || 'Sin teléfono'}</div>
                                                </div>
                                                <div style={{ color: '#FFD700', fontSize: '0.9rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                                    <div>{'⭐'.repeat(s.commitment_level || 1)}</div>
                                                    <div style={{ fontSize: '0.65rem', color: '#888', marginTop: '3px' }}>Nivel de Poder</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
