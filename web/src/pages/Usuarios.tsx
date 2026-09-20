import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const RECURSOS_ADMINISTRATIVO = [
  { key: 'administrativo.usuarios', label: 'Usuários' },
  { key: 'administrativo.secretarias', label: 'Secretarias & Responsáveis' },
];

interface Modulo { id: string; recurso: string; nome: string; icone: string; }
interface UsuarioRow { id: string; nome: string; email: string; cpf: string; ativo: boolean; tipoUsuario: string; }
interface UsuarioDetalhe extends UsuarioRow { permissoes: string[]; }

export function Usuarios() {
  const [lista, setLista] = useState<UsuarioRow[]>([]);
  const [modulos, setModulos] = useState<Modulo[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [tipoUsuario, setTipoUsuario] = useState<'ADMIN' | 'PADRAO'>('PADRAO');
  const [permissoes, setPermissoes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const [usuarioPainel, setUsuarioPainel] = useState<UsuarioDetalhe | null>(null);

  async function carregar() { setLista(await api.get('/usuarios')); }
  useEffect(() => {
    carregar();
    api.get('/modulos').then(setModulos).catch(() => setModulos([]));
  }, []);

  function togglePermissao(key: string) {
    setPermissoes((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/usuarios', { cpf, nome, email, senha, tipoUsuario, permissoes });
      setCpf(''); setNome(''); setEmail(''); setSenha(''); setPermissoes([]);
      setMostrarForm(false);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  async function abrirPainel(id: string) {
    setUsuarioPainel(await api.get(`/usuarios/${id}`));
  }

  // Toggle imediato — sem passo de "salvar" separado, mesmo padrão do resto
  // do produto pra permissões (checkbox já é a ação).
  async function toggleModuloDoUsuario(recurso: string) {
    if (!usuarioPainel) return;
    const novasPermissoes = usuarioPainel.permissoes.includes(recurso)
      ? usuarioPainel.permissoes.filter((p) => p !== recurso)
      : [...usuarioPainel.permissoes, recurso];
    setUsuarioPainel({ ...usuarioPainel, permissoes: novasPermissoes });
    await api.patch(`/usuarios/${usuarioPainel.id}`, { permissoes: novasPermissoes });
    carregar();
  }

  return (
    <div className="content-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22 }}>
        <div>
          <div className="eyebrow">Administrativo</div>
          <h2 className="page-title">Usuários e permissões</h2>
          <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>Clique em um usuário para ver os módulos disponíveis para ele.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          <i className={`ph ${mostrarForm ? 'ph-x' : 'ph-plus'}`} />{mostrarForm ? 'Cancelar' : 'Novo usuário'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card elev-md" style={{ padding: '20px 22px', marginBottom: 26, gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
            <div className="field"><label>CPF</label>
              <input className="input" value={cpf} onChange={(e) => setCpf(e.target.value)} required /></div>
            <div className="field"><label>Nome</label>
              <input className="input" value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
            <div className="field"><label>E-mail</label>
              <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div className="field"><label>Senha</label>
              <input type="password" className="input" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} /></div>
            <div className="field"><label>Tipo de usuário</label>
              <select className="input" value={tipoUsuario} onChange={(e) => setTipoUsuario(e.target.value as any)}>
                <option value="PADRAO">Padrão</option>
                <option value="ADMIN">Administrador</option>
              </select></div>
          </div>

          <div>
            <div style={{ fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 500, marginBottom: 10 }}>Permissões</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)', marginBottom: 6 }}>Administrativo</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {RECURSOS_ADMINISTRATIVO.map((it) => (
                  <label key={it.key} className="radio">
                    <input type="checkbox" checked={permissoes.includes(it.key)} onChange={() => togglePermissao(it.key)} /><span className="dot" />
                    {it.label}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)', marginBottom: 6 }}>Compras</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {modulos.map((m) => (
                  <label key={m.recurso} className="radio">
                    <input type="checkbox" checked={permissoes.includes(m.recurso)} onChange={() => togglePermissao(m.recurso)} /><span className="dot" />
                    {m.nome}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary" type="submit">Salvar</button>
            <button className="btn btn-secondary" type="button" onClick={() => setMostrarForm(false)}>Cancelar</button>
            {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
          </div>
        </form>
      )}

      <table className="table">
        <thead><tr><th>Nome</th><th>E-mail</th><th style={{ width: 130 }}></th></tr></thead>
        <tbody>
          {lista.map((u) => (
            <tr key={u.id} onClick={() => abrirPainel(u.id)} style={{ cursor: 'pointer' }}>
              <td>{u.nome}</td>
              <td style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 65%, transparent)' }}>{u.email}</td>
              <td>{u.tipoUsuario === 'ADMIN' && <span className="tag tag-accent">Administrador</span>}</td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={3} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhum usuário cadastrado</td></tr>}
        </tbody>
      </table>

      {usuarioPainel && (
        <div className="dialog-backdrop" onClick={() => setUsuarioPainel(null)}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 340, background: 'var(--color-surface)', boxShadow: 'var(--shadow-lg)', padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <h4 style={{ fontSize: 16, margin: 0 }}>{usuarioPainel.nome}</h4>
              <i className="ph ph-x" onClick={() => setUsuarioPainel(null)} style={{ cursor: 'pointer', fontSize: 16 }} />
            </div>
            <div className="text-muted" style={{ fontSize: 12.5, marginBottom: 18 }}>{usuarioPainel.email}</div>

            <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 48%, transparent)', marginBottom: 10 }}>
              Módulos habilitados neste tenant
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {modulos.map((m) => (
                <label key={m.recurso} className="radio">
                  <input type="checkbox" checked={usuarioPainel.permissoes.includes(m.recurso)} onChange={() => toggleModuloDoUsuario(m.recurso)} /><span className="dot" />
                  {m.nome}
                </label>
              ))}
              {!modulos.length && <p className="text-muted" style={{ fontSize: 12.5 }}>Nenhum módulo habilitado para este tenant.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
