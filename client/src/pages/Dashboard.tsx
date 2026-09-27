import { useState, useEffect } from 'react';
import { Plus, FolderOpen } from 'lucide-react';
import type { Proyecto } from '../types';
import { getProyectos, createProyecto, deleteProyecto } from '../lib/api';
import ProyectoCard from '../components/proyecto/ProyectoCard';
import ProyectoForm from '../components/proyecto/ProyectoForm';

export default function Dashboard() {
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const cargar = async () => {
    try {
      const data = await getProyectos();
      setProyectos(data);
    } catch (err) {
      console.error('Error cargando proyectos:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  const handleCreate = async (data: { nombre: string; descripcion: string; fecha_inicio: string }) => {
    try {
      await createProyecto(data);
      setShowForm(false);
      await cargar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al crear proyecto');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteProyecto(id);
      await cargar();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Error al eliminar proyecto');
    }
  };

  if (loading) return <div className="text-center py-16 text-gray-500">Cargando proyectos...</div>;

  return (
    <div className="w-full h-full overflow-y-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Mis Proyectos</h1>
            <p className="text-slate-500 text-xs mt-1">Gestiona tus cronogramas, EDT y estimaciones PERT/CPM</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors shadow-2xs text-xs font-semibold cursor-pointer"
          >
            <Plus size={16} /> Nuevo Proyecto
          </button>
        </div>

        {proyectos.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <FolderOpen size={64} className="mx-auto mb-4 opacity-50" />
            <p className="text-lg">No hay proyectos</p>
            <p className="text-sm">Crea tu primer proyecto para comenzar</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {proyectos.map(p => (
              <ProyectoCard key={p.id} proyecto={p} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {showForm && <ProyectoForm onSubmit={handleCreate} onClose={() => setShowForm(false)} />}
      </div>
    </div>
  );
}
