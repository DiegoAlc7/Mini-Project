import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import initSqlJs from 'sql.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.join(__dirname, '..', 'data.db');
const OUTPUT_PATH = path.join(__dirname, '..', 'src', 'db', 'seed.sql');

async function exportSeed() {
  const SQL = await initSqlJs();
  const filebuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(filebuffer);

  // Buscar el proyecto de recaudo
  const proyectosRes = db.exec("SELECT * FROM proyecto WHERE nombre LIKE '%Recaudo%' ORDER BY id DESC LIMIT 1");
  if (!proyectosRes.length || !proyectosRes[0].values.length) {
    console.error('No se encontró el proyecto de recaudo.');
    return;
  }

  const projRow = proyectosRes[0].values[0];
  const oldProjId = projRow[0];
  const newProjId = 1;

  const escapeStr = (val) => {
    if (val === null || val === undefined) return 'NULL';
    if (typeof val === 'number') return String(val);
    return `'${String(val).replace(/'/g, "''")}'`;
  };

  const sqlLines = [];
  sqlLines.push('-- ============================================================');
  sqlLines.push('-- SEED: Sistema de Recaudo Electrónico para Transporte Urbano');
  sqlLines.push('-- Estructura de 4 niveles PMBOK (50 actividades, 61 dependencias)');
  sqlLines.push('-- ============================================================\n');
  sqlLines.push('BEGIN TRANSACTION;\n');

  // 1. Proyecto
  sqlLines.push('-- 1. Proyecto');
  sqlLines.push(
    `INSERT INTO proyecto (id, nombre, descripcion, fecha_inicio, creado_en, actualizado_en) VALUES (` +
    `${newProjId}, ${escapeStr(projRow[1])}, ${escapeStr(projRow[2])}, ${escapeStr(projRow[3])}, ` +
    `datetime('now'), datetime('now'));\n`
  );

  // 2. Nodos EDT
  const nodosRes = db.exec(`SELECT * FROM nodo_edt WHERE proyecto_id = ${oldProjId} ORDER BY id ASC`);
  const nodos = nodosRes[0].values;
  
  // Mapa de IDs antiguos a nuevos IDs secuenciales
  const nodeIdMap = new Map();
  nodos.forEach((n, idx) => {
    nodeIdMap.set(n[0], idx + 1);
  });

  sqlLines.push('-- 2. Nodos EDT (Raíz, Fases, Paquetes de Trabajo y Actividades)');
  for (const n of nodos) {
    const oldId = n[0];
    const newId = nodeIdMap.get(oldId);
    const oldPadreId = n[2];
    const newPadreId = oldPadreId ? nodeIdMap.get(oldPadreId) : 'NULL';
    const codigo = escapeStr(n[3]);
    const nombre = escapeStr(n[4]);
    const descripcion = escapeStr(n[5]);
    const orden = n[6];
    const nivel = n[7];

    sqlLines.push(
      `INSERT INTO nodo_edt (id, proyecto_id, padre_id, codigo, nombre, descripcion, orden, nivel) VALUES (` +
      `${newId}, ${newProjId}, ${newPadreId}, ${codigo}, ${nombre}, ${descripcion}, ${orden}, ${nivel});`
    );
  }
  sqlLines.push('');

  // 3. Actividades
  const oldNodeIds = Array.from(nodeIdMap.keys()).join(',');
  const actsRes = db.exec(`SELECT * FROM actividad WHERE nodo_edt_id IN (${oldNodeIds}) ORDER BY id ASC`);
  const acts = actsRes[0].values;
  
  const actIdMap = new Map();
  acts.forEach((a, idx) => {
    actIdMap.set(a[0], idx + 1);
  });

  sqlLines.push('-- 3. Actividades PERT (Duraciones To, Tm, Tp, Te, Varianza y Responsable)');
  for (const a of acts) {
    const oldActId = a[0];
    const newActId = actIdMap.get(oldActId);
    const oldNodeId = a[1];
    const newNodeId = nodeIdMap.get(oldNodeId);
    const nombre = escapeStr(a[2]);
    const to = a[3];
    const tm = a[4];
    const tp = a[5];
    const te = a[6];
    const var_ = a[7];
    const resp = escapeStr(a[8]);

    sqlLines.push(
      `INSERT INTO actividad (id, nodo_edt_id, nombre, duracion_optimista, duracion_probable, duracion_pesimista, duracion_esperada, varianza, responsable) VALUES (` +
      `${newActId}, ${newNodeId}, ${nombre}, ${to}, ${tm}, ${tp}, ${te}, ${var_}, ${resp});`
    );
  }
  sqlLines.push('');

  // 4. Dependencias
  const oldActIds = Array.from(actIdMap.keys()).join(',');
  const depsRes = db.exec(`SELECT * FROM dependencia WHERE predecesora_id IN (${oldActIds}) ORDER BY id ASC`);
  const deps = depsRes[0].values;

  sqlLines.push('-- 4. Dependencias de la Red PERT (Predecesoras y Sucesoras)');
  deps.forEach((d, idx) => {
    const newDepId = idx + 1;
    const newPredId = actIdMap.get(d[1]);
    const newSucId = actIdMap.get(d[2]);
    const tipo = escapeStr(d[3] || 'FS');
    const desfase = d[4] || 0;

    sqlLines.push(
      `INSERT INTO dependencia (id, predecesora_id, sucesora_id, tipo, desfase_dias) VALUES (` +
      `${newDepId}, ${newPredId}, ${newSucId}, ${tipo}, ${desfase});`
    );
  });
  sqlLines.push('');

  sqlLines.push('COMMIT;\n');

  fs.writeFileSync(OUTPUT_PATH, sqlLines.join('\n'), 'utf-8');
  console.log(`✅ Archivo seed.sql generado exitosamente en: ${OUTPUT_PATH}`);
  console.log(`   - 1 Proyecto (ID ${newProjId})`);
  console.log(`   - ${nodos.length} Nodos EDT`);
  console.log(`   - ${acts.length} Actividades`);
  console.log(`   - ${deps.length} Dependencias`);
}

exportSeed().catch(console.error);
