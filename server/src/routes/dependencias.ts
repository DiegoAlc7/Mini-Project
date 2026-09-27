import { Router, Request, Response } from 'express';
import { all, get, run } from '../db/database.js';

const router = Router();

// GET /api/proyectos/:id/dependencias
router.get('/:proyectoId/dependencias', (req: Request, res: Response) => {
  try {
    const deps = all(`
      SELECT d.*, ap.nombre as predecesora_nombre, np.codigo as predecesora_codigo,
        asu.nombre as sucesora_nombre, ns.codigo as sucesora_codigo
      FROM dependencia d
      JOIN actividad ap ON d.predecesora_id = ap.id JOIN nodo_edt np ON ap.nodo_edt_id = np.id
      JOIN actividad asu ON d.sucesora_id = asu.id JOIN nodo_edt ns ON asu.nodo_edt_id = ns.id
      WHERE np.proyecto_id = ? ORDER BY np.codigo
    `, [Number(req.params.proyectoId)]);
    res.json(deps);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener dependencias' });
  }
});

// POST /api/dependencias
router.post('/', (req: Request, res: Response) => {
  try {
    const { predecesora_id, sucesora_id, tipo, desfase_dias } = req.body;
    if (!predecesora_id || !sucesora_id) return res.status(400).json({ error: 'Se requieren predecesora_id y sucesora_id' });
    if (predecesora_id === sucesora_id) return res.status(400).json({ error: 'Una actividad no puede depender de sí misma' });

    if (!get('SELECT id FROM actividad WHERE id = ?', [predecesora_id]) || !get('SELECT id FROM actividad WHERE id = ?', [sucesora_id]))
      return res.status(404).json({ error: 'Actividad no encontrada' });

    if (get('SELECT id FROM dependencia WHERE predecesora_id = ? AND sucesora_id = ?', [predecesora_id, sucesora_id]))
      return res.status(400).json({ error: 'Esta dependencia ya existe' });

    if (detectarCiclo(sucesora_id, predecesora_id))
      return res.status(400).json({ error: 'Esta dependencia crearía un ciclo' });

    const { lastId } = run('INSERT INTO dependencia (predecesora_id, sucesora_id, tipo, desfase_dias) VALUES (?, ?, ?, ?)',
      [predecesora_id, sucesora_id, tipo || 'FS', desfase_dias || 0]);
    res.status(201).json(get('SELECT * FROM dependencia WHERE id = ?', [lastId]));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al crear dependencia' });
  }
});

// DELETE /api/dependencias/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const { changes } = run('DELETE FROM dependencia WHERE id = ?', [Number(req.params.id)]);
    if (changes === 0) return res.status(404).json({ error: 'Dependencia no encontrada' });
    res.json({ message: 'Dependencia eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar dependencia' });
  }
});

function detectarCiclo(desde: number, hasta: number): boolean {
  const visitados = new Set<number>();
  const cola: number[] = [desde];
  while (cola.length > 0) {
    const actual = cola.shift()!;
    if (actual === hasta) return true;
    if (visitados.has(actual)) continue;
    visitados.add(actual);
    const sucesoras = all('SELECT sucesora_id FROM dependencia WHERE predecesora_id = ?', [actual]);
    for (const s of sucesoras) cola.push(s.sucesora_id);
  }
  return false;
}

export default router;
