import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getEdt, getCpm, getDependencias } from '../../lib/api';
import type { CpmResponse, Dependencia, NodoEdt, CpmResult } from '../../types';
import {
  RefreshCw,
  AlertCircle,
  BarChart3,
  ZoomIn,
  ZoomOut,
  Calendar,
  Clock,
} from 'lucide-react';
import { useResources } from '../../context/ResourceContext';

interface Props {
  proyectoId: number;
  dataVersion?: number;
  isActive?: boolean;
  soloHabiles?: boolean;
  onSoloHabilesChange?: (soloHabiles: boolean) => void;
}

// Elemento para el renderizado de la línea de tiempo
interface GanttRowItem {
  id: string;
  type: 'phase' | 'leaf';
  nodoId: number;
  codigo: string;
  nombre: string;
  nivel: number;
  parentId: number | null;
  parentNombre?: string;
  // Métricas temporales
  es: number;
  ef: number;
  duracion: number;
  fecha_inicio: string;
  fecha_fin: string;
  responsable?: string;
  es_critica?: boolean;
  actividadId?: number;
  holgura_total?: number;
  lf?: number;
  fecha_limite?: string;
}

interface DiaInfo {
  index: number;
  date: Date;
  dateStr: string;
  formattedShort: string; // ej: "05.10"
  diaNumero: number;
  diaNombre: string;
  mesAno: string;
  esFinDeSemana: boolean;
}

interface GrupoSemana {
  semanaKey: string;
  titulo: string;
  diasCount: number;
}

interface HoveredTaskInfo {
  item: GanttRowItem;
  cpm?: CpmResult;
  predecesoras: string[];
  sucesoras: string[];
  x: number;
  y: number;
  isNearTop: boolean;
}

function formatShortDate(str?: string): string {
  if (!str) return '';
  const parts = str.split('-');
  if (parts.length < 3) return str;
  return `${parts[2]}.${parts[1]}`;
}

function formatDateDDMMYYYY(str?: string): string {
  if (!str) return 'No definida';
  const parts = str.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return str;
}

