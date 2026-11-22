import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BarChart3, Brain, CalendarDays, Check, ClipboardCheck, Compass, Download, DoorOpen, FileCheck, Lock, Map, Megaphone, Scale, ShieldCheck, Smartphone, Users, Vote, WifiOff, Wallet } from 'lucide-react';
import { DemoLauncher } from './DemoLauncher';
import { FREE_LEGEND, DEMO_ROLES } from '../lib/demo';
import './landing.css';

const MODULES = [
    { key: 'mando', icon: <BarChart3 />, title: 'Tablero de mando', text: 'Avance contra las metas de cada etapa —conocimiento, organización o votos— por sección y por equipo.' },
    { key: 'campo', icon: <Smartphone />, title: 'Trabajo en territorio', text: 'Registro de contactos con consentimiento, guion, foto y ubicación. Funciona sin señal y sube al reconectar.' },
    { key: 'mapa', icon: <Map />, title: 'Diagnóstico territorial', text: 'Secciones, padrón, resultados históricos y avance del equipo en un mismo mapa para decidir con datos.' },
    { key: 'zonas', icon: <DoorOpen />, title: 'Recorridos casa por casa', text: 'Rutas automáticas por sección con puertas meta, avance por zona y validación de visitas.' },
    { key: 'equipo', icon: <Users />, title: 'Estructura y equipo', text: 'Coordinaciones, líderes y brigadas con su cadena de mando, metas en cascada e invitaciones.' },
    { key: 'eventos', icon: <CalendarDays />, title: 'Reuniones y eventos', text: 'Asambleas, reuniones vecinales y eventos con registro, asistencia y seguimiento.' },
    { key: 'diad', icon: <Vote />, title: 'Jornada electoral', text: 'Representación en casillas, pase de lista, cotejo de actas y conteo rápido el día de la elección.' },
    { key: 'ia', icon: <Brain />, title: 'Inteligencia artificial', text: 'Resumen semanal por sección, asesor estratégico y lectura de actas por foto. Sin datos personales.' },
    { key: 'finanzas', icon: <Wallet />, title: 'Finanzas y fiscalización', text: 'Ingresos y gastos con comprobantes, topes y alertas de cumplimiento ante la autoridad electoral.' },
];

/** Etapas del proceso: el sistema se adapta a cada una y respeta sus tiempos legales. */
const STAGES = [
    { icon: <Compass />, title: 'Diagnóstico y organización', text: 'Conoce tu territorio antes de salir: padrón, histórico por sección, mapa de colonias y la estructura de tu equipo.' },
    { icon: <ClipboardCheck />, title: 'Procesos internos', text: 'Mide tu reconocimiento con sondeos propios, documenta tu trabajo comunitario y organiza a tu equipo para la etapa de definición de tu partido.' },
    { icon: <Megaphone />, title: 'Precampaña y campaña', text: 'Solo en los periodos que marca la autoridad: recorridos, eventos, mensajes y metas por sección, con gastos registrados para fiscalización.' },
    { icon: <Vote />, title: 'Jornada electoral', text: 'Representantes en cada casilla, pase de lista, cotejo de actas y conteo rápido en tiempo real.' },
    { icon: <FileCheck />, title: 'Después de la elección', text: 'Informes de gastos, seguimiento a las peticiones ciudadanas recibidas y una estructura que no se pierde para el siguiente proceso.' },
];

/** Marco de teléfono con captura real de la app. */
const Phone = ({ src, alt, className = '' }: { src: string; alt: string; className?: string }) => (
    <div className={`tl-phone ${className}`}>
        <div className="tl-phone-notch" />
        <img src={src} alt={alt} loading="lazy" />
    </div>
);

/** Aparición suave al hacer scroll. */
const useReveal = () => {
    useEffect(() => {
        const els = document.querySelectorAll('.tl-reveal');
        if (!('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('in')); return; }
        const io = new IntersectionObserver(entries => entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }), { threshold: 0.15 });
        els.forEach(e => io.observe(e));
        return () => io.disconnect();
    }, []);
};

