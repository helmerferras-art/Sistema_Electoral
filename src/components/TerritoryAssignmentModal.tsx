import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { X, Map } from 'lucide-react';
import { CHIAPAS_MUNICIPIOS } from '../lib/chiapas_municipios';
import { CHIAPAS_DISTRITOS_FEDERALES, CHIAPAS_DISTRITOS_LOCALES } from '../lib/chiapas_distritos';

interface TerritoryAssignmentModalProps {
    targetUser: any;
    onClose: () => void;
}

export const TerritoryAssignmentModal: React.FC<TerritoryAssignmentModalProps> = ({ targetUser, onClose }) => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [geoJsonData, setGeoJsonData] = useState<any>(null);
    const [availableLayers, setAvailableLayers] = useState<any[]>([]);
    const [activeLayerId, setActiveLayerId] = useState<string>('');

    // State to hold multiple selected identifiers (e.g. municipality IDs, or section IDs)
    const [selectedZones, setSelectedZones] = useState<string[]>([]);
    const [zoneTargets, setZoneTargets] = useState<Record<string, number>>({});
    const [layerType, setLayerType] = useState<string>('');
    const [tenantConfig, setTenantConfig] = useState<any>(null);

    useEffect(() => {
        // Pre-fill existing assignments if available
        if (targetUser.assigned_territory) {
            try {
                // assigned_territory = { layer_type: "seccion", zone_ids: ["1204"] }
                if (targetUser.assigned_territory.zone_ids) {
                    setSelectedZones(targetUser.assigned_territory.zone_ids);
                }
            } catch (e) { }
        }

        if (targetUser.assigned_targets) {
            try {
                // assigned_targets = [{ zone_id: "1204", target: 200 }]
                const targetsMap: Record<string, number> = {};
                targetUser.assigned_targets.forEach((t: any) => {
                    targetsMap[t.zone_id] = t.target;
                });
                setZoneTargets(targetsMap);
            } catch (e) { }
        }

        loadMasterLayers();
    }, [targetUser]);

    const loadMasterLayers = async () => {
        setLoading(true);
        try {
            // Fetch caller's tenant config first to know their jurisdiction
            if (user?.tenant_id) {
                const { data: tenant } = await supabase
                    .from('tenants')
                    .select('geographic_scope, position, election_type')
                    .eq('id', user.tenant_id)
                    .single();
                if (tenant) {
                    setTenantConfig(tenant);
                }
            }

            // Fetch global map layers
            const { data: layers } = await supabase
                .from('global_map_layers')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false });

            if (layers && layers.length > 0) {
                // Filter down to layers that make sense for assigning local boundaries
                // Usually Municipios or Secciones
                const filteredLayers = layers.filter((l: any) =>
                    ['municipio', 'seccion', 'colonia', 'localidad'].includes(l.layer_type.toLowerCase())
                );

                setAvailableLayers(filteredLayers);

                // If they already have an assigned layer_type, prioritize that
                const existingType = targetUser.assigned_territory?.layer_type;
                const defaultLayer = existingType
                    ? filteredLayers.find(l => l.layer_type.toLowerCase() === existingType.toLowerCase())
                    : (filteredLayers.find((l: any) => l.layer_type === 'seccion') || filteredLayers[0]);

                if (defaultLayer) {
                    setActiveLayerId(defaultLayer.id);
                    setLayerType(defaultLayer.layer_type.toLowerCase());
                    await loadGeoJsonFromServer(defaultLayer.geojson_url);
                }
            }
        } catch (error) {
            console.error(error);
        }
        setLoading(false);
    };

    const loadGeoJsonFromServer = async (url: string) => {
        try {
            const response = await fetch(url);
            if (response.ok) {
                const jsonData = await response.json();
                let actualGeoJson = jsonData;
                if (!jsonData.features && jsonData.FeatureCollection?.features) {
                    actualGeoJson = jsonData.FeatureCollection;
                } else if (!jsonData.features && Object.keys(jsonData).length > 0) {
                    const possibleFeatureKey = Object.keys(jsonData).find(k => Array.isArray(jsonData[k]));
                    if (possibleFeatureKey) {
                        const arr = jsonData[possibleFeatureKey];
                        const formattedFeatures = arr.map((item: any) => {
                            if (item.type === 'Feature') return item;
                            return { type: 'Feature', geometry: item, properties: {} };
                        });
                        actualGeoJson = { type: 'FeatureCollection', features: formattedFeatures };
                    }
                }
                setGeoJsonData(actualGeoJson);
            }
        } catch (error) {
            console.error("Error fetching map layer:", error);
        }
    };

    const handleLayerChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newId = e.target.value;
        setActiveLayerId(newId);

        // When swapping layers, clear the currently selected zones because the IDs won't match
        const l = availableLayers.find(al => al.id === newId);
        if (l) {
            setLayerType(l.layer_type.toLowerCase());
            setSelectedZones([]);
            setGeoJsonData(null);
            setLoading(true);
            await loadGeoJsonFromServer(l.geojson_url);
            setLoading(false);
        }
    };

    // Helper to get a stable unique ID for a polygon based on its layer type
    const getFeatureId = (properties: any) => {
        if (!properties) return null;

        const type = layerType;
        const keys = Object.keys(properties);

        // Priority heuristics based on INEGI standards
        let bestKey;
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

    // Helper to get a human-readable name for the tooltip
    const getFeatureName = (properties: any) => {
        if (!properties) return 'Área Desconocida';

        const keys = Object.keys(properties);

        // Priority 1: explicitly 'nombre', 'nom', 'nom_col', 'colonia', 'localidad'
        const nameKey = keys.find(k =>
            ['nombre', 'nom', 'nom_col', 'colonia', 'localidad'].some(term => k.toLowerCase().includes(term))
        );

        if (nameKey) {
            return String(properties[nameKey]);
        }

        // Priority 2: Return the first property value we can find
        const firstProp = properties[keys[0]];
        return String(firstProp);
    };

    const toggleZone = (zoneId: string) => {
        setSelectedZones(prev => {
            if (prev.includes(zoneId)) return prev.filter(id => id !== zoneId);
            return [...prev, zoneId];
        });
    };

    const removeAccents = (str: string) => {
        return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    };

    // GeoJSON Feature Filter Function based on Supervisor's Tenant Scope
    const geoJsonFilter = (feature: any) => {
        if (user?.role === 'superadmin') return true;
        if (!tenantConfig || !tenantConfig.geographic_scope) return true;

        if (!feature || !feature.properties || Object.keys(feature.properties).length === 0) {
            return true;
        }

        const normalizedSearch = removeAccents(tenantConfig.geographic_scope.toLowerCase());
        const props = feature.properties;
        const position = tenantConfig.position?.toLowerCase() || '';
        const electionType = tenantConfig.election_type?.toLowerCase() || '';

        // 0. Strict Tactical Assignment Override (If the supervisor themselves is restricted to a specific zone)
        const assigned = user?.assigned_territory;
        if (assigned && assigned.zone_ids && assigned.zone_ids.length > 0) {
            const currentLayer = availableLayers.find(l => l.id === activeLayerId);
            if (currentLayer && currentLayer.layer_type.toLowerCase() === assigned.layer_type.toLowerCase()) {
                const featureId = getFeatureId(props);
                if (featureId) {
                    if (!assigned.zone_ids.includes(featureId)) {
                        return false;
                    } else {
                        return true;
                    }
                }
            }
        }

        // 1. Gubernamental / Senado
        if (position === 'gobernador' || position === 'senador' || position === 'gobernatura' || position === 'senaduria') {
            return true;
        }

        const munKey = Object.keys(props).find(k => ['municipio', 'cve_mun', 'mun'].includes(k.toLowerCase()));
        const featureMunId = munKey ? parseInt(props[munKey], 10) : null;

        // 2. Diputados
        if (position.includes('diputado') || position.includes('diputacion')) {
            const match = normalizedSearch.match(/\d+/);
            const districtNumber = match ? match[0] : null;

            if (districtNumber) {
                if (electionType === 'federal' && Object.keys(props).find(k => k.toLowerCase() === 'distrito_f')) {
                    const dfKey = Object.keys(props).find(k => k.toLowerCase() === 'distrito_f');
                    return parseInt(props[dfKey!], 10) === parseInt(districtNumber, 10);
                }
                if (electionType === 'local' && Object.keys(props).find(k => k.toLowerCase() === 'distrito_l')) {
                    const dlKey = Object.keys(props).find(k => k.toLowerCase() === 'distrito_l');
                    return parseInt(props[dlKey!], 10) === parseInt(districtNumber, 10);
                }

                const districtMap = electionType === 'federal' ? CHIAPAS_DISTRITOS_FEDERALES : CHIAPAS_DISTRITOS_LOCALES;
                const validMunicipalities = (districtMap as any)[districtNumber] || [];

                if (featureMunId) {
                    return validMunicipalities.includes(featureMunId);
                }
            }
        }

        // 3. Presidente Municipal
        if (position.includes('presidente municipal') || position.includes('presidencia_municipal')) {
            const targetMunId = (CHIAPAS_MUNICIPIOS as any)[normalizedSearch];
            if (targetMunId && featureMunId) {
                return featureMunId === targetMunId;
            }
            if (featureMunId) {
                return false;
            }
        }

        // 4. Strict Fallback
        const propsString = removeAccents(JSON.stringify(feature.properties).toLowerCase());
        return propsString.includes(normalizedSearch);
    };

    const handleSave = async () => {
        if (!user || selectedZones.length === 0) return;

        const territoryPayload = {
            layer_type: layerType,
            zone_ids: selectedZones
        };

        const targetsPayload = selectedZones.map(id => ({
            zone_id: id,
            target: zoneTargets[id] || 0
        }));

        try {
            const { error } = await supabase
                .from('users')
                .update({
                    assigned_territory: territoryPayload,
                    assigned_targets: targetsPayload
                })
                .eq('id', targetUser.id);

            if (error) throw error;

            // Success
            onClose();
            // Force a reload of the parent lists here (or assume user refreshes/handles it)
            alert("¡Despliegue Táctico y Metas Confirmadas!");
        } catch (err: any) {
            alert('Error al guardar el despliegue: ' + err.message);
        }
    };

    const getPolyStyle = (feature: any) => {
        const zoneId = getFeatureId(feature.properties);
        const isSelected = zoneId && selectedZones.includes(zoneId);

        return {
            fillColor: isSelected ? '#FF3366' : '#00D4FF',
            weight: isSelected ? 3 : 1,
            opacity: 1,
            color: isSelected ? '#FF3366' : '#00D4FF',
            fillOpacity: isSelected ? 0.6 : 0.1
        };
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(5, 8, 15, 0.95)',
            zIndex: 9999, display: 'flex', flexDirection: 'column',
            padding: '2rem'
        }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <div>
                    <h2 style={{ fontFamily: 'Oswald, sans-serif', color: 'var(--tertiary)', margin: 0, fontSize: '1.8rem', textTransform: 'uppercase' }}>
                        <span style={{ color: 'var(--accent)' }}>//</span> DESPLIEGUE TÁCTICO
                    </h2>
                    <p style={{ color: '#888', margin: 0, letterSpacing: '0.05em' }}>
                        Asignando jurisdicción para: <strong style={{ color: 'var(--text-color)' }}>{targetUser.name}</strong> ({targetUser.role})
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                    {availableLayers.length > 0 && (
                        <select
                            className="squishy-input"
                            style={{ padding: '0.5rem', backgroundColor: '#0F1218', color: 'var(--primary)', border: '1px solid var(--primary)', margin: 0 }}
                            value={activeLayerId}
                            onChange={handleLayerChange}
                        >
                            {availableLayers.map(l => (
                                <option key={l.id} value={l.id}>{l.layer_type.toUpperCase()}</option>
                            ))}
                        </select>
                    )}
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                        <X size={32} />
                    </button>
                </div>
            </div>

            <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '2px solid var(--tertiary)', boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)', position: 'relative' }}>
                {loading || !geoJsonData ? (
                    <div className="flex-center" style={{ height: '100%', background: 'rgba(0,0,0,0.5)' }}>
                        <h3 style={{ color: 'var(--tertiary)', fontFamily: 'Oswald', animation: 'pulse 1.5s infinite' }}>CARGANDO CARTOGRAFÍA...</h3>
                    </div>
                ) : (
                    <MapContainer center={[16.7569, -93.1292]} zoom={12} style={{ height: '100%', width: '100%', backgroundColor: '#0F1218' }}>
                        <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />

                        <GeoJSON
                            key={activeLayerId + selectedZones.length}
                            data={geoJsonData}
                            style={getPolyStyle}
                            filter={geoJsonFilter}
                            onEachFeature={(feature, layer) => {
                                const zoneId = getFeatureId(feature.properties);
                                if (!zoneId) return;

                                const displayName = getFeatureName(feature.properties);

                                layer.bindTooltip(`<span style="font-family: Oswald; font-size: 1.1rem; text-transform: uppercase;">${layerType}: ${displayName}</span>`, { sticky: true });

                                layer.on({
                                    click: () => toggleZone(zoneId)
                                });
                            }}
                        />
                    </MapContainer>
                )}
            </div>

            <div style={{
                marginTop: '1rem',
                backgroundColor: 'rgba(255,255,255,0.05)',
                padding: '1rem',
                borderRadius: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem'
            }}>
                {selectedZones.length > 0 && (
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>
                        <h4 style={{ fontFamily: 'Oswald', color: 'var(--primary)', margin: '0 0 0.5rem 0' }}>DEFINICIÓN DE METAS POR ZONA</h4>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                            {selectedZones.map(id => (
                                <div key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem', borderRadius: '4px' }}>
                                    <span style={{ fontSize: '0.8rem', color: '#888', flex: 1 }}>{layerType.toUpperCase()} {id}:</span>
                                    <input
                                        type="number"
                                        placeholder="Meta"
                                        className="squishy-input"
                                        style={{ width: '80px', margin: 0, padding: '0.2rem 0.5rem', fontSize: '0.9rem' }}
                                        value={zoneTargets[id] || ''}
                                        onChange={(e) => setZoneTargets(prev => ({ ...prev, [id]: parseInt(e.target.value) || 0 }))}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <span style={{ color: '#888', fontSize: '0.9rem' }}>POLÍGONOS SELECCIONADOS:</span>
                        <span style={{ marginLeft: '1rem', fontFamily: 'Oswald', fontSize: '1.2rem', color: 'var(--primary)', fontWeight: 'bold' }}>{selectedZones.length}</span>
                    </div>
                    <button
                        className="squishy-btn primary"
                        style={{ padding: '0.8rem 2rem', fontSize: '1.1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                        onClick={handleSave}
                        disabled={selectedZones.length === 0}
                    >
                        <Map size={20} /> CONFIRMAR DESPLIEGUE
                    </button>
                </div>
            </div>
        </div>
    );
};
