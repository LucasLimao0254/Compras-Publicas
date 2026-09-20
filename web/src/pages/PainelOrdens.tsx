import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { HistoricoOrdemModal } from '../components/HistoricoOrdemModal';
import { ImportarPlanilhaDemandaButton } from '../components/ImportarPlanilhaDemandaButton';

type Origem = 'CONTRATO' | 'ATA';
type Aba = 'CONTRATOS' | 'BUSCAR' | 'REQUISICAO' | 'EMITIDA' | 'CANCELADA';

interface Opcao { id: string; label: string; }
interface ContratoOpcao { id: string; numero: string; objeto: string; fornecedor: { razaoSocial: string }; saldoDisponivel: number; situacao: string; }
interface AtaOpcao { id: string; numeroArp: string; }
interface OrgaoOpcao { id: string; secretaria: { titulo: string }; perfil: string; saldoDisponivel: number; }
interface ItemDisp { id: string; numero: number; descricao: string; unidade: string; valorUnitario: string; quantidadeDisponivel: number; }
interface DotacaoLinha { dotacaoId: string; valorRateado: string; }

interface OrdemRow {
  id: string; numero: number; numeroExibicao: string | null; status: string; statusAssinaturas: string; createdAt: string;
  contrato: { id: string; numero: string; fornecedor?: { razaoSocial: string } } | null;
  ataOrgao: { id: string; ata: { id: string; numeroArp: string; detentorPrincipal?: { razaoSocial: string } }; secretaria: { titulo: string } } | null;
  itens: { itemContratoId: string | null; ataItemId: string | null; quantidade: string; precoTotal: string }[];
}

const ABAS_STATUS: { key: Aba; label: string }[] = [
  { key: 'CONTRATOS', label: 'Por contrato' },
  { key: 'BUSCAR', label: 'Buscar' },
  { key: 'REQUISICAO', label: 'Requisições' },
  { key: 'EMITIDA', label: 'Emitido' },
  { key: 'CANCELADA', label: 'Cancelado' },
];

const STATUS_ASSINATURAS_LABEL: Record<string, string> = {
  nao_iniciado: 'Não iniciado', em_andamento: 'Em andamento', concluido: 'Concluído',
};
const STATUS_TAG: Record<string, string> = { EMITIDA: 'tag tag-accent', CANCELADA: 'tag tag-neutral', REQUISICAO: 'tag tag-outline' };
const STATUS_LABEL: Record<string, string> = { EMITIDA: 'Emitida', CANCELADA: 'Cancelada', REQUISICAO: 'Requisição' };

interface OrigemKey { tipo: 'contrato' | 'ata'; id: string; }

