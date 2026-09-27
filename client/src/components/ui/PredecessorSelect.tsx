import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Check, X, Search, Link2 } from 'lucide-react';
import type { Dependencia, NodoEdt, Actividad } from '../../types';

interface PredecessorSelectProps {
  actividadId: number;
  predecesoras: Dependencia[];
  candidatos: { nodo: NodoEdt; actividad: Actividad }[];
  onAddDependencia: (predecesoraId: number) => Promise<void>;
  onRemoveDependencia: (depId: number) => Promise<void>;
  onClearAll?: () => Promise<void>;
  onClose: () => void;
}

interface Coords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  openUpwards: boolean;
}

export default function PredecessorSelect({
  actividadId,
  predecesoras,
  candidatos,
  onAddDependencia,
  onRemoveDependencia,
  onClose,
}: PredecessorSelectProps) {
  const [busqueda, setBusqueda] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [coords, setCoords] = useState<Coords | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Decidir dirección (arriba / abajo) y altura máxima UNA SOLA VEZ al abrir según el espacio disponible
  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth;

    const popoverWidth = Math.min(320, viewportWidth - 32);
    const spaceBelow = viewportHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 65;

    // Decidir dirección fija: no cambiará ni se reacomodará durante el scroll
    const openUpwards = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(
      300,
      openUpwards ? Math.max(160, spaceAbove - 8) : Math.max(160, spaceBelow - 8)
    );

    let left = rect.right - popoverWidth;
    if (left + popoverWidth > viewportWidth - 16) left = viewportWidth - popoverWidth - 16;
    if (left < 16) left = 16;

    setCoords({
      openUpwards,
      top: openUpwards ? undefined : Math.round(rect.bottom + 4),
      bottom: openUpwards ? Math.round(viewportHeight - rect.top + 4) : undefined,
      left: Math.round(left),
      width: popoverWidth,
      maxHeight,
    });
  }, []);

  // Foco automático en el buscador al montar
  useEffect(() => {
    if (coords) {
      searchInputRef.current?.focus();
    }
  }, [coords !== null]);



  // Al hacer scroll en la tabla, la ventana SIGUE al campo en tiempo real y permanece fija abajo/arriba de él
  // Sin cambiar de dirección, sin saltar ni reacomodarse.
  useEffect(() => {
    let rafId: number | null = null;

    const handleWindowScroll = (e: Event) => {
      // Ignorar eventos de scroll dentro del popover
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

        // Si la fila se fue completamente fuera de la vista visible de la pantalla, cerrar
        if (rect.bottom < 0 || rect.top > viewportHeight) {
          onClose();
          return;
        }

        // Mantener la ventana anclada rígidamente abajo (o arriba) del campo
        const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
        setCoords((prev) => {
          if (!prev) return null;
          let left = rect.right - prev.width;
          if (left + prev.width > viewportWidth - 16) left = viewportWidth - prev.width - 16;
          if (left < 16) left = 16;

          if (prev.openUpwards) {
            return {
              ...prev,
              left: Math.round(left),
              bottom: Math.round(viewportHeight - rect.top + 4),
            };
          } else {
            return {
              ...prev,
              left: Math.round(left),
              top: Math.round(rect.bottom + 4),
            };
          }
        });
      });
    };

    const handleWindowResize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const popoverWidth = Math.min(320, viewportWidth - 32);
      let left = rect.right - popoverWidth;
      if (left + popoverWidth > viewportWidth - 16) left = viewportWidth - popoverWidth - 16;
      if (left < 16) left = 16;

      setCoords((prev) => (prev ? { ...prev, left: Math.round(left), width: popoverWidth } : null));
    };

    window.addEventListener('scroll', handleWindowScroll, true);
    window.addEventListener('resize', handleWindowResize);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', handleWindowScroll, true);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [onClose]);

  // Aislamiento de eventos wheel para que el scroll de la lista interna no mueva la tabla
  useEffect(() => {
    if (!coords) return;
    const popoverEl = popoverRef.current;
    if (!popoverEl) return;

    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();
      const listEl = listRef.current;
      if (!listEl) {
        e.preventDefault();
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = listEl;
      const isAtTop = scrollTop <= 0;
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1;

      if (
        scrollHeight <= clientHeight ||
        (e.deltaY < 0 && isAtTop) ||
        (e.deltaY > 0 && isAtBottom)
      ) {
        e.preventDefault();
      }
    };

    popoverEl.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      popoverEl.removeEventListener('wheel', handleWheel);
    };
  }, [coords !== null]);

  // Cerrar al hacer clic fuera o presionar Escape (compatible con React Portal)
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        onClose();
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Filtrar candidatos disponibles aplicando las 3 reglas
  const candidatosFiltrados = useMemo(() => {
    return candidatos.filter((c) => {
      if (c.actividad.id === actividadId) return false;

      const tieneAEstaComoPredecesora = c.actividad.predecesoras?.some(
        (p) => p.predecesora_id === actividadId
      );
      if (tieneAEstaComoPredecesora) return false;

      // Filtro de búsqueda
      if (busqueda.trim()) {
        const term = busqueda.toLowerCase().trim();
        return (
          c.nodo.codigo.toLowerCase().includes(term) ||
          c.nodo.nombre.toLowerCase().includes(term)
        );
      }

      return true;
    });
  }, [candidatos, busqueda, actividadId]);

  const handleToggle = async (candidatoActividadId: number) => {
    if (procesando) return;
    setProcesando(true);
    try {
      const depExistente = predecesoras.find(
        (p) => p.predecesora_id === candidatoActividadId
      );
      if (depExistente) {
        await onRemoveDependencia(depExistente.id);
      } else {
        await onAddDependencia(candidatoActividadId);
      }
    } finally {
      setProcesando(false);
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      {/* Visualización activa en la celda */}
      <div className="flex flex-wrap items-center gap-1 min-h-[22px] px-1.5 py-0.5 bg-white border border-blue-400 rounded-md ring-1 ring-blue-400 text-xs">
        {predecesoras && predecesoras.length > 0 ? (
          predecesoras.map((dep) => (
            <span
              key={dep.id}
              className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-1 py-0.2 rounded text-[11px] font-mono font-medium"
            >
              {dep.predecesora_codigo}
            </span>
          ))
        ) : (
          <span className="text-slate-400 text-[11px] italic">Sin predecesoras</span>
        )}
      </div>

      {/* Renderizado mediante Portal en document.body para evitar recorte y fijado abajo del campo */}
      {coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              left: `${coords.left}px`,
              ...(coords.openUpwards
                ? { bottom: `${coords.bottom}px` }
                : { top: `${coords.top}px` }),
              maxHeight: `${coords.maxHeight}px`,
              width: `${coords.width}px`,
            }}
            className={`bg-white border border-slate-200 rounded-xl shadow-2xl z-[9999] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-100 ${
              coords.openUpwards ? 'origin-bottom-right' : 'origin-top-right'
            }`}
          >
            {/* Cabecera estática */}
            <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-slate-700 text-xs font-bold">
                <Link2 size={13} className="text-blue-600" />
                <span>Predecesoras</span>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer transition-colors"
                title="Cerrar"
              >
                <X size={14} />
              </button>
            </div>

            {/* Buscador anclado y estático */}
            <div className="shrink-0 p-2 border-b border-slate-100 bg-white sticky top-0 z-10">
              <div className="relative">
                <Search
                  size={12}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar por código o nombre..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-md pl-7 pr-7 py-1 text-[11px] outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-colors"
                />
                {busqueda && (
                  <button
                    type="button"
                    onClick={() => setBusqueda('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    title="Limpiar búsqueda"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>

            {/* Lista de scroll fluido */}
            <ul
              ref={listRef}
              data-allow-scroll="true"
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-slate-50 m-0 p-0 list-none popover-scroll-container"
            >
              {candidatosFiltrados.length === 0 ? (
                <li className="p-4 text-center text-slate-400 text-xs list-none">
                  {candidatos.length === 0
                    ? 'No hay otras tareas disponibles para vincular.'
                    : 'No se encontraron tareas coincidentes.'}
                </li>
              ) : (
                candidatosFiltrados.map((c) => {
                  const isLinked = predecesoras.some(
                    (p) => p.predecesora_id === c.actividad.id
                  );
                  return (
                    <li key={c.actividad.id} className="list-none">
                      <button
                        type="button"
                        onClick={() => handleToggle(c.actividad.id)}
                        disabled={procesando}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                          isLinked ? 'bg-blue-50/70' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              isLinked
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isLinked && <Check size={11} strokeWidth={3} />}
                          </div>
                          <span className="font-mono font-semibold text-xs text-blue-700 shrink-0">
                            {c.nodo.codigo}
                          </span>
                          <span className="text-xs text-slate-700 truncate font-medium">
                            {c.nodo.nombre}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono shrink-0">
                          {c.actividad.duracion_esperada}d
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {/* Pie estático */}
            <div className="shrink-0 p-2 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between">
              <span className="text-[10px] text-slate-400 font-medium">
                {predecesoras.length}{' '}
                {predecesoras.length === 1 ? 'vinculada' : 'vinculadas'}
              </span>
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
