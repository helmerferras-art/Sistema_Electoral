import { useEffect, useState } from 'react';
import { MessageSquare, Smartphone, CheckCircle2, AlertTriangle, Download, BatteryWarning, Plus, Copy, Usb } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { disableGateway, enableGateway, fixBattery, gatewayAvailable, subscribeGateway, type GatewayState } from '../lib/phoneGateway';

const useGateway = () => {
    const [s, setS] = useState<GatewayState | null>(null);
    useEffect(() => subscribeGateway(setS), []);
    return s;
};

const OWNER_ROLES = ['superadmin', 'candidato', 'coordinador_campana'];

/** En "Mi cuenta" (solo en la app Tlatoani Envíos): activar este celular para mandar los mensajes de la campaña. */
export const GatewaySettings = ({ role }: { role?: string }) => {
    const s = useGateway();
    const [can, setCan] = useState(false);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    useEffect(() => { gatewayAvailable().then(setCan); }, []);
    if (!can || !OWNER_ROLES.includes(role || '')) return null;

    const toggle = async () => {
        setBusy(true); setMsg('');
        try {
            if (s?.on) await disableGateway();
            else await enableGateway(`Celular de ${(navigator.userAgent.match(/Android [\d.]+; ([^;)]+)/)?.[1] || 'la campaña').trim()}`);
        } catch (e: any) { setMsg(e.message); }
        setBusy(false);
    };

    return (
        <div className="flex-col gap-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.8rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.95rem' }}>
                <input type="checkbox" checked={!!s?.on} disabled={busy} onChange={toggle} style={{ width: 24, height: 24, accentColor: 'var(--primary)' }} />
                <span><strong>Enviar los mensajes de la campaña desde este celular</strong></span>
            </label>
            <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                Los códigos de acceso salen solos por SMS desde el número de este celular, de día y de noche, aunque cierres la app o apagues la pantalla. Déjalo conectado al cargador y con saldo o paquete de SMS. Si alguien pide su código por WhatsApp, también le llega por SMS y el celular te avisa para mandarlo por WhatsApp con un toque.
            </div>
            {msg && <div style={{ fontSize: '0.82rem', color: '#fca5a5' }}>{msg}</div>}
        </div>
    );
};

