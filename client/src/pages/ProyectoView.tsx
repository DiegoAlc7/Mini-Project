import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  TableProperties,
  BarChart3,
  Users,
  PanelLeftClose,
  PanelLeftOpen,
  Calendar,
  Clock,
  CheckSquare,
  ChevronRight,
  Pencil,
} from 'lucide-react';
import type { Proyecto, CpmResponse } from '../types';
import { getProyecto, getCpm, updateProyecto } from '../lib/api';
import TreeGrid from '../components/treegrid/TreeGrid';
import GanttChart from '../components/gantt/GanttChart';
import ProyectoForm from '../components/proyecto/ProyectoForm';
import TeamManagementModal from '../components/team/TeamManagementModal';
import { ProjectResourceProvider, useResources } from '../context/ResourceContext';

type Tab = 'plan' | 'gantt';

function formatFechaLegible(dStr?: string): string {
  if (!dStr) return '';
  const parts = dStr.split('-').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return dStr;
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const fecha = new Date(parts[0], parts[1] - 1, parts[2]);
  return `${fecha.getDate()} ${meses[fecha.getMonth()]} ${fecha.getFullYear()}`;
}

function formatRangoFechas(fechaInicioStr?: string, fechaFinStr?: string): string {
  if (!fechaInicioStr) return '';

  const parseDate = (dStr: string) => {
    const parts = dStr.split('-').map(Number);
    if (parts.length === 3 && !parts.some(isNaN)) {
      return new Date(parts[0], parts[1] - 1, parts[2]);
    }
    return new Date(dStr);
  };

  const fIni = parseDate(fechaInicioStr);
  const fFin = fechaFinStr ? parseDate(fechaFinStr) : fIni;

  if (isNaN(fIni.getTime())) return fechaInicioStr;
  if (isNaN(fFin.getTime())) return fechaInicioStr;

  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  const diaIni = fIni.getDate();
  const mesIni = meses[fIni.getMonth()];
  const anioIni = fIni.getFullYear();

  const diaFin = fFin.getDate();
  const mesFin = meses[fFin.getMonth()];
  const anioFin = fFin.getFullYear();

  if (fechaInicioStr === fechaFinStr || !fechaFinStr) {
    return `${diaIni} ${mesIni} ${anioIni}`;
  }

  if (anioIni === anioFin) {
    return `${diaIni} ${mesIni} - ${diaFin} ${mesFin} ${anioFin}`;
  }

  return `${diaIni} ${mesIni} ${anioIni} - ${diaFin} ${mesFin} ${anioFin}`;
}

