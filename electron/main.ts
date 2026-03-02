// Archivo de Entrada Principal para Electron
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { autoUpdater } from 'electron-updater';

// Compatibilidad con ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Variables de Entorno y Rutas
process.env.APP_ROOT = path.join(__dirname, '..');
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron');
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist');

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST;

let win: BrowserWindow | null;

function createWindow() {
    win = new BrowserWindow({
        icon: process.env.VITE_PUBLIC ? path.join(process.env.VITE_PUBLIC, 'icon.png') : undefined,
        width: 1440,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        titleBarStyle: 'hidden',
        titleBarOverlay: {
            color: '#0F1218',
            symbolColor: '#00D4FF',
            height: 40
        },
        webPreferences: {
            preload: path.join(__dirname, 'preload.mjs'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    // Inicializar servidor local
    try {
        const serverPath = path.join(__dirname, '../src-server/local-server.js');
        import(serverPath)
            .then(server => server.startLocalServer())
            .catch(err => console.error("Error importando servidor local:", err));
    } catch (err) {
        console.error("Error configurando path del servidor local:", err);
    }

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
        // win.webContents.openDevTools();
    } else {
        // Modo Producción
        win.loadFile(path.join(RENDERER_DIST, 'index.html'));
    }

    win.on('closed', () => {
        win = null;
    });
}

// --- Mecanismo OTA (Over-The-Air) ---
function setupAutoUpdater() {
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('update-available', () => {
        console.log('[OTA] Update available. Downloading...');
    });

    autoUpdater.on('update-downloaded', (info) => {
        dialog.showMessageBox({
            type: 'info',
            title: 'Actualización C4I Lista',
            message: `La versión táctica ${info.version} está lista. ¿Aplicar y reiniciar ahora?`,
            buttons: ['Reiniciar y Actualizar', 'Más Tarde']
        }).then((result) => {
            if (result.response === 0) {
                autoUpdater.quitAndInstall(false, true);
            }
        });
    });

    autoUpdater.checkForUpdatesAndNotify();
}

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.whenReady().then(() => {
    createWindow();
    setupAutoUpdater();
});

// Comunicación IPC (Inter-Process Communication)
ipcMain.handle('ping', () => 'pong');
ipcMain.handle('get-system-info', () => {
    return {
        hostname: os.hostname(),
        platform: process.platform,
        arch: process.arch
    }
});
