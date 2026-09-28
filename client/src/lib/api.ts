import type { Proyecto, NodoEdt, Actividad, Dependencia, CpmResponse } from '../types';

export class ApiError extends Error {
  response?: {
    status: number;
    data: any;
  };

  constructor(message: string, status: number, data: any) {
    super(data?.error || message || 'Error en la petición');
    this.name = 'ApiError';
    this.response = { status, data };
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('/') ? `/api${endpoint}` : `/api/${endpoint}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const response = await fetch(url, {
    ...options,
    headers,
  });

  let data: any = null;
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await response.json().catch(() => null);
  } else {
    data = await response.text().catch(() => null);
  }

  if (!response.ok) {
    throw new ApiError(
      data?.error || `HTTP error! status: ${response.status}`,
      response.status,
      data
    );
  }

  return data as T;
}

const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body?: any) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  put: <T>(endpoint: string, body?: any) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};

// === Proyectos ===
export const getProyectos = () => api.get<Proyecto[]>('/proyectos');
export const getProyecto = (id: number) => api.get<Proyecto>(`/proyectos/${id}`);
export const createProyecto = (data: { nombre: string; descripcion: string; fecha_inicio: string }) =>
  api.post<Proyecto>('/proyectos', data);
export const updateProyecto = (id: number, data: Partial<Proyecto>) =>
  api.put<Proyecto>(`/proyectos/${id}`, data);
export const deleteProyecto = (id: number) => api.delete(`/proyectos/${id}`);

// === EDT ===
export const getEdt = (proyectoId: number) =>
  api.get<NodoEdt[]>(`/proyectos/${proyectoId}/edt`);
export const createNodoEdt = (proyectoId: number, data: { padre_id?: number | null; nombre: string; descripcion?: string }) =>
  api.post(`/proyectos/${proyectoId}/edt`, data);
export const updateNodoEdt = (id: number, data: { nombre?: string; descripcion?: string }) =>
  api.put(`/edt/${id}`, data);
export const deleteNodoEdt = (id: number) => api.delete(`/edt/${id}`);
export const moverNodoEdt = (id: number, direction: string) =>
  api.put<NodoEdt[]>(`/edt/${id}/mover`, { direction });

// === Actividades ===
export const getActividades = (proyectoId: number) =>
  api.get<Actividad[]>(`/proyectos/${proyectoId}/actividades`);
export const createActividad = (data: {
  nodo_edt_id: number; duracion_optimista: number; duracion_probable: number;
  duracion_pesimista: number; responsable?: string;
}) => api.post<Actividad>('/actividades', data);
export const upsertActividad = (data: {
  nodo_edt_id: number; duracion_optimista?: number; duracion_probable?: number;
  duracion_pesimista?: number; responsable?: string;
}) => api.post<Actividad>('/actividades/upsert', data);
export const updateActividad = (id: number, data: Partial<Actividad>) =>
  api.put<Actividad>(`/actividades/${id}`, data);
export const deleteActividad = (id: number) => api.delete(`/actividades/${id}`);

// === Dependencias ===
export const getDependencias = (proyectoId: number) =>
  api.get<Dependencia[]>(`/proyectos/${proyectoId}/dependencias`);
export const createDependencia = (data: { predecesora_id: number; sucesora_id: number; tipo?: string; desfase_dias?: number }) =>
  api.post<Dependencia>('/dependencias', data);
export const deleteDependencia = (id: number) => api.delete(`/dependencias/${id}`);

// === CPM ===
export const getCpm = (proyectoId: number, soloHabiles: boolean = false) =>
  api.get<CpmResponse>(`/proyectos/${proyectoId}/cpm?solo_habiles=${soloHabiles}&soloHabiles=${soloHabiles}`);
