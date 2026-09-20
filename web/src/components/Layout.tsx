import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { api } from '../lib/api';

// Rota de cada módulo do Setor de Compras — o catálogo (GET /modulos) diz
// QUAIS módulos o tenant tem habilitados, mas não sabe de rotas de frontend;
// esse mapa fecha a ponta. "Unidades executoras" fica de fora do catálogo de
// propósito — compartilha o recurso de Configurações, então é anexado à mão
// logo depois de Configurações, ainda condicionado à mesma permissão.
const ROTA_POR_RECURSO: Record<string, string> = {
  'compras.dashboard': '/',
  'compras.licitacoes': '/licitacoes',
  'compras.fornecedores': '/fornecedores',
  'compras.atas': '/atas',
  'compras.contratos': '/contratos',
  'compras.ordens': '/ordens',
  'compras.configuracoes': '/configuracoes',
};

const MENU_ADMINISTRATIVO = [
  { to: '/secretarias', label: 'Secretarias', recurso: 'administrativo.secretarias', icone: 'ph-buildings' },
  { to: '/usuarios', label: 'Usuários', recurso: 'administrativo.usuarios', icone: 'ph-users' },
];

interface Modulo { id: string; recurso: string; nome: string; icone: string; }
interface TenantDisponivel { usuarioId: string; tenantId: string; tenantNome: string; tenantCodigo: number; tenantTipo: string | null; }

export function Layout() {
  const { usuario, tenant, logout, temPermissao, trocarTenant } = useAuth();
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [tenantsDisponiveis, setTenantsDisponiveis] = useState<TenantDisponivel[]>([]);
  const [tenantDropdownAberto, setTenantDropdownAberto] = useState(false);

  useEffect(() => {
    api.get('/modulos').then(setModulos).catch(() => setModulos([]));
    api.get('/auth/tenants-disponiveis').then(setTenantsDisponiveis).catch(() => setTenantsDisponiveis([]));
  }, []);

  const iniciais = (usuario?.nome ?? '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const itensCompras = modulos
    .filter((m) => ROTA_POR_RECURSO[m.recurso] && temPermissao(m.recurso))
    .map((m) => ({ to: ROTA_POR_RECURSO[m.recurso], label: m.nome, icone: m.icone }));
  if (temPermissao('compras.configuracoes')) {
    itensCompras.push({ to: '/unidades-executoras', label: 'Unidades executoras', icone: 'ph-bank' });
  }
  const itensAdministrativo = MENU_ADMINISTRATIVO.filter((i) => temPermissao(i.recurso));

  async function onEscolherTenant(usuarioId: string) {
    setTenantDropdownAberto(false);
    await trocarTenant(usuarioId);
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: 238, flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--color-bg)', boxShadow: 'inset -1px 0 0 var(--color-divider)' }}>
        <div style={{ padding: '18px 16px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16 }}>
            <i className="ph-fill ph-scales" style={{ fontSize: 18, color: 'var(--color-accent)' }} />
            <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 14.5 }}>Compras Públicas</span>
          </div>
          <div style={{ position: 'relative' }}>
            <div
              onClick={() => tenantsDisponiveis.length && setTenantDropdownAberto((v) => !v)}
              style={{ padding: '9px 11px', borderRadius: 8, background: 'var(--color-surface)', boxShadow: 'var(--shadow-sm)', display: 'flex', alignItems: 'center', gap: 8, cursor: tenantsDisponiveis.length ? 'pointer' : 'default' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tenant?.nome}</div>
                <div className="text-muted" style={{ fontSize: 11, marginTop: 2 }}>código {tenant?.codigo}{tenant?.tipo ? ` · ${tenant.tipo}` : ''}</div>
              </div>
              {!!tenantsDisponiveis.length && <i className={`ph ${tenantDropdownAberto ? 'ph-caret-up' : 'ph-caret-down'}`} style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />}
            </div>
            {tenantDropdownAberto && (
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 20, background: 'var(--color-surface)', borderRadius: 10, boxShadow: 'var(--shadow-lg)', padding: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 7, background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)' }}>
                  <i className="ph ph-buildings" style={{ fontSize: 15 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tenant?.nome}</div>
                    <div className="text-muted" style={{ fontSize: 10.5 }}>{tenant?.tipo}</div>
                  </div>
                  <i className="ph-fill ph-check-circle" style={{ fontSize: 14, color: 'var(--color-accent)' }} />
                </div>
                {tenantsDisponiveis.map((t) => (
                  <div
                    key={t.usuarioId}
                    onClick={() => onEscolherTenant(t.usuarioId)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 7, cursor: 'pointer' }}
                  >
                    <i className={t.tenantTipo === 'Câmara Municipal' ? 'ph ph-gavel' : 'ph ph-buildings'} style={{ fontSize: 15 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.tenantNome}</div>
                      <div className="text-muted" style={{ fontSize: 10.5 }}>{t.tenantTipo}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <nav style={{ flex: 1, padding: '0 10px', display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
          {!!itensCompras.length && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ padding: '0 12px 6px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 38%, transparent)' }}>Compras</div>
              {itensCompras.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <i className={`ph ${item.icone}`} style={{ fontSize: 16 }} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}

          {!!itensAdministrativo.length && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ padding: '0 12px 6px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 38%, transparent)' }}>Administrativo</div>
              {itensAdministrativo.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.to === '/'} className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                  <i className={`ph ${item.icone}`} style={{ fontSize: 16 }} />
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}

          {usuario?.ehAdminPlataforma && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ padding: '0 12px 6px', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 38%, transparent)' }}>Plataforma</div>
              <NavLink to="/plataforma" className={({ isActive }) => `sidebar-item${isActive ? ' active' : ''}`}>
                <i className="ph ph-shield-check" style={{ fontSize: 16 }} />
                <span>Setores e módulos</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div style={{ padding: '14px 16px', boxShadow: 'inset 0 1px 0 var(--color-divider)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', background: 'var(--color-accent-800)', color: 'var(--color-accent-100)', display: 'grid', placeItems: 'center', fontSize: 11 }}>
            {iniciais || '?'}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{usuario?.nome}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>{usuario?.tipoUsuario === 'ADMIN' ? 'Administrador' : 'Usuário'}</div>
          </div>
          <i className="ph ph-sign-out" onClick={logout} style={{ fontSize: 16, cursor: 'pointer', color: 'color-mix(in srgb, var(--color-text) 50%, transparent)' }} />
        </div>
      </aside>

      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Outlet />
      </main>
    </div>
  );
}
