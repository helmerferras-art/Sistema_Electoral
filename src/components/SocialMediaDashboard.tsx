import { useState, useEffect, useMemo } from 'react';
import {
    Facebook, Instagram, Video, Sparkles,
    MessageSquare, Calendar, Clock, ChevronRight,
    User, Loader2, Send
} from 'lucide-react';
import { socialAiService } from '../lib/SocialAiService';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { socialPlatformService } from '../lib/SocialPlatformService';
import { bridgeDiscovery } from '../lib/bridgeDiscovery';

// --- Safe Text Component to prevent 3rd party DOM manipulation errors ---
const SafeText = ({ children, style }: { children: React.ReactNode, style?: React.CSSProperties }) => (
    <span translate="no" className="notranslate" style={style}>{children}</span>
);

interface SocialPost {
    id: string;
    network: 'facebook' | 'instagram' | 'tiktok';
    content: string;
    status: 'scheduled' | 'published';
    scheduled_at: string;
}

interface SocialAccount {
    id: string;
    network: 'facebook' | 'instagram' | 'tiktok';
    account_name: string;
    platform_account_id?: string;
    access_token?: string;
    status: 'connected' | 'error';
    last_sync: string;
}

interface SocialInboxItem {
    id: string;
    network?: string;
    comment: string;
    author?: string;
    sentiment?: 'positive' | 'neutral' | 'negative' | 'hostile';
    suggested_response?: string;
    status: 'pending' | 'replied' | 'discarded';
}