export default function GanttChart({
  proyectoId,
  dataVersion = 0,
  isActive = true,
  soloHabiles: propSoloHabiles,
  onSoloHabilesChange,
}: Props) {
  const { getMiembro } = useResources();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [arbolEdt, setArbolEdt] = useState<NodoEdt[]>([]);
  const [cpmData, setCpmData] = useState<CpmResponse | null>(null);
  const [dependencias, setDependencias] = useState<Dependencia[]>([]);

  const [colWidth, setColWidth] = useState<number>(44);
  const [localSoloHabiles, setLocalSoloHabiles] = useState<boolean>(false);
  const soloHabiles = propSoloHabiles !== undefined ? propSoloHabiles : localSoloHabiles;

  const handleSoloHabilesChange = (val: boolean) => {
    if (onSoloHabilesChange) {
      onSoloHabilesChange(val);
    } else {
      setLocalSoloHabiles(val);
    }
  };

  // Referencia al contenedor con scroll del diagrama de Gantt
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Estado para la tarjeta flotante de detalle en hover
  const [hoveredTask, setHoveredTask] = useState<HoveredTaskInfo | null>(null);

  // Control de sincronización y caché inteligente
  const lastLoadedVersionRef = useRef<number>(-1);
  const prevSoloHabilesRef = useRef<boolean>(soloHabiles);
  const isFirstMountRef = useRef<boolean>(true);

  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [edt, cpm, deps] = await Promise.all([
        getEdt(proyectoId),
        getCpm(proyectoId, soloHabiles),
        getDependencias(proyectoId),
      ]);

      setArbolEdt(edt);
      setCpmData(cpm);
      setDependencias(deps);
      lastLoadedVersionRef.current = dataVersion;
      prevSoloHabilesRef.current = soloHabiles;
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.error ||
          'No se pudo cargar el cronograma. Asegúrate de tener actividades definidas.'
      );
    } finally {
      setLoading(false);
    }
  }, [proyectoId, soloHabiles, dataVersion]);

  // Carga reactiva e inteligente: solo si la vista está activa y los datos cambiaron (o primer acceso)
  useEffect(() => {
    // Si la vista está oculta en su primer montaje, postergamos la carga hasta que el usuario la abra
    if (!isActive && isFirstMountRef.current) {
      return;
    }

    if (isActive) {
      const versionChanged = lastLoadedVersionRef.current !== dataVersion;
      const soloHabilesChanged = prevSoloHabilesRef.current !== soloHabiles;

      if (isFirstMountRef.current || versionChanged || soloHabilesChanged) {
        isFirstMountRef.current = false;
        cargarDatos();
      }
    }
  }, [isActive, dataVersion, soloHabiles, cargarDatos]);

  // Mapa de actividades CPM por ID
  const cpmMap = useMemo(() => {
    const map = new Map<number, CpmResult>();
    cpmData?.actividades.forEach((act) => {
      map.set(act.id, act);
    });
    return map;
  }, [cpmData]);

  // Total de días del cronograma: aseguramos un horizonte mínimo de al menos 30 días
  // para que el calendario tenga amplitud visual aun con una sola actividad pequeña,
  // más un margen futuro de 10 días tras la última fecha.
  const totalDias = useMemo(() => {
    if (!cpmData) return 0;
    const duracionReal = Math.ceil(cpmData.duracion_total || 0);
    return Math.max(30, duracionReal + 10);
  }, [cpmData]);

  // Cálculo recursivo de métricas de una Fase
  const calcularMetricasFase = useCallback(
    (
      nodo: NodoEdt
    ): {
      es: number;
      ef: number;
      duracion: number;
      fecha_inicio: string;
      fecha_fin: string;
    } => {
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

      if (leaves.length === 0) {
        return {
          es: 0,
          ef: 0,
          duracion: 0,
          fecha_inicio: cpmData?.fecha_inicio || '',
          fecha_fin: cpmData?.fecha_inicio || '',
        };
      }

      const minEs = Math.min(...leaves.map((l) => l.es));
      const maxEf = Math.max(...leaves.map((l) => l.ef));

      const sortedByStart = [...leaves]
        .filter((l) => Boolean(l.fecha_inicio))
        .sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
      const sortedByEnd = [...leaves]
        .filter((l) => Boolean(l.fecha_fin))
        .sort((a, b) => a.fecha_fin.localeCompare(b.fecha_fin));

      return {
        es: isFinite(minEs) ? minEs : 0,
        ef: isFinite(maxEf) ? maxEf : 0,
        duracion: isFinite(maxEf) && isFinite(minEs) && maxEf > minEs ? maxEf - minEs : 0,
        fecha_inicio: sortedByStart[0]?.fecha_inicio || cpmData?.fecha_inicio || '',
        fecha_fin: sortedByEnd[sortedByEnd.length - 1]?.fecha_fin || cpmData?.fecha_fin || '',
      };
    },
    [cpmMap, cpmData]
  );

  /**
   * Aplanamiento Jerárquico de Tareas y Fases en orden secuencial EDT
   */
  const filasGantt = useMemo<GanttRowItem[]>(() => {
    if (!arbolEdt.length) return [];
    const items: GanttRowItem[] = [];

    function recorrer(nodo: NodoEdt) {
      const isRoot = nodo.nivel === 0 || nodo.padre_id === null;
      const hasChildren = Boolean(nodo.children && nodo.children.length > 0);
      const isFase = nodo.nivel === 1;

      // Se omiten el nodo raíz y las fases (nivel 1). Se grafican directamente los Paquetes de Trabajo y sus Actividades.
      if (!isRoot && !isFase) {
        if (hasChildren) {
          // PAQUETE DE TRABAJO (Tarea de resumen)
          const metricas = calcularMetricasFase(nodo);
          items.push({
            id: `phase-${nodo.id}`,
            type: 'phase',
            nodoId: nodo.id,
            codigo: nodo.codigo,
            nombre: nodo.nombre,
            nivel: nodo.nivel,
            parentId: nodo.padre_id,
            ...metricas,
          });
        } else {
          // SUBTAREA (Nodo hoja)
          const cpmAct = nodo.actividad ? cpmMap.get(nodo.actividad.id) : undefined;
          const duracion = cpmAct?.duracion ?? (nodo.actividad?.duracion_esperada || 0);
          const esCritica = cpmAct ? (cpmAct.es_critica || cpmAct.holgura_total === 0) : false;

          items.push({
            id: `leaf-${nodo.id}`,
            type: 'leaf',
            nodoId: nodo.id,
            codigo: nodo.codigo,
            nombre: nodo.nombre,
            nivel: nodo.nivel,
            parentId: nodo.padre_id,
            es: cpmAct?.es ?? 0,
            ef: cpmAct?.ef ?? 0,
            duracion,
            fecha_inicio: cpmAct?.fecha_inicio ?? '',
            fecha_fin: cpmAct?.fecha_fin ?? '',
            responsable: nodo.actividad?.responsable,
            es_critica: esCritica,
            actividadId: nodo.actividad?.id,
            holgura_total: cpmAct?.holgura_total ?? 0,
            lf: cpmAct?.lf ?? 0,
            fecha_limite: cpmAct?.fecha_limite ?? '',
          });
        }
      }

      // Procesar recursivamente sus hijos ordenados por EDT
      if (hasChildren) {
        const sortedChildren = [...nodo.children].sort((a, b) =>
          a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' })
        );
        sortedChildren.forEach(recorrer);
      }
    }

    const sortedRoots = [...arbolEdt].sort((a, b) =>
      a.codigo.localeCompare(b.codigo, undefined, { numeric: true, sensitivity: 'base' })
    );
    sortedRoots.forEach(recorrer);
    return items;
  }, [arbolEdt, calcularMetricasFase, cpmMap]);

  // Mapeo actividadId -> Índice de fila vertical para anclaje de dependencias
  const actividadFilaMap = useMemo(() => {
    const map = new Map<number, number>();
    filasGantt.forEach((item, idx) => {
      if (item.actividadId) {
        map.set(item.actividadId, idx);
      }
    });
    return map;
  }, [filasGantt]);

  // Lista de días de la escala temporal
  const diasInfo = useMemo<DiaInfo[]>(() => {
    if (!cpmData?.fecha_inicio || totalDias <= 0) return [];
    const baseDate = new Date(cpmData.fecha_inicio + 'T00:00:00');
    if (isNaN(baseDate.getTime())) return [];

    if (soloHabiles) {
      while (baseDate.getDay() === 0 || baseDate.getDay() === 6) {
        baseDate.setDate(baseDate.getDate() + 1);
      }
    }

    const nombresDias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const nombresMeses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

    const res: DiaInfo[] = [];
    for (let i = 0; i <= totalDias; i++) {
      const d = new Date(baseDate);
      if (soloHabiles) {
        let agregados = 0;
        while (agregados < i) {
          d.setDate(d.getDate() + 1);
          if (d.getDay() !== 0 && d.getDay() !== 6) agregados++;
        }
      } else {
        d.setDate(baseDate.getDate() + i);
      }

      const diaNum = d.getDate();
      const mesNum = d.getMonth();
      const diaSemana = d.getDay();
      const y = d.getFullYear();
      const m = String(mesNum + 1).padStart(2, '0');
      const day = String(diaNum).padStart(2, '0');

      res.push({
        index: i,
        date: d,
        dateStr: `${y}-${m}-${day}`,
        formattedShort: `${day}.${m}`,
        diaNumero: diaNum,
        diaNombre: nombresDias[diaSemana],
        mesAno: `${nombresMeses[mesNum]} ${y}`,
        esFinDeSemana: diaSemana === 0 || diaSemana === 6,
      });
    }
    return res;
  }, [cpmData, totalDias, soloHabiles]);

  // Encabezados de semanas
  const gruposEncabezado = useMemo<GrupoSemana[]>(() => {
    if (!diasInfo.length) return [];
    const grupos: GrupoSemana[] = [];
    let grupoActual: GrupoSemana | null = null;

    diasInfo.forEach((dia, idx) => {
      const esNuevoGrupo = idx === 0 || (!soloHabiles && dia.diaNombre === 'Lun') || (soloHabiles && idx % 5 === 0);
      if (esNuevoGrupo || !grupoActual) {
        if (grupoActual) grupos.push(grupoActual);
        grupoActual = {
          semanaKey: `${dia.dateStr}-${idx}`,
          titulo: `${dia.diaNumero} ${dia.mesAno}`,
          diasCount: 1,
        };
      } else {
        grupoActual.diasCount++;
      }
    });

    if (grupoActual) grupos.push(grupoActual);
    return grupos;
  }, [diasInfo, soloHabiles]);

  const rowHeight = 44;
  const headerHeightTop = 26;
  const headerHeightBottom = 30;
  const headerTotalHeight = headerHeightTop + headerHeightBottom;

  // Manejador del Hover para mostrar detalle de tarea
  const handleTaskMouseEnter = (e: React.MouseEvent<HTMLElement>, item: GanttRowItem) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const cpm = item.actividadId ? cpmMap.get(item.actividadId) : undefined;

    // Buscar nombres/códigos de predecesoras
    const preds = item.actividadId
      ? dependencias
          .filter((d) => d.sucesora_id === item.actividadId)
          .map((d) => d.predecesora_codigo || `Act ${d.predecesora_id}`)
      : [];

    // Buscar nombres/códigos de sucesoras
    const sucs = item.actividadId
      ? dependencias
          .filter((d) => d.predecesora_id === item.actividadId)
          .map((d) => d.sucesora_codigo || `Act ${d.sucesora_id}`)
      : [];

    const isNearTop = rect.top < 270;
    const y = isNearTop ? rect.bottom : rect.top;

    // Delimitar X dentro de la ventana visible del Gantt
    const containerRect = scrollContainerRef.current?.getBoundingClientRect();
    const leftBound = containerRect ? containerRect.left : 0;
    const rightBound = containerRect ? containerRect.right : window.innerWidth;
    const tooltipHalfWidth = 165; // Tarjeta w-80 (320px) -> mitad 160px + margen de seguridad

    const minX = leftBound + tooltipHalfWidth;
    const maxX = Math.max(minX, rightBound - tooltipHalfWidth);
    const preferredX = rect.left + rect.width / 2;
    const x = Math.max(minX, Math.min(maxX, preferredX));

    setHoveredTask({
      item,
      cpm,
      predecesoras: preds,
      sucesoras: sucs,
      x,
      y,
      isNearTop,
    });
  };

  const handleTaskMouseLeave = () => {
    setHoveredTask(null);
  };

  /**
   * Conectores SVG Ortogonales (Ángulos Rectos de 90 Grados)
   * REGLA 3: Conexiones neutras unificadas en gris slate-400
   */
  const conectoresOrtogonales = useMemo(() => {
    if (!dependencias.length || !filasGantt.length) return [];
    const elbow = 12;

    return dependencias
      .map((dep) => {
        const predFilaIdx = actividadFilaMap.get(dep.predecesora_id);
        const sucFilaIdx = actividadFilaMap.get(dep.sucesora_id);
        if (predFilaIdx === undefined || sucFilaIdx === undefined) return null;

        const predItem = filasGantt[predFilaIdx];
        const sucItem = filasGantt[sucFilaIdx];
        if (!predItem || !sucItem) return null;

        // Borde derecho de la predecesora
        const x1 = Math.round(predItem.ef * colWidth);
        const y1 = Math.round(predFilaIdx * rowHeight + rowHeight / 2);

        // Borde izquierdo de la sucesora
        const x2 = Math.round(sucItem.es * colWidth);
        const y2 = Math.round(sucFilaIdx * rowHeight + rowHeight / 2);

        const deltaX = x2 - x1;
        let d = '';

        if (deltaX >= elbow * 2) {
          // Trazo regular hacia adelante
          const midX = Math.round(x1 + deltaX / 2);
          d = `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`;
        } else {
          // Trazo con lazo ortogonal si la sucesora empieza antes o muy cerca
          const midY = Math.round(y1 + (y2 > y1 ? 1 : -1) * (rowHeight / 2));
          d = `M ${x1} ${y1} H ${x1 + elbow} V ${midY} H ${x2 - elbow} V ${y2} H ${x2}`;
        }

        return { id: dep.id, d };
      })
      .filter((c): c is { id: number; d: string } => c !== null);
  }, [dependencias, filasGantt, actividadFilaMap, colWidth, rowHeight]);

  if (loading && !cpmData) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-500">
        <RefreshCw className="animate-spin mb-2" size={32} />
        <p>Cargando Diagrama de Gantt...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-xl flex items-start gap-3 max-w-lg">
          <AlertCircle className="mt-0.5 text-amber-600 shrink-0" size={20} />
          <div>
            <h4 className="font-semibold text-base mb-1">Aviso</h4>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!cpmData || !cpmData.actividades || cpmData.actividades.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-xs max-w-lg w-full">
          <BarChart3 size={52} className="mx-auto mb-3 text-slate-300" />
          <h3 className="text-base font-semibold text-slate-700">Sin cronograma disponible</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
            Para ver el Diagrama de Gantt con ruta crítica y dependencias, ingresa a la pestaña{' '}
            <strong className="text-slate-700 font-semibold">"Plan de Trabajo"</strong> y define las duraciones de las subtareas hoja.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full flex-1 min-h-0 overflow-hidden gap-3">
      {/* Barra de Controles y Filtros Superior (Altura Estática) */}
      <div className="shrink-0 bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4 shadow-2xs">

        {/* Leyenda de Colores (Rojo = Crítica, Azul = No Crítica, Ámbar = Holgura Total) */}
        <div className="flex items-center gap-3.5 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium flex-wrap">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-red-500 shrink-0 shadow-2xs" />
            <span className="font-semibold text-red-700">Ruta Crítica</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-blue-600 shrink-0 shadow-2xs" />
            <span className="font-semibold text-blue-700">No Crítica</span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <span className="w-4 h-2.5 rounded-xs bg-blue-500/15 border-y border-dashed border-blue-400/50 flex items-center justify-end">
              <span className="w-1 h-2 bg-blue-400/70 rounded-r-2xs" />
            </span>
            <span className="font-semibold text-slate-600">Holgura Total</span>
          </div>
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3">
            <span className="w-3.5 h-1.5 rounded-xs bg-slate-900 shrink-0 shadow-2xs" />
            <span className="font-semibold text-slate-800">Paquete de Trabajo</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Selector de modo calendario */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => handleSoloHabilesChange(false)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                !soloHabiles ? 'bg-white text-blue-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar size={13} />
              <span>Lun a Dom</span>
            </button>
            <button
              onClick={() => handleSoloHabilesChange(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                soloHabiles ? 'bg-white text-blue-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Días Hábiles</span>
            </button>
          </div>

          {/* Zoom */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setColWidth((prev) => Math.max(30, prev - 6))}
              className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
              title="Reducir zoom"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-xs font-mono font-medium px-2 text-slate-600">{colWidth}px</span>
            <button
              onClick={() => setColWidth((prev) => Math.min(72, prev + 6))}
              className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
              title="Aumentar zoom"
            >
              <ZoomIn size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* Envoltorio directo del Diagrama de Gantt (flex: 1, min-height: 0) */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col">
        {/* Contenedor del Diagrama con Scroll Interno Exclusivo (overflow: auto) */}
        <div
          ref={scrollContainerRef}
          onScroll={() => {
            if (hoveredTask) setHoveredTask(null);
          }}
          className="flex-1 min-h-0 overflow-auto relative select-none w-full h-full"
        >
          <div style={{ width: `${Math.max(900, diasInfo.length * colWidth + 80)}px` }} className="relative min-h-full">
            {/* Fila superior de encabezados: sticky top-0, z-30 */}
            <div
              className="sticky top-0 z-30 bg-white flex border-b border-slate-300 shadow-xs select-none"
              style={{ height: `${headerTotalHeight}px` }}
            >
              {/* Encabezado del Calendario (Semanas y Días) */}
              <div className="flex flex-col flex-1 overflow-hidden">
                {/* Fila 1: Semanas / Meses */}
                <div className="bg-slate-100 border-b border-slate-200 flex" style={{ height: `${headerHeightTop}px` }}>
                  {gruposEncabezado.map((grupo) => (
                    <div
                      key={grupo.semanaKey}
                      className="border-r border-slate-200 px-2 flex items-center text-[10px] font-semibold text-slate-700 shrink-0 truncate bg-slate-100"
                      style={{ width: `${grupo.diasCount * colWidth}px` }}
                    >
                      <span className="truncate font-mono text-[10px]">{grupo.titulo}</span>
                    </div>
                  ))}
                </div>

                {/* Fila 2: Días */}
                <div className="bg-slate-50 flex text-center" style={{ height: `${headerHeightBottom}px` }}>
                  {diasInfo.map((dia) => (
                    <div
                      key={dia.index}
                      className={`border-r border-slate-200/80 flex flex-col justify-center text-[9px] shrink-0 ${
                        dia.esFinDeSemana
                          ? 'bg-slate-200 text-slate-500 font-normal'
                          : 'bg-slate-50 text-slate-700 font-medium'
                      }`}
                      style={{ width: `${colWidth}px` }}
                    >
                      <span className="text-[8px] uppercase leading-none opacity-80 font-mono">{dia.diaNombre}</span>
                      <span className="font-mono text-[10px] leading-tight font-semibold text-slate-800">
                        {dia.diaNumero}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Área de Filas del Diagrama */}
            <div className="relative divide-y divide-slate-100">
              {/* Cuadrícula de Fondo con Sombreado de Fines de Semana en la Línea de Tiempo */}
              <div className="absolute inset-0 flex pointer-events-none z-0">
                {diasInfo.map((dia) => (
                  <div
                    key={dia.index}
                    className={`border-r border-slate-200/60 shrink-0 ${
                      dia.esFinDeSemana ? 'bg-slate-100/70 border-r-slate-200/80' : ''
                    }`}
                    style={{ width: `${colWidth}px` }}
                  />
                ))}
              </div>

              {/* Conectores Ortogonales SVG */}
              <svg
                className="absolute inset-0 pointer-events-none z-1"
                style={{
                  width: `${diasInfo.length * colWidth}px`,
                  height: `${filasGantt.length * rowHeight}px`,
                }}
              >
                <defs>
                  <marker
                    id="arrow-neutral"
                    viewBox="0 0 10 10"
                    refX="7"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="M 0 1.5 L 7 5 L 0 8.5 z" fill="#94a3b8" />
                  </marker>
                </defs>

                {conectoresOrtogonales.map((conn) => (
                  <path
                    key={`dep-${conn.id}`}
                    d={conn.d}
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth={1.5}
                    strokeOpacity={0.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    markerEnd="url(#arrow-neutral)"
                  />
                ))}
              </svg>

              {/* Filas del Diagrama de Gantt */}
              {filasGantt.map((item) => {
                const isPhase = item.type === 'phase';
                const barLeft = Math.round(item.es * colWidth);
                const barWidth = Math.max(16, Math.round((item.ef - item.es) * colWidth));
                const isCritical = Boolean(item.es_critica);

                const barBgClass = isCritical
                  ? 'bg-red-500 hover:bg-red-600 shadow-red-200/50'
                  : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200/50';

                return (
                  <div
                    key={item.id}
                    className="relative hover:bg-slate-50/50 transition-colors flex items-center shrink-0"
                    style={{ height: `${rowHeight}px`, width: `${diasInfo.length * colWidth + 80}px` }}
                  >
                    {/* Paquetes de Trabajo: Corchete Negro Sólido */}
                    {isPhase ? (
                        <div
                          onMouseEnter={(e) => handleTaskMouseEnter(e, item)}
                          onMouseLeave={handleTaskMouseLeave}
                          className="absolute cursor-pointer group/phase z-2"
                          style={{
                            left: `${barLeft}px`,
                            top: '12px',
                            width: `${Math.max(28, barWidth)}px`,
                          }}
                        >
                          {/* Nombre del paquete y días sobre el corchete */}
                          <div className="text-[10px] text-slate-700 font-medium whitespace-nowrap mb-1 leading-none select-none flex items-center gap-1.5">
                            <span className="font-bold text-slate-900 font-mono">
                              {item.codigo}
                            </span>
                            <span className="font-semibold text-slate-800">
                              {item.nombre}
                            </span>
                            {item.duracion > 0 && (
                              <span className="text-slate-600 font-mono font-bold text-[10px]">
                                ({item.duracion}d)
                              </span>
                            )}
                          </div>

                          {/* Corchete Sólido Negro (7px) con patas */}
                          <div
                            className="relative rounded-xs transition-colors shadow-xs bg-slate-900 group-hover/phase:bg-black"
                            style={{
                              width: `${Math.max(28, barWidth)}px`,
                              height: '7px',
                            }}
                          >
                            <div className="absolute left-0 top-0 w-1 h-3.5 rounded-b-xs bg-slate-900 group-hover/phase:bg-black" />
                            <div className="absolute right-0 top-0 w-1 h-3.5 rounded-b-xs bg-slate-900 group-hover/phase:bg-black" />
                          </div>
                        </div>
                      ) : (
                        /* Actividades: Barra Ejecutable limpia con holgura */
                        (() => {
                          const holgura = item.holgura_total ?? 0;
                          const slackWidth = holgura > 0 ? Math.round(holgura * colWidth) : 0;
                          const hasSlack = slackWidth > 0;

                          return (
                            <div
                              className="flex items-center absolute z-2"
                              style={{
                                left: `${barLeft}px`,
                                top: '8px',
                              }}
                            >
                              {/* Barra de la Tarea (limpia con código y días en una sola línea) */}
                              <div
                                onMouseEnter={(e) => handleTaskMouseEnter(e, item)}
                                onMouseLeave={handleTaskMouseLeave}
                                className={`h-7 shadow-xs flex items-center justify-center px-1.5 text-[10px] font-mono font-bold text-white transition-all cursor-pointer whitespace-nowrap overflow-hidden select-none ${barBgClass} hover:brightness-105 hover:ring-2 hover:ring-offset-1 ${
                                  isCritical ? 'hover:ring-red-400' : 'hover:ring-blue-400'
                                } ${
                                  hasSlack ? 'rounded-l-md rounded-r-none border-r border-black/15' : 'rounded-md'
                                }`}
                                style={{ width: `${barWidth}px` }}
                              >
                                <span className="whitespace-nowrap truncate leading-none">
                                  {barWidth >= 48 ? `${item.codigo} (${item.duracion}d)` : `${item.duracion}d`}
                                </span>
                              </div>

                              {/* Barra de Holgura Total */}
                              {hasSlack && (
                                <div
                                  onMouseEnter={(e) => handleTaskMouseEnter(e, item)}
                                  onMouseLeave={handleTaskMouseLeave}
                                  className="h-7 flex items-center relative cursor-pointer group/slack"
                                  style={{ width: `${slackWidth}px` }}
                                  title={`Fecha límite: ${formatDateDDMMYYYY(item.fecha_limite)}`}
                                >
                                  <div className="w-full h-full bg-blue-500/10 hover:bg-blue-500/20 border-y border-dashed border-blue-400/40 transition-colors flex items-center justify-center relative overflow-hidden">
                                    <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-b border-dotted border-blue-400/35 pointer-events-none" />
                                    {slackWidth >= 30 && (
                                      <span className="relative z-1 text-[9px] font-mono font-medium text-blue-700/80 bg-white/75 px-1 rounded shadow-2xs select-none">
                                        +{holgura}d
                                      </span>
                                    )}
                                  </div>
                                  <div
                                    className="w-1 h-5 bg-blue-400/70 hover:bg-blue-500 rounded-r-xs shrink-0 shadow-2xs transition-colors z-2"
                                    title={`Fecha límite sin retrasar el proyecto: ${formatDateDDMMYYYY(item.fecha_limite)}`}
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })()
                      )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Tarjeta Flotante con Detalles de la Tarea al pasar el Cursor */}
      {hoveredTask && (
        <div
          className="fixed z-50 w-80 bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-2xl p-4 pointer-events-none transition-all duration-150 animate-in fade-in zoom-in-95 text-slate-800"
          style={{
            top: `${hoveredTask.y}px`,
            left: `${hoveredTask.x}px`,
            transform: hoveredTask.isNearTop
              ? 'translate(-50%, 12px)'
              : 'translate(-50%, -100%) translateY(-12px)',
          }}
        >
          {/* Cabecera con Código EDT y Estado Crítico */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="font-mono text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {hoveredTask.item.codigo || 'EDT'}
            </span>
            {hoveredTask.item.type === 'phase' ? (
              <span className="text-[10px] font-semibold px-2.5 py-0.5 rounded-full border bg-slate-100 text-slate-900 border-slate-300">
                Paquete de Trabajo
              </span>
            ) : hoveredTask.item.es_critica ? (
              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2.5 py-0.5 rounded-full border border-red-200 flex items-center gap-1.5 shadow-2xs">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                Actividad Crítica
              </span>
            ) : (
              <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200">
                Actividad (+<span className="font-mono">{hoveredTask.cpm?.holgura_total ?? 0}d</span>)
              </span>
            )}
          </div>

          {/* Nombre completo de la tarea */}
          <h4 className="text-xs font-bold text-slate-900 leading-snug mb-3">
            {hoveredTask.item.nombre}
          </h4>

          {/* Fechas y Duración */}
          <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 mb-2.5 text-[11px]">
            <div>
              <span className="text-slate-400 text-[10px] block font-medium">Fecha de Inicio</span>
              <span className="font-semibold text-slate-700 font-mono text-[11px]">
                {formatDateDDMMYYYY(hoveredTask.item.fecha_inicio)}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                Día {Math.floor(hoveredTask.item.es) + 1}
              </span>
            </div>
            <div>
              <span className="text-slate-400 text-[10px] block font-medium">Fecha de Fin</span>
              <span className="font-semibold text-slate-700 font-mono text-[11px]">
                {formatDateDDMMYYYY(hoveredTask.item.fecha_fin)}
              </span>
              <span className="text-[10px] text-slate-400 block font-mono">
                Día {hoveredTask.item.duracion > 0
                  ? Math.max(Math.floor(hoveredTask.item.es) + 1, Math.ceil(hoveredTask.item.ef))
                  : Math.floor(hoveredTask.item.es) + 1}
              </span>
            </div>
            <div className="col-span-2 pt-1.5 border-t border-slate-200/70 flex items-center justify-between text-slate-600">
              <span className="text-[10px] font-medium">Duración Total:</span>
              <span className="font-bold text-slate-800 text-[11px] font-mono">
                {hoveredTask.item.duracion}d ({soloHabiles ? 'hábiles' : 'calendario'})
              </span>
            </div>

            {/* Detalle de Holgura Total y Fecha Límite */}
            {hoveredTask.item.type === 'leaf' && hoveredTask.cpm && (hoveredTask.cpm.holgura_total ?? 0) > 0 && (
              <div className="col-span-2 pt-2 mt-1 border-t border-slate-200/70 bg-blue-50/40 -mx-2.5 -mb-2.5 p-2.5 rounded-b-xl flex flex-col gap-1 text-[11px]">
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>Fecha límite sin retrasar el proyecto:</span>
                  <span className="font-bold font-mono text-slate-800">
                    {formatDateDDMMYYYY(hoveredTask.cpm.fecha_limite || hoveredTask.item.fecha_limite)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Responsable asignado */}
          {hoveredTask.item.responsable && (() => {
            const m = getMiembro(hoveredTask.item.responsable);
            return (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                {m ? (
                  <>
                    <img
                      src={m.avatar}
                      alt={m.nombre}
                      className="w-7 h-7 rounded-full bg-slate-100 ring-1 ring-slate-200 object-cover"
                    />
                    <div className="min-w-0">
                      <span className="text-xs font-semibold text-slate-800 block leading-tight truncate">
                        {m.nombre}
                      </span>
                      <span className="text-[10px] text-slate-400 block leading-tight truncate">
                        {m.rol}
                      </span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-1.5 text-xs text-slate-600">
                    <div className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 font-bold text-[10px] flex items-center justify-center">
                      {hoveredTask.item.responsable.charAt(0).toUpperCase()}
                    </div>
                    <span>{hoveredTask.item.responsable}</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Dependencias (Predecesoras / Sucesoras) */}
          {(hoveredTask.predecesoras.length > 0 || hoveredTask.sucesoras.length > 0) && (
            <div className="mt-2 pt-2 border-t border-slate-100 space-y-1 text-[10px]">
              {hoveredTask.predecesoras.length > 0 && (
                <div className="flex items-start gap-1.5">
                  <span className="text-slate-400 font-medium shrink-0">Predecesoras:</span>
                  <span className="text-slate-700 font-mono font-semibold truncate">
                    {hoveredTask.predecesoras.join(', ')}
                  </span>
                </div>
              )}
              {hoveredTask.sucesoras.length > 0 && (
                <div className="flex items-start gap-1.5">
                  <span className="text-slate-400 font-medium shrink-0">Sucesoras:</span>
                  <span className="text-slate-700 font-mono font-semibold truncate">
                    {hoveredTask.sucesoras.join(', ')}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
