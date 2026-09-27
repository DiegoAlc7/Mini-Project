import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface MiembroProyecto {
  id: string;
  nombre: string;
  rol: string;
  avatar: string;
}

// Catálogo base predeterminado para nuevos proyectos
export const MIEMBROS_BASE: MiembroProyecto[] = [
  {
    id: 'diego',
    nombre: 'Diego',
    rol: 'Director de Proyecto',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Diego&backgroundColor=b6e3f4',
  },
  {
    id: 'falcon',
    nombre: 'Falcon',
    rol: 'Arquitecto de Software',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Falcon&backgroundColor=c0aede',
  },
  {
    id: 'salazar',
    nombre: 'Salazar',
    rol: 'Especialista en Datos',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Salazar&backgroundColor=d1d4f9',
  },
  {
    id: 'paredes',
    nombre: 'Paredes',
    rol: 'Analista Funcional',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Paredes&backgroundColor=ffd5dc',
  },
  {
    id: 'enrique',
    nombre: 'Enrique',
    rol: 'Ingeniero IoT',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Enrique&backgroundColor=ffdfbf',
  },
];

interface ResourceContextType {
  proyectoId: number;
  miembros: MiembroProyecto[];
  getMiembro: (nombreOId?: string | null) => MiembroProyecto | undefined;
  agregarMiembro: (datos: { nombre: string; rol: string; avatar?: string }) => MiembroProyecto;
  eliminarMiembro: (id: string) => void;
  restablecerCatalogo: () => void;
}

const ResourceContext = createContext<ResourceContextType>({
  proyectoId: 0,
  miembros: MIEMBROS_BASE,
  getMiembro: () => undefined,
  agregarMiembro: () => ({} as MiembroProyecto),
  eliminarMiembro: () => {},
  restablecerCatalogo: () => {},
});

interface ProviderProps {
  proyectoId: number;
  proyectoNombre?: string;
  children: React.ReactNode;
}

/**
 * Proveedor de Recursos aislado por Proyecto.
 * Cada proyecto tiene su propia lista de miembros en su propio espacio de almacenamiento.
 */
export const ProjectResourceProvider: React.FC<ProviderProps> = ({ proyectoId, proyectoNombre, children }) => {
  const storageKey = `pert_cpm_team_project_${proyectoId}`;

  const isBusesProject = useCallback(() => {
    if (proyectoId === 7 || proyectoId === 13) return true;
    if (!proyectoNombre) return false;
    const lower = proyectoNombre.toLowerCase();
    return lower.includes('recaudo') || lower.includes('transporte');
  }, [proyectoId, proyectoNombre]);

  // Cargar el equipo exclusivo del proyecto actual
  const [miembros, setMiembros] = useState<MiembroProyecto[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (err) {
      console.error(`Error al cargar equipo para proyecto ${proyectoId}:`, err);
    }
    // Proyectos nuevos inician sin miembros por defecto (vacío []), salvo el proyecto demo de buses
    return isBusesProject() ? MIEMBROS_BASE : [];
  });

  // Si cambia el proyectoId en la URL, cargar el equipo del nuevo proyecto
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`pert_cpm_team_project_${proyectoId}`);
      if (stored !== null) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setMiembros(parsed);
          return;
        }
      }
    } catch (err) {
      console.error(err);
    }
    // Proyectos nuevos inician sin miembros por defecto (vacío [])
    setMiembros(isBusesProject() ? MIEMBROS_BASE : []);
  }, [proyectoId, isBusesProject]);

  // Guardar exclusivamente bajo la clave del proyecto actual
  useEffect(() => {
    try {
      localStorage.setItem(`pert_cpm_team_project_${proyectoId}`, JSON.stringify(miembros));
    } catch (err) {
      console.error(`Error al guardar equipo para proyecto ${proyectoId}:`, err);
    }
  }, [proyectoId, miembros]);

  // Búsqueda dentro del equipo de este proyecto
  const getMiembro = useCallback(
    (identificador?: string | null): MiembroProyecto | undefined => {
      if (!identificador) return undefined;
      const lower = identificador.trim().toLowerCase();

      return miembros.find(
        (m) =>
          m.id.toLowerCase() === lower ||
          m.nombre.toLowerCase() === lower ||
          lower.includes(m.nombre.toLowerCase()) ||
          lower.includes(m.rol.toLowerCase())
      );
    },
    [miembros]
  );

  // Agregar miembro solo al proyecto actual
  const agregarMiembro = useCallback(
    (datos: { nombre: string; rol: string; avatar?: string }): MiembroProyecto => {
      const nombreLimpio = datos.nombre.trim();
      const rolLimpio = datos.rol.trim();

      const defaultAvatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
        nombreLimpio
      )}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

      const nuevoMiembro: MiembroProyecto = {
        id: `p${proyectoId}_m_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        nombre: nombreLimpio,
        rol: rolLimpio,
        avatar: datos.avatar?.trim() || defaultAvatar,
      };

      setMiembros((prev) => [...prev, nuevoMiembro]);
      return nuevoMiembro;
    },
    [proyectoId]
  );

  // Eliminar miembro solo del proyecto actual
  const eliminarMiembro = useCallback((id: string) => {
    setMiembros((prev) => prev.filter((m) => m.id !== id));
  }, []);

  // Restablecer catálogo al base para el proyecto actual
  const restablecerCatalogo = useCallback(() => {
    setMiembros(MIEMBROS_BASE);
  }, []);

  return (
    <ResourceContext.Provider
      value={{
        proyectoId,
        miembros,
        getMiembro,
        agregarMiembro,
        eliminarMiembro,
        restablecerCatalogo,
      }}
    >
      {children}
    </ResourceContext.Provider>
  );
};

// Fallback provider global
export const ResourceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <>{children}</>;
};

export const useResources = () => useContext(ResourceContext);
