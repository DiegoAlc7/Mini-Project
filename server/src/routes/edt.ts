import { Router, Request, Response } from 'express';
import { all, get, run } from '../db/database.js';

const router = Router();

function generarCodigo(proyectoId: number, padreId: number | null): string {
  if (padreId === null) {
    const row = get('SELECT COUNT(*) as c FROM nodo_edt WHERE proyecto_id = ? AND padre_id IS NULL', [proyectoId]);
    return String((row?.c || 0) + 1);
  }
  const padre = get('SELECT codigo FROM nodo_edt WHERE id = ?', [padreId]);
  if (!padre) throw new Error('Nodo padre no encontrado');
  const row = get('SELECT COUNT(*) as c FROM nodo_edt WHERE padre_id = ?', [padreId]);
  return `${padre.codigo}.${(row?.c || 0) + 1}`;
}

function recalcularCodigos(proyectoId: number, padreId: number | null = null, prefijoBase: string = '') {
  const nodos = padreId === null
    ? all('SELECT id FROM nodo_edt WHERE proyecto_id = ? AND padre_id IS NULL ORDER BY orden', [proyectoId])
    : all('SELECT id FROM nodo_edt WHERE proyecto_id = ? AND padre_id = ? ORDER BY orden', [proyectoId, padreId]);

  nodos.forEach((nodo: any, index: number) => {
    const nuevoCodigo = prefijoBase ? `${prefijoBase}.${index + 1}` : String(index + 1);
    const nivel = prefijoBase ? prefijoBase.split('.').length : 0;
    run('UPDATE nodo_edt SET codigo = ?, nivel = ? WHERE id = ?', [nuevoCodigo, nivel, nodo.id]);
    recalcularCodigos(proyectoId, nodo.id, nuevoCodigo);
  });
}

function construirArbol(proyectoId: number, nodos: any[]): any[] {
  const mapa = new Map<number, any>();
  const raices: any[] = [];

  // Obtener actividades del proyecto
  const actividades = all(`
    SELECT a.*, n.codigo as codigo_edt
    FROM actividad a
    JOIN nodo_edt n ON a.nodo_edt_id = n.id
    WHERE n.proyecto_id = ?
  `, [proyectoId]);

  // Obtener dependencias
  const dependencias = all(`
    SELECT d.*, ap.nombre as predecesora_nombre, np.codigo as predecesora_codigo
    FROM dependencia d
    JOIN actividad ap ON d.predecesora_id = ap.id
    JOIN nodo_edt np ON ap.nodo_edt_id = np.id
    WHERE np.proyecto_id = ?
  `, [proyectoId]);

  const predMap = new Map<number, any[]>();
  for (const dep of dependencias) {
    if (!predMap.has(dep.sucesora_id)) predMap.set(dep.sucesora_id, []);
    predMap.get(dep.sucesora_id)!.push(dep);
  }

  const actMap = new Map<number, any>();
  for (const act of actividades) {
    actMap.set(act.nodo_edt_id, {
      ...act,
      predecesoras: predMap.get(act.id) || [],
    });
  }

  for (const nodo of nodos) {
    const act = actMap.get(nodo.id) || null;
    mapa.set(nodo.id, {
      ...nodo,
      children: [],
      actividad: act,
      tiene_actividad: !!act,
    });
  }

  for (const nodo of nodos) {
    const n = mapa.get(nodo.id);
    if (nodo.padre_id === null) raices.push(n);
    else mapa.get(nodo.padre_id)?.children.push(n);
  }
  return raices;
}

// GET /api/proyectos/:id/edt
router.get('/:proyectoId/edt', (req: Request, res: Response) => {
  try {
    const proyectoId = Number(req.params.proyectoId);
    const nodos = all('SELECT * FROM nodo_edt WHERE proyecto_id = ? ORDER BY codigo', [proyectoId]);
    res.json(construirArbol(proyectoId, nodos));
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener EDT' });
  }
});

// POST /api/proyectos/:id/edt
router.post('/:proyectoId/edt', (req: Request, res: Response) => {
  try {
    const proyectoId = Number(req.params.proyectoId);
    const { padre_id, nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ error: 'El nombre es requerido' });

    const padreIdValue = padre_id || null;
    if (padreIdValue) {
      const actExist = get('SELECT id FROM actividad WHERE nodo_edt_id = ?', [padreIdValue]);
      if (actExist) {
        // Al agregar hijos, el nodo padre se convierte en FASE/Resumen:
        // Limpiamos su actividad directa ya que su duración pasará a ser calculada por sus hijos (Regla 4)
        run('DELETE FROM dependencia WHERE predecesora_id = ? OR sucesora_id = ?', [actExist.id, actExist.id]);
        run('DELETE FROM actividad WHERE id = ?', [actExist.id]);
      }
    }

    const codigo = generarCodigo(proyectoId, padreIdValue);
    const nivel = padreIdValue ? codigo.split('.').length - 1 : 0;
    const hermanos = padreIdValue === null
      ? get('SELECT MAX(orden) as maxOrden FROM nodo_edt WHERE proyecto_id = ? AND padre_id IS NULL', [proyectoId])
      : get('SELECT MAX(orden) as maxOrden FROM nodo_edt WHERE proyecto_id = ? AND padre_id = ?', [proyectoId, padreIdValue]);
    const orden = (hermanos?.maxOrden ?? -1) + 1;

    const { lastId } = run(
      'INSERT INTO nodo_edt (proyecto_id, padre_id, codigo, nombre, descripcion, orden, nivel) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [proyectoId, padreIdValue, codigo, nombre, descripcion || '', orden, nivel]
    );
    res.status(201).json(get('SELECT * FROM nodo_edt WHERE id = ?', [lastId]));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al crear nodo EDT' });
  }
});

