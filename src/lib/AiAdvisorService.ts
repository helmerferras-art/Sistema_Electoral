import { supabase } from './supabase';
import { askAI } from './aiProxy';

export interface AISuggestedTask {
    title: string;
    description: string;
    department: 'Comunicación' | 'Activismo' | 'Jurídico' | 'Finanzas' | 'Sistemas';
    priority: 'Alta' | 'Media' | 'Baja';
    target_age_range?: string;
    target_location?: string;
    assigned_to?: string;
}

export interface AIStrategicInsight {
    id?: string;
    topic: string;
    insight_text: string;
    suggested_tasks: AISuggestedTask[];
    municipality?: string;
    section_id?: string;
    model_used: string;
    is_implemented?: boolean;
}

export class AiAdvisorService {
    static async generateInsight(params: {
        municipality: string;
        section_id?: string;
        topic: 'cobertura' | 'presencia' | 'intencion' | 'actividades';
        tenantId: string;
    }): Promise<AIStrategicInsight> {
        // 1. ¿Hay IA disponible? (las llaves solo las conoce el servidor)
        const { data: aiStatus } = await supabase.rpc('fn_ai_status');
        if (!(aiStatus as any)?.disponible) throw new Error('No hay configuración de IA activa.');

        // ==========================================
        // NIVEL 1: BANCO GLOBAL DE ESTRATEGIAS (CACHÉ)
        // ==========================================
        const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
        const { data: cachedInsight } = await supabase
            .from('ai_strategic_insights')
            .select('*')
            .eq('municipality', params.municipality)
            .eq('topic', params.topic)
            .gte('created_at', fifteenDaysAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (cachedInsight) {
            console.log(`[Banco Estratégico] ♻️ Insight recuperado desde caché global (${params.municipality} - ${params.topic})`);
            // Se entrega gratis al inquilino pero lo guardamos a su nombre
            const clonedInsight = { ...cachedInsight, id: undefined, tenant_id: params.tenantId, model_used: 'strategy-bank-cache', created_at: undefined };
            const { data } = await supabase.from('ai_strategic_insights').insert(clonedInsight).select('id').single();
            if (data) clonedInsight.id = data.id;
            return {
                ...clonedInsight,
                suggested_tasks: typeof clonedInsight.suggested_tasks === 'string' ? JSON.parse(clonedInsight.suggested_tasks) : clonedInsight.suggested_tasks
            } as AIStrategicInsight;
        }

        // ==========================================
        // NIVEL 2: CUOTA DE INQUILINO (1 por cada 3 días)
        // ==========================================
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
        const { data: lastTenantInsight } = await supabase
            .from('ai_strategic_insights')
            .select('created_at')
            .eq('tenant_id', params.tenantId)
            // Solo contamos insights reales, no los heurísticos locales o los de caché donados.
            .not('model_used', 'in', '("strategy-bank-cache","local-heuristic-engine")')
            .gte('created_at', threeDaysAgo)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (lastTenantInsight) {
            console.warn(`[Cuota IA] ⛔ Límite alcanzado para el Inquilino ${params.tenantId}. Construyendo estrategia local...`);
            // NIVEL 3: MOTOR HEURÍSTICO LOCAL DE RESPALDO (Sin Gasto de API)
            const localInsight = AiAdvisorService.generateLocalOfflineInsight(params.municipality, params.topic);
            const fallbackInsight = {
                tenant_id: params.tenantId,
                municipality: params.municipality,
                section_id: params.section_id,
                topic: localInsight.topic,
                insight_text: localInsight.insight_text,
                suggested_tasks: localInsight.suggested_tasks,
                model_used: 'local-heuristic-engine'
            } as Partial<AIStrategicInsight>;
            const { data } = await supabase.from('ai_strategic_insights').insert(fallbackInsight).select('id').single();
            if (data) fallbackInsight.id = data.id;
            return fallbackInsight as AIStrategicInsight;
        }

        // ==========================================
        // FLUJO NORMAL: CONSULTA A LA IA (Nivel 2 Autorizado)
        // ==========================================

        // 2. Obtener Datos Demográficos
        let demoQuery = supabase.from('colony_demographics').select('*').eq('nom_mun', params.municipality);
        if (params.section_id) {
            // Nota: En colony_demographics usamos cvegeo o similar para mapear, 
            // pero si no hay link directo por sección, usamos el municipio.
        }
        const { data: demoData } = await demoQuery;

        // 3. Obtener Datos Históricos
        const { data: historicalData } = await supabase
            .from('historical_election_results')
            .select('*')
            .eq('municipality', params.municipality)
            .order('election_year', { ascending: false })
            .limit(5);

        // 4. Obtener Estrategias Implementadas Previas (Memoria)
        const { data: implementedInsights } = await supabase
            .from('ai_strategic_insights')
            .select('topic, insight_text, suggested_tasks')
            .eq('tenant_id', params.tenantId)
            .eq('is_implemented', true)
            .order('created_at', { ascending: false })
            .limit(5);

        // 5. Construir el Prompt
        const prompt = `
            Eres un experto asesor de estrategia electoral para el estado de Chiapas, México.
            Tu misión es analizar datos y sugerir acciones concretas.

            CONTEXTO GEOGRÁFICO:
            Municipio: ${params.municipality}
            ${params.section_id ? `Sección: ${params.section_id}` : ''}
            Tema de consulta: ${params.topic}

            DATOS DEMOGRÁFICOS (Muestra):
            ${JSON.stringify(demoData?.slice(0, 10))}
            
            DATOS HISTÓRICOS RECIENTES:
            ${JSON.stringify(historicalData)}

            ESTRATEGIAS YA IMPLEMENTADAS POR EL EQUIPO (NO REPETIR):
            ${implementedInsights && implementedInsights.length > 0 ? JSON.stringify(implementedInsights) : 'Ninguna estrategia ha sido marcada como implementada aún.'}

            REQUERIMIENTOS ESTRICTOS DE VIABILIDAD y GEOLOCALIZACIÓN:
            1. Analiza profundamente el nivel socioeconómico, cobertura de internet e infraestructura del municipio "${params.municipality}".
            2. Si es considerado rural, de alta marginación o con población regida por Sistemas Normativos Indígenas (ej. Chamula, Chenalhó), ESTÁ ESTRICTAMENTE PROHIBIDO sugerir "Crear una App", "Sitios Web" o "Campañas Masivas de Redes".
            3. Para zonas rurales/indígenas: las tareas de "Sistemas" deben enfocarse en Radios VHF/UHF o bases locales offline. La "Comunicación" debe ser perifoneo, radio comunitaria y traducción a lenguas originarias.
            4. Define actividades específicas por RANGOS DE EDAD.
            5. Define tareas muy accionables asignadas a departamentos: Comunicación, Activismo, Jurídico o Sistemas.
            6. CRÍTICO: Evita proponer las tácticas listadas en "ESTRATEGIAS YA IMPLEMENTADAS", piensa en el siguiente paso lógico o escalada.
            7. SEGMENTACIÓN: Basado en los datos, asigna un "target_location" a CADA tarea sugiriendo una sección electoral o colonia específica del municipio que requiera esa acción prioritaria.
            
            RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO CON ESTE FORMATO:
            {
                "topic": "...",
                "insight_text": "Análisis detallado de la situación...",
                "suggested_tasks": [
                    {
                        "title": "Título corto",
                        "description": "Explicación de la tarea",
                        "department": "Comunicación | Activismo | Jurídico | Sistemas",
                        "priority": "Alta | Media | Baja",
                        "target_age_range": "e.g. 18-24",
                        "target_location": "ej. Sección 0432 o Colonia Centro"
                    }
                ]
            }
        `;

        // 5. Llamada a la API con mecanismo de Fallback
        let mockResponse = '';
        let usedProvider = '';
        let success = false;

        try {
            const res = await askAI('advisor', { prompt });
            mockResponse = res.content || '';
            usedProvider = res.provider;
            success = !!mockResponse;
        } catch (error: any) {
            console.warn(`⚠️ La IA no respondió: ${error.message}`);
        }

        if (!success) {
            // Todos fallaron. Activar modo de emergencia devolviendo un JSON de aviso
            mockResponse = JSON.stringify({
                topic: "Error Crítico de Conexión IA",
                insight_text: "Ningún proveedor de Inteligencia Artificial pudo procesar la solicitud o se alcanzó el tope diario. El detalle queda en la bitácora de uso de IA.",
                suggested_tasks: [
                    {
                        title: "Revisión Urgente de APIs",
                        description: "Ingresar al Modo Dios > Inteligencia IA y verificar saldo, tokens o límites de peticiones (Error 429) de las API Keys.",
                        department: "Sistemas",
                        priority: "Alta",
                        target_age_range: "N/A"
                    }
                ]
            });
            usedProvider = 'FallbackSystem';
        }

        try {
            console.log(`[AiAdvisorService] Intentando parsear JSON de la respuesta final. Tamaño: ${mockResponse.length} caracteres.`);
            const result = JSON.parse(mockResponse) as AIStrategicInsight;
            result.model_used = usedProvider;
            result.municipality = params.municipality;
            result.section_id = params.section_id;

            // 6. Guardar en DB
            try {
                console.log(`[AiAdvisorService] Insertando registro estratégico en Supabase para Inquilino: ${params.tenantId}`);
                const { data } = await supabase.from('ai_strategic_insights').insert({
                    tenant_id: params.tenantId,
                    municipality: params.municipality,
                    section_id: params.section_id,
                    topic: result.topic,
                    insight_text: result.insight_text,
                    suggested_tasks: result.suggested_tasks,
                    model_used: result.model_used
                }).select('id').single();

                if (data) {
                    result.id = data.id;
                }
                console.log(`[AiAdvisorService] ✅ Registro insertado correctamente.`);
            } catch (dbError: any) {
                console.error(`[AiAdvisorService] ❌ Fallo crítico al guardar el insight en base de datos:`, dbError);
                // No lanzamos el error para que al menos la UI muestre la estrategia en pantalla
            }

            return result;
        } catch (parseError: any) {
            console.error(`[AiAdvisorService] ❌ Fallo crítico parseando la respuesta de la IA. La respuesta no fue un JSON válido.`, parseError);
            console.error(`[AiAdvisorService] Respuesta recibida:`, mockResponse.substring(0, 200) + '...');

            // Devolver objeto seguro por defecto
            return {
                topic: "Error de Formateo AI",
                insight_text: "La Inteligencia Artificial respondió pero el formato no pudo ser descifrado. " + parseError.message,
                suggested_tasks: [],
                model_used: usedProvider,
                municipality: params.municipality
            } as AIStrategicInsight;
        }
    }

    private static generateLocalOfflineInsight(municipality: string, topic: string): Partial<AIStrategicInsight> {
        // Motor Heurístico Pseudoaleatorio y Desconectado para Ahorro de APIs
        const isRural = ['chamula', 'chenalho', 'mitontic', 'sitala', 'aldama', 'chalchihuitan'].some(m => municipality.toLowerCase().includes(m));

        let insight_text = `Análisis de Respaldo Local activado para ${municipality}. `;
        const suggested_tasks: AISuggestedTask[] = [];

        if (topic === 'cobertura') {
            insight_text += "La prioridad es garantizar estructura física en las secciones clave.";
            suggested_tasks.push(
                {
                    title: "Asamblea de Autoridades Locales",
                    description: isRural ? "Reunión con Patronatos y Agentes Municipales respaldando por usos y costumbres." : "Desayuno estratégico con Seccionales y líderes de barrio.",
                    department: "Activismo",
                    priority: "Alta",
                    target_age_range: "35+"
                },
                {
                    title: "Despliegue de Comunicación de Guerrilla",
                    description: isRural ? "Perifoneo en tzotzil/tzeltal y radio comunitaria local." : "Distribución de folletos y presencia en cruceros principales.",
                    department: "Comunicación",
                    priority: "Media"
                }
            );
        } else if (topic === 'intencion') {
            insight_text += "Es vital reforzar encuestas espejo y validación de intención de voto real.";
            suggested_tasks.push(
                {
                    title: "Levantamiento de Sondeo Local",
                    description: isRural ? "Censo rápido a nivel asamblea ejidal, en libretas." : "Encuesta telefónica o de interceptación en plazas principales.",
                    department: "Sistemas",
                    priority: "Alta"
                }
            );
        } else {
            insight_text += "Mantener disciplina operativa y cobertura total de representantes.";
            suggested_tasks.push(
                {
                    title: "Revisión RC",
                    description: "Capacitación jurídica intensiva para defender el voto.",
                    department: "Jurídico",
                    priority: "Alta"
                }
            );
        }

        return {
            topic: `Estrategia de Contención: ${topic.toUpperCase()}`,
            insight_text,
            suggested_tasks
        };
    }
}
