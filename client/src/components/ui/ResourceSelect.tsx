import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useResources } from '../../context/ResourceContext';
import { ChevronDown, User, Check, X } from 'lucide-react';

interface Props {
  value?: string;
  onChange: (nombre: string) => void;
  disabled?: boolean;
  defaultOpen?: boolean;
  onClose?: () => void;
}

interface Coords {
  top?: number;
  bottom?: number;
  left: number;
  width: number;
  maxHeight: number;
  openUpwards: boolean;
}

export default function ResourceSelect({
  value,
  onChange,
  disabled,
  defaultOpen,
  onClose,
}: Props) {
  const { miembros, getMiembro } = useResources();
  const [isOpen, setIsOpen] = useState(defaultOpen ?? false);
  const [coords, setCoords] = useState<Coords | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const miembroActual = getMiembro(value);

  // Decidir dirección y dimensiones fijas una sola vez al abrir
  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    const popoverWidth = Math.max(260, Math.round(rect.width));
    const spaceBelow = viewportHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 65;

    const openUpwards = spaceBelow < 250 && spaceAbove > spaceBelow;
    const maxHeight = Math.min(
      280,
      openUpwards ? Math.max(140, spaceAbove - 8) : Math.max(140, spaceBelow - 8)
    );

    let left = rect.left;
    if (left + popoverWidth > viewportWidth - 16) {
      left = viewportWidth - popoverWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    setCoords({
      openUpwards,
      top: openUpwards ? undefined : Math.round(rect.bottom + 4),
      bottom: openUpwards ? Math.round(viewportHeight - rect.top + 4) : undefined,
      left: Math.round(left),
      width: popoverWidth,
      maxHeight,
    });
  }, [isOpen]);



  // Al hacer scroll en la tabla, seguir al campo rígidamente sin reacomodar dirección ni altura
  useEffect(() => {
    if (!isOpen) {
      setCoords(null);
      return;
    }

    let rafId: number | null = null;

    const handleWindowScroll = (e: Event) => {
      if (popoverRef.current && popoverRef.current.contains(e.target as Node)) {
        return;
      }

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!triggerRef.current) return;
        const rect = triggerRef.current.getBoundingClientRect();
        const viewportHeight = window.innerHeight;

        if (rect.bottom < 0 || rect.top > viewportHeight) {
          setIsOpen(false);
          onClose?.();
          return;
        }

        const viewportWidth = window.innerWidth;
        setCoords((prev) => {
          if (!prev) return null;
          let left = rect.left;
          if (left + prev.width > viewportWidth - 16) {
            left = viewportWidth - prev.width - 16;
          }
          if (left < 16) {
            left = 16;
          }

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
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const popoverWidth = Math.max(260, Math.round(rect.width));
      let left = rect.left;
      if (left + popoverWidth > window.innerWidth - 16) {
        left = window.innerWidth - popoverWidth - 16;
      }
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
  }, [isOpen, onClose]);

  // AISLAMIENTO TOTAL DEL SCROLL de la lista interna
  useEffect(() => {
    if (!isOpen || !coords) return;
    const popoverEl = popoverRef.current;
    if (!popoverEl) return;

    const handleWheel = (e: WheelEvent) => {
      e.stopPropagation();

      const scrollEl = listRef.current;
      if (!scrollEl) {
        e.preventDefault();
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
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
  }, [isOpen, coords !== null]);

  // Cerrar al hacer clic fuera o presionar Escape
  useEffect(() => {
    if (!isOpen) return;

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        triggerRef.current &&
        !triggerRef.current.contains(target) &&
        popoverRef.current &&
        !popoverRef.current.contains(target)
      ) {
        setIsOpen(false);
        onClose?.();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
        onClose?.();
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (disabled) {
    return <span className="text-slate-300 text-center block">—</span>;
  }

  return (
    <div className="relative w-full">
      {/* Botón trigger del selector */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            onClose?.();
          } else {
            setIsOpen(true);
          }
        }}
        className={`w-full flex items-center justify-between gap-1.5 px-1.5 h-[36px] box-border rounded-md text-xs border transition-colors text-left bg-transparent hover:bg-slate-100/70 focus:outline-none cursor-pointer ${
          isOpen
            ? 'bg-white border-blue-500 ring-1 ring-blue-500 shadow-xs'
            : 'border-transparent'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {miembroActual ? (
            <>
              <img
                src={miembroActual.avatar}
                alt={miembroActual.nombre}
                className="w-6 h-6 rounded-full bg-slate-100 ring-1 ring-slate-200 shrink-0 object-cover"
              />
              <div className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-slate-800 text-xs block leading-tight truncate">
                  {miembroActual.nombre}
                </span>
                <span className="text-[10px] text-slate-400 block leading-tight truncate">
                  {miembroActual.rol}
                </span>
              </div>
            </>
          ) : value ? (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-bold text-[10px] shrink-0">
                {value.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1 truncate">
                <span className="font-semibold text-slate-700 text-xs block leading-tight truncate">
                  {value}
                </span>
                <span className="text-[10px] text-amber-600 block leading-tight truncate">
                  Asignado
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <div className="w-6 h-6 rounded-full bg-slate-100 border border-dashed border-slate-300 flex items-center justify-center text-slate-400 shrink-0">
                <User size={12} />
              </div>
              <div className="min-w-0 flex-1 truncate">
                <span className="text-xs text-slate-400 italic block leading-tight truncate">Asignar responsable...</span>
                <span className="text-[10px] text-transparent select-none block leading-tight">--</span>
              </div>
            </div>
          )}
        </div>
        <ChevronDown size={12} className="text-slate-400 shrink-0 ml-1" />
      </button>

      {/* Menú desplegable renderizado mediante Portal en document.body con scroll tracking fijo */}
      {isOpen &&
        coords &&
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
              coords.openUpwards ? 'origin-bottom-left' : 'origin-top-left'
            }`}
          >
            {/* Cabecera estática */}
            <div className="shrink-0 px-3 py-2 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between text-[10px] uppercase font-bold text-slate-400 tracking-wider">
              <span>Equipo del Proyecto</span>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onClose?.();
                }}
                className="text-slate-400 hover:text-slate-600 p-0.5 rounded cursor-pointer transition-colors"
                title="Cerrar"
              >
                <X size={13} />
              </button>
            </div>

            {/* Lista con scroll exclusivo y overscroll-contain */}
            <div
              ref={listRef}
              data-allow-scroll="true"
              className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-slate-50 select-none popover-scroll-container"
            >
              {miembros.length === 0 ? (
                <div className="p-3 text-center text-slate-400 text-xs">
                  <p className="font-medium text-slate-600">Sin miembros</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Usa "Gestionar Recursos" para registrar integrantes.
                  </p>
                </div>
              ) : (
                miembros.map((m) => {
                  const isSelected = miembroActual?.id === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => {
                        onChange(m.nombre);
                        setIsOpen(false);
                        onClose?.();
                      }}
                      className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 text-left hover:bg-slate-50 transition-colors cursor-pointer ${
                        isSelected ? 'bg-blue-50/70' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={m.avatar}
                          alt={m.nombre}
                          className="w-7 h-7 rounded-full bg-slate-100 ring-1 ring-slate-200 shrink-0 object-cover"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-800 leading-tight">
                            {m.nombre}
                          </p>
                          <p className="text-[10px] text-slate-500 leading-tight truncate">
                            {m.rol}
                          </p>
                        </div>
                      </div>

                      {isSelected && (
                        <Check size={14} className="text-blue-600 shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Opción para desasignar (Pie estático) */}
            {(miembroActual || value) && (
              <div className="shrink-0 border-t border-slate-100 p-1.5 bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                    onClose?.();
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-2 py-1 text-[11px] text-slate-600 hover:text-red-600 hover:bg-white rounded transition-colors cursor-pointer font-medium"
                >
                  <X size={12} />
                  <span>Desasignar responsable</span>
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}
