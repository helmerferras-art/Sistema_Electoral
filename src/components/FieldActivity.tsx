import { Fragment, useEffect, useRef, useState } from 'react';
import { Camera, Mic, Square, MapPin, Trash2, RefreshCw, CheckCircle, Users, X } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { saveOfflineActivity, getOfflineActivities, type OfflineEvidence } from '../lib/indexedDB';
import { syncOfflineActivities, compressImage } from '../lib/activitySync';
import { getPositionOnce, lastKnownFix, locationErrorText } from '../lib/location';

const ACTIVITY_TYPES = [
    { id: 'casa_por_casa', label: '🏠 Casa por casa' },
    { id: 'crucero', label: '🚦 Crucero' },
    { id: 'parque', label: '🌳 Parque' },
    { id: 'mercado', label: '🛒 Mercado' },
    { id: 'evento', label: '📣 Evento' },
    { id: 'reunion', label: '🤝 Reunión' },
    { id: 'otro', label: '✳️ Otro' },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(ACTIVITY_TYPES.map(t => [t.id, t.label]));
const MAX_PHOTOS = 5;
const MAX_AUDIO_S = 180;
const LEADER_ROLES = ['lider', 'coordinador_territorial', 'coordinador', 'coordinador_campana', 'candidato', 'superadmin'];

type Gps = { lat: number; lng: number; acc: number } | null;
type LocalEvidence = OfflineEvidence & { preview: string };

const Counter = ({ label, value, onChange, max }: { label: string; value: number; onChange: (v: number) => void; max?: number }) => (
    <div className="tactile-card flex-col" style={{ alignItems: 'center', padding: '0.6rem', flex: 1, gap: '0.3rem' }}>
        <span style={{ fontSize: '0.75rem', color: '#9aa', letterSpacing: '0.05em' }}>{label}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button type="button" className="squishy-btn" style={{ padding: '0.3rem 0.8rem' }} onClick={() => onChange(Math.max(0, value - 1))}>−</button>
            <span style={{ fontSize: '1.6rem', fontFamily: 'Oswald, sans-serif', minWidth: '2ch', textAlign: 'center' }}>{value}</span>
            <button type="button" className="squishy-btn primary" style={{ padding: '0.3rem 0.8rem' }} onClick={() => onChange(max !== undefined ? Math.min(max, value + 1) : value + 1)}>+</button>
        </div>
    </div>
);

export const FieldActivity = () => {
    const { user } = useAuth();
    const [activityType, setActivityType] = useState('casa_por_casa');
    const [contacts, setContacts] = useState(0);
    const [convinced, setConvinced] = useState(0);
    const [known, setKnown] = useState(0);
    const [objective, setObjective] = useState<'votos' | 'encuesta' | 'conocimiento'>('votos');
    const [notes, setNotes] = useState('');
    const [consent, setConsent] = useState(false);
    const [gps, setGps] = useState<Gps>(null);
    const [gpsStatus, setGpsStatus] = useState<'espera' | 'buscando' | 'ok' | 'error'>('espera');
    const [gpsError, setGpsError] = useState('');
    const [evidences, setEvidences] = useState<LocalEvidence[]>([]);
    const [recording, setRecording] = useState(false);
    const [recSeconds, setRecSeconds] = useState(0);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [pending, setPending] = useState(0);
    const [recent, setRecent] = useState<any[]>([]);
    const [team, setTeam] = useState<any[]>([]);
    const [viewer, setViewer] = useState<{ activity: any; files: { kind: string; url: string }[] } | null>(null);
    const [weekGoal, setWeekGoal] = useState<any>(null);

    const recorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const recSecondsRef = useRef(0);
    const photoInputRef = useRef<HTMLInputElement>(null);
    const isLeader = LEADER_ROLES.includes(user?.role || '');

    // ─── GPS ──────────────────────────────────────────────
    // El GPS se enciende solo cuando el brigadista empieza a capturar (y se reutiliza la lectura por 2 min),
    // no al abrir la pantalla. Así no gasta batería si solo vino a revisar su avance.
    const locate = async (force = false): Promise<Gps> => {
        setGpsStatus('buscando'); setGpsError('');
        try {
            const f = await getPositionOnce({ maxAgeMs: force ? 0 : 120000, timeoutMs: 15000 });
            const g = { lat: f.lat, lng: f.lng, acc: f.acc };
            setGps(g); setGpsStatus('ok');
            return g;
        } catch (e) {
            setGpsStatus('error'); setGpsError(locationErrorText(e));
            return null;
        }
    };
    const ensureLocation = () => {
        if (gpsStatus === 'espera' || (gpsStatus === 'ok' && !lastKnownFix(120000))) locate();
    };

    // ─── Datos ────────────────────────────────────────────
    const refreshPending = async () => setPending((await getOfflineActivities()).length);

    const loadRecent = async () => {
        if (!user || !navigator.onLine) return;
        const { data } = await supabase
            .from('field_activities')
            .select('id, activity_type, contacts_count, convinced_count, geo_section_id, occurred_at, notes, activity_evidence(count)')
            .eq('user_id', user.id)
            .order('occurred_at', { ascending: false })
            .limit(10);
        if (data) setRecent(data);
        // Meta de esta semana según el calendario de campaña
        const { data: schedule } = await supabase.rpc('fn_goal_schedule', { p_user_id: user.id });
        setWeekGoal((schedule as any[] | null)?.find(w => w.is_current) || null);
        if (isLeader) {
            const { data: summary } = await supabase.rpc('fn_activity_summary', { p_days: 7 });
            if (summary) setTeam(summary);
        }
    };

    useEffect(() => {
        if (user?.tenant_id) {
            supabase.from('goal_settings').select('objective').eq('tenant_id', user.tenant_id).maybeSingle()
                .then(({ data }) => setObjective(((data as any)?.objective) || 'votos'));
        }
        refreshPending();
        loadRecent();
        const onSynced = () => { refreshPending(); loadRecent(); };
        window.addEventListener('field-activities-synced', onSynced);
        return () => {
            window.removeEventListener('field-activities-synced', onSynced);
            if (timerRef.current) clearInterval(timerRef.current);
            recorderRef.current?.stream.getTracks().forEach(t => t.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ─── Fotos ────────────────────────────────────────────
    const onPhotos = async (files: FileList | null) => {
        if (!files) return;
        const room = MAX_PHOTOS - evidences.filter(e => e.kind === 'foto').length;
        const picked = Array.from(files).slice(0, Math.max(0, room));
        const added: LocalEvidence[] = [];
        for (const f of picked) {
            const blob = await compressImage(f);
            added.push({ local_id: crypto.randomUUID(), kind: 'foto', blob, mime_type: 'image/jpeg', preview: URL.createObjectURL(blob) });
        }
        setEvidences(prev => [...prev, ...added]);
        if (photoInputRef.current) photoInputRef.current.value = '';
    };

    // ─── Audio ────────────────────────────────────────────
    const startRecording = async () => {
        if (!consent) { setMessage('⚠️ Antes de grabar, confirma que la persona aceptó ser grabada.'); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
                .find(m => (window as any).MediaRecorder?.isTypeSupported?.(m)) || '';
            const rec = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
            chunksRef.current = [];
            rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
            rec.onstop = () => {
                stream.getTracks().forEach(t => t.stop());
                const type = (rec.mimeType || 'audio/webm').split(';')[0];
                const blob = new Blob(chunksRef.current, { type });
                setEvidences(prev => [...prev, { local_id: crypto.randomUUID(), kind: 'audio', blob, mime_type: type, duration_s: recSecondsRef.current, preview: URL.createObjectURL(blob) }]);
            };
            rec.start();
            recorderRef.current = rec;
            setRecSeconds(0); recSecondsRef.current = 0;
            setRecording(true);
            timerRef.current = setInterval(() => {
                recSecondsRef.current += 1;
                setRecSeconds(recSecondsRef.current);
                if (recSecondsRef.current >= MAX_AUDIO_S) stopRecording();
            }, 1000);
        } catch {
            setMessage('❌ No se pudo usar el micrófono. Revisa los permisos de la app.');
        }
    };
    const stopRecording = () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (recorderRef.current && recorderRef.current.state !== 'inactive') recorderRef.current.stop();
        setRecording(false);
    };

    const removeEvidence = (id: string) => setEvidences(prev => {
        const ev = prev.find(e => e.local_id === id);
        if (ev) URL.revokeObjectURL(ev.preview);
        return prev.filter(e => e.local_id !== id);
    });

    // ─── Guardar ──────────────────────────────────────────
    const save = async () => {
        if (!user) return;
        if (recording) stopRecording();
        if (convinced > contacts) { setMessage('⚠️ Los convencidos no pueden ser más que los contactados.'); return; }
        if (evidences.some(e => e.kind === 'audio') && !consent) { setMessage('⚠️ Falta confirmar el consentimiento para el audio.'); return; }
        setSaving(true);
        try {
            const pos = (gps && lastKnownFix(120000)) ? gps : await locate();
            await saveOfflineActivity({
                offline_id: crypto.randomUUID(),
                tenant_id: user.tenant_id,
                user_id: user.id,
                activity_type: activityType,
                notes: notes.trim(),
                contacts_count: contacts,
                convinced_count: convinced,
                known_count: known,
                latitude: pos?.lat ?? null,
                longitude: pos?.lng ?? null,
                accuracy_m: pos?.acc ?? null,
                consent_confirmed: consent,
                occurred_at: new Date().toISOString(),
                evidences: evidences.map(({ preview, ...ev }) => ev),
            });
            evidences.forEach(e => URL.revokeObjectURL(e.preview));
            setEvidences([]); setContacts(0); setConvinced(0); setKnown(0); setNotes(''); setConsent(false);
            if (navigator.onLine) {
                setMessage('⏳ Subiendo...');
                const r = await syncOfflineActivities();
                setMessage(r.pending === 0 ? '✅ Actividad registrada. ¡El mapa ya la ilumina!' : `💾 Guardada. Quedan ${r.pending} por subir; se reintentará sola.`);
            } else {
                setMessage('📴 Sin señal: guardada en el teléfono. Se subirá sola al recuperar conexión.');
            }
            refreshPending();
            loadRecent();
        } catch (e: any) {
            setMessage(`❌ No se pudo guardar: ${e?.message || e}`);
        } finally {
            setSaving(false);
        }
    };

    const manualSync = async () => {
        setMessage('⏳ Sincronizando...');
        const r = await syncOfflineActivities();
        setMessage(r.pending === 0 ? `✅ Todo arriba (${r.synced} subidas).` : `⚠️ Quedan ${r.pending} pendientes. Revisa tu señal.`);
        refreshPending();
    };

    // ─── Evidencias (vista del mando) ─────────────────────
    const openEvidence = async (activity: any) => {
        const { data: evs } = await supabase.from('activity_evidence').select('kind, storage_path').eq('activity_id', activity.id);
        if (!evs || evs.length === 0) { setViewer({ activity, files: [] }); return; }
        const { data: signed } = await supabase.storage.from('activity_evidence')
            .createSignedUrls(evs.map(e => e.storage_path), 600);
        setViewer({ activity, files: (signed || []).map((s, i) => ({ kind: evs[i].kind, url: s.signedUrl })).filter(f => f.url) });
    };

    const today = recent.filter(r => new Date(r.occurred_at).toDateString() === new Date().toDateString());
    const todayContacts = today.reduce((a, r) => a + r.contacts_count, 0);
    const todayConvinced = today.reduce((a, r) => a + r.convinced_count, 0);
    const photos = evidences.filter(e => e.kind === 'foto');
    const audios = evidences.filter(e => e.kind === 'audio');

    return (
        <div className="flex-col gap-2" style={{ paddingBottom: '2rem' }}>
            <h2 style={{ fontFamily: 'Oswald, sans-serif', letterSpacing: '0.08em', margin: 0 }}>BITÁCORA DE CAMPO</h2>

            {/* Resumen del día */}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
                {[['Actividades hoy', today.length], ['Contactados', todayContacts], [objective === 'votos' ? 'Convencidos' : objective === 'encuesta' ? 'Lo prefieren' : 'Se suman', todayConvinced]].map(([l, v]) => (
                    <div key={l as string} className="tactile-card flex-col" style={{ flex: 1, alignItems: 'center', padding: '0.5rem' }}>
                        <span style={{ fontSize: '1.4rem', fontFamily: 'Oswald, sans-serif', color: 'var(--secondary)' }}>{v}</span>
                        <span style={{ fontSize: '0.7rem', color: '#9aa' }}>{l}</span>
                    </div>
                ))}
            </div>

            {weekGoal && (weekGoal.meta_contactos > 0 || weekGoal.meta_simpatizantes > 0) && (
                <div className="tactile-card" style={{ padding: '0.6rem', borderColor: 'var(--tertiary)' }}>
                    <div style={{ fontSize: '0.78rem', color: '#9aa', marginBottom: '0.3rem' }}>
                        🎯 Tu meta de esta semana{weekGoal.phase ? ` · ${weekGoal.phase}` : ''}
                    </div>
                    {[['Contactos', weekGoal.real_contactos, weekGoal.meta_contactos, 'var(--tertiary)'],
                      ['Simpatizantes', weekGoal.real_simpatizantes, weekGoal.meta_simpatizantes, 'var(--secondary)']].map(([label, real, meta, color]) => {
                        const pct = meta > 0 ? Math.min(100, Math.round((real / meta) * 100)) : 0;
                        return (
                            <div key={label as string} style={{ marginBottom: '0.3rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                                    <span>{label}</span><span>{real} / {meta}</span>
                                </div>
                                <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
                                    <div style={{ width: `${pct}%`, height: '100%', background: color as string, borderRadius: 3 }} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {pending > 0 && (
                <div className="tactile-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderColor: 'var(--primary)', padding: '0.6rem' }}>
                    <span>📴 {pending} actividad(es) esperando señal</span>
                    <button className="squishy-btn" onClick={manualSync} style={{ padding: '0.3rem 0.7rem' }}><RefreshCw size={16} /> Subir</button>
                </div>
            )}

            {/* Formulario */}
            <div className="tactile-card flex-col gap-2" onPointerDownCapture={ensureLocation} onFocusCapture={ensureLocation}>
                <label style={{ fontSize: '0.8rem', color: '#9aa' }}>¿Dónde estás trabajando?</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {ACTIVITY_TYPES.map(t => (
                        <button key={t.id} type="button" className={`squishy-btn ${activityType === t.id ? 'primary' : ''}`}
                            style={{ padding: '0.35rem 0.7rem', fontSize: '0.85rem' }} onClick={() => setActivityType(t.id)}>{t.label}</button>
                    ))}
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Counter label="CONTACTADOS" value={contacts} onChange={(v) => { setContacts(v); if (convinced > v) setConvinced(v); if (known > v) setKnown(v); }} />
                    <Counter label="YA LO CONOCÍAN" value={known} onChange={setKnown} max={contacts} />
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Counter label={objective === 'votos' ? 'CONVENCIDOS' : objective === 'encuesta' ? 'LO PREFIEREN' : 'SE SUMAN'} value={convinced} onChange={setConvinced} max={contacts} />
                </div>
                {objective !== 'votos' && (
                    <div style={{ fontSize: '0.75rem', color: '#bbb', background: 'rgba(255,176,0,0.08)', padding: '0.45rem', borderRadius: 8 }}>
                        ⚖️ Presenta al aspirante y escucha a la gente. No pidas el voto: antes de la precampaña está prohibido.
                    </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                    <MapPin size={18} color={gpsStatus === 'ok' ? 'var(--secondary)' : gpsStatus === 'error' ? 'var(--primary)' : '#9aa'} />
                    {gpsStatus === 'ok' && gps && <span>Ubicación lista (±{gps.acc} m){gps.acc > 100 ? ' — señal débil, intenta al aire libre' : ''}</span>}
                    {gpsStatus === 'espera' && <span>La ubicación se toma al empezar a capturar.</span>}
                    {gpsStatus === 'buscando' && <span>Buscando ubicación...</span>}
                    {gpsStatus === 'error' && <span>{gpsError || 'Sin ubicación. Activa el GPS.'}</span>}
                    <button type="button" className="squishy-btn" style={{ padding: '0.2rem 0.5rem', marginLeft: 'auto' }} onClick={() => locate(true)} aria-label="Actualizar ubicación"><RefreshCw size={14} /></button>
                </div>

                <textarea className="squishy-input" rows={2} maxLength={2000} placeholder="Notas: colonia, calle, qué te dijeron, necesidades..."
                    value={notes} onChange={(e) => setNotes(e.target.value)} />

                {/* Evidencias */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button type="button" className="squishy-btn" style={{ flex: 1 }} disabled={photos.length >= MAX_PHOTOS}
                        onClick={() => photoInputRef.current?.click()}>
                        <Camera size={18} /> Foto ({photos.length}/{MAX_PHOTOS})
                    </button>
                    <input ref={photoInputRef} type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => onPhotos(e.target.files)} />
                    {!recording ? (
                        <button type="button" className="squishy-btn" style={{ flex: 1 }} onClick={startRecording}><Mic size={18} /> Audio</button>
                    ) : (
                        <button type="button" className="squishy-btn primary" style={{ flex: 1 }} onClick={stopRecording}>
                            <Square size={16} /> Detener {Math.floor(recSeconds / 60)}:{String(recSeconds % 60).padStart(2, '0')}
                        </button>
                    )}
                </div>

                <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.88rem', color: '#ccc', cursor: 'pointer' }}>
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ width: 22, height: 22, flex: '0 0 auto', accentColor: 'var(--primary)' }} />
                    Las personas que aparecen en fotos o audios aceptaron ser fotografiadas o grabadas.
                </label>

                {(photos.length > 0 || audios.length > 0) && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                        {photos.map(p => (
                            <div key={p.local_id} style={{ position: 'relative' }}>
                                <img src={p.preview} alt="evidencia" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8 }} />
                                <button type="button" onClick={() => removeEvidence(p.local_id)} aria-label="Quitar foto"
                                    style={{ position: 'absolute', top: -6, right: -6, background: '#000', border: 'none', borderRadius: '50%', color: '#fff', padding: 2 }}><X size={14} /></button>
                            </div>
                        ))}
                        {audios.map(a => (
                            <div key={a.local_id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', width: '100%' }}>
                                <audio controls src={a.preview} style={{ flex: 1, height: 32 }} />
                                <button type="button" className="squishy-btn" style={{ padding: '0.2rem 0.4rem' }} onClick={() => removeEvidence(a.local_id)} aria-label="Quitar audio"><Trash2 size={14} /></button>
                            </div>
                        ))}
                    </div>
                )}

                <button type="button" className="squishy-btn primary" disabled={saving || (contacts === 0 && evidences.length === 0 && !notes.trim())}
                    onClick={save} style={{ padding: '0.8rem', fontSize: '1rem' }}>
                    <CheckCircle size={18} /> {saving ? 'GUARDANDO...' : 'REGISTRAR ACTIVIDAD'}
                </button>
                {message && <div style={{ fontSize: '0.85rem', textAlign: 'center' }}>{message}</div>}
            </div>

            {/* Mis últimas actividades */}
            {recent.length > 0 && (
                <div className="tactile-card flex-col gap-1">
                    <h4 style={{ margin: 0, fontFamily: 'Oswald, sans-serif' }}>LO QUE HE REGISTRADO</h4>
                    {recent.map(r => (
                        <div key={r.id} onClick={() => openEvidence(r)} style={{ fontSize: '0.9rem', padding: '0.5rem 0', borderBottom: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                                <strong>{TYPE_LABEL[r.activity_type] || r.activity_type}{r.geo_section_id ? ` · Secc. ${r.geo_section_id}` : ''}</strong>
                                <span style={{ color: '#9aa', whiteSpace: 'nowrap' }}>{new Date(r.occurred_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</span>
                            </div>
                            <div style={{ color: '#9aa', fontSize: '0.82rem' }}>
                                {r.contacts_count} contactados · {r.convinced_count} convencidos{(r.activity_evidence?.[0]?.count ?? 0) > 0 ? ` · ${r.activity_evidence[0].count} fotos/audios` : ''}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Vista del mando: productividad del equipo */}
            {isLeader && team.length > 0 && (
                <div className="tactile-card flex-col gap-1">
                    <h4 style={{ margin: 0, fontFamily: 'Oswald, sans-serif' }}><Users size={16} /> MI EQUIPO · ÚLTIMOS 7 DÍAS</h4>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr repeat(4, auto)', gap: '0.3rem 0.8rem', fontSize: '0.8rem' }}>
                        <span style={{ color: '#9aa' }}>Nombre</span><span style={{ color: '#9aa' }}>Act.</span><span style={{ color: '#9aa' }}>Contac.</span><span style={{ color: '#9aa' }}>Conv.</span><span style={{ color: '#9aa' }}>Secc.</span>
                        {team.map(t => (
                            <Fragment key={t.user_id}>
                                <span title={t.last_activity_at ? `Última: ${new Date(t.last_activity_at).toLocaleString('es-MX')}` : ''}>{t.name}</span>
                                <span>{t.activities}</span>
                                <span>{t.contacts}</span>
                                <span style={{ color: 'var(--secondary)' }}>{t.convinced}</span>
                                <span>{t.sections}</span>
                            </Fragment>
                        ))}
                    </div>
                </div>
            )}

            {/* Visor de evidencias */}
            {viewer && (
                <div onClick={() => setViewer(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
                    <div className="tactile-card flex-col gap-2" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <strong>{TYPE_LABEL[viewer.activity.activity_type]} · {new Date(viewer.activity.occurred_at).toLocaleString('es-MX')}</strong>
                            <button className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setViewer(null)} aria-label="Cerrar"><X size={16} /></button>
                        </div>
                        {viewer.activity.notes && <p style={{ margin: 0, fontSize: '0.85rem' }}>{viewer.activity.notes}</p>}
                        {viewer.files.length === 0 && <span style={{ color: '#9aa', fontSize: '0.85rem' }}>Sin evidencias.</span>}
                        {viewer.files.map((f, i) => f.kind === 'foto'
                            ? <img key={i} src={f.url} alt="evidencia" style={{ width: '100%', borderRadius: 8 }} />
                            : <audio key={i} controls src={f.url} style={{ width: '100%' }} />)}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FieldActivity;
