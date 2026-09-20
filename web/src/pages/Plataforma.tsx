import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface SetorTenant { id: string; chave: string; nome: string; descricao: string; disponivel: boolean; habilitado: boolean; }
interface TenantLinha { id: string; codigo: number; nome: string; tipo: string | null; setores: SetorTenant[]; }

export function Plataforma() {
  const [tenants, setTenants] = useState<TenantLinha[]>([]);
  const [carregando, setCarregando] = useState<string | null>(null);

  async function carregar() { setTenants(await api.get('/plataforma/tenants')); }
  useEffect(() => { carregar(); }, []);

  async function alternar(tenantId: string, setor: SetorTenant) {
    if (!setor.disponivel) return;
    const chave = `${tenantId}:${setor.id}`;
    setCarregando(chave);
    try {
      await api.patch(`/plataforma/tenants/${tenantId}/setores/${setor.id}`, { habilitado: !setor.habilitado });
      await carregar();
    } finally {
      setCarregando(null);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ padding: '14px 40px', background: 'color-mix(in srgb, #d99a4e 16%, transparent)', boxShadow: 'inset 0 -1px 0 color-mix(in srgb, #d99a4e 35%, transparent)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <i className="ph-fill ph-shield-warning" style={{ fontSize: 17, color: '#d99a4e' }} />
        <span style={{ fontSize: 12.5, color: '#d99a4e' }}>Área de plataforma — visível apenas para administradores de plataforma</span>
      </div>

      <div className="content-page">
        <div className="eyebrow">Plataforma</div>
        <h2 className="page-title">Setores e módulos por tenant</h2>
        <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 26px' }}>Habilita setores inteiros por município. Alterações aqui afetam o que cada tenant pode ver.</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {tenants.map((t) => (
            <div key={t.id} style={{ paddingBottom: 20, boxShadow: 'inset 0 -1px 0 var(--color-divider)' }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{t.nome}</span>
                <span className="text-muted" style={{ fontSize: 12, marginLeft: 8 }}>{t.tipo} · código {t.codigo}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                {t.setores.map((s) => {
                  const chave = `${t.id}:${s.id}`;
                  return (
                    <div
                      key={s.id}
                      onClick={() => alternar(t.id, s)}
                      className="card"
                      style={{
                        padding: '11px 14px',
                        borderRadius: 9,
                        cursor: s.disponivel ? 'pointer' : 'default',
                        opacity: s.disponivel ? 1 : 0.45,
                        boxShadow: s.habilitado ? 'inset 0 0 0 1px var(--color-accent), var(--shadow-sm)' : 'var(--shadow-sm)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 13 }}>{s.nome}</span>
                        <i
                          className={s.habilitado ? 'ph-fill ph-check-circle' : 'ph ph-circle-dashed'}
                          style={{ fontSize: 15, color: s.habilitado ? 'var(--color-accent)' : undefined, opacity: carregando === chave ? 0.4 : 1 }}
                        />
                      </div>
                      <div className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>
                        {s.descricao}{!s.disponivel ? ' — Em breve' : ''}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          {!tenants.length && <p className="text-muted" style={{ fontSize: 13 }}>Nenhum tenant cadastrado.</p>}
        </div>
      </div>
    </div>
  );
}
