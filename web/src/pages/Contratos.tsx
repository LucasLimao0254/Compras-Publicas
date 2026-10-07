import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { formatarDia } from '../lib/datas';
import { api } from '../lib/api';
import { ImportarHomologacaoModal } from '../components/ImportarHomologacaoModal';
import { DescricaoResumida } from '../components/DescricaoResumida';
import { BotaoExcluir, EditarContratoModal } from '../components/EditarExcluir';

const FORMAS_FATURAMENTO = ['MENSAL','POR_MEDICAO','POR_ETAPA','POR_ENTREGA','SOB_DEMANDA','PARCELA_UNICA','PAGAMENTO_ANTECIPADO'];
const SITUACAO_TAG: Record<string, string> = { VIGENTE: 'tag tag-accent', MINUTA: 'tag tag-outline', ARQUIVADO: 'tag tag-neutral' };

interface Opcao { id: string; label: string; }
interface LicitacaoOpcao extends Opcao { numeroProcesso: string; objeto: string; }
interface ItemForm { descricao: string; unidade: string; quantidade: string; valorUnitario: string; homologacaoItemId?: string; }
interface FornecedorHomologado { id: string; homologacaoFornecedorId: string; }
interface OrgaoAta { id: string; secretaria: { titulo: string }; }
interface AtaDaLicitacao { id: string; numeroArp: string; situacao: string; licitacaoId: string; detentorPrincipalId: string; homologacaoFornecedorId: string | null; detentorPrincipal: { razaoSocial: string }; }
const SEM_ARP = 'SEM_ARP';

// Filtros por faixa de prazo — a mesma classificação dos números da Visão
// geral (api/src/common/datas.ts, faixaPrazo), que abre esta lista filtrada.
type FaixaPrazo = 'ARQUIVADO' | 'VENCIDO' | 'VENCENDO_30' | 'VIGENTE';
const FILTROS_PRAZO: { valor: string; rotulo: string; faixas: FaixaPrazo[] }[] = [
  { valor: '', rotulo: 'Todas as situações', faixas: ['VIGENTE', 'VENCENDO_30', 'VENCIDO', 'ARQUIVADO'] },
  { valor: 'ATIVOS', rotulo: 'Ativos (não arquivados)', faixas: ['VIGENTE', 'VENCENDO_30', 'VENCIDO'] },
  { valor: 'VIGENTES', rotulo: 'Vigentes', faixas: ['VIGENTE', 'VENCENDO_30'] },
  { valor: 'VENCENDO_30', rotulo: 'Vencendo em 30 dias', faixas: ['VENCENDO_30'] },
  { valor: 'VENCIDOS', rotulo: 'Vencidos', faixas: ['VENCIDO'] },
  { valor: 'ARQUIVADOS', rotulo: 'Arquivados', faixas: ['ARQUIVADO'] },
];

interface ContratoResumo {
  id: string; numero: string; objeto: string; situacao: string;
  vigenciaFinal: string; faixaPrazo: FaixaPrazo; fornecedorId: string;
  vigenciaInicial: string; numeroProcesso: string; formaFaturamento: string;
  valorTotal: number; saldoDisponivel: number;
  fornecedor: { razaoSocial: string };
  orgaoGerenciador: { titulo: string };
}

