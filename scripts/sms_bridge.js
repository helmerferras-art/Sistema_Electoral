import express from 'express';
import cors from 'cors';
import { execSync, spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

process.on('uncaughtException', (err) => {
    console.error('\x1b[31m[FATAL ERROR]\x1b[0m', err);
    console.log('Presiona cualquier tecla para salir...');
    // We can't really "pause" node in a cross-platform way easily, but logging is key.
});

// --- CONFIGURATION ---
const PORT = 5000;

const findAdbPath = () => {
    const commonPaths = [
        `C:\\adb\\adb.exe`,
        `C:\\platform-tools\\adb.exe`,
        path.join(__dirname, '..', 'bin', 'adb.exe'),
        path.join(__dirname, '..', 'platform-tools', 'adb.exe'),
        `C:\\Users\\helme\\Downloads\\platform-tools-latest-windows\\platform-tools\\adb.exe`
    ];

    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            console.log(`[INIT] ADB encontrado en: ${p}`);
            return p;
        }
    }

    // Fallback to system PATH
    try {
        execSync('adb version', { stdio: 'ignore' });
        console.log(`[INIT] ADB encontrado en el PATH del sistema.`);
        return 'adb';
    } catch (e) {
        console.warn("[INIT_WARN] No se encontró adb.exe en rutas comunes ni en el PATH.");
        return null;
    }
};

let ADB_PATH = findAdbPath();

// Internal state to track per-device stats and configuration during runtime
const deviceStats = {};
const CONFIG_FILE = path.join(__dirname, 'device_configs.json');
let deviceConfigs = {};
let lastDeviceIndex = -1; // For round-robin calling

// Load existing configs
if (fs.existsSync(CONFIG_FILE)) {
    try {
        deviceConfigs = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
        console.log("[INIT] Configuraciones de dispositivos cargadas:", Object.keys(deviceConfigs).length);
    } catch (e) {
        console.error("[INIT_ERR] Fallo al cargar device_configs.json");
    }
}

const runAdb = (cmdArr) => {
    if (!ADB_PATH) {
        ADB_PATH = findAdbPath();
        if (!ADB_PATH) throw new Error("ADB_NOT_FOUND: No se encontró adb.exe. Por favor instálalo en C:\\adb\\");
    }

    try {
        const result = spawnSync(ADB_PATH, cmdArr, { encoding: 'utf8', timeout: 7000 });
        if (result.status !== 0) {
            const errorMsg = result.stderr || result.stdout || "Unknown error";
            throw new Error(`ADB_EXEC_FAILED (Status ${result.status}): ${errorMsg.trim()}`);
        }
        return result.stdout;
    } catch (e) {
        throw new Error(e.message);
    }
};

const formatPhone = (phone, isWA = false) => {
    let clean = phone.replace(/[^\d]/g, '');

    // Normalización para México (si tiene 10 dígitos)
    if (clean.length === 10) {
        // En México: para WA se usa 521 + 10 dígitos. Para SMS local se usan solo los 10 dígitos.
        return isWA ? `521${clean}` : clean;
    }

    // Si ya empieza con 52 pero le falta el 1 para WA mobile
    if (isWA && clean.startsWith('52') && clean.length === 12) {
        return `521${clean.substring(2)}`;
    }

    return clean;
};

const getDevices = () => {
    const devices = [];

    try {
        if (!ADB_PATH) return [];
        const output = runAdb(['devices']);
        const lines = output.split('\n').filter(l => l.trim().length > 0).slice(1);

        lines.forEach(line => {
            const [id, status] = line.trim().split(/\s+/);
            if (id) {
                if (!deviceStats[id]) deviceStats[id] = { sent: 0 };

                let connectionStatus = 'offline';
                if (status === 'device') connectionStatus = 'connected';
                else if (status === 'unauthorized') connectionStatus = 'unauthorized';
                else if (status === 'offline') connectionStatus = 'offline';

                devices.push({
                    id,
                    model: 'Android Device',
                    status: connectionStatus,
                    sentToday: deviceStats[id].sent || 0,
                    isSimulated: false
                });
            }
        });
    } catch (err) {
        console.error("Error al ejecutar ADB:", err.message);
    }

    return devices;
};

