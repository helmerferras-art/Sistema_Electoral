import Database from 'better-sqlite3';
import path from 'node:path';
import os from 'node:os';

// Configurable location for the database
const dbPath = path.join(os.homedir(), '.c4isecure', 'local_node.db');
let db: Database.Database;

export function initDatabase() {
    try {
        // Create directory if not exists
        const fs = require('fs');
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        db = new Database(dbPath);
        db.pragma('journal_mode = WAL');

        console.log(`[C4I Database] Online at ${dbPath}`);
        runMigrations();
        return db;
    } catch (error) {
        console.error("Failed to initialize local database:", error);
        throw error;
    }
}

function runMigrations() {
    // 1. Tabla de Preferencias Locales / Handshake
    db.prepare(`
        CREATE TABLE IF NOT EXISTS local_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            relay_url TEXT,
            handshake_token TEXT,
            node_id TEXT,
            is_configured BOOLEAN DEFAULT 0,
            last_sync DATETIME,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // 2. Tabla de Activistas Operantes Localmente
    db.prepare(`
        CREATE TABLE IF NOT EXISTS local_supporters (
            id TEXT PRIMARY KEY,
            phone TEXT UNIQUE,
            name TEXT,
            curp TEXT,
            voter_key TEXT,
            section_id TEXT,
            latitude REAL,
            longitude REAL,
            commitment_level INTEGER DEFAULT 1,
            needs_sync BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    // 3. Cola de Reportes por sincronizar
    db.prepare(`
        CREATE TABLE IF NOT EXISTS local_reports (
            id TEXT PRIMARY KEY,
            type TEXT,
            description TEXT,
            status TEXT DEFAULT 'pending',
            latitude REAL,
            longitude REAL,
            needs_sync BOOLEAN DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `).run();

    console.log("[C4I Database] Migrations up to date.");
}

export function getDb() {
    if (!db) {
        throw new Error("Local DB not initialized. Call initDatabase() first.");
    }
    return db;
}
