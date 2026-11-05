import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { run, toE164 } from './sys.js';

/**
 * Celular Android conectado por USB (con "Depuración por USB" encendida una sola vez).
 * El SMS lo envía la app Tlatoani Envíos del celular desde su chip, con confirmación real;
 * el celular no necesita datos: la PC pone el internet.
 */

export const PKG = 'lat.nemia.tlatoani.envios';
const APK_URL = 'https://nemia.lat/descargas/tlatoani-envios.apk';

export type AndroidInfo = {
    serial: string; state: string; model: string;
    helper: boolean; smsGranted: boolean; operator: string | null; simReady: boolean;
};

/** adb.exe: el que viene con el programa; en desarrollo, el de vendor/ o el del sistema. */
export const adbPath = () => {
    const candidates = [
        path.join(process.resourcesPath || '', 'platform-tools', 'adb.exe'),
        path.join(app.getAppPath(), 'vendor', 'platform-tools', 'adb.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk', 'platform-tools', 'adb.exe'),
    ];
    return candidates.find(p => p && fs.existsSync(p)) || 'adb';
};

const adb = (args: string[], timeoutMs = 30_000) => run(adbPath(), args, timeoutMs);

export const detectAndroid = async (): Promise<AndroidInfo[]> => {
    await adb(['start-server'], 20_000);
    const r = await adb(['devices', '-l'], 15_000);
    const rows = r.out.split(/\r?\n/).slice(1).map(l => l.trim()).filter(l => l && !l.startsWith('*'));
    const out: AndroidInfo[] = [];
    for (const row of rows) {
        const [serial, state] = row.split(/\s+/);
        const model = (row.match(/model:(\S+)/)?.[1] || serial).replace(/_/g, ' ');
        const info: AndroidInfo = { serial, state, model, helper: false, smsGranted: false, operator: null, simReady: false };
        if (state === 'device') {
            const pk = await adb(['-s', serial, 'shell', 'pm', 'list', 'packages', PKG]);
            info.helper = pk.out.split(/\r?\n/).some(l => l.trim() === `package:${PKG}`);
            if (info.helper) {
                const d = await adb(['-s', serial, 'shell', 'dumpsys', 'package', PKG]);
                info.smsGranted = /android\.permission\.SEND_SMS: granted=true/.test(d.out);
            }
            const sim = await adb(['-s', serial, 'shell', 'getprop', 'gsm.sim.state']);
            info.simReady = /READY|LOADED/i.test(sim.out);
            const op = await adb(['-s', serial, 'shell', 'getprop', 'gsm.sim.operator.alpha']);
            info.operator = op.out.split(',').map(s => s.trim()).filter(Boolean)[0] || null;
        }
        out.push(info);
    }
    return out;
};

/** Instala o actualiza la app de envíos en el celular y le da el permiso de SMS. */
export const prepareAndroid = async (serial: string, onStep: (t: string) => void): Promise<string | null> => {
    const apk = path.join(app.getPath('userData'), 'tlatoani-envios.apk');
    onStep('Descargando la app de envíos…');
    try {
        const res = await fetch(APK_URL);
        if (!res.ok) return `No se pudo descargar la app (${res.status}). Revisa que esté publicada en nemia.lat/descargas.`;
        fs.writeFileSync(apk, Buffer.from(await res.arrayBuffer()));
    } catch (e: any) {
        return `Sin conexión para descargar la app: ${e.message}`;
    }
    onStep('Instalando en el celular… (si aparece un aviso en el celular, acéptalo)');
    const ins = await adb(['-s', serial, 'install', '-r', '-g', apk], 180_000);
    if (!/Success/i.test(ins.out)) return `No se pudo instalar: ${ins.out.slice(0, 300)}`;
    onStep('Dando el permiso de SMS…');
    await adb(['-s', serial, 'shell', 'pm', 'grant', PKG, 'android.permission.SEND_SMS']);
    const d = await adb(['-s', serial, 'shell', 'dumpsys', 'package', PKG]);
    if (!/android\.permission\.SEND_SMS: granted=true/.test(d.out)) {
        return 'Android no dio el permiso de SMS. En Xiaomi/Redmi/POCO activa también "Depuración USB (ajustes de seguridad)" en Opciones de desarrollador.';
    }
    return null;
};

/** Envía un SMS por el celular. Devuelve null si salió, 'SIN_CONFIRMAR' o el motivo del error. */
export const sendAndroidSms = async (serial: string, phone: string, text: string): Promise<string | null> => {
    const to = toE164(phone);
    if (!/^\+\d{10,15}$/.test(to)) return 'Número inválido';
    const b64 = Buffer.from(text || '', 'utf8').toString('base64');
    const r = await adb(['-s', serial, 'shell', 'am', 'broadcast', '--receiver-foreground', '--include-stopped-packages',
        '-a', 'lat.nemia.tlatoani.SEND_SMS', '-n', `${PKG}/com.c4isecure.app.SendReceiver`,
        '--es', 'to', to, '--es', 'b64', b64], 40_000);
    const code = r.out.match(/result=(-?\d+)/)?.[1];
    const data = r.out.match(/data="([^"]*)"/)?.[1];
    if (code === '1') return null;
    if (code === '3') return 'SIN_CONFIRMAR';
    if (code === '2') return data || 'El celular no pudo enviar';
    if (/device .* not found|no devices|offline/i.test(r.out)) return 'El celular se desconectó';
    if (/unauthorized/i.test(r.out)) return 'El celular no ha autorizado esta PC (acepta el aviso de depuración USB)';
    if (code === '0') return 'La app de envíos no respondió (¿está instalada y actualizada?)';
    return `Sin respuesta del celular: ${r.out.slice(0, 200)}`;
};
