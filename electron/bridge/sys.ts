import { execFile } from 'node:child_process';

export type RunResult = { code: number; out: string };

/** Ejecuta un programa y devuelve su salida (nunca lanza: los errores vienen en code/out). */
export const run = (file: string, args: string[], timeoutMs = 30_000): Promise<RunResult> =>
    new Promise(resolve => {
        execFile(file, args, { timeout: timeoutMs, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
            const out = `${stdout || ''}${stderr || ''}`.trim();
            resolve({ code: err ? (typeof (err as any).code === 'number' ? (err as any).code : 1) : 0, out: out || (err ? String(err.message) : '') });
        });
    });

/** Ejecuta un script de PowerShell sin problemas de comillas (va codificado). */
export const powershell = (script: string, timeoutMs = 30_000) =>
    run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], timeoutMs);

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Número para enviar: +52 y 10 dígitos (México). */
export const toE164 = (phone: string) => {
    const d = (phone || '').replace(/\D/g, '');
    if (d.length === 10) return `+52${d}`;
    if (d.length === 12 && d.startsWith('52')) return `+${d}`;
    if (d.length === 13 && d.startsWith('521')) return `+52${d.slice(3)}`;
    return d ? `+${d}` : '';
};

/** Para mostrar en la bitácora sin exponer el número completo. */
export const maskPhone = (phone: string) => `***${(phone || '').replace(/\D/g, '').slice(-4)}`;
