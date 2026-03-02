import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { AlertCircle, Camera, Upload, ShieldAlert, Zap } from 'lucide-react';

export const DiaDDashboard = () => {
    const { user } = useAuth();
    const [reports, setReports] = useState<any[]>([]);
    const [targets, setTargets] = useState<any[]>([]);
    const [newReport, setNewReport] = useState('');
    const [casillaId, setCasillaId] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isPanicActive, setIsPanicActive] = useState(false);
    const [evidenceFile, setEvidenceFile] = useState<File | null>(null);

    useEffect(() => {
        if (!user?.tenant_id) return;

        // Initial load
        const loadReports = async () => {
            const { data } = await supabase
                .from('d_day_reports')
                .select('*')
                .eq('tenant_id', user.tenant_id)
                .order('timestamp', { ascending: false })
                .limit(50);

            if (data) setReports(data);
        };

        const loadTargets = async () => {
            const { data } = await supabase
                .from('d_day_targets')
                .select('*')
                .eq('tenant_id', user.tenant_id)
                .order('current_votes', { ascending: false });
            if (data) setTargets(data);
        };

        loadReports();
        loadTargets();

        // Subscribe to Realtime inserts
        const reportSub = supabase
            .channel('d_day_reports_realtime')
            .on(
                'postgres_changes',
                { event: 'INSERT', schema: 'public', table: 'd_day_reports', filter: `tenant_id=eq.${user.tenant_id}` },
                (payload) => {
                    setReports((current) => [payload.new, ...current].slice(0, 50));
                }
            )
            .subscribe();

        const targetSub = supabase
            .channel('d_day_targets_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'd_day_targets', filter: `tenant_id=eq.${user.tenant_id}` },
                () => loadTargets()
            )
            .subscribe();

        return () => {
            supabase.removeChannel(reportSub);
            supabase.removeChannel(targetSub);
        };
    }, [user?.tenant_id]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!casillaId || !newReport) return;

        setIsSubmitting(true);
        try {
            const selectedTarget = targets.find(t => t.id === casillaId);
            await supabase.from('d_day_reports').insert({
                tenant_id: user?.tenant_id,
                casilla_id: selectedTarget?.casilla_id || 'GENERAL',
                target_id: selectedTarget?.id,
                report_text: newReport,
                reporter_id: user?.id
            });

            setNewReport('');
            setCasillaId('');
            setEvidenceFile(null);
            // Optional: Show success toast
        } catch (error) {
            console.error('Error submitting report:', error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handlePanic = async () => {
        setIsSubmitting(true);
        try {
            await supabase.from('d_day_reports').insert({
                tenant_id: user?.tenant_id,
                casilla_id: "ALERTA ROJA",
                report_text: "🚨BOTÓN DE PÁNICO ACTIVADO🚨 - INCIDENTE CRÍTICO EN PROGRESO",
                reporter_id: user?.id
            });
            setIsPanicActive(true);
            setTimeout(() => setIsPanicActive(false), 5000); // 5 sec parpadeo
        } catch (error) {
            console.error(error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="flex-col gap-2" style={{
            animation: isPanicActive ? 'red-panic-flash 0.5s infinite' : 'none',
            paddingBottom: '5rem'
        }}>
            <style>{`
                @keyframes red-panic-flash {
                    0% { background-color: transparent; }
                    50% { background-color: rgba(255, 0, 0, 0.2); }
                    100% { background-color: transparent; }
                }
            `}</style>

            {/* 1. BOTÓN DE PÁNICO (EXTREMO) */}
            <div className="tactile-card" style={{ border: '3px solid #ff0000', backgroundColor: 'rgba(255,0,0,0.1)', boxShadow: '0 0 20px rgba(255,0,0,0.5)' }}>
                <button
                    onClick={handlePanic}
                    disabled={isSubmitting}
                    className="squishy-btn primary"
                    style={{
                        width: '100%', padding: '1.5rem', fontSize: '1.5rem',
                        backgroundColor: '#ff0000', color: 'white', fontWeight: 'bold',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem',
                        border: 'none'
                    }}
                >
                    <ShieldAlert size={32} /> BOTÓN DE PÁNICO
                </button>
            </div>

            {/* 2. BOSS FIGHTS (CASILLAS) */}
            <div className="tactile-card" style={{ border: '1px solid var(--tertiary)' }}>
                <h2 style={{ fontFamily: 'Oswald', color: 'var(--tertiary)', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Zap size={20} /> OBJETIVOS TÁCTICOS (BOSS FIGHTS)
                </h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    {targets.map(target => {
                        const progress = Math.min((target.current_votes / target.target_votes) * 100, 100);
                        const isConquered = target.status === 'conquistada';

                        return (
                            <div key={target.id} style={{ backgroundColor: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', borderLeft: `4px solid ${isConquered ? '#10B981' : 'var(--primary)'}` }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontFamily: 'Oswald', color: 'white', fontSize: '1.1rem' }}>CASILLA {target.casilla_id}</span>
                                    <span style={{ fontFamily: 'Oswald', color: isConquered ? '#10B981' : 'var(--primary)' }}>
                                        {isConquered ? 'CONQUISTADA' : 'EN COMBATE'}
                                    </span>
                                </div>
                                <div style={{ height: '12px', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: '6px', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        width: `${progress}%`,
                                        background: isConquered ? 'linear-gradient(90deg, #10B981, #059669)' : 'linear-gradient(90deg, #ff5a36, #ff1a1a)',
                                        boxShadow: progress > 0 ? '0 0 10px rgba(255,90,54,0.3)' : 'none'
                                    }} />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem', fontSize: '0.8rem', color: '#94A3B8' }}>
                                    <span>Daño: {target.current_votes} v.</span>
                                    <span>HP: {target.target_votes} v.</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* 3. REPORTE TÁCTICO INMEDIATO */}
            <div className="tactile-card" style={{ border: '1px solid var(--primary)', background: 'linear-gradient(to bottom right, rgba(255,90,54,0.1), rgba(15,18,24,0.9))' }}>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--primary)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em', margin: 0 }}>
                    <AlertCircle style={{ filter: 'drop-shadow(0 0 5px var(--primary))' }} /> NUEVO ATAQUE / REPORTE
                </h2>
                <form onSubmit={handleSubmit} className="flex-col gap-1" style={{ marginTop: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginTop: '1rem' }}>
                        <select
                            className="squishy-input"
                            value={casillaId}
                            onChange={(e) => setCasillaId(e.target.value)}
                            style={{ fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em' }}
                            required
                        >
                            <option value="">[ SELECCIONAR OBJETIVO ]</option>
                            {targets.map(t => (
                                <option key={t.id} value={t.id}>{t.casilla_id}</option>
                            ))}
                        </select>
                        <label className="squishy-btn secondary" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', border: '1px solid var(--tertiary)', cursor: 'pointer', margin: 0, padding: '0.6rem 1rem' }}>
                            <input
                                type="file"
                                accept="image/*,video/*"
                                style={{ display: 'none' }}
                                onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)}
                            />
                            <Camera size={20} style={{ color: 'var(--tertiary)' }} />
                            <span style={{ color: 'var(--tertiary)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.05em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '150px' }}>
                                {evidenceFile ? evidenceFile.name : 'ADJUNTAR EVIDENCIA'}
                            </span>
                        </label>
                    </div>
                    <input
                        type="text"
                        className="squishy-input"
                        placeholder="[ REPORTE DE INCIDENCIA O FLUJO ]"
                        value={newReport}
                        onChange={(e) => setNewReport(e.target.value)}
                        required
                    />
                    <button
                        type="submit"
                        className="squishy-btn primary"
                        disabled={isSubmitting}
                        style={{ marginTop: '0.5rem', width: '100%', fontSize: '1.2rem', boxShadow: '0 0 15px rgba(255,90,54,0.4)', textShadow: '0 0 5px rgba(255,255,255,0.5)' }}
                    >
                        {isSubmitting ? 'ENCRIPTANDO TRANSMISIÓN...' : (
                            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                                <Upload size={20} /> TRANSMITIR AL CUARTEL GENERAL
                            </div>
                        )}
                    </button>
                </form>
            </div>

            {/* War Room Feed */}
            <div className="tactile-card flex-col gap-1" style={{ border: '1px solid var(--tertiary)', background: 'rgba(0,0,0,0.4)' }}>
                <h2 style={{ fontFamily: 'Oswald, sans-serif', color: 'var(--text-color)', margin: 0, letterSpacing: '0.1em', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span style={{ color: 'var(--tertiary)' }}>//</span> LIVE FEED (WAR ROOM)
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--primary)', animation: 'pulse 1s infinite', marginLeft: 'auto' }}></div>
                </h2>
                {reports.length === 0 ? (
                    <div style={{ padding: '3rem 1rem', textAlign: 'center', color: '#64748B', border: '1px dashed rgba(255,255,255,0.2)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.1em' }}>
                        &lt; SIN TRANSMISIONES RECIENTES &gt;
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '500px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                        {reports.map((report) => (
                            <div
                                key={report.id}
                                style={{
                                    padding: '1rem',
                                    backgroundColor: 'rgba(30, 35, 46, 0.8)',
                                    border: '1px solid rgba(0, 212, 255, 0.2)',
                                    borderRadius: '8px',
                                    borderLeft: '4px solid var(--primary)',
                                    boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
                                }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem' }}>
                                    <strong style={{ fontSize: '1.2rem', fontFamily: 'Oswald, sans-serif', color: 'var(--primary)', letterSpacing: '0.05em' }}>OBJETIVO: {report.casilla_id}</strong>
                                    <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontFamily: 'Inter, monospace' }}>
                                        [{new Date(report.timestamp).toLocaleTimeString()}]
                                    </span>
                                </div>
                                <p style={{ margin: 0, color: 'var(--text-color)', fontFamily: 'Inter, sans-serif', fontSize: '0.95rem', lineHeight: '1.5' }}>{report.report_text}</p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};
