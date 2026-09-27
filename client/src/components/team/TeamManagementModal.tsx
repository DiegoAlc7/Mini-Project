import React, { useState } from 'react';
import { useResources } from '../../context/ResourceContext';
import {
  X,
  Users,
  UserPlus,
  Trash2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Semillas para catálogo de avatares disponibles
const AVATAR_SEEDS = [
  'Alex',
  'Sam',
  'Taylor',
  'Jordan',
  'Morgan',
  'Casey',
  'Avery',
  'Riley',
  'Cameron',
  'Harper',
  'Quinn',
  'Skyler',
];

export default function TeamManagementModal({ isOpen, onClose }: Props) {
  const { miembros, agregarMiembro, eliminarMiembro } = useResources();

  // Estados del formulario
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState('');
  const [selectedSeed, setSelectedSeed] = useState(AVATAR_SEEDS[0]);
  const [errorValidacion, setErrorValidacion] = useState('');

  // Generador de URL de avatar dinámico
  const avatarGenerado = (seed: string) =>
    `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(
      seed || 'Usuario'
    )}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`;

  // Control estricto: solo letras, acentos y espacios. Cero números y cero símbolos.
  const handleNombreChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorLimpio = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
    setNombre(valorLimpio);
    if (errorValidacion) setErrorValidacion('');
  };

  // Control estricto: solo letras, acentos y espacios. Cero números y cero símbolos.
  const handleRolChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const valorLimpio = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '');
    setRol(valorLimpio);
    if (errorValidacion) setErrorValidacion('');
  };

  if (!isOpen) return null;

  // Validación y Guardado con reactividad inmediata
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorValidacion('');

    const nombreTrim = nombre.trim();
    if (!nombreTrim) {
      setErrorValidacion('El nombre completo es obligatorio.');
      return;
    }
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(nombreTrim)) {
      setErrorValidacion('El nombre solo puede contener letras, acentos y espacios (cero números y cero símbolos).');
      return;
    }

    const rolTrim = rol.trim();
    if (!rolTrim) {
      setErrorValidacion('El rol o especialidad es obligatorio.');
      return;
    }
    if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]+$/.test(rolTrim)) {
      setErrorValidacion('El rol solo puede contener letras, acentos y espacios (cero números y cero símbolos).');
      return;
    }

    // Agregar al contexto global
    agregarMiembro({
      nombre: nombreTrim,
      rol: rolTrim,
      avatar: avatarGenerado(selectedSeed),
    });

    // Resetear formulario
    setNombre('');
    setRol('');
    setSelectedSeed(AVATAR_SEEDS[0]);
  };

  const handleEliminar = (id: string, nombreMiembro: string) => {
    if (confirm(`¿Eliminar a "${nombreMiembro}" del equipo de este proyecto?`)) {
      eliminarMiembro(id);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cabecera del Modal */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800">
                Gestión del Equipo del Proyecto
              </h2>
              <p className="text-xs text-slate-500">
                Administra los perfiles y miembros disponibles para asignar tareas.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
            title="Cerrar ventana"
          >
            <X size={18} />
          </button>
        </div>

        {/* Cuerpo del Modal: Dividido en Formulario y Lista */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Formulario de Creación con Validación */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4.5">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus size={16} className="text-blue-600" />
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Registrar Nuevo Miembro
              </h3>
            </div>

            {errorValidacion && (
              <div className="mb-3 p-2.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{errorValidacion}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Nombre completo */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Nombre completo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={nombre}
                    onChange={handleNombreChange}
                    placeholder="Ej. Mariana Gómez"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>

                {/* Rol */}
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Rol o Especialidad <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={rol}
                    onChange={handleRolChange}
                    placeholder="Ej. Arquitecto de Software"
                    className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                  />
                </div>
              </div>

              {/* Selector de Avatar */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={13} className="text-amber-500" />
                    <span>Seleccionar Avatar para el Miembro</span>
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-2.5 p-3 bg-white border border-slate-200 rounded-xl">
                  {AVATAR_SEEDS.map((seed) => {
                    const url = avatarGenerado(seed);
                    const isSelected = selectedSeed === seed;
                    return (
                      <button
                        key={seed}
                        type="button"
                        onClick={() => setSelectedSeed(seed)}
                        className={`relative p-0.5 rounded-full transition-all cursor-pointer ${
                          isSelected
                            ? 'ring-2 ring-blue-600 ring-offset-2 scale-110 shadow-xs'
                            : 'opacity-70 hover:opacity-100 hover:scale-105'
                        }`}
                        title={`Elegir avatar ${seed}`}
                      >
                        <img
                          src={url}
                          alt={seed}
                          className="w-8 h-8 rounded-full bg-slate-100 object-cover"
                        />
                        {isSelected && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-600 text-white rounded-full flex items-center justify-center text-[9px] font-bold shadow-xs ring-1 ring-white">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Botón de Guardar */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                >
                  <UserPlus size={14} />
                  <span>Registrar Miembro</span>
                </button>
              </div>
            </form>
          </div>

          {/* Listado de Miembros Actuales */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Miembros en el Equipo ({miembros.length})
              </h3>
            </div>

            {miembros.length === 0 ? (
              <div className="text-center py-8 text-slate-400 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                <Users size={32} className="mx-auto mb-2 opacity-30 text-slate-500" />
                <p className="text-xs font-semibold text-slate-600">No hay miembros en este proyecto</p>
                <p className="text-[11px] text-slate-400 mt-0.5">Usa el formulario de arriba para registrar personas al equipo.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {miembros.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all shadow-2xs group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={m.avatar}
                        alt={m.nombre}
                        className="w-9 h-9 rounded-full bg-slate-100 ring-1 ring-slate-200 shrink-0 object-cover"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 leading-tight truncate">
                          {m.nombre}
                        </p>
                        <p className="text-[11px] text-slate-500 leading-tight truncate">
                          {m.rol}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleEliminar(m.id, m.nombre)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors opacity-70 group-hover:opacity-100 cursor-pointer"
                      title={`Eliminar a ${m.nombre}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pie del Modal */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
