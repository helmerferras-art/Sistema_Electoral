/**
 * Frases para el equipo. Se muestra una al abrir la app y otra mientras carga cada módulo.
 *
 * Obras clásicas (Sun Tzu, Maquiavelo, Clausewitz, Musashi, Lao Tse, Marco Aurelio, Séneca): son de dominio público,
 * aquí van en versión propia en español. Cuando la frase resume una idea (no es traducción directa), la fuente dice "Idea de". Autores con derechos vigentes (Greene, Willink y Babin, Sinek): no se citan
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

    // ======== Ampliación del banco ========

    // ---- Sun Tzu · El arte de la guerra
    { text: 'Toda batalla se gana antes de librarse: en la preparación.', source: 'Sun Tzu · El arte de la guerra', audience: 'todos' },
    { text: 'La velocidad es la esencia de la estrategia: aprovecha lo que el otro no alcanzó a preparar.', source: 'Sun Tzu · El arte de la guerra', audience: 'mando' },
    { text: 'Sé tan constante como el río: el agua blanda vence a la roca dura.', source: 'Idea de Lao Tse · Tao Te Ching', audience: 'todos' },
    { text: 'Trata a tu gente como a tus propios hijos y te seguirá hasta los valles más profundos.', source: 'Sun Tzu · El arte de la guerra', audience: 'mando' },
    { text: 'Quien está preparado y espera al desprevenido, sale victorioso.', source: 'Sun Tzu · El arte de la guerra', audience: 'todos' },
    { text: 'La cantidad no basta: lo que decide es la unión y el orden del equipo.', source: 'Sun Tzu · El arte de la guerra', audience: 'mando' },
    { text: 'El terreno enseña al que lo camina. Conoce cada calle de tu sección.', source: 'Idea de Sun Tzu · El arte de la guerra', audience: 'campo' },
    { text: 'Avanza donde no te esperan y llega donde hace falta.', source: 'Sun Tzu · El arte de la guerra', audience: 'campo' },
    { text: 'La energía bien dirigida es como una piedra que rueda cuesta abajo: nada la detiene.', source: 'Sun Tzu · El arte de la guerra', audience: 'todos' },
    { text: 'El buen líder busca la victoria en la organización, no en exigir lo imposible a su gente.', source: 'Sun Tzu · El arte de la guerra', audience: 'mando' },

    // ---- Maquiavelo · El príncipe y Discursos
    { text: 'La fortuna es dueña de la mitad de nuestras acciones; la otra mitad nos la deja a nosotros.', source: 'Maquiavelo · El príncipe', audience: 'todos' },
    { text: 'El que se apoya solo en la suerte cae cuando la suerte cambia.', source: 'Maquiavelo · El príncipe', audience: 'todos' },
    { text: 'A la gente se le gana con hechos más que con promesas.', source: 'Idea de Maquiavelo · El príncipe', audience: 'campo' },
    { text: 'Un buen consejo nace de la prudencia de quien lo pide, no al revés.', source: 'Maquiavelo · El príncipe', audience: 'mando' },
    { text: 'Quien quiere ver lo que vendrá debe mirar lo que ya pasó.', source: 'Maquiavelo · Discursos sobre Tito Livio', audience: 'mando' },
    { text: 'Es mejor ser audaz que demasiado cauteloso.', source: 'Maquiavelo · El príncipe', audience: 'todos' },

    // ---- Clausewitz · De la guerra
    { text: 'Ningún plan sobrevive intacto al primer contacto con la realidad: ajusta sin perder el objetivo.', source: 'Idea de Helmuth von Moltke', audience: 'mando' },
    { text: 'La audacia, bien dirigida, multiplica las fuerzas.', source: 'Clausewitz · De la guerra', audience: 'todos' },
    { text: 'El ánimo del equipo es una fuerza tan real como su número.', source: 'Clausewitz · De la guerra', audience: 'mando' },
    { text: 'Lo que se pierde en tiempo, ya no se recupera.', source: 'Idea de Clausewitz · De la guerra', audience: 'todos' },
    { text: 'La información del terreno casi siempre llega incompleta: decide con lo que sabes y sigue observando.', source: 'Clausewitz · De la guerra', audience: 'mando' },

    // ---- Musashi · El libro de los cinco anillos
    { text: 'Practica cada día; el camino se aprende andándolo.', source: 'Musashi · El libro de los cinco anillos', audience: 'campo' },
    { text: 'Mira lo lejano como si estuviera cerca y lo cercano como si estuviera lejos.', source: 'Musashi · El libro de los cinco anillos', audience: 'mando' },
    { text: 'No dejes que tu ánimo dependa de las circunstancias.', source: 'Idea de Musashi · El libro de los cinco anillos', audience: 'todos' },
    { text: 'Conoce las herramientas de tu oficio y úsalas cada una en su momento.', source: 'Musashi · El libro de los cinco anillos', audience: 'campo' },
    { text: 'Ten la mente tranquila aunque todo a tu alrededor esté en movimiento.', source: 'Musashi · El libro de los cinco anillos', audience: 'todos' },
    { text: 'El ritmo lo es todo: saber cuándo acelerar y cuándo sostener.', source: 'Musashi · El libro de los cinco anillos', audience: 'mando' },

    // ---- Lao Tse y Confucio
    { text: 'El mejor líder es aquel del que la gente dice al final: lo hicimos nosotros.', source: 'Lao Tse · Tao Te Ching', audience: 'mando' },
    { text: 'Quien conoce a los demás es sabio; quien se conoce a sí mismo es iluminado.', source: 'Lao Tse · Tao Te Ching', audience: 'todos' },
    { text: 'El árbol enorme nació de un brote pequeño.', source: 'Lao Tse · Tao Te Ching', audience: 'campo' },
    { text: 'No importa lo despacio que vayas, siempre que no te detengas.', source: 'Proverbio atribuido a Confucio', audience: 'campo' },
    { text: 'Saber lo que es correcto y no hacerlo es falta de valor.', source: 'Confucio · Analectas', audience: 'todos' },
    { text: 'El que mueve montañas empieza cargando piedras pequeñas.', source: 'Proverbio tradicional chino', audience: 'campo' },
    { text: 'Exígete mucho a ti mismo y poco a los demás.', source: 'Confucio · Analectas', audience: 'mando' },

    // ---- Estoicos y clásicos griegos y romanos
    { text: 'Somos lo que hacemos repetidamente. La excelencia no es un acto, es un hábito.', source: 'Idea de Aristóteles, en palabras de Will Durant', audience: 'todos' },
    { text: 'No te preocupes por lo que no depende de ti; ocúpate de lo que sí.', source: 'Epicteto · Enquiridión', audience: 'todos' },
    { text: 'El obstáculo se vuelve el camino.', source: 'Marco Aurelio · Meditaciones', audience: 'todos' },
    { text: 'Haz cada cosa como si fuera la última de tu día.', source: 'Marco Aurelio · Meditaciones', audience: 'todos' },
    { text: 'Por la mañana, cuando te cueste levantarte, recuerda: te levantas para hacer el trabajo que te toca.', source: 'Marco Aurelio · Meditaciones', audience: 'campo' },
    { text: 'Mientras esperamos vivir, la vida pasa. Empieza hoy.', source: 'Séneca · Cartas a Lucilio', audience: 'todos' },
    { text: 'No hay viento favorable para quien no sabe a qué puerto va.', source: 'Séneca · Cartas a Lucilio', audience: 'mando' },
    { text: 'La dificultad fortalece la mente, como el trabajo al cuerpo.', source: 'Idea de Séneca', audience: 'todos' },
    { text: 'Nada es permanente, excepto el cambio.', source: 'Idea de Heráclito', audience: 'mando' },
    { text: 'Si quieres la paz, prepárate con tiempo.', source: 'Idea de Vegecio · Compendio del arte militar', audience: 'mando' },
    { text: 'El buen carácter es la mejor carta de presentación.', source: 'Idea de Aristóteles · Retórica', audience: 'campo' },
    { text: 'Para convencer, primero hay que ganarse la confianza de quien escucha.', source: 'Idea de Aristóteles · Retórica', audience: 'campo' },

    // ---- Baltasar Gracián · Oráculo manual y arte de prudencia (1647)
    { text: 'Lo bueno, si breve, dos veces bueno.', source: 'Baltasar Gracián · Oráculo manual', audience: 'campo' },
    { text: 'No basta ser bueno: hay que parecerlo y hacerlo saber.', source: 'Idea de Baltasar Gracián · Oráculo manual', audience: 'mando' },
    { text: 'Hay que saber esperar: el tiempo y la paciencia llevan lejos.', source: 'Idea de Baltasar Gracián · Oráculo manual', audience: 'mando' },
    { text: 'Rodéate de gente que sepa; aprender de los demás es la mejor escuela.', source: 'Idea de Baltasar Gracián · Oráculo manual', audience: 'mando' },
    { text: 'Hacer y hacer parecer: el trabajo bien hecho también debe verse.', source: 'Idea de Baltasar Gracián · Oráculo manual', audience: 'todos' },

    // ---- Mexicanos y latinoamericanos (dominio público)
    { text: 'Entre los individuos, como entre las naciones, el respeto al derecho ajeno es la paz.', source: 'Benito Juárez', audience: 'todos' },
    { text: 'Hacer es la mejor manera de decir.', source: 'José Martí', audience: 'todos' },
    { text: 'Un principio justo, desde el fondo de una cueva, puede más que un ejército.', source: 'José Martí', audience: 'mando' },
    { text: 'El que lee mucho y anda mucho, ve mucho y sabe mucho.', source: 'Miguel de Cervantes · Don Quijote', audience: 'campo' },
    { text: 'Con paciencia y constancia se alcanza lo que parecía lejano.', source: 'Idea de Miguel de Cervantes · Don Quijote', audience: 'campo' },
    { text: 'La diligencia es madre de la buena ventura.', source: 'Miguel de Cervantes · Don Quijote', audience: 'campo' },

    // ---- Otros clásicos
    { text: 'No dejes para mañana lo que puedes hacer hoy.', source: 'Idea atribuida a Benjamin Franklin', audience: 'campo' },
    { text: 'Fallar al prepararse es prepararse para fallar.', source: 'Idea atribuida a Benjamin Franklin', audience: 'mando' },
    { text: 'Dime y lo olvido; enséñame y lo recuerdo; involúcrame y lo aprendo.', source: 'Idea tradicional atribuida a Franklin', audience: 'mando' },
    { text: 'Lo que hacemos por los demás nos sobrevive.', source: 'Idea de Plutarco', audience: 'todos' },
    { text: 'El carácter se forma en las tareas pequeñas de cada día.', source: 'Idea de Plutarco · Vidas paralelas', audience: 'todos' },

    // ---- Ideas de autores contemporáneos (resumidas, no citas textuales)
    { text: 'Cubrir y avanzar: ningún equipo gana solo; apoya al compañero para que avance.', source: 'Willink y Babin · Responsabilidad extrema', audience: 'campo', idea: true },
    { text: 'Planes simples, que todos entiendan: lo complicado se cae en el terreno.', source: 'Willink y Babin · Responsabilidad extrema', audience: 'mando', idea: true },
    { text: 'Cada líder de grupo debe entender el objetivo para decidir por sí mismo cuando haga falta.', source: 'Willink y Babin · Responsabilidad extrema', audience: 'mando', idea: true },
    { text: 'Para que el equipo crea en la misión, primero tienes que creer tú y explicar el porqué.', source: 'Willink y Babin · Responsabilidad extrema', audience: 'mando', idea: true },
    { text: 'El ego estorba: reconocer un error a tiempo te hace más fuerte, no más débil.', source: 'Willink y Babin · Responsabilidad extrema', audience: 'todos', idea: true },
    { text: 'Cuando la gente confía en que su líder la protege, trabaja unida hacia afuera.', source: 'Simon Sinek · Los líderes comen al final', audience: 'mando', idea: true },
    { text: 'La confianza se construye con pequeños gestos repetidos, no con discursos.', source: 'Simon Sinek · Los líderes comen al final', audience: 'todos', idea: true },
    { text: 'Liderar no es tener un cargo: es hacerse cargo de las personas.', source: 'Simon Sinek · Los líderes comen al final', audience: 'mando', idea: true },
    { text: 'La gente no se suma a lo que haces, sino a por qué lo haces.', source: 'Simon Sinek · La clave es el porqué', audience: 'campo', idea: true },
    { text: 'Ponte contra la pared: cuando no hay marcha atrás, el equipo saca lo mejor de sí.', source: 'Robert Greene · Las 33 estrategias de la guerra', audience: 'todos', idea: true },
    { text: 'Conoce al otro equipo mejor de lo que se conoce a sí mismo.', source: 'Robert Greene · Las 33 estrategias de la guerra', audience: 'mando', idea: true },
    { text: 'Gana con muchas victorias pequeñas, una tras otra.', source: 'Robert Greene · Las 33 estrategias de la guerra', audience: 'campo', idea: true },
    { text: 'Controla tus emociones: el que se enoja primero, pierde la claridad.', source: 'Robert Greene · Las 33 estrategias de la guerra', audience: 'todos', idea: true },
    { text: 'Que la gente pueda decidir en el terreno sin esperar órdenes para todo.', source: 'Robert Greene · Las 33 estrategias de la guerra', audience: 'mando', idea: true },

    // ---- Principios de campaña (del equipo Tlatoani)
    { text: 'Cada persona que conoces hoy es alguien que puede hablar bien de ti mañana.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Sonríe, saluda, escucha. Lo demás viene solo.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Una visita bien hecha vale más que diez a la carrera.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Regresa a donde te dijeron "vuelva otro día": ahí está la mitad del trabajo.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Tu constancia en la calle es lo que la gente recuerda.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Nadie gana solo: comparte lo que funcionó en tu ruta con tu grupo.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'La lluvia, el sol y el cansancio pasan; lo que avanzaste se queda.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Hoy completa tu ruta. Mañana se ve en el mapa.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Llega puntual, uniformado y con ánimo: la primera impresión cuenta.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Una queja bien escuchada puede convertirse en una persona que se suma.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Conoce los problemas de tu colonia antes que nadie.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Cuida tu teléfono y tu batería: son tu herramienta de trabajo.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'La verdad dicha con respeto convence más que una promesa.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'Primero la gente, luego el volante.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Cada registro con datos correctos es oro para el equipo.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Lo que hoy mides, mañana lo puedes mejorar.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Reconoce en público el esfuerzo de tu equipo; corrige en privado.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Pon a las mejores personas donde la elección se decide.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Una reunión sin acuerdos es tiempo perdido para el territorio.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Revisa el mapa cada mañana: las secciones flojas no avisan.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'La campaña se juega dentro de la ley: cuidar las reglas también es cuidar el triunfo.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'Un equipo cansado necesita descanso, no regaños.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Agradece cada puerta que se abre, aunque no te digan que sí.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'El que escucha a su gente se entera antes de los problemas.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Cada día de campaña cuenta igual: el primero y el último.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'Hoy alguien va a conocer el proyecto gracias a ti.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'Lo que construyes en la calle no lo borra ningún anuncio.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'El trabajo en equipo convierte lo imposible en una tarea del día.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'Pregunta, anota y regresa: así se gana la confianza.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'Tu ejemplo pesa más que tus instrucciones.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Las metas claras ahorran discusiones.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Celebra cada meta cumplida, por pequeña que sea.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'La gente recuerda cómo la hiciste sentir, más que lo que le dijiste.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'Ser constante le gana a ser brillante un solo día.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'Un buen equipo se cuida entre sí: nadie se queda atrás en la ruta.', source: 'Principio de campaña', audience: 'campo' },
    { text: 'La humildad abre puertas que la soberbia cierra.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'Hoy da un paso más que ayer.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'Una buena pregunta vale más que un largo discurso.', source: 'Principio de campaña', audience: 'todos' },
    { text: 'El orden en los datos es orden en la campaña.', source: 'Principio de campaña', audience: 'mando' },
    { text: 'Quien conoce su sección, no se pierde en la elección.', source: 'Principio de campaña', audience: 'todos' },
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
    try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, pick.text].slice(-400))); } catch { /* sin almacenamiento */ }
    return pick;
};

/** Frase corta al azar (para pantallas de carga), sin tocar el historial. */
export const quickPhrase = (): Phrase => {
    const short = PHRASES.filter(p => p.text.length <= 80);
    return short[Math.floor(Math.random() * short.length)];
};
