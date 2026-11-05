import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { app, safeStorage } from 'electron';
import { detectModems, sendModemSms, type ModemInfo } from './modem.js';
import { detectAndroid, sendAndroidSms, type AndroidInfo } from './android.js';
import { maskPhone, sleep } from './sys.js';

/**
 * Motor del puente: cada pocos segundos pide al servidor los SMS que le tocan (los códigos de acceso de
 * todas las campañas) y los envía por la línea configurada (módem USB o celular Android por USB).
 * Trabaja con la llave propia del equipo; nunca con la llave maestra.
 */

export const SUPABASE_URL = 'https://dlpbgbldfzxyxhbnmjfn.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_QoMeVGw6k1OFH1313DC7Zg_f9eci56q';

export type Line = { kind: 'modem'; port: string; label: string } | { kind: 'android'; serial: string; label: string };
type Saved = { token?: string; tokenEnc?: string; line?: Line; name?: string; paused?: boolean; sent?: number; failed?: number };
export type LogItem = { at: string; ok: boolean; text: string };
export type BridgeState = {
    configured: boolean; running: boolean; paused: boolean;
    status: 'sin_configurar' | 'pausado' | 'sin_linea' | 'sin_internet' | 'en_linea';
    name: string; line: Line | null; lineOk: boolean; sent: number; failed: number;
    lastAt: string | null; lastError: string | null; log: LogItem[];
};

const POLL_MS = 5_000;
const LINE_CHECK_MS = 60_000;
const GAP_MS = 2_500;

const file = () => path.join(app.getPath('userData'), 'puente.json');

const load = (): Saved => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch { return {}; } };

class Engine extends EventEmitter {
    private cfg: Saved = {};
    private token: string | null = null;
    private timer: NodeJS.Timeout | null = null;
    private busy = false;
    private lastLineCheck = 0;
    private lastHello = '';
    state: BridgeState = {
        configured: false, running: false, paused: false, status: 'sin_configurar',
        name: os.hostname(), line: null, lineOk: false, sent: 0, failed: 0, lastAt: null, lastError: null, log: [],
    };

    init() {
        this.cfg = load();
        if (this.cfg.tokenEnc && safeStorage.isEncryptionAvailable()) {
            try { this.token = safeStorage.decryptString(Buffer.from(this.cfg.tokenEnc, 'base64')); } catch { this.token = null; }
        } else if (this.cfg.token) this.token = this.cfg.token;
        Object.assign(this.state, {
            configured: !!(this.token && this.cfg.line), paused: !!this.cfg.paused, line: this.cfg.line || null,
            name: this.cfg.name || os.hostname(), sent: this.cfg.sent || 0, failed: this.cfg.failed || 0,
        });
        this.refreshStatus();
        if (this.state.configured) this.start();
    }

    private save() {
        const out: Saved = { line: this.cfg.line, name: this.cfg.name, paused: this.cfg.paused, sent: this.state.sent, failed: this.state.failed };
        if (this.token) {
            if (safeStorage.isEncryptionAvailable()) out.tokenEnc = safeStorage.encryptString(this.token).toString('base64');
            else out.token = this.token;
        }
        fs.mkdirSync(path.dirname(file()), { recursive: true });
        fs.writeFileSync(file(), JSON.stringify(out, null, 2));
    }

    private emitState() { this.emit('state', this.getState()); }
    getState(): BridgeState { return { ...this.state, log: [...this.state.log] }; }

    log(ok: boolean, text: string) {
        this.state.log.unshift({ at: new Date().toISOString(), ok, text });
        this.state.log = this.state.log.slice(0, 150);
        this.emitState();
    }

    private refreshStatus(online?: boolean) {
        const s = this.state;
        s.status = !s.configured ? 'sin_configurar' : s.paused ? 'pausado' : !s.lineOk ? 'sin_linea' : online === false ? 'sin_internet' : 'en_linea';
        this.emitState();
    }

