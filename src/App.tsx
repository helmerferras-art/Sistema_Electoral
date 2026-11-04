import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Map as MapIcon, Users, List, Star, ShieldAlert, LogOut, Bell, X, Archive, Target, Activity as ActivityIcon, Camera, UserCog } from 'lucide-react'
import { RegistroForm } from './components/RegistroForm'
const MapView = lazy(() => import('./components/MapView').then(m => ({ default: m.MapView })));
const BrigadistaDashboard = lazy(() => import('./components/BrigadistaDashboard').then(m => ({ default: m.BrigadistaDashboard })));
const DiaDDashboard = lazy(() => import('./components/DiaDDashboard').then(m => ({ default: m.DiaDDashboard })));
const HighCommandDashboard = lazy(() => import('./components/HighCommandDashboard').then(m => ({ default: m.HighCommandDashboard })));
import { OnboardingFlow } from './components/OnboardingFlow'
import { LoginPage } from './components/LoginPage'
const SuperAdminDashboard = lazy(() => import('./components/SuperAdminDashboard').then(m => ({ default: m.SuperAdminDashboard })));
const SuppliesDashboard = lazy(() => import('./components/SuppliesDashboard'));
const MySupplies = lazy(() => import('./components/MySupplies'));
const CommunicationsDashboard = lazy(() => import('./components/CommunicationsDashboard').then(m => ({ default: m.CommunicationsDashboard })));
const DigitalCommunicationsDashboard = lazy(() => import('./components/DigitalCommunicationsDashboard').then(m => ({ default: m.DigitalCommunicationsDashboard })));
const CandidateDashboard = lazy(() => import('./components/CandidateDashboard').then(m => ({ default: m.CandidateDashboard })));
const CriticalPath = lazy(() => import('./components/CriticalPath').then(m => ({ default: m.CriticalPath })));
const CandidateLanding = lazy(() => import('./components/CandidateLanding').then(m => ({ default: m.CandidateLanding })));
const PetitionsForm = lazy(() => import('./components/PetitionsForm').then(m => ({ default: m.PetitionsForm })));
const VerifyVisit = lazy(() => import('./components/VerifyVisit').then(m => ({ default: m.VerifyVisit })));
const DeleteAccountPage = lazy(() => import('./components/DeleteAccountPage').then(m => ({ default: m.DeleteAccountPage })));
const MyAccount = lazy(() => import('./components/MyAccount').then(m => ({ default: m.MyAccount })));
const GoalsCascade = lazy(() => import('./components/GoalsCascade').then(m => ({ default: m.GoalsCascade })));
const FieldActivity = lazy(() => import('./components/FieldActivity').then(m => ({ default: m.FieldActivity })));
const EventsModule = lazy(() => import('./components/EventsModule').then(m => ({ default: m.EventsModule })));
const PublicEvent = lazy(() => import('./components/PublicEvent').then(m => ({ default: m.PublicEvent })));
const LegalPage = lazy(() => import('./components/LegalPage').then(m => ({ default: m.LegalPage })));
const PublicJoin = lazy(() => import('./components/PublicJoin').then(m => ({ default: m.PublicJoin })));
const ReferralNetwork = lazy(() => import('./components/ReferralNetwork').then(m => ({ default: m.ReferralNetwork })));
const WalkZones = lazy(() => import('./components/WalkZones').then(m => ({ default: m.WalkZones })));
const Landing = lazy(() => import('./components/Landing').then(m => ({ default: m.Landing })));
const DemoPage = lazy(() => import('./components/DemoLauncher').then(m => ({ default: m.DemoPage })));
const SignupPage = lazy(() => import('./components/SignupPage').then(m => ({ default: m.SignupPage })));
const QuotePage = lazy(() => import('./components/QuotePage').then(m => ({ default: m.QuotePage })));
const PublicMapView = lazy(() => import('./components/PublicMapView').then(m => ({ default: m.PublicMapView })));
import { AuthProvider, useAuth } from './lib/AuthContext'
import { NotificationProvider, useNotifications } from './lib/NotificationContext'
import { supabase } from './lib/supabase'
import { SetupWizard } from './components/SetupWizard'
import { PlanBar } from './components/PlanBar'
import { useMyPlan, endDemo } from './lib/demo'
import './index.css'