export function PainelOrdens() {
  const { usuario } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [ordens, setOrdens] = useState<OrdemRow[]>([]);
  const [aba, setAba] = useState<Aba>('CONTRATOS');
  const [origemAberta, setOrigemAberta] = useState<OrigemKey | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [fNumero, setFNumero] = useState('');
  const [fLicitacaoId, setFLicitacaoId] = useState('');
  const [fOrigemFiltro, setFOrigemFiltro] = useState(''); // "contrato:<id>" ou "ata:<ataOrgaoId>"
  const [fSecretariaId, setFSecretariaId] = useState('');
  const [fFornecedorId, setFFornecedorId] = useState('');

  const [contratos, setContratos] = useState<ContratoOpcao[]>([]);
  const [atas, setAtas] = useState<AtaOpcao[]>([]);
  const [licitacoes, setLicitacoes] = useState<Opcao[]>([]);
  const [secretarias, setSecretarias] = useState<Opcao[]>([]);
  const [fornecedores, setFornecedores] = useState<Opcao[]>([]);
  const [dotacoesDisponiveis, setDotacoesDisponiveis] = useState<{ id: string; label: string }[]>([]);
  const [unidadesExecutoras, setUnidadesExecutoras] = useState<{ id: string; label: string }[]>([]);
  const [orgaosParaFiltro, setOrgaosParaFiltro] = useState<{ ataId: string; orgaoId: string; label: string }[]>([]);

  const [mostrarWizard, setMostrarWizard] = useState(false);
  const [passo, setPasso] = useState<1 | 2>(1);
  const [origem, setOrigem] = useState<Origem>('CONTRATO');
  const [contratoId, setContratoId] = useState('');
  const [ataId, setAtaId] = useState('');
  const [ataOrgaoId, setAtaOrgaoId] = useState('');
  const [orgaosDaAta, setOrgaosDaAta] = useState<OrgaoOpcao[]>([]);
  const [itens, setItens] = useState<ItemDisp[]>([]);
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [dotacoesForm, setDotacoesForm] = useState<DotacaoLinha[]>([{ dotacaoId: '', valorRateado: '' }]);
  const [unidadeExecutoraId, setUnidadeExecutoraId] = useState('');
  const [emitirAgora, setEmitirAgora] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [menuAbertoId, setMenuAbertoId] = useState<string | null>(null);
  const [historicoOrdem, setHistoricoOrdem] = useState<OrdemRow | null>(null);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState<string | null>(null);
  const [editandoOrdemId, setEditandoOrdemId] = useState<string | null>(null);
  const [itensOrdemIdPorItem, setItensOrdemIdPorItem] = useState<Record<string, string>>({});

  // Stub intencional — sem lógica ainda, não "consertar". Painel visual
  // pronto, mas nenhuma chamada de API por trás; enviar não faz nada além de
  // limpar o campo.
  const [mostrarAssistente, setMostrarAssistente] = useState(false);
  const [textoAssistente, setTextoAssistente] = useState('');

  async function carregarListaBase() {
    const params = new URLSearchParams();
    if (fNumero) params.set('numero', fNumero);
    if (fLicitacaoId) params.set('licitacaoId', fLicitacaoId);
    if (fSecretariaId) params.set('secretariaId', fSecretariaId);
    if (fFornecedorId) params.set('fornecedorId', fFornecedorId);
    if (fOrigemFiltro.startsWith('contrato:')) params.set('contratoId', fOrigemFiltro.slice('contrato:'.length));
    if (fOrigemFiltro.startsWith('ata:')) params.set('ataOrgaoId', fOrigemFiltro.slice('ata:'.length));
    const qs = params.toString();
    setOrdens(await api.get(`/ordens${qs ? `?${qs}` : ''}`));
  }

  async function carregarOpcoes() {
    const [c, a, l, s, f, d, u] = await Promise.all([
      api.get('/contratos'), api.get('/atas'), api.get('/licitacoes'), api.get('/secretarias'), api.get('/fornecedores'), api.get('/dotacoes'), api.get('/unidades-executoras'),
    ]);
    setContratos(c);
    setAtas(a);
    setLicitacoes(l.map((x: any) => ({ id: x.id, label: `${x.numero} — ${x.modalidade.replaceAll('_', ' ')}` })));
    setSecretarias(s.map((x: any) => ({ id: x.id, label: x.titulo })));
    setFornecedores(f.map((x: any) => ({ id: x.id, label: `${x.razaoSocial} (${x.cnpjCpf})` })));
    setDotacoesDisponiveis(d.map((x: any) => ({ id: x.id, label: `${x.gestaoUnidade}.${x.fonteRecursos}.${x.programaTrabalho}` })));
    setUnidadesExecutoras(u.map((x: any) => ({ id: x.id, label: `${x.razaoSocial} (${x.cnpj})` })));

    const orgaosPorAta = await Promise.all(a.map(async (ata: AtaOpcao) => {
      const detalhe = await api.get(`/atas/${ata.id}`);
      return (detalhe.orgaos ?? []).map((o: any) => ({ ataId: ata.id, orgaoId: o.id, label: `${ata.numeroArp} — ${o.secretaria.titulo}` }));
    }));
    setOrgaosParaFiltro(orgaosPorAta.flat());
  }

  useEffect(() => { carregarOpcoes(); }, []);
  useEffect(() => { carregarListaBase(); }, [fNumero, fLicitacaoId, fOrigemFiltro, fSecretariaId, fFornecedorId]);

  // KPI "Ordens emitidas" clicável no contrato traz o painel já filtrado —
  // chip removível acima da lista, ver briefing_fornecedores_ordens.md seção 2.
  const contratoIdFiltro = searchParams.get('contratoId');
  useEffect(() => {
    if (contratoIdFiltro) {
      setAba('BUSCAR');
      setFOrigemFiltro(`contrato:${contratoIdFiltro}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contratoIdFiltro]);

  function removerFiltroContrato() {
    setFOrigemFiltro('');
    const proximos = new URLSearchParams(searchParams);
    proximos.delete('contratoId');
    setSearchParams(proximos);
  }
  const contratoFiltroNumero = contratos.find((c) => c.id === contratoIdFiltro)?.numero;

  useEffect(() => {
    if (!ataId) { setOrgaosDaAta([]); return; }
    api.get(`/atas/${ataId}`).then((a) => setOrgaosDaAta(a.orgaos ?? []));
  }, [ataId]);

  const contadores = useMemo(() => ({
    REQUISICAO: ordens.filter((o) => o.status === 'REQUISICAO').length,
    EMITIDA: ordens.filter((o) => o.status === 'EMITIDA').length,
    CANCELADA: ordens.filter((o) => o.status === 'CANCELADA').length,
  }), [ordens]);

  const ordensVisiveis = aba === 'BUSCAR' || aba === 'CONTRATOS' ? ordens : ordens.filter((o) => o.status === aba);

  const gruposPorOrigem = useMemo(() => {
    const mapa = new Map<string, { chave: OrigemKey; label: string; fornecedor: string; qtd: number; total: number; ultima: string }>();
    for (const o of ordens) {
      const chave: OrigemKey | null = o.contrato ? { tipo: 'contrato', id: o.contrato.id } : o.ataOrgao ? { tipo: 'ata', id: o.ataOrgao.id } : null;
      if (!chave) continue;
      const k = `${chave.tipo}:${chave.id}`;
      const total = o.itens.reduce((acc, it) => acc + Number(it.precoTotal), 0);
      const existente = mapa.get(k);
      if (existente) {
        existente.qtd += 1;
        existente.total += total;
        if (o.createdAt > existente.ultima) existente.ultima = o.createdAt;
      } else {
        mapa.set(k, {
          chave,
          label: o.contrato ? `Contrato ${o.contrato.numero}` : o.ataOrgao!.ata.numeroArp,
          fornecedor: o.contrato?.fornecedor?.razaoSocial ?? o.ataOrgao?.ata.detentorPrincipal?.razaoSocial ?? '—',
          qtd: 1, total, ultima: o.createdAt,
        });
      }
    }
    return Array.from(mapa.values()).sort((a, b) => (a.ultima < b.ultima ? 1 : -1));
  }, [ordens]);

  const ordensDaOrigem = useMemo(() => {
    if (!origemAberta) return [];
    return ordens.filter((o) => (origemAberta.tipo === 'contrato' ? o.contrato?.id === origemAberta.id : o.ataOrgao?.id === origemAberta.id));
  }, [ordens, origemAberta]);

  const contratoSelecionado = contratos.find((c) => c.id === contratoId);
  const orgaoSelecionado = orgaosDaAta.find((o) => o.id === ataOrgaoId);
  const ataSelecionadaNumero = atas.find((a) => a.id === ataId)?.numeroArp;

  function resetWizard() {
    setPasso(1); setOrigem('CONTRATO'); setContratoId(''); setAtaId(''); setAtaOrgaoId('');
    setItens([]); setQuantidades({}); setDotacoesForm([{ dotacaoId: '', valorRateado: '' }]); setUnidadeExecutoraId(''); setEmitirAgora(true); setErro(null);
    setEditandoOrdemId(null); setItensOrdemIdPorItem({});
  }

  async function editarOrdemExistente(o: OrdemRow) {
    const detalhe = await api.get(`/ordens/${o.id}`);
    resetWizard();
    setEditandoOrdemId(o.id);
    setMostrarWizard(true);
    setMenuAbertoId(null);
    const mapa: Record<string, string> = {};
    if (detalhe.contrato) {
      setOrigem('CONTRATO');
      setContratoId(detalhe.contrato.id);
      const dados = await api.get(`/contratos/${detalhe.contrato.id}/itens`);
      setItens(dados);
      const q: Record<string, string> = {};
      for (const it of detalhe.itens) if (it.itemContratoId) { q[it.itemContratoId] = it.quantidade; mapa[it.itemContratoId] = it.id; }
      setQuantidades(q);
    } else if (detalhe.ataOrgao) {
      setOrigem('ATA');
      setAtaId(detalhe.ataOrgao.ata.id);
      setAtaOrgaoId(detalhe.ataOrgao.id);
      const dados = await api.get(`/atas/${detalhe.ataOrgao.ata.id}/orgaos/${detalhe.ataOrgao.id}/itens`);
      setItens(dados.map((it: any) => ({ id: it.id, numero: it.numeroItem, descricao: it.descricao, unidade: it.unidade, valorUnitario: it.valorUnitario, quantidadeDisponivel: it.quantidadeDisponivel })));
      const q: Record<string, string> = {};
      for (const it of detalhe.itens) if (it.ataItemId) { q[it.ataItemId] = it.quantidade; mapa[it.ataItemId] = it.id; }
      setQuantidades(q);
    }
    setItensOrdemIdPorItem(mapa);
    if (detalhe.unidadeExecutora) setUnidadeExecutoraId(detalhe.unidadeExecutora.id);
    setPasso(2);
  }

  async function salvarEdicaoOrdem() {
    if (!editandoOrdemId) return;
    setErro(null);
    setSalvando(true);
    try {
      const itensPayload = itens
        .filter((it) => Number(quantidades[it.id]) > 0 && itensOrdemIdPorItem[it.id])
        .map((it) => ({ itemOrdemId: itensOrdemIdPorItem[it.id], quantidade: Number(quantidades[it.id]) }));
      if (!itensPayload.length) throw new Error('Selecione ao menos um item já pertencente a esta ordem');
      await api.patch(`/ordens/${editandoOrdemId}`, { itens: itensPayload });
      setMostrarWizard(false);
      resetWizard();
      carregarListaBase();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao editar ordem');
    } finally {
      setSalvando(false);
    }
  }

  async function irParaPasso2() {
    if (origem === 'CONTRATO') {
      if (!contratoId) return;
      const dados = await api.get(`/contratos/${contratoId}/itens`);
      setItens(dados);
    } else {
      if (!ataOrgaoId) return;
      const dados = await api.get(`/atas/${ataId}/orgaos/${ataOrgaoId}/itens`);
      setItens(dados.map((it: any) => ({ id: it.id, numero: it.numeroItem, descricao: it.descricao, unidade: it.unidade, valorUnitario: it.valorUnitario, quantidadeDisponivel: it.quantidadeDisponivel })));
    }
    setPasso(2);
  }

  function abrirWizardParaOrigem(chave: OrigemKey) {
    resetWizard();
    if (chave.tipo === 'contrato') {
      setOrigem('CONTRATO');
      setContratoId(chave.id);
    } else {
      setOrigem('ATA');
      const orgao = ordens.find((o) => o.ataOrgao?.id === chave.id)?.ataOrgao;
      if (orgao) setAtaId(orgao.ata.id);
      setAtaOrgaoId(chave.id);
    }
    setMostrarWizard(true);
  }

  async function copiarOrdem(o: OrdemRow) {
    const detalhe = await api.get(`/ordens/${o.id}`);
    resetWizard();
    setMostrarWizard(true);
    setMenuAbertoId(null);
    if (detalhe.contrato) {
      setOrigem('CONTRATO');
      setContratoId(detalhe.contrato.id);
      const dados = await api.get(`/contratos/${detalhe.contrato.id}/itens`);
      setItens(dados);
      const q: Record<string, string> = {};
      for (const it of detalhe.itens) if (it.itemContratoId) q[it.itemContratoId] = it.quantidade;
      setQuantidades(q);
    } else if (detalhe.ataOrgao) {
      setOrigem('ATA');
      setAtaId(detalhe.ataOrgao.ata.id);
      setAtaOrgaoId(detalhe.ataOrgao.id);
      const dados = await api.get(`/atas/${detalhe.ataOrgao.ata.id}/orgaos/${detalhe.ataOrgao.id}/itens`);
      setItens(dados.map((it: any) => ({ id: it.id, numero: it.numeroItem, descricao: it.descricao, unidade: it.unidade, valorUnitario: it.valorUnitario, quantidadeDisponivel: it.quantidadeDisponivel })));
      const q: Record<string, string> = {};
      for (const it of detalhe.itens) if (it.ataItemId) q[it.ataItemId] = it.quantidade;
      setQuantidades(q);
    }
    if (detalhe.unidadeExecutora) setUnidadeExecutoraId(detalhe.unidadeExecutora.id);
    setPasso(2);
  }

  const valorTotal = itens.reduce((acc, it) => acc + (Number(quantidades[it.id] || 0) * Number(it.valorUnitario)), 0);
  const itensSelecionados = Object.values(quantidades).filter((q) => Number(q) > 0).length;

  function addDotacaoRow() { setDotacoesForm([...dotacoesForm, { dotacaoId: '', valorRateado: '' }]); }
  function updateDotacaoRow(idx: number, patch: Partial<DotacaoLinha>) {
    setDotacoesForm(dotacoesForm.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }
  function removeDotacaoRow(idx: number) { setDotacoesForm(dotacoesForm.filter((_, i) => i !== idx)); }

  async function emitirWizard() {
    setErro(null);
    setSalvando(true);
    try {
      const chaveItem = origem === 'CONTRATO' ? 'itemContratoId' : 'ataItemId';
      const itensPayload = itens
        .filter((it) => Number(quantidades[it.id]) > 0)
        .map((it) => ({ [chaveItem]: it.id, quantidade: Number(quantidades[it.id]) }));
      if (!itensPayload.length) throw new Error('Selecione ao menos um item');
      const dotacoesPayload = dotacoesForm
        .filter((d) => d.dotacaoId)
        .map((d) => ({ dotacaoId: d.dotacaoId, valorRateado: d.valorRateado ? Number(d.valorRateado) : undefined }));
      const origemBody = origem === 'CONTRATO' ? { contratoId } : { ataOrgaoId };
      await api.post('/ordens', {
        ...origemBody,
        unidadeExecutoraId: unidadeExecutoraId || undefined,
        emitirAgora,
        itens: itensPayload,
        dotacoes: dotacoesPayload.length ? dotacoesPayload : undefined,
      });
      setMostrarWizard(false);
      resetWizard();
      carregarListaBase();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar ordem');
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarCancelar(id: string) {
    try {
      await api.patch(`/ordens/${id}/cancelar`);
      setConfirmandoCancelar(null);
      setMenuAbertoId(null);
      carregarListaBase();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao cancelar ordem');
    }
  }

  async function emitirOrdemExistente(id: string) {
    try {
      await api.post(`/ordens/${id}/emitir`);
      setMenuAbertoId(null);
      carregarListaBase();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Erro ao emitir ordem');
    }
  }

  function linhaOrdem(o: OrdemRow) {
    const total = o.itens.reduce((acc, it) => acc + Number(it.precoTotal), 0);
    const contratoArp = o.contrato ? `Contrato ${o.contrato.numero}` : o.ataOrgao ? o.ataOrgao.ata.numeroArp : '—';
    const orgaoTxt = o.ataOrgao ? o.ataOrgao.secretaria.titulo : '—';
    const fornecedor = o.contrato?.fornecedor?.razaoSocial ?? o.ataOrgao?.ata.detentorPrincipal?.razaoSocial ?? '—';
    return (
      <tr key={o.id} style={{ position: 'relative' }}>
        <td>
          <i className="ph ph-dots-three-vertical" style={{ fontSize: 18, cursor: 'pointer', color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}
            onClick={() => setMenuAbertoId(menuAbertoId === o.id ? null : o.id)} />
          {menuAbertoId === o.id && (
            <div style={{ position: 'absolute', zIndex: 10, marginTop: 4, background: 'var(--color-surface)', boxShadow: 'var(--shadow-md)', borderRadius: 8, padding: 6, minWidth: 170 }}>
              <div onClick={() => copiarOrdem(o)} style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer' }}>Copiar ordem</div>
              {o.status === 'REQUISICAO' && (
                <div onClick={() => emitirOrdemExistente(o.id)} style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', color: 'var(--color-accent)' }}>Emitir ordem</div>
              )}
              {/* Requisição (rascunho) — qualquer usuário pode descartar. Ordem já
                  emitida — editar/excluir fica restrito a Administrador do tenant;
                  os demais só têm ações de leitura/impressão nela (ver
                  briefing_fornecedores_ordens.md seção 3). */}
              {o.status === 'REQUISICAO' && (
                confirmandoCancelar === o.id ? (
                  <div style={{ padding: '8px 10px' }}>
                    <div className="text-muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Confirma cancelar?</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <span onClick={() => confirmarCancelar(o.id)} style={{ fontSize: 11.5, color: 'var(--color-critical)', cursor: 'pointer' }}>Sim, cancelar</span>
                      <span onClick={() => setConfirmandoCancelar(null)} className="text-muted" style={{ fontSize: 11.5, cursor: 'pointer' }}>Voltar</span>
                    </div>
                  </div>
                ) : (
                  <div onClick={() => setConfirmandoCancelar(o.id)} style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', color: 'var(--color-critical)' }}>Cancelar</div>
                )
              )}
              {o.status === 'EMITIDA' && usuario?.tipoUsuario === 'ADMIN' && (
                <>
                  <div onClick={() => editarOrdemExistente(o)} style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer' }}>Editar</div>
                  {confirmandoCancelar === o.id ? (
                    <div style={{ padding: '8px 10px' }}>
                      <div className="text-muted" style={{ fontSize: 11.5, marginBottom: 4 }}>Confirma excluir?</div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <span onClick={() => confirmarCancelar(o.id)} style={{ fontSize: 11.5, color: 'var(--color-critical)', cursor: 'pointer' }}>Sim, excluir</span>
                        <span onClick={() => setConfirmandoCancelar(null)} className="text-muted" style={{ fontSize: 11.5, cursor: 'pointer' }}>Voltar</span>
                      </div>
                    </div>
                  ) : (
                    <div onClick={() => setConfirmandoCancelar(o.id)} style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer', color: 'var(--color-critical)' }}>Excluir</div>
                  )}
                </>
              )}
              <div onClick={() => { setHistoricoOrdem(o); setMenuAbertoId(null); }} style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer' }}>Ver histórico</div>
              {o.status === 'EMITIDA' && (
                <div onClick={() => { window.print(); setMenuAbertoId(null); }} style={{ padding: '8px 10px', borderRadius: 6, fontSize: 12.5, cursor: 'pointer' }}>Imprimir</div>
              )}
            </div>
          )}
        </td>
        <td className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{o.numeroExibicao ?? String(o.numero).padStart(3, '0')}</td>
        <td style={{ fontSize: 12.5, color: 'color-mix(in srgb, var(--color-text) 65%, transparent)' }}>{STATUS_ASSINATURAS_LABEL[o.statusAssinaturas] ?? o.statusAssinaturas}</td>
        <td style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>{fornecedor}</td>
        <td className="num" style={{ fontSize: 12.5 }}>{contratoArp}</td>
        <td style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 58%, transparent)' }}>{orgaoTxt}</td>
        <td className="num" style={{ textAlign: 'right' }}>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        <td className="num" style={{ fontSize: 12.5, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
        <td><span className={STATUS_TAG[o.status] ?? 'tag tag-neutral'}>{STATUS_LABEL[o.status] ?? o.status}</span></td>
      </tr>
    );
  }

  return (
    <div className="content-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 18 }}>
        <div>
          <div className="eyebrow">Compras</div>
          <h2 className="page-title">Painel de ordens</h2>
          <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>{ordens.length} {ordens.length === 1 ? 'ordem' : 'ordens'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setMostrarWizard((v) => !v); resetWizard(); }}>
          <i className={`ph ${mostrarWizard ? 'ph-x' : 'ph-plus'}`} />{mostrarWizard ? 'Cancelar' : 'Nova ordem'}
        </button>
      </div>

      {mostrarWizard && (
        <div className="card elev-md" style={{ padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: mostrarAssistente ? 12 : 0 }}>
            <button type="button" className="btn btn-ghost" onClick={() => setMostrarAssistente((v) => !v)}>
              <i className="ph ph-sparkle" />{mostrarAssistente ? 'Fechar assistente' : 'Assistente'}
            </button>
          </div>
          {mostrarAssistente && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderRadius: 8, background: 'color-mix(in srgb, var(--color-accent) 6%, transparent)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 20%, transparent)', padding: 12, marginBottom: 16 }}>
              <input
                className="input"
                placeholder="Em breve: descreva o que precisa e eu monto a ordem para você"
                value={textoAssistente}
                onChange={(e) => setTextoAssistente(e.target.value)}
                style={{ flex: 1 }}
              />
              <button type="button" className="btn btn-secondary" onClick={() => setTextoAssistente('')}>
                <i className="ph ph-paper-plane-tilt" />Enviar
              </button>
            </div>
          )}
          {passo === 1 && (
            <div>
              <h4 style={{ fontSize: 15, marginBottom: 12 }}>1. Selecione a origem</h4>
              <div className="seg" style={{ marginBottom: 14 }}>
                <label className="seg-opt"><input type="radio" checked={origem === 'CONTRATO'} onChange={() => { setOrigem('CONTRATO'); setAtaId(''); setAtaOrgaoId(''); }} />Contrato</label>
                <label className="seg-opt"><input type="radio" checked={origem === 'ATA'} onChange={() => { setOrigem('ATA'); setContratoId(''); }} />Ata / Credenciamento</label>
              </div>

              {origem === 'CONTRATO' ? (
                <select className="input" style={{ marginBottom: 16 }} value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
                  <option value="">Nº do contrato ou fornecedor</option>
                  {contratos.map((c) => <option key={c.id} value={c.id}>{c.numero} — {c.fornecedor.razaoSocial}</option>)}
                </select>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <select className="input" value={ataId} onChange={(e) => { setAtaId(e.target.value); setAtaOrgaoId(''); }}>
                    <option value="">Selecione a ata</option>
                    {atas.map((a) => <option key={a.id} value={a.id}>{a.numeroArp}</option>)}
                  </select>
                  <select className="input" value={ataOrgaoId} onChange={(e) => setAtaOrgaoId(e.target.value)} disabled={!ataId}>
                    <option value="">Selecione o órgão</option>
                    {orgaosDaAta.map((o) => <option key={o.id} value={o.id}>{o.secretaria.titulo} ({o.perfil === 'GERENCIADOR' ? 'Gerenciador' : 'Participante'})</option>)}
                  </select>
                </div>
              )}

              <button className="btn btn-primary" onClick={irParaPasso2} disabled={origem === 'CONTRATO' ? !contratoId : !ataOrgaoId}>
                Selecionar itens<i className="ph ph-arrow-right" />
              </button>
            </div>
          )}
          {passo === 2 && (
            <div>
              {origem === 'CONTRATO' && contratoSelecionado && (
                <div style={{ borderRadius: 8, background: 'color-mix(in srgb, var(--color-text) 5%, transparent)', padding: 12, marginBottom: 16, fontSize: 13 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>Contrato {contratoSelecionado.numero} — {contratoSelecionado.fornecedor.razaoSocial}</div>
                  <div className="text-muted">{contratoSelecionado.objeto}</div>
                  <div style={{ color: 'var(--color-accent-300)', marginTop: 4 }}>Saldo disponível: R$ {contratoSelecionado.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                </div>
              )}
              {origem === 'ATA' && orgaoSelecionado && (
                <div style={{ borderRadius: 8, background: 'color-mix(in srgb, var(--color-text) 5%, transparent)', padding: 12, marginBottom: 16, fontSize: 13 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{ataSelecionadaNumero} — {orgaoSelecionado.secretaria.titulo}</div>
                  <div className="text-muted">{orgaoSelecionado.perfil === 'GERENCIADOR' ? 'Órgão Gerenciador' : 'Órgão Participante'}</div>
                  <div style={{ color: 'var(--color-accent-300)', marginTop: 4 }}>Saldo disponível: R$ {orgaoSelecionado.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                </div>
              )}

              <div className="field" style={{ marginBottom: 16 }}>
                <label>Unidade executora (CNPJ emissor)</label>
                <select className="input" value={unidadeExecutoraId} onChange={(e) => setUnidadeExecutoraId(e.target.value)}>
                  <option value="">Selecione (opcional)</option>
                  {unidadesExecutoras.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, marginBottom: 12, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }} className="text-muted">Itens selecionados: {itensSelecionados}</span>
                <ImportarPlanilhaDemandaButton itens={itens} onQuantidades={(novas) => setQuantidades((prev) => ({ ...prev, ...novas }))} />
                <span className="num" style={{ fontSize: 13 }}>Total: R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <table className="table" style={{ marginBottom: 16 }}>
                <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Disponível</th><th style={{ textAlign: 'right' }}>Valor unit.</th><th style={{ width: 120 }}>Qtd. a pedir</th></tr></thead>
                <tbody>
                  {itens.map((it) => (
                    <tr key={it.id}>
                      <td style={{ fontSize: 13.5 }}>{it.descricao} <span className="text-muted">({it.unidade})</span></td>
                      <td className="num" style={{ textAlign: 'right' }}>{it.quantidadeDisponivel}</td>
                      <td className="num" style={{ textAlign: 'right' }}>R$ {Number(it.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td><input className="input num" type="number" min={0} max={it.quantidadeDisponivel} style={{ textAlign: 'right' }}
                        disabled={!!editandoOrdemId && !itensOrdemIdPorItem[it.id]}
                        value={quantidades[it.id] || ''} onChange={(e) => setQuantidades({ ...quantidades, [it.id]: e.target.value })} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>Dotação orçamentária</span>
                  <button className="btn btn-ghost" type="button" onClick={addDotacaoRow}><i className="ph ph-plus" />Adicionar dotação</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {dotacoesForm.map((d, idx) => (
                    <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 200px 32px', gap: 8, alignItems: 'center' }}>
                      <select className="input" value={d.dotacaoId} onChange={(e) => updateDotacaoRow(idx, { dotacaoId: e.target.value })}>
                        <option value="">Selecionar dotação {idx + 1}</option>
                        {dotacoesDisponiveis.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                      </select>
                      <input className="input num" placeholder="Valor rateado (opcional)" type="number" step="0.01" value={d.valorRateado} onChange={(e) => updateDotacaoRow(idx, { valorRateado: e.target.value })} />
                      <i className="ph ph-trash" onClick={() => removeDotacaoRow(idx)} style={{ fontSize: 15, cursor: 'pointer', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />
                    </div>
                  ))}
                </div>
              </div>

              {!editandoOrdemId && (
                <label className="radio" style={{ marginBottom: 16, fontSize: 13 }}>
                  <input type="checkbox" checked={emitirAgora} onChange={(e) => setEmitirAgora(e.target.checked)} /><span className="dot" />
                  Emitir agora (desmarque para salvar como requisição/rascunho, sem consumir saldo ainda)
                </label>
              )}

              {erro && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', borderRadius: 8, background: 'color-mix(in srgb, var(--color-critical) 14%, transparent)', boxShadow: 'inset 0 0 0 1px var(--color-critical)', marginBottom: 16 }}>
                  <i className="ph ph-warning-circle" style={{ fontSize: 16, color: 'var(--color-critical)' }} />
                  <div style={{ fontSize: 12.5 }}>{erro}</div>
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => { if (editandoOrdemId) { setMostrarWizard(false); resetWizard(); } else { setPasso(1); } }}>{editandoOrdemId ? 'Cancelar' : 'Voltar'}</button>
                <button className="btn btn-primary" onClick={editandoOrdemId ? salvarEdicaoOrdem : emitirWizard} disabled={salvando}>
                  {salvando ? 'Salvando...' : editandoOrdemId ? 'Salvar edição' : emitirAgora ? 'Emitir ordem' : 'Salvar como requisição'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 22, margin: '6px 0 20px', boxShadow: 'inset 0 -1px 0 var(--color-divider)' }}>
        {ABAS_STATUS.map((a) => (
          <button key={a.key} className={`tabbtn${aba === a.key ? ' active' : ''}`} onClick={() => { setAba(a.key); setOrigemAberta(null); }}>
            {a.label}{a.key !== 'BUSCAR' && a.key !== 'CONTRATOS' && ` (${contadores[a.key as 'REQUISICAO' | 'EMITIDA' | 'CANCELADA']})`}
          </button>
        ))}
      </div>

      {aba === 'CONTRATOS' && !origemAberta && (
        <table className="table">
          <thead><tr><th style={{ width: 110 }}>Contrato/ARP</th><th>Fornecedor</th><th style={{ width: 100, textAlign: 'right' }}>Ordens</th><th style={{ width: 150, textAlign: 'right' }}>Valor total</th><th style={{ width: 120 }}>Última ordem</th><th style={{ width: 40 }}></th></tr></thead>
          <tbody>
            {gruposPorOrigem.map((g) => (
              <tr key={`${g.chave.tipo}:${g.chave.id}`} style={{ cursor: 'pointer' }} onClick={() => setOrigemAberta(g.chave)}>
                <td className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{g.label}</td>
                <td style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>{g.fornecedor}</td>
                <td className="num" style={{ textAlign: 'right' }}>{g.qtd}</td>
                <td className="num" style={{ textAlign: 'right' }}>R$ {g.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="num" style={{ fontSize: 12.5, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>{new Date(g.ultima).toLocaleDateString('pt-BR')}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginLeft: 'auto' }}>
                    <i className="ph ph-arrow-right" style={{ fontSize: 16, color: 'var(--color-accent)' }} />
                  </div>
                </td>
              </tr>
            ))}
            {!gruposPorOrigem.length && <tr><td colSpan={6} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhuma ordem emitida</td></tr>}
          </tbody>
        </table>
      )}

      {aba === 'CONTRATOS' && origemAberta && (
        <div>
          <div onClick={() => setOrigemAberta(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-accent)', cursor: 'pointer', marginBottom: 16 }}>
            <i className="ph ph-arrow-left" style={{ fontSize: 14 }} />Painel de ordens
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 18 }}>
            <h3 style={{ fontSize: 22, margin: 0 }}>{gruposPorOrigem.find((g) => g.chave.id === origemAberta.id)?.label}</h3>
            <button className="btn btn-primary" onClick={() => abrirWizardParaOrigem(origemAberta)}><i className="ph ph-plus" />Nova ordem</button>
          </div>
          <table className="table">
            <thead><tr><th></th><th style={{ width: 96 }}>Ordem</th><th>Assinaturas</th><th>Fornecedor</th><th>Contrato/ARP</th><th>Órgão</th><th style={{ textAlign: 'right' }}>Valor</th><th>Data</th><th>Status</th></tr></thead>
            <tbody>{ordensDaOrigem.map(linhaOrdem)}</tbody>
          </table>
        </div>
      )}

      {aba !== 'CONTRATOS' && (
        <>
          {contratoIdFiltro && contratoFiltroNumero && (
            <div style={{ marginBottom: 12 }}>
              <span
                onClick={removerFiltroContrato}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', background: 'color-mix(in srgb, var(--color-accent) 14%, transparent)', color: 'var(--color-accent-200)' }}
              >
                Contrato: {contratoFiltroNumero}<i className="ph ph-x" />
              </span>
            </div>
          )}
          <div style={{ marginBottom: 16 }}>
            <button className="btn btn-ghost" onClick={() => setFiltrosAbertos((v) => !v)}>
              <i className={`ph ${filtrosAbertos ? 'ph-caret-up' : 'ph-caret-down'}`} />Filtros
            </button>
            {filtrosAbertos && (
              <div className="card elev-sm" style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(5,minmax(0,1fr))', gap: 12, padding: 16 }}>
                <input className="input" placeholder="Nº da ordem" value={fNumero} onChange={(e) => setFNumero(e.target.value)} />
                <select className="input" value={fLicitacaoId} onChange={(e) => setFLicitacaoId(e.target.value)}>
                  <option value="">Licitação</option>
                  {licitacoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <select className="input" value={fOrigemFiltro} onChange={(e) => setFOrigemFiltro(e.target.value)}>
                  <option value="">Contrato / ARP</option>
                  {contratos.map((c) => <option key={c.id} value={`contrato:${c.id}`}>Contrato {c.numero}</option>)}
                  {orgaosParaFiltro.map((o) => <option key={o.orgaoId} value={`ata:${o.orgaoId}`}>{o.label}</option>)}
                </select>
                <select className="input" value={fSecretariaId} onChange={(e) => setFSecretariaId(e.target.value)}>
                  <option value="">Órgão</option>
                  {secretarias.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <select className="input" value={fFornecedorId} onChange={(e) => setFFornecedorId(e.target.value)}>
                  <option value="">Fornecedor</option>
                  {fornecedores.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="table-wrap">
            <table className="table" style={{ minWidth: 920 }}>
              <thead><tr><th></th><th style={{ width: 96 }}>Ordem</th><th>Assinaturas</th><th>Fornecedor</th><th>Contrato/ARP</th><th>Órgão</th><th style={{ textAlign: 'right' }}>Valor total</th><th>Data</th><th>Status</th></tr></thead>
              <tbody>
                {ordensVisiveis.map(linhaOrdem)}
                {!ordensVisiveis.length && <tr><td colSpan={9} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhuma ordem encontrada</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}

      {historicoOrdem && (
        <HistoricoOrdemModal ordemId={historicoOrdem.id} numero={historicoOrdem.numeroExibicao ?? String(historicoOrdem.numero).padStart(3, '0')} onClose={() => setHistoricoOrdem(null)} />
      )}
    </div>
  );
}
