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
    const [searchTerm, setSearchTerm] = useState<string>('');

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

        // Mapas de Cabeceras para Chiapas
        const cabecerasLocales: Record<string, string> = {
            "1": "Tuxtla Gutiérrez Ote", "2": "Tuxtla Gutiérrez Pte", "3": "Chiapa de Corzo", "4": "Yajalón",
            "5": "San Cristóbal", "6": "Comitán", "7": "Ocosingo", "8": "Simojovel",
            "9": "Palenque", "10": "Frontera Comalapa", "11": "Bochil", "12": "Pichucalco",
            "13": "Tuxtla Chico", "14": "Cintalapa", "15": "Tonalá", "16": "Huixtla",
            "17": "Motozintla", "18": "Tapachula Nte", "19": "Tapachula Sur", "20": "Las Margaritas",
            "21": "Tenejapa", "22": "Chamula", "23": "Villaflores", "24": "Cacahoatán"
        };

        const cabecerasFederales: Record<string, string> = {
            "1": "Palenque", "2": "Bochil", "3": "Ocosingo", "4": "Pichucalco",
            "5": "San Cristóbal", "6": "Tuxtla Gutiérrez Pte", "7": "Tonalá", "8": "Comitán de Domínguez",
            "9": "Tuxtla Gutiérrez Ote", "10": "Villaflores", "11": "Las Margaritas", "12": "Tapachula", "13": "Huehuetán"
        };

        if (properties.distrito_l || properties.distrito || properties.ID_DISTRIT) {
            const dId = (properties.distrito_l || properties.distrito || properties.ID_DISTRIT).toString();
            const cabecera = cabecerasLocales[dId];
            if (cabecera) return `Distrito ${dId} - ${cabecera}`;
        }

        if (properties.distrito_f) {
            const dId = properties.distrito_f.toString();
            const cabecera = cabecerasFederales[dId];
            if (cabecera) return `Distrito Fed. ${dId} - ${cabecera}`;
        }

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

        // 0. Strict Tactical Assignment Override (Cascade Inheritance)
        const assigned = user?.assigned_territory;
        if (assigned && assigned.zone_ids && assigned.zone_ids.length > 0) {
            const currentLayer = availableLayers.find(l => l.id === activeLayerId);
            const superiorLayerType = assigned.layer_type.toLowerCase();
            const activeType = currentLayer?.layer_type.toLowerCase();
            const featureId = getFeatureId(props);

            // If same level, must be in the list
            if (activeType === superiorLayerType) {
                return assigned.zone_ids.includes(featureId);
            }

            // CASCADE LOGIC: If superior has larger area (e.g. Municipio) and we are assigning smaller (e.g. Seccion)
            if (superiorLayerType === 'municipio' && activeType === 'seccion') {
                const munKey = Object.keys(props).find(k => ['municipio', 'cve_mun', 'mun'].includes(k.toLowerCase()));
                const featureMunId = munKey ? String(props[munKey]) : null;
                return featureMunId && assigned.zone_ids.includes(featureMunId);
            }

            // If superior has specific sections, and we are assigning those same sections or sub-zones
            if (superiorLayerType === 'seccion') {
                // If we are still in section layer, must be one of the superior's sections
                if (activeType === 'seccion') {
                    return assigned.zone_ids.includes(featureId);
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

            <div style={{ display: 'flex', flex: 1, gap: '1rem', minHeight: 0 }}>
                {/* List Panel */}
                <div style={{
                    width: '300px',
                    display: 'flex',
                    flexDirection: 'column',
                    background: 'rgba(15, 18, 24, 0.8)',
                    borderRadius: '8px',
                    border: '1px solid rgba(255,255,255,0.1)',
                    padding: '1rem'
                }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <input
                            type="text"
                            placeholder="Buscar sección o nombre..."
                            className="squishy-input"
                            style={{ margin: 0, width: '100%', fontSize: '0.9rem' }}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }} className="custom-scrollbar">
                        {loading ? (
                            <p style={{ color: '#64748B', textAlign: 'center' }}>Cargando...</p>
                        ) : geoJsonData?.features?.filter(geoJsonFilter).length === 0 ? (
                            <p style={{ color: '#64748B', textAlign: 'center' }}>No se encontraron zonas.</p>
                        ) : (
                            geoJsonData?.features
                                ?.filter(geoJsonFilter)
                                .filter((f: any) => {
                                    if (!searchTerm) return true;
                                    const id = getFeatureId(f.properties) || '';
                                    const name = getFeatureName(f.properties).toLowerCase();
                                    const s = searchTerm.toLowerCase();
                                    return id.includes(s) || name.includes(s);
                                })
                                .sort((a: any, b: any) => {
                                    const idA = getFeatureId(a.properties) || '';
                                    const idB = getFeatureId(b.properties) || '';
                                    return idA.localeCompare(idB, undefined, { numeric: true });
                                })
                                .map((feature: any) => {
                                    const zoneId = getFeatureId(feature.properties);
                                    if (!zoneId) return null;
                                    const isSelected = selectedZones.includes(zoneId);
                                    const name = getFeatureName(feature.properties);

                                    return (
                                        <div
                                            key={zoneId}
                                            onClick={() => toggleZone(zoneId)}
                                            style={{
                                                padding: '0.8rem',
                                                marginBottom: '0.5rem',
                                                borderRadius: '6px',
                                                cursor: 'pointer',
                                                background: isSelected ? 'rgba(255, 51, 102, 0.2)' : 'rgba(255,255,255,0.03)',
                                                border: `1px solid ${isSelected ? '#FF3366' : 'rgba(255,255,255,0.1)'}`,
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center'
                                            }}
                                            className="hover-card"
                                        >
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: isSelected ? 'white' : 'var(--tertiary)' }}>
                                                    {layerType.toUpperCase()} {zoneId}
                                                </span>
                                                <span style={{ fontSize: '0.7rem', color: '#888' }}>{name}</span>
                                            </div>
                                            {isSelected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#FF3366', boxShadow: '0 0 8px #FF3366' }} />}
                                        </div>
                                    );
                                })
                        )}
                    </div>
                </div>

                {/* Map Panel */}
                <div style={{ flex: 1, borderRadius: '8px', overflow: 'hidden', border: '2px solid var(--tertiary)', boxShadow: '0 0 20px rgba(0, 212, 255, 0.2)', position: 'relative' }}>
                    {loading || !geoJsonData ? (
                        <div className="flex-center" style={{ height: '100%', background: 'rgba(0,0,0,0.5)' }}>
                            <div className="spin" style={{ width: '40px', height: '40px', border: '4px solid var(--primary)', borderTopColor: 'transparent', borderRadius: '50%' }} />
                        </div>
                    ) : (
                        <MapContainer
                            center={[16.75, -93.1]}
                            zoom={8}
                            style={{ height: '100%', width: '100%', background: '#05080f' }}
                            attributionControl={false}
                        >
                            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
                            <GeoJSON
                                key={`${activeLayerId}-${selectedZones.length}`}
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