export const SocialMediaDashboard = () => {
    const { user } = useAuth();

    // --- State ---
    const [isLoadingInitial, setIsLoadingInitial] = useState(true);
    const [topic, setTopic] = useState('');
    const [network, setNetwork] = useState<'facebook' | 'instagram' | 'tiktok'>('facebook');
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatedPost, setGeneratedPost] = useState('');
    const [inbox, setInbox] = useState<SocialInboxItem[]>([]);
    const [analyzingIndex, setAnalyzingIndex] = useState<number | null>(null);
    const [posts, setPosts] = useState<SocialPost[]>([]);
    const [accounts, setAccounts] = useState<SocialAccount[]>([]);
    const [showConnections, setShowConnections] = useState(false);
    const [showManualConnect, setShowManualConnect] = useState<any | null>(null);
    const [manualForm, setManualForm] = useState({ account_name: '', access_token: '', platform_account_id: '' });


    // --- Stable Network Config ---
    const NETWORK_CONFIG = useMemo(() => ({
        facebook: { label: 'Facebook', icon: Facebook, color: '#1877F2', short: 'FB' },
        instagram: { label: 'Instagram', icon: Instagram, color: '#E4405F', short: 'IG' },
        tiktok: { label: 'TikTok', icon: Video, color: '#FFFFFF', short: 'TT' }
    }), []);

    // --- Data Fetching ---
    const fetchAccounts = async () => {
        if (!user?.tenant_id) return;
        const { data } = await supabase.from('social_accounts').select('*').eq('tenant_id', user.tenant_id);
        if (data) setAccounts(data);
        else setAccounts([
            { id: '1', network: 'facebook', account_name: 'Helmer Ferras Official', status: 'connected', last_sync: new Date().toISOString() },
            { id: '2', network: 'instagram', account_name: '@helmerferras', status: 'connected', last_sync: new Date().toISOString() }
        ]);
    };

    const fetchPosts = async () => {
        if (!user?.tenant_id) return;
        const { data } = await supabase.from('social_posts').select('*').eq('tenant_id', user.tenant_id).order('scheduled_at', { ascending: true });
        if (data) setPosts(data);
    };

    const fetchInbox = async () => {
        if (!user?.tenant_id) return;
        const { data } = await supabase.from('social_inbox').select('*').eq('tenant_id', user.tenant_id).eq('status', 'pending').order('created_at', { ascending: false });
        if (data) setInbox(data);
    };

    useEffect(() => {
        if (!user?.tenant_id) return;
        let isCurrent = true;
        const load = async () => {
            try {
                await Promise.all([fetchAccounts(), fetchPosts(), fetchInbox()]);
            } catch (err) {
                console.error("Error sync:", err);
            } finally {
                if (isCurrent) setIsLoadingInitial(false);
            }
        };
        load();

        // --- AUTOMATION PULSE (Check for scheduled posts) ---
        const pulseInterval = setInterval(async () => {
            const now = new Date().toISOString();
            const { data: duePosts } = await supabase
                .from('social_posts')
                .select('*')
                .eq('tenant_id', user.tenant_id)
                .eq('status', 'scheduled')
                .lte('scheduled_at', now);

            if (duePosts && duePosts.length > 0) {
                console.log(`[PULSE] Procesando ${duePosts.length} posts programados...`);
                for (const post of duePosts) {
                    const acc = accounts.find(a => a.network === post.network);
                    if (acc?.access_token) {
                        await socialPlatformService.publishPost(post.network, post.content, acc.access_token, acc.platform_account_id);
                    }
                    await supabase.from('social_posts').update({ status: 'published' }).eq('id', post.id);
                }
                fetchPosts();
            }
        }, 30000); // Check every 30s

        return () => {
            isCurrent = false;
            clearInterval(pulseInterval);
        };
    }, [user?.tenant_id, accounts]);


    // --- Actions ---
    const handleGenerate = async () => {
        if (!topic || isGenerating) return;
        setIsGenerating(true);
        try {
            const result = await socialAiService.generatePost({ network, topic, tone: 'energetic', objectives: ['voto'] });
            setGeneratedPost(result);
        } catch (e) { console.error(e); }
        finally { setIsGenerating(false); }
    };

    const handleSchedule = async () => {
        if (!user?.tenant_id || !generatedPost) return;
        const acc = accounts.find(a => a.network === network);
        let platformResult = null;
        if (acc?.access_token && acc?.platform_account_id) {
            try {
                platformResult = await socialPlatformService.publishPost(network, generatedPost, acc.access_token!, acc.platform_account_id!);
            } catch (e) { console.error(e); }
        }
        const sched = new Date(); sched.setHours(sched.getHours() + 4);
        const { data } = await supabase.from('social_posts').insert([{
            tenant_id: user.tenant_id, network, content: generatedPost, status: platformResult ? 'published' : 'scheduled', scheduled_at: sched.toISOString()
        }]).select();
        if (data) { setPosts([...posts, data[0]]); setGeneratedPost(''); setTopic(''); }
    };

    const handleAnalyze = async (idx: number) => {
        setAnalyzingIndex(idx);
        try {
            const item = inbox[idx];
            const analysis = await socialAiService.analyzeComment(item.comment);
            const { data } = await supabase.from('social_inbox').update({ sentiment: analysis.sentiment, suggested_response: analysis.suggestedResponse }).eq('id', item.id).select();
            if (data) {
                const newInbox = [...inbox];
                newInbox[idx] = { ...item, sentiment: analysis.sentiment, suggested_response: analysis.suggestedResponse };
                setInbox(newInbox);
                return data[0];
            }
        } catch (e) { console.error(e); }
        finally { setAnalyzingIndex(null); }
        return null;
    };

    const handleAutoReply = async (idx: number) => {
        setAnalyzingIndex(idx);
        try {
            let item = inbox[idx];
            // 1. Analyze if not analyzed
            if (!item.suggested_response) {
                const updated = await handleAnalyze(idx);
                if (updated) item = updated;
            }

            if (!item.suggested_response) return;

            // 2. Find account and reply
            const acc = accounts.find(a => a.network === (item.network || network));
            if (acc?.access_token) {
                await socialPlatformService.publishReply(acc.network, item.id, item.suggested_response, acc.access_token);
            }

            // 3. Mark as replied
            await supabase.from('social_inbox').update({ status: 'replied' }).eq('id', item.id);
            setInbox(prev => prev.filter(it => it.id !== item.id));
            alert("✅ Auto-respuesta enviada con éxito.");

        } catch (e) {
            console.error(e);
            alert("Error en auto-respuesta.");
        } finally {
            setAnalyzingIndex(null);
        }
    };


    const handleAutoConnect = async (netId: 'facebook' | 'instagram' | 'tiktok') => {
        const clientId = (window as any)._SOCIAL_CONFIG?.[netId]?.clientId;
        if (!clientId) {
            alert("⚠️ Configura el Client ID para esta red.");
            return;
        }
        try {
            const baseUrl = await bridgeDiscovery.getBaseUrl();
            if (!baseUrl) throw new Error("Bridge not found");

            const res = await fetch(`${baseUrl}/harvest-token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ network: netId, clientId })
            });
            const result = await res.json();
            if (result.data) {
                await socialPlatformService.saveToken(user!.tenant_id, netId, `${netId.toUpperCase()} Auto`, result.data.access_token || result.data.code, result.data.platform_id || 'me');
                fetchAccounts();
                alert(`✅ ${netId.toUpperCase()} conectado.`);
            }
        } catch (e) { alert("Error conectando con el Bridge."); }
    };

    const handleManualSave = async () => {
        if (!user?.tenant_id || !showManualConnect) return;
        const { error } = await socialPlatformService.saveToken(
            user.tenant_id,
            showManualConnect,
            manualForm.account_name || `${showManualConnect.toUpperCase()} Manual`,
            manualForm.access_token,
            manualForm.platform_account_id
        );
        if (error) {
            alert("Error guardando token: " + error.message);
        } else {
            fetchAccounts();
            setShowManualConnect(null);
            setManualForm({ account_name: '', access_token: '', platform_account_id: '' });
        }
    };

    const toggleAccount = async (netId: 'facebook' | 'instagram' | 'tiktok') => {
        const existing = accounts.find(a => a.network === netId);
        if (existing) {
            await supabase.from('social_accounts').delete().eq('id', existing.id);
            setAccounts(prev => prev.filter(a => a.id !== existing.id));
        } else {
            setShowManualConnect(netId);
        }
    };


    if (!user) return <div style={{ padding: '2rem' }}><SafeText>Iniciando sesión...</SafeText></div>;
    if (isLoadingInitial) return <div style={{ padding: '2rem', display: 'flex', alignItems: 'center', gap: '1rem' }}><Loader2 className="spin" /> <SafeText>Sincronizando...</SafeText></div>;

    return (
        <div className="flex-col gap-6 notranslate" translate="no" style={{ width: '100%' }}>
            {/* HEADER */}
            <div className="flex-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ fontFamily: 'Oswald', margin: 0, fontSize: '1.5rem' }}><SafeText>CENTRO DE REDES SOCIALES</SafeText></h1>
                <button
                    className="squishy-btn"
                    onClick={() => setShowConnections(!showConnections)}
                    style={{ background: showConnections ? 'var(--secondary)' : 'rgba(255,255,255,0.05)', color: showConnections ? 'black' : 'white' }}
                >
                    <SafeText>{showConnections ? 'CERRAR CONEXIONES' : 'GESTIONAR CUENTAS'}</SafeText>
                </button>
            </div>

            {/* CONNECTIONS PANEL */}
            {showConnections && (
                <div className="tactile-card" style={{ border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.2)' }}>
                    <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
                        {Object.entries(NETWORK_CONFIG).map(([id, config]) => {
                            const acc = accounts.find(a => a.network === id);
                            const Icon = config.icon;
                            return (
                                <div key={id} className="tactile-card flex-row" style={{ gap: '1rem', alignItems: 'center', background: 'rgba(255,255,255,0.03)' }}>
                                    <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(0,0,0,0.3)' }}><Icon size={20} color={config.color} /></div>
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, fontWeight: 'bold', fontSize: '0.85rem' }}><SafeText>{acc ? acc.account_name : `${config.label} Desconectado`}</SafeText></p>
                                        <p style={{ margin: 0, fontSize: '0.65rem', color: acc ? '#10B981' : '#64748B' }}><SafeText>{acc ? 'CONECTADO' : 'POR VINCULAR'}</SafeText></p>
                                    </div>
                                    <div className="flex-row" style={{ gap: '0.4rem' }}>
                                        {!acc && <button className="squishy-btn mini" onClick={() => handleAutoConnect(id as any)} style={{ background: 'var(--accent)', color: 'white' }} title="Conexión asistida (Requiere configuración de App)"><SafeText>VINCULAR ⭐</SafeText></button>}
                                        <button className="squishy-btn mini" onClick={() => toggleAccount(id as any)} style={{ background: acc ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.1)', color: acc ? '#EF4444' : 'white' }}><SafeText>{acc ? 'QUITAR' : 'MANUAL 🔑'}</SafeText></button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {showManualConnect && (
                        <div style={{ marginTop: '1.5rem', padding: '1.5rem', background: 'rgba(255,255,255,0.03)', borderRadius: '12px', border: '1px solid var(--accent)' }}>
                            <h3 style={{ margin: '0 0 1rem 0', fontFamily: 'Oswald', color: 'var(--accent)' }}>CONECTAR {showManualConnect.toUpperCase()} MANUALMENTE</h3>
                            <div className="responsive-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="flex-col gap-2">
                                    <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>NOMBRE DE LA CUENTA (Alias)</label>
                                    <input className="squishy-input" value={manualForm.account_name} onChange={e => setManualForm({ ...manualForm, account_name: e.target.value })} placeholder="Ej: Fanpage Oficial" />
                                </div>
                                <div className="flex-col gap-2">
                                    <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>ID DE PLATAFORMA (Page ID / User ID)</label>
                                    <input className="squishy-input" value={manualForm.platform_account_id} onChange={e => setManualForm({ ...manualForm, platform_account_id: e.target.value })} placeholder="Obligatorio para publicar" />
                                </div>
                                <div className="flex-col gap-2" style={{ gridColumn: 'span 2' }}>
                                    <label style={{ fontSize: '0.75rem', color: '#94A3B8' }}>TOKEN DE ACCESO (Access Token)</label>
                                    <textarea className="squishy-input" rows={2} value={manualForm.access_token} onChange={e => setManualForm({ ...manualForm, access_token: e.target.value })} placeholder="Pega aquí el token generado en Graph API o Developer Portal" />
                                </div>
                            </div>
                            <div className="flex-row gap-3" style={{ marginTop: '1rem', justifyContent: 'flex-end' }}>
                                <button className="squishy-btn" onClick={() => setShowManualConnect(null)}><SafeText>CANCELAR</SafeText></button>
                                <button className="squishy-btn primary" onClick={handleManualSave} style={{ background: 'var(--accent)', border: 'none' }}><SafeText>GUARDAR CONEXIÓN</SafeText></button>
                            </div>
                        </div>
                    )}
                </div>
            )}


            <div className="responsive-grid" style={{ gridTemplateColumns: '1fr 1.2fr' }}>
                {/* IA GENIUS BAR */}
                <div className="tactile-card" style={{ border: '1px solid var(--accent)', background: 'linear-gradient(rgba(168, 85, 247, 0.05) 0%, rgba(15, 18, 24, 0.95) 100%)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem' }}>
                        <div style={{ padding: '0.6rem', background: 'rgba(168, 85, 247, 0.1)', borderRadius: '10px' }}><Sparkles size={24} color="var(--accent)" /></div>
                        <h2 style={{ fontFamily: 'Oswald', margin: 0 }}><SafeText>AI GENIUS BAR</SafeText></h2>
                    </div>
                    <div className="flex-col gap-4">
                        <div className="flex-row" style={{ gap: '0.5rem' }}>
                            {Object.entries(NETWORK_CONFIG).map(([id, config]) => {
                                const isConnected = accounts.some(a => a.network === id);
                                const Icon = config.icon;
                                return (
                                    <button key={id} onClick={() => setNetwork(id as any)} className={`squishy-btn mini ${network === id ? 'active' : ''}`} style={{ flex: 1, backgroundColor: network === id ? config.color : 'rgba(255,255,255,0.03)', color: network === id ? 'white' : '#64748B', position: 'relative' }}>
                                        <div style={{ position: 'absolute', top: '-4px', right: '-4px', width: '8px', height: '8px', borderRadius: '50%', background: isConnected ? '#10B981' : '#64748B', border: '2px solid #0f1218' }} />
                                        <Icon size={18} /> <SafeText>{config.short}</SafeText>
                                    </button>
                                );
                            })}
                        </div>
                        <textarea className="squishy-input" rows={3} placeholder="Describe el tema..." value={topic} onChange={e => setTopic(e.target.value)} />
                        <button className="squishy-btn primary" style={{ backgroundImage: 'linear-gradient(90deg, #A855F7 0%, #EC4899 100%)', border: 'none' }} onClick={handleGenerate} disabled={isGenerating || !topic || !accounts.some(a => a.network === network)}>
                            <SafeText>{isGenerating ? "GENERANDO..." : "GENERAR POST ⭐"}</SafeText>
                        </button>
                        {generatedPost && (
                            <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.4)', borderRadius: '12px', borderLeft: '4px solid var(--accent)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <SafeText style={{ fontSize: '0.7rem', color: 'var(--accent)', fontWeight: 'bold' }}>BORRADOR IA</SafeText>
                                    <button className="squishy-btn mini" onClick={handleSchedule}><SafeText>PUBLICAR/PROG</SafeText></button>
                                </div>
                                <p style={{ margin: 0, fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}><SafeText>{generatedPost}</SafeText></p>
                            </div>
                        )}
                    </div>
                </div>

                {/* SOCIAL INBOX */}
                <div className="tactile-card">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem' }}>
                        <div style={{ padding: '0.6rem', background: 'rgba(52, 211, 153, 0.1)', borderRadius: '10px' }}><MessageSquare size={24} color="#34D399" /></div>
                        <h2 style={{ fontFamily: 'Oswald', margin: 0 }}><SafeText>SOCIAL INBOX AI</SafeText></h2>
                    </div>
                    <div className="flex-col gap-3">
                        {inbox.length === 0 && <p style={{ textAlign: 'center', color: '#64748B' }}><SafeText>Sin comentarios.</SafeText></p>}
                        {inbox.map((item, idx) => (
                            <div key={item.id} className="tactile-card" style={{ padding: '0.8rem', background: 'rgba(255,255,255,0.02)' }}>
                                <div className="flex-row" style={{ gap: '0.8rem', alignItems: 'flex-start' }}>
                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#334155', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><User size={18} color="#94A3B8" /></div>
                                    <div style={{ flex: 1 }}>
                                        <SafeText style={{ fontSize: '0.75rem', fontWeight: 'bold' }}>{item.author || 'S. Ciudadano'}</SafeText>
                                        <p style={{ margin: '0.2rem 0', fontSize: '0.85rem' }}><SafeText>{item.comment}</SafeText></p>
                                        {!item.suggested_response ? (
                                            <div className="flex-row gap-2">
                                                <button className="squishy-btn mini" onClick={() => handleAnalyze(idx)} disabled={analyzingIndex !== null}>
                                                    <SafeText>{analyzingIndex === idx ? "Analizando..." : "RESPONDER"}</SafeText>
                                                </button>
                                                <button className="squishy-btn mini" onClick={() => handleAutoReply(idx)} style={{ background: 'var(--accent)', color: 'black' }} disabled={analyzingIndex !== null}>
                                                    <Sparkles size={12} /> <SafeText>AUTO-REPLY</SafeText>
                                                </button>
                                            </div>
                                        ) : (
                                            <div style={{ marginTop: '0.5rem' }}>
                                                <div style={{ padding: '0.5rem', background: 'rgba(52,211,153,0.05)', borderRadius: '8px', marginBottom: '0.5rem' }}>
                                                    <SafeText style={{ fontSize: '0.65rem', color: '#34D399' }}>IA SUGIERE: </SafeText>
                                                    <p style={{ margin: 0, fontSize: '0.8rem' }}><SafeText>"{item.suggested_response}"</SafeText></p>
                                                </div>
                                                <button className="squishy-btn mini" onClick={() => handleAutoReply(idx)} style={{ background: 'var(--accent)', color: 'black' }}>
                                                    <Send size={12} /> <SafeText>ENVIAR SUGERENCIA</SafeText>
                                                </button>
                                            </div>
                                        )}

                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* CONTENT PLANNER */}
            <div className="tactile-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem', marginBottom: '1.5rem' }}>
                    <div style={{ padding: '0.6rem', background: 'rgba(0, 212, 255, 0.1)', borderRadius: '10px' }}><Calendar size={24} color="var(--tertiary)" /></div>
                    <h2 style={{ fontFamily: 'Oswald', margin: 0 }}><SafeText>PLANNER ESTRATÉGICO</SafeText></h2>
                </div>
                <div className="responsive-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                    {posts.length === 0 && <p style={{ color: '#64748B' }}><SafeText>Sin posts.</SafeText></p>}
                    {posts.map(post => {
                        const Icon = NETWORK_CONFIG[post.network]?.icon || Video;
                        return (
                            <div key={post.id} className="tactile-card flex-row" style={{ gap: '1rem', background: 'rgba(255,255,255,0.02)' }}>
                                <div style={{ padding: '0.8rem', background: 'rgba(0,0,0,0.3)', borderRadius: '10px' }}><Icon size={20} /></div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <SafeText style={{ fontSize: '0.65rem', color: 'var(--tertiary)' }}>{post.status.toUpperCase()}</SafeText>
                                        <SafeText style={{ fontSize: '0.65rem', color: '#64748B' }}><Clock size={10} /> {new Date(post.scheduled_at).toLocaleTimeString()}</SafeText>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.85rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}><SafeText>{post.content}</SafeText></p>
                                </div>
                                <ChevronRight size={18} color="#475569" />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