// PUT /api/edt/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    // Verificar si es una ruta de "mover" — se maneja en otra ruta
    if (req.body.direction) return handleMover(req, res);
    
    const { nombre, descripcion } = req.body;
    const actual = get('SELECT * FROM nodo_edt WHERE id = ?', [id]);
    if (!actual) return res.status(404).json({ error: 'Nodo no encontrado' });
    run('UPDATE nodo_edt SET nombre = ?, descripcion = ? WHERE id = ?',
      [nombre ?? actual.nombre, descripcion ?? actual.descripcion, id]);
    res.json(get('SELECT * FROM nodo_edt WHERE id = ?', [id]));
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar nodo' });
  }
});

// DELETE /api/edt/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const nodo = get('SELECT * FROM nodo_edt WHERE id = ?', [Number(req.params.id)]);
    if (!nodo) return res.status(404).json({ error: 'Nodo no encontrado' });
    
    // REGLA 1: El nodo raíz es inamovible y no se puede eliminar
    if (nodo.padre_id === null) {
      return res.status(400).json({ error: 'El nodo raíz del proyecto es inamovible y no puede ser eliminado.' });
    }

    // Eliminar recursivamente: primero hijos, luego el nodo
    eliminarNodoRecursivo(nodo.id);
    recalcularCodigos(nodo.proyecto_id);
    res.json({ message: 'Nodo eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar nodo' });
  }
});

function eliminarNodoRecursivo(id: number) {
  const hijos = all('SELECT id FROM nodo_edt WHERE padre_id = ?', [id]);
  for (const hijo of hijos) {
    eliminarNodoRecursivo(hijo.id);
  }
  // Eliminar actividad y sus dependencias primero
  const actividad = get('SELECT id FROM actividad WHERE nodo_edt_id = ?', [id]);
  if (actividad) {
    run('DELETE FROM dependencia WHERE predecesora_id = ? OR sucesora_id = ?', [actividad.id, actividad.id]);
    run('DELETE FROM actividad WHERE id = ?', [actividad.id]);
  }
  run('DELETE FROM nodo_edt WHERE id = ?', [id]);
}

// PUT /api/edt/:id/mover
router.put('/:id/mover', handleMover);

function handleMover(req: Request, res: Response) {
  try {
    const { direction } = req.body;
    const id = Number(req.params.id);
    const nodo = get('SELECT * FROM nodo_edt WHERE id = ?', [id]);
    if (!nodo) return res.status(404).json({ error: 'Nodo no encontrado' });

    const hermanos = nodo.padre_id === null
      ? all('SELECT * FROM nodo_edt WHERE proyecto_id = ? AND padre_id IS NULL ORDER BY orden', [nodo.proyecto_id])
      : all('SELECT * FROM nodo_edt WHERE proyecto_id = ? AND padre_id = ? ORDER BY orden', [nodo.proyecto_id, nodo.padre_id]);
    const idx = hermanos.findIndex((h: any) => h.id === nodo.id);

    if (direction === 'up' && idx > 0) {
      const ant = hermanos[idx - 1];
      run('UPDATE nodo_edt SET orden = ? WHERE id = ?', [ant.orden, nodo.id]);
      run('UPDATE nodo_edt SET orden = ? WHERE id = ?', [nodo.orden, ant.id]);
    } else if (direction === 'down' && idx < hermanos.length - 1) {
      const sig = hermanos[idx + 1];
      run('UPDATE nodo_edt SET orden = ? WHERE id = ?', [sig.orden, nodo.id]);
      run('UPDATE nodo_edt SET orden = ? WHERE id = ?', [nodo.orden, sig.id]);
    } else if (direction === 'indent' && idx > 0) {
      const nuevoPadre = hermanos[idx - 1];
      const actExist = get('SELECT id FROM actividad WHERE nodo_edt_id = ?', [nuevoPadre.id]);
      if (actExist) return res.status(400).json({ error: 'No se puede indentar: el nodo destino tiene actividad.' });
      const hijosNP = get('SELECT MAX(orden) as maxOrden FROM nodo_edt WHERE padre_id = ?', [nuevoPadre.id]);
      run('UPDATE nodo_edt SET padre_id = ?, orden = ? WHERE id = ?', [nuevoPadre.id, (hijosNP?.maxOrden ?? -1) + 1, nodo.id]);
    } else if (direction === 'outdent' && nodo.padre_id !== null) {
      const padre = get('SELECT * FROM nodo_edt WHERE id = ?', [nodo.padre_id]);
      const hermPadre = padre.padre_id === null
        ? get('SELECT MAX(orden) as maxOrden FROM nodo_edt WHERE proyecto_id = ? AND padre_id IS NULL', [nodo.proyecto_id])
        : get('SELECT MAX(orden) as maxOrden FROM nodo_edt WHERE proyecto_id = ? AND padre_id = ?', [nodo.proyecto_id, padre.padre_id]);
      run('UPDATE nodo_edt SET padre_id = ?, orden = ? WHERE id = ?', [padre.padre_id, (hermPadre?.maxOrden ?? -1) + 1, nodo.id]);
    } else {
      return res.status(400).json({ error: 'Movimiento no válido' });
    }

    recalcularCodigos(nodo.proyecto_id);
    const nodos = all('SELECT * FROM nodo_edt WHERE proyecto_id = ? ORDER BY codigo', [nodo.proyecto_id]);
    res.json(construirArbol(nodo.proyecto_id, nodos));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al mover nodo' });
  }
}

export default router;
