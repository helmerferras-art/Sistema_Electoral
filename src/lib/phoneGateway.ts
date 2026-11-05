import { registerPlugin } from '@capacitor/core';
import { supabase } from './supabase';
import { isNativeApp } from './location';

/**
 * Celular de la campaña como puente de mensajes ("Tlatoani Envíos").
 * - SMS: se envían solos desde el chip del celular.
 * - WhatsApp: el celular los muestra y se envían con un toque (WhatsApp no permite automatizar su app).
 * Usa la sesión de quien lo activa; el servidor solo le entrega los mensajes de su campaña.
 */

type SmsSenderPlugin = {
    available(): Promise<{ available: boolean; granted: boolean }>;
    requestSmsPermission(): Promise<{ granted: boolean }>;
    send(o: { to: string; body: string }): Promise<{ ok: boolean }>;
    keepAwake(o: { on: boolean }): Promise<void>;
};
const SmsSender = registerPlugin<SmsSenderPlugin>('SmsSender');

const KEY = 'tl_gateway';
const POLL_MS = 8000;
const GAP_MS = 3000; // pausa entre SMS

export type WaItem = { id: string; phone: string; message: string; isCode: boolean };
export type GatewayState = {
    on: boolean; bridge: string | null; sent: number; failed: number;
    lastAt: string | null; lastError: string | null; wa: WaItem[];
};

let state: GatewayState = { on: false, bridge: null, sent: 0, failed: 0, lastAt: null, lastError: null, wa: [] };
const listeners = new Set<(s: GatewayState) => void>();
let timer: number | null = null;
let busy = false;

const emit = () => listeners.forEach(l => l({ ...state, wa: [...state.wa] }));
export const subscribeGateway = (fn: (s: GatewayState) => void) => { listeners.add(fn); fn({ ...state }); return () => { listeners.delete(fn); }; };

const saved = (): { on: boolean; bridge: string | null } => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return { on: false, bridge: null }; }
};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ on: state.on, bridge: state.bridge })); } catch { /* sin almacenamiento */ } };

/** ¿Este celular puede funcionar como puente? (solo la versión "Tlatoani Envíos" en Android) */
export const gatewayAvailable = async () => {
    if (!isNativeApp()) return false;
    try { return (await SmsSender.available()).available; } catch { return false; }
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const tick = async () => {
    if (busy || !state.on || !state.bridge) return;
    busy = true;
    try {
        const { data, error } = await supabase.rpc('fn_gateway_pull', { p_bridge: state.bridge, p_limit: 5 });
        if (error) { state.lastError = error.message; emit(); return; }
        for (const c of (data || []) as { id: string; type: string; phone: string; message: string; is_code: boolean }[]) {
            if (c.type === 'wa') {
                if (!state.wa.some(w => w.id === c.id)) state.wa.push({ id: c.id, phone: c.phone, message: c.message, isCode: c.is_code });
                continue;
            }
            try {
                await SmsSender.send({ to: c.phone, body: c.message });
                state.sent++; state.lastAt = new Date().toISOString(); state.lastError = null;
                await supabase.rpc('fn_gateway_report', { p_cmd: c.id, p_ok: true, p_error: null });
            } catch (e: any) {
                state.failed++; state.lastError = String(e?.message || e);
                await supabase.rpc('fn_gateway_report', { p_cmd: c.id, p_ok: false, p_error: state.lastError });
            }
            emit();
            await sleep(GAP_MS);
        }
        emit();
    } finally { busy = false; }
};

const startLoop = () => {
    if (timer) return;
    SmsSender.keepAwake({ on: true }).catch(() => undefined);
    tick();
    timer = window.setInterval(tick, POLL_MS);
};
const stopLoop = () => {
    if (timer) { window.clearInterval(timer); timer = null; }
    SmsSender.keepAwake({ on: false }).catch(() => undefined);
};

/** Activar: pide permiso de SMS, registra el celular en la campaña y empieza a enviar. */
export const enableGateway = async (device: string) => {
    const perm = await SmsSender.requestSmsPermission();
    if (!perm.granted) throw new Error('Sin el permiso para enviar SMS, este celular no puede mandar los códigos.');
    const { data, error } = await supabase.rpc('fn_gateway_register', { p_bridge: saved().bridge, p_device: device, p_phone: null });
    if (error || !data) throw new Error(error?.message || 'No se pudo activar.');
    state = { ...state, on: true, bridge: data as string, lastError: null };
    save(); emit(); startLoop();
};

export const disableGateway = async () => {
    if (state.bridge) await supabase.rpc('fn_gateway_off', { p_bridge: state.bridge });
    state = { ...state, on: false };
    save(); stopLoop(); emit();
};

/** Al abrir la app: si este celular estaba activado, sigue enviando. */
export const resumeGateway = async () => {
    const s = saved();
    if (!s.on || !s.bridge || !(await gatewayAvailable())) return;
    state = { ...state, on: true, bridge: s.bridge };
    emit(); startLoop();
};

/** WhatsApp: abre el chat con el mensaje escrito; la persona solo oprime "enviar". */
export const sendWaItem = async (item: WaItem) => {
    const digits = item.phone.replace(/\D/g, '');
    window.location.href = `https://wa.me/${digits}?text=${encodeURIComponent(item.message)}`;
    state.wa = state.wa.filter(w => w.id !== item.id);
    state.sent++; state.lastAt = new Date().toISOString();
    emit();
    await supabase.rpc('fn_gateway_report', { p_cmd: item.id, p_ok: true, p_error: 'whatsapp_manual' });
};
