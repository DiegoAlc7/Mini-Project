import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  ChevronRight,
  ChevronDown,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Link2,
  Folder,
  FolderOpen,
  FileText,
  AlertCircle,
  HelpCircle,
  MoreVertical,
  User,
} from 'lucide-react';
import type { NodoEdt, Actividad, Dependencia, CpmResponse, CpmResult } from '../../types';
import {
  getEdt,
  createNodoEdt,
  updateNodoEdt,
  deleteNodoEdt,
  updateActividad,
  upsertActividad,
  createDependencia,
  deleteDependencia,
  getCpm,
} from '../../lib/api';
import ResourceSelect from '../ui/ResourceSelect';
import PredecessorSelect from '../ui/PredecessorSelect';
import { useResources } from '../../context/ResourceContext';

interface Props {
  proyectoId: number;
  onDataChange?: () => void;
  dataVersion?: number;
}

interface ModalPertState {
  nodo: NodoEdt;
  actividad?: Actividad | null;
  optimista: string;
  probable: string;
  pesimista: string;
}

export default function TreeGrid({ proyectoId, onDataChange, dataVersion = 0 }: Props) {
  const { getMiembro } = useResources();
  const [arbol, setArbol] = useState<NodoEdt[]>([]);
  const [loading, setLoading] = useState(true);
  const [cpmData, setCpmData] = useState<CpmResponse | null>(null);
  const [cpmLoading, setCpmLoading] = useState(false);

  // Estados de expansión de nodos (por defecto todos expandidos)
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Estado para edición rápida de nombre de nodo
  const [editingNodeId, setEditingNodeId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState('');

  // Modal para agregar nueva subtarea
  const [modalSubtarea, setModalSubtarea] = useState<{
    padreId: number;
    padreCodigo: string;
    padreNombre: string;
  } | null>(null);
  const [nuevoNombreSubtarea, setNuevoNombreSubtarea] = useState('');

  // Modal: Estimación PERT (REGLA 2)
  const [modalPert, setModalPert] = useState<ModalPertState | null>(null);
  const [errorModalPert, setErrorModalPert] = useState<string | null>(null);
  const [guardandoModalPert, setGuardandoModalPert] = useState(false);

  // Edición inline a nivel de celda (REGLA 3)
  const [editingRespNodeId, setEditingRespNodeId] = useState<number | null>(null);
  const [editingPredNodeId, setEditingPredNodeId] = useState<number | null>(null);

  // Menú de tres puntos (Kebab Menu en Portal - REGLA 1)
  const [kebabMenu, setKebabMenu] = useState<{
    nodo: NodoEdt;
    top?: number;
    bottom?: number;
    right: number;
  } | null>(null);

  // Referencia al contenedor raíz de la tabla para localizar el contenedor de scroll
  const gridRef = useRef<HTMLDivElement>(null);

  // Creación rápida en línea (+ Añadir tarea - REGLA 3)
  const [inlineAddingPadreId, setInlineAddingPadreId] = useState<number | null>(null);
  const [inlineNombre, setInlineNombre] = useState('');
  const [creandoInline, setCreandoInline] = useState(false);

  // Cerrar menú kebab al hacer clic fuera o presionar Escape
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.kebab-menu-container') && !target.closest('.kebab-trigger-button')) {
        setKebabMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setKebabMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Cerrar menú kebab si la tabla hace scroll
  useEffect(() => {
    if (!kebabMenu) return;
    const handleScroll = () => {
      setKebabMenu(null);
    };
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [kebabMenu]);

  // Bloquear el scroll de fondo mientras cualquier menú o ventana (tres puntos, responsable, predecesoras) esté abierta
  // SIN OCULTAR LA BARRA DESLIZADORA (la barra de scroll permanece 100% visible y en su lugar sin layout shift)
  const isAnyMenuOpen =
    kebabMenu !== null ||
    editingRespNodeId !== null ||
    editingPredNodeId !== null;

  useEffect(() => {
    if (!isAnyMenuOpen) return;

    // Interceptar eventos wheel y touchmove en fase de captura para evitar que cualquier scroll de fondo se inicie
    // Esto mantiene el fondo fijo SIN esconder la barra deslizadora nativa
    const handlePreventScroll = (e: WheelEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      // Permitir scroll normal si el puntero está dentro de una lista con scroll interno del popover
      if (target?.closest('.popover-scroll-container, [data-allow-scroll="true"]')) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener('wheel', handlePreventScroll, { passive: false, capture: true });
    document.addEventListener('touchmove', handlePreventScroll, { passive: false, capture: true });

    return () => {
      document.removeEventListener('wheel', handlePreventScroll, { capture: true });
      document.removeEventListener('touchmove', handlePreventScroll, { capture: true });
    };
  }, [isAnyMenuOpen]);

  // Limpieza inicial: asegurar que ningún estilo residual de overflow-y afecte al contenedor
  useEffect(() => {
    const scrollParent = gridRef.current?.closest('.overflow-y-auto') as HTMLElement | null;
    if (scrollParent) {
      scrollParent.style.removeProperty('overflow-y');
      scrollParent.style.overflowY = '';
    }
  }, []);

  // REGLA 1: Cálculo Reactivo (Auto-Run) en segundo plano del motor CPM
  const recalcularCpm = useCallback(async () => {
    setCpmLoading(true);
    try {
      const cpm = await getCpm(proyectoId, false);
      setCpmData(cpm);
    } catch {
      // Silencioso en caso de no tener actividades completas o validaciones pendientes
    } finally {
      setCpmLoading(false);
    }
  }, [proyectoId]);

  // Cargar datos del EDT y actividades unificadas
  const cargar = useCallback(async () => {
    try {
      const data = await getEdt(proyectoId);
      setArbol(data);

      // Expandir todos los nodos inicialmente o mantener estado previo
      const ids = new Set<number>();
      function recorrer(nodos: NodoEdt[]) {
        for (const n of nodos) {
          ids.add(n.id);
          if (n.children && n.children.length > 0) {
            recorrer(n.children);
          }
        }
      }
      recorrer(data);
      setExpandedIds((prev) => (prev.size === 0 ? ids : prev));

      // Auto-run: Recalcular CPM automáticamente en segundo plano
      await recalcularCpm();
    } catch (err) {
      console.error('Error cargando TreeGrid:', err);
    } finally {
      setLoading(false);
    }
  }, [proyectoId, recalcularCpm]);

  // Recargar datos locales y notificar cambios al contenedor padre (para sincronizar con Gantt)
  const refrescarYNotificar = useCallback(async () => {
    await cargar();
    onDataChange?.();
  }, [cargar, onDataChange]);

  useEffect(() => {
    cargar();
  }, [cargar, dataVersion]);

  // Lista aplanada de todas las actividades hoja para el selector de predecesoras
  const todasLasHojas = useMemo(() => {
    const hojas: { nodo: NodoEdt; actividad: Actividad }[] = [];
    function buscarHojas(nodos: NodoEdt[]) {
      for (const n of nodos) {
        const isRoot = n.padre_id === null;
        const hasChildren = Boolean(n.children && n.children.length > 0);
        if (!isRoot && !hasChildren && n.actividad) {
          hojas.push({ nodo: n, actividad: n.actividad });
        }
        if (n.children && n.children.length > 0) {
          buscarHojas(n.children);
        }
      }
    }
    buscarHojas(arbol);
    return hojas;
  }, [arbol]);

  // REGLAS 1, 2 Y 3: Filtrado estricto de opciones de predecesoras para evitar ciclos y proteger el motor CPM
  const obtenerCandidatosPredecesoras = useCallback(
    (nodoActual: NodoEdt) => {
      if (!nodoActual.actividad) return [];

      const actividadActualId = nodoActual.actividad.id;

      // Construir grafo de adyacencia (predecesora -> sucesoras) para rastrear dependencias circulares directas e indirectas
      const grafoSucesores = new Map<number, Set<number>>();
      for (const { actividad } of todasLasHojas) {
        for (const dep of actividad.predecesoras || []) {
          if (!grafoSucesores.has(dep.predecesora_id)) {
            grafoSucesores.set(dep.predecesora_id, new Set());
          }
          grafoSucesores.get(dep.predecesora_id)!.add(actividad.id);
        }
      }

      // BFS para encontrar todos los sucesores (directos e indirectos) de la tarea actual
      const sucesoresDeActual = new Set<number>();
      const cola = [actividadActualId];
      while (cola.length > 0) {
        const actual = cola.shift()!;
        const hijos = grafoSucesores.get(actual);
        if (hijos) {
          for (const hijoId of hijos) {
            if (!sucesoresDeActual.has(hijoId)) {
              sucesoresDeActual.add(hijoId);
              cola.push(hijoId);
            }
          }
        }
      }

      return todasLasHojas.filter(({ nodo, actividad }) => {
        // REGLA 1: Restricción de Nodos Hoja
        // El Proyecto Raíz y todas las Fases quedan estrictamente excluidos de la lista
        const isRoot = nodo.padre_id === null;
        const hasChildren = Boolean(nodo.children && nodo.children.length > 0);
        if (isRoot || hasChildren) {
          return false;
        }

        // REGLA 2: Exclusión de Identidad
        // Elimina de la lista de opciones la tarea actual que el usuario está editando
        if (nodo.id === nodoActual.id || actividad.id === actividadActualId) {
          return false;
        }

        // REGLA 3: Prevención de Bucles (Circular Dependencies)
        // Bloquea y oculta del dropdown cualquier tarea que ya tenga a la tarea actual configurada como su predecesora directa o indirecta
        const tieneAComoPredecesoraDirecta = actividad.predecesoras?.some(
          (p) => p.predecesora_id === actividadActualId
        );
        if (tieneAComoPredecesoraDirecta || sucesoresDeActual.has(actividad.id)) {
          return false;
        }

        return true;
      });
    },
    [todasLasHojas]
  );

  // Conjunto de IDs de actividades críticas para resaltar en rojo
  const rutaCriticaSet = useMemo(() => {
    return new Set(cpmData?.ruta_critica || []);
  }, [cpmData]);

  // Mapeo id de actividad -> CpmResult para cálculos instantáneos de CPM
  const cpmMap = useMemo(() => {
    const map = new Map<number, CpmResult>();
    if (cpmData?.actividades) {
      for (const act of cpmData.actividades) {
        map.set(act.id, act);
      }
    }
    return map;
  }, [cpmData]);

  // REGLAS 1 Y 2: Duración de Fase basada en CPM = EF máximo - ES mínimo entre todos sus hijos
  // Elimina la suma lineal bruta para considerar dependencias y tareas en paralelo
  const calcularDuracionFase = useCallback(
    (nodo: NodoEdt): number => {
      const leaves: CpmResult[] = [];
      function recolectarHojas(n: NodoEdt) {
        if (!n.children || n.children.length === 0) {
          if (n.actividad) {
            const cpmAct = cpmMap.get(n.actividad.id);
            if (cpmAct) leaves.push(cpmAct);
          }
        } else {
          n.children.forEach(recolectarHojas);
        }
      }
      recolectarHojas(nodo);

      if (leaves.length === 0) return 0;

      const minEs = Math.min(...leaves.map((l) => l.es));
      const maxEf = Math.max(...leaves.map((l) => l.ef));

      if (!isFinite(minEs) || !isFinite(maxEf) || maxEf <= minEs) {
        return 0;
      }

      return Math.round((maxEf - minEs) * 100) / 100;
    },
    [cpmMap]
  );

  // Alternar expandir/colapsar
  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Abrir modal Estimación PERT (REGLA 2)
  const abrirModalPert = async (nodo: NodoEdt) => {
    let act = nodo.actividad;
    if (!act) {
      try {
        act = await upsertActividad({
          nodo_edt_id: nodo.id,
          responsable: '',
        });
      } catch (e) {
        console.error('Error inicializando actividad:', e);
      }
    }
    setModalPert({
      nodo,
      actividad: act,
      optimista: act?.duracion_optimista != null ? String(act.duracion_optimista) : '',
      probable: act?.duracion_probable != null ? String(act.duracion_probable) : '',
      pesimista: act?.duracion_pesimista != null ? String(act.duracion_pesimista) : '',
    });
    setErrorModalPert(null);
  };

  // Guardar datos desde el modal Estimación PERT (REGLA 2)
  const handleGuardarModalPert = async () => {
    if (!modalPert) return;
    const { nodo, optimista, probable, pesimista } = modalPert;

    const opt = parseFloat(optimista);
    const prob = parseFloat(probable);
    const pes = parseFloat(pesimista);

    if (isNaN(opt) || isNaN(prob) || isNaN(pes)) {
      setErrorModalPert('Debes ingresar los 3 valores PERT (Optimista, Más Probable y Pesimista)');
      return;
    }
    if (opt <= 0 || prob <= 0 || pes <= 0) {
      setErrorModalPert('Las estimaciones deben ser números mayores a 0');
      return;
    }
    if (opt > prob || prob > pes) {
      setErrorModalPert('Debe cumplirse: Optimista (a) ≤ Más Probable (m) ≤ Pesimista (b)');
      return;
    }

    setGuardandoModalPert(true);
    setErrorModalPert(null);
    try {
      await upsertActividad({
        nodo_edt_id: nodo.id,
        duracion_optimista: opt,
        duracion_probable: prob,
        duracion_pesimista: pes,
        responsable: nodo.actividad?.responsable || '',
      });
      await refrescarYNotificar();
      setModalPert(null);
    } catch (err: any) {
      setErrorModalPert(err.response?.data?.error || 'Error al guardar estimación PERT');
    } finally {
      setGuardandoModalPert(false);
    }
  };

  // Abrir selector de Responsable inline (REGLA 3)
  const handleAbrirEditarResp = async (nodo: NodoEdt) => {
    if (!nodo.actividad) {
      try {
        await upsertActividad({
          nodo_edt_id: nodo.id,
          responsable: '',
        });
        await refrescarYNotificar();
      } catch (e) {
        console.error(e);
      }
    }
    setEditingRespNodeId(nodo.id);
    setEditingPredNodeId(null);
  };

  // Guardar Responsable inline (REGLA 3)
  const handleGuardarResponsableInline = async (nodo: NodoEdt, nuevoResp: string) => {
    try {
      if (nodo.actividad) {
        await updateActividad(nodo.actividad.id, { responsable: nuevoResp });
      } else {
        await upsertActividad({
          nodo_edt_id: nodo.id,
          responsable: nuevoResp,
        });
      }
      await refrescarYNotificar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al asignar responsable');
    }
  };

  // Abrir selector de Predecesoras inline (REGLA 3)
  const handleAbrirEditarPred = async (nodo: NodoEdt) => {
    if (!nodo.actividad) {
      try {
        await upsertActividad({
          nodo_edt_id: nodo.id,
          responsable: '',
        });
        await refrescarYNotificar();
      } catch (e) {
        console.error(e);
      }
    }
    setEditingPredNodeId(nodo.id);
    setEditingRespNodeId(null);
  };

  // Vincular dependencia inline (REGLA 3)
  const handleAddDependenciaInline = async (actividadSucesoraId: number, predecesoraId: number) => {
    try {
      await createDependencia({
        predecesora_id: predecesoraId,
        sucesora_id: actividadSucesoraId,
      });
      await refrescarYNotificar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al vincular dependencia');
    }
  };

  // Eliminar dependencia inline (REGLA 3)
  const handleRemoveDependenciaInline = async (depId: number) => {
    try {
      await deleteDependencia(depId);
      await refrescarYNotificar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al eliminar dependencia');
    }
  };

  // Limpiar todas las dependencias inline (REGLA 3)
  const handleClearDependenciasInline = async (predecesoras: Dependencia[]) => {
    try {
      for (const dep of predecesoras) {
        await deleteDependencia(dep.id);
      }
      await refrescarYNotificar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al limpiar dependencias');
    }
  };

  // Crear Subtarea
  const handleCrearSubtarea = async () => {
    if (!modalSubtarea || !nuevoNombreSubtarea.trim()) return;
    try {
      await createNodoEdt(proyectoId, {
        padre_id: modalSubtarea.padreId,
        nombre: nuevoNombreSubtarea.trim(),
      });
      setModalSubtarea(null);
      setNuevoNombreSubtarea('');
      await refrescarYNotificar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al crear subtarea');
    }
  };

  // Guardar edición de nombre
  const handleGuardarNombre = async (id: number) => {
    if (!editingName.trim()) return;
    try {
      await updateNodoEdt(id, { nombre: editingName.trim() });
      setEditingNodeId(null);
      await refrescarYNotificar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al actualizar nombre');
    }
  };

  // Eliminar nodo
  const handleEliminarNodo = async (nodo: NodoEdt) => {
    if (nodo.padre_id === null) {
      alert('El nodo raíz del proyecto es inamovible.');
      return;
    }
    if (
      !confirm(
        `¿Eliminar "${nodo.codigo} ${nodo.nombre}" y todos sus elementos dependientes?`
      )
    )
      return;
    try {
      await deleteNodoEdt(nodo.id);
      await refrescarYNotificar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al eliminar');
    }
  };

  // Creación rápida en línea (REGLA 3)
  const handleCrearTareaInline = async (padreId: number) => {
    if (!inlineNombre.trim()) {
      setInlineAddingPadreId(null);
      return;
    }
    setCreandoInline(true);
    try {
      await createNodoEdt(proyectoId, {
        padre_id: padreId,
        nombre: inlineNombre.trim(),
      });
      setInlineAddingPadreId(null);
      setInlineNombre('');
      await refrescarYNotificar();
      setExpandedIds((prev) => new Set([...prev, padreId]));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al crear tarea');
    } finally {
      setCreandoInline(false);
    }
  };

  // Renderizar fila especial para agregar tarea en línea (REGLA 3)
  const renderInlineAddRow = (padre: NodoEdt) => {
    const isAdding = inlineAddingPadreId === padre.id;
    const isPadreRoot = padre.nivel === 0 || padre.padre_id === null;
    const isPadreFase = padre.nivel === 1;
    const nivelVisual = isPadreRoot ? 0 : Math.max(0, padre.nivel - 1) + 1;
    const paddingLeft = nivelVisual * 20 + 8;
    const label = isPadreRoot
      ? 'Añadir fase'
      : isPadreFase
      ? 'Añadir paquete de trabajo'
      : 'Añadir actividad';
    const placeholder = isPadreRoot
      ? 'Nombre de la nueva fase...'
      : isPadreFase
      ? 'Nombre del nuevo paquete de trabajo...'
      : 'Nombre de la nueva actividad...';

    if (isAdding) {
      return (
        <div
          key={`inline-add-${padre.id}`}
          className="flex items-center text-xs py-1.5 border-b border-dashed border-blue-200 bg-blue-50/30 transition-colors"
          style={{ paddingLeft: `${paddingLeft}px` }}
        >
          <span className="w-5 shrink-0" />
          <FileText size={14} className="text-blue-500 mr-2 shrink-0" />
          <div className="flex items-center gap-1.5 flex-1 max-w-sm">
            <input
              type="text"
              value={inlineNombre}
              onChange={(e) => setInlineNombre(e.target.value)}
              placeholder={placeholder}
              autoFocus
              disabled={creandoInline}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCrearTareaInline(padre.id);
                if (e.key === 'Escape') {
                  setInlineAddingPadreId(null);
                  setInlineNombre('');
                }
              }}
              className="bg-white border border-blue-400 rounded px-2 py-0.5 text-xs w-full outline-none focus:ring-1 focus:ring-blue-500 placeholder:text-slate-400"
            />
            <button
              onClick={() => handleCrearTareaInline(padre.id)}
              disabled={creandoInline || !inlineNombre.trim()}
              className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded text-xs font-medium cursor-pointer shrink-0 flex items-center gap-1"
            >
              <Check size={13} />
              <span>{creandoInline ? '...' : 'Guardar'}</span>
            </button>
            <button
              onClick={() => {
                setInlineAddingPadreId(null);
                setInlineNombre('');
              }}
              disabled={creandoInline}
              className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              title="Cancelar"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div
        key={`inline-add-btn-${padre.id}`}
        className="flex items-center py-1 transition-colors"
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        <span className="w-5 shrink-0" />
        <button
          onClick={() => {
            setInlineAddingPadreId(padre.id);
            setInlineNombre('');
          }}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline py-0.5 px-1.5 rounded transition-all cursor-pointer font-medium select-none"
        >
          <Plus size={13} className="stroke-[2.5]" />
          <span>{label}</span>
        </button>
      </div>
    );
  };

  if (loading && arbol.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">
        <p>Cargando Plan de Trabajo (TreeTable)...</p>
      </div>
    );
  }

  // Renderizar fila jerárquica
  const renderRow = (nodo: NodoEdt) => {
    // REGLA 1: Detección de Nodos
    // Es contenedor si es el nodo raíz (padre_id === null) o si tiene tareas hijas
    const isRoot = nodo.padre_id === null;
    const hasChildren = Boolean(nodo.children && nodo.children.length > 0);
    const isContenedor = isRoot || hasChildren;
    // Es hoja estricta y únicamente si NO es contenedor (no es raíz y no tiene subtareas)
    const isHoja = !isContenedor;

    const isExpanded = expandedIds.has(nodo.id);
    const duracionFase = isContenedor && hasChildren ? calcularDuracionFase(nodo) : 0;

    const actividad = nodo.actividad;
    const esCritica = actividad ? rutaCriticaSet.has(actividad.id) : false;
    const miembroResp = getMiembro(actividad?.responsable);

    const isEditingRow =
      editingRespNodeId === nodo.id ||
      editingPredNodeId === nodo.id ||
      kebabMenu?.nodo.id === nodo.id;

    return (
      <div key={nodo.id} className={isEditingRow ? 'relative z-30' : 'relative z-0'}>
        <div
          className={`relative group flex items-center text-xs border-b border-slate-200 min-h-[46px] transition-colors ${
            isRoot
              ? 'bg-blue-50/70 font-semibold text-slate-900 py-2.5'
              : hasChildren
              ? 'bg-slate-50/80 font-medium text-slate-800 py-2'
              : esCritica
              ? 'bg-red-50/40 hover:bg-red-50/70 py-1.5'
              : 'hover:bg-slate-50/60 py-1.5'
          }`}
        >
          {/* COLUMNA 1: Jerarquía, Código y Nombre de la Tarea (Alineación vertical perfecta) */}
          <div
            className="flex items-center gap-1.5 pr-2 min-w-0 shrink-0"
            style={{
              width: '48%',
              flex: '0 0 48%',
              paddingLeft: `${Math.max(8, (nodo.nivel > 0 ? nodo.nivel - 1 : 0) * 20 + 8)}px`,
            }}
          >
            {/* Botón expandir/contraer */}
            {hasChildren ? (
              <button
                onClick={() => toggleExpand(nodo.id)}
                className="w-5 h-5 flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded shrink-0 cursor-pointer"
              >
                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>
            ) : (
              <span className="w-5 shrink-0" />
            )}

            {/* Ícono de tipo de nodo */}
            <span className="shrink-0 flex items-center justify-center self-center">
              {isRoot ? (
                <FolderOpen size={16} className="text-blue-600" />
              ) : hasChildren ? (
                <Folder size={15} className="text-amber-500" />
              ) : (
                <FileText
                  size={14}
                  className={esCritica ? 'text-red-500' : 'text-slate-400'}
                />
              )}
            </span>

            {/* Contenedor Flexbox de Código EDT y Nombre con align-items: baseline para nivelación exacta */}
            <div className="flex items-baseline gap-1.5 min-w-0 flex-1 group/name">
              {/* Código numérico EDT: sin márgenes ni paddings que desalineen */}
              <span
                className={`font-mono text-xs shrink-0 m-0 p-0 leading-normal ${
                  isRoot
                    ? 'text-blue-800 font-bold'
                    : hasChildren
                    ? 'text-slate-800 font-semibold'
                    : 'text-blue-600 font-semibold'
                }`}
              >
                {nodo.codigo}
              </span>

              {/* Nombre de la tarea (editable o visualización) */}
              {editingNodeId === nodo.id ? (
                <div className="flex items-center gap-1 flex-1 min-w-0 self-center">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="bg-white border border-blue-400 rounded px-1.5 py-0.5 text-xs w-full outline-none focus:ring-1 focus:ring-blue-500 m-0"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleGuardarNombre(nodo.id);
                      if (e.key === 'Escape') setEditingNodeId(null);
                    }}
                  />
                  <button
                    onClick={() => handleGuardarNombre(nodo.id)}
                    className="text-green-600 hover:text-green-800 cursor-pointer shrink-0"
                    title="Guardar"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setEditingNodeId(null)}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                    title="Cancelar"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-baseline gap-1.5 min-w-0 flex-1">
                  <span
                    className="truncate text-slate-800 text-xs m-0 p-0 leading-normal"
                    title={nodo.nombre}
                  >
                    {nodo.nombre}
                  </span>

                  {isRoot && (
                    <span className="text-xs bg-blue-50 text-blue-700 font-medium px-2 py-0.5 rounded shrink-0 self-center leading-tight">
                      Proyecto Raíz
                    </span>
                  )}

                  {hasChildren && !isRoot && (
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded shrink-0 self-center leading-tight ${
                        nodo.nivel === 1
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                      }`}
                    >
                      {nodo.nivel === 1 ? 'Fase' : 'Paquete de Trabajo'}
                    </span>
                  )}

                  {esCritica && (
                    <span className="text-xs bg-red-100 text-red-700 font-medium px-2 py-0.5 rounded shrink-0 self-center leading-tight">
                      Crítica
                    </span>
                  )}

                  {/* Botón editar nombre */}
                  <button
                    onClick={() => {
                      setEditingNodeId(nodo.id);
                      setEditingName(nodo.nombre);
                    }}
                    className="opacity-0 group-hover/name:opacity-100 text-slate-400 hover:text-blue-600 ml-1 transition-opacity shrink-0 cursor-pointer self-center"
                    title="Editar nombre"
                  >
                    <Edit2 size={12} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* COLUMNA 2: Te (Días) (14%) (REGLA 2: Modal al clic/hover en hojas, estático en contenedores) */}
          <div className="text-center px-2 font-mono shrink-0 select-none" style={{ width: '14%', flex: '0 0 14%' }}>
            {isContenedor ? (
              hasChildren && duracionFase > 0 ? (
                <span
                  className="bg-gray-100 text-gray-700 font-medium px-2 py-0.5 rounded text-[11px] font-mono inline-block"
                  title="Duración del lapso temporal de la fase basado en CPM (EF máx - ES mín de sus subtareas)"
                >
                  ∑ {duracionFase}d
                </span>
              ) : (
                <span className="text-gray-300 font-mono text-xs tracking-widest text-center">
                  --
                </span>
              )
            ) : (
              <div
                onClick={() => abrirModalPert(nodo)}
                className="inline-flex items-center justify-center gap-1 group/te cursor-pointer hover:bg-blue-50/80 hover:ring-1 hover:ring-blue-300 px-2 py-0.5 rounded text-[11px] transition-all"
                title="Clic para editar estimación PERT (Optimista, Probable, Pesimista)"
              >
                {actividad?.duracion_esperada != null && actividad.duracion_esperada > 0 ? (
                  <span
                    className={`font-medium font-mono text-[11px] ${
                      esCritica ? 'bg-red-100 text-red-700 px-1.5 py-0.5 rounded' : 'text-gray-700'
                    }`}
                  >
                    {actividad.duracion_esperada}d
                  </span>
                ) : (
                  <span className="text-gray-400 italic font-sans text-[11px]">
                    Estimar...
                  </span>
                )}
                {/* Ícono sutil de edición en hover (REGLA 2) */}
                <Edit2
                  size={11}
                  className="opacity-0 group-hover/te:opacity-100 text-blue-500 transition-opacity shrink-0"
                />
              </div>
            )}
          </div>

          {/* COLUMNA 3: Responsable (20%) (REGLA 3: Edición inline en hojas, estático en contenedores) */}
          <div className="px-3 shrink-0" style={{ width: '20%', flex: '0 0 20%' }}>
            {isContenedor ? (
              <span className="text-slate-300 font-mono text-xs select-none tracking-widest text-center block">
                --
              </span>
            ) : editingRespNodeId === nodo.id ? (
              <ResourceSelect
                value={actividad?.responsable || ''}
                defaultOpen={true}
                onChange={async (nuevoResp) => {
                  await handleGuardarResponsableInline(nodo, nuevoResp);
                  setEditingRespNodeId(null);
                }}
                onClose={() => setEditingRespNodeId(null)}
              />
            ) : (
              <div
                onClick={() => handleAbrirEditarResp(nodo)}
                className="flex items-center justify-between gap-1.5 min-w-0 cursor-pointer hover:bg-slate-100/70 rounded px-1.5 h-[36px] box-border border border-transparent transition-colors group/resp"
                title="Clic para asignar responsable"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {miembroResp ? (
                    <>
                      <img
                        src={miembroResp.avatar}
                        alt={miembroResp.nombre}
                        className="w-6 h-6 rounded-full bg-slate-100 ring-1 ring-slate-200 shrink-0 object-cover"
                      />
                      <div className="min-w-0 flex-1 truncate">
                        <span className="text-xs text-slate-800 font-semibold block leading-tight truncate">
                          {miembroResp.nombre}
                        </span>
                        <span className="text-[10px] text-slate-400 block leading-tight truncate">
                          {miembroResp.rol}
                        </span>
                      </div>
                    </>
                  ) : actividad?.responsable ? (
                    <>
                      <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-[10px] shrink-0">
                        {actividad.responsable.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1 truncate">
                        <span className="text-xs text-slate-700 font-semibold block leading-tight truncate">
                          {actividad.responsable}
                        </span>
                        <span className="text-[10px] text-amber-600 block leading-tight truncate">
                          Asignado
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-6 h-6 rounded-full bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                        <User size={12} />
                      </div>
                      <div className="min-w-0 flex-1 truncate">
                        <span className="text-xs text-slate-400 italic block leading-tight truncate">Sin asignar</span>
                        <span className="text-[10px] text-transparent select-none block leading-tight">--</span>
                      </div>
                    </div>
                  )}
                </div>
                <Edit2
                  size={10}
                  className="opacity-0 group-hover/resp:opacity-100 text-slate-400 shrink-0 ml-1 transition-opacity"
                />
              </div>
            )}
          </div>

          {/* COLUMNA 4: Predecesoras (18%) (REGLA 3: Edición inline en hojas, estático en contenedores) */}
          <div className="px-3 pr-10 shrink-0" style={{ width: '18%', flex: '0 0 18%' }}>
            {isContenedor ? (
              <span className="text-slate-300 font-mono text-xs select-none tracking-widest text-center block">
                --
              </span>
            ) : editingPredNodeId === nodo.id ? (
              <PredecessorSelect
                actividadId={actividad?.id || 0}
                predecesoras={actividad?.predecesoras || []}
                candidatos={obtenerCandidatosPredecesoras(nodo)}
                onAddDependencia={(predId) =>
                  handleAddDependenciaInline(actividad?.id || 0, predId)
                }
                onRemoveDependencia={handleRemoveDependenciaInline}
                onClearAll={() =>
                  handleClearDependenciasInline(actividad?.predecesoras || [])
                }
                onClose={() => setEditingPredNodeId(null)}
              />
            ) : (
              <div
                onClick={() => handleAbrirEditarPred(nodo)}
                className="flex items-center justify-between gap-1 min-w-0 cursor-pointer hover:bg-slate-100/70 rounded px-1.5 py-1 transition-colors group/pred min-h-[22px]"
                title="Clic para editar predecesoras"
              >
                <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
                  {actividad?.predecesoras && actividad.predecesoras.length > 0 ? (
                    actividad.predecesoras.map((dep) => (
                      <span
                        key={dep.id}
                        className="inline-flex items-center bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium"
                      >
                        {dep.predecesora_codigo}
                      </span>
                    ))
                  ) : (
                    <span className="text-gray-300 text-xs italic">—</span>
                  )}
                </div>
                <Edit2
                  size={10}
                  className="opacity-0 group-hover/pred:opacity-100 text-slate-400 shrink-0 ml-1 transition-opacity"
                />
              </div>
            )}
          </div>

          {/* Menú de Tres Puntos (Kebab Menu - REGLA 1: Estrictamente solo Añadir subtarea y Eliminar) */}
          <div className="absolute right-2 top-1/2 -translate-y-1/2 z-20">
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (kebabMenu?.nodo.id === nodo.id) {
                  setKebabMenu(null);
                } else {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const spaceBelow = window.innerHeight - rect.bottom;
                  const openUpwards = spaceBelow < 120;
                  setKebabMenu({
                    nodo,
                    top: openUpwards ? undefined : Math.round(rect.bottom + 4),
                    bottom: openUpwards ? Math.round(window.innerHeight - rect.top + 4) : undefined,
                    right: Math.round(window.innerWidth - rect.right),
                  });
                }
              }}
              className={`p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-all cursor-pointer kebab-trigger-button ${
                kebabMenu?.nodo.id === nodo.id
                  ? 'opacity-100 bg-slate-200/80 text-slate-800'
                  : 'opacity-0 group-hover:opacity-100'
              }`}
              title="Más opciones"
            >
              <MoreVertical size={15} />
            </button>
          </div>
        </div>

        {/* Renderizar hijos y botón de creación rápida en línea si está expandido (REGLA 3) */}
        {(isExpanded || inlineAddingPadreId === nodo.id) && (
          <div>
            {hasChildren && nodo.children.map((hijo) => renderRow(hijo))}
            {(isRoot || hasChildren || inlineAddingPadreId === nodo.id) && renderInlineAddRow(nodo)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={gridRef} className="space-y-2">
      {/* Contenedor TreeGrid / TreeTable */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-visible">
        {/* Encabezado de la Tabla Jerárquica (REGLA 1: Eliminada columna Acciones) */}
        <div className="flex items-center bg-gray-50/90 border-b border-gray-200 text-gray-500 font-medium text-xs py-2.5 tracking-wider select-none">
          <div className="px-4 shrink-0" style={{ width: '48%', flex: '0 0 48%' }}>
            Estructura de Desglose del Trabajo
          </div>
          <div className="text-center px-2 shrink-0" style={{ width: '14%', flex: '0 0 14%' }}>
            Tiempo Esperado
          </div>
          <div className="px-3 shrink-0" style={{ width: '20%', flex: '0 0 20%' }}>
            Responsable
          </div>
          <div className="px-3 pr-10 shrink-0" style={{ width: '18%', flex: '0 0 18%' }}>
            Predecesoras
          </div>
        </div>

        {/* Filas Jerárquicas (Excluyendo visualmente el nodo raíz, renderizando a partir del nivel 1 - Fases) */}
        <div className="divide-y divide-slate-100">
          {arbol.map((nodoRaiz) => {
            const isRoot = nodoRaiz.nivel === 0 || nodoRaiz.padre_id === null;
            if (isRoot) {
              const fases = nodoRaiz.children || [];
              return (
                <div key={nodoRaiz.id}>
                  {fases.map((fase) => renderRow(fase))}
                  {renderInlineAddRow(nodoRaiz)}
                </div>
              );
            }
            return renderRow(nodoRaiz);
          })}
        </div>
      </div>

            {/* Menú de Tres Puntos Flotante en Portal (garantiza que NUNCA quede debajo de ninguna fila) */}
      {kebabMenu &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              right: `${kebabMenu.right}px`,
              ...(kebabMenu.bottom !== undefined
                ? { bottom: `${kebabMenu.bottom}px` }
                : { top: `${kebabMenu.top}px` }),
            }}
            className="kebab-menu-container w-40 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-[9999] animate-in fade-in zoom-in-95 duration-100 select-none"
          >
            {/* Opción Añadir subtarea */}
            <button
              onClick={() => {
                const targetNode = kebabMenu.nodo;
                setKebabMenu(null);
                setInlineAddingPadreId(targetNode.id);
                setInlineNombre('');
                setExpandedIds((prev) => new Set([...prev, targetNode.id]));
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 flex items-center gap-2 cursor-pointer"
            >
              <Plus size={13} className="text-emerald-600 shrink-0" />
              <span>
                {kebabMenu.nodo.nivel === 0
                  ? 'Añadir fase'
                  : kebabMenu.nodo.nivel === 1
                  ? 'Añadir paquete'
                  : 'Añadir actividad'}
              </span>
            </button>

            {/* Opción Eliminar: No disponible para el nodo raíz */}
            {kebabMenu.nodo.padre_id !== null && (
              <>
                <div className="border-t border-slate-100 my-1" />
                <button
                  onClick={() => {
                    const targetNode = kebabMenu.nodo;
                    setKebabMenu(null);
                    handleEliminarNodo(targetNode);
                  }}
                  className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 size={13} className="text-red-500" />
                  <span>Eliminar</span>
                </button>
              </>
            )}
          </div>,
          document.body
        )}

      {/* Modal: Crear Subtarea */}
      {modalSubtarea && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 border border-slate-200 space-y-4">
            <h3 className="text-sm font-bold text-slate-800">
              Nueva Subtarea en: {modalSubtarea.padreCodigo} {modalSubtarea.padreNombre}
            </h3>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Nombre de la subtarea *
              </label>
              <input
                type="text"
                value={nuevoNombreSubtarea}
                onChange={(e) => setNuevoNombreSubtarea(e.target.value)}
                placeholder="Ej. Diseño de arquitectura..."
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCrearSubtarea();
                }}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalSubtarea(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={handleCrearSubtarea}
                disabled={!nuevoNombreSubtarea.trim()}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
              >
                Crear Subtarea
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Estimación PERT (REGLA 2) */}
      {modalPert && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Cabecera del modal */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded shrink-0">
                  {modalPert.nodo.codigo}
                </span>
                <h3 className="text-sm font-bold text-slate-800 truncate">
                  Estimación PERT
                </h3>
              </div>
              <button
                onClick={() => setModalPert(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                title="Cerrar"
              >
                <X size={16} />
              </button>
            </div>

            {/* Contenido del modal */}
            <div className="p-5 space-y-4">
              <div className="text-xs text-slate-600">
                Tarea: <span className="text-slate-800 font-semibold">{modalPert.nodo.nombre}</span>
              </div>

              {/* Alerta de error si existe */}
              {errorModalPert && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle size={15} className="shrink-0 text-red-500" />
                  <span>{errorModalPert}</span>
                </div>
              )}

              {/* Estimaciones PERT */}
              <div>
                <div className="grid grid-cols-3 gap-2.5">
                  <div>
                    <span className="block text-[11px] text-slate-500 mb-1 text-center">
                      Optimista (a)
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      placeholder="0"
                      value={modalPert.optimista}
                      onChange={(e) => {
                        setErrorModalPert(null);
                        setModalPert((prev) =>
                          prev ? { ...prev, optimista: e.target.value } : null
                        );
                      }}
                      autoFocus
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg px-2 py-1.5 text-center text-xs outline-none focus:ring-1 focus:ring-blue-500 font-mono transition-colors"
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 mb-1 text-center font-medium">
                      Más Probable (m)
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      placeholder="0"
                      value={modalPert.probable}
                      onChange={(e) => {
                        setErrorModalPert(null);
                        setModalPert((prev) =>
                          prev ? { ...prev, probable: e.target.value } : null
                        );
                      }}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg px-2 py-1.5 text-center text-xs outline-none focus:ring-1 focus:ring-blue-500 font-mono font-semibold text-slate-800 transition-colors"
                    />
                  </div>
                  <div>
                    <span className="block text-[11px] text-slate-500 mb-1 text-center">
                      Pesimista (b)
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      placeholder="0"
                      value={modalPert.pesimista}
                      onChange={(e) => {
                        setErrorModalPert(null);
                        setModalPert((prev) =>
                          prev ? { ...prev, pesimista: e.target.value } : null
                        );
                      }}
                      className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg px-2 py-1.5 text-center text-xs outline-none focus:ring-1 focus:ring-blue-500 font-mono transition-colors"
                    />
                  </div>
                </div>

                {/* Cálculo en vivo de Te */}
                {(() => {
                  const opt = parseFloat(modalPert.optimista);
                  const prob = parseFloat(modalPert.probable);
                  const pes = parseFloat(modalPert.pesimista);
                  if (!isNaN(opt) && !isNaN(prob) && !isNaN(pes)) {
                    if (opt <= prob && prob <= pes) {
                      const teCalc = Math.round(((opt + 4 * prob + pes) / 6) * 100) / 100;
                      return (
                        <div className="mt-3 bg-blue-50/70 border border-blue-100 rounded-lg p-2.5 flex items-center justify-between text-xs text-blue-900">
                          <span>
                            Tiempo esperado:{' '}
                            <strong className="font-bold text-blue-700">{teCalc} días</strong>
                          </span>
                        </div>
                      );
                    } else {
                      return (
                        <div className="mt-3 text-xs text-red-600 font-medium bg-red-50 p-2 rounded-lg border border-red-100">
                          Debe cumplirse: Optimista ≤ Más Probable ≤ Pesimista
                        </div>
                      );
                    }
                  }
                  return null;
                })()}
              </div>
            </div>

            {/* Pie del modal */}
            <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalPert(null)}
                className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 font-medium rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleGuardarModalPert}
                disabled={guardandoModalPert}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
              >
                {guardandoModalPert ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