app.get('/status', (req, res) => {
    res.json({ devices: getDevices() });
});

// --- DEVICE CONFIG PERSISTENCE ---

// GET /device-configs — returns all saved device configs (aliases, waTap, smsTap, gmail)
app.get('/device-configs', (req, res) => {
    res.json(deviceConfigs);
});

// POST /set-device-config — saves/merges config for a specific deviceId
app.post('/set-device-config', (req, res) => {
    const { deviceId, config } = req.body;
    if (!deviceId || !config) return res.status(400).json({ error: 'deviceId and config required' });

    deviceConfigs[deviceId] = { ...(deviceConfigs[deviceId] || {}), ...config };

    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(deviceConfigs, null, 2), 'utf8');
        console.log(`[CONFIG] Configuración guardada para ${deviceId}:`, config);
        res.json({ success: true, deviceId, config: deviceConfigs[deviceId] });
    } catch (e) {
        console.error('[CONFIG] Error al guardar device_configs.json:', e.message);
        res.status(500).json({ error: 'No se pudo guardar la configuración: ' + e.message });
    }
});

// GET /get-devices — alias for /status, returns connected devices list
app.get('/get-devices', (req, res) => {
    res.json(getDevices());
});

app.post('/send-sms', async (req, res) => {
    const { phone, message } = req.body;
    const allDevices = getDevices();
    const authorizedDevices = allDevices.filter(d => d.status === 'connected');

    if (authorizedDevices.length === 0) {
        return res.status(400).json({
            error: "No hay dispositivos autorizados",
            details: allDevices.length > 0 ? "Los equipos están conectados pero falta autorizar la depuración USB." : "No se detecto ningún hardware."
        });
    }

    // Load Balancing: Pick a random authorized device
    const device = authorizedDevices[Math.floor(Math.random() * authorizedDevices.length)];

    try {
        const cleanPhone = formatPhone(phone, false);
        console.log(`[SMS] Petición para ${cleanPhone} (original: ${phone})`);

        // Llamada con array + comillas de escape para el shell remoto
        runAdb([
            '-s', device.id,
            'shell', 'am', 'start',
            '-a', 'android.intent.action.SENDTO',
            '-d', `\"sms:${cleanPhone}\"`,
            '--es', 'sms_body', `\"${message.replace(/"/g, '\\"')}\"`
        ]);

        // UI Automation
        setTimeout(() => {
            try {
                const config = deviceConfigs[device.id];
                if (config && config.smsTap) {
                    console.log(`[AUTO] Realizando toque en pantalla (SMS): ${config.smsTap.x}, ${config.smsTap.y}`);
                    runAdb(['-s', device.id, 'shell', 'input', 'tap', config.smsTap.x.toString(), config.smsTap.y.toString()]);
                } else {
                    console.log(`[AUTO] Disparando secuencia Shotgun en SMS...`);
                    runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '66']);
                    runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '61']);
                    runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '22']);
                    runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '66']);
                    setTimeout(() => runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '66']), 1000);
                }
            } catch (e) {
                console.error("[AUTO_ERR] Fallo en secuencia SMS:", e.message);
            }
        }, 2500);

        deviceStats[device.id].sent += 1;
        res.json({ success: true, device: device.id });
    } catch (err) {
        console.error("[SMS_ERR] Fallo al enviar:", err.message);
        res.status(500).json({ error: "Fallo en el comando ADB (SMS): " + err.message });
    }
});

