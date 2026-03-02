/**
 * SocialAiService: Motor de Inteligencia Artificial para el C4I
 * Este servicio centraliza las llamadas a OpenAI para la gestión de Redes Sociales.
 */

export interface AiPostRequest {
    network: 'facebook' | 'instagram' | 'tiktok';
    topic: string;
    tone: 'institutional' | 'energetic' | 'urgent';
    objectives: string[];
}

export interface AiInboxResponse {
    comment: string;
    sentiment: 'positive' | 'neutral' | 'negative' | 'hostile';
    suggestedResponse: string;
}

class SocialAiService {
    // private apiKey: string = import.meta.env.VITE_OPENAI_API_KEY || '';

    /**
     * Genera un borrador de publicación para una red social específica.
     */
    async generatePost(req: AiPostRequest): Promise<string> {
        console.log(`[AI] Generando post para ${req.network}...`);

        // Simulación de latencia de red
        await new Promise(r => setTimeout(r, 1500));

        // const basePrompt = `Como estratega electoral experto, escribe un post de ${req.network} sobre: ${req.topic}. Tono: ${req.tone}.`;

        // Respuesta Mock basada en el input
        if (req.network === 'instagram') {
            return `✨ ¡Chiapas merece más! ✨\n\nTrabajamos con el corazón para transformar cada rincón de nuestro estado. 🧡\n\n#Chiapas #Transformación #Liderazgo #HelmerFerras`;
        }

        if (req.network === 'tiktok') {
            return `[Script] Cámara rápida recorriendo las calles. Sonrisa. Señal de OK.\nTexto en pantalla: "¡Hoy avanzamos por ti!"\nAudio sugerido: Trend del momento (Chiapas Remix).`;
        }

        return `🇲🇽 | Juntos estamos construyendo el futuro que Tuxtla Gutiérrez necesita.\n\nHoy recorrimos la sección 102 escuchando tus necesidades. ¡No te vamos a fallar!\n\n#FuerzaTuxtla #Elecciones2024 #PlanC`;
    }

    /**
     * Analiza un comentario y sugiere una respuesta táctica.
     */
    async analyzeComment(comment: string): Promise<AiInboxResponse> {
        console.log(`[AI] Analizando comentario: "${comment.substring(0, 20)}..."`);

        await new Promise(r => setTimeout(r, 1000));

        // Lógica de detección simple rápida (Mock)
        const lowComment = comment.toLowerCase();

        if (lowComment.includes('ratero') || lowComment.includes('mentira')) {
            return {
                comment,
                sentiment: 'hostile',
                suggestedResponse: "Agradecemos tu comentario. Seguimos trabajando con transparencia. Los resultados están a la vista de todos."
            };
        }

        if (lowComment.includes('felicidades') || lowComment.includes('vamos con todo')) {
            return {
                comment,
                sentiment: 'positive',
                suggestedResponse: "¡Muchas gracias por tu apoyo! Juntos somos imparables. 🧡"
            };
        }

        return {
            comment,
            sentiment: 'neutral',
            suggestedResponse: "¡Hola! Gracias por participar en la conversación. ¿Hay algo específico en lo que podamos ayudarte?"
        };
    }
}

export const socialAiService = new SocialAiService();