/** Franja visible mientras el celular envía (el envío sigue aunque la app se cierre). */
export const GatewayBanner = () => {
    const s = useGateway();
    if (!s?.on) return null;
    return (
        <div style={{ background: 'rgba(0,230,118,0.1)', borderBottom: '1px solid rgba(0,230,118,0.35)', padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <MessageSquare size={15} color="var(--secondary)" />
                <span>Este celular envía los códigos de la campaña, solo y a toda hora · <strong>{s.sent}</strong> enviados{s.failed ? ` · ${s.failed} con error` : ''}</span>
            </div>
            {s.lastError && <div style={{ textAlign: 'center', color: '#fca5a5' }}>Último error: {s.lastError}</div>}
            {!s.batteryOk && (
                <button onClick={fixBattery} className="squishy-btn"
                    style={{ width: '100%', marginTop: '0.4rem', background: '#f59e0b', borderColor: '#f59e0b', color: '#1f1300', fontWeight: 700 }}>
                    <BatteryWarning size={15} /> Permitir que envíe de noche (quitar ahorro de batería)
                </button>
            )}
        </div>
    );
};

/** Alta de un celular dedicado: el tablero da una llave y el script de la PC configura el celular por cable. */
const DedicatedSetup = ({ onDone }: { onDone: () => void }) => {
    const [token, setToken] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState('');
    const [copied, setCopied] = useState(false);

    const create = async () => {
        setBusy(true); setMsg('');
        const { data, error } = await supabase.rpc('fn_gateway_provision', { p_name: 'Celular dedicado', p_phone: null });
        setBusy(false);
        if (error || !data) { setMsg(error?.message || 'No se pudo crear la llave.'); return; }
        setToken((data as { token: string }).token);
        onDone();
    };
    const cmd = token ? `configurar-celular-envios.bat -Llave ${token}` : '';
    const copy = async () => { try { await navigator.clipboard.writeText(cmd); setCopied(true); } catch { /* sin portapapeles */ } };

    if (!token) return (
        <div className="flex-col gap-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.7rem' }}>
            <button onClick={create} disabled={busy} className="squishy-btn" style={{ alignSelf: 'flex-start', display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                <Plus size={15} /> {busy ? 'Creando…' : 'Agregar celular dedicado (sin intervención)'}
            </button>
            <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>
                Un celular con el chip de la campaña que se configura una sola vez por cable desde una PC y queda enviando los códigos solo, sin que nadie abra la app.
            </div>
            {msg && <div style={{ fontSize: '0.82rem', color: '#fca5a5' }}>{msg}</div>}
        </div>
    );

    return (
        <div className="flex-col gap-1" style={{ borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '0.7rem', fontSize: '0.86rem' }}>
            <div style={{ fontWeight: 700, display: 'flex', gap: '0.4rem', alignItems: 'center' }}><Usb size={16} /> Configura el celular desde una PC con Windows</div>
            <ol style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <li>En el celular: activa <em>Opciones de desarrollador</em> (toca 7 veces "Número de compilación") y enciende <em>Depuración por USB</em>.</li>
                <li>Conéctalo a la PC con cable y acepta "¿Permitir depuración por USB?".</li>
                <li>En la PC descarga y descomprime <a href="/descargas/tlatoani-envios-pc.zip" download>el configurador</a>.</li>
                <li>Abre una terminal en esa carpeta y pega este comando:</li>
            </ol>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <code style={{ flex: 1, background: 'rgba(0,0,0,0.35)', padding: '0.45rem', borderRadius: 6, fontSize: '0.72rem', wordBreak: 'break-all' }}>{cmd}</code>
                <button onClick={copy} className="squishy-btn" title="Copiar"><Copy size={15} /> {copied ? 'Copiado' : 'Copiar'}</button>
            </div>
            <div style={{ fontSize: '0.8rem', color: '#f59e0b' }}>
                Esta llave solo se muestra ahora. Quien la tenga puede enviar los mensajes de tu campaña: no la compartas. Si se pierde, da de baja el celular y crea otro.
            </div>
        </div>
    );
};

type GwRow = { bridge_id: string; name: string | null; kind: string; online: boolean; last_seen: string | null; pendientes: number };
const fmtSeen = (t: string | null) => t ? new Date(t).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : 'nunca';

/** Tablero (mando): ¿con qué equipo salen los mensajes de la campaña? Alta y baja de celulares dedicados. */
export const GatewayStatusCard = () => {
    const [rows, setRows] = useState<GwRow[] | null>(null);
    const load = () => { supabase.rpc('fn_gateway_status').then(({ data }) => setRows((data as GwRow[]) || [])); };
    useEffect(() => {
        load();
        const id = window.setInterval(load, 30_000);
        return () => window.clearInterval(id);
    }, []);
    if (!rows) return null;
    const online = rows.find(r => r.online);
    const pending = rows.reduce((a, r) => a + Number(r.pendientes || 0), 0);
    const retire = async (r: GwRow) => {
        if (!window.confirm(`¿Dar de baja "${r.name || r.bridge_id}"? Dejará de enviar los mensajes de la campaña.`)) return;
        await supabase.rpc('fn_gateway_retire', { p_bridge: r.bridge_id });
        load();
    };
    return (
        <div className="tactile-card flex-col gap-1" style={{ marginBottom: '1rem', borderLeft: `4px solid ${online ? 'var(--secondary)' : '#f59e0b'}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700 }}>
                <Smartphone size={18} /> Envío de mensajes de la campaña
            </div>
            {online ? (
                <div style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <CheckCircle2 size={16} color="var(--secondary)" /> Conectado: {online.name || online.bridge_id}{pending ? ` · ${pending} por enviar` : ''}
                </div>
            ) : (
                <>
                    <div style={{ fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangle size={16} color="#f59e0b" />
                        {rows.length ? 'El celular de la campaña no tiene señal.' : 'Tu campaña aún no tiene un celular para enviar los códigos por SMS.'}
                        {pending ? ` Hay ${pending} mensaje(s) esperando.` : ''}
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#94A3B8' }}>
                        Mientras tanto, los códigos salen por el servicio de la plataforma. Usa un celular con el chip de la campaña:
                        configúralo como <strong>celular dedicado</strong> (abajo) o instala <strong>Tlatoani Envíos</strong>, entra con tu cuenta
                        y en <em>Mi cuenta</em> activa "Enviar los mensajes de la campaña desde este celular".
                    </div>
                    <a href="/descargas/tlatoani-envios.apk" className="squishy-btn" style={{ alignSelf: 'flex-start', textDecoration: 'none', display: 'inline-flex', gap: '0.4rem', alignItems: 'center' }}>
                        <Download size={15} /> Descargar Tlatoani Envíos (Android)
                    </a>
                </>
            )}
            {rows.filter(r => r.kind === 'android').length > 0 && (
                <div className="flex-col" style={{ gap: '0.3rem', fontSize: '0.82rem' }}>
                    {rows.filter(r => r.kind === 'android').map(r => (
                        <div key={r.bridge_id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                            <span>
                                <span style={{ color: r.online ? 'var(--secondary)' : '#94A3B8' }}>●</span> {r.name || r.bridge_id}
                                <span style={{ color: '#94A3B8' }}> · última señal {fmtSeen(r.last_seen)}</span>
                            </span>
                            <button onClick={() => retire(r)} className="squishy-btn" style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>Dar de baja</button>
                        </div>
                    ))}
                </div>
            )}
            <DedicatedSetup onDone={load} />
        </div>
    );
};
