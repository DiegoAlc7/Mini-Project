import { useNavigate } from 'react-router-dom';
import { Trash2, Calendar, FolderTree, ListChecks } from 'lucide-react';
import type { Proyecto } from '../../types';

interface Props {
  proyecto: Proyecto;
  onDelete: (id: number) => void;
}

export default function ProyectoCard({ proyecto, onDelete }: Props) {
  const navigate = useNavigate();

  return (
    <div
      className="bg-white border border-slate-200 rounded-xl shadow-sm hover:shadow-md transition-shadow cursor-pointer p-5 flex flex-col justify-between group"
      onClick={() => navigate(`/proyecto/${proyecto.id}`)}
    >
      <div>
        {/* Cabecera de la tarjeta: Título y Acción destructiva reubicada a la derecha */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <h3
            className="text-base font-semibold text-slate-800 truncate flex-1 group-hover:text-blue-600 transition-colors"
            title={proyecto.nombre}
          >
            {proyecto.nombre}
          </h3>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (confirm('¿Eliminar este proyecto y todos sus datos?')) onDelete(proyecto.id);
            }}
            className="p-1.5 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer shrink-0 -mt-1 -mr-1"
            title="Eliminar proyecto"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Descripción */}
        <p className="text-slate-500 text-xs mb-4 line-clamp-2 leading-relaxed min-h-[2rem]">
          {proyecto.descripcion || 'Sin descripción'}
        </p>
      </div>

      {/* Metadatos inferiores tipo Píldoras (Badges) */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100/80">
        {proyecto.fecha_inicio && (
          <span className="bg-slate-50 border border-slate-100 text-slate-600 rounded-md px-2 py-1 text-xs flex items-center gap-1">
            <Calendar size={13} className="text-slate-400" />
            <span className="font-mono">{proyecto.fecha_inicio}</span>
          </span>
        )}
        {proyecto.total_nodos != null && (
          <span className="bg-slate-50 border border-slate-100 text-slate-600 rounded-md px-2 py-1 text-xs flex items-center gap-1">
            <FolderTree size={13} className="text-slate-400" />
            <span>
              <strong className="font-mono font-semibold text-slate-700">{proyecto.total_nodos}</strong>{' '}
              {proyecto.total_nodos === 1 ? 'nodo' : 'nodos'}
            </span>
          </span>
        )}
        {proyecto.total_actividades != null && (
          <span className="bg-slate-50 border border-slate-100 text-slate-600 rounded-md px-2 py-1 text-xs flex items-center gap-1">
            <ListChecks size={13} className="text-slate-400" />
            <span>
              <strong className="font-mono font-semibold text-slate-700">{proyecto.total_actividades}</strong>{' '}
              {proyecto.total_actividades === 1 ? 'actividad' : 'actividades'}
            </span>
          </span>
        )}
      </div>
    </div>
  );
}
