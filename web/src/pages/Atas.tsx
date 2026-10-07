import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { BotaoExcluir, EditarAtaModal } from '../components/EditarExcluir';

const TIPOS_ATA = ['ATAS', 'CREDENCIAMENTO'];
const PERFIS = ['GERENCIADOR', 'PARTICIPANTE'];

interface Opcao { id: string; label: string; }
interface OrgaoForm { secretariaId: string; perfil: string; }
interface FornecedorHomologado { id: string; homologacaoFornecedorId: string; }

interface AtaResumo {
  vigenciaInicial: string; vigenciaFinal: string;
  id: string; licitacaoId: string; detentorPrincipalId: string; numeroArp: string; tipo: string; situacao: string;
  quantidadeOrgaos: number; valorTotal: number; saldoDisponivel: number;
  detentorPrincipal: { razaoSocial: string };
  licitacao: { numero: string };
}

export function Atas() {
  const [lista, setLista] = useState<AtaResumo[]>([]);
  const [licitacoes, setLicitacoes] = useState<Opcao[]>([]);
  const [fornecedores, setFornecedores] = useState<Opcao[]>([]);
  const [secretarias, setSecretarias] = useState<Opcao[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [ataEditando, setAtaEditando] = useState<AtaResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [tipo, setTipo] = useState(TIPOS_ATA[0]);
  const [numeroArp, setNumeroArp] = useState('');
  const [licitacaoId, setLicitacaoId] = useState('');
  const [detentorPrincipalId, setDetentorPrincipalId] = useState('');
  const [vigenciaInicial, setVigenciaInicial] = useState('');
  const [vigenciaFinal, setVigenciaFinal] = useState('');
  const [orgaos, setOrgaos] = useState<OrgaoForm[]>([{ secretariaId: '', perfil: 'GERENCIADOR' }]);
  const [atasComLotes, setAtasComLotes] = useState(false);
  const [fornecedoresHomologados, setFornecedoresHomologados] = useState<FornecedorHomologado[] | null>(null);

  // Quando a licitação escolhida tem homologação revisada e o detentor
  // principal está entre os fornecedores homologados, a ata nasce já
  // vinculada — trava (no máximo uma ata por fornecedor homologado) e a
  // grade de itens passa a poder ser preenchida por "importar da
  // homologação" na tela de detalhe.
  useEffect(() => {
    setDetentorPrincipalId('');
    if (!licitacaoId) { setFornecedoresHomologados(null); return; }
    setFornecedoresHomologados(null);
    api.get(`/licitacoes/${licitacaoId}/homologacao-fornecedores`).then(setFornecedoresHomologados).catch(() => setFornecedoresHomologados([]));
  }, [licitacaoId]);

  const homologacaoFornecedorId = fornecedoresHomologados?.find((f) => f.id === detentorPrincipalId)?.homologacaoFornecedorId;
  // Detentor só entre os vencedores homologados da licitação escolhida; quem
  // já tem ata nesta licitação aparece desabilitado (uma ata por fornecedor
  // por licitação — MODELO.md, invariante 4).
  const detentoresPossiveis = (fornecedoresHomologados ?? []).map((h) => ({
    id: h.id,
    label: fornecedores.find((f) => f.id === h.id)?.label ?? h.id,
    jaTemAta: lista.some((a) => a.licitacaoId === licitacaoId && a.detentorPrincipalId === h.id),
  }));
  const avisoDetentor = !licitacaoId
    ? 'Escolha a licitação primeiro.'
    : fornecedoresHomologados === null
      ? 'Carregando os fornecedores homologados…'
      : !fornecedoresHomologados.length
        ? 'Esta licitação não tem homologação revisada — envie e revise a homologação em Licitações antes de criar a ata.'
        : 'Só os fornecedores homologados nesta licitação.';

  async function carregar() {
    const [a, l, f, s] = await Promise.all([
      api.get('/atas'), api.get('/licitacoes'), api.get('/fornecedores'), api.get('/secretarias'),
    ]);
    setLista(a);
    setLicitacoes(l.map((x: any) => ({ id: x.id, label: `${x.numero} — ${x.modalidade.replaceAll('_', ' ')}` })));
    setFornecedores(f.map((x: any) => ({ id: x.id, label: `${x.razaoSocial} (${x.cnpjCpf})` })));
    setSecretarias(s.map((x: any) => ({ id: x.id, label: x.titulo })));
  }
  useEffect(() => { carregar(); }, []);

  function addOrgaoRow() { setOrgaos([...orgaos, { secretariaId: '', perfil: 'PARTICIPANTE' }]); }
  function updateOrgao(idx: number, patch: Partial<OrgaoForm>) {
    setOrgaos(orgaos.map((o, i) => (i === idx ? { ...o, ...patch } : o)));
  }
  function removeOrgao(idx: number) { setOrgaos(orgaos.filter((_, i) => i !== idx)); }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/atas', {
        tipo, numeroArp, licitacaoId, detentorPrincipalId, vigenciaInicial, vigenciaFinal, homologacaoFornecedorId, atasComLotes,
        orgaos: orgaos.filter((o) => o.secretariaId).map((o) => ({ secretariaId: o.secretariaId, perfil: o.perfil })),
      });
      setMostrarForm(false);
      setNumeroArp('');
      setOrgaos([{ secretariaId: '', perfil: 'GERENCIADOR' }]);
      setAtasComLotes(false);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  return (
    <div className="content-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22 }}>
        <div>
          <div className="eyebrow">Compras</div>
          <h2 className="page-title">Atas de registro de preços</h2>
          <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>{lista.length} {lista.length === 1 ? 'registro' : 'registros'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          <i className={`ph ${mostrarForm ? 'ph-x' : 'ph-plus'}`} />{mostrarForm ? 'Cancelar' : 'Nova ata'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card elev-md" style={{ padding: '20px 22px', marginBottom: 26, gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
            <div className="field"><label>Tipo</label>
              <select className="input" value={tipo} onChange={(e) => setTipo(e.target.value)}>
                {TIPOS_ATA.map((t) => <option key={t} value={t}>{t === 'ATAS' ? 'Ata de Registro de Preços' : 'Credenciamento'}</option>)}
              </select></div>
            <div className="field"><label>Número ARP</label>
              <input className="input" value={numeroArp} onChange={(e) => setNumeroArp(e.target.value)} required /></div>
            <div className="field"><label>Licitação</label>
              <select className="input" value={licitacaoId} onChange={(e) => setLicitacaoId(e.target.value)} required>
                <option value="">Selecione</option>
                {licitacoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select></div>
            <div className="field"><label>Detentor principal</label>
              <select className="input" value={detentorPrincipalId} onChange={(e) => setDetentorPrincipalId(e.target.value)} required disabled={!detentoresPossiveis.length}>
                <option value="">Selecione</option>
                {detentoresPossiveis.map((o) => <option key={o.id} value={o.id} disabled={o.jaTemAta}>{o.label}{o.jaTemAta ? ' — já tem ata nesta licitação' : ''}</option>)}
              </select>
              <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>{homologacaoFornecedorId ? 'Vinculada à homologação — o teto por item vem de lá.' : avisoDetentor}</p></div>
            <div className="field"><label>Vigência inicial</label>
              <input type="date" className="input" value={vigenciaInicial} onChange={(e) => setVigenciaInicial(e.target.value)} required /></div>
            <div className="field"><label>Vigência final</label>
              <input type="date" className="input" value={vigenciaFinal} onChange={(e) => setVigenciaFinal(e.target.value)} required /></div>
          </div>
          <label className="radio"><input type="checkbox" checked={atasComLotes} onChange={(e) => setAtasComLotes(e.target.checked)} /><span className="dot" />Esta ata organiza itens em lotes</label>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>Órgãos participantes</span>
              <button type="button" onClick={addOrgaoRow} className="btn btn-ghost"><i className="ph ph-plus" />adicionar órgão</button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {orgaos.map((o, idx) => (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 160px 32px', gap: 8, alignItems: 'center' }}>
                  <select className="input" value={o.secretariaId} onChange={(e) => updateOrgao(idx, { secretariaId: e.target.value })}>
                    <option value="">Selecione a secretaria</option>
                    {secretarias.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                  <select className="input" value={o.perfil} onChange={(e) => updateOrgao(idx, { perfil: e.target.value })}>
                    {PERFIS.map((p) => <option key={p} value={p}>{p === 'GERENCIADOR' ? 'Gerenciador' : 'Participante'}</option>)}
                  </select>
                  <i className="ph ph-trash" onClick={() => removeOrgao(idx)} style={{ fontSize: 15, cursor: 'pointer', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />
                </div>
              ))}
            </div>
            <p className="text-muted" style={{ fontSize: 11.5, marginTop: 6 }}>Depois de criar a ata, os itens de cada órgão são adicionados na tela de detalhe.</p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary" type="submit">Salvar ata</button>
            <button className="btn btn-secondary" type="button" onClick={() => setMostrarForm(false)}>Cancelar</button>
            {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
          </div>
        </form>
      )}

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 96 }}>Ata</th>
            <th>Objeto / detentor</th>
            <th style={{ width: 130 }}>Licitação</th>
            <th style={{ width: 90 }}>Órgãos</th>
            <th style={{ width: 220 }}>Saldo</th>
            <th style={{ width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {lista.map((a) => (
            <tr key={a.id}>
              <td className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{a.numeroArp}</td>
              <td>
                <div style={{ fontSize: 13.5 }}>{a.detentorPrincipal?.razaoSocial}</div>
                <div className="text-muted" style={{ fontSize: 11.5, marginTop: 2 }}>{a.tipo === 'ATAS' ? 'Ata de registro de preços' : 'Credenciamento'}</div>
              </td>
              <td className="num" style={{ fontSize: 12.5, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>{a.licitacao?.numero}</td>
              <td className="num">{a.quantidadeOrgaos}</td>
              <td>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span className="num">R$ {a.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <span className="num text-muted">de {a.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="saldo-bar"><span style={{ width: `${Math.max(2, Math.round((a.valorTotal ? a.saldoDisponivel / a.valorTotal : 0) * 100))}%` }} /></div>
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 2, verticalAlign: 'middle' }}>
                  <button type="button" className="icone-acao" title={`Editar ata ${a.numeroArp}`} aria-label={`Editar ata ${a.numeroArp}`} onClick={() => setAtaEditando(a)}><i className="ph ph-pencil-simple" /></button>
                  <BotaoExcluir compacto rotulo={`a ata ${a.numeroArp}`} caminho={`/atas/${a.id}`} onExcluido={carregar} />
                </span>
                <Link to={`/atas/${a.id}`} style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 8, background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ph ph-arrow-right" style={{ fontSize: 16, color: 'var(--color-accent)' }} />
                </Link>
              </td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={6} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhuma ata cadastrada</td></tr>}
        </tbody>
      </table>
      {ataEditando && <EditarAtaModal ata={ataEditando} onFechar={() => setAtaEditando(null)} onSalvo={carregar} />}
    </div>
  );
}
