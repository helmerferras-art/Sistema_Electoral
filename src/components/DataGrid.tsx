import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getOfflineSupporters } from '../lib/indexedDB';
import { saveAs } from 'file-saver';

export const DataGrid = () => {
    const [supporters, setSupporters] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            // Load from Supabase
            const { data: onlineData } = await supabase
                .from('supporters')
                .select('*')
                .order('created_at', { ascending: false });

            let allData = onlineData || [];

            // Load offline data
            const offlineData = await getOfflineSupporters();
            const offlineTagged = offlineData.map((s: any) => ({ ...s, isOffline: true }));

            // Merge showing offline first if desired or just append
            setSupporters([...offlineTagged, ...allData]);
        } catch (error) {
            console.error('Error loading CRM data:', error);
        } finally {
            setLoading(false);
        }
    };

    const exportCSV = () => {
        if (supporters.length === 0) return;

        // Define CSV headers
        const headers = ['Nombre', 'Teléfono', 'CURP', 'Compromiso', 'Latitud', 'Longitud', 'Estado'];

        // Map data to rows
        const rows = supporters.map(s => [
            `"${s.name || ''}"`,
            `"${s.phone || ''}"`,
            `"${s.curp || ''}"`,
            s.commitment_level || 1,
            s.latitude || '',
            s.longitude || '',
            s.isOffline ? 'Offline' : 'Sincronizado'
        ]);

        const csvContent = [
            headers.join(','),
            ...rows.map(r => r.join(','))
        ].join('\n');

        const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
        saveAs(blob, `simpatizantes_${new Date().toISOString().split('T')[0]}.csv`);
    };

    // Very simple inline styles for the table to match tactile aesthetic
    return (
        <div className="tactile-card flex-col gap-1" style={{ padding: '1rem', overflowX: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2>Directorio (CRM)</h2>
                <button
                    className="squishy-btn accent"
                    style={{ padding: '0.5rem 1rem', fontSize: '1rem' }}
                    onClick={exportCSV}
                >
                    📥 Exportar CSV
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center' }}>Cargando datos...</div>
            ) : (
                <div style={{ overflowX: 'auto', border: '4px solid var(--shadow-color)', borderRadius: '16px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                        <thead style={{ backgroundColor: 'var(--secondary)', color: 'white' }}>
                            <tr>
                                <th style={{ padding: '1rem', borderBottom: '4px solid var(--shadow-color)' }}>Nombre</th>
                                <th style={{ padding: '1rem', borderBottom: '4px solid var(--shadow-color)' }}>Teléfono</th>
                                <th style={{ padding: '1rem', borderBottom: '4px solid var(--shadow-color)' }}>Compromiso</th>
                                <th style={{ padding: '1rem', borderBottom: '4px solid var(--shadow-color)' }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {supporters.length === 0 ? (
                                <tr>
                                    <td colSpan={4} style={{ padding: '2rem', textAlign: 'center' }}>No hay registros aún.</td>
                                </tr>
                            ) : (
                                supporters.map((s, i) => (
                                    <tr key={s.id || s.offline_id} style={{ backgroundColor: i % 2 === 0 ? 'var(--surface)' : 'rgba(0,0,0,0.03)' }}>
                                        <td style={{ padding: '1rem', fontWeight: 'bold' }}>{s.name}</td>
                                        <td style={{ padding: '1rem' }}>{s.phone || '-'}</td>
                                        <td style={{ padding: '1rem', color: 'var(--primary)' }}>{'⭐'.repeat(s.commitment_level || 1)}</td>
                                        <td style={{ padding: '1rem' }}>
                                            {s.isOffline ? (
                                                <span className="tactile-badge" style={{ backgroundColor: '#FF6B6B', color: 'white', fontSize: '0.75rem' }}>Offline</span>
                                            ) : (
                                                <span className="tactile-badge" style={{ backgroundColor: 'var(--bg-color)', fontSize: '0.75rem' }}>Sync</span>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
