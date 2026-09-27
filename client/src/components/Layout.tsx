import { Outlet, Link, useLocation } from 'react-router-dom';

export default function Layout() {
  const location = useLocation();
  const isProyectoView = location.pathname.startsWith('/proyecto/');

  return (
    <div className="h-screen w-screen overflow-hidden bg-slate-50 flex flex-col">
      {/* Header global: diseño minimalista corporativo (Linear/Notion) */}
      {!isProyectoView && (
        <header className="bg-white text-slate-800 shadow-2xs z-20 shrink-0 border-b border-slate-200">
          <div className="w-full px-6 h-[53px] flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Link to="/" className="flex items-center gap-2.5 hover:opacity-90 transition-opacity">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center text-[12.5px] font-bold tracking-tight shrink-0 shadow-xs border border-slate-800 select-none">
                  MP
                </div>
                <span className="text-base font-bold text-slate-800 tracking-tight">Mini-Project</span>
              </Link>
              <span className="hidden sm:inline-block text-slate-500 text-xs px-2.5 py-0.5 bg-slate-100 rounded-full font-medium border border-slate-200/60">
                Gestión de Proyectos
              </span>
            </div>
          </div>
        </header>
      )}

      {/* Contenido principal flexbox dinámico sin scroll de página */}
      <main className="w-full flex-1 min-h-0 flex flex-col overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}

