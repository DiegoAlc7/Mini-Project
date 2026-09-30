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
  User,
  Flag,
  Play,
  CheckCircle2,
  RefreshCw,
  Layers,
  ArrowRight,
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
  const [selectedNode, setSelectedNode] = useState<PertGraphNode | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<number | null>(null);
  const [soloRutaCritica, setSoloRutaCritica] = useState(false);

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

  // Mapa rápido de CPM por ID
  const cpmMap = useMemo(() => {
    const map = new Map<number, CpmResult>();
    if (cpmData?.actividades) {
      cpmData.actividades.forEach((c) => map.set(c.id, c));
    }
    return map;
  }, [cpmData]);

  // Algoritmo de diseño de grafo PERT (AON - Activity On Node)
  const { nodes, edges, canvasWidth, canvasHeight } = useMemo(() => {
    if (!cpmData || !cpmData.actividades || cpmData.actividades.length === 0) {
      return { nodes: [], edges: [], canvasWidth: 800, canvasHeight: 600 };
    }

    const cpmActs = cpmData.actividades;
    const actIds = new Set(cpmActs.map((a) => a.id));

    // Filtrar dependencias que solo pertenezcan a actividades válidas
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
      width: 140,
      height: 72,
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
      width: 140,
      height: 72,
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
        width: 226,
        height: 114,
      };
      nodesByRank.get(rank)?.push(actObj);
    });

    // 3. Dimensiones de la cuadrícula y coordenadas (X, Y)
    const cardWidth = 226;
    const colSpacing = 95;
    const cardHeight = 114;
    const rowSpacing = 48;
    const startX = 60;
    const startY = 80;

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
      const actualWidth = isStartCol || isEndCol ? 140 : cardWidth;
      const x = startX + rank * (cardWidth + colSpacing);

      // Centrado vertical
      const colItemsHeight = list.length * (cardHeight + rowSpacing);
      const verticalOffset = Math.max(0, (totalColumnHeight - colItemsHeight) / 2);

      // Ordenar nodos dentro de la columna (por código EDT para consistencia)
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

    const calculatedWidth = startX + (maxActRank + 2) * (cardWidth + colSpacing) + 100;
    const calculatedHeight = Math.max(700, totalColumnHeight + startY * 2);

    return {
      nodes: positionedNodes,
      edges: graphEdges,
      canvasWidth: calculatedWidth,
      canvasHeight: calculatedHeight,
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

  // Estadísticas del diagrama PERT
  const stats = useMemo(() => {
    if (!cpmData) return { total: 0, criticas: 0, noCriticas: 0, duracion: 0 };
    const total = cpmData.actividades ? cpmData.actividades.length : 0;
    const criticas = cpmData.ruta_critica ? cpmData.ruta_critica.length : 0;
    return {
      total,
      criticas,
      noCriticas: total - criticas,
      duracion: cpmData.duracion_total,
    };
  }, [cpmData]);

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
    <div className="flex flex-col h-full w-full flex-1 min-h-0 overflow-hidden gap-3">
      {/* BARRA DE HERRAMIENTAS Y CONTROLES SUPERIOR */}
      <div className="shrink-0 bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        {/* Métricas y Leyenda */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
            <span className="text-slate-500 font-medium">Red PERT/CPM:</span>
            <span className="font-bold text-slate-800">{stats.total} actividades</span>
            <span className="text-slate-300">•</span>
            <span className="font-bold text-red-600 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              {stats.criticas} críticas
            </span>
            <span className="text-slate-300">•</span>
            <span className="font-bold text-slate-700">Duración Te: {stats.duracion} días</span>
          </div>

          {/* Leyenda de Colores */}
          <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-500 shrink-0" />
              <span className="text-red-700 font-medium">Ruta Crítica (HT=0)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-600 shrink-0" />
              <span>Actividad Normal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-800 shrink-0" />
              <span>Hitos Inicio/Fin</span>
            </div>
          </div>
        </div>

        {/* Acciones: Buscador, Filtro Crítico, Modo Calendario y Zoom */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Buscador */}
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
          <button
            onClick={() => setSoloRutaCritica(!soloRutaCritica)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
              soloRutaCritica
                ? 'bg-red-50 text-red-700 border-red-300 shadow-2xs'
                : 'bg-slate-100 text-slate-600 border-slate-200 hover:text-slate-900'
            }`}
            title="Resaltar y enfocar la Ruta Crítica"
          >
            <span className={`w-1.5 h-1.5 rounded-full ${soloRutaCritica ? 'bg-red-500' : 'bg-slate-400'}`} />
            <span>Solo Críticas</span>
          </button>

          {/* Selector de modo calendario */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={() => handleSoloHabilesChange(false)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                !soloHabiles ? 'bg-white text-blue-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calendar size={12} />
              <span>Lun a Dom</span>
            </button>
            <button
              onClick={() => handleSoloHabilesChange(true)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all cursor-pointer ${
                soloHabiles ? 'bg-white text-blue-700 shadow-2xs font-semibold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>Hábiles</span>
            </button>
          </div>

          {/* Controles de Zoom */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={handleZoomOut}
              className="p-1 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Alejar (Zoom Out)"
            >
              <ZoomOut size={14} />
            </button>
            <button
              onClick={handleZoomReset}
              className="px-2 py-0.5 text-[11px] font-mono font-medium text-slate-700 hover:bg-white rounded-md transition-colors cursor-pointer min-w-[42px] text-center"
              title="Restablecer zoom al 100%"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Acercar (Zoom In)"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={handleFitToScreen}
              className="p-1 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer border-l border-slate-200 ml-0.5"
              title="Ajustar diagrama a pantalla"
            >
              <Maximize2 size={13} />
            </button>
            <button
              onClick={handleZoomReset}
              className="p-1 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="Centrar red PERT"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </div>

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
              const isHighlighted =
                highlightedNodeId !== null &&
                (edge.fromId === highlightedNodeId || edge.toId === highlightedNodeId);

              const strokeColor = edge.isCritical
                ? '#ef4444'
                : isHighlighted
                ? '#3b82f6'
                : '#94a3b8';

              const strokeWidth = edge.isCritical || isHighlighted ? 2.5 : 1.5;
              const strokeOpacity = isFilteredOut ? 0.15 : isHighlighted ? 1 : edge.isCritical ? 0.9 : 0.65;
              const marker = edge.isCritical ? 'url(#pert-arrow-critical)' : 'url(#pert-arrow-normal)';

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
            const isSelected = selectedNode?.id === node.id;
            const isFilteredOut = soloRutaCritica && !node.es_critica;
            const isHovered = highlightedNodeId === node.id;

            // Renderizado especial para Hitos INICIO y FIN
            if (node.isMilestone) {
              const isStart = node.isMilestone === 'start';

              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node)}
                  onMouseEnter={() => setHighlightedNodeId(node.id)}
                  onMouseLeave={() => setHighlightedNodeId(null)}
                  className={`pert-node-card absolute cursor-pointer select-none rounded-2xl p-3 flex items-center justify-between gap-2.5 transition-all duration-150 border-2 shadow-sm ${
                    isFilteredOut ? 'opacity-30' : 'opacity-100'
                  } ${
                    isStart
                      ? 'bg-slate-900 border-slate-700 text-white hover:border-slate-500'
                      : 'bg-emerald-950 border-emerald-700 text-white hover:border-emerald-500'
                  } ${
                    isSelected ? 'ring-4 ring-offset-2 ring-blue-500' : ''
                  }`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${node.width}px`,
                    height: `${node.height}px`,
                  }}
                >
                  <div className="flex items-center gap-2">
                    <div
                      className={`p-2 rounded-xl ${
                        isStart ? 'bg-slate-800 text-blue-400' : 'bg-emerald-900 text-emerald-400'
                      }`}
                    >
                      {isStart ? <Play size={16} /> : <Flag size={16} />}
                    </div>
                    <div>
                      <div className="font-mono font-bold text-xs leading-none">
                        {node.codigo}
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1">
                        Día {node.es}
                      </div>
                    </div>
                  </div>
                </div>
              );
            }

            // CAJA ESTÁNDAR DE 6 CAMPOS PERT/CPM
            return (
              <div
                key={node.id}
                onClick={() => setSelectedNode(node)}
                onMouseEnter={() => setHighlightedNodeId(node.id)}
                onMouseLeave={() => setHighlightedNodeId(null)}
                className={`pert-node-card absolute cursor-pointer select-none rounded-xl transition-all duration-150 overflow-hidden bg-white border-2 text-left group ${
                  isFilteredOut ? 'opacity-25' : 'opacity-100'
                } ${
                  isMatch
                    ? 'ring-4 ring-amber-400 scale-[1.03] z-20 shadow-lg'
                    : isSelected
                    ? 'ring-3 ring-blue-500 scale-[1.02] z-10 shadow-lg'
                    : isHovered
                    ? 'scale-[1.02] z-10 shadow-md'
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
                {/* Cabecera: Código EDT, Estado de Ruta Crítica y Holgura */}
                <div
                  className={`flex items-center justify-between px-2 py-1 text-[10px] border-b ${
                    node.es_critica
                      ? 'bg-red-50 border-red-200 text-red-900'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <span className="font-mono font-bold text-slate-900">
                    {node.codigo}
                  </span>

                  {node.es_critica ? (
                    <span className="text-[9px] font-bold text-red-700 bg-red-100 px-1.5 py-0.2 rounded-full flex items-center gap-1 border border-red-300/80">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                      Crítica
                    </span>
                  ) : (
                    <span className="text-[9px] font-mono font-semibold text-slate-500 bg-white px-1.5 py-0.2 rounded border border-slate-200">
                      HT: +{node.holgura_total}d
                    </span>
                  )}
                </div>

                {/* FILA SUPERIOR CPM: ES | Te | EF */}
                <div className="grid grid-cols-3 divide-x divide-slate-200 bg-blue-50/40 text-center py-0.5 border-b border-slate-100 text-[10px] font-mono">
                  <div title="Inicio Más Temprano (ES)">
                    <span className="text-[8px] text-slate-400 block font-sans leading-none">ES</span>
                    <span className="font-bold text-blue-800">{node.es}</span>
                  </div>
                  <div title="Duración PERT Te">
                    <span className="text-[8px] text-slate-400 block font-sans leading-none">Te</span>
                    <span className="font-bold text-slate-900">{node.duracion}d</span>
                  </div>
                  <div title="Fin Más Temprano (EF)">
                    <span className="text-[8px] text-slate-400 block font-sans leading-none">EF</span>
                    <span className="font-bold text-blue-800">{node.ef}</span>
                  </div>
                </div>

                {/* NOMBRE DE LA ACTIVIDAD */}
                <div className="px-2 py-1 bg-white">
                  <h4
                    className="text-[11px] font-bold text-slate-800 line-clamp-1 leading-tight"
                    title={node.nombre}
                  >
                    {node.nombre}
                  </h4>
                </div>

                {/* FILA INFERIOR CPM: LS | Holgura | LF */}
                <div className="grid grid-cols-3 divide-x divide-slate-200 bg-slate-50/80 text-center py-0.5 border-t border-slate-200 text-[10px] font-mono">
                  <div title="Inicio Más Tardío (LS)">
                    <span className="text-[8px] text-slate-400 block font-sans leading-none">LS</span>
                    <span className={`font-bold ${node.es_critica ? 'text-red-700' : 'text-slate-700'}`}>
                      {node.ls}
                    </span>
                  </div>
                  <div title="Holgura Total (HT)">
                    <span className="text-[8px] text-slate-400 block font-sans leading-none">HT</span>
                    <span
                      className={`font-bold ${
                        node.holgura_total === 0 ? 'text-red-700 font-extrabold' : 'text-emerald-700'
                      }`}
                    >
                      {node.holgura_total}
                    </span>
                  </div>
                  <div title="Fin Más Tardío (LF)">
                    <span className="text-[8px] text-slate-400 block font-sans leading-none">LF</span>
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

      {/* DRAWER / PANEL LATERAL DE DETALLE DE ACTIVIDAD SELECCIONADA */}
      {selectedNode && (
        <div className="fixed inset-y-0 right-0 w-80 sm:w-96 bg-white border-l border-slate-200 shadow-2xl z-50 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
          {/* Cabecera del Drawer */}
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                {selectedNode.codigo}
              </span>
              {selectedNode.es_critica ? (
                <span className="text-[10px] font-bold text-red-600 bg-red-100 px-2 py-0.5 rounded-full border border-red-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Ruta Crítica
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">
                  No Crítica
                </span>
              )}
            </div>
            <button
              onClick={() => setSelectedNode(null)}
              className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
            >
              <X size={18} />
            </button>
          </div>

          {/* Contenido con scroll */}
          <div className="p-5 flex-1 overflow-y-auto space-y-5 text-xs text-slate-700">
            {/* Título de la actividad */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Nombre de la Actividad
              </span>
              <h3 className="text-sm font-bold text-slate-900 leading-snug">
                {selectedNode.nombre}
              </h3>
            </div>

            {/* Caja de tiempos CPM detallada */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Cálculos CPM (Tiempos y Holguras)
              </span>
              <div className="grid grid-cols-2 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3 font-mono text-[11px]">
                <div>
                  <span className="text-slate-400 text-[10px] block font-sans">Inicio Temprano (ES)</span>
                  <span className="font-bold text-blue-700 text-sm">Día {selectedNode.es}</span>
                </div>
                <div>
                  <span className="text-slate-400 text-[10px] block font-sans">Fin Temprano (EF)</span>
                  <span className="font-bold text-blue-700 text-sm">Día {selectedNode.ef}</span>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-sans">Inicio Tardío (LS)</span>
                  <span className={`font-bold text-sm ${selectedNode.es_critica ? 'text-red-600' : 'text-slate-700'}`}>
                    Día {selectedNode.ls}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-sans">Fin Tardío (LF)</span>
                  <span className={`font-bold text-sm ${selectedNode.es_critica ? 'text-red-600' : 'text-slate-700'}`}>
                    Día {selectedNode.lf}
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-sans">Holgura Total (HT)</span>
                  <span
                    className={`font-bold text-sm ${
                      selectedNode.holgura_total === 0 ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {selectedNode.holgura_total} días
                  </span>
                </div>
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-slate-400 text-[10px] block font-sans">Holgura Libre (HL)</span>
                  <span className="font-bold text-slate-700 text-sm">
                    {selectedNode.holgura_libre} días
                  </span>
                </div>
              </div>
            </div>

            {/* Estimaciones PERT (a, m, b, Te, varianza) */}
            {selectedNode.actividadData && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Estimaciones Probabilísticas PERT
                </span>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Optimista (a)</span>
                      <span className="font-mono font-bold text-slate-800">
                        {selectedNode.actividadData.duracion_optimista}d
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Probable (m)</span>
                      <span className="font-mono font-bold text-blue-700">
                        {selectedNode.actividadData.duracion_probable}d
                      </span>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 block">Pesimista (b)</span>
                      <span className="font-mono font-bold text-slate-800">
                        {selectedNode.actividadData.duracion_pesimista}d
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200">
                    <span className="text-slate-500">Duración Esperada Te:</span>
                    <span className="font-mono font-bold text-slate-900 bg-slate-200 px-2 py-0.5 rounded">
                      {selectedNode.actividadData.duracion_esperada} días
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">Varianza (σ²):</span>
                    <span className="font-mono font-semibold text-slate-700">
                      {selectedNode.actividadData.varianza}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Fechas de Calendario */}
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                Fechas en Calendario
              </span>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span>Fecha Inicio:</span>
                  </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatDate(selectedNode.fecha_inicio)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Calendar size={13} className="text-slate-400" />
                    <span>Fecha Fin:</span>
                  </span>
                  <span className="font-mono font-semibold text-slate-800">
                    {formatDate(selectedNode.fecha_fin)}
                  </span>
                </div>
                {selectedNode.fecha_limite && (
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Clock size={13} className="text-slate-400" />
                      <span>Fecha Límite:</span>
                    </span>
                    <span className="font-mono font-semibold text-blue-700">
                      {formatDate(selectedNode.fecha_limite)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Responsable */}
            {selectedNode.responsable && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Responsable Asignado
                </span>
                <div className="flex items-center gap-2.5 p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                  {(() => {
                    const miembro = getMiembro(selectedNode.responsable!);
                    return miembro ? (
                      <>
                        <img
                          src={miembro.avatar}
                          alt={miembro.nombre}
                          className="w-7 h-7 rounded-full object-cover bg-slate-200"
                        />
                        <div>
                          <div className="font-semibold text-slate-800 leading-tight">
                            {miembro.nombre}
                          </div>
                          <div className="text-[10px] text-slate-400">{miembro.rol}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
                          <User size={14} />
                        </div>
                        <span className="font-medium text-slate-700">{selectedNode.responsable}</span>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
