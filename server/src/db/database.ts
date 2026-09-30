import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', '..', 'data.db');
const SCHEMA_PATH = fs.existsSync(path.join(__dirname, 'schema.sql'))
  ? path.join(__dirname, 'schema.sql')
  : path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql');
const SEED_PATH = fs.existsSync(path.join(__dirname, 'seed.sql'))
  ? path.join(__dirname, 'seed.sql')
  : path.join(__dirname, '..', '..', 'src', 'db', 'seed.sql');

let db: SqlJsDatabase;

/**
 * Inicializa la base de datos SQLite usando sql.js.
 * Carga el archivo existente o crea uno nuevo.
 */
export async function initDatabase(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs();

  // Cargar BD existente o crear nueva
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Habilitar foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Ejecutar esquema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.run(schema);

  // Auto-seed: si la base de datos no tiene proyectos (ej. instalación limpia de git),
  // sembrar automáticamente el proyecto de ejemplo desde seed.sql
  const countRow = get('SELECT count(*) as count FROM proyecto');
  if (!countRow || countRow.count === 0) {
    if (fs.existsSync(SEED_PATH)) {
      console.log('🌱 Base de datos limpia detectada. Aplicando seed.sql automáticamente...');
      const seedSql = fs.readFileSync(SEED_PATH, 'utf-8');
      db.run(seedSql);
      saveDatabase();
      console.log('✅ Proyecto de ejemplo sembrado con éxito.');
    }
  }

  console.log('✅ Base de datos inicializada en:', DB_PATH);
  return db;
}

/**
 * Guarda la base de datos al disco.
 * Se debe llamar después de cada operación de escritura.
 */
export function saveDatabase(): void {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

/**
 * Obtiene la instancia de la base de datos.
 */
export function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Base de datos no inicializada. Llama initDatabase() primero.');
  return db;
}

// ==============================
// Funciones helper para simplificar queries
// ==============================

/** Ejecuta un query SELECT y devuelve todas las filas como objetos */
export function all(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  const results: any[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/** Ejecuta un query SELECT y devuelve la primera fila como objeto */
export function get(sql: string, params: any[] = []): any | undefined {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind(params);
  let result: any = undefined;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

/** Ejecuta un query INSERT/UPDATE/DELETE y guarda al disco */
export function run(sql: string, params: any[] = []): { changes: number; lastId: number } {
  db.run(sql, params);
  const changes = db.getRowsModified();
  const lastIdRow = get('SELECT last_insert_rowid() as id');
  const lastId = lastIdRow?.id || 0;
  saveDatabase();
  return { changes, lastId };
}
