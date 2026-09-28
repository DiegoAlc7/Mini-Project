import { Router, Request, Response } from 'express';
import { calcularCpm } from '../services/cpm.js';

const router = Router();

// GET /api/proyectos/:id/cpm - Calcular ruta crítica
router.get('/:proyectoId/cpm', (req: Request, res: Response) => {
  try {
    const soloHabiles = req.query.solo_habiles === 'true' || req.query.soloHabiles === 'true';
    const resultado = calcularCpm(Number(req.params.proyectoId), soloHabiles);
    res.json(resultado);
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Error al calcular ruta crítica' });
  }
});

export default router;
