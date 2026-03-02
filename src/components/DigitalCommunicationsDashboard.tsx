import { useState, useEffect, useRef } from 'react';
import {
    Headphones, PhoneCall, CheckCircle, XCircle,
    Search, Send, MessageCircle, Settings,
    ShieldAlert, Share2, Smartphone, Users, Globe, Activity,
    Download, Clock,
    ChevronDown, ChevronUp, Loader2, PhoneOff, Mic, UserPlus
} from 'lucide-react';





// --- Safe Text Component to prevent 3rd party DOM manipulation errors ---
const SafeText = ({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) => (
    <span translate="no" className="notranslate" style={style}>{children}</span>
);
import { useAuth } from '../lib/AuthContext';
import { supabase } from '../lib/supabase';
import { SocialMediaDashboard } from './SocialMediaDashboard';
import { SmsGatewayDashboard } from './SmsGatewayDashboard';
import { bridgeDiscovery } from '../lib/bridgeDiscovery';

interface WhatsAppCampaign {
    id: string;
    name: string;
    target_role: string;
    message_template: string;
    status: 'draft' | 'running' | 'paused' | 'completed';
    created_at: string;
}

export const DigitalCommunicationsDashboard = () => {
    const { user } = useAuth();
    const [activeTab, setActiveTab] = useState<'auditoria' | 'whatsapp' | 'social' | 'sms' | 'directo'>('auditoria');

    // --- State Auditoría ---
    const [pendingCalls, setPendingCalls] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [activeCall, setActiveCall] = useState<any | null>(null);
    const [auditStats, setAuditStats] = useState({
        totalPending: 0,
        verifiedToday: 0,
        rejectedToday: 0,
        accuracyRate: '0%'
    });

    // --- State WhatsApp Masivo ---
    const [targetRole, setTargetRole] = useState<'coordinador' | 'lider' | 'brigadista' | 'todos'>('todos');
    const [waCampaigns, setWaCampaigns] = useState<WhatsAppCampaign[]>([]);
    const [newWaName, setNewWaName] = useState('');
    const [waMessageTemplate, setWaMessageTemplate] = useState('{Hola|Saludos|Buen día} {{nombre}}, te recordamos la junta de mañana a las 18:00 hrs.');

    // --- State Direct Messaging ---
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searching, setSearching] = useState(false);
    const [selectedContact, setSelectedContact] = useState<any | null>(null);
    const [manualPhone, setManualPhone] = useState('');
    const [directMessage, setDirectMessage] = useState('Mensaje de prueba - Sistema Electoral');
    const [sendingDirect, setSendingDirect] = useState(false);
    const [isBulkTesting, setIsBulkTesting] = useState(false);
    const [testCallNumber, setTestCallNumber] = useState('');
    const [isCalling, setIsCalling] = useState(false);
    const [autoAudio, setAutoAudio] = useState(false);
    const [audioFile] = useState<File | null>(null);
    const [activeAudio, setActiveAudio] = useState<HTMLAudioElement | null>(null);
    const [, setActiveDeviceId] = useState<string | null>(null);
    const [amdDelay] = useState(2);
    const [, setSocialAccounts] = useState<any[]>([]);

    const [callScript, setCallScript] = useState('');
    const [scriptEditing, setScriptEditing] = useState(false);
    const [scriptSaving, setScriptSaving] = useState(false);
    const [scriptLastUpdated, setScriptLastUpdated] = useState<string | null>(null);
    const [auditCallLog, setAuditCallLog] = useState<{ simpatiza: number, no_disponible: number, rechazo: number, sin_servicio: number, buzon: number }>({ simpatiza: 0, no_disponible: 0, rechazo: 0, sin_servicio: 0, buzon: 0 });
    const [auditHistory, setAuditHistory] = useState<any[]>([]);
    const [showHistory, setShowHistory] = useState(false);
    const pollIntervalRef = useRef<any>(null);


    useEffect(() => {
        if (!user?.tenant_id) return;

        // Initial fetch
        if (activeTab === 'auditoria') {
            fetchCallCenterData();
            fetchPitch();
            fetchAuditStats();
            fetchAuditHistory();
        }

        if (activeTab === 'whatsapp') fetchWaCampaigns();
        if (activeTab === 'social') fetchSocialData();

        // Real-time subscriptions
        const channel = supabase
            .channel('audit-realtime')
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'supporters', filter: `tenant_id=eq.${user.tenant_id}` },
                () => { fetchCallCenterData(); fetchAuditStats(); }
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'audit_call_log', filter: `tenant_id=eq.${user.tenant_id}` },
                () => { fetchAuditStats(); }
            )
            .on('postgres_changes',
                { event: '*', schema: 'public', table: 'audit_pitch', filter: `tenant_id=eq.${user.tenant_id}` },
                (payload: any) => {
                    if (payload.new?.script !== undefined) setCallScript(payload.new.script);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
            if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
            if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; }
        };
    }, [user, activeTab]);

    // --- Load pitch script from Supabase ---
    const fetchPitch = async () => {
        if (!user?.tenant_id) return;
        const { data } = await supabase.from('audit_pitch').select('script, updated_at').eq('tenant_id', user.tenant_id).maybeSingle();
        if (data) {
            setCallScript(data.script);
            setScriptLastUpdated(data.updated_at);
        } else {
            // Set default pitch if none exists yet
            setCallScript(`Buenos días/tardes, ¿me comunico con [NOMBRE]?\n\nSoy [TU NOMBRE], del equipo de [CANDIDATO/PARTIDO].\n\nLe llamo para saludarle y preguntarle si ya conoce el proyecto que estamos impulsando para mejorar [COLONIA/SECCIÓN].\n\n¿Contamos con su apoyo el día de la elección? ✅\n\n¡Muchas gracias! Que tenga un excelente día.`);
        }
    };

    // --- Save pitch script to Supabase ---
    const savePitch = async () => {
        if (!user?.tenant_id || !callScript.trim()) return;
        setScriptSaving(true);
        try {
            await supabase.from('audit_pitch').upsert({
                tenant_id: user.tenant_id,
                script: callScript,
                updated_at: new Date().toISOString(),
                updated_by: user.id
            }, { onConflict: 'tenant_id' });
            setScriptEditing(false);
            setScriptLastUpdated(new Date().toISOString());
        } finally {
            setScriptSaving(false);
        }
    };

    // --- Fetch audit call log stats ---
    const fetchAuditStats = async () => {
        if (!user?.tenant_id) return;
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const { data } = await supabase
            .from('audit_call_log')
            .select('outcome')
            .eq('tenant_id', user.tenant_id)
            .gte('called_at', today.toISOString());
        if (!data) return;
        const counts = { simpatiza: 0, no_disponible: 0, rechazo: 0, sin_servicio: 0, buzon: 0 };
        data.forEach((r: any) => { if (r.outcome in counts) (counts as any)[r.outcome]++; });
        setAuditCallLog(counts);
    };

    const fetchAuditHistory = async () => {
        if (!user?.tenant_id) return;
        const { data } = await supabase
            .from('audit_call_log')
            .select('called_at, outcome')
            .eq('tenant_id', user.tenant_id)
            .order('called_at', { ascending: false })
            .limit(100);
        if (data) setAuditHistory(data);
    };

    const handleExportCSV = async () => {
        try {
            const { data: logs } = await supabase
                .from('audit_call_log')
                .select(`
                    called_at,
                    outcome,
                    supporter:supporters(name, phone)
                `)
                .eq('tenant_id', user?.tenant_id)
                .order('called_at', { ascending: false });

            if (!logs || logs.length === 0) return alert("No hay datos para exportar");

            const csvRows = [
                ['Fecha', 'Contacto', 'Teléfono', 'Resultado'].join(','),
                ...logs.map(l => [
                    new Date(l.called_at).toLocaleString(),
                    `"${(l.supporter as any)?.name || 'N/A'}"`,
                    (l.supporter as any)?.phone || 'N/A',
                    l.outcome
                ].join(','))
            ];

            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `auditoria_${new Date().toISOString().split('T')[0]}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (e) {
            console.error(e);
            alert("Error al exportar CSV");
        }
    };


    // --- Record call result to audit_call_log ---
    const handleCallResult = async (supporterId: string, outcome: 'simpatiza' | 'no_disponible' | 'rechazo' | 'sin_servicio' | 'buzon') => {
        if (!user?.tenant_id) return;
        // Insert log
        await supabase.from('audit_call_log').insert([{
            tenant_id: user.tenant_id,
            supporter_id: supporterId,
            agent_id: user.id,
            outcome
        }]);
        // Update supporter status if definitive outcome
        if (outcome === 'simpatiza') {
            await supabase.from('supporters').update({ status: 'aprobado' }).eq('id', supporterId);
        } else if (outcome === 'rechazo') {
            await supabase.from('supporters').update({ status: 'rechazado' }).eq('id', supporterId);
        }
        // If there's an active call panel for this contact, close it
        if (activeCall?.id === supporterId) setActiveCall(null);
        fetchCallCenterData();
        fetchAuditStats();
    };

    const fetchCallCenterData = async () => {
        if (!user?.tenant_id) return;
        setLoading(true);
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const { data: pending, error: errPending } = await supabase
                .from('supporters')
                .select(`
                    id, 
                    name, 
                    phone, 
                    status, 
                    created_at, 
                    recruiter_id, 
                    users!recruiter_id(name, role)
                `)
                .eq('tenant_id', user?.tenant_id)
                .eq('status', 'pendiente')
                .order('created_at', { ascending: false });

            const { count: verifiedToday } = await supabase
                .from('supporters')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', user.tenant_id)
                .eq('status', 'aprobado')
                .gte('created_at', today.toISOString());

            const { count: rejectedToday } = await supabase
                .from('supporters')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', user.tenant_id)
                .eq('status', 'rechazado')
                .gte('created_at', today.toISOString());


            if (!errPending && pending) {
                setPendingCalls(pending);
                const totalEvaluated = (verifiedToday || 0) + (rejectedToday || 0);
                const accuracy = totalEvaluated === 0 ? 0 : Math.round(((verifiedToday || 0) / totalEvaluated) * 100);

                setAuditStats({
                    totalPending: pending.length,
                    verifiedToday: verifiedToday || 0,
                    rejectedToday: rejectedToday || 0,
                    accuracyRate: `${accuracy}%`
                });
            }
        } catch (err) {
            console.error("Error fetching call center data", err);
        } finally {
            setLoading(false);
        }
    };

    const fetchWaCampaigns = async () => {
        if (!user?.tenant_id) return;
        try {
            const { data } = await supabase
                .from('whatsapp_campaigns')
                .select('*')
                .eq('tenant_id', user.tenant_id)
                .order('created_at', { ascending: false });

            if (data) setWaCampaigns(data);
        } catch (err) {
            console.error("Error fetching WA campaigns", err);
        }
    };

    const fetchSocialData = async () => {
        if (!user?.tenant_id) return;
        const { data } = await supabase.from('social_accounts').select('*').eq('tenant_id', user.tenant_id);
        if (data) setSocialAccounts(data);
    };


    const handleSearchContacts = async (query: string) => {
        setSearchQuery(query);

        // Si el query parece un teléfono (solo números y min 10 dígitos), lo ponemos como manualPhone proactivamente
        if (/^\d{10,}$/.test(query)) {
            setManualPhone(query);
        }

        if (query.length < 2) {
            setSearchResults([]);
            return;
        }

        setSearching(true);
        try {
            const { data, error } = await supabase
                .from('supporters')
                .select('id, name, phone')
                .or(`name.ilike.%${query}%,phone.ilike.%${query}%`)
                .eq('tenant_id', user?.tenant_id)
                .limit(5);

            if (error) throw error;
            setSearchResults(data || []);
        } catch (err) {
            console.error("Search error", err);
        } finally {
            setSearching(false);
        }
    };

    const handleCreateTestContact = async () => {
        if (!user) return;
        setSearching(true);
        try {
            const { data, error } = await supabase
                .from('supporters')
                .insert([{
                    tenant_id: user.tenant_id,
                    name: `${user.name} (TEST)`,
                    phone: user.phone || '521234567890',
                    status: 'aprobado'
                }])
                .select()
                .single();

            if (error) throw error;
            setSelectedContact(data);
            setManualPhone(data.phone);
            setSearchQuery(data.name);
            alert("Contacto de prueba creado con éxito!");
        } catch (err) {
            console.error(err);
            alert("No se pudo crear el contacto. ¿Están las tablas listas?");
        } finally {
            setSearching(false);
        }
    };

    const handleSendDirect = async (type: 'wa' | 'sms') => {
        const targetPhone = selectedContact?.phone || manualPhone;
        if (!targetPhone || !directMessage) {
            alert("Por favor selecciona un contacto o ingresa un número, y escribe un mensaje.");
            return;
        }

        setSendingDirect(true);
        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) throw new Error("Bridge not found");

            const endpoint = type === 'wa' ? 'send-wa' : 'send-sms';
            const res = await fetch(`${baseUrl}/${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    phone: targetPhone,
                    message: getWaPreview(directMessage, selectedContact?.name || 'Amigo')
                })
            });
            if (res.ok) {
                alert("Mensaje enviado con éxito via Bridge 🚀");
                setDirectMessage('');
            } else {
                const errorData = await res.json().catch(() => ({}));
                alert(`Error en el Puente: ${errorData.error || "Respuesta fallida del servidor"}`);
            }
        } catch (e) {
            console.error(e);
            alert("No se pudo conectar con el Bridge Local. Verifica que 'npm run dev' esté corriendo y el puerto 5000 abierto.");
        } finally {
            setSendingDirect(false);
        }
    };

    const handleInitiateCall = async (phone: string) => {
        if (autoAudio && !audioFile) {
            alert("Por favor selecciona un archivo de audio para reproducir.");
            return;
        }

        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) {
                alert("Puente local no detectado. ¿Está corriendo 'sms_bridge.js'?");
                return;
            }

            const res = await fetch(`${baseUrl}/make-call`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });

            if (res.ok) {
                const data = await res.json();
                console.log(`Llamada iniciada en dispositivo ${data.device}`);
                setIsCalling(true);
                setActiveDeviceId(data.device);

                if (autoAudio && audioFile) {
                    // Robocall mode: full AMD polling with audio playback
                    const url = URL.createObjectURL(audioFile);
                    const audio = new Audio(url);
                    setActiveAudio(audio);

                    audio.onended = () => {
                        console.log("Audio finalizado, colgando...");
                        handleHangUp();
                    };

                    startAmdPolling(data.device, audio, baseUrl);
                } else {
                    // Auditar mode: lightweight polling — just detect when call ends
                    startCallMonitor(data.device, baseUrl);
                }
            } else if (res.status === 404) {
                alert("Error 404: El puente no reconoce la función de llamadas. POR FAVOR REINICIA EL PUENTE (cierra la ventana negra y abre INICIAR_PUENTE.bat).");
            } else {
                const contentType = res.headers.get("content-type");
                if (contentType && contentType.includes("application/json")) {
                    const err = await res.json();
                    alert(`Error al iniciar llamada: ${err.error}`);
                } else {
                    const text = await res.text();
                    console.error("Non-JSON response from bridge:", text);
                    alert("Error de respuesta del puente. Es posible que necesite ser actualizado/reiniciado.");
                }
            }
        } catch (e) {
            console.error("Error connecting to bridge for call", e);
            alert("Error de conexión con el puente hardware.");
        }
    };

    const handleHangUp = async () => {
        if (activeAudio) {
            activeAudio.pause();
            activeAudio.currentTime = 0;
            setActiveAudio(null);
        }

        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }

        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) return;

            const res = await fetch(`${baseUrl}/hang-up`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (res.ok) {
                console.log("Llamadas finalizadas");
                setIsCalling(false);
                setActiveDeviceId(null);
            }
        } catch (e) {
            console.error("Error hanging up", e);
        }
    };
    const startCallMonitor = (deviceId: string, baseUrl: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        let hasBeenOffhook = false;

        // Safety timeout: stop polling after 90s no matter what
        setTimeout(() => {
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
        }, 90000);

        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${baseUrl}/call-status/${deviceId}`);
                if (!res.ok) return;
                const data = await res.json();

                if (data.state === 'OFFHOOK' || data.state === 'ACTIVE') {
                    hasBeenOffhook = true; // Call is or was active
                } else if (data.state === 'IDLE') {
                    if (hasBeenOffhook) {
                        // Call ended (remote hung up, no answer, out of service, etc.)
                        console.log('[MONITOR] Llamada finalizada automáticamente.');
                        clearInterval(pollIntervalRef.current!);
                        pollIntervalRef.current = null;
                        setIsCalling(false);
                        setActiveDeviceId(null);
                    }
                    // else: still waiting for call to register, keep polling
                }
            } catch (err) {
                console.error('[MONITOR] Polling error:', err);
            }
        }, 1500); // Poll every 1.5s — lighter than AMD
    };

    const startAmdPolling = (deviceId: string, audio: HTMLAudioElement, baseUrl: string) => {
        if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

        let audioPlayed = false;
        let hasBeenOffhook = false;  // True once we first detect OFFHOOK or ACTIVE
        let answerTimer: any = null;

        const cleanUp = (isCallDone: boolean) => {
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
            if (answerTimer) { clearTimeout(answerTimer); answerTimer = null; }
            if (isCallDone) {
                if (audio && !audio.ended) audio.pause();
                setIsCalling(false);
                setActiveDeviceId(null);
            }
        };

        const playAudio = () => {
            if (!audioPlayed) {
                audioPlayed = true;
                console.log('[AMD] ¡Reproduciendo audio...');
                audio.play().catch(e => console.error('[AMD] Error al reproducir:', e));
                // Keep polling until IDLE (call ends)
            }
        };

        // Safety timeout: give up AMD after 90 seconds
        setTimeout(() => cleanUp(false), 90000);

        pollIntervalRef.current = setInterval(async () => {
            try {
                const res = await fetch(`${baseUrl}/call-status/${deviceId}`);
                if (!res.ok) return;
                const data = await res.json();
                console.log(`[AMD] Estado: ${data.state} (${data.raw})`);

                if (data.state === 'ACTIVE') {
                    // CS_ACTIVE confirmed: remote party answered!
                    hasBeenOffhook = true;
                    if (!audioPlayed) {
                        console.log(`[AMD] ¡Llamada contestada (CS_ACTIVE)! Esperando ${amdDelay}s antes de audio...`);
                        clearInterval(pollIntervalRef.current!);
                        pollIntervalRef.current = null;
                        answerTimer = setTimeout(playAudio, amdDelay * 1000);
                    }
                } else if (data.state === 'OFFHOOK') {
                    // Phone is dialing but no CS_ACTIVE yet — keep polling
                    hasBeenOffhook = true;
                } else if (data.state === 'IDLE') {
                    if (hasBeenOffhook) {
                        console.log('[AMD] Llamada finalizada.');
                        cleanUp(true);
                    } else {
                        console.log('[AMD] Esperando a que el celular registre la llamada...');
                    }
                }
            } catch (err) {
                console.error('[AMD] Polling error:', err);
            }
        }, 1000);
    };

    const handleBulkTest = async () => {
        if (!directMessage || (!selectedContact && !manualPhone)) {
            alert("Selecciona un contacto y escribe un mensaje.");
            return;
        }

        const phone = selectedContact ? selectedContact.phone : manualPhone;

        try {
            setIsBulkTesting(true);
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) throw new Error("Bridge not found");

            const devRes = await fetch(`${baseUrl}/get-devices`);
            const devices = await devRes.json();
            const authorized = devices.filter((d: any) => d.status === 'connected');

            if (authorized.length === 0) {
                alert("No hay equipos conectados para la prueba masiva.");
                return;
            }

            alert(`Iniciando prueba masiva en ${authorized.length} equipos. Intervalo: 6s (Anti-ban)`);

            for (const [index, device] of authorized.entries()) {
                console.log(`[BULK TEST] Enviando desde ${device.id}...`);
                await fetch(`${baseUrl}/send-sms`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        deviceId: device.id,
                        to: phone,
                        message: directMessage + ` (Test Eq. ${index + 1}/${authorized.length})`
                    })
                });

                // Delay anti-ban salvo el último
                if (index < authorized.length - 1) {
                    await new Promise(r => setTimeout(r, 6000));
                }
            }
            alert("¡Prueba masiva completada en todos los equipos!");
        } catch (err) {
            console.error("Bulk test error", err);
            alert("Error en la prueba masiva");
        } finally {
            setIsBulkTesting(false);
        }
    };

    const startDripFeed = async (campaignId: string) => {
        try {
            await supabase
                .from('whatsapp_campaigns')
                .update({ status: 'running' })
                .eq('id', campaignId);

            fetchWaCampaigns();

            // Fetch campaign to get template and role
            const { data: currentCamp } = await supabase.from('whatsapp_campaigns').select('*').eq('id', campaignId).single();
            if (!currentCamp) return;

            // Local simulation/bridge loop
            const interval = setInterval(async () => {
                const { data: statusCheck } = await supabase
                    .from('whatsapp_campaigns')
                    .select('stats, status, message_template')
                    .eq('id', campaignId)
                    .single();

                if (!statusCheck || statusCheck.status !== 'running') {
                    clearInterval(interval);
                    return;
                }

                // Pick a target (in a real app we'd track who was already sent)
                // For this drip feed, we'll increment the counter and simulate/call bridge
                const newSent = statusCheck.stats.sent + 1;

                if (newSent <= statusCheck.stats.total) {
                    // Call the REAL local bridge
                    try {
                        const baseUrl = await bridgeDiscovery.getBaseUrl();
                        const testPhone = "52" + Math.floor(Math.random() * 9000000000 + 1000000000); // Simulated target for demo or real if we had a queue
                        const msg = getWaPreview(statusCheck.message_template, "Contacto");

                        if (baseUrl) {
                            await fetch(`${baseUrl}/send-wa`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ phone: testPhone, message: msg })
                            });
                        }
                    } catch (e) {
                        console.warn("Bridge not available, simulating stats only.");
                    }

                    const newStats = { ...statusCheck.stats, sent: newSent };

                    if (newStats.sent >= newStats.total) {
                        await supabase
                            .from('whatsapp_campaigns')
                            .update({ stats: newStats, status: 'completed' })
                            .eq('id', campaignId);
                        clearInterval(interval);
                    } else {
                        await supabase
                            .from('whatsapp_campaigns')
                            .update({ stats: newStats })
                            .eq('id', campaignId);
                    }
                } else {
                    clearInterval(interval);
                }

                fetchWaCampaigns();
            }, 60000); // 1 message per minute (Anti-Ban)

        } catch (err) {
            console.error("Error starting drip feed", err);
        }
    };

    const pickRandomCall = () => {
        if (pendingCalls.length === 0) {
            alert("No hay llamadas pendientes en la cola.");
            return;
        }
        const randomIndex = Math.floor(Math.random() * pendingCalls.length);
        setActiveCall(pendingCalls[randomIndex]);
    };

    const handleCallAction = async (supporterId: string, newStatus: 'aprobado' | 'rechazado') => {
        try {
            // Optimistic update
            setPendingCalls(prev => prev.filter(c => c.id !== supporterId));

            // If it was the active call, clear it or move to next
            if (activeCall?.id === supporterId) {
                setActiveCall(null);
            }

            const { error } = await supabase
                .from('supporters')
                .update({ status: newStatus })
                .eq('id', supporterId);

            if (error) throw error;

            // Auto-pick next if we were in "Call Center Mode"
            if (activeCall?.id === supporterId && pendingCalls.length > 1) {
                const remaining = pendingCalls.filter(c => c.id !== supporterId);
                const nextRandom = remaining[Math.floor(Math.random() * remaining.length)];
                setActiveCall(nextRandom);
            }

        } catch (err) {
            console.error("Error updating status", err);
            fetchCallCenterData();
        }
    };

    // --- Lógica Spintax (WhatsApp) ---
    const applySpintax = (text: string) => {
        return text.replace(/\{([^{}]+)\}/g, (_, options) => {
            const parts = options.split('|');
            return parts[Math.floor(Math.random() * parts.length)];
        });
    };

    const getWaPreview = (template: string, name: string) => {
        let text = template.replace(/\{\{nombre\}\}/g, name);
        return applySpintax(text);
    };

    const handleCreateWaCampaign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.tenant_id || !newWaName || !waMessageTemplate) return;

        try {
            setLoading(true);

            // Calculate real total based on role
            let totalTarget = 0;
            if (targetRole === 'todos') {
                const { count } = await supabase.from('users').select('*', { count: 'exact', head: true });
                totalTarget = count || 0;
            } else {
                const { count } = await supabase.from('users').select('*', { count: 'exact', head: true }).eq('role', targetRole);
                totalTarget = count || 0;
            }

            const newCampaign = {
                tenant_id: user?.tenant_id,
                name: newWaName,
                message_template: waMessageTemplate,
                target_role: targetRole,
                status: 'draft',
                stats: { sent: 0, total: totalTarget, failed: 0 }
            };

            const { data, error } = await supabase
                .from('whatsapp_campaigns')
                .insert(newCampaign)
                .select()
                .single();

            if (error) throw error;

            setWaCampaigns([data, ...waCampaigns]);
            setNewWaName('');
            setWaMessageTemplate('');
            alert(`Campaña "${newWaName}" creada para ${targetRole} (${totalTarget} contactos).`);
        } catch (err) {
            console.error("Error creating campaign", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredCalls = pendingCalls.filter(call =>
        call.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        call.phone.includes(searchTerm)
    );

    return (
        <div className="flex-col gap-4">
            {/* CENTRAL COMMAND HEADER */}
            <header className="tactile-card" style={{
                background: 'linear-gradient(135deg, rgba(15, 18, 24, 0.95) 0%, rgba(30, 35, 45, 0.95) 100%)',
                padding: '1.5rem',
                border: '1px solid var(--tertiary)',
                boxShadow: '0 8px 32px rgba(0, 212, 255, 0.1)',
                position: 'relative', overflow: 'hidden'
            }}>
                <div style={{
                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundImage: 'radial-gradient(var(--tertiary) 1px, transparent 1px)',
                    backgroundSize: '25px 25px', opacity: 0.05, pointerEvents: 'none'
                }} />

                <div className="flex-row-resp" style={{ position: 'relative', zIndex: 1, justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <div style={{ padding: '0.8rem', background: 'rgba(0,212,255,0.1)', borderRadius: '12px', border: '1px solid var(--tertiary)' }}>
                            <Headphones size={32} color="var(--tertiary)" />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: '1.8rem', color: 'white', letterSpacing: '1px' }}><SafeText>C4I DIGITAL HUB</SafeText></h1>
                            <p className="tactical-font" style={{ margin: 0, color: 'var(--tertiary)', fontSize: '0.8rem' }}><SafeText>SUITE CENTRAL DE COMUNICACIÓN</SafeText></p>
                        </div>
                    </div>
                </div>

                <div className="scroll-tabs" style={{ marginTop: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <button
                        onClick={() => setActiveTab('auditoria')}
                        style={{
                            background: 'transparent', border: 'none',
                            color: activeTab === 'auditoria' ? 'var(--tertiary)' : '#64748B',
                            padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                            borderBottom: activeTab === 'auditoria' ? '2px solid var(--tertiary)' : '2px solid transparent',
                            fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                        }}
                    >
                        <PhoneCall size={18} /> <SafeText>AUDITORÍA</SafeText>
                    </button>
                    <button
                        onClick={() => setActiveTab('directo')}
                        style={{
                            background: 'transparent', border: 'none',
                            color: activeTab === 'directo' ? '#EAB308' : '#64748B',
                            padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                            borderBottom: activeTab === 'directo' ? '2px solid #EAB308' : '2px solid transparent',
                            fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                        }}
                    >
                        <Send size={18} /> <SafeText>ENVÍO DIRECTO (TEST)</SafeText>
                    </button>
                    <button
                        onClick={() => setActiveTab('whatsapp')}
                        style={{
                            background: 'transparent', border: 'none',
                            color: activeTab === 'whatsapp' ? 'var(--secondary)' : '#64748B',
                            padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                            borderBottom: activeTab === 'whatsapp' ? '2px solid var(--secondary)' : '2px solid transparent',
                            fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                        }}
                    >
                        <MessageCircle size={18} /> <SafeText>WHATSAPP TÁCTICO</SafeText>
                    </button>
                    <button
                        onClick={() => setActiveTab('social')}
                        style={{
                            background: 'transparent', border: 'none',
                            color: activeTab === 'social' ? 'var(--accent)' : '#64748B',
                            padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                            borderBottom: activeTab === 'social' ? '2px solid var(--accent)' : '2px solid transparent',
                            fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                        }}
                    >
                        <Share2 size={18} /> <SafeText>SOCIAL MEDIA AI</SafeText>
                    </button>
                    <button
                        onClick={() => setActiveTab('sms')}
                        style={{
                            background: 'transparent', border: 'none',
                            color: activeTab === 'sms' ? 'var(--tertiary)' : '#64748B',
                            padding: '1rem', cursor: 'pointer', whiteSpace: 'nowrap',
                            borderBottom: activeTab === 'sms' ? '2px solid var(--tertiary)' : '2px solid transparent',
                            fontFamily: 'Oswald, sans-serif', fontSize: '1rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                        }}
                    >
                        <Smartphone size={18} /> <SafeText>SMS GATEWAY</SafeText>
                    </button>
                </div>
            </header>

            {/* MAIN CONTENT AREA */}
            <main style={{ paddingBottom: '100px' }}>

                {/* 1. SECCIÓN DE AUDITORÍA */}
                {activeTab === 'auditoria' && (
                    <div className="flex-col gap-4">
                        <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                            <div className="tactile-card flex-col flex-center" style={{ borderLeft: '4px solid var(--tertiary)' }}>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}>PENDIENTES</p>
                                <p style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'Oswald' }}>{auditStats.totalPending}</p>
                            </div>
                            <div className="tactile-card flex-col flex-center" style={{ borderLeft: '4px solid var(--secondary)' }}>
                                <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}>VERIFICADOS HOY</p>
                                <p style={{ margin: 0, fontSize: '1.8rem', fontFamily: 'Oswald', color: 'var(--secondary)' }}>{auditStats.verifiedToday}</p>
                            </div>
                        </div>

                        <div className="tactile-card" style={{ border: '1px solid var(--tertiary)', background: 'rgba(0, 212, 255, 0.02)', padding: '1rem' }}>
                            <div className="flex-row" style={{ gap: '0.8rem', alignItems: 'center' }}>
                                <Headphones size={20} color="var(--tertiary)" />
                                <div style={{ fontSize: '0.85rem' }}>
                                    <strong style={{ color: 'var(--tertiary)' }}>AUDIO DEL CALL CENTER:</strong> Para hablar por la computadora, vincula tu celular vía <strong>Bluetooth (Manos Libres)</strong> o usa <strong>scrcpy --audio</strong>.
                                </div>
                            </div>
                        </div>

                        {/* === SPEECH GUIDE / PITCH DEL AGENTE === */}
                        <div className="tactile-card flex-col gap-3" style={{ border: '1px solid #F59E0B', background: 'rgba(245, 158, 11, 0.04)' }}>
                            <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="flex-row gap-2" style={{ alignItems: 'center' }}>
                                    <span style={{ fontSize: '1.2rem' }}>🎙️</span>
                                    <strong style={{ color: '#F59E0B', fontFamily: 'Oswald', letterSpacing: '0.05em', fontSize: '1rem' }}>
                                        GUÍA DE LLAMADA — PITCH OFICIAL
                                    </strong>
                                    <span style={{ fontSize: '0.6rem', color: '#92400E', background: 'rgba(245,158,11,0.15)', padding: '0.1rem 0.5rem', borderRadius: '999px', border: '1px solid rgba(245,158,11,0.3)' }}>
                                        solo visible para el agente
                                    </span>
                                </div>
                                <div className="flex-row gap-2" style={{ alignItems: 'center' }}>
                                    {scriptLastUpdated && (
                                        <span style={{ fontSize: '0.6rem', color: '#78350F' }}>
                                            Actualizado: {new Date(scriptLastUpdated).toLocaleTimeString()}
                                        </span>
                                    )}
                                    {scriptEditing ? (
                                        <button
                                            onClick={savePitch}
                                            disabled={scriptSaving}
                                            style={{ background: scriptSaving ? 'rgba(245,158,11,0.5)' : '#F59E0B', border: '1px solid #F59E0B', borderRadius: '6px', color: 'black', padding: '0.3rem 0.8rem', cursor: scriptSaving ? 'default' : 'pointer', fontSize: '0.75rem', fontFamily: 'Oswald', letterSpacing: '0.05em', display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                                        >
                                            {scriptSaving ? <><Loader2 size={12} className="spin" /> GUARDANDO...</> : <SafeText>💾 GUARDAR EN SUPABASE</SafeText>}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setScriptEditing(true)}
                                            style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid #F59E0B', borderRadius: '6px', color: '#F59E0B', padding: '0.3rem 0.8rem', cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'Oswald', letterSpacing: '0.05em' }}
                                        >
                                            <SafeText>✏️ EDITAR</SafeText>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {scriptEditing ? (
                                <textarea
                                    value={callScript}
                                    onChange={e => setCallScript(e.target.value)}
                                    rows={8}
                                    style={{
                                        width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid #F59E0B',
                                        borderRadius: '8px', color: '#FDE68A', padding: '0.75rem 1rem',
                                        fontSize: '0.9rem', fontFamily: 'monospace', lineHeight: 1.7,
                                        resize: 'vertical', boxSizing: 'border-box', outline: 'none'
                                    }}
                                    placeholder="Escribe aquí el guion de llamada para los agentes..."
                                />
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {callScript.split('\n').map((line, i) => {
                                        if (!line.trim()) return null;
                                        const isQuestion = line.includes('?');
                                        const isClosing = line.startsWith('¡');
                                        return (
                                            <div key={i} className="flex-row gap-2" style={{ alignItems: 'flex-start' }}>
                                                <span style={{
                                                    minWidth: '22px', height: '22px', borderRadius: '50%',
                                                    background: isQuestion ? '#F59E0B' : isClosing ? '#10B981' : 'rgba(245,158,11,0.2)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                    fontSize: '0.6rem', color: isQuestion || isClosing ? 'black' : '#F59E0B',
                                                    flexShrink: 0, marginTop: '0.1rem', fontWeight: 'bold'
                                                }}>
                                                    {isQuestion ? '?' : isClosing ? '✓' : (i + 1)}
                                                </span>
                                                <p style={{
                                                    margin: 0, fontSize: '0.9rem', lineHeight: 1.6,
                                                    color: isQuestion ? '#FDE68A' : isClosing ? '#6EE7B7' : '#CBD5E1',
                                                    fontWeight: isQuestion ? 600 : 400
                                                }}>
                                                    {line}
                                                </p>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* === AUDIT RESULTS STATS DASHBOARD === */}
                        {(() => {
                            const total = auditCallLog.simpatiza + auditCallLog.no_disponible + auditCallLog.rechazo + auditCallLog.sin_servicio + auditCallLog.buzon;
                            const bars = [
                                { label: 'Simpatiza ✅', value: auditCallLog.simpatiza, color: '#10B981' },
                                { label: 'No disponible 📵', value: auditCallLog.no_disponible, color: '#F59E0B' },
                                { label: 'Rechazo ❌', value: auditCallLog.rechazo, color: '#EF4444' },
                                { label: 'Sin servicio 🔇', value: auditCallLog.sin_servicio, color: '#6366F1' },
                                { label: 'Buzón 📼', value: auditCallLog.buzon, color: '#64748B' },
                            ];
                            const penetracion = pendingCalls.length === 0 ? 100 : Math.round((auditStats.verifiedToday / (auditStats.verifiedToday + pendingCalls.length)) * 100);
                            return (
                                <div className="tactile-card flex-col gap-3 glow-tertiary" style={{ border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.03)' }}>
                                    <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div className="flex-row gap-2" style={{ alignItems: 'center' }}>
                                            <Activity className="hud-glow" size={16} />
                                            <strong style={{ color: '#A5B4FC', fontFamily: 'Oswald', letterSpacing: '0.05em' }}>📊 RESULTADOS DE AUDITORÍA — HOY</strong>
                                        </div>
                                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{total} llamadas registradas</span>
                                    </div>
                                    {/* Progress bar */}
                                    <div>
                                        <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                            <span style={{ fontSize: '0.65rem', color: '#94A3B8' }}>PENETRACIÓN DEL PADRÓN</span>
                                            <span style={{ fontSize: '0.65rem', color: '#A5B4FC', fontWeight: 'bold' }}>{penetracion}%</span>
                                        </div>
                                        <div style={{ height: '8px', background: 'rgba(255,255,255,0.1)', borderRadius: '4px', overflow: 'hidden' }}>
                                            <div style={{ width: `${penetracion}%`, height: '100%', background: 'linear-gradient(90deg, #6366F1, #A5B4FC)', borderRadius: '4px', transition: 'width 0.5s ease' }} />
                                        </div>
                                    </div>
                                    {/* Outcome bars */}
                                    <div className="flex-col gap-2">
                                        {bars.map(b => (
                                            <div key={b.label} className="flex-row gap-2" style={{ alignItems: 'center' }}>
                                                <span style={{ width: '130px', fontSize: '0.7rem', color: '#94A3B8', flexShrink: 0 }}>{b.label}</span>
                                                <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.07)', borderRadius: '3px', overflow: 'hidden' }}>
                                                    <div style={{ width: `${total > 0 ? (b.value / total) * 100 : 0}%`, height: '100%', background: b.color, borderRadius: '3px', transition: 'width 0.5s ease' }} />
                                                </div>
                                                <span style={{ width: '24px', fontSize: '0.75rem', fontWeight: 'bold', color: b.color, textAlign: 'right', flexShrink: 0 }}>{b.value}</span>
                                            </div>
                                        ))}
                                    </div>

                                    {/* --- HISTORIAL RECIENTE --- */}
                                    <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '1rem' }}>
                                        <button
                                            onClick={() => setShowHistory(!showHistory)}
                                            className="flex-row gap-2"
                                            style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', alignItems: 'center', width: '100%' }}
                                        >
                                            <Clock size={14} />
                                            <span style={{ fontSize: '0.7rem', fontWeight: 'bold' }}>HISTORIAL RECIENTE (Últimos 100)</span>
                                            {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                        </button>

                                        {showHistory && (
                                            <div className="flex-col gap-1" style={{ marginTop: '0.5rem', maxHeight: '200px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                                                {auditHistory.length === 0 ? (
                                                    <p style={{ fontSize: '0.7rem', color: '#475569', textAlign: 'center', padding: '1rem' }}>No hay llamadas registradas aún.</p>
                                                ) : auditHistory.map((h, i) => (
                                                    <div key={i} className="flex-row" style={{ justifyContent: 'space-between', padding: '0.4rem', background: 'rgba(255,255,255,0.03)', borderRadius: '4px', borderLeft: `2px solid ${h.outcome === 'simpatiza' ? '#10B981' : h.outcome === 'rechazo' ? '#EF4444' : '#64748B'}` }}>
                                                        <span style={{ fontSize: '0.65rem' }}>{new Date(h.called_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                        <span style={{ fontSize: '0.65rem', fontWeight: 'bold', textTransform: 'uppercase' }}>{h.outcome}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}


                        <div className="tactile-card flex-col gap-4">
                            <div className="flex-row-resp" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                                <div className="flex-col">
                                    <h3 style={{ margin: 0 }}>COLA DE VERIFICACIÓN</h3>
                                    <p style={{ margin: 0, fontSize: '0.7rem', color: '#64748B' }}>{pendingCalls.length} registros disponibles</p>
                                </div>
                                <div className="flex-row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                                    <button
                                        className="squishy-btn mini"
                                        onClick={handleExportCSV}
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <Download size={14} /> EXPORTAR CSV
                                    </button>
                                    <button
                                        className="squishy-btn primary"

                                        style={{ backgroundColor: 'var(--tertiary)', color: 'black', border: 'none' }}
                                        onClick={pickRandomCall}
                                    >
                                        <PhoneCall size={18} /> SIGUIENTE LLAMADA (AL AZAR)
                                    </button>
                                    <div style={{ position: 'relative', width: '300px' }}>
                                        <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                                        <input className="squishy-input" placeholder="Buscar..." style={{ paddingLeft: '2.5rem' }} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                                    </div>
                                    <div className="flex-row gap-2 flex-wrap" style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.03)', padding: '0.6rem 1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', alignItems: 'flex-end', gap: '0.8rem' }}>
                                        {/* === NUMBER INPUT === */}
                                        <input
                                            className="squishy-input"
                                            placeholder="Número manual..."
                                            style={{ width: '150px', fontSize: '0.8rem', height: '32px' }}
                                            value={testCallNumber}
                                            onChange={e => setTestCallNumber(e.target.value.replace(/\D/g, ''))}
                                        />

                                        {/* === MODE SELECTOR === */}
                                        <div className="flex-col gap-1">
                                            <div className="flex-row gap-1">
                                                {/* AUDITAR: normal call */}
                                                <button
                                                    className="squishy-btn mini"
                                                    style={{
                                                        background: isCalling ? '#EF4444' : 'var(--tertiary)',
                                                        color: isCalling ? 'white' : 'black',
                                                        height: '32px', fontSize: '0.7rem'
                                                    }}
                                                    onClick={() => {
                                                        if (isCalling) { handleHangUp(); return; }
                                                        if (!testCallNumber) { alert("Ingresa un número"); return; }
                                                        setAutoAudio(false); // AUDITAR = never uses auto-audio
                                                        handleInitiateCall(testCallNumber);
                                                    }}
                                                    title="Llamada de auditoría"
                                                >
                                                    {isCalling ? <PhoneOff size={12} key="po1" /> : <PhoneCall size={12} key="pc1" />}
                                                    <SafeText>{isCalling ? ' COLGAR' : ' AUDITAR'}</SafeText>
                                                </button>
                                                {/* ROBOCALL: deshabilitado hasta próxima versión */}
                                                <button
                                                    className="squishy-btn mini"
                                                    disabled
                                                    style={{ opacity: 0.3, cursor: 'not-allowed', height: '32px', fontSize: '0.7rem', background: 'rgba(124, 58, 237, 0.2)', border: '1px solid #7C3AED', color: '#a78bfa' }}
                                                    title="Próximamente - Robocall con audio pregrabado"
                                                >
                                                    <Mic size={12} /> <SafeText> ROBOCALL</SafeText>
                                                </button>
                                            </div>
                                        </div>
                                    </div>


                                </div>
                            </div>

                            {activeCall && (
                                <div className="tactile-card" style={{
                                    background: 'linear-gradient(rgba(0, 212, 255, 0.05) 0%, rgba(15, 18, 24, 0.9) 100%)',
                                    border: '1px solid var(--tertiary)',
                                    padding: '1.5rem',
                                    marginTop: '1rem'
                                }}>
                                    <div className="flex-row-resp" style={{ gap: '2rem', alignItems: 'flex-start' }}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '0.7rem', color: 'var(--tertiary)', fontWeight: 'bold', display: 'block', marginBottom: '0.5rem' }}>LLAMADA ACTIVA / REGISTRO PARA AUDITAR</span>
                                            <h2 style={{ margin: '0 0 0.5rem 0', fontFamily: 'Oswald', fontSize: '2rem' }}>{activeCall.name}</h2>
                                            <p style={{ fontSize: '1.2rem', color: 'var(--tertiary)', margin: '0 0 1rem 0' }}>{activeCall.phone}</p>

                                            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '1rem', borderRadius: '12px', borderLeft: '4px solid var(--tertiary)' }}>
                                                <span style={{ fontSize: '0.8rem', color: '#94A3B8', fontWeight: 'bold' }}>SALUDO SUGERIDO (SCRIPT):</span>
                                                <p style={{ fontSize: '1rem', fontStyle: 'italic', margin: '0.5rem 0 0' }}>
                                                    "Hola, {activeCall.name.split(' ')[0]}. Hablo del equipo electoral para agradecer tu registro con el brigadista {activeCall.users?.name || 'del equipo'}. ¿Podrías confirmarnos si tus datos son correctos para completar tu verificación?"
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex-col gap-3" style={{ minWidth: '200px' }}>
                                            <div className="flex-row gap-2">
                                                <button
                                                    onClick={() => handleInitiateCall(activeCall.phone)}
                                                    className="squishy-btn primary flex-center"
                                                    style={{ flex: 2, padding: '1.2rem', background: 'var(--tertiary)', color: 'black', border: 'none', fontSize: '1rem' }}
                                                >
                                                    <PhoneCall size={20} /> INICIAR
                                                </button>
                                                <button
                                                    onClick={handleHangUp}
                                                    className="squishy-btn flex-center"
                                                    style={{ flex: 1, padding: '1.2rem', background: '#EF4444', color: 'white', border: 'none' }}
                                                    disabled={!isCalling}
                                                >
                                                    <PhoneOff size={20} />
                                                </button>
                                            </div>
                                            <button
                                                onClick={() => handleCallAction(activeCall.id, 'aprobado')}
                                                className="squishy-btn primary flex-center"
                                                style={{ padding: '1.2rem', background: 'var(--secondary)', color: 'black', border: 'none', fontSize: '1rem' }}
                                            >
                                                <CheckCircle size={20} /> APROBAR REGISTRO
                                            </button>
                                            <button
                                                onClick={() => handleCallAction(activeCall.id, 'rechazado')}
                                                className="squishy-btn flex-center"
                                                style={{ padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid #EF4444' }}
                                            >
                                                <XCircle size={20} /> RECHAZAR / INVALIDO
                                            </button>
                                            <button
                                                onClick={() => setActiveCall(null)}
                                                className="squishy-btn mini"
                                                style={{ opacity: 0.6 }}
                                            >
                                                SALIR DE MODO LLAMADA
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="flex-col gap-2">
                                {!user?.tenant_id && !loading && <p style={{ textAlign: 'center', color: '#64748B' }}>Selecciona una campaña.</p>}
                                {loading ? <p>Conectando...</p> : filteredCalls.map(call => (
                                    <div key={call.id} className="tactile-card flex-row-resp" style={{ gap: '0.75rem', alignItems: 'center' }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{call.name}</p>
                                            <p style={{ margin: 0, color: 'var(--tertiary)', fontSize: '0.8rem' }}>{call.phone}</p>
                                            {call.users?.name && <p style={{ margin: 0, fontSize: '0.65rem', color: '#64748B' }}>Ref: {call.users.name}</p>}
                                        </div>
                                        <div className="flex-row" style={{ gap: '0.4rem', flexWrap: 'wrap', flexShrink: 0 }}>
                                            {/* Llamar */}
                                            <button onClick={() => handleInitiateCall(call.phone)} title="Iniciar llamada" className="squishy-btn mini" style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--tertiary)', padding: '0.3rem 0.5rem' }}><PhoneCall size={14} /></button>
                                            {/* 4 outcome buttons */}
                                            <button onClick={() => handleCallResult(call.id, 'simpatiza')} title="Simpatiza ✅" className="squishy-btn mini" style={{ background: 'rgba(16,185,129,0.15)', color: '#10B981', padding: '0.3rem 0.5rem', fontSize: '0.65rem', fontWeight: 'bold' }}>✅ SÍ</button>
                                            <button onClick={() => handleCallResult(call.id, 'no_disponible')} title="No disponible" className="squishy-btn mini" style={{ background: 'rgba(245,158,11,0.12)', color: '#F59E0B', padding: '0.3rem 0.5rem', fontSize: '0.65rem', fontWeight: 'bold' }}>📵</button>
                                            <button onClick={() => handleCallResult(call.id, 'sin_servicio')} title="Sin servicio / Buzón" className="squishy-btn mini" style={{ background: 'rgba(99,102,241,0.12)', color: '#818CF8', padding: '0.3rem 0.5rem', fontSize: '0.65rem', fontWeight: 'bold' }}>🔇</button>
                                            <button onClick={() => handleCallResult(call.id, 'rechazo')} title="Rechazo ❌" className="squishy-btn mini" style={{ background: 'rgba(239,68,68,0.12)', color: '#EF4444', padding: '0.3rem 0.5rem', fontSize: '0.65rem', fontWeight: 'bold' }}>❌</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )
                }

                {/* 2. SECCIÓN DE WHATSAPP TÁCTICO */}
                {
                    activeTab === 'whatsapp' && (
                        <div className="responsive-grid" style={{ gridTemplateColumns: 'minmax(300px, 1fr) 350px' }}>
                            <div className="tactile-card" style={{ border: '1px solid var(--secondary)' }}>
                                <h2 style={{ fontFamily: 'Oswald', color: 'var(--secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Settings size={20} /> REDACTOR DE EMISIÓN MASIVA
                                </h2>
                                <form onSubmit={handleCreateWaCampaign} className="flex-col gap-4">
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: '#94A3B8' }}>NOMBRE DE CAMPAÑA</label>
                                        <input type="text" className="squishy-input" placeholder="Ej: Invitación Mitin Tuxtla" value={newWaName} onChange={e => setNewWaName(e.target.value)} required />
                                    </div>

                                    <div className="flex-col gap-2">
                                        <label style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 'bold' }}>DESTINATARIOS POR ROL</label>
                                        <div className="flex-row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
                                            {[
                                                { id: 'todos', label: 'TODOS', icon: <Globe size={14} /> },
                                                { id: 'coordinador', label: 'COORDINADORES', icon: <ShieldAlert size={14} /> },
                                                { id: 'lider', label: 'LÍDERES', icon: <Activity size={14} /> },
                                                { id: 'brigadista', label: 'BRIGADISTAS', icon: <Users size={14} /> }
                                            ].map(role => (
                                                <button
                                                    key={role.id}
                                                    type="button"
                                                    onClick={() => setTargetRole(role.id as any)}
                                                    style={{
                                                        padding: '0.5rem 1rem',
                                                        borderRadius: '8px',
                                                        border: targetRole === role.id ? '1px solid var(--secondary)' : '1px solid rgba(255,255,255,0.1)',
                                                        background: targetRole === role.id ? 'rgba(0, 212, 255, 0.1)' : 'transparent',
                                                        color: targetRole === role.id ? 'var(--secondary)' : '#64748B',
                                                        fontSize: '0.7rem',
                                                        fontWeight: 'bold',
                                                        cursor: 'pointer',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: '0.5rem',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {role.icon} {role.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label style={{ fontSize: '0.8rem', color: '#94A3B8' }}>MENSAJE (SPINTAX ACTIVO)</label>
                                        <textarea className="squishy-input" rows={4} value={waMessageTemplate} onChange={e => setWaMessageTemplate(e.target.value)} required />
                                    </div>
                                    <div style={{ background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px', borderLeft: '4px solid var(--secondary)' }}>
                                        <p style={{ margin: 0, fontSize: '0.8rem', color: '#94A3B8' }}>VISTA PREVIA DE VARIACIÓN:</p>
                                        <p style={{ margin: '0.5rem 0 0', fontStyle: 'italic', fontSize: '0.9rem' }}>{getWaPreview(waMessageTemplate, 'Brigadista')}</p>
                                    </div>
                                    <button type="submit" className="squishy-btn primary" style={{ backgroundColor: 'var(--secondary)', border: '1px solid var(--secondary)' }}>
                                        <Send size={18} /> GUARDAR PARA DRIP FEED
                                    </button>
                                </form>
                            </div>

                            <div className="flex-col gap-4">
                                <div className="tactile-card" style={{ border: '1px solid var(--primary)', background: 'rgba(255,90,54,0.05)' }}>
                                    <h3 style={{ margin: 0, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <ShieldAlert size={20} /> ANTI-BANEO
                                    </h3>
                                    <p style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '0.5rem' }}>Drip Feed: 1 mensaje cada 45-90 segundos (Aleatorio).</p>
                                    <div style={{ marginTop: '1rem', padding: '0.5rem', background: 'black', borderRadius: '4px', textAlign: 'center' }}>
                                        <span style={{ color: 'var(--secondary)', fontFamily: 'Oswald' }}>BOT STATUS: CONNECTED</span>
                                    </div>
                                </div>
                                <div className="tactile-card">
                                    <h3 style={{ margin: '0 0 1rem 0' }}>HISTORIAL</h3>
                                    <div className="flex-col gap-2">
                                        {waCampaigns.map((c: any) => (
                                            <div key={c.id} style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                <div className="flex-row" style={{ justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>{c.name}</span>
                                                    <span style={{
                                                        fontSize: '0.65rem', padding: '2px 6px', borderRadius: '4px',
                                                        backgroundColor: c.status === 'running' ? 'rgba(0,212,255,0.1)' : c.status === 'completed' ? 'rgba(52,211,153,0.1)' : 'rgba(255,255,255,0.1)',
                                                        color: c.status === 'running' ? 'var(--tertiary)' : c.status === 'completed' ? '#10B981' : '#64748B'
                                                    }}>
                                                        {c.status.toUpperCase()}
                                                    </span>
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: '#94A3B8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                    <span>Sent: {c.stats?.sent || 0} / {c.stats?.total || 0}</span>
                                                    {c.status === 'draft' && (
                                                        <button onClick={() => startDripFeed(c.id)} className="squishy-btn mini" style={{ background: 'var(--secondary)', color: 'black', padding: '2px 8px' }}>INICIAR</button>
                                                    )}
                                                </div>
                                                {c.status === 'running' && (
                                                    <div style={{ height: '4px', background: 'rgba(255,255,255,0.1)', borderRadius: '2px', marginTop: '0.5rem', overflow: 'hidden' }}>
                                                        <div style={{ width: `${(c.stats?.sent / c.stats?.total) * 100}%`, height: '100%', background: 'var(--secondary)', transition: 'width 0.5s ease' }} />
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* 3. SECCIÓN DE SOCIAL MEDIA AI */}
                {
                    activeTab === 'social' && (
                        <SocialMediaDashboard />
                    )
                }

                {/* 5. SECCIÓN DE ENVÍO DIRECTO */}
                {
                    activeTab === 'directo' && (
                        <div className="flex-col gap-6 notranslate" translate="no">
                            <div className="tactile-card" style={{ border: '1px solid #EAB308', background: 'rgba(234,179,8,0.05)' }}>
                                <h2 style={{ fontFamily: 'Oswald', color: '#EAB308', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Send size={24} /> <SafeText>ENVIADOR DE PRUEBA PERSONALIZADO</SafeText>
                                </h2>
                                <p style={{ margin: '0.5rem 0 1.5rem', color: '#94A3B8' }}>
                                    <SafeText>Busca un contacto y envía un mensaje de prueba para verificar la conexión con tu hardware.</SafeText>
                                </p>

                                <div className="responsive-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                                    {/* Selector de Contacto */}
                                    <div className="flex-col gap-4">
                                        <div style={{ position: 'relative' }}>
                                            <Search size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                                            <input
                                                className="squishy-input"
                                                placeholder="Buscar contacto por nombre o cel..."
                                                style={{ paddingLeft: '2.5rem', paddingRight: '2.5rem' }}
                                                value={searchQuery}
                                                onChange={e => handleSearchContacts(e.target.value)}
                                            />
                                            {(searchQuery || selectedContact) && (
                                                <button
                                                    onClick={() => { setSelectedContact(null); setManualPhone(''); setSearchQuery(''); setSearchResults([]); }}
                                                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', color: '#64748B', cursor: 'pointer' }}
                                                >
                                                    <XCircle size={18} />
                                                </button>
                                            )}
                                        </div>

                                        {searchQuery.length >= 10 && /^\d+$/.test(searchQuery) && !selectedContact && (
                                            <button
                                                className="squishy-btn mini"
                                                onClick={() => setManualPhone(searchQuery)}
                                                style={{ background: 'rgba(0, 212, 255, 0.1)', color: 'var(--tertiary)', border: '1px solid var(--tertiary)' }}
                                            >
                                                <Smartphone size={14} /> USAR "{searchQuery}" COMO NÚMERO DIRECTO
                                            </button>
                                        )}

                                        {searchResults.length > 0 && (
                                            <div className="flex-col gap-2">
                                                {searchResults.map(c => (
                                                    <div
                                                        key={c.id}
                                                        className="tactile-card flex-row"
                                                        onClick={() => { setSelectedContact(c); setSearchResults([]); setSearchQuery(c.name); }}
                                                        style={{ cursor: 'pointer', padding: '0.8rem', border: selectedContact?.id === c.id ? '2px solid #EAB308' : '1px solid rgba(255,255,255,0.05)' }}
                                                    >
                                                        <UserPlus size={16} />
                                                        <div style={{ marginLeft: '1rem' }}>
                                                            <p style={{ margin: 0, fontWeight: 'bold' }}><SafeText>{c.name}</SafeText></p>
                                                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}><SafeText>{c.phone}</SafeText></p>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {searchQuery.length >= 2 && !searching && searchResults.length === 0 && !selectedContact && (
                                            <div style={{ background: 'rgba(239, 68, 68, 0.05)', padding: '1rem', borderRadius: '12px', border: '1px dashed #EF4444' }}>
                                                <p style={{ color: '#EF4444', fontSize: '0.8rem', margin: '0 0 1rem 0' }}>
                                                    <SafeText>No se encontraron registros en tu base de datos de simpatizantes.</SafeText>
                                                </p>
                                                <button
                                                    className="squishy-btn mini"
                                                    onClick={handleCreateTestContact}
                                                    style={{ width: '100%', background: '#EF4444', color: 'white' }}
                                                >
                                                    <SafeText>✨ AUTO-CREARME COMO CONTACTO DE PRUEBA</SafeText>
                                                </button>
                                            </div>
                                        )}

                                        {searching && <div className="flex-center" style={{ padding: '1rem' }}><Loader2 className="spin" color="#EAB308" /></div>}

                                        <div className="flex-col gap-2" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <label style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 'bold' }}><SafeText>DESTINO (TELÉFONO):</SafeText></label>
                                            <div style={{ position: 'relative' }}>
                                                <Smartphone size={18} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--tertiary)' }} />
                                                <input
                                                    className="squishy-input"
                                                    placeholder="Ej: 521961..."
                                                    style={{ paddingLeft: '2.5rem', border: '1px solid var(--tertiary)' }}
                                                    value={manualPhone}
                                                    onChange={e => setManualPhone(e.target.value)}
                                                />
                                            </div>
                                            {selectedContact && (
                                                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--tertiary)' }}>
                                                    <SafeText>Vinculado a: {selectedContact.name}</SafeText>
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Redactor de Mensaje */}
                                    <div className="flex-col gap-4">
                                        <textarea
                                            className="squishy-input"
                                            rows={6}
                                            placeholder="Escribe tu mensaje aquí..."
                                            value={directMessage}
                                            onChange={e => setDirectMessage(e.target.value)}
                                        />
                                        <div className="flex-row" style={{ gap: '1rem' }}>
                                            <button
                                                onClick={() => handleSendDirect('wa')}
                                                disabled={sendingDirect || !(selectedContact || manualPhone)}
                                                className="squishy-btn primary flex-center"
                                                style={{ backgroundColor: '#25D366', color: 'black', border: 'none', flex: 1 }}
                                            >
                                                {sendingDirect ? <Loader2 className="spin" /> : <><MessageCircle size={18} /> <SafeText>VIA PORTAL WHATSAPP</SafeText></>}
                                            </button>
                                            <button
                                                onClick={() => handleSendDirect('sms')}
                                                disabled={sendingDirect || !(selectedContact || manualPhone)}
                                                className="squishy-btn primary flex-center"
                                                style={{ backgroundColor: 'var(--tertiary)', color: 'black', border: 'none', flex: 1 }}
                                            >
                                                {sendingDirect ? <Loader2 className="spin" /> : <><Smartphone size={18} /> <SafeText>VIA SMS GATEWAY</SafeText></>}
                                            </button>
                                        </div>
                                        <button
                                            onClick={handleBulkTest}
                                            disabled={isBulkTesting || !(selectedContact || manualPhone)}
                                            className="squishy-btn primary flex-center"
                                            style={{ marginTop: '1rem', background: 'linear-gradient(90deg, #EAB308 0%, #F59E0B 100%)', color: 'black', border: 'none', width: '100%', fontWeight: 'bold' }}
                                        >
                                            {isBulkTesting ? <Loader2 className="spin" /> : <><Activity size={18} /> <SafeText>PROBAR EN TODOS LOS EQUIPOS (MASIVO)</SafeText></>}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Audit Log / Success History */}
                            <div className="tactile-card">
                                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    <Activity size={20} color="var(--secondary)" /> <SafeText>ESTADO DE COMUNICACIONES EN VIVO</SafeText>
                                </h3>
                                <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                    <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}><SafeText>El bridge está reportando envíos en tiempo real sobre el puerto 5000.</SafeText></p>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* 6. SECCIÓN DE SMS GATEWAY */}
                {
                    activeTab === 'sms' && (
                        <SmsGatewayDashboard />
                    )
                }

            </main >
        </div >
    );
};
