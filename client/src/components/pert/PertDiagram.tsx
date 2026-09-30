import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Workflow,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Search,
  X,
  AlertCircle,
  Calendar,
  Clock,
  Flag,
  Play,
  CheckCircle2,
  Layers,
  Info,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import type { CpmResponse, CpmResult, Actividad, Dependencia } from '../../types';
import { getCpm, getActividades, getDependencias } from '../../lib/api';
import { useResources } from '../../context/ResourceContext';

interface Props {
  proyectoId: number;
  dataVersion?: number;
  isActive?: boolean;
  soloHabiles?: boolean;
  onSoloHabilesChange?: (soloHabiles: boolean) => void;
}

interface PertGraphNode {
  id: number;
  actividadId?: number;
  isMilestone?: 'start' | 'end';
  codigo: string;
  nombre: string;
  duracion: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  holgura_total: number;
  holgura_libre: number;
  es_critica: boolean;
  fecha_inicio?: string;
  fecha_fin?: string;
  fecha_limite?: string;
  responsable?: string;
  actividadData?: Actividad;
  // Posiciones calculadas para el lienzo
  rank: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PertGraphEdge {
  id: string;
  fromId: number;
  toId: number;
  isCritical: boolean;
  d: string;
  arrowX: number;
  arrowY: number;
}

function formatDate(str?: string): string {
  if (!str) return 'No definida';
  const parts = str.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return str;
}

export default function PertDiagram({
  proyectoId,
  dataVersion = 0,
  isActive = true,
  soloHabiles: propSoloHabiles,
  onSoloHabilesChange,
}: Props) {
  const { getMiembro } = useResources();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cpmData, setCpmData] = useState<CpmResponse | null>(null);
  const [actividades, setActividades] = useState<Actividad[]>([]);
  const [dependencias, setDependencias] = useState<Dependencia[]>([]);

  const [localSoloHabiles, setLocalSoloHabiles] = useState<boolean>(false);
  const soloHabiles = propSoloHabiles !== undefined ? propSoloHabiles : localSoloHabiles;

  const handleSoloHabilesChange = (val: boolean) => {
    if (onSoloHabilesChange) {
      onSoloHabilesChange(val);
    } else {
      setLocalSoloHabiles(val);
    }
  };