export function Contratos() {
  const [lista, setLista] = useState<ContratoResumo[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const filtroPrazo = FILTROS_PRAZO.find((f) => f.valor === (searchParams.get('situacao') ?? '')) ?? FILTROS_PRAZO[0];
  const filtroFornecedor = searchParams.get('fornecedorId') ?? '';
  function mudarFiltro(chave: string, valor: string) {
    const proximos = new URLSearchParams(searchParams);
    if (valor) proximos.set(chave, valor); else proximos.delete(chave);
    setSearchParams(proximos, { replace: true });
  }
  const visiveis = lista.filter((c) => filtroPrazo.faixas.includes(c.faixaPrazo) && (!filtroFornecedor || c.fornecedorId === filtroFornecedor));
  const comFiltro = !!filtroPrazo.valor || !!filtroFornecedor;
  const [licitacoes, setLicitacoes] = useState<LicitacaoOpcao[]>([]);
  const [secretarias, setSecretarias] = useState<Opcao[]>([]);
  const [fornecedores, setFornecedores] = useState<Opcao[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [contratoEditando, setContratoEditando] = useState<ContratoResumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [numero, setNumero] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [objeto, setObjeto] = useState('');
  const [licitacaoId, setLicitacaoId] = useState('');
  const [orgaoGerenciadorId, setOrgaoGerenciadorId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [vigenciaInicial, setVigenciaInicial] = useState('');
  const [vigenciaFinal, setVigenciaFinal] = useState('');
  const [formaFaturamento, setFormaFaturamento] = useState(FORMAS_FATURAMENTO[4]);
  const [itens, setItens] = useState<ItemForm[]>([{ descricao: '', unidade: '', quantidade: '', valorUnitario: '' }]);
  const [fornecedoresHomologados, setFornecedoresHomologados] = useState<FornecedorHomologado[]>([]);
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [ataDoFornecedor, setAtaDoFornecedor] = useState<{ id: string; orgaos: OrgaoAta[] } | null>(null);
  const [todasAtas, setTodasAtas] = useState<AtaDaLicitacao[]>([]);
  const [ataId, setAtaId] = useState('');
  const [ataOrgaoId, setAtaOrgaoId] = useState('');

  useEffect(() => {
    if (!licitacaoId) { setFornecedoresHomologados([]); return; }
    api.get(`/licitacoes/${licitacaoId}/homologacao-fornecedores`).then(setFornecedoresHomologados).catch(() => setFornecedoresHomologados([]));
  }, [licitacaoId]);

  const homologacaoFornecedorId = fornecedoresHomologados.find((f) => f.id === fornecedorId)?.homologacaoFornecedorId;
  const temHomologacao = fornecedoresHomologados.length > 0;

  // Licitação → ARP → fornecedor. As ARPs listadas são só as desta licitação;
  // escolhida uma, o fornecedor é o da ARP e o saldo abate de um órgão dela.
  // "Sem ARP" contrata direto do teto homologado — só para quem foi
  // homologado e não tem ata (com ata, o backend exige abater dela) — ou,
  // em licitação sem homologação, qualquer fornecedor (contrato manual).
  const atasDaLicitacao = todasAtas.filter((a) => a.licitacaoId === licitacaoId && a.situacao !== 'ARQUIVADO');
  const ataEscolhida = atasDaLicitacao.find((a) => a.id === ataId) ?? null;
  const fornecedoresComAta = new Set(todasAtas.filter((a) => a.licitacaoId === licitacaoId).map((a) => a.detentorPrincipalId));
  const fornecedoresDaLicitacao = ataEscolhida
    // hoje cada ARP tem um detentor (uma ata por fornecedor, MODELO.md inv. 4);
    // a lista já comporta mais de um, e aí o usuário escolhe
    ? fornecedores.filter((f) => f.id === ataEscolhida.detentorPrincipalId)
    : temHomologacao
      ? fornecedores.filter((f) => fornecedoresHomologados.some((h) => h.id === f.id) && !fornecedoresComAta.has(f.id))
      : fornecedores;

  function escolherAta(id: string) {
    setAtaId(id);
    setAtaOrgaoId('');
    setItens((prev) => prev.filter((it) => !it.homologacaoItemId));
    const ata = atasDaLicitacao.find((a) => a.id === id);
    setFornecedorId(ata ? ata.detentorPrincipalId : '');
  }

  useEffect(() => {
    if (!ataEscolhida) { setAtaDoFornecedor(null); return; }
    let ativo = true;
    api.get(`/atas/${ataEscolhida.id}`)
      .then((detalhe) => { if (ativo) setAtaDoFornecedor({ id: ataEscolhida.id, orgaos: detalhe.orgaos }); })
      .catch(() => { if (ativo) setAtaDoFornecedor(null); });
    return () => { ativo = false; };
  }, [ataEscolhida?.id]);

  // Ao escolher a licitação, o nº do processo e o objeto vêm dela (MODELO.md,
  // seção 5: o objeto é pré-preenchido e editável). Só sobrescreve o que o
  // usuário não digitou por conta própria. Troca de licitação limpa o
  // fornecedor e os itens importados, que eram de outra licitação.
  function escolherLicitacao(id: string) {
    const anterior = licitacoes.find((l) => l.id === licitacaoId);
    const nova = licitacoes.find((l) => l.id === id);
    setLicitacaoId(id);
    if (nova) {
      if (!numeroProcesso || numeroProcesso === anterior?.numeroProcesso) setNumeroProcesso(nova.numeroProcesso);
      if (!objeto || objeto === anterior?.objeto) setObjeto(nova.objeto);
    }
    setFornecedorId('');
    setAtaId('');
    setAtaOrgaoId('');
    setItens((prev) => prev.filter((it) => !it.homologacaoItemId));
  }

  function importarItensHomologados(novos: { homologacaoItemId: string; descricao: string; unidade: string; quantidade: number; valorUnitario: number }[]) {
    setItens((prev) => [
      ...prev.filter((it) => it.descricao),
      ...novos.map((it) => ({ descricao: it.descricao, unidade: it.unidade, quantidade: String(it.quantidade), valorUnitario: String(it.valorUnitario), homologacaoItemId: it.homologacaoItemId })),
    ]);
  }

  async function carregar() {
    const [c, l, s, f, a] = await Promise.all([
      api.get('/contratos'), api.get('/licitacoes'), api.get('/secretarias'), api.get('/fornecedores'), api.get('/atas').catch(() => []),
    ]);
    setTodasAtas(a);
    setLista(c);
    setLicitacoes(l.map((x: any) => ({ id: x.id, label: `${x.numero} — ${x.modalidade.replaceAll('_',' ')}`, numeroProcesso: x.numeroProcesso ?? '', objeto: x.objeto ?? '' })));
    setSecretarias(s.map((x: any) => ({ id: x.id, label: x.titulo })));
    setFornecedores(f.map((x: any) => ({ id: x.id, label: `${x.razaoSocial} (${x.cnpjCpf})` })));
  }
  useEffect(() => { carregar(); }, []);

  function addItemRow() { setItens([...itens, { descricao: '', unidade: '', quantidade: '', valorUnitario: '' }]); }
  function updateItem(idx: number, patch: Partial<ItemForm>) {
    setItens(itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) { setItens(itens.filter((_, i) => i !== idx)); }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/contratos', {
        numero, numeroProcesso, objeto, licitacaoId, orgaoGerenciadorId, fornecedorId,
        vigenciaInicial, vigenciaFinal, formaFaturamento, situacao: 'VIGENTE',
        ataOrgaoId: ataEscolhida ? ataOrgaoId : undefined,
        homologacaoFornecedorId: !ataEscolhida ? homologacaoFornecedorId : undefined,
        itens: itens
          .filter((it) => it.descricao)
          .map((it) => ({ descricao: it.descricao, unidade: it.unidade, quantidade: Number(it.quantidade), valorUnitario: Number(it.valorUnitario), homologacaoItemId: it.homologacaoItemId })),
      });
      setMostrarForm(false);
      setNumero(''); setNumeroProcesso(''); setObjeto(''); setAtaId(''); setAtaOrgaoId(''); setFornecedorId('');
      setItens([{ descricao: '', unidade: '', quantidade: '', valorUnitario: '' }]);
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
          <h2 className="page-title">Contratos</h2>
          <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>{comFiltro ? `${visiveis.length} de ${lista.length}` : lista.length} {lista.length === 1 ? 'registro' : 'registros'} · saldo recalculado a cada leitura</p>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          <i className={`ph ${mostrarForm ? 'ph-x' : 'ph-plus'}`} />{mostrarForm ? 'Cancelar' : 'Novo contrato'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card elev-md" style={{ padding: '22px 24px', marginBottom: 26, gap: 18 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 14 }}>
            <div className="field"><label>Número do contrato/ano</label>
              <input className="input" value={numero} onChange={(e) => setNumero(e.target.value)} required /></div>
            <div className="field"><label>Número do processo</label>
              <input className="input" value={numeroProcesso} onChange={(e) => setNumeroProcesso(e.target.value)} required /></div>
            <div className="field"><label>Licitação</label>
              <select className="input" value={licitacaoId} onChange={(e) => escolherLicitacao(e.target.value)} required>
                <option value="">Selecione</option>
                {licitacoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select></div>
            <div className="field"><label>Órgão gerenciador</label>
              <select className="input" value={orgaoGerenciadorId} onChange={(e) => setOrgaoGerenciadorId(e.target.value)} required>
                <option value="">Selecione</option>
                {secretarias.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select></div>
            <div className="field"><label htmlFor="contrato-arp">ARP</label>
              <select id="contrato-arp" className="input" value={ataId} onChange={(e) => escolherAta(e.target.value)} required disabled={!licitacaoId}>
                <option value="">{licitacaoId ? 'Selecione' : 'Escolha a licitação primeiro'}</option>
                {atasDaLicitacao.map((a) => <option key={a.id} value={a.id}>{a.numeroArp} — {a.detentorPrincipal?.razaoSocial}</option>)}
                {licitacaoId && <option value={SEM_ARP}>{temHomologacao ? 'Sem ARP — direto da homologação' : 'Sem ARP'}</option>}
              </select>
              {licitacaoId && !atasDaLicitacao.length && <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>Nenhuma ARP registrada nesta licitação.</p>}</div>
            <div className="field"><label htmlFor="contrato-fornecedor">Fornecedor</label>
              <select id="contrato-fornecedor" className="input" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} required disabled={!ataId}>
                <option value="">{ataId ? 'Selecione' : 'Escolha a ARP primeiro'}</option>
                {fornecedoresDaLicitacao.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {ataEscolhida && <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>Fornecedor registrado na ARP {ataEscolhida.numeroArp}.</p>}
              {ataId === SEM_ARP && temHomologacao && <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>Homologados sem ARP nesta licitação — abate direto do teto homologado.</p>}
              {ataId === SEM_ARP && temHomologacao && !fornecedoresDaLicitacao.length && <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>Todos os homologados já têm ARP — escolha a ARP acima.</p>}</div>
            {ataDoFornecedor && (
              <div className="field"><label>Órgão da ata (de onde abate saldo)</label>
                <select className="input" aria-label="Órgão da ata" value={ataOrgaoId} onChange={(e) => setAtaOrgaoId(e.target.value)} required>
                  <option value="">Selecione</option>
                  {ataDoFornecedor.orgaos.map((o) => <option key={o.id} value={o.id}>{o.secretaria.titulo}</option>)}
                </select></div>
            )}
            <div className="field"><label>Forma de faturamento</label>
              <select className="input" value={formaFaturamento} onChange={(e) => setFormaFaturamento(e.target.value)}>
                {FORMAS_FATURAMENTO.map((f) => <option key={f} value={f}>{f.replaceAll('_',' ')}</option>)}
              </select></div>
            <div className="field"><label>Vigência inicial</label>
              <input type="date" className="input" value={vigenciaInicial} onChange={(e) => setVigenciaInicial(e.target.value)} required /></div>
            <div className="field"><label>Vigência final</label>
              <input type="date" className="input" value={vigenciaFinal} onChange={(e) => setVigenciaFinal(e.target.value)} required /></div>
          </div>
          <div className="field">
            <label>Objeto</label>
            <textarea className="input" value={objeto} onChange={(e) => setObjeto(e.target.value)} required />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>Itens do contrato</span>
              <div style={{ display: 'flex', gap: 8 }}>
                {temHomologacao && ataDoFornecedor && !ataOrgaoId && (
                  <span className="text-muted" style={{ fontSize: 12, alignSelf: 'center' }}>Escolha o órgão da ata para importar os itens</span>
                )}
                {temHomologacao && (
                  <button type="button" onClick={() => setMostrarImportar(true)} className="btn btn-ghost" disabled={!fornecedorId || (!!ataDoFornecedor && !ataOrgaoId)}><i className="ph ph-file-arrow-down" />importar da homologação</button>
                )}
                {/* Contrato com origem na homologação/ata só aceita itens
                    homologados (MODELO.md, invariante 2) — o backend rejeita
                    linha digitada à mão nesse caso. */}
                {!homologacaoFornecedorId && (
                  <button type="button" onClick={addItemRow} className="btn btn-ghost"><i className="ph ph-plus" />adicionar item</button>
                )}
              </div>
            </div>
            <table className="table">
              <thead><tr><th style={{ width: '40%' }}>Descrição</th><th style={{ width: '14%' }}>Unidade</th><th style={{ width: '14%' }}>Quantidade</th><th style={{ width: '18%' }}>Valor unitário</th><th></th></tr></thead>
              <tbody>
                {/* Com origem na homologação, linha digitada à mão não é aceita:
                    some com as linhas vazias e orienta a importar. */}
                {!!homologacaoFornecedorId && !itens.some((it) => it.homologacaoItemId) && (
                  <tr><td colSpan={5} className="text-muted" style={{ padding: '16px 0', textAlign: 'center', fontSize: 13 }}>Use “importar da homologação” para trazer os itens deste fornecedor.</td></tr>
                )}
                {itens.map((it, idx) => (homologacaoFornecedorId && !it.homologacaoItemId && !it.descricao) ? null : (
                  <tr key={idx}>
                    <td style={{ minWidth: 0 }}>{it.homologacaoItemId
                      ? <div style={{ fontSize: 13, padding: '4px 2px' }}><DescricaoResumida texto={it.descricao} /></div>
                      : <input className="input" placeholder="Descrição do item" value={it.descricao} onChange={(e) => updateItem(idx, { descricao: e.target.value })} />}</td>
                    <td><input className="input" placeholder="Un." value={it.unidade} onChange={(e) => updateItem(idx, { unidade: e.target.value })} disabled={!!it.homologacaoItemId} /></td>
                    <td><input className="input num" type="number" placeholder="0" value={it.quantidade} onChange={(e) => updateItem(idx, { quantidade: e.target.value })} /></td>
                    <td><input className="input num" type="number" step="0.0001" placeholder="0,00" value={it.valorUnitario} onChange={(e) => updateItem(idx, { valorUnitario: e.target.value })} disabled={!!it.homologacaoItemId} /></td>
                    <td style={{ width: 36 }}><i className="ph ph-trash" onClick={() => removeItem(idx)} style={{ fontSize: 15, cursor: 'pointer', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary" type="submit">Salvar contrato</button>
            <button className="btn btn-secondary" type="button" onClick={() => setMostrarForm(false)}>Descartar</button>
            {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
          </div>
        </form>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div className="field" style={{ minWidth: 220 }}><label htmlFor="filtro-situacao">Situação</label>
          <select id="filtro-situacao" className="input" value={filtroPrazo.valor} onChange={(e) => mudarFiltro('situacao', e.target.value)}>
            {FILTROS_PRAZO.map((f) => <option key={f.valor} value={f.valor}>{f.rotulo}</option>)}
          </select></div>
        <div className="field" style={{ minWidth: 260, flex: '0 1 360px' }}><label htmlFor="filtro-fornecedor">Fornecedor</label>
          <select id="filtro-fornecedor" className="input" value={filtroFornecedor} onChange={(e) => mudarFiltro('fornecedorId', e.target.value)}>
            <option value="">Todos os fornecedores</option>
            {fornecedores.filter((f) => f.id === filtroFornecedor || lista.some((c) => c.fornecedorId === f.id)).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select></div>
        {comFiltro && <button className="btn btn-ghost" type="button" onClick={() => setSearchParams({}, { replace: true })}><i className="ph ph-x" />Limpar filtros</button>}
      </div>

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 96 }}>Contrato</th>
            <th>Fornecedor / objeto</th>
            <th style={{ width: 150 }}>Órgão</th>
            <th style={{ width: 220 }}>Saldo</th>
            <th style={{ width: 112 }}>Situação</th>
            <th style={{ width: 120 }}></th>
          </tr>
        </thead>
        <tbody>
          {visiveis.map((c) => (
            <tr key={c.id} style={{ cursor: 'pointer' }}>
              <td className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{c.numero}</td>
              <td>
                <div style={{ fontSize: 13.5 }}>{c.fornecedor?.razaoSocial}</div>
                <div className="text-muted" style={{ fontSize: 11.5, marginTop: 2, maxWidth: '46ch', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.objeto}</div>
              </td>
              <td style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 58%, transparent)' }}>{c.orgaoGerenciador?.titulo}</td>
              <td>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span className="num">R$ {c.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <span className="num text-muted">de {c.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="saldo-bar"><span style={{ width: `${Math.max(2, Math.round((c.valorTotal ? c.saldoDisponivel / c.valorTotal : 0) * 100))}%` }} /></div>
              </td>
              <td>
                <span className={SITUACAO_TAG[c.situacao] ?? 'tag tag-neutral'}>{c.situacao}</span>
                <div style={{ fontSize: 11, marginTop: 4, color: c.faixaPrazo === 'VENCIDO' ? 'var(--color-critical)' : c.faixaPrazo === 'VENCENDO_30' ? 'var(--color-warn)' : 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>
                  {c.faixaPrazo === 'VENCIDO' ? 'venceu em' : 'até'} {formatarDia(c.vigenciaFinal)}
                </div>
              </td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'flex-start', gap: 2, verticalAlign: 'middle' }}>
                  <button type="button" className="icone-acao" title={`Editar contrato ${c.numero}`} aria-label={`Editar contrato ${c.numero}`} onClick={() => setContratoEditando(c)}><i className="ph ph-pencil-simple" /></button>
                  <BotaoExcluir compacto rotulo={`o contrato ${c.numero}`} caminho={`/contratos/${c.id}`} onExcluido={carregar} />
                </span>
                <Link to={`/contratos/${c.id}`} style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 8, background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ph ph-arrow-right" style={{ fontSize: 16, color: 'var(--color-accent)' }} />
                </Link>
              </td>
            </tr>
          ))}
          {!visiveis.length && <tr><td colSpan={6} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">{lista.length ? 'Nenhum contrato com esses filtros' : 'Nenhum contrato cadastrado'}</td></tr>}
        </tbody>
      </table>

      {contratoEditando && <EditarContratoModal contrato={contratoEditando} onFechar={() => setContratoEditando(null)} onSalvo={carregar} />}

      {mostrarImportar && (
        <ImportarHomologacaoModal
          licitacaoId={licitacaoId}
          fornecedorIdPadrao={fornecedorId || undefined}
          ataOrgaoId={ataDoFornecedor ? ataOrgaoId || undefined : undefined}
          onClose={() => setMostrarImportar(false)}
          onImportar={importarItensHomologados}
        />
      )}
    </div>
  );
}