app.post('/send-wa', async (req, res) => {
    const { phone, message } = req.body;
    const allDevices = getDevices();
    const authorizedDevices = allDevices.filter(d => d.status === 'connected');

    if (authorizedDevices.length === 0) {
        return res.status(400).json({
            error: "No hay dispositivos autorizados (WA)",
            details: allDevices.length > 0 ? "Los equipos están conectados pero falta autorizar la depuración USB." : "No se detecto ningún hardware."
        });
    }

    const device = authorizedDevices[Math.floor(Math.random() * authorizedDevices.length)];

    try {
        const cleanPhone = formatPhone(phone, true);
        console.log(`[WA] Petición para ${cleanPhone} (original: ${phone})`);

        // Usamos deep link directo de WhatsApp
        const encodedMsg = encodeURIComponent(message);
        const waUrl = `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;
        // NOTE: double quotes in the -d arg protect & and ? from the Android shell — no backslash escaping needed
        console.log(`[WA] Deep link: ${waUrl}`);

        runAdb([
            '-s', device.id,
            'shell', 'am', 'start',
            '-a', 'android.intent.action.VIEW',
            '-d', `"${waUrl}"`
        ]);

        // UI Automation
        setTimeout(() => {
            try {
                const config = deviceConfigs[device.id];
                if (config && config.waTap) {
                    console.log(`[AUTO] Realizando toque en pantalla (WhatsApp): ${config.waTap.x}, ${config.waTap.y}`);
                    runAdb(['-s', device.id, 'shell', 'input', 'tap', config.waTap.x.toString(), config.waTap.y.toString()]);
                } else {
                    console.log(`[AUTO] Disparando secuencia Shotgun en WhatsApp...`);
                    runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '22']);
                    runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '66']);
                    runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '61']);
                    runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '61']);
                    runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '66']);
                    setTimeout(() => {
                        runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '66']);
                        runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '66']);
                    }, 1000);
                }
            } catch (e) {
                console.error("[AUTO_ERR] Fallo en secuencia WhatsApp:", e.message);
            }
        }, 6000);

        deviceStats[device.id].sent += 1;
        res.json({ success: true, device: device.id });
    } catch (err) {
        console.error("Failed to send WA:", err.message);
        res.status(500).json({ error: "Fallo en el comando ADB (WhatsApp): " + err.message });
    }
});

app.post('/retry-keys', (req, res) => {
    const allDevices = getDevices();
    const authorizedDevices = allDevices.filter(d => d.status === 'connected');

    if (authorizedDevices.length === 0) {
        return res.json({
            success: false,
            error: "No hay dispositivos autorizados",
            details: allDevices.length > 0 ? "Equipos detectados pero no autorizados." : "Sin hardware USB."
        });
    }

    const { deviceId, x, y } = req.body || {};

    // Use the specific device requested; fallback to first authorized device
    const device = (deviceId && authorizedDevices.find(d => d.id === deviceId)) || authorizedDevices[0];

    try {
        if (x !== undefined && y !== undefined) {
            console.log(`[TEST] Toque de prueba en ${x}, ${y} (Device: ${device.id})`);
            runAdb(['-s', device.id, 'shell', 'input', 'tap', x.toString(), y.toString()]);
        } else {
            console.log(`[AUTO] Re-intentando secuencia en equipo ${device.id}`);
            const config = deviceConfigs[device.id];
            if (config && config.waTap) {
                runAdb(['-s', device.id, 'shell', 'input', 'tap', config.waTap.x.toString(), config.waTap.y.toString()]);
            } else {
                runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '61']); // TAB
                runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '22']); // DERECHA
                runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '66']); // ENTER
            }
        }
        res.json({ success: true, deviceId: device.id });
    } catch (e) {
        console.error("[RETRY_ERR]", e.message);
        res.status(500).json({ error: e.message });
    }
});

// NOTE: /set-device-config is already registered above (with full persistence logic)

app.post('/add-contact', async (req, res) => {
    const { name, phone } = req.body;
    const allDevices = getDevices();
    const authorizedDevices = allDevices.filter(d => d.status === 'connected');

    if (authorizedDevices.length === 0) {
        return res.status(400).json({ error: "No hay dispositivos para sincronizar contacto" });
    }

    // Usamos el primer dispositivo para guardar el contacto en la cuenta de Google
    const device = authorizedDevices[0];
    const globalGmail = deviceConfigs['GLOBAL']?.gmail;

    if (!globalGmail) {
        console.warn("[CONTACT_WARN] No hay cuenta Gmail global configurada. El contacto se guardará localmente.");
    }

    try {
        console.log(`[CONTACT] Sincronizando ${name} (${phone}) en ${device.id}...`);

        // Comando ADB para insertar contacto
        // Note: This is an approximation of the intent. Exact URI varies by Android version, but this is standard for most.
        // We use 'content insert' which is more reliable than starting the editor activity.
        const cmd = [
            '-s', device.id, 'shell', 'content', 'insert',
            '--uri', 'content://com.android.contacts/raw_contacts',
            '--bind', `account_name:s:${globalGmail || ''}`,
            '--bind', `account_type:s:${globalGmail ? 'com.google' : ''}`
        ];

        // Execute first stage (create raw contact)
        const output = runAdb(cmd);
        const match = output.match(/rowID=(\d+)/);

        if (match) {
            const rawId = match[1];
            // Insert Name
            runAdb([
                '-s', device.id, 'shell', 'content', 'insert',
                '--uri', 'content://com.android.contacts/data',
                '--bind', `raw_contact_id:i:${rawId}`,
                '--bind', 'mimetype:s:vnd.android.cursor.item/name',
                '--bind', `data1:s:${name}`
            ]);
            // Insert Phone
            runAdb([
                '-s', device.id, 'shell', 'content', 'insert',
                '--uri', 'content://com.android.contacts/data',
                '--bind', `raw_contact_id:i:${rawId}`,
                '--bind', 'mimetype:s:vnd.android.cursor.item/phone_v2',
                '--bind', `data1:s:${phone}`,
                '--bind', 'data2:i:2' // Type Mobile
            ]);
            console.log(`[CONTACT_OK] ${name} guardado con ID ${rawId}`);
            res.json({ success: true, id: rawId });
        } else {
            throw new Error("No se pudo obtener el ID del contacto insertado");
        }
    } catch (e) {
        console.error("[CONTACT_ERR]", e.message);
        res.status(500).json({ error: "Fallo al insertar contacto: " + e.message });
    }
});

app.post('/hang-up', (req, res) => {
    const allDevices = getDevices();
    const authorizedDevices = allDevices.filter(d => d.status === 'connected');

    if (authorizedDevices.length === 0) {
        return res.status(400).json({ error: "No hay dispositivos authorized para colgar" });
    }

    try {
        console.log("[CALL] Colgando todas las llamadas activas...");
        authorizedDevices.forEach(device => {
            // Keyevent 6 is ENDCALL
            runAdb(['-s', device.id, 'shell', 'input', 'keyevent', '6']);
        });
        res.json({ success: true });
    } catch (err) {
        console.error("Failed to hang up:", err.message);
        res.status(500).json({ error: "Fallo al colgar: " + err.message });
    }
});

app.get('/test-bridge', (req, res) => {
    res.json({ message: "Bridge is alive and updated", timestamp: new Date().toISOString() });
});

app.post('/make-call', (req, res) => {
    console.log("[BRIDGE] Recibida petición POST /make-call");
    const { phone } = req.body;
    const allDevices = getDevices();
    const authorizedDevices = allDevices.filter(d => d.status === 'connected');

    if (authorizedDevices.length === 0) {
        return res.status(400).json({ error: "No hay dispositivos autorizados para realizar llamadas" });
    }

    // Round-robin selection
    lastDeviceIndex = (lastDeviceIndex + 1) % authorizedDevices.length;
    const device = authorizedDevices[lastDeviceIndex];

    try {
        console.log(`[CALL] Iniciando llamada a ${phone} usando ${device.id}...`);

        // Command to start call intent
        runAdb(['-s', device.id, 'shell', 'am', 'start', '-a', 'android.intent.action.CALL', '-d', `tel:${phone}`]);

        res.json({ success: true, device: device.id });
    } catch (err) {
        console.error("Failed to initiate call:", err.message);
        res.status(500).json({ error: "Fallo al iniciar llamada: " + err.message });
    }
});

app.get('/call-status/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    try {
        // Check dumpsys telecom for CS_ACTIVE — the internal Android state that
        // is only set when the remote party ANSWERS the call (not while dialing).
        const telecomOutput = runAdb(['-s', deviceId, 'shell', 'dumpsys', 'telecom']).toString();

        // Also check mCallState for basic OFFHOOK detection
        const registryOutput = runAdb(['-s', deviceId, 'shell', 'dumpsys', 'telephony.registry']).toString();
        const callStateMatch = registryOutput.match(/mCallState=(\d)/);
        const mCallState = callStateMatch ? parseInt(callStateMatch[1], 10) : 0;

        let state = 'IDLE';
        let raw = `mCallState=${mCallState}`;

        if (mCallState === 2) {
            // Phone is off-hook. Now determine if it's DIALING or truly ACTIVE.
            // CS_ACTIVE appears in call object state only when the remote party answers.
            if (telecomOutput.includes('CS_ACTIVE') || telecomOutput.includes('mState: ACTIVE')) {
                state = 'ACTIVE'; // Remote party answered
            } else {
                state = 'OFFHOOK'; // Still dialing/ringing
            }
        } else if (mCallState === 1) {
            state = 'RINGING'; // Incoming call
        } else {
            state = 'IDLE';
        }

        console.log(`[AMD] Device ${deviceId}: state=${state} (raw: ${raw})`);
        res.json({ success: true, deviceId, state, raw });
    } catch (err) {
        console.error(`Failed to get call status for ${deviceId}:`, err.message);
        res.status(500).json({ error: "Fallo al obtener estado: " + err.message });
    }


});

// --- SOCIAL AUTOMATION ---

// Placeholder for callback (Playwright monitors this)
app.get('/callback', (req, res) => {
    res.send("<h1>Autenticación Detectada</h1><p>Puedes cerrar esta ventana, el sistema está procesando tus tokens.</p>");
});

app.post('/harvest-token', (req, res) => {
    const { network, clientId } = req.body;
    console.log(`[BRIDGE] Iniciando cosecha para ${network}...`);

    const harvesterPath = path.join(__dirname, 'social_harvester.js');
    const harvester = spawn('node', [harvesterPath, network, clientId]);

    let output = '';
    harvester.stdout.on('data', (data) => {
        const str = data.toString();
        output += str;
        console.log(`[HARVESTER] ${str.trim()}`);
    });

    harvester.stderr.on('data', (data) => {
        console.error(`[HARVESTER_ERROR] ${data}`);
    });

    harvester.on('close', (code) => {
        console.log(`[BRIDGE] Harvester finalizado con código ${code}`);

        // Buscamos el bloque de resultado en el output
        const match = output.match(/---RESULT_START---([\s\S]*?)---RESULT_END---/);
        if (match) {
            try {
                const result = JSON.parse(match[1].trim());
                res.json(result);
            } catch (e) {
                res.status(500).json({ error: "Fallo al procesar resultado del harvester" });
            }
        } else {
            res.status(500).json({ error: "No se capturaron tokens o el usuario cerró la ventana" });
        }
    });
});

const startServer = (port) => {
    const server = app.listen(port, () => {
        console.log(`\x1b[36m%s\x1b[0m`, `--- SMS GATEWAY BRIDGE RUNNING ---`);
        console.log(`URL: http://localhost:${port}`);
        console.log(`ADB STATUS:`, getDevices().length > 0 ? "DEVICES FOUND" : "NO DEVICES DETECTED");
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.log(`[INIT] Puerto ${port} ocupado, intentando con ${port + 1}...`);
            if (port < 5010) {
                startServer(port + 1);
            } else {
                console.error(`\x1b[31m[ERROR]\x1b[0m No se encontraron puertos libres entre 5000 y 5010.`);
                process.exit(1);
            }
        } else {
            console.error(`\x1b[31m[ERROR SERVER]\x1b[0m`, err);
        }
    });
};

startServer(PORT);
