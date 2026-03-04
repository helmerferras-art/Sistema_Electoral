import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { Map as MapIcon, Users, List, Star, ShieldAlert, LogOut, Bell, X, Archive, Target, Activity as ActivityIcon } from 'lucide-react'
import { RegistroForm } from './components/RegistroForm'
import { MapView } from './components/MapView'
import { BrigadistaDashboard } from './components/BrigadistaDashboard'
import { DiaDDashboard } from './components/DiaDDashboard'
import { HighCommandDashboard } from './components/HighCommandDashboard'
import { OnboardingFlow } from './components/OnboardingFlow'
import { LoginPage } from './components/LoginPage'
import { SuperAdminDashboard } from './components/SuperAdminDashboard'
import SuppliesDashboard from './components/SuppliesDashboard'
import MySupplies from './components/MySupplies'
import { CommunicationsDashboard } from './components/CommunicationsDashboard';
import { DigitalCommunicationsDashboard } from './components/DigitalCommunicationsDashboard';
import { CandidateDashboard } from './components/CandidateDashboard';
import { CriticalPath } from './components/CriticalPath';
import { CandidateLanding } from './components/CandidateLanding';
import { PetitionsForm } from './components/PetitionsForm';
import { PublicMapView } from './components/PublicMapView';
import { AuthProvider, useAuth } from './lib/AuthContext'
import { NotificationProvider, useNotifications } from './lib/NotificationContext'
import { supabase } from './lib/supabase'
import { SetupWizard } from './components/SetupWizard'
import './index.css'

// --- Protected Route Wrapper ---
import { PasswordSetModal } from './components/PasswordSetModal';
import { Settings } from 'lucide-react';