const PageLoader = () => <div className="flex-center" style={{ minHeight: '40vh', color: 'var(--primary)' }}>Cargando módulo...</div>;

// --- Protected Route Wrapper ---
import { PasswordSetModal } from './components/PasswordSetModal';
import { Settings } from 'lucide-react';

const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string | string[] }) => {
  const { session, user, loading, profileMissing } = useAuth();

  if (loading) return <div className="flex-center" style={{ height: '100vh', backgroundColor: 'var(--bg-color)', color: 'var(--primary)' }}>Cargando Sistemas...</div>;
  if (!session) return <Navigate to="/login" replace />;
  // Entró con Google pero aún no crea su campaña
  if (!user && profileMissing) return <Navigate to="/registro" replace />;

  // Basic RBAC
  if (requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(user?.role || '') && user?.role !== 'superadmin') {
      return <div className="flex-center flex-col gap-2" style={{ height: '100vh', backgroundColor: 'var(--bg-color)' }}>
        <ShieldAlert size={48} color="red" />
        <h2 style={{ color: 'red', fontFamily: 'Oswald, sans-serif' }}>ACCESO DENEGADO</h2>
        <p style={{ color: '#888' }}>No tienes el nivel de autorización requerido.</p>
      </div>
    }
  }

  // Generic redirect if a superadmin tries to access the regular app Dashboard
  if (!requiredRole && user?.role === 'superadmin') {
    return <Navigate to="/superadmin" replace />;
  }

  return <>{children}</>;
};

const MANDO_ROLES = ['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial'];

const ROLE_LABEL: Record<string, string> = {
  superadmin: 'Administración', candidato: 'Candidato(a)', coordinador_campana: 'Coordinación de campaña',
  coordinador: 'Coordinación', coordinador_territorial: 'Coordinación territorial', lider: 'Líder', brigadista: 'Brigadista',
  comunicacion: 'Comunicación', comunicacion_digital: 'Comunicación digital', coordinador_logistica: 'Logística',
};

/** Pestañas con nombres sencillos. Cada perfil ve solo lo que usa, en el orden en que lo usa. */
const navTabs = (role: string, diaDActive: boolean) => {
  const mando = MANDO_ROLES.includes(role);
  const T = {
    crm: { id: 'crm', icon: <List size={22} />, label: mando ? 'Tablero' : 'Equipo' },
    campo: { id: 'campo', icon: <Camera size={22} />, label: 'Campo' },
    profile: { id: 'profile', icon: <Users size={22} />, label: 'Registrar' },
    map: { id: 'map', icon: <MapIcon size={22} />, label: 'Mapa' },
    metas: { id: 'OBJETIVOS', icon: <Target size={22} />, label: 'Metas' },
    material: { id: 'suministros', icon: <Archive size={22} />, label: 'Material' },
    diad: { id: 'dia-d', icon: <ActivityIcon size={22} />, label: 'Día D' },
    admin: { id: 'admin', icon: <ShieldAlert size={22} />, label: 'Admin' },
  };
  const diad = diaDActive || mando ? [T.diad] : [];
  if (role === 'brigadista') return [T.campo, T.profile, T.metas, T.map, ...(diaDActive ? [T.diad] : [T.material])];
  if (role === 'lider') return [T.campo, T.profile, T.crm, T.metas, T.map, ...(diaDActive ? [T.diad] : [])];
  if (role === 'coordinador_logistica') return [T.material, T.crm, T.map, ...diad];
  if (role === 'comunicacion' || role === 'comunicacion_digital') return [T.crm, T.metas, T.map, ...diad];
  if (role === 'coordinador') return [T.crm, T.campo, T.profile, T.map, T.metas, T.material, ...diad];
  return [T.crm, T.campo, T.profile, T.map, T.metas, T.material, ...diad, ...(role === 'superadmin' ? [T.admin] : [])];
};

