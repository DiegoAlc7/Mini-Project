import { Router, Request, Response } from 'express';
import { all, get, run } from '../db/database.js';

const router = Router();

function calcularPert(optimista: number, probable: number, pesimista: number) {
  const duracion_esperada = (optimista + 4 * probable + pesimista) / 6;
  const varianza = Math.pow((pesimista - optimista) / 6, 2);
  return {
    duracion_esperada: Math.round(duracion_esperada * 100) / 100,
    varianza: Math.round(varianza * 100) / 100,
  };
}

// GET /api/proyectos/:id/actividades
router.get('/:proyectoId/actividades', (req: Request, res: Response) => {
  try {
    const actividades = all(`
      SELECT a.*, n.codigo as codigo_edt, n.nombre as nombre_nodo
      FROM actividad a JOIN nodo_edt n ON a.nodo_edt_id = n.id
      WHERE n.proyecto_id = ? ORDER BY n.codigo
    `, [Number(req.params.proyectoId)]);

    const result = actividades.map((act: any) => {
      const predecesoras = all(`
        SELECT d.*, a.nombre as predecesora_nombre, n.codigo as predecesora_codigo
        FROM dependencia d JOIN actividad a ON d.predecesora_id = a.id JOIN nodo_edt n ON a.nodo_edt_id = n.id
        WHERE d.sucesora_id = ?
      `, [act.id]);
      return { ...act, predecesoras };
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener actividades' });
  }
});

// POST /api/actividades
router.post('/', (req: Request, res: Response) => {
  try {
    const { nodo_edt_id, duracion_optimista, duracion_probable, duracion_pesimista, responsable } = req.body;
    if (!nodo_edt_id || duracion_optimista == null || duracion_probable == null || duracion_pesimista == null)
      return res.status(400).json({ error: 'Faltan campos requeridos' });

    const nodo = get('SELECT * FROM nodo_edt WHERE id = ?', [nodo_edt_id]);
    if (!nodo) return res.status(404).json({ error: 'Nodo EDT no encontrado' });

    // REGLA PMBOK: Solo los nodos terminales (Actividades, nivel >= 3) pueden tener estimación directa
    if (nodo.nivel < 3) {
      return res.status(400).json({
        error: nodo.nivel === 1
          ? 'Las fases no admiten estimación directa; agrega paquetes de trabajo y actividades'
          : 'Los paquetes de trabajo son agrupadores; agrega actividades para estimar tiempos'
      });
    }

    const hijos = get('SELECT COUNT(*) as c FROM nodo_edt WHERE padre_id = ?', [nodo_edt_id]);
    if (hijos?.c > 0) return res.status(400).json({ error: 'Solo se pueden crear actividades en nodos hoja' });

    const existente = get('SELECT id FROM actividad WHERE nodo_edt_id = ?', [nodo_edt_id]);
    if (existente) return res.status(400).json({ error: 'Este nodo ya tiene actividad' });

    if (duracion_optimista > duracion_probable || duracion_probable > duracion_pesimista)
      return res.status(400).json({ error: 'optimista ≤ probable ≤ pesimista' });

    const { duracion_esperada, varianza } = calcularPert(duracion_optimista, duracion_probable, duracion_pesimista);
    const { lastId } = run(
      `INSERT INTO actividad (nodo_edt_id, nombre, duracion_optimista, duracion_probable, duracion_pesimista, duracion_esperada, varianza, responsable)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [nodo_edt_id, nodo.nombre, duracion_optimista, duracion_probable, duracion_pesimista, duracion_esperada, varianza, responsable || '']
    );
    res.status(201).json(get('SELECT a.*, n.codigo as codigo_edt FROM actividad a JOIN nodo_edt n ON a.nodo_edt_id = n.id WHERE a.id = ?', [lastId]));
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al crear actividad' });
  }
});

// POST /api/actividades/upsert (REGLA 3: Carga y edición rápida inline)
router.post('/upsert', (req: Request, res: Response) => {
  try {
    const { nodo_edt_id, duracion_optimista, duracion_probable, duracion_pesimista, responsable } = req.body;
    if (!nodo_edt_id) return res.status(400).json({ error: 'nodo_edt_id es requerido' });

    const nodo = get('SELECT * FROM nodo_edt WHERE id = ?', [Number(nodo_edt_id)]);
    if (!nodo) return res.status(404).json({ error: 'Nodo EDT no encontrado' });

    // REGLA PMBOK: Solo los nodos terminales (Actividades, nivel >= 3) pueden tener estimación directa
    if (nodo.nivel < 3) {
      return res.status(400).json({
        error: nodo.nivel === 1
          ? 'Las fases no admiten estimación directa; agrega paquetes de trabajo y actividades'
          : 'Los paquetes de trabajo son agrupadores; agrega actividades para estimar tiempos'
      });
    }

    // REGLA 4: Solo nodos hoja pueden tener variables PERT
    const hijos = get('SELECT COUNT(*) as c FROM nodo_edt WHERE padre_id = ?', [nodo_edt_id]);
    if (hijos?.c > 0) {
      return res.status(400).json({ error: 'Solo se pueden asignar variables PERT a nodos hoja (sin subtareas)' });
    }

    const opt = Math.max(0.5, Number(duracion_optimista ?? 1));
    const prob = Math.max(opt, Number(duracion_probable ?? opt));
    const pes = Math.max(prob, Number(duracion_pesimista ?? prob));

    const { duracion_esperada, varianza } = calcularPert(opt, prob, pes);
    const existente = get('SELECT id FROM actividad WHERE nodo_edt_id = ?', [nodo_edt_id]);

    if (existente) {
      run(
        `UPDATE actividad SET duracion_optimista = ?, duracion_probable = ?, duracion_pesimista = ?,
         duracion_esperada = ?, varianza = ?, responsable = ?, nombre = ? WHERE id = ?`,
        [opt, prob, pes, duracion_esperada, varianza, responsable ?? '', nodo.nombre, existente.id]
      );
      res.json(get('SELECT a.*, n.codigo as codigo_edt FROM actividad a JOIN nodo_edt n ON a.nodo_edt_id = n.id WHERE a.id = ?', [existente.id]));
    } else {
      const { lastId } = run(
        `INSERT INTO actividad (nodo_edt_id, nombre, duracion_optimista, duracion_probable, duracion_pesimista, duracion_esperada, varianza, responsable)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [nodo_edt_id, nodo.nombre, opt, prob, pes, duracion_esperada, varianza, responsable ?? '']
      );
      res.status(201).json(get('SELECT a.*, n.codigo as codigo_edt FROM actividad a JOIN nodo_edt n ON a.nodo_edt_id = n.id WHERE a.id = ?', [lastId]));
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message || 'Error al guardar actividad inline' });
  }
});

