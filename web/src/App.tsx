import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Ordens } from './pages/Ordens';
import { Contratos } from './pages/Contratos';
import { ContratoDetalhe } from './pages/ContratoDetalhe';
import { Licitacoes } from './pages/Licitacoes';
import { Fornecedores } from './pages/Fornecedores';
import { Secretarias } from './pages/Secretarias';
import { Usuarios } from './pages/Usuarios';

function RotaPrivada({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RotaPrivada>
            <Layout />
          </RotaPrivada>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/ordens" element={<Ordens />} />
        <Route path="/contratos" element={<Contratos />} />
        <Route path="/contratos/:id" element={<ContratoDetalhe />} />
        <Route path="/licitacoes" element={<Licitacoes />} />
        <Route path="/fornecedores" element={<Fornecedores />} />
        <Route path="/secretarias" element={<Secretarias />} />
        <Route path="/usuarios" element={<Usuarios />} />
      </Route>
    </Routes>
  );
}
