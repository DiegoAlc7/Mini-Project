// Algoritmo CPM (Critical Path Method)
import { all, get } from '../db/database.js';
import { diaProyectoAFecha } from './dates.js';

interface ActividadCpm {
  id: number;
  nombre: string;
  codigo_edt: string;
  duracion: number;
  responsable: string;
  predecesoras: number[];
  sucesoras: number[];
  es: number; ef: number; ls: number; lf: number;
  holgura_total: number;
  holgura_libre: number;
  es_critica: boolean;
}

export function calcularCpm(proyectoId: number, soloHabiles: boolean = false) {
  const proyecto = get('SELECT * FROM proyecto WHERE id = ?', [proyectoId]);
  if (!proyecto) throw new Error('Proyecto no encontrado');

  const actividades = all(`
    SELECT a.*, n.codigo as codigo_edt FROM actividad a
    JOIN nodo_edt n ON a.nodo_edt_id = n.id WHERE n.proyecto_id = ?
  `, [proyectoId]);

  if (actividades.length === 0) {
    const fIni = proyecto.fecha_inicio ? diaProyectoAFecha(proyecto.fecha_inicio, 0, soloHabiles) : '';
    return {
      duracion_total: 0,
      fecha_inicio: fIni,
      fecha_fin: fIni,
      actividades: [],
      ruta_critica: [],
    };
  }

  const dependencias = all(`
    SELECT d.* FROM dependencia d
    JOIN actividad a ON d.predecesora_id = a.id
    JOIN nodo_edt n ON a.nodo_edt_id = n.id WHERE n.proyecto_id = ?
  `, [proyectoId]);

  // Construir mapa
  const mapa = new Map<number, ActividadCpm>();
  for (const act of actividades) {
    mapa.set(act.id, {
      id: act.id, nombre: act.nombre, codigo_edt: act.codigo_edt,
      duracion: act.duracion_esperada, responsable: act.responsable || '',
      predecesoras: [], sucesoras: [],
      es: 0, ef: 0, ls: 0, lf: 0,
      holgura_total: 0, holgura_libre: 0, es_critica: false,
    });
  }

  for (const dep of dependencias) {
    mapa.get(dep.predecesora_id)?.sucesoras.push(dep.sucesora_id);
    mapa.get(dep.sucesora_id)?.predecesoras.push(dep.predecesora_id);
  }

  // Orden topológico (Kahn)
  const gradoEntrada = new Map<number, number>();
  for (const [id, act] of mapa) gradoEntrada.set(id, act.predecesoras.length);
  const cola: number[] = [];
  for (const [id, grado] of gradoEntrada) if (grado === 0) cola.push(id);
  const orden: number[] = [];
  while (cola.length > 0) {
    const id = cola.shift()!;
    orden.push(id);
    for (const sucId of mapa.get(id)!.sucesoras) {
      const ng = (gradoEntrada.get(sucId) || 0) - 1;
      gradoEntrada.set(sucId, ng);
      if (ng === 0) cola.push(sucId);
    }
  }
  if (orden.length !== mapa.size) throw new Error('Ciclo detectado en dependencias');

  // Forward Pass
  for (const id of orden) {
    const act = mapa.get(id)!;
    if (act.predecesoras.length === 0) {
      act.es = 0;
    } else {
      act.es = Math.max(...act.predecesoras.map(pId => {
        const dep = dependencias.find((d: any) => d.predecesora_id === pId && d.sucesora_id === id);
        return mapa.get(pId)!.ef + (dep?.desfase_dias || 0);
      }));
    }
    act.ef = act.es + act.duracion;
  }

  const duracionTotal = Math.max(...Array.from(mapa.values()).map(a => a.ef));

  // Backward Pass
  for (const id of [...orden].reverse()) {
    const act = mapa.get(id)!;
    if (act.sucesoras.length === 0) {
      act.lf = duracionTotal;
    } else {
      act.lf = Math.min(...act.sucesoras.map(sId => {
        const dep = dependencias.find((d: any) => d.predecesora_id === id && d.sucesora_id === sId);
        return mapa.get(sId)!.ls - (dep?.desfase_dias || 0);
      }));
    }
    act.ls = act.lf - act.duracion;
  }

  // Holguras y ruta crítica
  for (const act of mapa.values()) {
    act.holgura_total = Math.round((act.ls - act.es) * 100) / 100;
    act.holgura_libre = act.sucesoras.length > 0
      ? Math.round((Math.min(...act.sucesoras.map(sId => mapa.get(sId)!.es)) - act.ef) * 100) / 100
      : Math.round((duracionTotal - act.ef) * 100) / 100;
    act.es_critica = Math.abs(act.holgura_total) < 0.001;
  }

  // Mapear a fechas
  const fechaInicio = proyecto.fecha_inicio;
  const actividadesRes = orden.map(id => {
    const act = mapa.get(id)!;
    const diaInicio = Math.floor(act.es);
    const diaFin = act.ef > act.es ? Math.max(diaInicio, Math.ceil(act.ef) - 1) : diaInicio;
    const diaLf = act.lf > act.ls ? Math.max(Math.floor(act.ls), Math.ceil(act.lf) - 1) : Math.floor(act.ls);
    return {
      ...act,
      fecha_inicio: diaProyectoAFecha(fechaInicio, diaInicio, soloHabiles),
      fecha_fin: diaProyectoAFecha(fechaInicio, diaFin, soloHabiles),
      fecha_limite: diaProyectoAFecha(fechaInicio, diaLf, soloHabiles),
    };
  });

  const diaFinProyecto = duracionTotal > 0 ? Math.max(0, Math.ceil(duracionTotal) - 1) : 0;

  return {
    duracion_total: duracionTotal,
    fecha_inicio: diaProyectoAFecha(fechaInicio, 0, soloHabiles),
    fecha_fin: diaProyectoAFecha(fechaInicio, diaFinProyecto, soloHabiles),
    actividades: actividadesRes,
    ruta_critica: actividadesRes.filter(a => a.es_critica).map(a => a.id),
  };
}
