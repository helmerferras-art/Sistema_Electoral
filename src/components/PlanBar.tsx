import { useState } from 'react';
import { FlaskConical, LogOut, Repeat, Sparkles } from 'lucide-react';
import { DEMO_ROLES, FREE_LEGEND, endDemo, switchDemoRole, useDemoHeartbeat, type MyPlan } from '../lib/demo';

/**
 * Franja superior según el plan de la campaña:
 *  - Demo privada: aviso de borrado, cambio de perfil y salir (borra todo).
 *  - Plan Arranque (gratis): leyenda legal y acceso a cotización.
 */
export const PlanBar = ({ plan, role }: { plan: MyPlan | null; role?: string }) => {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useDemoHeartbeat(!!plan?.sandbox);
    if (!plan) return null;

    const bar: React.CSSProperties = {
        background: 'linear-gradient(90deg, #16324F 0%, #1f4469 100%)', color: '#F3C9AE',
        padding: '0.5rem 0.8rem', fontSize: '0.8rem', display: 'flex', flexWrap: 'wrap',
        alignItems: 'center', justifyContent: 'center', gap: '0.5rem 0.9rem', borderBottom: '2px solid #E8743B',
    };
    const btn: React.CSSProperties = {
        background: '#E8743B', color: '#fff', border: 'none', borderRadius: 999, padding: '0.35rem 0.8rem',
        fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
    };

    if (plan.sandbox) {
        return (
            <div style={bar} role="status">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <FlaskConical size={15} /> <strong style={{ color: '#fff' }}>Demo privada</strong> · datos ficticios. Lo que agregues se borra al salir o tras 30 min sin uso.
                </span>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Repeat size={14} />
                    <select
                        aria-label="Ver la demo como"
                        disabled={busy}
                        value={role}
                        onChange={async e => {
                            setBusy(true); setError('');
                            try { await switchDemoRole(e.target.value); } catch (err: any) { setError(err.message); setBusy(false); }
                        }}
                        style={{ background: '#0F1218', color: '#fff', border: '1px solid #E8743B', borderRadius: 8, padding: '0.25rem 0.4rem', fontSize: '0.78rem' }}
                    >
                        {DEMO_ROLES.map(r => <option key={r.role} value={r.role}>Ver como: {r.label}</option>)}
                    </select>
                </label>
                <button style={btn} disabled={busy} onClick={async () => { setBusy(true); await endDemo(); }}>
                    <LogOut size={14} /> Salir y borrar
                </button>
                {error && <span style={{ color: '#fca5a5', width: '100%', textAlign: 'center' }}>{error}</span>}
            </div>
        );
    }

    if (plan.plan === 'arranque') {
        return (
            <div style={bar}>
                <span><Sparkles size={14} style={{ verticalAlign: '-2px' }} /> <strong style={{ color: '#fff' }}>Plan Arranque</strong> · {FREE_LEGEND}</span>
                <a href="/cotizacion" style={{ ...btn, textDecoration: 'none' }}>Solicitar cotización</a>
            </div>
        );
    }
    return null;
};

export default PlanBar;