  // Zoom y Paneo
  const [zoom, setZoom] = useState<number>(0.9);
  const [searchTerm, setSearchTerm] = useState('');
  const [soloRutaCritica, setSoloRutaCritica] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  // Cargar datos de CPM, Actividades y Dependencias
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cpm, acts, deps] = await Promise.all([
        getCpm(proyectoId, soloHabiles),
        getActividades(proyectoId).catch(() => []),
        getDependencias(proyectoId).catch(() => []),
      ]);

      setCpmData(cpm);
      setActividades(acts);
      setDependencias(deps);
    } catch (err: any) {
      console.error('Error cargando diagrama PERT:', err);
      setError(
        err.response?.data?.error ||
          'No se pudo generar la red PERT. Asegúrate de tener actividades y duraciones configuradas.'
      );
    } finally {
      setLoading(false);
    }
  }, [proyectoId, soloHabiles]);

  useEffect(() => {
    if (isActive) {
      cargarDatos();
    }
  }, [cargarDatos, dataVersion, isActive, soloHabiles]);

  // Mapa rápido de actividad por ID
  const actividadesMap = useMemo(() => {
    const map = new Map<number, Actividad>();
    actividades.forEach((a) => map.set(a.id, a));
    return map;
  }, [actividades]);

  // Algoritmo de diseño de grafo PERT (AON - Activity On Node)
  const { nodes, edges, canvasWidth, canvasHeight, ranksList } = useMemo(() => {
    if (!cpmData || !cpmData.actividades || cpmData.actividades.length === 0) {
      return { nodes: [], edges: [], canvasWidth: 800, canvasHeight: 600, ranksList: [] };
    }

    const cpmActs = cpmData.actividades;
    const actIds = new Set(cpmActs.map((a) => a.id));

    // Filtrar dependencias válidas
    const validDeps = dependencias.filter(
      (d) => actIds.has(d.predecesora_id) && actIds.has(d.sucesora_id)
    );

    // Listas de adyacencia
    const incoming = new Map<number, number[]>();
    const outgoing = new Map<number, number[]>();
    actIds.forEach((id) => {
      incoming.set(id, []);
      outgoing.set(id, []);
    });

    validDeps.forEach((d) => {
      outgoing.get(d.predecesora_id)?.push(d.sucesora_id);
      incoming.get(d.sucesora_id)?.push(d.predecesora_id);
    });

    // 1. Calcular Rango Topológico (Columna de izquierda a derecha)
    const ranks = new Map<number, number>();

    // Inicializar nodos sin predecesoras en rango 1
    actIds.forEach((id) => {
      if ((incoming.get(id) || []).length === 0) {
        ranks.set(id, 1);
      }
    });

    // Relajación de rangos basada en dependencias (DAG)
    let changed = true;
    let iterations = 0;
    const maxIterations = actIds.size + 2;

    while (changed && iterations < maxIterations) {
      changed = false;
      iterations++;

      validDeps.forEach((d) => {
        const predRank = ranks.get(d.predecesora_id) || 1;
        const currentSuccRank = ranks.get(d.sucesora_id) || 1;
        if (predRank + 1 > currentSuccRank) {
          ranks.set(d.sucesora_id, predRank + 1);
          changed = true;
        }
      });
    }

    // Identificar el rango máximo entre actividades
    let maxActRank = 1;
    ranks.forEach((r) => {
      if (r > maxActRank) maxActRank = r;
    });

    // 2. Construir nodos gráficos incluyendo Hitos INICIO y FIN
    const START_NODE_ID = -1;
    const END_NODE_ID = -2;

    const startNode: PertGraphNode = {
      id: START_NODE_ID,
      isMilestone: 'start',
      codigo: 'INICIO',
      nombre: 'Hito de Inicio del Proyecto',
      duracion: 0,
      es: 0,
      ef: 0,
      ls: 0,
      lf: 0,
      holgura_total: 0,
      holgura_libre: 0,
      es_critica: true,
      fecha_inicio: cpmData.fecha_inicio,
      fecha_fin: cpmData.fecha_inicio,
      rank: 0,
      x: 0,
      y: 0,
      width: 156,
      height: 82,
    };

    const endNode: PertGraphNode = {
      id: END_NODE_ID,
      isMilestone: 'end',
      codigo: 'FIN',
      nombre: 'Hito de Fin del Proyecto',
      duracion: cpmData.duracion_total,
      es: cpmData.duracion_total,
      ef: cpmData.duracion_total,
      ls: cpmData.duracion_total,
      lf: cpmData.duracion_total,
      holgura_total: 0,
      holgura_libre: 0,
      es_critica: true,
      fecha_inicio: cpmData.fecha_fin,
      fecha_fin: cpmData.fecha_fin,
      rank: maxActRank + 1,
      x: 0,
      y: 0,
      width: 156,
      height: 82,
    };

    // Agrupar actividades por columna/rango
    const nodesByRank = new Map<number, PertGraphNode[]>();
    for (let r = 0; r <= maxActRank + 1; r++) {
      nodesByRank.set(r, []);
    }

    nodesByRank.get(0)?.push(startNode);
    nodesByRank.get(maxActRank + 1)?.push(endNode);

    cpmActs.forEach((act) => {
      const rank = ranks.get(act.id) || 1;
      const actObj: PertGraphNode = {
        id: act.id,
        actividadId: act.id,
        codigo: act.codigo_edt || `ACT-${act.id}`,
        nombre: act.nombre,
        duracion: act.duracion,
        es: act.es,
        ef: act.ef,
        ls: act.ls,
        lf: act.lf,
        holgura_total: act.holgura_total,
        holgura_libre: act.holgura_libre,
        es_critica: act.es_critica,
        fecha_inicio: act.fecha_inicio,
        fecha_fin: act.fecha_fin,
        fecha_limite: act.fecha_limite,
        responsable: act.responsable,
        actividadData: actividadesMap.get(act.id),
        rank,
        x: 0,
        y: 0,
        width: 240,
        height: 126,
      };
      nodesByRank.get(rank)?.push(actObj);
    });

    // 3. Dimensiones de la cuadrícula y coordenadas (X, Y)
    const cardWidth = 240;
    const colSpacing = 90;
    const cardHeight = 126;
    const rowSpacing = 42;
    const startX = 64;
    const startY = 96;

    // Calcular la altura máxima necesaria en base al rango con más nodos
    let maxNodesInColumn = 1;
    nodesByRank.forEach((list) => {
      if (list.length > maxNodesInColumn) maxNodesInColumn = list.length;
    });

    const totalColumnHeight = maxNodesInColumn * (cardHeight + rowSpacing);

    // Asignar coordenadas X e Y centrando verticalmente cada columna
    const positionedNodes: PertGraphNode[] = [];
    const nodeMap = new Map<number, PertGraphNode>();

    nodesByRank.forEach((list, rank) => {
      const isStartCol = rank === 0;
      const isEndCol = rank === maxActRank + 1;
      const actualWidth = isStartCol || isEndCol ? 156 : cardWidth;
      const x = startX + rank * (cardWidth + colSpacing);

      // Centrado vertical
      const colItemsHeight = list.length * (cardHeight + rowSpacing);
      const verticalOffset = Math.max(0, (totalColumnHeight - colItemsHeight) / 2);

      // Ordenar nodos dentro de la columna
      list.sort((a, b) => a.codigo.localeCompare(b.codigo, undefined, { numeric: true }));

      list.forEach((n, idx) => {
        const y = startY + verticalOffset + idx * (cardHeight + rowSpacing);
        n.x = x;
        n.y = isStartCol || isEndCol ? y + (cardHeight - n.height) / 2 : y;
        n.width = actualWidth;
        positionedNodes.push(n);
        nodeMap.set(n.id, n);
      });
    });

    // 4. Crear aristas con curvas Bézier y conexiones a Hitos Inicio y Fin
    const graphEdges: PertGraphEdge[] = [];

    // Dependencias internas entre actividades
    validDeps.forEach((dep) => {
      const fromNode = nodeMap.get(dep.predecesora_id);
      const toNode = nodeMap.get(dep.sucesora_id);
      if (!fromNode || !toNode) return;

      const x1 = fromNode.x + fromNode.width;
      const y1 = fromNode.y + fromNode.height / 2;
      const x2 = toNode.x;
      const y2 = toNode.y + toNode.height / 2;

      const dx = Math.max(35, (x2 - x1) * 0.45);
      const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
      const isCritical = Boolean(fromNode.es_critica && toNode.es_critica);

      graphEdges.push({
        id: `dep-${dep.id}-${fromNode.id}-${toNode.id}`,
        fromId: fromNode.id,
        toId: toNode.id,
        isCritical,
        d,
        arrowX: x2,
        arrowY: y2,
      });
    });

    // Conectar INICIO a actividades sin predecesoras
    cpmActs.forEach((act) => {
      const inc = incoming.get(act.id) || [];
      if (inc.length === 0) {
        const fromNode = startNode;
        const toNode = nodeMap.get(act.id);
        if (fromNode && toNode) {
          const x1 = fromNode.x + fromNode.width;
          const y1 = fromNode.y + fromNode.height / 2;
          const x2 = toNode.x;
          const y2 = toNode.y + toNode.height / 2;

          const dx = Math.max(35, (x2 - x1) * 0.45);
          const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

          graphEdges.push({
            id: `start-to-${act.id}`,
            fromId: START_NODE_ID,
            toId: act.id,
            isCritical: Boolean(toNode.es_critica),
            d,
            arrowX: x2,
            arrowY: y2,
          });
        }
      }
    });

    // Conectar actividades sin sucesoras a FIN
    cpmActs.forEach((act) => {
      const out = outgoing.get(act.id) || [];
      if (out.length === 0) {
        const fromNode = nodeMap.get(act.id);
        const toNode = endNode;
        if (fromNode && toNode) {
          const x1 = fromNode.x + fromNode.width;
          const y1 = fromNode.y + fromNode.height / 2;
          const x2 = toNode.x;
          const y2 = toNode.y + toNode.height / 2;

          const dx = Math.max(35, (x2 - x1) * 0.45);
          const d = `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;

          graphEdges.push({
            id: `${act.id}-to-end`,
            fromId: act.id,
            toId: END_NODE_ID,
            isCritical: Boolean(fromNode.es_critica),
            d,
            arrowX: x2,
            arrowY: y2,
          });
        }
      }
    });

    const calculatedWidth = startX + (maxActRank + 2) * (cardWidth + colSpacing) + 120;
    const calculatedHeight = Math.max(720, totalColumnHeight + startY * 2);

    const ranksArray = Array.from({ length: maxActRank + 2 }, (_, i) => ({
      rank: i,
      x: startX + i * (cardWidth + colSpacing),
      label: i === 0 ? 'Hito Inicial' : i === maxActRank + 1 ? 'Hito Final' : `Nivel ${i}`,
    }));

    return {
      nodes: positionedNodes,
      edges: graphEdges,
      canvasWidth: calculatedWidth,
      canvasHeight: calculatedHeight,
      ranksList: ranksArray,
    };
  }, [cpmData, dependencias, actividadesMap]);

  // Manejo de zoom
  const handleZoomIn = () => setZoom((z) => Math.min(1.6, Number((z + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.35, Number((z - 0.15).toFixed(2))));
  const handleZoomReset = () => {
    setZoom(1);
    if (canvasRef.current) {
      canvasRef.current.scrollLeft = 0;
      canvasRef.current.scrollTop = 0;
    }
  };

  const handleFitToScreen = () => {
    if (!canvasRef.current || !contentRef.current) return;
    const canvas = canvasRef.current;
    const availableWidth = canvas.clientWidth - 48;
    const availableHeight = canvas.clientHeight - 48;

    if (canvasWidth > 0 && canvasHeight > 0) {
      const scaleX = availableWidth / canvasWidth;
      const scaleY = availableHeight / canvasHeight;
      const bestScale = Math.min(1.1, Math.max(0.35, Math.min(scaleX, scaleY)));
      setZoom(Number(bestScale.toFixed(2)));
      setTimeout(() => {
        if (canvasRef.current) {
          canvasRef.current.scrollLeft = 0;
          canvasRef.current.scrollTop = 0;
        }
      }, 50);
    }
  };

  // Centrar inicialmente al cargar
  useEffect(() => {
    if (!loading && nodes.length > 0 && canvasRef.current) {
      setTimeout(() => {
        handleFitToScreen();
      }, 100);
    }
  }, [loading, nodes.length]);

  // Manejo de paneo con arrastre de ratón
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, a, .pert-node-card')) return;
    setIsPanning(true);
    if (canvasRef.current) {
      panStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        scrollLeft: canvasRef.current.scrollLeft,
        scrollTop: canvasRef.current.scrollTop,
      };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPanning || !canvasRef.current) return;
    const dx = e.clientX - panStartRef.current.x;
    const dy = e.clientY - panStartRef.current.y;
    canvasRef.current.scrollLeft = panStartRef.current.scrollLeft - dx;
    canvasRef.current.scrollTop = panStartRef.current.scrollTop - dy;
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Coincidencias de búsqueda
  const matchingNodeIds = useMemo(() => {
    if (!searchTerm.trim()) return new Set<number>();
    const term = searchTerm.toLowerCase();
    const ids = new Set<number>();
    nodes.forEach((n) => {
      if (
        n.nombre.toLowerCase().includes(term) ||
        n.codigo.toLowerCase().includes(term) ||
        (n.responsable && n.responsable.toLowerCase().includes(term))
      ) {
        ids.add(n.id);
      }
    });
    return ids;
  }, [nodes, searchTerm]);

  if (loading && !cpmData) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Calculando red de dependencias y tiempos PERT...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-6 rounded-2xl flex items-start gap-3 max-w-md shadow-xs">
          <AlertCircle className="mt-0.5 text-amber-600 shrink-0" size={20} />
          <div>
            <h4 className="font-semibold text-sm mb-1">Aviso</h4>
            <p className="text-xs">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!nodes.length || !cpmData?.actividades?.length) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs max-w-md w-full">
          <Workflow size={48} className="mx-auto mb-3 text-slate-300" />
          <h3 className="text-sm font-bold text-slate-800">Sin diagrama PERT</h3>
          <p className="text-xs text-slate-500 mt-1">
            Ve a la pestaña <strong>"Plan de Trabajo"</strong> para agregar actividades, duraciones y dependencias.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full flex-1 min-h-0 overflow-hidden gap-3 relative">
      {/* BARRA DE HERRAMIENTAS Y CONTROLES SUPERIOR (Unificada al estilo Gantt) */}
      <div className="shrink-0 bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        {/* Leyenda de Colores */}
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
            <span className="w-3.5 h-1.5 rounded-xs bg-slate-900 shrink-0 shadow-2xs" />
            <span className="font-semibold text-slate-800">Inicio / Fin</span>
          </div>
        </div>

        {/* Acciones: Buscador, Guía PERT, Filtro Crítico, Modo Calendario y Zoom */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Buscador en Red PERT */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en red PERT..."
              className="pl-8 pr-3 py-1 text-xs border border-slate-200 rounded-lg w-36 sm:w-44 focus:w-52 transition-all focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 bg-slate-50"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Filtro: Solo Ruta Crítica */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setSoloRutaCritica(false)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                !soloRutaCritica ? 'bg-white text-blue-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Todas</span>
            </button>
            <button
              onClick={() => setSoloRutaCritica(true)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all cursor-pointer ${
                soloRutaCritica ? 'bg-white text-red-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${soloRutaCritica ? 'bg-red-500 animate-pulse' : 'bg-slate-400'}`} />
              <span>Solo Críticas</span>
            </button>
          </div>

          {/* Controles de Zoom */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={handleZoomOut}
              className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
              title="Reducir zoom"
            >
              <ZoomOut size={15} />
            </button>
            <span className="text-xs font-mono font-medium px-2 text-slate-600">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={handleZoomIn}
              className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
              title="Aumentar zoom"
            >
              <ZoomIn size={15} />
            </button>
            <button
              onClick={handleFitToScreen}
              className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer border-l border-slate-200 ml-0.5"
              title="Ajustar red PERT a la pantalla"
            >
              <Maximize2 size={14} />
            </button>
            <button
              onClick={handleZoomReset}
              className="p-1 hover:bg-white rounded text-slate-600 cursor-pointer"
              title="Centrar red PERT al 100%"
            >
              <RotateCcw size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* POPOVER FLOTANTE: GUÍA VISUAL DEL NODO PERT (6 CAMPOS) */}
      {showGuideModal && (
        <div className="absolute top-16 left-4 z-40 w-96 bg-white/95 backdrop-blur-md border border-slate-200/90 rounded-2xl shadow-2xl p-4 text-xs animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between pb-2 mb-3 border-b border-slate-200">
            <div className="flex items-center gap-1.5 font-bold text-slate-800">
              <Sparkles size={14} className="text-blue-600" />
              <span>Estructura de la Tarjeta PERT / CPM</span>
            </div>
            <button
              onClick={() => setShowGuideModal(false)}
              className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          </div>

          {/* Maqueta explicativa */}
          <div className="rounded-xl border border-slate-300 overflow-hidden shadow-xs mb-3 bg-white">
            <div className="grid grid-cols-3 divide-x divide-slate-200 bg-blue-50/70 text-center py-1 text-[10px] font-mono border-b border-slate-200">
              <div>
                <span className="text-[8px] text-blue-600 font-bold block">ES</span>
                <span className="font-semibold text-slate-700">Inicio Temprano</span>
              </div>
              <div>
                <span className="text-[8px] text-slate-700 font-bold block">Te</span>
                <span className="font-semibold text-slate-700">Duración PERT</span>
              </div>
              <div>
                <span className="text-[8px] text-blue-600 font-bold block">EF</span>
                <span className="font-semibold text-slate-700">Fin Temprano</span>
              </div>
            </div>
            <div className="px-3 py-2 bg-slate-50 text-center border-b border-slate-200">
              <span className="font-mono text-[9px] font-bold text-blue-700 bg-blue-100/70 px-1.5 py-0.5 rounded mr-1">
                1.1.1
              </span>
              <span className="font-semibold text-slate-800 text-[11px]">
                Código y Nombre de la Tarea
              </span>
            </div>
            <div className="grid grid-cols-3 divide-x divide-slate-200 bg-slate-50 text-center py-1 text-[10px] font-mono">
              <div>
                <span className="text-[8px] text-slate-500 font-bold block">LS</span>
                <span className="font-semibold text-slate-700">Inicio Tardío</span>
              </div>
              <div>
                <span className="text-[8px] text-emerald-600 font-bold block">HT</span>
                <span className="font-semibold text-slate-700">Holgura Total</span>
              </div>
              <div>
                <span className="text-[8px] text-slate-500 font-bold block">LF</span>
                <span className="font-semibold text-slate-700">Fin Tardío</span>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-slate-600 leading-relaxed">
            * <strong className="text-red-600">Ruta Crítica:</strong> Actividades con holgura total{' '}
            <code className="bg-red-50 text-red-700 px-1 py-0.5 rounded font-mono text-[10px]">HT = 0</code>.
            Cualquier retraso en ellas pospone la fecha final del proyecto.
          </p>
        </div>
      )}

      {/* LIENZO PRINCIPAL DEL DIAGRAMA PERT (Canvas con Paneo y Zoom) */}
      <div
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 min-h-0 bg-slate-50/70 border border-slate-200 rounded-2xl overflow-auto relative p-8 transition-colors ${
          isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(148, 163, 184, 0.22) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* Contenedor escalado por Zoom */}
        <div
          ref={contentRef}
          className="relative transition-transform duration-100 origin-top-left"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transform: `scale(${zoom})`,
          }}
        >
          {/* Etiquetas superiores de Nivel / Rango Topológico */}
          {ranksList.map((r) => (
            <div
              key={`rank-header-${r.rank}`}
              className="absolute text-center select-none pointer-events-none"
              style={{
                left: `${r.x}px`,
                top: '28px',
                width: r.rank === 0 || r.rank === ranksList.length - 1 ? '156px' : '240px',
              }}
            >
              <span className="text-[10px] font-mono font-bold tracking-wider uppercase text-slate-400 bg-white/80 border border-slate-200 px-2 py-0.5 rounded-full shadow-2xs">
                {r.label}
              </span>
            </div>
          ))}

          {/* CAPA SVG PARA FLECHAS Y CONECTORES DE DEPENDENCIAS */}
          <svg
            className="absolute inset-0 pointer-events-none z-0"
            style={{ width: `${canvasWidth}px`, height: `${canvasHeight}px` }}
          >
            <defs>
              {/* Marcador de flecha para actividades críticas (Rojo) */}
              <marker
                id="pert-arrow-critical"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#ef4444" />
              </marker>

              {/* Marcador de flecha normal (Slate neutro) */}
              <marker
                id="pert-arrow-normal"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 0 1.5 L 9 5 L 0 8.5 z" fill="#94a3b8" />
              </marker>
            </defs>

            {/* Dibujar aristas */}
            {edges.map((edge) => {
              const isFilteredOut = soloRutaCritica && !edge.isCritical;
              const strokeColor = edge.isCritical ? '#ef4444' : '#94a3b8';
              const strokeWidth = edge.isCritical ? 2.5 : 1.5;
              const strokeOpacity = isFilteredOut ? 0.1 : edge.isCritical ? 0.95 : 0.65;
              const marker = edge.isCritical
                ? 'url(#pert-arrow-critical)'
                : 'url(#pert-arrow-normal)';

              return (
                <path
                  key={edge.id}
                  d={edge.d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeOpacity={strokeOpacity}
                  strokeLinecap="round"
                  markerEnd={marker}
                  className="transition-all duration-200"
                />
              );
            })}
          </svg>

          {/* CAPA DE NODOS (CAJAS ESTÁNDAR PERT / CPM) */}
          {nodes.map((node) => {
            const isMatch = matchingNodeIds.has(node.id);
            const isFilteredOut = soloRutaCritica && !node.es_critica;

            // RENDERIZADO DE HITOS INICIO Y FIN
            if (node.isMilestone) {
              const isStart = node.isMilestone === 'start';

              return (
                <div
                  key={node.id}
                  className={`pert-node-card absolute select-none rounded-2xl p-3.5 flex flex-col justify-between transition-all duration-150 border-2 shadow-sm ${
                    isFilteredOut ? 'opacity-25' : 'opacity-100'
                  } ${
                    isStart
                      ? 'bg-slate-900 border-slate-700 text-white hover:border-slate-500 shadow-slate-900/10'
                      : 'bg-slate-900 border-emerald-600/90 text-white hover:border-emerald-500 shadow-emerald-950/15'
                  }`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    height: `${node.height}px`,
                  }}
                >
                  {/* Puerto de conexión derecho (para inicio) o izquierdo (para fin) */}
                  {isStart ? (
                    <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-emerald-500 z-10 shadow-2xs" />
                  ) : (
                    <div className="absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 border-emerald-500 z-10 shadow-2xs" />
                  )}

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`p-1.5 rounded-lg ${
                          isStart ? 'bg-slate-800 text-emerald-400' : 'bg-emerald-900 text-emerald-300'
                        }`}
                      >
                        {isStart ? <Play size={13} className="fill-emerald-400" /> : <Flag size={13} />}
                      </div>
                      <span className="font-mono font-bold text-xs tracking-wider">
                        {node.codigo}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-emerald-400 font-bold bg-slate-800/80 px-1.5 py-0.5 rounded">
                      Día {node.es}
                    </span>
                  </div>

                  <div className="text-[10px] text-slate-300 font-mono truncate">
                    {formatDate(node.fecha_inicio)}
                  </div>
                </div>
              );
            }

            // CAJA ESTÁNDAR PERT/CPM (6 CAMPOS + TÍTULO Y CÓDIGO)
            return (
              <div
                key={node.id}
                className={`pert-node-card absolute select-none rounded-xl transition-all duration-150 overflow-hidden bg-white border-2 text-left group ${
                  isFilteredOut ? 'opacity-20' : 'opacity-100'
                } ${
                  isMatch
                    ? 'ring-4 ring-amber-400 scale-[1.03] z-20 shadow-xl'
                    : 'shadow-xs hover:shadow-md'
                } ${
                  node.es_critica
                    ? 'border-red-400 hover:border-red-500 shadow-red-100/50'
                    : 'border-slate-300 hover:border-blue-400'
                }`}
                style={{
                  left: `${node.x}px`,
                  top: `${node.y}px`,
                  width: `${node.width}px`,
                  height: `${node.height}px`,
                }}
              >
                {/* Puertos de conexión vectoriales (Bordes laterales) */}
                <div
                  className={`absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 z-10 shadow-2xs transition-colors ${
                    node.es_critica ? 'border-red-500' : 'border-slate-400 group-hover:border-blue-500'
                  }`}
                />
                <div
                  className={`absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 z-10 shadow-2xs transition-colors ${
                    node.es_critica ? 'border-red-500' : 'border-slate-400 group-hover:border-blue-500'
                  }`}
                />

                {/* Tira superior de acento según criticidad */}
                <div
                  className={`h-1 w-full ${
                    node.es_critica
                      ? 'bg-gradient-to-r from-red-500 via-rose-500 to-red-600'
                      : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600'
                  }`}
                />

                {/* FILA 1 CPM: ES (Temprano) | Te (Duración) | EF (Temprano) */}
                <div className="grid grid-cols-3 divide-x divide-slate-200 bg-slate-50/80 text-center py-1 text-[10px] font-mono border-b border-slate-200">
                  <div title="Inicio Más Temprano (ES)">
                    <span className="text-[8px] text-slate-400 block font-sans font-bold leading-none">ES</span>
                    <span className="font-bold text-blue-700">{node.es}</span>
                  </div>
                  <div title="Duración Esperada PERT (Te)">
                    <span className="text-[8px] text-slate-500 block font-sans font-bold leading-none">Te</span>
                    <span className="font-bold text-slate-900">{node.duracion}d</span>
                  </div>
                  <div title="Fin Más Temprano (EF)">
                    <span className="text-[8px] text-slate-400 block font-sans font-bold leading-none">EF</span>
                    <span className="font-bold text-blue-700">{node.ef}</span>
                  </div>
                </div>

                {/* FILA CENTRAL: CÓDIGO EDT, NOMBRE Y RESPONSABLE */}
                <div className="px-2.5 py-1.5 bg-white flex flex-col justify-between" style={{ height: '62px' }}>
                  {/* Cabecera del centro: Código y Estado */}
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-800 border border-slate-200">
                      {node.codigo}
                    </span>

                    {node.es_critica ? (
                      <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.2 rounded-full flex items-center gap-1 border border-red-200 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        Crítica
                      </span>
                    ) : (
                      <span className="text-[9px] font-mono font-medium text-slate-500 bg-slate-50 px-1.5 py-0.2 rounded border border-slate-200">
                        HT: +{node.holgura_total}d
                      </span>
                    )}
                  </div>

                  {/* Nombre de la actividad a 2 líneas */}
                  <h4
                    className="text-[11px] font-bold text-slate-800 line-clamp-2 leading-snug"
                    title={node.nombre}
                  >
                    {node.nombre}
                  </h4>
                </div>

                {/* FILA 3 CPM: LS (Tardío) | HT (Holgura Total) | LF (Tardío) */}
                <div className="grid grid-cols-3 divide-x divide-slate-200 bg-slate-50/90 text-center py-1 text-[10px] font-mono border-t border-slate-200">
                  <div title="Inicio Más Tardío (LS)">
                    <span className="text-[8px] text-slate-400 block font-sans font-bold leading-none">LS</span>
                    <span className={`font-bold ${node.es_critica ? 'text-red-700' : 'text-slate-700'}`}>
                      {node.ls}
                    </span>
                  </div>
                  <div title="Holgura Total (HT = LF - EF)">
                    <span className="text-[8px] text-slate-500 block font-sans font-bold leading-none">HT</span>
                    <span
                      className={`font-bold ${
                        node.holgura_total === 0 ? 'text-red-600 font-extrabold' : 'text-emerald-700'
                      }`}
                    >
                      {node.holgura_total}
                    </span>
                  </div>
                  <div title="Fin Más Tardío (LF)">
                    <span className="text-[8px] text-slate-400 block font-sans font-bold leading-none">LF</span>
                    <span className={`font-bold ${node.es_critica ? 'text-red-700' : 'text-slate-700'}`}>
                      {node.lf}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
