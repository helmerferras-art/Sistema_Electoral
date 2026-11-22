import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/**
 * Etapa del proyecto. Antes de la precampaña nadie es "candidato": se le llama "aspirante"
 * y la coordinación no es "de campaña", para no generar materiales que parezcan actos anticipados.
 * Se considera etapa de aspirante cuando el objetivo de metas no es "votos" (encuesta o conocimiento).
 */
let cache: { tenant: string; aspirant: boolean } | null = null;

export const useAspirantStage = (tenantId?: string | null) => {
    const [aspirant, setAspirant] = useState(cache && cache.tenant === tenantId ? cache.aspirant : false);
    useEffect(() => {
        if (!tenantId) return;
        if (cache && cache.tenant === tenantId) { setAspirant(cache.aspirant); return; }
        supabase.from('goal_settings').select('objective').eq('tenant_id', tenantId).maybeSingle().then(({ data }) => {
            const v = !!data && (data as any).objective !== 'votos';
            cache = { tenant: tenantId, aspirant: v };
            setAspirant(v);
        });
    }, [tenantId]);
    return aspirant;
};

/** Nombres de perfil que cambian en la etapa de aspirante. */
export const ASPIRANT_LABELS: Record<string, string> = {
    candidato: 'Aspirante',
    coordinador_campana: 'Coordinación general',
};

export const stageRoleLabel = (role: string, base: string, aspirant: boolean) =>
    aspirant && ASPIRANT_LABELS[role] ? ASPIRANT_LABELS[role] : base;
