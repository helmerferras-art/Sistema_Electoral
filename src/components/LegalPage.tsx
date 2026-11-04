import { PLATFORM_TERMS_VERSION } from '../lib/engagement';

const CONTACT = (import.meta.env.VITE_PRIVACY_EMAIL as string | undefined) || '';
const COMPANY = (import.meta.env.VITE_LEGAL_ENTITY as string | undefined) || "Ko'on Soluciones";

type Section = [string, string[]];

const PRIVACY: Section[] = [
    ['Responsable', [`${COMPANY} es responsable del tratamiento de los datos personales de las personas usuarias de Tlatoani (aplicación móvil, de escritorio y sitio web).${CONTACT ? ` Contacto: ${CONTACT}.` : ''}`]],
    ['Datos que tratamos', [
        'Nombre y número de celular; perfil, jefe inmediato y territorio asignado; contraseña almacenada cifrada.',
        'Ubicación del dispositivo solo al guardar un registro, una actividad o un reporte, y solo con tu permiso.',
        'Bitácora de actividades, metas, puntos, fotos y audios que decidas adjuntar.',
        'Identificador del dispositivo, dirección IP y fecha de acceso, para seguridad.',
        'Formar parte del equipo de una campaña puede revelar tu opinión política, que es un dato sensible: lo tratamos solo con tu consentimiento expreso.',
        'No pedimos CURP, credencial para votar ni domicilio. La plataforma es solo para mayores de 18 años.',
    ]],
    ['Finalidades', [
        'Crear y proteger tu cuenta; organizar el trabajo territorial de la campaña; registrar actividades; verificar la calidad de los registros y prevenir fraudes; enviarte avisos del sistema; dar soporte; cumplir obligaciones legales.',
        'Secundarias (puedes negarte): estadísticas anónimas de uso e información de nuevas funciones.',
    ]],
    ['Alertas automáticas', ['El sistema genera alertas de calidad y una tasa de confirmación. Son apoyo para la revisión de tu cadena de mando: ninguna decisión sobre ti se toma solo con base en ellas.']],
    ['Transferencias y proveedores', ['Tus datos los ve la campaña a la que perteneces, según tu cadena de mando. Usamos proveedores de infraestructura que los procesan por nuestra cuenta, algunos con servidores en Estados Unidos. No vendemos tus datos.']],
    ['Tus derechos', [
        `Puedes acceder, rectificar, cancelar u oponerte al uso de tus datos, o revocar tu consentimiento${CONTACT ? ` escribiendo a ${CONTACT}` : ''}. Respondemos en máximo 20 días hábiles. Es gratuito.`,
        'Puedes eliminar tu cuenta en la app (Mi cuenta > Eliminar mi cuenta) o en nemia.lat/eliminar-cuenta.',
    ]],
    ['Conservación', ['Mientras tu cuenta esté activa. Al cierre del proceso electoral la campaña anonimiza o borra la información.']],
    ['Autoridad', ['Si consideras vulnerado tu derecho, puedes acudir a la Secretaría Anticorrupción y Buen Gobierno.']],
];

const TERMS: Section[] = [
    ['Uso de la plataforma', ['La cuenta es personal e intransferible. Debes ser mayor de 18 años, dar información verdadera y avisar si alguien usa tu cuenta.']],
    ['Prohibido', [
        'Registrar personas inexistentes, sin su consentimiento o menores de 18 años.',
        'Comprar, coaccionar o condicionar el voto, o condicionar programas, apoyos o beneficios.',
        'Fotografiar credenciales para votar, boletas o documentos de identidad.',
        'Copiar, vender, ceder o exportar datos sin autorización; enviar mensajes masivos no solicitados.',
        'Acosar, discriminar o ejercer violencia política, incluida la violencia política contra las mujeres en razón de género.',
        'Usar recursos públicos, suplantar a otra persona o intentar vulnerar la seguridad del sistema.',
    ]],
    ['Cumplimiento electoral', ['La campaña es responsable de cumplir la legislación electoral, incluidos plazos, propaganda, topes de gasto y fiscalización.']],
    ['Suspensión', ['La campaña o la plataforma pueden suspender una cuenta por incumplimiento. Tú puedes eliminar tu cuenta cuando quieras.']],
    ['Propiedad', [`El software y la marca Tlatoani son de ${COMPANY}. Los datos de la campaña pertenecen a la campaña.`]],
];

/** Aviso de privacidad y términos de uso de la plataforma (versión corta para personas usuarias). */
export const LegalPage = ({ kind }: { kind: 'privacidad' | 'terminos' }) => {
    const sections = kind === 'privacidad' ? PRIVACY : TERMS;
    return (
        <div className="tactile-card" style={{ maxWidth: 720, margin: '1rem auto', lineHeight: 1.55 }}>
            <h1 style={{ fontFamily: 'Oswald', marginTop: 0 }}>{kind === 'privacidad' ? 'Aviso de privacidad' : 'Términos de uso'} · Tlatoani</h1>
            <div style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1rem' }}>Versión {PLATFORM_TERMS_VERSION}</div>
            {sections.map(([title, paras]) => (
                <section key={title} style={{ marginBottom: '1rem' }}>
                    <h3 style={{ marginBottom: '0.3rem' }}>{title}</h3>
                    {paras.length > 1
                        ? <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>{paras.map((p, i) => <li key={i}>{p}</li>)}</ul>
                        : <p style={{ margin: 0 }}>{paras[0]}</p>}
                </section>
            ))}
            <p style={{ fontSize: '0.85rem', color: '#94A3B8' }}>
                <a href={kind === 'privacidad' ? '/terminos' : '/privacidad'} style={{ color: 'var(--tertiary)' }}>
                    {kind === 'privacidad' ? 'Ver términos de uso' : 'Ver aviso de privacidad'}
                </a>
            </p>
        </div>
    );
};

export default LegalPage;
