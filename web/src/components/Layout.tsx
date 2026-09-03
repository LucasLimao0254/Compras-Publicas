import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

const MENU = [
  {
    grupo: 'Administrativo',
    itens: [
      { to: '/usuarios', label: 'Usuários', recurso: 'administrativo.usuarios' },
      { to: '/secretarias', label: 'Secretarias & Responsáveis', recurso: 'administrativo.secretarias' },
    ],
  },
  {
    grupo: 'Compras',
    itens: [
      { to: '/', label: 'Dashboard', recurso: 'compras.dashboard' },
      { to: '/ordens', label: 'Painel de ordens', recurso: 'compras.ordens' },
      { to: '/contratos', label: 'Contratos', recurso: 'compras.contratos' },
      { to: '/licitacoes', label: 'Licitações', recurso: 'compras.licitacoes' },
      { to: '/fornecedores', label: 'Fornecedores', recurso: 'compras.fornecedores' },
    ],
  },
];

export function Layout() {
  const { usuario, tenant, logout, temPermissao } = useAuth();

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="w-64 shrink-0 bg-[#1f1b2e] text-slate-200 flex flex-col">
        <div className="px-4 py-4 border-b border-white/10">
          <div className="font-semibold text-white">{tenant?.nome}</div>
          <div className="text-xs text-slate-400">Código {tenant?.codigo}</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3">
          {MENU.map((grupo) => {
            const itensVisiveis = grupo.itens.filter((i) => temPermissao(i.recurso));
            if (!itensVisiveis.length) return null;
            return (
              <div key={grupo.grupo} className="mb-4">
                <div className="px-4 mb-1 text-[11px] uppercase tracking-wide text-slate-400">{grupo.grupo}</div>
                {itensVisiveis.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `block px-4 py-2 text-sm ${isActive ? 'bg-[#4C2A85] text-white' : 'text-slate-300 hover:bg-white/5'}`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
            );
          })}
        </nav>
        <div className="px-4 py-3 border-t border-white/10 text-sm">
          <div className="text-white">{usuario?.nome}</div>
          <div className="text-slate-400 text-xs mb-2">{usuario?.email}</div>
          <button onClick={logout} className="text-[#b79cf0] hover:underline text-xs">
            Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
