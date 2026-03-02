import express, { Response } from 'express';
import cors from 'cors';
import { initDatabase, getDb } from './db.js';
import { SyncEngine } from './SyncEngine.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// --- API DE SINCRONIZACIÓN Y ESTADO LOCAL ---

app.get('/api/status', async (_req, res: Response) => {
    try {
        const db = getDb();
        const settings = db.prepare('SELECT * FROM local_settings ORDER BY id DESC LIMIT 1').get() as any;
        res.json({
            status: 'online',
            configured: settings ? settings.is_configured === 1 : false,
            nodeId: settings ? settings.node_id : null
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Database unavailable' });
    }
});

app.post('/api/setup', async (req, res: Response) => {
    const { relayUrl, handshakeToken, nodeId } = req.body;
    try {
        const db = getDb();
        db.prepare(`
            INSERT INTO local_settings (relay_url, handshake_token, node_id, is_configured)
            VALUES (?, ?, ?, 1)
        `).run(relayUrl, handshakeToken, nodeId);

        res.json({ success: true, message: 'Nodo configurado correctamente' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to save configuration' });
    }
});

// Inicialización del Servidor Embebido
export function startLocalServer() {
    initDatabase();

    // Iniciar el Motor de Sincronización Bidireccional
    const syncEngine = new SyncEngine();
    syncEngine.start();

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`[C4I Local Server] Escuchando en el puerto ${PORT}`);
    });
}
