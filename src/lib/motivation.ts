/**
 * Frases para el equipo. Se muestra una al abrir la app y otra mientras carga cada módulo.
 *
 * Obras clásicas (Sun Tzu, Maquiavelo, Clausewitz, Musashi, Lao Tse, Marco Aurelio, Séneca): son de dominio público,
 * aquí van en versión propia en español. Autores con derechos vigentes (Greene, Willink y Babin, Sinek): no se citan
 * textualmente, se resume la idea con nuestras palabras y se marca como "Idea de".
 */

export type Audience = 'todos' | 'campo' | 'mando';
export type Phrase = { text: string; source: string; audience: Audience; idea?: boolean };

export const PHRASES: Phrase[] = [
    // ---- Sun Tzu · El arte de la guerra
    { text: 'Conoce al otro y conócete a ti mismo, y en cien batallas no correrás peligro.', source: 'Sun Tzu · El arte de la guerra', audience: 'mando' },
    { text: 'La victoria suprema es ganar sin tener que combatir.', source: 'Sun Tzu · El arte de la guerra', audience: 'todos' },
    { text: 'Las oportunidades se multiplican a medida que se aprovechan.', source: 'Sun Tzu · El arte de la guerra', audience: 'todos' },
    { text: 'En medio del caos también hay oportunidad.', source: 'Sun Tzu · El arte de la guerra', audience: 'todos' },
    { text: 'El buen estratega primero se pone a salvo de la derrota y después busca la victoria.', source: 'Sun Tzu · El arte de la guerra', audience: 'mando' },
    { text: 'Vence el equipo en el que todos, de arriba abajo, comparten el mismo propósito.', source: 'Sun Tzu · El arte de la guerra', audience: 'todos' },
    { text: 'Quien llega primero al terreno espera descansado; quien llega tarde entra cansado a la pelea.', source: 'Sun Tzu · El arte de la guerra', audience: 'campo' },
    { text: 'Quien sabe cuándo actuar y cuándo esperar, vence.', source: 'Sun Tzu · El arte de la guerra', audience: 'mando' },

    // ---- Nicolás Maquiavelo · El príncipe
    { text: 'No hay nada más difícil de emprender, ni más incierto de lograr, que encabezar un orden nuevo de las cosas.', source: 'Maquiavelo · El príncipe', audience: 'mando' },
    { text: 'Donde hay gran voluntad no puede haber gran dificultad.', source: 'Maquiavelo · El príncipe', audience: 'todos' },
    { text: 'Los diques se construyen cuando el río está en calma, no cuando ya viene crecido.', source: 'Maquiavelo · El príncipe', audience: 'mando' },
    { text: 'A un líder se le conoce primero por la gente que tiene a su alrededor.', source: 'Maquiavelo · El príncipe', audience: 'mando' },
    { text: 'Quien no pone los cimientos a tiempo, después tendrá que ponerlos con mucho más trabajo.', source: 'Maquiavelo · El príncipe', audience: 'todos' },

    // ---- Carl von Clausewitz · De la guerra
    { text: 'En el plan todo es sencillo; en el terreno lo sencillo se vuelve difícil. Prepárate para la fricción.', source: 'Clausewitz · De la guerra', audience: 'campo' },
    { text: 'Concentra tus fuerzas en el punto decisivo.', source: 'Clausewitz · De la guerra', audience: 'mando' },
    { text: 'Ante la incertidumbre, la determinación es la mejor guía.', source: 'Clausewitz · De la guerra', audience: 'todos' },
    { text: 'La perseverancia en el rumbo elegido es el mejor contrapeso de la duda.', source: 'Clausewitz · De la guerra', audience: 'todos' },
    { text: 'La mejor estrategia es ser fuerte: primero en general, y después en el punto que decide.', source: 'Clausewitz · De la guerra', audience: 'mando' },

    // ---- Miyamoto Musashi · El libro de los cinco anillos
    { text: 'Hoy vences al que fuiste ayer; mañana, a los que todavía no se preparan.', source: 'Musashi · El libro de los cinco anillos', audience: 'todos' },
    { text: 'Mil días de práctica forjan; diez mil días pulen.', source: 'Musashi · El libro de los cinco anillos', audience: 'campo' },
    { text: 'No hagas nada que no sirva para algo.', source: 'Musashi · El libro de los cinco anillos', audience: 'todos' },
    { text: 'Aprende a ver lo que no se ve a simple vista.', source: 'Musashi · El libro de los cinco anillos', audience: 'campo' },
    { text: 'Quien entiende el todo, entiende cada una de sus partes.', source: 'Musashi · El libro de los cinco anillos', audience: 'mando' },

    // ---- Otros clásicos
    { text: 'Un viaje de mil leguas comienza con un primer paso.', source: 'Lao Tse · Tao Te Ching', audience: 'campo' },
    { text: 'Lo difícil se planea cuando aún es fácil; lo grande se hace cuando aún es pequeño.', source: 'Lao Tse · Tao Te Ching', audience: 'mando' },
    { text: 'Lo que no es bueno para el enjambre, tampoco es bueno para la abeja.', source: 'Marco Aurelio · Meditaciones', audience: 'todos' },
    { text: 'No es que tengamos poco tiempo; es que perdemos mucho.', source: 'Séneca · Sobre la brevedad de la vida', audience: 'todos' },

    // ---- Ideas de autores contemporáneos (resumidas, no citas textuales)
    { text: 'El líder se hace cargo de todo lo que pasa en su equipo. Sin excusas, sin culpar a nadie.', source: 'Willink y Babin · Responsabilidad extrema', audience: 'mando', idea: true },
    { text: 'No hay equipos malos: hay equipos que todavía no tienen quién los guíe bien.', source: 'Willink y Babin · Responsabilidad extrema', audience: 'mando', idea: true },
    { text: 'Cuando todo urge, prioriza: resuelve lo más importante y luego lo que sigue.', source: 'Willink y Babin · Responsabilidad extrema', audience: 'todos', idea: true },
    { text: 'La disciplina de hoy es la libertad de mañana.', source: 'Willink y Babin · Responsabilidad extrema', audience: 'campo', idea: true },
    { text: 'Un equipo da lo mejor de sí cuando se siente seguro y cuidado por quien lo dirige.', source: 'Simon Sinek · Los líderes comen al final', audience: 'mando', idea: true },
    { text: 'El líder es el primero en dar y el último en servirse.', source: 'Simon Sinek · Los líderes comen al final', audience: 'mando', idea: true },
    { text: 'Cada campaña es distinta: no la pelees con las tácticas de la anterior.', source: 'Robert Greene · Las 33 estrategias de la guerra', audience: 'mando', idea: true },
    { text: 'Trabaja con sentido de urgencia, como si la elección fuera mañana.', source: 'Robert Greene · Las 33 estrategias de la guerra', audience: 'todos', idea: true },
    { text: 'Divide el gran objetivo en pasos pequeños que se puedan cumplir hoy.', source: 'Robert Greene · Las 33 estrategias de la guerra', audience: 'campo', idea: true },

    // ---- Principios de campaña (del equipo Tlatoani)
    { text: 'Una puerta más hoy es una persona más que te conoce mañana.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Las campañas se ganan sección por sección, con datos y no con corazonadas.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Escuchar también es hacer campaña: lo que te cuenta la gente vale más que lo que tú le dices.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Lo que no se registra, no existe. Anota cada visita.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'El respeto abre más puertas que cualquier volante.', source: 'Principio de campaña', audience: 'campo' },
];

// Perfiles de calle: frases de campo. Mandos (candidato, coordinación general, territorial, comunicación): frases de estrategia.
const FIELD_ROLES = ['brigadista', 'lider', 'coordinador', 'coordinador_logistica', 'representante', 'promotor'];

const pool = (role?: string) => {
    const field = !role || FIELD_ROLES.includes(role);
    const want: Audience = field ? 'campo' : 'mando';
    return PHRASES.filter(p => p.audience === 'todos' || p.audience === want);
};

const SEEN_KEY = 'tl_motiv_seen';

/** Siguiente frase sin repetir hasta agotar las del perfil. */
export const nextPhrase = (role?: string): Phrase => {
    const list = pool(role);
    let seen: string[] = [];
    try { seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { /* sin almacenamiento */ }
    let fresh = list.filter(p => !seen.includes(p.text));
    if (!fresh.length) { seen = []; fresh = list; }
    const pick = fresh[Math.floor(Math.random() * fresh.length)];
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, pick.text].slice(-80))); } catch { /* sin almacenamiento */ }
    return pick;
};

/** Frase corta al azar (para pantallas de carga), sin tocar el historial. */
export const quickPhrase = (): Phrase => {
    const short = PHRASES.filter(p => p.text.length <= 80);
    return short[Math.floor(Math.random() * short.length)];
};
