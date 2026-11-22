// Descarga las herramientas oficiales de Android (adb.exe) para empacarlas en el instalador de Tlatoani Puente.
// Se guardan en vendor/platform-tools (no va a git). Correr en Windows antes de `npm run puente:build`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dest = path.join('vendor', 'platform-tools');
if (fs.existsSync(path.join(dest, 'adb.exe'))) { console.log('platform-tools ya está en', dest); process.exit(0); }
fs.mkdirSync('vendor', { recursive: true });
const zip = path.join('vendor', 'platform-tools.zip');
console.log('Descargando platform-tools de Google…');
const res = await fetch('https://dl.google.com/android/repository/platform-tools-latest-windows.zip');
if (!res.ok) { console.error('No se pudo descargar:', res.status); process.exit(1); }
fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
if (process.platform === 'win32') {
    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -Force '${zip}' 'vendor'`], { stdio: 'inherit' });
} else {
    execFileSync('unzip', ['-o', '-q', zip, '-d', 'vendor'], { stdio: 'inherit' });
}
fs.unlinkSync(zip);
console.log('Listo:', path.join(dest, 'adb.exe'));
