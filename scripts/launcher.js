import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

console.log("\x1b[35m%s\x1b[0m", "🚀 INICIANDO C4I DIGITAL ECOSYSTEM...");

// 1. Iniciar el SMS/Social Bridge
const bridge = spawn('node', [path.join(root, 'scripts', 'sms_bridge.js')], {
    stdio: 'inherit',
    shell: true
});

bridge.on('error', (err) => {
    console.error("\x1b[31m%s\x1b[0m", "❌ Error al iniciar el Bridge:", err);
});

// 2. Iniciar Vite
const vite = spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true
});

vite.on('error', (err) => {
    console.error("\x1b[31m%s\x1b[0m", "❌ Error al iniciar Vite:", err);
});

process.on('SIGINT', () => {
    bridge.kill();
    vite.kill();
    process.exit();
});
