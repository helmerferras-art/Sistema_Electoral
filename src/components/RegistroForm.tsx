import { useState, useEffect } from 'react';
import { saveOfflineSupporter, getOfflineSupporters } from '../lib/indexedDB';
import { setupSyncListeners, syncOfflineData } from '../lib/syncService';
import { Trophy, X, User } from 'lucide-react';
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { WhatsAppQR } from './WhatsAppQR';
import { newVerificationToken, getDeviceId, sendVerificationWhatsApp, verificationLink } from '../lib/verification';
import { QRCodeSVG } from 'qrcode.react';
import { getPositionOnce, locationErrorText } from '../lib/location';
import { loadActiveGuion, visibleQuestions, pruneAnswers, type Poll } from '../lib/engagement';
import { TrainingCenter } from './TrainingCenter';
import { logKnock } from './WalkZones';

export const RegistroForm = () => {
    const { user } = useAuth();
    const [formData, setFormData] = useState({
        name: '',
        phone: '',
        seccion: '',
        latitude: null as number | null,
        longitude: null as number | null,
        commitment_level: 3
    });

    const [isSaving, setIsSaving] = useState(false);
    const [offlineCount, setOfflineCount] = useState(0);
    const [statusMessage, setStatusMessage] = useState('');
    const [xpGained, setXpGained] = useState<number | null>(null);
    const [showQR, setShowQR] = useState(false);
    // Crear cuenta de brigadista solo si la persona quiere sumarse al equipo (antes se creaba para todos)
    const [wantsToJoin, setWantsToJoin] = useState(false);
    const [candidateInfo, setCandidateInfo] = useState({ name: 'Candidato', phone: '' });
    const isLoggedIn = !!user;
    // ¿Vive aquí? Sí → la sección sale del GPS. No → se elige su colonia y la sección se deduce del cruce colonia→sección.
    const [livesHere, setLivesHere] = useState(true);
    const [coloniaQuery, setColoniaQuery] = useState('');
    const [coloniaOptions, setColoniaOptions] = useState<{ colonia_id: number; colonia: string; cp: string | null; seccion: number }[]>([]);
    const [colonia, setColonia] = useState<{ colonia_id: number; colonia: string; cp: string | null; seccion: number } | null>(null);
    // Último registro, para validar la visita por WhatsApp
    const [lastRegistered, setLastRegistered] = useState<{ name: string; phone: string; token: string } | null>(null);
    const [validationSent, setValidationSent] = useState(false);
    const [showValidationQR, setShowValidationQR] = useState(false);
    // Guion de visita con encuesta (se guarda en el teléfono para usarse sin señal)
    const [guion, setGuion] = useState<Poll | null>(null);
    const [answers, setAnswers] = useState<Record<string, string>>({});
    const [showScript, setShowScript] = useState(true);
    // La campaña puede exigir la capacitación antes de registrar
    const [trainingBlocked, setTrainingBlocked] = useState(false);

    useEffect(() => {
        if (!user?.tenant_id) return;
        loadActiveGuion(user.tenant_id).then(setGuion).catch(() => setGuion(null));
    }, [user?.tenant_id]);

    const answer = (qid: string, oid: string) => {
        if (!guion) return;
        setAnswers(prev => pruneAnswers(guion, { ...prev, [qid]: oid }));
    };

    useEffect(() => {
        if (livesHere || !isLoggedIn || coloniaQuery.trim().length < 3) { setColoniaOptions(prev => (prev.length ? [] : prev)); return; }
        const t = setTimeout(async () => {
            const { data } = await supabase.from('colonia_secciones')
                .select('colonia_id, colonia, cp, seccion, porcentaje')
                .ilike('colonia', `%${coloniaQuery.trim()}%`)
                .order('porcentaje', { ascending: false })
                .limit(60);
            // Una opción por colonia, con la sección que cubre la mayor parte de ella
            const best = new Map<number, any>();
            (data || []).forEach((r: any) => { if (!best.has(r.colonia_id)) best.set(r.colonia_id, r); });
            setColoniaOptions(Array.from(best.values()).slice(0, 12));
        }, 300);
        return () => clearTimeout(t);
    }, [coloniaQuery, livesHere, isLoggedIn]);

    useEffect(() => {
        setupSyncListeners();
        updateOfflineCount();

        // Public registration: Try to get tenant_id from URL if not logged in
        if (!user) {
            const params = new URLSearchParams(window.location.search);
            const tId = params.get('t');
            if (tId) (window as any)._publicTenantId = tId;
        }

        fetchCandidateInfo();
    }, [user]);

    const fetchCandidateInfo = async () => {
        const tId = user?.tenant_id || (window as any)._publicTenantId;
        if (!tId) return;
        try {
            // RPC pública segura: solo nombre/teléfono del candidato y nombre de la campaña
            const { data } = await supabase.rpc('fn_public_candidate', { p_tenant_id: tId });
            const info = data && data.length > 0 ? data[0] : null;
            if (info) {
                setCandidateInfo({ name: info.name || info.tenant_name || 'Candidato', phone: info.phone || '' });
            }
        } catch (e) {
            console.error("Error fetching candidate info:", e);
        }
    };

    const updateOfflineCount = async () => {
        const supporters = await getOfflineSupporters();
        setOfflineCount(supporters.length);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleGPS = async () => {
        setStatusMessage('Obteniendo ubicación...');
        try {
            const f = await getPositionOnce({ maxAgeMs: 60000, timeoutMs: 15000 });
            setFormData(prev => ({ ...prev, latitude: f.lat, longitude: f.lng }));
            setStatusMessage(`📍 Ubicación capturada (±${f.acc} m)`);
        } catch (err) {
            setStatusMessage(`❌ ${locationErrorText(err)}`);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name || !formData.phone) {
            setStatusMessage('⚠️ Nombre y Teléfono son requeridos');
            return;
        }

        try {
            setIsSaving(true);
            setStatusMessage('Verificando registro...');

            // 1. Verificar duplicados en tiempo real (Proactivo)
            const { data: existingSupporter, error: checkError } = await supabase
                .rpc('fn_supporter_phone_exists', { p_phone: formData.phone, p_tenant_id: null });

            if (checkError) {
                console.error("Error verificando duplicados:", checkError);
            }

            if (existingSupporter) {
                setStatusMessage('⚠️ Este número ya se encuentra registrado');
                setIsSaving(false);
                return;
            }

            setStatusMessage('Guardando...');

            const tenantId = user?.tenant_id || (window as any)._publicTenantId;
            if (user && !livesHere && !colonia && !formData.seccion) {
                setStatusMessage('⚠️ Elige la colonia donde vive la persona');
                setIsSaving(false);
                return;
            }
            const verificationToken = user ? newVerificationToken() : null;

            // Una sola lectura de GPS al guardar si no se capturó antes (la sección "vive aquí" depende de ella)
            let lat = formData.latitude, lng = formData.longitude;
            if (user && lat == null) {
                setStatusMessage('Tomando ubicación...');
                try { const f = await getPositionOnce({ timeoutMs: 10000 }); lat = f.lat; lng = f.lng; }
                catch (err) { console.warn('Registro sin GPS:', locationErrorText(err)); }
                setStatusMessage('Guardando...');
            }

            const surveyAnswers = guion ? pruneAnswers(guion, answers) : {};
            const supporterData = {
                name: formData.name,
                phone: formData.phone,
                // Prioridad: sección que dice la persona > colonia elegida > GPS (lo calcula la base si va vacía)
                section_id: formData.seccion || (!livesHere && colonia ? String(colonia.seccion) : null),
                seccion: formData.seccion || null,
                lives_here: user ? livesHere : null,
                colonia_id: !livesHere && colonia ? colonia.colonia_id : null,
                verification_token: verificationToken,
                recruiter_device: user ? getDeviceId() : null,
                // Hora real de la captura (aunque se sincronice horas después sin señal)
                captured_at: new Date().toISOString(),
                latitude: lat,
                longitude: lng,
                commitment_level: formData.commitment_level,
                tenant_id: tenantId,
                recruiter_id: user?.id || null,
                // Respuestas del guion: el servidor las desglosa y las ubica en la sección
                survey: guion && Object.keys(surveyAnswers).length ? { poll_id: guion.id, answers: surveyAnswers } : null
            };

            await saveOfflineSupporter(supporterData);
            // Si el brigadista está recorriendo una zona, la puerta cuenta como "registrado"
            if (user) logKnock('registrado').catch(() => { });

            // Última ubicación conocida del brigadista (para el mapa de su coordinador). No bloquea el registro.
            if (user && navigator.onLine && lat && lng) {
                supabase.rpc('fn_update_my_location', { p_lat: Number(lat), p_lng: Number(lng) })
                    .then(({ error }) => { if (error) console.warn('No se pudo actualizar la ubicación:', error.message); });
            }

            if (navigator.onLine) {
                await syncOfflineData();
            }

            // Solo si la persona aceptó sumarse como brigadista se le crea cuenta de acceso
            if (navigator.onLine && wantsToJoin) {
                const { data: accountResult, error: accountError } = await supabase.functions.invoke('create-team-member', {
                    body: {
                        name: formData.name,
                        phone: formData.phone,
                        role: 'brigadista',
                        tenant_id: tenantId
                    }
                });

                if (accountError || !accountResult?.success) {
                    console.error('C4I: Error creando cuenta de acceso:', accountError || accountResult?.error);
                } else {
                    console.log(`C4I: Perfil de usuario y código táctico (${accountResult.temp_code}) creados para ${formData.phone}.`);
                }
            }

            // Los puntos los otorga el servidor cuando la persona valida la visita (50, +20 sin alertas, +10 con guion)
            const earnedXp = 50 + 20 + (supporterData.survey ? 10 : 0);
            setXpGained(user ? earnedXp : null);
            if (user && verificationToken) {
                setLastRegistered({ name: formData.name, phone: formData.phone, token: verificationToken });
                setValidationSent(false);
                setShowValidationQR(false);
            }
            setShowQR(!!user); // Solo mostrar QR de contacto si es reclutamiento asistido

            if (!user) {
                setStatusMessage('✅ ¡Gracias por sumarte! Un representante validará tu registro pronto.');
            } else {
                setStatusMessage('✅ Registro guardado. Suma puntos cuando la persona valide la visita.');
            }

            setFormData({
                name: '',
                phone: '',
                seccion: '',
                latitude: null,
                longitude: null,
                commitment_level: 3
            });
            setColonia(null); setColoniaQuery(''); setLivesHere(true); setWantsToJoin(false); setAnswers({});
            updateOfflineCount();

            setTimeout(() => {
                setStatusMessage('');
                setXpGained(null);
            }, 3000);

        } catch (error) {
            console.error('Error saving supporter:', error);
            setStatusMessage('❌ Error al guardar');
        } finally {
            setIsSaving(false);
        }
    };

    const handleManualSync = async () => {
        if (!navigator.onLine) {
            setStatusMessage('⚠️ Estás offline. Conéctate para sincronizar.');
            return;
        }
        setStatusMessage('Sincronizando...');
        await syncOfflineData();
        await updateOfflineCount();
        setStatusMessage('✅ Sincronización completa');
        setTimeout(() => setStatusMessage(''), 3000);
    };

    if (user && trainingBlocked) {
        return (
            <div>
                <div className="tactile-card" style={{ border: '1px solid var(--primary)', marginBottom: '1rem' }}>
                    <h3 style={{ marginTop: 0, fontFamily: 'Oswald' }}>Antes de registrar</h3>
                    <p style={{ margin: 0, color: '#94A3B8' }}>Tu campaña pide aprobar la capacitación. Son módulos de 3 minutos con un examen corto.</p>
                </div>
                <TrainingCenter startOpen onChange={setTrainingBlocked} />
            </div>
        );
    }

    const shownQuestions = guion ? visibleQuestions(guion, answers) : [];

    return (
        <div style={{ position: 'relative' }}>
            {user && <TrainingCenter onChange={setTrainingBlocked} />}
            {xpGained !== null && (
                <div style={{
                    position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)',
                    backgroundColor: 'var(--tertiary)', color: 'white', padding: '1rem 2rem',
                    borderRadius: '30px', fontWeight: 'bold', fontSize: '2rem',
                    boxShadow: '0 10px 25px rgba(255,230,109,0.5)', zIndex: 100,
                    animation: 'floatUp 2s ease-out forwards', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                    <Trophy size={32} /> ¡Guardado!
                </div>
            )}

            <form onSubmit={handleSubmit} className="tactile-card flex-col gap-1" style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h2 style={{ fontFamily: 'Oswald, sans-serif', color: 'var(--text-color)', margin: 0, fontSize: '1.4rem' }}>
                        {user ? 'Registrar simpatizante' : 'Súmate'}
                    </h2>
                    {offlineCount > 0 && (
                        <div className="tactile-badge" style={{ backgroundColor: 'rgba(255,90,54,0.2)', color: 'var(--primary)', borderColor: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 0 10px rgba(255,90,54,0.3)' }} onClick={handleManualSync}>
                            <span>{offlineCount} sin enviar · tocar para enviar</span>
                            <span style={{ fontSize: '1.2em' }}>↻</span>
                        </div>
                    )}
                </div>

                <div className="flex-col gap-1">
                    <label className="flex-col" style={{ gap: '0.3rem', fontSize: '0.9rem', color: '#CBD5E1' }}>
                        Nombre
                        <input type="text" name="name" value={formData.name} onChange={handleInputChange} className="squishy-input" placeholder="Nombre y apellido" autoComplete="off" autoCapitalize="words" required style={{ fontSize: '1.05rem' }} />
                    </label>
                    <label className="flex-col" style={{ gap: '0.3rem', fontSize: '0.9rem', color: '#CBD5E1' }}>
                        Celular
                        <input type="tel" inputMode="numeric" name="phone" value={formData.phone}
                            onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value.replace(/[^\d]/g, '').slice(0, 10) }))}
                            className="squishy-input" placeholder="10 números" autoComplete="off" required minLength={10} style={{ fontSize: '1.05rem', letterSpacing: '0.04em' }} />
                    </label>

                    <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginLeft: '0.5rem' }}>
                        Solo nombre y celular: no pidas CURP, clave de elector ni foto de la credencial.
                    </div>

                    <div style={{ marginTop: '0.5rem' }}>
                        <div style={{ fontSize: '0.9rem', color: '#CBD5E1', marginBottom: '0.4rem' }}>{user ? '¿Qué tanto apoya?' : '¿Cómo quieres participar?'}</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem' }}>
                            {(user
                                ? [{ v: 1, t: 'Lo está pensando' }, { v: 3, t: 'Sí nos apoya' }, { v: 5, t: 'Quiere ayudar' }]
                                : [{ v: 1, t: 'Solo informarme' }, { v: 3, t: 'Apoyar' }, { v: 5, t: 'Ayudar activamente' }]
                            ).map(o => (
                                <button key={o.v} type="button" onClick={() => setFormData(prev => ({ ...prev, commitment_level: o.v }))}
                                    aria-pressed={formData.commitment_level === o.v}
                                    style={{ minHeight: 52, padding: '0.4rem', borderRadius: 12, cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, lineHeight: 1.2,
                                        border: formData.commitment_level === o.v ? '2px solid var(--primary)' : '1px solid rgba(255,255,255,0.15)',
                                        background: formData.commitment_level === o.v ? 'rgba(255,90,54,0.18)' : 'rgba(0,0,0,0.2)',
                                        color: formData.commitment_level === o.v ? '#fff' : '#CBD5E1' }}>
                                    {o.t}
                                </button>
                            ))}
                        </div>
                    </div>

                    {user && guion && (
                        <div style={{ padding: '0.7rem', backgroundColor: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.25)', borderRadius: '8px', marginTop: '0.5rem' }}>
                            <button type="button" onClick={() => setShowScript(!showScript)}
                                style={{ display: 'flex', justifyContent: 'space-between', width: '100%', background: 'none', border: 'none', color: 'var(--tertiary)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.05em', cursor: 'pointer', padding: 0 }}>
                                <span>GUION DE VISITA · {guion.title}</span>
                                <span>{Object.keys(answers).length}/{shownQuestions.length}</span>
                            </button>
                            {showScript && (
                                <div className="flex-col" style={{ gap: '0.6rem', marginTop: '0.6rem' }}>
                                    {guion.script_intro && (
                                        <div style={{ fontSize: '0.88rem', fontStyle: 'italic', whiteSpace: 'pre-line', borderLeft: '3px solid var(--tertiary)', paddingLeft: '0.6rem' }}>{guion.script_intro}</div>
                                    )}
                                    {shownQuestions.map((q, i) => (
                                        <div key={q.id}>
                                            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '0.3rem' }}>{i + 1}. {q.question_text}</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                                {q.poll_options.map(o => (
                                                    <button type="button" key={o.id} onClick={() => answer(q.id, o.id)}
                                                        style={{ padding: '0.45rem 0.7rem', borderRadius: 16, cursor: 'pointer', fontSize: '0.82rem',
                                                            border: answers[q.id] === o.id ? '1px solid var(--tertiary)' : '1px solid rgba(255,255,255,0.15)',
                                                            background: answers[q.id] === o.id ? 'rgba(0,212,255,0.18)' : 'transparent',
                                                            color: answers[q.id] === o.id ? 'var(--tertiary)' : 'inherit' }}>
                                                        {o.option_text}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    {guion.script_closing && (
                                        <div style={{ fontSize: '0.88rem', fontStyle: 'italic', whiteSpace: 'pre-line', borderLeft: '3px solid var(--tertiary)', paddingLeft: '0.6rem' }}>{guion.script_closing}</div>
                                    )}
                                    <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Las respuestas son opcionales. Si la persona no quiere contestar, sigue con el registro.</div>
                                </div>
                            )}
                        </div>
                    )}

                    {user && (
                        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', fontSize: '0.85rem', marginTop: '0.5rem', cursor: 'pointer' }}>
                            <input type="checkbox" checked={wantsToJoin} onChange={e => setWantsToJoin(e.target.checked)} style={{ width: 22, height: 22, flex: '0 0 auto' }} />
                            También quiere ser brigadista (se le crea su acceso a la app)
                        </label>
                    )}

                    {user && (
                        <div style={{ padding: '0.6rem', backgroundColor: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '8px', marginTop: '0.5rem' }}>
                            <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginBottom: '0.4rem' }}>¿La persona vive aquí, donde la estás registrando?</div>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                <button type="button" className={`squishy-btn ${livesHere ? 'primary' : ''}`} style={{ flex: 1 }} onClick={() => { setLivesHere(true); setColonia(null); }}>Sí, vive aquí</button>
                                <button type="button" className={`squishy-btn ${!livesHere ? 'primary' : ''}`} style={{ flex: 1 }} onClick={() => setLivesHere(false)}>No, vive en otro lado</button>
                            </div>
                            {livesHere ? (
                                <div style={{ fontSize: '0.78rem', color: '#94A3B8', marginTop: '0.35rem' }}>Al guardar, la app toma la ubicación sola.</div>
                            ) : colonia ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', fontSize: '0.85rem' }}>
                                    <span>📍 {colonia.colonia}{colonia.cp ? ` (CP ${colonia.cp})` : ''} · Secc. {colonia.seccion}</span>
                                    <button type="button" className="squishy-btn" style={{ padding: '0.2rem 0.5rem' }} onClick={() => setColonia(null)}>Cambiar</button>
                                </div>
                            ) : (
                                <div style={{ marginTop: '0.5rem' }}>
                                    <input className="squishy-input" placeholder="Escribe su colonia (mín. 3 letras)" value={coloniaQuery} onChange={e => setColoniaQuery(e.target.value)} />
                                    {coloniaOptions.map(o => (
                                        <button type="button" key={o.colonia_id} onClick={() => { setColonia(o); setColoniaOptions([]); }}
                                            style={{ display: 'block', width: '100%', textAlign: 'left', background: 'rgba(255,255,255,0.04)', border: 'none', color: 'inherit', padding: '0.45rem', marginTop: '0.2rem', borderRadius: 6, cursor: 'pointer' }}>
                                            {o.colonia}{o.cp ? ` · CP ${o.cp}` : ''} <span style={{ color: '#94A3B8' }}>· Secc. {o.seccion}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {statusMessage && (
                        <div style={{ textAlign: 'center', fontWeight: 'bold', padding: '0.5rem', color: statusMessage.includes('❌') ? 'red' : 'inherit' }}>
                            {statusMessage}
                        </div>
                    )}

                    <button
                        type="submit"
                        className="squishy-btn primary"
                        style={{ marginTop: '1rem', padding: '1rem', fontSize: '1.2rem', boxShadow: '0 0 20px rgba(255,90,54,0.3)', width: '100%' }}
                        disabled={isSaving}
                    >
                        {isSaving ? 'Guardando…' : user ? 'Guardar registro' : 'Enviar'}
                    </button>
                </div>
            </form>

            {/* QR MODAL */}
            {showQR && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', zIndex: 2000,
                    padding: '1rem', backdropFilter: 'blur(5px)'
                }}>
                    <div className="tactile-card" style={{
                        maxWidth: '400px', width: '100%', position: 'relative',
                        border: '2px solid var(--primary)', animation: 'fadeInScale 0.3s ease-out'
                    }}>
                        <button
                            onClick={() => setShowQR(false)}
                            style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: '#64748B', cursor: 'pointer' }}
                        >
                            <X size={24} />
                        </button>

                        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{
                                background: 'var(--primary)', color: 'white', padding: '0.5rem',
                                borderRadius: '50%', width: '50px', height: '50px',
                                margin: '0 auto 1rem', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', boxShadow: '0 0 15px var(--primary)'
                            }}>
                                <User size={30} />
                            </div>
                            <h2 style={{ fontFamily: 'Oswald', margin: 0, fontSize: '1.5rem', color: 'white' }}>
                                ¡Registro guardado!
                            </h2>
                            <p style={{ color: 'var(--tertiary)', fontWeight: 'bold' }}>
                                Ganas hasta {xpGained} puntos cuando la persona confirme
                            </p>
                        </div>

                        {lastRegistered && (
                            <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                                <div style={{ fontSize: '0.95rem', marginBottom: '0.6rem' }}>Ahora confirma que la visita fue real:</div>
                                <button
                                    className="squishy-btn primary"
                                    style={{ width: '100%', padding: '1rem', fontSize: '1.05rem', background: '#25D366', borderColor: '#25D366', color: '#062b14' }}
                                    onClick={async () => {
                                        await sendVerificationWhatsApp({ phone: lastRegistered.phone, personName: lastRegistered.name, recruiterName: user?.name, campaignName: candidateInfo.name, token: lastRegistered.token });
                                        setValidationSent(true);
                                    }}
                                >
                                    {validationSent ? '✅ Enviado · volver a enviar' : `Enviar mensaje a ${lastRegistered.name.split(' ')[0]} por WhatsApp`}
                                </button>
                                {showValidationQR ? (
                                    <div style={{ marginTop: '0.8rem' }}>
                                        <div style={{ background: '#fff', padding: '0.8rem', borderRadius: 12, display: 'inline-block' }}>
                                            <QRCodeSVG value={verificationLink(lastRegistered.token, 'qr')} size={220} level="M" />
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '0.4rem' }}>
                                            Pide a {lastRegistered.name.split(' ')[0]} que lo escanee con la cámara de su celular.
                                        </div>
                                    </div>
                                ) : (
                                    <button className="squishy-btn" style={{ width: '100%', padding: '0.7rem', marginTop: '0.5rem' }} onClick={() => setShowValidationQR(true)}>
                                        No tiene WhatsApp: mostrar código QR
                                    </button>
                                )}
                            </div>
                        )}

                        <details style={{ marginTop: '0.5rem' }}>
                            <summary style={{ cursor: 'pointer', color: '#94A3B8', fontSize: '0.85rem' }}>Darle el contacto de {candidateInfo.name}</summary>
                            <WhatsAppQR
                                phone={candidateInfo.phone || '5219611234567'}
                                candidateName={candidateInfo.name}
                                message={`Hola ${candidateInfo.name}, me da gusto saludarte. Me acabo de registrar a través de ${user?.name}. ¡Estamos en contacto!`}
                            />
                        </details>

                        <button
                            className="squishy-btn"
                            onClick={() => setShowQR(false)}
                            style={{ width: '100%', marginTop: '1rem', padding: '0.8rem', backgroundColor: 'transparent', border: '1px solid #64748B', color: '#64748B' }}
                        >
                            Listo, registrar a otra persona
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
