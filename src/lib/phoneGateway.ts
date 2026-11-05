import { registerPlugin } from '@capacitor/core';
import { supabase } from './supabase';
import { isNativeApp } from './location';

/**
 * Celular de la campaña como puente de mensajes ("Tlatoani Envíos"), automático 24/7.
 * Al activarlo, el celular recibe una llave propia (no usa la sesión de la persona) y arranca un servicio
 * nativo que sigue enviando aunque la app esté cerrada, la pantalla apagada o el celular se reinicie.
 * - SMS: salen solos desde el chip del celular, a cualquier hora.
 * - WhatsApp: el código sale solo por SMS y, además, el celular avisa para mandarlo por WhatsApp con un toque.
 */

type NativeStatus = {
    enabled: boolean; sent: number; failed: number; lastAt: number; lastSeen: number;
    lastError: string | null; batteryUnrestricted: boolean; notifications: boolean; revoked?: boolean;
};
type SmsSenderPlugin = {
    available(): Promise<{ available: boolean; granted: boolean }>;
    requestSmsPermission(): Promise<{ granted: boolean }>;
    requestNotificationPermission(): Promise<{ granted: boolean }>;
    requestIgnoreBatteryOptimizations(): Promise<void>;
    startGateway(o: { url: string; apiKey: string; token: string }): Promise<void>;
    stopGateway(): Promise<void>;
    gatewayStatus(): Promise<NativeStatus>;
};
const SmsSender = registerPlugin<SmsSenderPlugin>('SmsSender');

const KEY = 'tl_gateway';
const STATUS_MS = 5000;

export type GatewayState = {
    on: boolean; bridge: string | null; sent: number; failed: number;
    lastAt: string | null; lastError: string | null; batteryOk: boolean; online: boolean;
};

let state: GatewayState = { on: false, bridge: null, sent: 0, failed: 0, lastAt: null, lastError: null, batteryOk: true, online: false };
const listeners = new Set<(s: GatewayState) => void>();
let timer: number | null = null;

const emit = () => listeners.forEach(l => l({ ...state }));

const refresh = async () => {
    try {
        const n = await SmsSender.gatewayStatus();
        state = {
            ...state, on: n.enabled, sent: n.sent, failed: n.failed,
            lastAt: n.lastAt ? new Date(n.lastAt).toISOString() : null,
            lastError: n.lastError, batteryOk: n.batteryUnrestricted,
            online: n.enabled && Date.now() - n.lastSeen < 60_000,
        };
        emit();
    } catch { /* versión sin envío */ }
};

export const subscribeGateway = (fn: (s: GatewayState) => void) => {
    listeners.add(fn); fn({ ...state });
    if (!timer && isNativeApp()) { refresh(); timer = window.setInterval(refresh, STATUS_MS); }
    return () => {
        listeners.delete(fn);
        if (!listeners.size && timer) { window.clearInterval(timer); timer = null; }
    };
};

type Saved = { on?: boolean; bridge?: string | null; device?: string };
const saved = (): Saved => {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
};
const save = (device?: string) => {
    try { localStorage.setItem(KEY, JSON.stringify({ on: state.on, bridge: state.bridge, device: device || saved().device })); } catch { /* sin almacenamiento */ }
};

/** ¿Este celular puede funcionar como puente? (solo la versión "Tlatoani Envíos" en Android) */
export const gatewayAvailable = async () => {
    if (!isNativeApp()) return false;
    try { return (await SmsSender.available()).available; } catch { return false; }
};

/** Registra el celular, saca su llave propia y arranca el servicio nativo. */
const startNative = async (device: string) => {
    const { data: bridge, error } = await supabase.rpc('fn_gateway_register', { p_bridge: saved().bridge || null, p_device: device, p_phone: null });
    if (error || !bridge) throw new Error(error?.message || 'No se pudo activar.');
    const { data: token, error: e2 } = await supabase.rpc('fn_gateway_issue_token', { p_bridge: bridge });
    if (e2 || !token) throw new Error(e2?.message || 'No se pudo activar.');
    await SmsSender.startGateway({ url: import.meta.env.VITE_SUPABASE_URL, apiKey: import.meta.env.VITE_SUPABASE_ANON_KEY, token: token as string });
    state = { ...state, on: true, bridge: bridge as string, lastError: null };
    save(device); emit();
};

/** Activar: permisos (SMS, notificación, batería) y arranque del envío automático. */
export const enableGateway = async (device: string) => {
    const perm = await SmsSender.requestSmsPermission();
    if (!perm.granted) throw new Error('Sin el permiso para enviar SMS, este celular no puede mandar los códigos.');
    await SmsSender.requestNotificationPermission().catch(() => undefined);
    await startNative(device);
    // Que Android no "duerma" la app en la madrugada
    await SmsSender.requestIgnoreBatteryOptimizations().catch(() => undefined);
    refresh();
};

export const disableGateway = async () => {
    const bridge = state.bridge || saved().bridge;
    if (bridge) await supabase.rpc('fn_gateway_off', { p_bridge: bridge });
    await SmsSender.stopGateway().catch(() => undefined);
    state = { ...state, on: false, online: false };
    save(); emit();
};

/** Volver a pedir que Android no limite la app por batería (desde el aviso en pantalla). */
export const fixBattery = () => SmsSender.requestIgnoreBatteryOptimizations().then(refresh).catch(() => undefined);

/** Al abrir la app: si estaba activado pero el servicio no corre (p. ej. se forzó el cierre), lo vuelve a arrancar. */
export const resumeGateway = async () => {
    const s = saved();
    if (!s.on || !s.bridge || !(await gatewayAvailable())) return;
    state = { ...state, bridge: s.bridge };
    try {
        const n = await SmsSender.gatewayStatus();
        // Dado de baja desde el tablero: no se reactiva solo
        if (n.revoked) { state = { ...state, on: false }; save(); emit(); return; }
        if (!n.enabled) await startNative(s.device || 'Celular de la campaña');
    } catch { /* sin servicio o sin sesión */ }
    refresh();
};