// PUT /api/actividades/:id
router.put('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const { duracion_optimista, duracion_probable, duracion_pesimista, responsable } = req.body;
    const actual = get('SELECT * FROM actividad WHERE id = ?', [id]);
    if (!actual) return res.status(404).json({ error: 'Actividad no encontrada' });

    const opt = duracion_optimista ?? actual.duracion_optimista;
    const prob = duracion_probable ?? actual.duracion_probable;
    const pes = duracion_pesimista ?? actual.duracion_pesimista;
    if (opt > prob || prob > pes) return res.status(400).json({ error: 'optimista ≤ probable ≤ pesimista' });

    const { duracion_esperada, varianza } = calcularPert(opt, prob, pes);
    run(`UPDATE actividad SET duracion_optimista=?, duracion_probable=?, duracion_pesimista=?, duracion_esperada=?, varianza=?, responsable=? WHERE id=?`,
      [opt, prob, pes, duracion_esperada, varianza, responsable ?? actual.responsable, id]);
    res.json(get('SELECT a.*, n.codigo as codigo_edt FROM actividad a JOIN nodo_edt n ON a.nodo_edt_id = n.id WHERE a.id = ?', [id]));
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar actividad' });
  }
});

// DELETE /api/actividades/:id
router.delete('/:id', (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    // Eliminar dependencias asociadas primero
    run('DELETE FROM dependencia WHERE predecesora_id = ? OR sucesora_id = ?', [id, id]);
    const { changes } = run('DELETE FROM actividad WHERE id = ?', [id]);
    if (changes === 0) return res.status(404).json({ error: 'Actividad no encontrada' });
    res.json({ message: 'Actividad eliminada' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar actividad' });
  }
});

export default router;
