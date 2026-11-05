// Tlatoani Puente · programa de Windows para la PC que envía los SMS de la plataforma.
// Lo primero al abrirlo es configurar el equipo (llave + línea); después vive en la bandeja junto al reloj
// y arranca solo con Windows.
import { app, BrowserWindow, Menu, Tray, ipcMain, nativeImage, dialog } from 'electron';
import path from 'node:path';
import updater from 'electron-updater';
import { engine, type Line } from './bridge/engine.js';
import { prepareAndroid } from './bridge/android.js';

const ROOT = app.getAppPath();
const UI = path.join(ROOT, 'electron', 'ui');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => showWindow());
}

const startHidden = process.argv.includes('--oculto');

function showWindow() {
    if (!win) createWindow();
    else { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}

function createWindow() {
    win = new BrowserWindow({
        width: 980,
        height: 720,
        minWidth: 760,
        minHeight: 600,
        title: 'Tlatoani Puente',
        icon: path.join(UI, 'icon.png'),
        backgroundColor: '#0F1218',
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            preload: path.join(ROOT, 'electron', 'preload.cjs'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
        },
    });
    win.loadFile(path.join(UI, 'index.html'));
    win.once('ready-to-show', () => win?.show());
    // Cerrar la ventana no apaga el puente: se queda en la bandeja.
    win.on('close', e => {
        if (!quitting && engine.state.configured) {
            e.preventDefault();
            win?.hide();
            tray?.displayBalloon?.({ title: 'Tlatoani Puente sigue enviando', content: 'Lo encuentras junto al reloj. Para apagarlo usa "Salir".' });
        }
    });
    win.on('closed', () => { win = null; });
    // Enlaces externos en el navegador
    win.webContents.setWindowOpenHandler(({ url }) => {
        if (/^https:\/\//.test(url)) import('electron').then(({ shell }) => shell.openExternal(url));
        return { action: 'deny' };
    });
}

const STATUS_TEXT: Record<string, string> = {
    sin_configurar: 'Falta configurar',
    pausado: 'En pausa',
    sin_linea: 'Sin celular o módem',
    sin_internet: 'Sin internet',
    en_linea: 'Enviando',
};

function updateTray() {
    if (!tray) return;
    const s = engine.state;
    tray.setToolTip(`Tlatoani Puente · ${STATUS_TEXT[s.status]} · ${s.sent} enviados`);
    tray.setContextMenu(Menu.buildFromTemplate([
        { label: `Estado: ${STATUS_TEXT[s.status]}`, enabled: false },
        { label: `${s.sent} SMS enviados${s.failed ? ` · ${s.failed} con error` : ''}`, enabled: false },
        { type: 'separator' },
        { label: 'Abrir panel', click: () => showWindow() },
        s.configured ? { label: s.paused ? 'Reanudar envío' : 'Pausar envío', click: () => engine.setPaused(!s.paused) } : { label: 'Configurar', click: () => showWindow() },
        { type: 'separator' },
        {
            label: 'Salir (deja de enviar)', click: async () => {
                const r = await dialog.showMessageBox({
                    type: 'warning', buttons: ['Salir', 'Cancelar'], defaultId: 1, cancelId: 1,
                    title: 'Tlatoani Puente', message: '¿Apagar el puente?',
                    detail: 'Mientras esté apagado, los códigos de acceso saldrán por el celular de cada campaña, si lo tiene.',
                });
                if (r.response === 0) { quitting = true; await engine.goodbye(); app.quit(); }
            },
        },
    ]));
}

function setupUpdater() {
    if (!app.isPackaged) return;
    try {
        const { autoUpdater } = updater;
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        autoUpdater.on('error', () => undefined);
        autoUpdater.checkForUpdates().catch(() => undefined);
    } catch { /* sin actualizaciones */ }
}

app.whenReady().then(() => {
    app.setAppUserModelId('lat.nemia.tlatoani.puente');
    tray = new Tray(nativeImage.createFromPath(path.join(UI, 'tray.png')));
    tray.on('click', () => showWindow());
    engine.on('state', s => {
        win?.webContents.send('puente:state', s);
        updateTray();
    });
    engine.init();
    updateTray();
    // Lo primero: si el equipo no está configurado, se abre el asistente.
    if (!startHidden || !engine.state.configured) createWindow();
    setupUpdater();
});

app.on('window-all-closed', () => {
    // Sin configurar, cerrar la ventana cierra el programa; configurado, sigue en la bandeja.
    if (!engine.state.configured) { quitting = true; app.quit(); }
});

app.on('before-quit', () => { quitting = true; });

// ---------- Comunicación con el panel ----------
ipcMain.handle('puente:state', () => engine.getState());
ipcMain.handle('puente:checkToken', async (_e, token: string) => {
    try { return { ok: true, bridge: await engine.checkToken(token) }; } catch (e: any) { return { ok: false, error: e.message }; }
});
ipcMain.handle('puente:detect', async () => engine.detect());
ipcMain.handle('puente:prepareAndroid', async (e, serial: string) => {
    const err = await prepareAndroid(serial, t => e.sender.send('puente:step', t));
    return err ? { ok: false, error: err } : { ok: true };
});
ipcMain.handle('puente:test', async (_e, line: Line, phone: string) => {
    const d = (phone || '').replace(/\D/g, '');
    if (d.length !== 10) return { ok: false, error: 'Escribe un celular de 10 números.' };
    const err = await engine.sendVia(line, d, 'TLATOANI: Prueba del puente de mensajes. Si te llegó, el envío de códigos funciona.');
    engine.log(!err, err ? `Prueba a ***${d.slice(-4)} falló: ${err}` : `Prueba enviada a ***${d.slice(-4)}`);
    return err ? { ok: false, error: err } : { ok: true };
});
ipcMain.handle('puente:configure', async (_e, token: string, line: Line, name: string) => {
    try {
        await engine.configure(token, line, name);
        // Arranca solo con Windows, en la bandeja
        if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: true, args: ['--oculto'] });
        return { ok: true };
    } catch (e: any) { return { ok: false, error: e.message }; }
});
ipcMain.handle('puente:setLine', (_e, line: Line) => { engine.setLine(line); return { ok: true }; });
ipcMain.handle('puente:pause', (_e, paused: boolean) => { engine.setPaused(paused); return { ok: true }; });
ipcMain.handle('puente:reset', async () => {
    await engine.reset();
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: false });
    return { ok: true };
});
ipcMain.handle('puente:version', () => app.getVersion());

