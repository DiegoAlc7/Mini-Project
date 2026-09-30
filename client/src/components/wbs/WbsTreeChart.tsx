import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  FolderTree,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Search,
  AlertCircle,
  Calendar,
  User,
  X,
} from 'lucide-react';
import type { NodoEdt, CpmResponse, CpmResult } from '../../types';
import { getEdt, getCpm } from '../../lib/api';
import { useResources } from '../../context/ResourceContext';

interface Props {
  proyectoId: number;
  dataVersion?: number;
  isActive?: boolean;
  onDataChange?: () => void;
}

function formatDate(str?: string): string {
  if (!str) return 'No definida';
  const parts = str.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return str;
}

function formatShortDate(str?: string): string {
  if (!str) return '';
  const parts = str.split('-');
  if (parts.length < 3) return str;
  return `${parts[2]}.${parts[1]}`;
}

export default function WbsTreeChart({
  proyectoId,
  dataVersion = 0,
  isActive = true,
}: Props) {
  const { getMiembro } = useResources();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [arbolEdt, setArbolEdt] = useState<NodoEdt[]>([]);
  const [cpmData, setCpmData] = useState<CpmResponse | null>(null);

  // Estados de Zoom y Paneo del lienzo
  const [zoom, setZoom] = useState<number>(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedNode, setSelectedNode] = useState<NodoEdt | null>(null);

  // Nodos expandidos / colapsados (por defecto todos los que tienen hijos están expandidos)
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  // Referencia al contenedor desplazable
  const canvasRef = useRef<HTMLDivElement>(null);

  // Estado para el arrastre (pan) con mouse
  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number }>({
    x: 0,
    y: 0,
    scrollLeft: 0,
    scrollTop: 0,
  });

  // Cargar datos del EDT y CPM
  const cargarDatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [edt, cpm] = await Promise.all([
        getEdt(proyectoId),
        getCpm(proyectoId, false).catch(() => null),
      ]);
      setArbolEdt(edt);
      setCpmData(cpm);
    } catch (err: any) {
      console.error('Error cargando Organigrama EDT:', err);
      setError(err?.message || 'Error al cargar los datos del organigrama');
    } finally {
      setLoading(false);
    }
  }, [proyectoId]);

  useEffect(() => {
    if (isActive) {
      cargarDatos();
    }
  }, [cargarDatos, dataVersion, isActive]);

  // Mapa rápido de CPM por ID de actividad
  const cpmMap = useMemo(() => {
    const map = new Map<number, CpmResult>();
    if (cpmData?.actividades) {
      cpmData.actividades.forEach((act) => {
        map.set(act.id, act);
      });
    }
    return map;
  }, [cpmData]);

  // Recuento de estadísticas
  const stats = useMemo(() => {
    let fases = 0;
    let tareas = 0;
    let criticas = 0;

    function contar(nodo: NodoEdt) {
      const isRoot = nodo.padre_id === null;
      const hasChildren = Boolean(nodo.children && nodo.children.length > 0);

      if (!isRoot) {
        if (hasChildren) {
          fases++;
        } else {
          tareas++;
          if (nodo.actividad) {
            const cpm = cpmMap.get(nodo.actividad.id);
            if (cpm?.es_critica || cpm?.holgura_total === 0) {
              criticas++;
            }
          }
        }
      }

      if (hasChildren) {
        nodo.children.forEach(contar);
      }
    }

    arbolEdt.forEach(contar);
    return { fases, tareas, criticas };
  }, [arbolEdt, cpmMap]);

  // Colapsar o expandir un nodo específico
  const toggleCollapse = (nodeId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Expandir todos los nodos
  const handleExpandAll = () => {
    setCollapsedIds(new Set());
  };

  // Colapsar a Fases (dejar colapsados todos los nodos de nivel >= 2 que tengan hijos)
  const handleCollapseToPhases = () => {
    const ids = new Set<number>();
    function buscar(nodo: NodoEdt) {
      if (nodo.children && nodo.children.length > 0) {
        if (nodo.nivel >= 1) {
          ids.add(nodo.id);
        }
        nodo.children.forEach(buscar);
      }
    }
    arbolEdt.forEach(buscar);
    setCollapsedIds(ids);
  };

  // Zoom handlers
  const handleZoomIn = () => setZoom((z) => Math.min(1.5, Number((z + 0.15).toFixed(2))));
  const handleZoomOut = () => setZoom((z) => Math.max(0.4, Number((z - 0.15).toFixed(2))));
  const handleZoomReset = () => {
    setZoom(1);
    if (canvasRef.current) {
      const el = canvasRef.current;
      // Centrar el scroll horizontalmente
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = 0;
    }
  };

  // Centrar inicialmente el lienzo al cargar
  useEffect(() => {
    if (!loading && arbolEdt.length > 0 && canvasRef.current) {
      const el = canvasRef.current;
      setTimeout(() => {
        el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2);
      }, 100);
    }
  }, [loading, arbolEdt]);

  // Control de paneo arrastrando con mouse
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, a, .node-card')) return;
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

  // Renderizador recursivo de cada nodo del organigrama
  const renderTreeNode = (nodo: NodoEdt) => {
    const isRoot = nodo.padre_id === null;
    const hasChildren = Boolean(nodo.children && nodo.children.length > 0);
    const isCollapsed = collapsedIds.has(nodo.id);

    const cpm = nodo.actividad ? cpmMap.get(nodo.actividad.id) : undefined;
    const esCritica = cpm ? cpm.es_critica || cpm.holgura_total === 0 : false;
    const duracion = cpm?.duracion ?? (nodo.actividad?.duracion_esperada || 0);

    const responsable = nodo.actividad?.responsable;
    const miembro = responsable ? getMiembro(responsable) : undefined;

    // Coincidencia con búsqueda
    const isMatched =
      searchTerm.trim().length > 0 &&
      (nodo.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        nodo.codigo.toLowerCase().includes(searchTerm.toLowerCase()));

    // Total de descendientes hoja
    const contarHojasDescendientes = (n: NodoEdt): number => {
      if (!n.children || n.children.length === 0) return 1;
      return n.children.reduce((acc, c) => acc + contarHojasDescendientes(c), 0);
    };
    const totalHojas = hasChildren ? contarHojasDescendientes(nodo) : 0;

    return (
      <div key={nodo.id} className="flex flex-col items-center select-none">
        {/* TARJETA DEL NODO (Node Card) */}
        <div
          onClick={() => setSelectedNode(nodo)}
          className={`node-card relative w-60 rounded-xl transition-all duration-200 cursor-pointer text-left group ${
            isMatched
              ? 'ring-4 ring-amber-400 scale-105 z-10'
              : ''
          } ${
            isRoot
              ? 'bg-slate-900 text-white border-2 border-slate-800 shadow-lg hover:shadow-xl hover:border-slate-700'
              : hasChildren
              ? 'bg-white border-2 border-indigo-200/90 text-slate-800 shadow-xs hover:border-indigo-400 hover:shadow-md'
              : esCritica
              ? 'bg-white border-2 border-red-300 text-slate-800 shadow-xs hover:border-red-500 hover:shadow-md'
              : 'bg-white border border-slate-200 text-slate-800 shadow-xs hover:border-blue-400 hover:shadow-md'
          }`}
        >
          {/* Barra superior de acento según tipo */}
          <div
            className={`h-1.5 rounded-t-[10px] w-full ${
              isRoot
                ? 'bg-gradient-to-r from-blue-500 to-indigo-500'
                : hasChildren
                ? 'bg-indigo-500'
                : esCritica
                ? 'bg-red-500'
                : 'bg-blue-500'
            }`}
          />

          <div className="p-3">
            {/* Cabecera de la tarjeta: Código y Badge */}
            <div className="flex items-center justify-between gap-1.5 mb-1.5">
              <span
                className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                  isRoot
                    ? 'bg-slate-800 text-blue-300 border border-slate-700'
                    : hasChildren
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : esCritica
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-blue-50 text-blue-700 border border-blue-200'
                }`}
              >
                {nodo.codigo || 'EDT'}
              </span>

              {isRoot ? (
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                  Proyecto
                </span>
              ) : hasChildren ? (
                <span className="text-[10px] font-semibold text-indigo-700 bg-indigo-50/80 px-1.5 py-0.5 rounded">
                  {nodo.nivel === 1 ? 'Fase' : 'Paquete'} ({totalHojas})
                </span>
              ) : esCritica ? (
                <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded border border-red-200 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                  Actividad Crítica
                </span>
              ) : (
                <span className="text-[10px] font-mono font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded">
                  Actividad ({duracion}d)
                </span>
              )}
            </div>

            {/* Nombre del nodo */}
            <h4
              className={`text-xs font-bold leading-snug line-clamp-2 mb-2 ${
                isRoot ? 'text-white' : 'text-slate-800'
              }`}
              title={nodo.nombre}
            >
              {nodo.nombre}
            </h4>

            {/* Metadatos inferiores para tareas hoja */}
            {!isRoot && !hasChildren && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5 text-[10px]">
                {/* Fechas de inicio y fin */}
                {cpm?.fecha_inicio && cpm?.fecha_fin && (
                  <div className="flex items-center justify-between text-slate-500 font-mono text-[10px]">
                    <span className="flex items-center gap-1">
                      <Calendar size={11} className="text-slate-400 shrink-0" />
                      <span>{formatShortDate(cpm.fecha_inicio)}</span>
                    </span>
                    <span>→</span>
                    <span className="font-semibold text-slate-700">{formatShortDate(cpm.fecha_fin)}</span>
                  </div>
                )}

                {/* Responsable */}
                {responsable && (
                  <div className="flex items-center gap-1.5 pt-0.5 text-slate-600">
                    {miembro ? (
                      <>
                        <img
                          src={miembro.avatar}
                          alt={miembro.nombre}
                          className="w-4 h-4 rounded-full object-cover bg-slate-200 shrink-0"
                        />
                        <span className="truncate font-medium text-[10px] text-slate-700">
                          {miembro.nombre}
                        </span>
                      </>
                    ) : (
                      <>
                        <User size={11} className="text-slate-400 shrink-0" />
                        <span className="truncate text-[10px]">{responsable}</span>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Descripción breve si es raíz o fase */}
            {(isRoot || hasChildren) && nodo.descripcion && (
              <p
                className={`text-[10px] line-clamp-2 mt-1 leading-relaxed ${
                  isRoot ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {nodo.descripcion}
              </p>
            )}
          </div>

          {/* BOTÓN COLAPSAR / EXPANDIR HIJOS (en el borde inferior central) */}
          {hasChildren && (
            <button
              onClick={(e) => toggleCollapse(nodo.id, e)}
              className={`absolute -bottom-3 left-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full text-[9px] font-bold shadow-xs transition-transform hover:scale-110 flex items-center gap-1 cursor-pointer z-20 ${
                isCollapsed
                  ? 'bg-indigo-600 text-white border border-indigo-700 ring-2 ring-white'
                  : 'bg-white text-slate-600 border border-slate-300 hover:text-slate-900 ring-2 ring-white'
              }`}
              title={isCollapsed ? 'Expandir subtareas' : 'Colapsar subtareas'}
            >
              {isCollapsed ? (
                <>
                  <ChevronRight size={10} />
                  <span>+{nodo.children.length}</span>
                </>
              ) : (
                <>
                  <ChevronDown size={10} />
                  <span>{nodo.children.length}</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* RAMAS Y SUBÁRBOLES CONECTADOS (Líneas de organigrama) */}
        {hasChildren && !isCollapsed && (
          <div className="flex flex-col items-center w-full">
            {/* Línea vertical que desciende del nodo padre */}
            <div className="w-0.5 h-7 bg-slate-300 shrink-0" />

            {/* Fila horizontal de nodos hijos */}
            <div className="flex items-start justify-center">
              {nodo.children.map((child, index) => {
                const isFirst = index === 0;
                const isLast = index === nodo.children.length - 1;
                const isOnly = nodo.children.length === 1;

                return (
                  <div key={child.id} className="flex flex-col items-center px-4 relative">
                    {/* Barra horizontal que distribuye a los hijos */}
                    {!isOnly && (
                      <div
                        className={`absolute top-0 h-0.5 bg-slate-300 ${
                          isFirst
                            ? 'left-1/2 right-0'
                            : isLast
                            ? 'left-0 right-1/2'
                            : 'left-0 right-0'
                        }`}
                      />
                    )}

                    {/* Línea vertical que conecta la barra horizontal con el hijo */}
                    <div className="w-0.5 h-7 bg-slate-300 relative z-0 shrink-0" />

                    {/* Llamada recursiva al hijo */}
                    {renderTreeNode(child)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Generando organigrama jerárquico...</p>
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

  if (!arbolEdt.length) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center shadow-xs max-w-md w-full">
          <FolderTree size={48} className="mx-auto mb-3 text-slate-300" />
          <h3 className="text-sm font-bold text-slate-800">Sin estructura EDT</h3>
          <p className="text-xs text-slate-500 mt-1">
            Ve a la pestaña <strong>"Plan de Trabajo"</strong> para agregar fases y tareas a la EDT.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full flex-1 min-h-0 overflow-hidden gap-3">
      {/* BARRA DE HERRAMIENTAS Y CONTROLES SUPERIOR */}
      <div className="shrink-0 bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
        {/* Controles de Vista: Leyenda y Estadísticas */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
            <span className="text-slate-500 font-medium">Estructura:</span>
            <span className="font-bold text-slate-700">{stats.fases} fases</span>
            <span className="text-slate-300">•</span>
            <span className="font-bold text-slate-700">{stats.tareas} tareas</span>
            {stats.criticas > 0 && (
              <>
                <span className="text-slate-300">•</span>
                <span className="font-bold text-red-600 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                  {stats.criticas} críticas
                </span>
              </>
            )}
          </div>

          {/* Leyenda de Colores */}
          <div className="hidden lg:flex items-center gap-3 text-[11px] text-slate-600 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-900 shrink-0" />
              <span>Proyecto Raíz</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-indigo-500 shrink-0" />
              <span>Fases / Paquetes</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-500 shrink-0" />
              <span className="text-red-700 font-medium">Ruta Crítica</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 shrink-0" />
              <span>Tarea Regular</span>
            </div>
          </div>
        </div>

        {/* Acciones: Buscador, Filtros de Expansión y Zoom */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Buscador de nodos */}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en organigrama..."
              className="pl-8 pr-3 py-1 text-xs border border-slate-200 rounded-lg w-40 sm:w-48 focus:w-56 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-slate-50"
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

          {/* Botones de Colapso Global */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
            <button
              onClick={handleExpandAll}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-700 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
              title="Expandir todas las cajas del organigrama"
            >
              Expandir Todo
            </button>
            <button
              onClick={handleCollapseToPhases}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium text-slate-700 hover:text-slate-900 hover:bg-white transition-all cursor-pointer"
              title="Colapsar las tareas y ver solo las fases principales"
            >
              Solo Fases
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
              onClick={handleZoomReset}
              className="p-1 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer border-l border-slate-200 ml-0.5"
              title="Centrar organigrama"
            >
              <RotateCcw size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* LIENZO PRINCIPAL DEL ORGANIGRAMA (Canvas con Paneo y Zoom) */}
      <div
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={`flex-1 min-h-0 bg-slate-50/70 border border-slate-200 rounded-2xl overflow-auto relative p-8 md:p-12 transition-colors ${
          isPanning ? 'cursor-grabbing select-none' : 'cursor-grab'
        }`}
        style={{
          backgroundImage:
            'radial-gradient(circle, rgba(148, 163, 184, 0.22) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      >
        {/* Contenedor escalado por el Zoom */}
        <div
          className="inline-block min-w-full transition-transform duration-100 origin-top"
          style={{
            transform: `scale(${zoom})`,
          }}
        >
          <div className="flex justify-center pb-24 pt-4">
            {arbolEdt.map((rootNode) => renderTreeNode(rootNode))}
          </div>
        </div>
      </div>

      {/* MODAL / DRAWER LATERAL DE DETALLE DEL NODO SELECCIONADO */}
      {selectedNode && (() => {
        const isRoot = selectedNode.padre_id === null;
        const hasChildren = Boolean(selectedNode.children && selectedNode.children.length > 0);
        const cpm = selectedNode.actividad ? cpmMap.get(selectedNode.actividad.id) : undefined;
        const esCritica = cpm ? cpm.es_critica || cpm.holgura_total === 0 : false;
        const duracion = cpm?.duracion ?? (selectedNode.actividad?.duracion_esperada || 0);
        const resp = selectedNode.actividad?.responsable;
        const miembro = resp ? getMiembro(resp) : undefined;

        return (
          <div
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in"
            onClick={() => setSelectedNode(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Cabecera */}
              <div
                className={`p-5 text-white flex items-start justify-between ${
                  isRoot
                    ? 'bg-slate-900'
                    : hasChildren
                    ? 'bg-indigo-700'
                    : esCritica
                    ? 'bg-red-600'
                    : 'bg-blue-600'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold bg-white/20 px-2 py-0.5 rounded backdrop-blur-xs">
                      {selectedNode.codigo || 'EDT'}
                    </span>
                    <span className="text-xs uppercase tracking-wider font-semibold opacity-90">
                      {isRoot
                        ? 'Proyecto Raíz'
                        : hasChildren
                        ? selectedNode.nivel === 1
                          ? 'Fase / Entregable Principal'
                          : 'Paquete de Trabajo (Resumen)'
                        : esCritica
                        ? 'Actividad en Ruta Crítica'
                        : 'Actividad'}
                    </span>
                  </div>
                  <h3 className="text-base font-bold leading-tight">{selectedNode.nombre}</h3>
                </div>
                <button
                  onClick={() => setSelectedNode(null)}
                  className="p-1 rounded-lg hover:bg-white/20 text-white transition-colors cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Contenido del Detalle */}
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto text-xs text-slate-700">
                {/* Descripción */}
                {selectedNode.descripcion && (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                    <span className="font-semibold text-slate-500 block mb-1">Descripción:</span>
                    <p className="text-slate-700 leading-relaxed">{selectedNode.descripcion}</p>
                  </div>
                )}

                {/* Si es una tarea ejecutable con PERT / CPM */}
                {!hasChildren && selectedNode.actividad && (
                  <>
                    {/* Tarjeta de Tiempos y Fechas */}
                    <div className="grid grid-cols-2 gap-3 bg-slate-50 border border-slate-200/80 rounded-xl p-3.5">
                      <div>
                        <span className="text-slate-400 block text-[11px]">Duración Esperada (Te)</span>
                        <span className="text-sm font-bold text-slate-800 font-mono">
                          {duracion} días
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block text-[11px]">Holgura Total</span>
                        <span
                          className={`text-sm font-bold font-mono ${
                            esCritica ? 'text-red-600' : 'text-blue-700'
                          }`}
                        >
                          {cpm ? `+${cpm.holgura_total}d` : '0d'}
                        </span>
                      </div>
                      {cpm?.fecha_inicio && (
                        <div>
                          <span className="text-slate-400 block text-[11px]">Fecha de Inicio</span>
                          <span className="text-xs font-semibold text-slate-700 font-mono">
                            {formatDate(cpm.fecha_inicio)}
                          </span>
                        </div>
                      )}
                      {cpm?.fecha_fin && (
                        <div>
                          <span className="text-slate-400 block text-[11px]">Fecha de Fin</span>
                          <span className="text-xs font-semibold text-slate-700 font-mono">
                            {formatDate(cpm.fecha_fin)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Estimaciones PERT (To, Tm, Tp) */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2">
                      <span className="font-semibold text-slate-700 block">Estimaciones PERT:</span>
                      <div className="grid grid-cols-3 gap-2 text-center text-xs">
                        <div className="bg-emerald-50 border border-emerald-100 p-2 rounded-lg">
                          <span className="text-[10px] text-emerald-700 block font-medium">Optimista (To)</span>
                          <span className="font-mono font-bold text-emerald-800">
                            {selectedNode.actividad.duracion_optimista}d
                          </span>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 p-2 rounded-lg">
                          <span className="text-[10px] text-blue-700 block font-medium">Probable (Tm)</span>
                          <span className="font-mono font-bold text-blue-800">
                            {selectedNode.actividad.duracion_probable}d
                          </span>
                        </div>
                        <div className="bg-amber-50 border border-amber-100 p-2 rounded-lg">
                          <span className="text-[10px] text-amber-700 block font-medium">Pesimista (Tp)</span>
                          <span className="font-mono font-bold text-amber-800">
                            {selectedNode.actividad.duracion_pesimista}d
                          </span>
                        </div>
                      </div>
                      <div className="text-[10px] text-slate-400 text-center pt-1 font-mono">
                        Varianza: {Number(selectedNode.actividad.varianza || 0).toFixed(2)}
                      </div>
                    </div>

                    {/* Responsable asignado */}
                    {resp && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center gap-3">
                        {miembro ? (
                          <>
                            <img
                              src={miembro.avatar}
                              alt={miembro.nombre}
                              className="w-9 h-9 rounded-full object-cover ring-2 ring-white shadow-2xs"
                            />
                            <div className="min-w-0">
                              <span className="font-bold text-slate-800 block text-xs">
                                {miembro.nombre}
                              </span>
                              <span className="text-[11px] text-slate-400 block">
                                {miembro.rol}
                              </span>
                            </div>
                          </>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                              {resp.charAt(0).toUpperCase()}
                            </div>
                            <span className="font-semibold text-slate-800">{resp}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}

                {/* Si es una fase con hijos */}
                {hasChildren && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                      <span>Subtareas contenidas:</span>
                      <span className="font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                        {selectedNode.children.length} directas
                      </span>
                    </div>
                    <ul className="divide-y divide-slate-100 max-h-48 overflow-y-auto">
                      {selectedNode.children.map((child) => (
                        <li
                          key={child.id}
                          onClick={() => setSelectedNode(child)}
                          className="py-1.5 flex items-center justify-between hover:bg-white px-2 rounded cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <span className="font-mono font-bold text-[10px] text-slate-500">
                              {child.codigo}
                            </span>
                            <span className="truncate">{child.nombre}</span>
                          </div>
                          <ChevronRight size={12} className="text-slate-400 shrink-0" />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Pie del modal */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button
                  onClick={() => setSelectedNode(null)}
                  className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