    // ---------- servidor ----------
    async rpc(fn: string, body: Record<string, unknown>) {
        const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
            method: 'POST',
            headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(20_000),
        });
        const text = await res.text();
        let data: any = null;
        try { data = text ? JSON.parse(text) : null; } catch { data = text; }
        if (!res.ok) throw new Error(data?.message || `Servidor ${res.status}`);
        return data;
    }

    /** Valida una llave nueva (desde el asistente). */
    async checkToken(token: string) {
        const t = token.trim().toLowerCase();
        if (!/^[0-9a-f]{64}$/.test(t)) throw new Error('La llave debe tener 64 letras y números. Cópiala completa desde el tablero.');
        const r = await this.rpc('fn_gateway_hello_token', { p_token: t, p_name: this.state.name, p_line: null });
        if (!r?.platform) throw new Error('Esa llave no es de un puente de la plataforma. Genérala en el tablero del superadmin.');
        return r.bridge as string;
    }

    private async hello(force = false) {
        if (!this.token) return;
        const line = this.state.lineOk && !this.state.paused ? this.state.line?.label || null : null;
        const key = `${this.state.name}|${line}`;
        if (!force && key === this.lastHello) return;
        try {
            await this.rpc('fn_gateway_hello_token', { p_token: this.token, p_name: this.state.name, p_line: line });
            this.lastHello = key;
        } catch (e: any) {
            if (/Llave de env/.test(e.message)) this.revoked();
        }
    }

    private revoked() {
        this.log(false, 'La llave de este equipo fue dada de baja desde el tablero. Configura una nueva.');
        this.token = null; this.cfg.tokenEnc = undefined; this.cfg.token = undefined;
        this.state.configured = false; this.stop(); this.save(); this.refreshStatus();
    }

    // ---------- línea (módem o celular) ----------
    async detect(): Promise<{ modems: ModemInfo[]; phones: AndroidInfo[] }> {
        const [modems, phones] = await Promise.all([
            process.platform === 'win32' ? detectModems() : Promise.resolve([]),
            detectAndroid().catch(() => []),
        ]);
        return { modems, phones };
    }

    async sendVia(line: Line, phone: string, text: string): Promise<string | null> {
        if (line.kind === 'modem') return sendModemSms(line.port, phone, text);
        const r = await sendAndroidSms(line.serial, phone, text);
        return r === 'SIN_CONFIRMAR' ? null : r;
    }

    /** Revisa que la línea siga conectada; si se perdió, toma otra que encuentre (módem o celular). */
    private async checkLine() {
        this.lastLineCheck = Date.now();
        const line = this.cfg.line;
        if (!line) { this.state.lineOk = false; return; }
        const modemOk = (m: ModemInfo) => m.ok && m.sim;
        const phoneOk = (p: AndroidInfo) => p.state === 'device' && p.helper && p.smsGranted;
        // Primero solo la línea configurada (rápido); si no responde, se busca cualquier otra.
        let ok = line.kind === 'modem'
            ? (await detectModems(line.port)).some(m => m.port === line.port && modemOk(m))
            : (await detectAndroid().catch(() => [])).some(p => p.serial === line.serial && phoneOk(p));
        if (!ok) {
            const { modems, phones } = await this.detect();
            const m = modems.find(modemOk);
            const p = phones.find(phoneOk);
            const alt: Line | null = m ? { kind: 'modem', port: m.port, label: `Módem ${m.port}${m.operator ? ` · ${m.operator}` : ''}` }
                : p ? { kind: 'android', serial: p.serial, label: `${p.model}${p.operator ? ` · ${p.operator}` : ''}` } : null;
            if (alt) {
                this.log(true, `La línea "${line.label}" no responde; se usa "${alt.label}".`);
                this.cfg.line = alt; this.state.line = alt; this.save(); ok = true;
            }
        }
        if (ok !== this.state.lineOk) this.log(ok, ok ? `Línea lista: ${this.state.line?.label}` : `Sin línea: revisa que "${line.label}" esté conectado.`);
        this.state.lineOk = ok;
    }

    // ---------- ciclo ----------
    start() {
        if (this.timer) return;
        this.state.running = true;
        this.lastLineCheck = 0;
        const loop = async () => {
            await this.tick().catch(e => { this.state.lastError = e.message; });
            if (this.state.running) this.timer = setTimeout(loop, POLL_MS);
        };
        this.timer = setTimeout(loop, 500);
        this.refreshStatus();
    }

    stop() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        this.state.running = false;
    }

    private async tick() {
        if (this.busy || !this.token || !this.state.configured) return;
        this.busy = true;
        try {
            if (this.state.paused) { await this.hello(); this.refreshStatus(); return; }
            if (!this.state.lineOk || Date.now() - this.lastLineCheck > LINE_CHECK_MS) await this.checkLine();
            await this.hello();
            if (!this.state.lineOk || !this.state.line) { this.refreshStatus(); return; }

            let items: any[];
            try {
                items = await this.rpc('fn_gateway_pull_token', { p_token: this.token, p_limit: 5 }) || [];
            } catch (e: any) {
                if (/Llave de env/.test(e.message)) { this.revoked(); return; }
                this.state.lastError = `Sin conexión con el servidor: ${e.message}`;
                this.refreshStatus(false);
                return;
            }
            this.refreshStatus(true);
            for (const c of items) {
                const err = c.type === 'sms' ? await this.sendVia(this.state.line, c.phone, c.message) : `Tipo no soportado: ${c.type}`;
                try {
                    await this.rpc('fn_gateway_report_token', { p_token: this.token, p_cmd: c.id, p_ok: err === null, p_error: err });
                } catch { /* se reintenta solo: lo que quede "procesando" vuelve a la fila */ }
                if (err === null) {
                    this.state.sent++; this.state.lastAt = new Date().toISOString(); this.state.lastError = null;
                    this.log(true, `SMS enviado a ${maskPhone(c.phone)}${c.is_code ? ' (código de acceso)' : ''}`);
                } else {
                    this.state.failed++; this.state.lastError = err;
                    this.log(false, `No salió el SMS a ${maskPhone(c.phone)}: ${err}`);
                    if (/desconect|autorizado|abrir|no responde/i.test(err)) this.lastLineCheck = 0;
                }
                this.save();
                await sleep(GAP_MS);
            }
        } finally {
            this.busy = false;
        }
    }

    // ---------- acciones del panel ----------
    async configure(token: string, line: Line, name?: string) {
        await this.checkToken(token);
        this.token = token.trim().toLowerCase();
        this.cfg.line = line; this.cfg.name = name?.trim() || os.hostname(); this.cfg.paused = false;
        Object.assign(this.state, { configured: true, paused: false, line, name: this.cfg.name, lineOk: true });
        this.lastHello = '';
        this.save();
        this.log(true, `Puente configurado con ${line.label}.`);
        this.stop(); this.start();
    }

    setLine(line: Line) {
        this.cfg.line = line; this.state.line = line; this.state.lineOk = true; this.lastHello = '';
        this.save(); this.log(true, `Línea cambiada a ${line.label}.`);
    }

    setPaused(paused: boolean) {
        this.cfg.paused = paused; this.state.paused = paused; this.lastHello = '';
        this.save(); this.log(true, paused ? 'Envío pausado: los códigos saldrán por el celular de cada campaña.' : 'Envío reanudado.');
        this.refreshStatus();
    }

    async reset() {
        this.stop();
        try { if (this.token) await this.rpc('fn_gateway_hello_token', { p_token: this.token, p_name: this.state.name, p_line: null }); } catch { /* sin conexión */ }
        this.token = null; this.cfg = {};
        Object.assign(this.state, { configured: false, line: null, lineOk: false, paused: false });
        try { fs.unlinkSync(file()); } catch { /* no existía */ }
        this.refreshStatus();
    }

    /** Al cerrar el programa: avisar al servidor para que los códigos se vayan al respaldo de inmediato. */
    async goodbye() {
        this.stop();
        if (!this.token) return;
        try { await this.rpc('fn_gateway_hello_token', { p_token: this.token, p_name: this.state.name, p_line: null }); } catch { /* sin conexión */ }
    }
}

export const engine = new Engine();