/** Página de entrada pública (nemia.lat) para quien aún no inicia sesión. */
export const Landing = () => {
    useReveal();
    const [active, setActive] = useState(MODULES[0].key);
    const refs = useRef<Record<string, HTMLElement | null>>({});
    const demoEnded = new URLSearchParams(window.location.search).get('demo') === 'fin';

    // Teléfono fijo en escritorio que cambia de pantalla según el módulo visible
    useEffect(() => {
        const io = new IntersectionObserver(entries => {
            entries.forEach(en => { if (en.isIntersecting) setActive((en.target as HTMLElement).dataset.key!); });
        }, { rootMargin: '-45% 0px -45% 0px' });
        Object.values(refs.current).forEach(el => el && io.observe(el));
        return () => io.disconnect();
    }, []);

    return (
        <div className="tl-landing">
            <header className="tl-nav tl-nav-float">
                <a href="/" className="tl-brand">TLATOANI</a>
                <nav className="tl-navlinks">
                    <a href="#etapas">Etapas</a>
                    <a href="#modulos">Módulos</a>
                    <a href="#demo">Demo</a>
                    <a href="#planes">Planes</a>
                </nav>
                <a href="/login" className="tl-navlink">Iniciar sesión</a>
            </header>

            {demoEnded && <div className="tl-toast" role="status">Tu demo se cerró y todo lo que agregaste se borró.</div>}

            {/* HERO */}
            <section className="tl-hero">
                <div className="tl-hero-glow" />
                <div className="tl-container tl-hero-grid">
                    <div className="tl-hero-copy">
                        <span className="tl-eyebrow">Gestión política y electoral</span>
                        <h1>Tu proyecto político, organizado <em>en cada etapa</em>.</h1>
                        <p>Del diagnóstico y los procesos internos a la campaña, la jornada electoral y la rendición de cuentas. Territorio, equipo y cumplimiento en una sola app, dentro de los tiempos que marca la ley.</p>
                        <div className="tl-hero-ctas">
                            <a href="#demo" className="tl-btn tl-btn-primary">Probar la demo <ArrowRight size={18} /></a>
                            <a href="/registro" className="tl-btn tl-btn-ghost">Crear cuenta gratis</a>
                        </div>
                        <ul className="tl-hero-points">
                            <li><WifiOff size={16} /> Funciona sin señal</li>
                            <li><Lock size={16} /> Cada campaña aislada</li>
                            <li><Scale size={16} /> Hecho para cumplir la ley electoral</li>
                        </ul>
                    </div>
                    <div className="tl-hero-visual" aria-hidden="true">
                        <Phone src="/landing/campo.jpg" alt="" className="tl-phone-back" />
                        <Phone src="/landing/mando.jpg" alt="" className="tl-phone-front" />
                        <div className="tl-float tl-float-a"><strong>255</strong> secciones con diagnóstico</div>
                        <div className="tl-float tl-float-b"><strong>5</strong> etapas, una sola app</div>
                    </div>
                </div>
            </section>

            {/* ROLES */}
            <section className="tl-band">
                <div className="tl-container">
                    <p className="tl-band-title tl-reveal">Un perfil para cada persona del equipo</p>
                    <div className="tl-role-strip tl-reveal">
                        {DEMO_ROLES.map(r => <span key={r.role}>{r.label}</span>)}
                    </div>
                </div>
            </section>

            {/* ETAPAS DEL PROCESO */}
            <section id="etapas" className="tl-section tl-section-soft">
                <div className="tl-container">
                    <h2 className="tl-h2 tl-reveal">Te acompaña en todo el proceso, no solo en la campaña</h2>
                    <p className="tl-lead tl-reveal">Tlatoani se ajusta a la etapa en la que estás: cambia las metas, las herramientas y el lenguaje para que cada actividad corresponda a su momento.</p>
                    <ol className="tl-stages">
                        {STAGES.map((st, i) => (
                            <li key={st.title} className="tl-stage tl-reveal">
                                <div className="tl-stage-num">{i + 1}</div>
                                <div className="tl-stage-icon">{st.icon}</div>
                                <h3>{st.title}</h3>
                                <p>{st.text}</p>
                            </li>
                        ))}
                    </ol>
                </div>
            </section>

            {/* MÓDULOS con teléfono fijo */}
            <section id="modulos" className="tl-section">
                <div className="tl-container">
                    <h2 className="tl-h2 tl-reveal">Las herramientas de cada etapa</h2>
                    <p className="tl-lead tl-reveal">Capturas reales del sistema, con datos ficticios de la demo.</p>
                    <div className="tl-showcase">
                        <div className="tl-showcase-list">
                            {MODULES.map(m => (
                                <article key={m.key} data-key={m.key} ref={el => { refs.current[m.key] = el; }} className={`tl-module tl-reveal ${active === m.key ? 'on' : ''}`}>
                                    <div className="tl-module-icon">{m.icon}</div>
                                    <div>
                                        <h3>{m.title}</h3>
                                        <p>{m.text}</p>
                                    </div>
                                    <Phone src={`/landing/${m.key}.jpg`} alt={`Pantalla de ${m.title}`} className="tl-phone-inline" />
                                </article>
                            ))}
                        </div>
                        <div className="tl-showcase-sticky" aria-hidden="true">
                            <div className="tl-phone tl-phone-stage">
                                <div className="tl-phone-notch" />
                                {MODULES.map(m => <img key={m.key} src={`/landing/${m.key}.jpg`} alt="" className={active === m.key ? 'on' : ''} loading="lazy" />)}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* DEMO */}
            <section id="demo" className="tl-section tl-section-dark">
                <div className="tl-container tl-demo-grid">
                    <div className="tl-reveal">
                        <span className="tl-eyebrow">Demo privada</span>
                        <h2 className="tl-h2">Pruébalo con cualquier perfil, sin registrarte</h2>
                        <p className="tl-lead">Te creamos una copia de una campaña ficticia sólo para ti. Agrega simpatizantes, crea eventos, recorre zonas o llena actas: nada afecta a nadie y todo se borra al salir o tras 30 minutos sin uso.</p>
                        <ol className="tl-steps">
                            <li><span>1</span> Elige la campaña y el perfil.</li>
                            <li><span>2</span> Explora y prueba todo lo que quieras.</li>
                            <li><span>3</span> Cambia de perfil desde la franja superior para ver la otra cara.</li>
                        </ol>
                        <a className="tl-btn tl-btn-ghost" href="/guia-demo.pdf" download><Download size={18} /> Descargar la guía de la demo</a>
                        <p className="tl-fineprint">La guía explica qué ver con cada perfil y qué probar paso a paso.</p>
                    </div>
                    <div className="tl-reveal"><DemoLauncher /></div>
                </div>
            </section>

            {/* PLANES */}
            <section id="planes" className="tl-section">
                <div className="tl-container">
                    <h2 className="tl-h2 tl-reveal">Empieza gratis. Crece a la medida.</h2>
                    <div className="tl-plans">
                        <div className="tl-plan tl-reveal">
                            <div className="tl-plan-tag">Gratis</div>
                            <h3>Plan Arranque</h3>
                            <p>Para aspirantes, equipos y candidaturas que empiezan a organizarse y quieren probar el sistema.</p>
                            <ul>
                                <li><Check size={16} /> Candidato, coordinación de campaña, comunicación, comunicación digital y coordinación territorial</li>
                                <li><Check size={16} /> 2 líderes con 5 brigadistas cada uno</li>
                                <li><Check size={16} /> Hasta 500 simpatizantes</li>
                                <li><Check size={16} /> 1 guion, 1 sondeo, 3 eventos al mes, 10 zonas</li>
                                <li><Check size={16} /> 3 consultas de IA al día</li>
                            </ul>
                            <a className="tl-btn tl-btn-primary tl-btn-wide" href="/registro">Crear cuenta gratis</a>
                            <p className="tl-legend">{FREE_LEGEND}</p>
                        </div>
                        <div className="tl-plan tl-plan-dark tl-reveal">
                            <div className="tl-plan-tag">Cotización</div>
                            <h3>A la medida</h3>
                            <p>Para proyectos con estructura: el precio depende del tipo de elección, el territorio, la etapa y el tamaño del equipo.</p>
                            <ul>
                                <li><Check size={16} /> Usuarios y simpatizantes sin tope</li>
                                <li><Check size={16} /> Jornada electoral completa: casillas, representantes y conteo rápido</li>
                                <li><Check size={16} /> Exportación, mensajería y alianzas entre campañas</li>
                                <li><Check size={16} /> IA ampliada y app con la marca de tu proyecto</li>
                                <li><Check size={16} /> Capacitación y acompañamiento</li>
                            </ul>
                            <a className="tl-btn tl-btn-primary tl-btn-wide" href="/cotizacion">Solicitar cotización</a>
                            <p className="tl-legend">Al contratar se emite la factura correspondiente para que la campaña la reporte a la autoridad electoral.</p>
                        </div>
                    </div>
                </div>
            </section>

            {/* SEGURIDAD */}
            <section className="tl-section tl-section-soft">
                <div className="tl-container tl-trust">
                    <div className="tl-reveal"><ShieldCheck size={32} /><h3>Datos aislados por campaña</h3><p>Cada campaña sólo ve lo suyo. Los permisos se validan en el servidor, no en el teléfono.</p></div>
                    <div className="tl-reveal"><Lock size={32} /><h3>Privacidad desde el diseño</h3><p>Consentimiento en cada registro, aviso de privacidad y derecho a eliminar la cuenta en cualquier momento.</p></div>
                    <div className="tl-reveal"><Brain size={32} /><h3>IA sin datos personales</h3><p>La inteligencia artificial trabaja con cifras agregadas. Las llaves nunca salen del servidor.</p></div>
                    <div className="tl-reveal"><Scale size={32} /><h3>Respeto a los tiempos electorales</h3><p>Las herramientas de promoción se activan según la etapa, los gastos quedan registrados y las peticiones ciudadanas nunca se condicionan.</p></div>
                </div>
                <p className="tl-container tl-legal-note">Tlatoani es una herramienta de organización y gestión. Cada proyecto es responsable de que sus actividades se apeguen a los plazos y reglas del INE, del IEPC y de la normatividad de su partido.</p>
            </section>

            <footer className="tl-footer">
                <div className="tl-container tl-footer-grid">
                    <div><div className="tl-brand">TLATOANI</div><p>Un producto de Ko'on Soluciones. Gestión política y electoral para cada etapa del proceso.</p></div>
                    <nav>
                        <a href="/privacidad">Aviso de privacidad</a>
                        <a href="/terminos">Términos de uso</a>
                        <a href="/eliminar-cuenta">Eliminar cuenta</a>
                        <a href="/cotizacion">Ventas</a>
                    </nav>
                </div>
            </footer>
        </div>
    );
};

export default Landing;
