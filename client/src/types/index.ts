// Interfaces TypeScript para la aplicación PERT/CPM

export interface Proyecto {
  id: number;
  nombre: string;
  descripcion: string;
  fecha_inicio: string;
  creado_en: string;
  actualizado_en: string;
  total_nodos?: number;
  total_actividades?: number;
}

export interface NodoEdt {
  id: number;
  proyecto_id: number;
  padre_id: number | null;
  codigo: string;
  nombre: string;
  descripcion: string;
  orden: number;
  nivel: number;
  children: NodoEdt[];
  tiene_actividad: boolean;
  actividad?: Actividad | null;
}

export interface Actividad {
  id: number;
  nodo_edt_id: number;
  nombre: string;
  codigo_edt: string;
  duracion_optimista: number;
  duracion_probable: number;
  duracion_pesimista: number;
  duracion_esperada: number;
  varianza: number;
  responsable: string;
  predecesoras: Dependencia[];
}

export interface Dependencia {
  id: number;
  predecesora_id: number;
  sucesora_id: number;
  tipo: string;
  desfase_dias: number;
  predecesora_nombre?: string;
  predecesora_codigo?: string;
  sucesora_nombre?: string;
  sucesora_codigo?: string;
}

export interface CpmResult {
  id: number;
  nombre: string;
  codigo_edt: string;
  duracion: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  holgura_total: number;
  holgura_libre: number;
  es_critica: boolean;
  fecha_inicio: string;
  fecha_fin: string;
  responsable: string;
}

export interface CpmResponse {
  duracion_total: number;
  fecha_inicio: string;
  fecha_fin: string;
  actividades: CpmResult[];
  ruta_critica: number[];
}
