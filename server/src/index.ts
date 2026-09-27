import express from 'express';
import cors from 'cors';
import { initDatabase } from './db/database.js';
import proyectosRouter from './routes/proyectos.js';
import edtRouter from './routes/edt.js';
import actividadesRouter from './routes/actividades.js';
import dependenciasRouter from './routes/dependencias.js';
import cpmRouter from './routes/cpm.js';

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

async function main() {
  // Inicializar base de datos
  await initDatabase();

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Rutas
  app.use('/api/proyectos', proyectosRouter);
  app.use('/api/proyectos', edtRouter);   // GET /:id/edt, POST /:id/edt
  app.use('/api/edt', edtRouter);         // PUT /:id, DELETE /:id, PUT /:id/mover
  app.use('/api/proyectos', actividadesRouter); // GET /:id/actividades
  app.use('/api/actividades', actividadesRouter); // POST, PUT, DELETE
  app.use('/api/proyectos', dependenciasRouter);
  app.use('/api/dependencias', dependenciasRouter);
  app.use('/api/proyectos', cpmRouter);

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  });
}

main().catch(console.error);
