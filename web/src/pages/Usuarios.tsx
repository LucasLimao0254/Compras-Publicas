import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const RECURSOS_ADMINISTRATIVO = [
  { key: 'administrativo.usuarios', label: 'Usuários' },
  { key: 'administrativo.secretarias', label: 'Secretarias & Responsáveis' },
];

interface Modulo { id: string; recurso: string; nome: string; icone: string; }
interface UsuarioRow { id: string; nome: string; email: string; cpf: string; ativo: boolean; tipoUsuario: string; telefone?: string | null; }
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
  // Edição dos dados no painel lateral — antes o painel só tinha a lista de
  // módulos, sem como mudar nome, tipo, senha ou situação, nem excluir.
  const [edNome, setEdNome] = useState('');
  const [edTelefone, setEdTelefone] = useState('');
  const [edTipo, setEdTipo] = useState<'ADMIN' | 'PADRAO'>('PADRAO');
  const [edAtivo, setEdAtivo] = useState(true);
  const [edSenha, setEdSenha] = useState('');
  const [painelErro, setPainelErro] = useState<string | null>(null);
  const [painelOk, setPainelOk] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

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

  function preencherPainel(u: UsuarioDetalhe) {
    setUsuarioPainel(u);
    setEdNome(u.nome); setEdTelefone(u.telefone ?? ''); setEdTipo(u.tipoUsuario as 'ADMIN' | 'PADRAO'); setEdAtivo(u.ativo); setEdSenha('');
  }

  async function abrirPainel(id: string) {
    setPainelErro(null); setPainelOk(null); setConfirmandoExclusao(false);
    preencherPainel(await api.get(`/usuarios/${id}`));
  }

  function fecharPainel() { setUsuarioPainel(null); setPainelErro(null); setPainelOk(null); setConfirmandoExclusao(false); }

  async function salvarDados(e: FormEvent) {
    e.preventDefault();
    if (!usuarioPainel) return;
    setPainelErro(null); setPainelOk(null); setSalvando(true);
    try {
      const body: Record<string, unknown> = { nome: edNome, telefone: edTelefone || undefined, ativo: edAtivo };
      if (edTipo !== usuarioPainel.tipoUsuario) body.tipoUsuario = edTipo;
      if (edSenha) body.senha = edSenha;
      preencherPainel(await api.patch(`/usuarios/${usuarioPainel.id}`, body));
      setPainelOk('Alterações salvas');
      carregar();
    } catch (err) {
      setPainelErro(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function excluirUsuario() {
    if (!usuarioPainel) return;
    setPainelErro(null); setPainelOk(null);
    try {
      await api.delete(`/usuarios/${usuarioPainel.id}`);
      fecharPainel();
      carregar();
    } catch (err) {
      setConfirmandoExclusao(false);
      setPainelErro(err instanceof Error ? err.message : 'Erro ao excluir');
    }
  }

  // Toggle imediato — sem passo de "salvar" separado, mesmo padrão do resto
  // do produto pra permissões (checkbox já é a ação).
  async function toggleModuloDoUsuario(recurso: string) {
    if (!usuarioPainel) return;
    const novasPermissoes = usuarioPainel.permissoes.includes(recurso)
      ? usuarioPainel.permissoes.filter((p) => p !== recurso)
      : [...usuarioPainel.permissoes, recurso];
    const anterior = usuarioPainel;
    setUsuarioPainel({ ...usuarioPainel, permissoes: novasPermissoes });
    setPainelErro(null); setPainelOk(null);
    try {
      await api.patch(`/usuarios/${usuarioPainel.id}`, { permissoes: novasPermissoes });
      carregar();
    } catch (err) {
      // Volta o checkbox e diz por quê (ex.: só administrador mexe em administrador)
      setUsuarioPainel(anterior);
      setPainelErro(err instanceof Error ? err.message : 'Erro ao alterar permissão');
    }
  }

  return (
    <div className="content-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22 }}>
        <div>
          <div className="eyebrow">Administrativo</div>
          <h2 className="page-title">Usuários e permissões</h2>
          <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>Clique em um usuário para editar os dados, as permissões ou excluí-lo.</p>
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
        <thead><tr><th>Nome</th><th>E-mail</th><th style={{ width: 190 }}></th></tr></thead>
        <tbody>
          {lista.map((u) => (
            <tr key={u.id} onClick={() => abrirPainel(u.id)} style={{ cursor: 'pointer' }}>
              <td>{u.nome}</td>
              <td style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 65%, transparent)' }}>{u.email}</td>
              <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {u.tipoUsuario === 'ADMIN' && <span className="tag tag-accent">Administrador</span>}
                {!u.ativo && <span className="tag tag-neutral">Desativado</span>}
              </td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={3} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhum usuário cadastrado</td></tr>}
        </tbody>
      </table>

      {usuarioPainel && (
        <div className="dialog-backdrop" onClick={fecharPainel}>
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ position: 'fixed', right: 0, top: 0, bottom: 0, width: 'min(400px, 100vw)', background: 'var(--color-surface)', boxShadow: 'var(--shadow-lg)', padding: 22, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <h4 style={{ fontSize: 16, margin: 0 }}>{usuarioPainel.nome}</h4>
                <div className="text-muted" style={{ fontSize: 12.5, marginTop: 2 }}>{usuarioPainel.email} · CPF {usuarioPainel.cpf}</div>
              </div>
              <button type="button" className="btn btn-ghost" onClick={fecharPainel} aria-label="Fechar"><i className="ph ph-x" /></button>
            </div>

            {painelErro && <div role="alert" style={{ fontSize: 12.5, color: 'var(--color-critical)', padding: '8px 10px', borderRadius: 6, background: 'color-mix(in srgb, var(--color-critical) 12%, transparent)' }}>{painelErro}</div>}
            {painelOk && <div role="status" style={{ fontSize: 12.5, color: 'var(--color-accent)' }}>{painelOk}</div>}

            <form onSubmit={salvarDados} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 48%, transparent)' }}>Dados do usuário</div>
              <div className="field"><label htmlFor="ed-nome">Nome</label>
                <input id="ed-nome" className="input" value={edNome} onChange={(e) => setEdNome(e.target.value)} required /></div>
              <div className="field"><label htmlFor="ed-telefone">Telefone</label>
                <input id="ed-telefone" className="input" value={edTelefone} onChange={(e) => setEdTelefone(e.target.value)} /></div>
              <div className="field"><label htmlFor="ed-tipo">Tipo de usuário</label>
                <select id="ed-tipo" className="input" value={edTipo} onChange={(e) => setEdTipo(e.target.value as 'ADMIN' | 'PADRAO')}>
                  <option value="PADRAO">Padrão</option>
                  <option value="ADMIN">Administrador</option>
                </select></div>
              <div className="field"><label htmlFor="ed-senha">Nova senha</label>
                <input id="ed-senha" type="password" className="input" value={edSenha} onChange={(e) => setEdSenha(e.target.value)} minLength={6} placeholder="Deixe em branco para manter a atual" autoComplete="new-password" /></div>
              <label className="radio">
                <input type="checkbox" checked={edAtivo} onChange={(e) => setEdAtivo(e.target.checked)} /><span className="dot" />
                Usuário ativo (desativado não consegue entrar)
              </label>
              <div><button className="btn btn-primary" type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button></div>
            </form>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 48%, transparent)' }}>
                Permissões (salvas ao marcar)
              </div>
              {[...RECURSOS_ADMINISTRATIVO.map((r) => ({ recurso: r.key, nome: r.label })), ...modulos.map((m) => ({ recurso: m.recurso, nome: m.nome }))].map((m) => (
                <label key={m.recurso} className="radio">
                  <input type="checkbox" checked={usuarioPainel.permissoes.includes(m.recurso)} onChange={() => toggleModuloDoUsuario(m.recurso)} /><span className="dot" />
                  {m.nome}
                </label>
              ))}
              {!modulos.length && <p className="text-muted" style={{ fontSize: 12.5 }}>Nenhum módulo de Compras habilitado para este município.</p>}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {confirmandoExclusao ? (
                <>
                  <span style={{ fontSize: 12.5 }}>Excluir <b>{usuarioPainel.nome}</b>? Isso não pode ser desfeito. Usuários com histórico não podem ser excluídos — desative-os.</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="button" className="btn btn-secondary" onClick={excluirUsuario} style={{ color: 'var(--color-critical)' }}>Sim, excluir</button>
                    <button type="button" className="btn btn-ghost" onClick={() => setConfirmandoExclusao(false)}>Voltar</button>
                  </div>
                </>
              ) : (
                <div><button type="button" className="btn btn-ghost" onClick={() => setConfirmandoExclusao(true)} style={{ color: 'var(--color-critical)' }}><i className="ph ph-trash" />Excluir usuário</button></div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