const ProtectedRoute = ({ children, requiredRole }: { children: React.ReactNode, requiredRole?: string | string[] }) => {
  const { session, user, loading } = useAuth();

  if (loading) return <div className="flex-center" style={{ height: '100vh', backgroundColor: 'var(--bg-color)', color: 'var(--primary)' }}>Cargando Sistemas...</div>;
  if (!session) return <Navigate to="/login" replace />;

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

// --- Main Brigadista/Lider Dashboard (The PWA Core) ---
const MainDashboard = () => {
  const [activeTab, setActiveTab] = useState('profile')
  const { user, signOut, isImpersonating, abortImpersonation } = useAuth(); // SaaS User Info
  const { notifications, unreadCount, markAsRead, toasts, removeToast } = useNotifications();
  const [showNotifMenu, setShowNotifMenu] = useState(false);

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
      setHasOnboarded(!user.is_first_login);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
            <div className="pulsate" style={{
              backgroundColor: 'rgba(255, 90, 54, 0.1)',
              border: '2px solid var(--primary)',
              width: '40px',
              height: '40px',
              minWidth: '40px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '900',
              fontFamily: 'Oswald, sans-serif',
              color: 'var(--primary)'
            }}>
              <span>LV</span> {Math.floor(Number(user?.xp || agentContext.xp || 0) / 500) + 1}
            </div>

            <div className="flex-col">
              <div style={{ fontSize: 'clamp(1.1rem, 3.5vw, 1.5rem)', fontWeight: '800', color: 'var(--tertiary)', fontFamily: 'Oswald, sans-serif', letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.1, textShadow: '0 0 10px rgba(0, 212, 255, 0.3)' }}>
                {user?.rank_name || agentContext.rank}
              </div>
              <div className="hide-mobile" style={{ fontSize: '0.85rem', color: '#E2E8F0', fontWeight: '500', fontFamily: 'Inter, sans-serif', letterSpacing: '0.05em', marginTop: '2px' }}>
                <span style={{ color: 'var(--primary)', fontWeight: 'bold' }}>AGENTE:</span> {user?.name || agentContext.name}
              </div>
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
                {user?.xp || agentContext.xp || 0} <span className="hide-mobile"><span>XP</span></span>
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

              <button onClick={signOut} style={{ background: 'transparent', border: 'none', cursor: 'pointer', minWidth: 'var(--touch-target)', height: 'var(--touch-target)' }}>
                <LogOut size={24} color="var(--secondary)" />
              </button>
            </div>
          </div>
        </div>

        {/* Progress Bar - Always Visible but Sleek */}
        <div style={{ backgroundColor: 'rgba(255,255,255,0.1)', height: '4px', borderRadius: '2px', overflow: 'hidden', marginTop: '0.2rem' }}>
          <div style={{
            background: 'linear-gradient(90deg, var(--primary) 0%, #FF8A66 100%)',
            height: '100%',
            width: `${agentContext.levelProgression}%`,
            transition: 'width 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            boxShadow: '0 0 10px var(--primary)'
          }}></div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'profile' && <RegistroForm />}
        {activeTab === 'map' && <MapView />}
        {activeTab === 'crm' && (
          user?.role === 'candidato'
            ? <CandidateDashboard />
            : ['superadmin', 'coordinador_campana', 'coordinador_territorial'].includes(user?.role || '')
              ? <HighCommandDashboard />
              : user?.role === 'comunicacion_digital'
                ? <DigitalCommunicationsDashboard />
                : <BrigadistaDashboard />
        )}
        {activeTab === 'dia-d' && (diaDActive || ['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial'].includes(user?.role || '')) && <DiaDDashboard />}
        {activeTab === 'suministros' && (['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial', 'coordinador', 'coordinador_logistica'].includes(user?.role || '') ? <SuppliesDashboard /> : <MySupplies />)}
        {activeTab === 'comunicados' && <CommunicationsDashboard />}
        {activeTab === 'OBJETIVOS' && <CriticalPath />}
      </main>

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        {[
          { id: 'profile', icon: <Users size={24} />, label: 'MISIÓN' },
          { id: 'map', icon: <MapIcon size={24} />, label: 'RADAR' },
          { id: 'crm', icon: <List size={24} />, label: ['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial'].includes(user?.role || '') ? 'MANDO' : 'SQUAD' },
          { id: 'OBJETIVOS', icon: <Target size={24} />, label: 'OBJETIVOS' },
          { id: 'suministros', icon: <Archive size={24} />, label: 'LOGÍSTICA' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === tab.id ? 'var(--primary)' : '#64748B',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', fontSize: '0.7rem'
            }}
          >
            {tab.icon}
            <span className="hide-mobile">{tab.label}</span>
          </button>
        ))}

        {/* Dynamic Dia D Tab */}
        {(diaDActive || ['superadmin', 'candidato', 'coordinador_campana', 'coordinador_territorial'].includes(user?.role || '')) && (
          <button
            onClick={() => setActiveTab('dia-d')}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: activeTab === 'dia-d' ? 'var(--primary)' : diaDActive ? '#FF8A66' : '#64748B',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', fontSize: '0.7rem'
            }}
          >
            <ActivityIcon size={24} className={diaDActive ? 'pulsate' : ''} />
            <span className="hide-mobile">DÍA D</span>
          </button>
        )}

        {/* MODO DIOS ACCESS (Only for Superadmins) */}
        {user?.role === 'superadmin' && (
          <button
            onClick={() => window.location.href = '/superadmin'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--primary)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', fontSize: '0.7rem',
              filter: 'drop-shadow(0 0 5px rgba(255,90,54,0.5))'
            }}
          >
            <ShieldAlert size={24} />
            <span className="hide-mobile">MODO DIOS</span>
          </button>
        )}

        {/* AJUSTES DE PERFIL (Para todos los usuarios logueados) */}
        {user && (
          <button
            onClick={() => {
              const pass = prompt("Establecer nueva contraseña permanente:");
              if (pass && pass.length >= 6) {
                (window as any)._updatePassword(pass);
              } else if (pass) {
                alert("Mínimo 6 caracteres reglamentarios.");
              }
            }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#64748B',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
              fontFamily: 'Oswald, sans-serif', textTransform: 'uppercase', fontSize: '0.7rem'
            }}
          >
            <Settings size={24} />
            <span className="hide-mobile">AJUSTES</span>
          </button>
        )}
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

// --- App Content (Inside Providers) ---
function AppContent() {
  const { updatePassword } = useAuth();

  useEffect(() => {
    // Iniciar centinela de hardware C4I
    BridgeSync.startWatcher();
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
      <Routes>
        <Route path="/login" element={<LoginPage />} />

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
