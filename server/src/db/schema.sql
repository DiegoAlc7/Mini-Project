-- Esquema de base de datos para la herramienta PERT/CPM

CREATE TABLE IF NOT EXISTS proyecto (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  fecha_inicio TEXT NOT NULL, -- formato ISO: YYYY-MM-DD
  creado_en TEXT DEFAULT (datetime('now')),
  actualizado_en TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS nodo_edt (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  proyecto_id INTEGER NOT NULL,
  padre_id INTEGER, -- NULL = nodo raíz
  codigo TEXT NOT NULL, -- ej: "1.2.3"
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  orden INTEGER NOT NULL DEFAULT 0,
  nivel INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (proyecto_id) REFERENCES proyecto(id) ON DELETE CASCADE,
  FOREIGN KEY (padre_id) REFERENCES nodo_edt(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS actividad (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nodo_edt_id INTEGER NOT NULL UNIQUE, -- solo una actividad por nodo hoja
  nombre TEXT NOT NULL,
  duracion_optimista REAL NOT NULL,
  duracion_probable REAL NOT NULL,
  duracion_pesimista REAL NOT NULL,
  duracion_esperada REAL, -- calculada: (To + 4Tm + Tp) / 6
  varianza REAL, -- calculada: ((Tp - To) / 6)^2
  responsable TEXT DEFAULT '',
  FOREIGN KEY (nodo_edt_id) REFERENCES nodo_edt(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dependencia (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  predecesora_id INTEGER NOT NULL,
  sucesora_id INTEGER NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'FS', -- Fin-Inicio
  desfase_dias INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (predecesora_id) REFERENCES actividad(id) ON DELETE CASCADE,
  FOREIGN KEY (sucesora_id) REFERENCES actividad(id) ON DELETE CASCADE,
  UNIQUE(predecesora_id, sucesora_id)
);