function ProyectoContent({
  proyecto,
  onProyectoUpdate,
  activeTab,
  setActiveTab,
}: {
  proyecto: Proyecto;
  onProyectoUpdate: (p: Proyecto) => void;
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
}) {
  const navigate = useNavigate();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isTeamModalOpen, setIsTeamModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const { miembros } = useResources();
  const [dataVersion, setDataVersion] = useState(0);
  const [soloHabiles, setSoloHabiles] = useState<boolean>(false);
  const [cpmData, setCpmData] = useState<CpmResponse | null>(null);
  const [cpmLoading, setCpmLoading] = useState(false);

  const fetchCpm = useCallback(() => {
    setCpmLoading(true);
    getCpm(proyecto.id, soloHabiles)
      .then((data) => setCpmData(data))
      .catch((err) => console.error('Error al cargar métricas CPM en cabecera:', err))
      .finally(() => setCpmLoading(false));
  }, [proyecto.id, soloHabiles]);

  useEffect(() => {
    fetchCpm();
  }, [fetchCpm, dataVersion, soloHabiles]);

  const handleDataChange = useCallback(() => {
    setDataVersion((v) => v + 1);
  }, []);

  const handleProyectoEdit = async (data: { nombre: string; descripcion: string; fecha_inicio: string }) => {
    try {
      const updated = await updateProyecto(proyecto.id, data);
      onProyectoUpdate(updated);
      setIsEditModalOpen(false);
      handleDataChange();
      fetchCpm();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al actualizar proyecto');
    }
  };

  const infoFechas = useMemo(() => {
    if (!cpmData) return null;
    let inicio = cpmData.fecha_inicio;
    let fin = cpmData.fecha_fin;

    if (cpmData.actividades && cpmData.actividades.length > 0) {
      for (const act of cpmData.actividades) {
        if (act.fecha_inicio && (!inicio || act.fecha_inicio < inicio)) {
          inicio = act.fecha_inicio;
        }
        if (act.fecha_fin && (!fin || act.fecha_fin > fin)) {
          fin = act.fecha_fin;
        }
      }
    }

    if (!inicio) return null;
    return {
      rangoTexto: formatRangoFechas(inicio, fin),
      inicioLegible: formatFechaLegible(inicio),
      finLegible: formatFechaLegible(fin),
      inicio,
      fin,
    };
  }, [cpmData]);

  return (
    <div className="flex flex-row h-full w-full flex-1 min-h-0 overflow-hidden">
      {/* PANEL LATERAL IZQUIERDO */}
      <aside
        className={`bg-[#F9F9FB] border-r border-slate-200 flex flex-col shrink-0 h-full overflow-hidden transition-all duration-300 z-10 ${
          isSidebarCollapsed ? 'w-16' : 'w-64 md:w-72'
        }`}
      >
        {/* Cabecera Unificada Minimalista del Panel Lateral */}
        {!isSidebarCollapsed ? (
          <div className="flex items-center justify-between w-full min-h-[3rem] h-[53px] px-3 border-b border-slate-200/80 shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <button
                onClick={() => navigate('/')}
                className="flex items-center justify-center p-1.5 md:p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer shrink-0"
                title="Volver a Mis Proyectos"
              >
                <ArrowLeft size={16} />
              </button>
              <Link
                to="/"
                className="flex items-center gap-2.5 min-w-0 hover:opacity-90 transition-opacity"
                title="Volver a Mis Proyectos"
              >
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[12.5px] font-bold tracking-tight shrink-0 shadow-xs border border-slate-800 select-none">
                  MP
                </div>
                <span className="text-base font-bold text-slate-800 tracking-tight truncate">
                  Mini-Project
                </span>
              </Link>
            </div>
            <button
              onClick={() => setIsSidebarCollapsed(true)}
              className="flex items-center justify-center p-1.5 md:p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-md transition-colors cursor-pointer shrink-0"
              title="Colapsar panel lateral"
            >
              <PanelLeftClose size={16} />
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-center w-full min-h-[3rem] h-[53px] border-b border-slate-200/80 shrink-0">
            <button
              onClick={() => setIsSidebarCollapsed(false)}
              className="flex items-center justify-center w-9 h-9 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              title="Expandir panel lateral"
            >
              <PanelLeftOpen size={18} />
            </button>
          </div>
        )}

        {/* Lista de Navegación / Vistas */}
        <div className="p-3 flex-1 flex flex-col justify-between overflow-y-auto">
          <div className="space-y-1.5">
            {isSidebarCollapsed && (
              <button
                onClick={() => navigate('/')}
                className="w-full flex items-center justify-center p-2.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all cursor-pointer mb-2"
                title="Volver a Mis Proyectos"
              >
                <ArrowLeft size={18} />
              </button>
            )}

            {!isSidebarCollapsed && (
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-2 block mb-2">
                Vistas del Proyecto
              </span>
            )}

            {/* Pestaña: Plan de Trabajo */}
            {!isSidebarCollapsed ? (
              <button
                onClick={() => setActiveTab('plan')}
                className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                  activeTab === 'plan'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 mt-0.5 transition-colors ${
                    activeTab === 'plan'
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-400'
                  }`}
                >
                  <TableProperties size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold leading-tight">Plan de Trabajo</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    EDT, PERT y Recursos
                  </div>
                </div>
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('plan')}
                className={`w-full flex items-center justify-center p-2.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'plan'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-400 hover:bg-slate-200/50 hover:text-slate-800'
                }`}
                title="Plan de Trabajo (EDT & PERT)"
              >
                <TableProperties size={18} />
              </button>
            )}

            {/* Pestaña: Diagrama de Gantt */}
            {!isSidebarCollapsed ? (
              <button
                onClick={() => setActiveTab('gantt')}
                className={`w-full flex items-start gap-2.5 px-3 py-2 rounded-xl text-left transition-all cursor-pointer ${
                  activeTab === 'gantt'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80 font-semibold'
                    : 'text-slate-600 hover:bg-slate-200/50 hover:text-slate-900 border border-transparent'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 mt-0.5 transition-colors ${
                    activeTab === 'gantt'
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-400'
                  }`}
                >
                  <BarChart3 size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold leading-tight">Diagrama de Gantt</div>
                  <div className="text-[10px] text-slate-400 truncate mt-0.5">
                    Línea de Tiempo y Ruta Crítica
                  </div>
                </div>
              </button>
            ) : (
              <button
                onClick={() => setActiveTab('gantt')}
                className={`w-full flex items-center justify-center p-2.5 rounded-xl transition-all cursor-pointer ${
                  activeTab === 'gantt'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-400 hover:bg-slate-200/50 hover:text-slate-800'
                }`}
                title="Diagrama de Gantt"
              >
                <BarChart3 size={18} />
              </button>
            )}
          </div>

          {/* Sección de Gestión de Equipo */}
          <div className="pt-4 border-t border-slate-200/80">
            {!isSidebarCollapsed ? (
              <div>
                <div className="px-2 pb-1.5 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  <span>Equipo del Proyecto</span>
                  <span className="bg-slate-200/80 text-slate-600 px-1.5 py-0.2 rounded-full text-[9px] font-bold">
                    {miembros.length}
                  </span>
                </div>

                {/* Previsualización de Avatares del Equipo */}
                <div className="px-2 py-2 flex items-center -space-x-1.5 overflow-hidden">
                  {miembros.slice(0, 4).map((m) => (
                    <img
                      key={m.id}
                      src={m.avatar}
                      alt={m.nombre}
                      className="w-7 h-7 rounded-full ring-2 ring-[#F9F9FB] object-cover bg-slate-100 shadow-2xs shrink-0 select-none"
                      title={`${m.nombre} (${m.rol})`}
                    />
                  ))}
                  {miembros.length > 4 && (
                    <div className="w-7 h-7 rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold ring-2 ring-[#F9F9FB] flex items-center justify-center shrink-0">
                      +{miembros.length - 4}
                    </div>
                  )}
                  {miembros.length === 0 && (
                    <span className="text-[11px] text-slate-400 italic">Sin miembros asignados</span>
                  )}
                </div>

                <button
                  onClick={() => setIsTeamModalOpen(true)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 mt-1.5 bg-white hover:bg-slate-100/80 border border-slate-200 text-slate-700 rounded-xl text-xs font-medium transition-all shadow-2xs cursor-pointer"
                >
                  <Users size={14} className="text-slate-500" />
                  <span>Gestionar Equipo</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <button
                  onClick={() => setIsTeamModalOpen(true)}
                  className="relative p-2.5 text-slate-400 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-colors cursor-pointer"
                  title={`Gestionar Equipo (${miembros.length} miembros)`}
                >
                  <Users size={18} />
                  {miembros.length > 0 && (
                    <span className="absolute -top-1 -right-1 bg-slate-800 text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center ring-2 ring-white">
                      {miembros.length}
                    </span>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ÁREA DE CONTENIDO PRINCIPAL (DERECHA) */}
      <div className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-slate-50/60">
        {/* Cabecera de Página (Page Header) */}
        <div className="bg-white border-b border-slate-200/80 px-6 py-4 shrink-0 shadow-2xs">
          {/* Fila superior: Migas de pan */}
          <div className="flex items-center mb-2">
            <nav className="flex items-center gap-1.5 text-xs text-slate-400 font-medium">
              <button
                onClick={() => navigate('/')}
                className="hover:text-slate-700 transition-colors cursor-pointer"
              >
                Proyectos
              </button>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="text-slate-600 font-semibold">
                {activeTab === 'plan' ? 'Plan de Trabajo' : 'Diagrama de Gantt'}
              </span>
            </nav>
          </div>

          {/* Fila principal: Título H1 + Botón de Edición + Píldoras de Estadísticas */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <h1
                className="text-2xl font-bold text-slate-800 tracking-tight truncate max-w-xl lg:max-w-2xl"
                title={proyecto.nombre}
              >
                {proyecto.nombre}
              </h1>
              <button
                onClick={() => setIsEditModalOpen(true)}
                className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Editar información del proyecto (nombre, descripción, fecha de inicio)"
              >
                <Pencil size={17} />
              </button>
            </div>

            {/* Píldoras/Badges de Estadísticas */}
            <div className="flex items-center gap-2 shrink-0 flex-wrap sm:flex-nowrap">
              {cpmData ? (
                <>
                  {infoFechas && (
                    <div
                      className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs"
                      title={
                        infoFechas.fin && infoFechas.inicio !== infoFechas.fin
                          ? `Inicio: ${infoFechas.inicioLegible} • Fin exacto: ${infoFechas.finLegible}`
                          : `Fecha: ${infoFechas.inicioLegible}`
                      }
                    >
                      <Calendar size={13} className="text-slate-400" />
                      <span>{infoFechas.rangoTexto}</span>
                    </div>
                  )}
                  <div
                    className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs"
                    title={`Duración: ${cpmData.duracion_total} ${soloHabiles ? 'días hábiles laborables (lunes a viernes)' : 'días calendario continuos'}`}
                  >
                    <Clock size={13} className="text-slate-400" />
                    <span>
                      <strong className="font-semibold text-slate-800">{cpmData.duracion_total}</strong>{' '}
                      {soloHabiles ? 'días hábiles' : 'días'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 shadow-2xs">
                    <CheckSquare size={13} className="text-slate-400" />
                    <span>
                      <strong className="font-semibold text-slate-800">
                        {cpmData.actividades ? cpmData.actividades.length : (proyecto.total_actividades || 0)}
                      </strong>{' '}
                      {(cpmData.actividades ? cpmData.actividades.length : (proyecto.total_actividades || 0)) === 1
                        ? 'tarea'
                        : 'tareas'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-red-50 text-red-600 border border-red-200 shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span>
                      <strong className="font-semibold">{cpmData.ruta_critica.length}</strong>{' '}
                      {cpmData.ruta_critica.length === 1 ? 'tarea crítica' : 'tareas críticas'}
                    </span>
                  </div>
                </>
              ) : (
                cpmLoading && (
                  <span className="text-xs text-slate-400 animate-pulse">
                    Calculando métricas...
                  </span>
                )
              )}
            </div>
          </div>
        </div>

        {/* Envoltorio de la Vista que ocupa estrictamente el espacio restante con pestañas persistentes */}
        <div className="flex-1 min-h-0 w-full p-3.5 md:p-5 flex flex-col overflow-hidden">
          <div className={`flex-1 min-h-0 overflow-y-auto ${activeTab === 'plan' ? 'block' : 'hidden'}`}>
            <TreeGrid proyectoId={proyecto.id} onDataChange={handleDataChange} dataVersion={dataVersion} />
          </div>
          <div className={`flex-1 min-h-0 flex flex-col ${activeTab === 'gantt' ? 'flex' : 'hidden'}`}>
            <GanttChart
              proyectoId={proyecto.id}
              dataVersion={dataVersion}
              isActive={activeTab === 'gantt'}
              soloHabiles={soloHabiles}
              onSoloHabilesChange={setSoloHabiles}
            />
          </div>
        </div>
      </div>

      {/* Modal de Gestión de Equipo */}
      <TeamManagementModal
        isOpen={isTeamModalOpen}
        onClose={() => setIsTeamModalOpen(false)}
      />

      {/* Modal de Edición de Proyecto */}
      {isEditModalOpen && (
        <ProyectoForm
          initial={{
            nombre: proyecto.nombre,
            descripcion: proyecto.descripcion || '',
            fecha_inicio: proyecto.fecha_inicio,
          }}
          onSubmit={handleProyectoEdit}
          onClose={() => setIsEditModalOpen(false)}
        />
      )}
    </div>
  );
}

export default function ProyectoView() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [proyecto, setProyecto] = useState<Proyecto | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('plan');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getProyecto(Number(id))
      .then(setProyecto)
      .catch(() => navigate('/'))
      .finally(() => setLoading(false));
  }, [id, navigate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-gray-500 text-sm">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mr-2" />
        Cargando proyecto...
      </div>
    );
  }

  if (!proyecto) return null;

  return (
    <ProjectResourceProvider proyectoId={proyecto.id} proyectoNombre={proyecto.nombre}>
      <ProyectoContent
        proyecto={proyecto}
        onProyectoUpdate={setProyecto}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </ProjectResourceProvider>
  );
}