// --- Main Brigadista/Lider Dashboard (The PWA Core) ---
const MainDashboard = () => {
  const [activeTab, setActiveTab] = useState('profile')
  const { user, signOut, isImpersonating, abortImpersonation } = useAuth(); // SaaS User Info

  // El brigadista abre directo en su bitácora de campo
  useEffect(() => {
    const r = user?.role || '';
    if (['brigadista', 'lider'].includes(r)) setActiveTab('campo');
    else if (MANDO_ROLES.includes(r) || ['comunicacion', 'comunicacion_digital'].includes(r)) setActiveTab('crm');
    else if (r === 'coordinador_logistica') setActiveTab('suministros');
  }, [user?.role]);
  const { notifications, unreadCount, markAsRead, toasts, removeToast } = useNotifications();
  const plan = useMyPlan(!!user);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [showAccount, setShowAccount] = useState(false);

  // Legacy Onboarding Logic (We'll integrate this tightly with Auth in the future, for now local is fine MVP)
  const [hasOnboarded, setHasOnboarded] = useState(false)
  const [agentContext, setAgentContext] = useState({ name: '', xp: 0, rank: 'Explorador', levelProgression: 0 })
  const [diaDActive, setDiaDActive] = useState(false)

  // Fetch Dia D Status
  useEffect(() => {
    if (!user?.tenant_id) return;
    const fetchDiaDStatus = async () => {
      const { data } = await supabase.from('tenants').select('dia_d_active').eq('id', user.tenant_id).single();
      if (data) setDiaDActive(!!data.dia_d_active);
    };
    fetchDiaDStatus();

    // Subscribe to tenant changes (in case High Command toggles it while others are active)
    const channel = supabase.channel('tenant_dia_d_updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tenants', filter: `id=eq.${user.tenant_id}` },
        (payload: any) => {
          if (payload.new.hasOwnProperty('dia_d_active')) {
            setDiaDActive(!!payload.new.dia_d_active);
          }
        }).subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.tenant_id]);

  useEffect(() => {
    const handleTabChange = (e: any) => {
      if (e.detail) {
        setActiveTab(e.detail);
      }
    };
    window.addEventListener('changeTab', handleTabChange);
    return () => window.removeEventListener('changeTab', handleTabChange);
  }, []);

  const loadAgentContext = () => {
    if (user) {
      // If user has not completed onboarding, force it
      // Bienvenida + aviso de privacidad una sola vez; la contraseña se pide después (PasswordSetModal)
      setHasOnboarded(!!user.privacy_version);
      setAgentContext({
        name: user.name,
        xp: user.xp || 0,
        rank: user.rank_name || 'Explorador Nivel 1',
        levelProgression: ((user.xp || 0) % 500) / 500 * 100
      });
    }
  }

  useEffect(() => {
    loadAgentContext()
    window.addEventListener('storage', loadAgentContext)
    return () => window.removeEventListener('storage', loadAgentContext)
  }, [user])

  const handleOnboardingComplete = () => {
    // Note: The actual database update is now inside OnboardingFlow.tsx 
    // We just need to trigger the local state update
    setHasOnboarded(true);
    // Refresh user context if needed or just let it re-render
  }

  if (!hasOnboarded) {
    return <OnboardingFlow onComplete={handleOnboardingComplete} />
  }

  return (
    <div className="app-container">
      {isImpersonating && (
        <div style={{
          background: 'linear-gradient(90deg, #dc2626 0%, #991b1b 100%)',
          color: 'white', padding: '0.8rem', textAlign: 'center',
          fontFamily: 'Oswald, sans-serif', fontSize: '0.9rem',
          display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem',
          position: 'sticky', top: 0, zIndex: 9999,
          boxShadow: '0 4px 15px rgba(220, 38, 38, 0.4)'
        }}>
          <ShieldAlert className="pulsate" size={20} />
          <span>MODO FANTASMA ACTIVO: OPERANDO COMO <strong>{user?.name?.toUpperCase()}</strong></span>
          <button onClick={abortImpersonation} className="squishy-btn mini flex-center" style={{ padding: '0.4rem 1rem', background: 'rgba(0,0,0,0.5)', color: '#fca5a5', border: '1px solid #fca5a5', fontSize: '0.8rem', gap: '0.5rem' }}>
            <X size={14} /> ABORTAR
          </button>
        </div>
      )}
      <PlanBar plan={plan} role={user?.role} />
      {/* HUD (Heads-Up Display) - Optimized for Mobile */}
      <header className="hud-header" style={{
        backgroundColor: 'rgba(15, 18, 24, 0.95)',
        borderBottom: '1px solid var(--primary)',
        padding: '0.5rem 1rem',
        color: 'white',
        boxShadow: '0 4px 15px rgba(255, 90, 54, 0.2)',
        zIndex: 100,
        position: 'sticky',
        top: 0
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 'var(--header-height)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', minWidth: 0 }}>
            <div aria-hidden="true" style={{
              width: 42, height: 42, minWidth: 42, borderRadius: '50%', background: 'var(--primary)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.05rem'
            }}>
              {(user?.name || agentContext.name || '?').trim().charAt(0).toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                Hola, {(user?.name || agentContext.name || '').split(' ')[0]}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94A3B8' }}>{ROLE_LABEL[user?.role || ''] || 'Equipo'}</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(0.5rem, 2vw, 1.5rem)' }}>
            <div style={{
              backgroundColor: 'rgba(0, 212, 255, 0.1)',
              padding: '0.3rem 0.6rem',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              border: '1px solid var(--tertiary)',
            }}>
              <Star size={16} color="var(--tertiary)" />
              <span className="tactical-font" style={{ fontSize: '1.1rem', color: 'var(--tertiary)' }}>
                {user?.xp || agentContext.xp || 0} <span style={{ fontSize: '0.7rem' }}>pts</span>
              </span>
            </div>

            <div style={{ position: 'relative', display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', position: 'relative', minWidth: 'var(--touch-target)', height: 'var(--touch-target)' }}
              >
                <Bell size={24} color="var(--primary)" />
                {unreadCount > 0 && (
                  <span style={{
                    position: 'absolute', top: 5, right: 5,
                    backgroundColor: 'red', color: 'white', borderRadius: '50%',
                    width: '18px', height: '18px', fontSize: '0.7rem',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', fontWeight: 'bold'
                  }}>
                    {unreadCount}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0,
                  width: 'min(90vw, 320px)', maxHeight: '60vh', overflowY: 'auto',
                  backgroundColor: 'rgba(10, 15, 25, 0.98)', border: '1px solid var(--primary)',
                  borderRadius: '12px', zIndex: 9999, boxShadow: '0 10px 30px rgba(0,0,0,0.8)',
                  backdropFilter: 'blur(20px)', padding: '1rem'
                }}>
                  <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '0.5rem', marginBottom: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span className="tactical-font" style={{ color: 'var(--tertiary)', fontSize: '1.2rem' }}>CENTRO DE MANDO</span>
                    <X size={20} onClick={() => setShowNotifMenu(false)} style={{ cursor: 'pointer' }} />
                  </div>
                  {notifications.length === 0 ? (
                    <p style={{ color: '#888', fontSize: '0.9rem', textAlign: 'center', padding: '1rem' }}>No hay alertas recientes.</p>
                  ) : (
                    notifications.map(n => (
                      <div
                        key={n.id}
                        onClick={() => { if (!n.is_read) markAsRead(n.id) }}
                        style={{
                          padding: '0.8rem', borderRadius: '8px', marginBottom: '0.6rem',
                          backgroundColor: n.is_read ? 'rgba(255,255,255,0.03)' : 'rgba(255, 90, 54, 0.1)',
                          borderLeft: `4px solid ${n.type === 'achievement' ? '#FFD700' : n.type === 'mission' ? 'var(--tertiary)' : 'var(--primary)'}`,
                        }}
                      >
                        <strong style={{ color: 'white', display: 'block', fontSize: '0.95rem' }}>{n.title}</strong>
                        <span style={{ color: '#ccc', fontSize: '0.85rem' }}>{n.message}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              <button onClick={() => setShowAccount(true)} aria-label="Mi cuenta" title="Mi cuenta" style={{ background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 'var(--touch-target)', height: 'var(--touch-target)' }}>
                <UserCog size={24} color="var(--tertiary)" />
              </button>
              <button onClick={() => {
                if (plan?.sandbox) { if (confirm('¿Salir de la demo? Se borrará todo lo que hiciste.')) endDemo(); }
                else if (confirm('¿Cerrar sesión?')) signOut();
              }} aria-label="Cerrar sesión" style={{ background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 'var(--touch-target)', height: 'var(--touch-target)' }}>
                <LogOut size={24} color="var(--secondary)" />
              </button>
              {showAccount && <Suspense fallback={null}><MyAccount onClose={() => setShowAccount(false)} /></Suspense>}
            </div>
          </div>
        </div>

      </header>

      {/* Main Content Area */}
      <main className="main-content">
        <Suspense fallback={<PageLoader />}>
        {activeTab === 'profile' && <RegistroForm />}
        {activeTab === 'map' && <MapView />}
        {activeTab === 'crm' && (
          user?.role === 'candidato'
            ? <CandidateDashboard />
            : ['superadmin', 'coordinador_campana', 'coordinador_territorial'].includes(user?.role || '')
              ? <HighCommandDashboard />
              : user?.role === 'comunicacion_digital'
                ? <DigitalCommunicationsDashboard />
                : user?.role === 'comunicacion'
                ? <CommunicationsDashboard />
                : <BrigadistaDashboard />
        )}
        {activeTab === 'dia-d' && (diaDActive || ['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial'].includes(user?.role || '')) && <DiaDDashboard />}
        {activeTab === 'suministros' && (['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial', 'coordinador', 'coordinador_logistica'].includes(user?.role || '') ? <SuppliesDashboard /> : <MySupplies />)}
        {activeTab === 'comunicados' && <CommunicationsDashboard />}
        {activeTab === 'OBJETIVOS' && (<><GoalsCascade /><EventsModule /><ReferralNetwork /><CriticalPath /></>)}
        {activeTab === 'campo' && (<><WalkZones /><FieldActivity /></>)}
        </Suspense>
      </main>

      {/* Navegación inferior: siempre con texto, y solo lo que le sirve a cada perfil */}
      <nav className="bottom-nav" aria-label="Secciones">
        {navTabs(user?.role || '', diaDActive).map(tab => (
          <button
            key={tab.id}
            onClick={() => tab.id === 'admin' ? (window.location.href = '/superadmin') : setActiveTab(tab.id)}
            aria-current={activeTab === tab.id ? 'page' : undefined}
            className={`nav-tab ${activeTab === tab.id ? 'on' : ''}`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* TOAST NOTIFICATION RENDERER */}
      <div style={{
        position: 'fixed', top: 'clamp(70px, 12vh, 100px)', right: '10px', left: '10px', zIndex: 10000,
        display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-end', pointerEvents: 'none'
      }}>
        {toasts.map(t => (
          <div key={t.id} style={{
            backgroundColor: 'rgba(10, 15, 25, 0.95)',
            border: `1px solid ${t.type === 'achievement' ? '#FFD700' : 'var(--primary)'}`,
            borderRadius: '12px', padding: '1rem', width: 'min(300px, 100%)',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)', pointerEvents: 'auto',
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            animation: 'slideInRight 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
          }}>
            <div>
              <h4 className="tactical-font" style={{ margin: 0, color: 'white', fontSize: '1rem' }}>{t.title}</h4>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#ccc' }}>{t.message}</p>
            </div>
            <X size={16} onClick={() => removeToast(t.id)} style={{ cursor: 'pointer', color: '#666' }} />
          </div>
        ))}
      </div>
    </div >
  )
}


import { BridgeSync } from './lib/BridgeSync';
import { startActivitySyncListener } from './lib/activitySync';
import { isNativeApp } from './lib/location';

// Visitantes ven la página de entrada; con sesión, la app
const HomeGate = () => {
  const { session } = useAuth();
  if (!session) return <Landing />;
  return <ProtectedRoute><MainDashboard /></ProtectedRoute>;
};

// --- App Content (Inside Providers) ---
function AppContent() {
  const { updatePassword, user } = useAuth();

  // El puente SMS vive en la PC: buscarlo cada 30 s desde un celular solo gasta batería y datos.
  useEffect(() => {
    const MANDOS = ['superadmin', 'candidato', 'coordinador_campana', 'coordinador', 'coordinador_territorial', 'coordinador_logistica'];
    if (!user || isNativeApp() || !MANDOS.includes(user.role)) return;
    BridgeSync.startWatcher();
    return () => BridgeSync.stopWatcher();
  }, [user?.role]);

  useEffect(() => {
    // Subir bitácoras de campo guardadas sin señal
    startActivitySyncListener();
    // Exponer función para el botón de ajustes rápido
    (window as any)._updatePassword = async (p: string) => {
      if (updatePassword) {
        const { error } = await updatePassword(p);
        if (error) alert("Error: " + error.message);
        else alert("Contraseña actualizada correctamente.");
      }
    };
  }, [updatePassword]);

  return (
    <>
      <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Validación pública de visitas (la abre la persona contactada desde el WhatsApp del brigadista) */}
        <Route path="/eliminar-cuenta" element={<div className="app-container" style={{ padding: '1rem' }}><DeleteAccountPage /></div>} />
        <Route path="/v/:token" element={<div className="app-container" style={{ padding: '1rem' }}><VerifyVisit /></div>} />
        <Route path="/privacidad" element={<div className="app-container" style={{ padding: '1rem' }}><LegalPage kind="privacidad" /></div>} />
        <Route path="/terminos" element={<div className="app-container" style={{ padding: '1rem' }}><LegalPage kind="terminos" /></div>} />
        <Route path="/u/:code" element={<div className="app-container" style={{ padding: '1rem' }}><PublicJoin /></div>} />
        <Route path="/e/:token" element={<div className="app-container" style={{ padding: '1rem' }}><PublicEvent /></div>} />

        {/* Entrada pública: demo privada, cuenta gratis con Google y cotización */}
        <Route path="/" element={<HomeGate />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/registro" element={<SignupPage />} />
        <Route path="/cotizacion" element={<QuotePage />} />

        {/* Landing Page Dinámica de Candidato (NEMIA) */}
        <Route path="/:slug" element={<CandidateLanding />} />

        {/* Rutas Globales de Registro/Demandas (opcionales) */}
        <Route path="/sumate" element={<div className="app-container" style={{ padding: '1rem' }}><RegistroForm /></div>} />
        <Route path="/reportar" element={<div className="app-container" style={{ padding: '1rem' }}><PetitionsForm /></div>} />
        <Route path="/mapa-social" element={<div className="app-container" style={{ padding: '1rem' }}><PublicMapView /></div>} />

        {/* SuperAdmin Route (Highest Privilege) */}
        <Route path="/superadmin" element={
          <ProtectedRoute requiredRole="superadmin">
            <SuperAdminDashboard />
          </ProtectedRoute>
        } />

        {/* Main App Route (Protected) */}
        <Route path="/*" element={
          <ProtectedRoute>
            <MainDashboard />
          </ProtectedRoute>
        } />
      </Routes>
      </Suspense>
      <PasswordSetModal />
    </>
  );
}

// --- App Root ---
function App() {
  const [nodeConfigured, setNodeConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    // Si NO estamos en un ambiente Electron NATIVO (es decir, clientes web / móviles),
    // nos saltamos el Wizard completamente ya que no hay servidor SQLite local que configurar.
    if (!(window as any).c4iNative) {
      setNodeConfigured(true);
      return;
    }

    // Verificar si el servidor local SQLite de C4I está levantado y tiene relay config
    const checkNodeStatus = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/status');
        if (res.ok) {
          const data = await res.json();
          setNodeConfigured(data.configured === true);
        } else {
          setNodeConfigured(false);
        }
      } catch (e) {
        // Fallback Web: Si falla la conexión al localhost 3000, 
        // significa indiscutiblemente que estamos corriendo una versión de navegador (Celular/PC Remota) 
        // y NO el Nodo Físico de Electron. En la Nube no se usa Relay Local.
        // Hacemos un bypass directo del Wizard de Configuración.
        console.warn("Bypass Web: No hay servidor local de Electron. Saltando SetupWizard hacia Nube Directa...", e);
        setNodeConfigured(true);
      }
    };
    checkNodeStatus();
  }, []);

  if (nodeConfigured === null) {
    return (
      <div className="flex-center" style={{ minHeight: '100vh', background: 'var(--bg-color)', color: 'var(--tertiary)', fontFamily: 'monospace' }}>
        <h2 className="pulsate">INIT C4I SECURE KERNEL...</h2>
      </div>
    );
  }

  if (nodeConfigured === false) {
    return <SetupWizard onComplete={() => setNodeConfigured(true)} />
  }

  return (
    <Router>
      <AuthProvider>
        <NotificationProvider>
          <AppContent />
        </NotificationProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
