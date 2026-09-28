import { Router, Request, Response } from 'express';
import { all, get, run } from '../db/database.js';

const router = Router();

// GET /api/proyectos
router.get('/', (_req: Request, res: Response) => {
  try {
    const proyectos = all(`
      SELECT p.*,
        (SELECT COUNT(*) FROM nodo_edt WHERE proyecto_id = p.id) as total_nodos,
        (SELECT COUNT(*) FROM actividad a JOIN nodo_edt n ON a.nodo_edt_id = n.id WHERE n.proyecto_id = p.id) as total_actividades
      FROM proyecto p ORDER BY p.creado_en DESC
    `);
    res.json(proyectos);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proyectos' });
  }
});

// GET /api/proyectos/:id
router.get('/:id', (req: Request, res: Response) => {
  try {
    const proyecto = get('SELECT * FROM proyecto WHERE id = ?', [Number(req.params.id)]);
    if (!proyecto) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json(proyecto);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener proyecto' });
  }
});

// POST /api/proyectos
router.post('/', (req: Request, res: Response) => {
  try {
    const { nombre, descripcion, fecha_inicio } = req.body;
    if (!nombre || !fecha_inicio) return res.status(400).json({ error: 'Nombre y fecha de inicio son requeridos' });

    const { lastId } = run(
      'INSERT INTO proyecto (nombre, descripcion, fecha_inicio) VALUES (?, ?, ?)',
      [nombre, descripcion || '', fecha_inicio]
    );

    // REGLA 1: Autogeneración del Nodo Raíz (Nivel 1 con el nombre del proyecto)
    run(
      `INSERT INTO nodo_edt (proyecto_id, padre_id, codigo, nombre, descripcion, orden, nivel)
       VALUES (?, NULL, '1', ?, '', 0, 0)`,
      [lastId, nombre]
    );

    const proyecto = get('SELECT * FROM proyecto WHERE id = ?', [lastId]);
    res.status(201).json(proyecto);
  } catch (error) {
    res.status(500).json({ error: 'Error al crear proyecto' });
  }
});

// PUT /api/proyectos/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const { nombre, descripcion, fecha_inicio } = req.body;
    const id = Number(req.params.id);
    const actual = get('SELECT * FROM proyecto WHERE id = ?', [id]);
    if (!actual) return res.status(404).json({ error: 'Proyecto no encontrado' });

    run(
      `UPDATE proyecto SET nombre = ?, descripcion = ?, fecha_inicio = ?, actualizado_en = datetime('now') WHERE id = ?`,
      [nombre ?? actual.nombre, descripcion ?? actual.descripcion, fecha_inicio ?? actual.fecha_inicio, id]
    );

    // Si el nombre cambió, sincronizar también el nombre del nodo raíz EDT (nivel 0, padre_id NULL)
    if (nombre && nombre !== actual.nombre) {
      run(
        `UPDATE nodo_edt SET nombre = ? WHERE proyecto_id = ? AND padre_id IS NULL`,
        [nombre, id]
      );
    }

    res.json(get('SELECT * FROM proyecto WHERE id = ?', [id]));
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar proyecto' });
  }
});

// DELETE /api/proyectos/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { changes } = run('DELETE FROM proyecto WHERE id = ?', [Number(req.params.id)]);
    if (changes === 0) return res.status(404).json({ error: 'Proyecto no encontrado' });
    res.json({ message: 'Proyecto eliminado' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar proyecto' });
  }
});

export default router;
