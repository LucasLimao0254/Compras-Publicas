import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { PainelOrdens } from './pages/PainelOrdens';
import { Contratos } from './pages/Contratos';
import { ContratoDetalhe } from './pages/ContratoDetalhe';
import { Atas } from './pages/Atas';
import { AtaDetalhe } from './pages/AtaDetalhe';
import { Licitacoes } from './pages/Licitacoes';
import { LicitacaoDetalhe } from './pages/LicitacaoDetalhe';
import { Fornecedores } from './pages/Fornecedores';
import { FornecedorProcessos } from './pages/FornecedorProcessos';
import { Secretarias } from './pages/Secretarias';
import { Usuarios } from './pages/Usuarios';
import { UnidadesExecutoras } from './pages/UnidadesExecutoras';
import { ConfiguracoesCompras } from './pages/ConfiguracoesCompras';
import { Plataforma } from './pages/Plataforma';

function RotaPrivada({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RotaPlataforma({ children }: { children: React.ReactNode }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  if (!usuario.ehAdminPlataforma) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Ordem de preferência da tela inicial. Quem não tem a Visão geral (ex.: um
// usuário só de RH) era mandado para ela depois do login e via a tela
// quebrar com "sem permissão"; agora vai para a primeira que pode abrir.
const TELAS_INICIAIS: [string, string][] = [
  ['compras.dashboard', '/'],
  ['compras.ordens', '/ordens'],
  ['compras.contratos', '/contratos'],
  ['compras.atas', '/atas'],
  ['compras.licitacoes', '/licitacoes'],
  ['compras.fornecedores', '/fornecedores'],
  ['compras.configuracoes', '/configuracoes'],
  ['administrativo.usuarios', '/usuarios'],
  ['administrativo.secretarias', '/secretarias'],
];

function PaginaInicial() {
  const { temPermissao } = useAuth();
  if (temPermissao('compras.dashboard')) return <Dashboard />;
  const destino = TELAS_INICIAIS.find(([recurso]) => temPermissao(recurso));
  if (destino) return <Navigate to={destino[1]} replace />;
  return (
    <div className="content-page text-muted">
      Seu usuário ainda não tem acesso a nenhum módulo. Peça ao administrador do município para liberar.
    </div>
  );
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
        <Route path="/" element={<PaginaInicial />} />
        <Route path="/ordens" element={<PainelOrdens />} />
        <Route path="/contratos" element={<Contratos />} />
        <Route path="/contratos/:id" element={<ContratoDetalhe />} />
        <Route path="/atas" element={<Atas />} />
        <Route path="/atas/:id" element={<AtaDetalhe />} />
        <Route path="/licitacoes" element={<Licitacoes />} />
        <Route path="/licitacoes/:id" element={<LicitacaoDetalhe />} />
        <Route path="/fornecedores" element={<Fornecedores />} />
        <Route path="/fornecedores/:id" element={<FornecedorProcessos />} />
        <Route path="/secretarias" element={<Secretarias />} />
        <Route path="/usuarios" element={<Usuarios />} />
        <Route path="/unidades-executoras" element={<UnidadesExecutoras />} />
        <Route path="/configuracoes" element={<ConfiguracoesCompras />} />
        <Route path="/plataforma" element={<RotaPlataforma><Plataforma /></RotaPlataforma>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
