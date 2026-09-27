import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ProyectoView from './pages/ProyectoView';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="proyecto/:id" element={<ProyectoView />} />
      </Route>
    </Routes>
  );
}

export default App;
