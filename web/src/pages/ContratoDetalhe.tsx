import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { GerarMinutaButton } from '../components/GerarMinutaButton';

type Aba = 'itens' | 'ordens' | 'aditivos' | 'minutas';
type TipoAditivo = 'VALOR' | 'PRAZO' | 'QUANTIDADE' | 'SUPRESSAO' | 'ACRESCIMO_ESPECIAL';
type TipoApostilamento = 'REAJUSTE_REPACTUACAO' | 'ATUALIZACAO_FINANCEIRA' | 'ALTERACAO_RAZAO_SOCIAL' | 'EMPENHO_DOTACAO';

interface Item { id: string; numero: number; descricao: string; unidade: string; quantidade: string; valorUnitario: string; quantidadeUtilizada: number; quantidadeDisponivel: number; }
interface OrdemRow { id: string; numero: number | null; numeroExibicao: string | null; status: string; createdAt: string; itens: { precoTotal: string }[]; }
interface Aditivo {
  id: string; numero: string; tipo: TipoAditivo; dataAssinatura: string;
  percentual: string | null; valorAcrescimo: string | null; diasProrrogacao: number | null;
  vigenciaFinalAnterior: string | null; vigenciaFinalNova: string | null;
  fundamentoLegal: string; justificativa: string; criadoEm: string;
  itens: { quantidadeAcrescida: string; itemContrato: { descricao: string } }[];
}
interface Apostilamento {
  id: string; tipo: TipoApostilamento; descricao: string;
  valorAnterior: string | null; valorNovo: string | null; criadoEm: string;
}

const SITUACAO_TAG: Record<string, string> = { VIGENTE: 'tag tag-accent', MINUTA: 'tag tag-outline', ARQUIVADO: 'tag tag-neutral' };
const TIPO_LABEL: Record<TipoAditivo, string> = { VALOR: 'Valor', PRAZO: 'Prazo', QUANTIDADE: 'Quantidade', SUPRESSAO: 'Supressão', ACRESCIMO_ESPECIAL: 'Acréscimo especial (50%)' };
const TIPO_ICONE: Record<TipoAditivo, string> = { VALOR: 'ph-currency-circle-dollar', PRAZO: 'ph-calendar-plus', QUANTIDADE: 'ph-package', SUPRESSAO: 'ph-minus-circle', ACRESCIMO_ESPECIAL: 'ph-buildings' };
const TIPO_APOSTILAMENTO_LABEL: Record<TipoApostilamento, string> = {
  REAJUSTE_REPACTUACAO: 'Reajuste/repactuação', ATUALIZACAO_FINANCEIRA: 'Atualização financeira',
  ALTERACAO_RAZAO_SOCIAL: 'Alteração de razão social', EMPENHO_DOTACAO: 'Empenho de dotação',
};

interface ModelosMinuta { modelos: { tipo: 'ARP' | 'CONTRATO' | 'ADITIVO' | 'APOSTILAMENTO'; carregado: boolean }[]; prontos: number; total: number; }

export function ContratoDetalhe() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [contrato, setContrato] = useState<any>(null);
  const [modelosMinuta, setModelosMinuta] = useState<ModelosMinuta | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [ordens, setOrdens] = useState<OrdemRow[]>([]);
  const [aba, setAba] = useState<Aba>('itens');

  const [aditivos, setAditivos] = useState<Aditivo[]>([]);
  const [mostrarFormAditivo, setMostrarFormAditivo] = useState(false);
  const [tipoAditivo, setTipoAditivo] = useState<TipoAditivo>('VALOR');
  const [numeroAditivo, setNumeroAditivo] = useState('');
  const [dataAssinatura, setDataAssinatura] = useState('');
  const [percentual, setPercentual] = useState('15');
  const [diasProrrogacao, setDiasProrrogacao] = useState('');
  const [fundamentoLegal, setFundamentoLegal] = useState('Art. 125, Lei 14.133/2021');
  const [justificativa, setJustificativa] = useState('');
  const [quantidadesAditivo, setQuantidadesAditivo] = useState<Record<string, string>>({});
  const [erroAditivo, setErroAditivo] = useState<string | null>(null);

  const [apostilamentos, setApostilamentos] = useState<Apostilamento[]>([]);
  const [mostrarFormApostilamento, setMostrarFormApostilamento] = useState(false);
  const [tipoApostilamento, setTipoApostilamento] = useState<TipoApostilamento>('REAJUSTE_REPACTUACAO');
  const [descricaoApostilamento, setDescricaoApostilamento] = useState('');
  const [valorAnteriorApostilamento, setValorAnteriorApostilamento] = useState('');
  const [valorNovoApostilamento, setValorNovoApostilamento] = useState('');
  const [erroApostilamento, setErroApostilamento] = useState<string | null>(null);

  async function carregar() {
    const [c, i, o] = await Promise.all([api.get(`/contratos/${id}`), api.get(`/contratos/${id}/itens`), api.get(`/ordens?contratoId=${id}`)]);
    setContrato(c);
    setItens(i);
    setOrdens(o);
  }
  useEffect(() => { carregar(); }, [id]);
  useEffect(() => {
    if ((aba === 'aditivos' || aba === 'minutas') && id) {
      api.get(`/contratos/${id}/aditivos`).then(setAditivos);
      api.get(`/contratos/${id}/apostilamentos`).then(setApostilamentos);
    }
    if (aba === 'minutas') {
      api.get('/minutas/modelos').then(setModelosMinuta);
    }
  }, [aba, id]);

  async function onSubmitApostilamento(e: FormEvent) {
    e.preventDefault();
    setErroApostilamento(null);
    try {
      await api.post(`/contratos/${id}/apostilamentos`, {
        tipo: tipoApostilamento, descricao: descricaoApostilamento,
        valorAnterior: valorAnteriorApostilamento ? Number(valorAnteriorApostilamento) : undefined,
        valorNovo: valorNovoApostilamento ? Number(valorNovoApostilamento) : undefined,
      });
      setMostrarFormApostilamento(false);
      setDescricaoApostilamento(''); setValorAnteriorApostilamento(''); setValorNovoApostilamento('');
      api.get(`/contratos/${id}/apostilamentos`).then(setApostilamentos);
    } catch (err) {
      setErroApostilamento(err instanceof Error ? err.message : 'Erro ao registrar apostilamento');
    }
  }

  if (!contrato) return <div className="content-page text-muted">Carregando...</div>;

  const percSaldo = contrato.valorTotal ? (contrato.saldoDisponivel / contrato.valorTotal * 100) : 0;
  const utilizado = contrato.valorTotal - contrato.saldoDisponivel;

  const percNum = Number(percentual.replace(',', '.')) || 0;
  const valorAcrescimoPrevisto = Number(contrato.valorOriginal) * percNum / 100;
  const valorAcrescimoQuantidade = itens.reduce((acc, it) => acc + (Number(quantidadesAditivo[it.id]) || 0) * Number(it.valorUnitario), 0);
  const valorEfetivoDoAditivo = tipoAditivo === 'QUANTIDADE' ? valorAcrescimoQuantidade : valorAcrescimoPrevisto;
  const limiteValor = Number(contrato.valorOriginal) * (tipoAditivo === 'ACRESCIMO_ESPECIAL' ? 0.5 : 0.25);
  // Mesma regra acumulada que o servidor valida (AditivosService.somaAcrescimos):
  // VALOR e QUANTIDADE dividem o mesmo teto de 25% — aumentar quantidade no
  // mesmo preço unitário é, pra lei (art. 125, Lei 14.133/2021), o mesmo que
  // aumentar valor. SUPRESSAO, por ser redução, tem teto próprio; ACRESCIMO_ESPECIAL
  // (Art. 65 §1º-B — reforma de edifício/equipamento) tem teto próprio de 50%.
  const tiposDoAcumulado: TipoAditivo[] = tipoAditivo === 'SUPRESSAO' ? ['SUPRESSAO'] : tipoAditivo === 'ACRESCIMO_ESPECIAL' ? ['ACRESCIMO_ESPECIAL'] : ['VALOR', 'QUANTIDADE'];
  const acumuladoExistente = aditivos.filter((a) => tiposDoAcumulado.includes(a.tipo)).reduce((acc, a) => acc + Number(a.valorAcrescimo ?? 0), 0);
  const acumuladoComEste = acumuladoExistente + valorEfetivoDoAditivo;
  const excede = tipoAditivo !== 'PRAZO' && acumuladoComEste > limiteValor;
  const numeroSugerido = `${aditivos.length + 1}º TA ${contrato.numero}`;

  async function onSubmitAditivo(e: FormEvent) {
    e.preventDefault();
    setErroAditivo(null);
    try {
      const body: any = {
        tipo: tipoAditivo, numero: numeroAditivo || numeroSugerido, dataAssinatura,
        fundamentoLegal, justificativa,
      };
      if (tipoAditivo === 'VALOR' || tipoAditivo === 'SUPRESSAO' || tipoAditivo === 'ACRESCIMO_ESPECIAL') body.percentual = percNum;
      if (tipoAditivo === 'PRAZO') body.diasProrrogacao = Number(diasProrrogacao);
      if (tipoAditivo === 'QUANTIDADE') {
        body.itens = itens
          .filter((it) => Number(quantidadesAditivo[it.id]) > 0)
          .map((it) => ({ itemContratoId: it.id, quantidade: Number(quantidadesAditivo[it.id]) }));
      }
      await api.post(`/contratos/${id}/aditivos`, body);
      setMostrarFormAditivo(false);
      setNumeroAditivo(''); setDataAssinatura(''); setJustificativa(''); setQuantidadesAditivo({});
      await carregar();
      api.get(`/contratos/${id}/aditivos`).then(setAditivos);
    } catch (err) {
      setErroAditivo(err instanceof Error ? err.message : 'Erro ao registrar aditivo');
    }
  }

  return (
    <div className="content-page">
      <Link to="/contratos" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-accent)', marginBottom: 16 }}>
        <i className="ph ph-arrow-left" style={{ fontSize: 14 }} />Contratos
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ maxWidth: '60ch' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <h2 className="num" style={{ fontSize: 30, margin: 0 }}>Contrato {contrato.numero}</h2>
            <span className={SITUACAO_TAG[contrato.situacao] ?? 'tag tag-neutral'}>{contrato.situacao}</span>
          </div>
          <p style={{ fontSize: 14, color: 'color-mix(in srgb, var(--color-text) 62%, transparent)', margin: '0 0 10px' }}>{contrato.objeto}</p>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 48%, transparent)' }}>
            <span><i className="ph ph-storefront" style={{ fontSize: 13, verticalAlign: -2 }} /> {contrato.fornecedor?.razaoSocial}</span>
            <span><i className="ph ph-buildings" style={{ fontSize: 13, verticalAlign: -2 }} /> {contrato.orgaoGerenciador?.titulo}</span>
            <span><i className="ph ph-calendar-blank" style={{ fontSize: 13, verticalAlign: -2 }} /> até {new Date(contrato.vigenciaFinal).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.5fr) repeat(2,minmax(0,1fr))', gap: 14, marginBottom: 8 }}>
        <div className="card elev-sm" style={{ gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 52%, transparent)' }}>Saldo disponível</span>
            <span className="num" style={{ fontSize: 12, color: 'var(--color-accent-300)' }}>{percSaldo.toFixed(1)}%</span>
          </div>
          <div className="num" style={{ fontSize: 26, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>R$ {contrato.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <div className="saldo-bar" style={{ height: 5 }}><span style={{ width: `${Math.max(2, Math.round(percSaldo))}%` }} /></div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>Utilizado R$ {utilizado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de R$ {contrato.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="card elev-sm">
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 52%, transparent)' }}>Valor total</div>
          <div className="num" style={{ fontSize: 20, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>R$ {contrato.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>original R$ {Number(contrato.valorOriginal).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div
          className="card elev-sm"
          onClick={() => navigate(`/ordens?contratoId=${id}`)}
          style={{ cursor: 'pointer' }}
        >
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 52%, transparent)' }}>Ordens emitidas</div>
          <div className="num" style={{ fontSize: 20, fontFamily: 'var(--font-heading)', fontWeight: 500, textDecoration: 'underline', textDecorationColor: 'color-mix(in srgb, var(--color-text) 25%, transparent)', textUnderlineOffset: 3 }}>
            {ordens.filter((o) => o.status === 'EMITIDA').length}
          </div>
          <div className="text-muted" style={{ fontSize: 11.5 }}>
            {ordens.length ? `última em ${new Date(ordens[0].createdAt).toLocaleDateString('pt-BR')}` : 'nenhuma ainda'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 22, margin: '24px 0 4px', boxShadow: 'inset 0 -1px 0 var(--color-divider)' }}>
        <button className={`tabbtn${aba === 'itens' ? ' active' : ''}`} onClick={() => setAba('itens')}>Itens e saldo</button>
        <button className={`tabbtn${aba === 'ordens' ? ' active' : ''}`} onClick={() => setAba('ordens')}>Ordens</button>
        <button className={`tabbtn${aba === 'aditivos' ? ' active' : ''}`} onClick={() => setAba('aditivos')}>Aditivos e apostilamentos{aditivos.length + apostilamentos.length ? ` (${aditivos.length + apostilamentos.length})` : ''}</button>
        <button className={`tabbtn${aba === 'minutas' ? ' active' : ''}`} onClick={() => setAba('minutas')}>Minutas</button>
      </div>

      {aba === 'itens' && (
        <div style={{ paddingTop: 18 }}>
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th><th>Descrição</th><th style={{ width: 96 }}>Unidade</th>
                <th style={{ width: 110, textAlign: 'right' }}>Contratada</th><th style={{ width: 110, textAlign: 'right' }}>Valor unit.</th>
                <th style={{ width: 100, textAlign: 'right' }}>Utilizado</th><th style={{ width: 100, textAlign: 'right' }}>Disponível</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((it) => (
                <tr key={it.id}>
                  <td className="num text-muted">{it.numero}</td>
                  <td>{it.descricao}</td>
                  <td style={{ fontSize: 12.5, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>{it.unidade}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{it.quantidade}</td>
                  <td className="num" style={{ textAlign: 'right' }}>R$ {Number(it.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="num text-muted" style={{ textAlign: 'right' }}>{it.quantidadeUtilizada}</td>
                  <td className="num" style={{ textAlign: 'right', color: 'var(--color-accent-300)' }}>{it.quantidadeDisponivel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {aba === 'ordens' && (
        <div style={{ paddingTop: 18 }}>
          <table className="table">
            <thead><tr><th style={{ width: 120 }}>Ordem</th><th style={{ width: 130 }}>Data</th><th style={{ width: 150, textAlign: 'right' }}>Valor</th><th style={{ width: 110 }}>Status</th></tr></thead>
            <tbody>
              {ordens.map((o) => {
                const total = o.itens.reduce((acc, it) => acc + Number(it.precoTotal), 0);
                return (
                  <tr key={o.id}>
                    <td className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{o.numeroExibicao ?? o.numero ?? '—'}</td>
                    <td className="num text-muted" style={{ fontSize: 12.5 }}>{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className="num" style={{ textAlign: 'right' }}>R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td><span className={o.status === 'EMITIDA' ? 'tag tag-accent' : o.status === 'CANCELADA' ? 'tag tag-neutral' : 'tag tag-outline'}>{o.status === 'EMITIDA' ? 'Emitida' : o.status === 'CANCELADA' ? 'Cancelada' : 'Rascunho'}</span></td>
                  </tr>
                );
              })}
              {!ordens.length && <tr><td colSpan={4} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhuma ordem emitida para este contrato</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {aba === 'aditivos' && (
        <div style={{ paddingTop: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 16 }}>
            <p className="text-muted" style={{ fontSize: 13, margin: 0, maxWidth: '62ch' }}>
              Cada aditivo altera prazo, valor ou quantidade e é aplicado a partir da data de assinatura. O limite de 25% do art. 125 da Lei 14.133/2021 é verificado no acréscimo de valor.
            </p>
            <button className="btn btn-primary" onClick={() => setMostrarFormAditivo((v) => !v)}>
              <i className={`ph ${mostrarFormAditivo ? 'ph-x' : 'ph-plus'}`} />{mostrarFormAditivo ? 'Cancelar' : 'Novo aditivo'}
            </button>
          </div>

          {mostrarFormAditivo && (
            <form onSubmit={onSubmitAditivo} className="card elev-md" style={{ padding: '20px 22px', marginBottom: 22, gap: 16 }}>
              <h4 style={{ fontSize: 15, margin: 0 }}>Novo termo aditivo</h4>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                <div className="field"><label>Tipo</label>
                  <select className="input" value={tipoAditivo} onChange={(e) => setTipoAditivo(e.target.value as TipoAditivo)}>
                    <option value="VALOR">Acréscimo de valor</option>
                    <option value="PRAZO">Prorrogação de prazo</option>
                    <option value="QUANTIDADE">Acréscimo de quantidade</option>
                    <option value="SUPRESSAO">Supressão</option>
                    <option value="ACRESCIMO_ESPECIAL">Acréscimo especial (reforma/equipamento, até 50%)</option>
                  </select></div>
                <div className="field"><label>Número / ano</label>
                  <input className="input" value={numeroAditivo} onChange={(e) => setNumeroAditivo(e.target.value)} placeholder={numeroSugerido} /></div>
                <div className="field"><label>Data de assinatura</label>
                  <input className="input" type="date" value={dataAssinatura} onChange={(e) => setDataAssinatura(e.target.value)} required /></div>
              </div>

              {(tipoAditivo === 'VALOR' || tipoAditivo === 'SUPRESSAO' || tipoAditivo === 'ACRESCIMO_ESPECIAL') && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                    <div className="field"><label>Percentual sobre o valor original</label>
                      <input className="input num" value={percentual} onChange={(e) => setPercentual(e.target.value)} /></div>
                    <div className="field"><label>Valor do {tipoAditivo === 'SUPRESSAO' ? 'decréscimo' : 'acréscimo'}</label>
                      <input className="input num" value={`R$ ${valorAcrescimoPrevisto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} disabled /></div>
                    <div className="field"><label>Novo valor total</label>
                      <input className="input num" value={`R$ ${(contrato.valorTotal + (tipoAditivo === 'SUPRESSAO' ? -valorAcrescimoPrevisto : valorAcrescimoPrevisto)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`} disabled /></div>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', borderRadius: 8, background: excede ? 'color-mix(in srgb, var(--color-critical) 14%, transparent)' : 'color-mix(in srgb, var(--color-text) 5%, transparent)', boxShadow: `inset 0 0 0 1px ${excede ? 'var(--color-critical)' : 'var(--color-divider)'}` }}>
                    <i className={`ph ${excede ? 'ph-warning-circle' : 'ph-check-circle'}`} style={{ fontSize: 16, color: excede ? 'var(--color-critical)' : 'var(--color-accent)' }} />
                    <div style={{ fontSize: 12.5 }}>
                      {(() => {
                        const percLimite = tipoAditivo === 'ACRESCIMO_ESPECIAL' ? '50' : '25';
                        const fundamento = tipoAditivo === 'ACRESCIMO_ESPECIAL' ? 'Art. 65 §1º-B da Lei 14.133/2021' : 'art. 125 da Lei 14.133/2021';
                        return excede
                          ? `${tipoAditivo === 'SUPRESSAO' ? 'Supressão' : 'Acréscimo'} acumulado excede o limite de ${percLimite}% (${fundamento}) — R$ ${limiteValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. O acumulado ficaria em R$ ${acumuladoComEste.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
                          : `Dentro do limite de ${percLimite}% (${fundamento}). Restam R$ ${(limiteValor - acumuladoComEste).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de margem neste tipo de aditivo.`;
                      })()}
                    </div>
                  </div>
                </>
              )}

              {tipoAditivo === 'PRAZO' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
                  <div className="field"><label>Dias de prorrogação</label>
                    <input className="input num" type="number" value={diasProrrogacao} onChange={(e) => setDiasProrrogacao(e.target.value)} required /></div>
                  <div className="field"><label>Vigência final atual</label>
                    <input className="input" value={new Date(contrato.vigenciaFinal).toLocaleDateString('pt-BR')} disabled /></div>
                </div>
              )}

              {tipoAditivo === 'QUANTIDADE' && (
                <div>
                  <div style={{ fontSize: 12, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)', marginBottom: 6 }}>Quantidades a acrescer</div>
                  <table className="table">
                    <thead><tr><th>Item</th><th style={{ textAlign: 'right' }}>Contratada</th><th style={{ width: 140 }}>Acréscimo</th></tr></thead>
                    <tbody>
                      {itens.map((it) => (
                        <tr key={it.id}>
                          <td style={{ fontSize: 13 }}>{it.descricao}</td>
                          <td className="num" style={{ textAlign: 'right' }}>{it.quantidade}</td>
                          <td><input className="input num" type="number" min={0} placeholder="0"
                            value={quantidadesAditivo[it.id] || ''}
                            onChange={(e) => setQuantidadesAditivo({ ...quantidadesAditivo, [it.id]: e.target.value })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 14px', borderRadius: 8, marginTop: 12, background: excede ? 'color-mix(in srgb, var(--color-critical) 14%, transparent)' : 'color-mix(in srgb, var(--color-text) 5%, transparent)', boxShadow: `inset 0 0 0 1px ${excede ? 'var(--color-critical)' : 'var(--color-divider)'}` }}>
                    <i className={`ph ${excede ? 'ph-warning-circle' : 'ph-check-circle'}`} style={{ fontSize: 16, color: excede ? 'var(--color-critical)' : 'var(--color-accent)' }} />
                    <div style={{ fontSize: 12.5 }}>
                      {excede
                        ? `Este acréscimo de quantidade equivale a R$ ${valorAcrescimoQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} e excede, somado aos demais aditivos de valor/quantidade, o limite de 25% do art. 125 da Lei 14.133/2021 (R$ ${limiteValor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}). O acumulado ficaria em R$ ${acumuladoComEste.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`
                        : `Este acréscimo equivale a R$ ${valorAcrescimoQuantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Dentro do limite de 25% do art. 125 da Lei 14.133/2021 — restam R$ ${(limiteValor - acumuladoComEste).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de margem compartilhada com aditivos de valor.`}
                    </div>
                  </div>
                </div>
              )}

              <div className="field"><label>Justificativa</label>
                <textarea className="input" value={justificativa} onChange={(e) => setJustificativa(e.target.value)} placeholder="Motivação técnica e legal do aditamento" required /></div>
              <div className="field"><label>Fundamento legal</label>
                <input className="input" value={fundamentoLegal} onChange={(e) => setFundamentoLegal(e.target.value)} required /></div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn btn-primary" type="submit">Registrar aditivo</button>
                <button className="btn btn-secondary" type="button" onClick={() => setMostrarFormAditivo(false)}>Cancelar</button>
                {erroAditivo && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erroAditivo}</span>}
              </div>
            </form>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {aditivos.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 18, padding: '16px 0', boxShadow: 'inset 0 -1px 0 color-mix(in srgb, var(--color-text) 8%, transparent)' }}>
                <div style={{ width: 34, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <i className={`ph ${TIPO_ICONE[a.tipo]}`} style={{ fontSize: 17, color: 'var(--color-accent)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                    <span className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 14 }}>{a.numero}</span>
                    <span className="tag tag-neutral">{TIPO_LABEL[a.tipo]}</span>
                    <span className="num text-muted" style={{ fontSize: 11.5 }}>assinado em {new Date(a.dataAssinatura).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div style={{ fontSize: 13.5, marginBottom: 4 }}>
                    {a.tipo === 'VALOR' && `Acréscimo de ${a.percentual}% ao valor, +R$ ${Number(a.valorAcrescimo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    {a.tipo === 'ACRESCIMO_ESPECIAL' && `Acréscimo especial de ${a.percentual}% ao valor (Art. 65 §1º-B), +R$ ${Number(a.valorAcrescimo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    {a.tipo === 'SUPRESSAO' && `Supressão de ${a.percentual}% do valor, -R$ ${Number(a.valorAcrescimo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                    {a.tipo === 'PRAZO' && `Vigência prorrogada de ${a.vigenciaFinalAnterior ? new Date(a.vigenciaFinalAnterior).toLocaleDateString('pt-BR') : ''} para ${a.vigenciaFinalNova ? new Date(a.vigenciaFinalNova).toLocaleDateString('pt-BR') : ''}`}
                    {a.tipo === 'QUANTIDADE' && a.itens.map((it) => `${it.itemContrato.descricao} +${it.quantidadeAcrescida}`).join(', ')}
                  </div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{a.justificativa}</div>
                </div>
                <div style={{ flex: 'none', textAlign: 'right' }}>
                  <div className="text-muted" style={{ fontSize: 11 }}>{a.fundamentoLegal}</div>
                  {a.tipo === 'PRAZO' && <div className="num" style={{ fontSize: 15, color: 'var(--color-accent-300)' }}>+{a.diasProrrogacao} dias</div>}
                </div>
              </div>
            ))}
            {!aditivos.length && <div style={{ padding: '44px 0', textAlign: 'center' }} className="text-muted">Nenhum aditivo registrado neste contrato.</div>}
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, margin: '36px 0 16px', boxShadow: 'inset 0 1px 0 var(--color-divider)', paddingTop: 24 }}>
            <div>
              <h4 style={{ fontSize: 15, margin: '0 0 4px' }}>Apostilamentos</h4>
              <p className="text-muted" style={{ fontSize: 13, margin: 0, maxWidth: '62ch' }}>
                Registro formal (art. 136 da Lei 14.133/2021) — nunca altera quantidade, valor ou saldo do contrato.
              </p>
            </div>
            <button className="btn btn-secondary" onClick={() => setMostrarFormApostilamento((v) => !v)}>
              <i className={`ph ${mostrarFormApostilamento ? 'ph-x' : 'ph-plus'}`} />{mostrarFormApostilamento ? 'Cancelar' : 'Novo apostilamento'}
            </button>
          </div>

          {mostrarFormApostilamento && (
            <form onSubmit={onSubmitApostilamento} className="card elev-md" style={{ padding: '20px 22px', marginBottom: 22, gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
                <div className="field"><label>Tipo</label>
                  <select className="input" value={tipoApostilamento} onChange={(e) => setTipoApostilamento(e.target.value as TipoApostilamento)}>
                    {(Object.keys(TIPO_APOSTILAMENTO_LABEL) as TipoApostilamento[]).map((t) => <option key={t} value={t}>{TIPO_APOSTILAMENTO_LABEL[t]}</option>)}
                  </select></div>
                <div className="field"><label>Valor anterior (opcional)</label>
                  <input className="input num" value={valorAnteriorApostilamento} onChange={(e) => setValorAnteriorApostilamento(e.target.value)} placeholder="0,00" /></div>
                <div className="field"><label>Valor novo (opcional)</label>
                  <input className="input num" value={valorNovoApostilamento} onChange={(e) => setValorNovoApostilamento(e.target.value)} placeholder="0,00" /></div>
              </div>
              <div className="field"><label>Descrição</label>
                <textarea className="input" value={descricaoApostilamento} onChange={(e) => setDescricaoApostilamento(e.target.value)} placeholder="O que está sendo registrado formalmente" required /></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button className="btn btn-primary" type="submit">Registrar apostilamento</button>
                <button className="btn btn-secondary" type="button" onClick={() => setMostrarFormApostilamento(false)}>Cancelar</button>
                {erroApostilamento && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erroApostilamento}</span>}
              </div>
            </form>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {apostilamentos.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 18, padding: '16px 0', boxShadow: 'inset 0 -1px 0 color-mix(in srgb, var(--color-text) 8%, transparent)' }}>
                <div style={{ width: 34, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <i className="ph ph-stamp" style={{ fontSize: 17, color: 'var(--color-accent)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                    <span className="tag tag-neutral">{TIPO_APOSTILAMENTO_LABEL[a.tipo]}</span>
                    <span className="num text-muted" style={{ fontSize: 11.5 }}>{new Date(a.criadoEm).toLocaleDateString('pt-BR')}</span>
                  </div>
                  <div style={{ fontSize: 13.5, marginBottom: 4 }}>{a.descricao}</div>
                  {(a.valorAnterior != null || a.valorNovo != null) && (
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {a.valorAnterior != null ? `De R$ ${Number(a.valorAnterior).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} ` : ''}
                      {a.valorNovo != null ? `para R$ ${Number(a.valorNovo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {!apostilamentos.length && <div style={{ padding: '44px 0', textAlign: 'center' }} className="text-muted">Nenhum apostilamento registrado neste contrato.</div>}
          </div>
        </div>
      )}

      {aba === 'minutas' && (() => {
        const ultimoAditivo = aditivos[0];
        const ultimoApostilamento = apostilamentos[0];
        const carregado = (tipo: 'ARP' | 'CONTRATO' | 'ADITIVO' | 'APOSTILAMENTO') => modelosMinuta?.modelos.find((m) => m.tipo === tipo)?.carregado ?? false;
        return (
          <div style={{ paddingTop: 18, maxWidth: 640 }}>
            {modelosMinuta && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, fontSize: 12.5 }}>
                <i className={`ph-fill ${modelosMinuta.prontos === modelosMinuta.total ? 'ph-check-circle' : 'ph-warning-circle'}`} style={{ fontSize: 15, color: modelosMinuta.prontos === modelosMinuta.total ? 'var(--color-accent)' : 'var(--color-warn)' }} />
                <span>{modelosMinuta.prontos} de {modelosMinuta.total} modelos carregados —</span>
                <Link to="/configuracoes" style={{ color: 'var(--color-accent)' }}>gerenciar em Configurações</Link>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>Minuta de contrato</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>Contrato {contrato.numero}</div>
                </div>
                <GerarMinutaButton tipo="CONTRATO" entidadeId={contrato.id} modeloCarregado={carregado('CONTRATO')} label="Gerar" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>Termo aditivo</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{ultimoAditivo ? `Último: ${ultimoAditivo.numero}` : 'Nenhum aditivo registrado ainda'}</div>
                </div>
                <GerarMinutaButton tipo="ADITIVO" entidadeId={ultimoAditivo?.id ?? null} modeloCarregado={carregado('ADITIVO')} label="Gerar" motivoIndisponivel="Nenhum aditivo registrado ainda — registre um na aba Aditivos" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 13.5, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>Apostilamento</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>{ultimoApostilamento ? `Último: ${new Date(ultimoApostilamento.criadoEm).toLocaleDateString('pt-BR')}` : 'Nenhum apostilamento registrado ainda'}</div>
                </div>
                <GerarMinutaButton tipo="APOSTILAMENTO" entidadeId={ultimoApostilamento?.id ?? null} modeloCarregado={carregado('APOSTILAMENTO')} label="Gerar" motivoIndisponivel="Nenhum apostilamento registrado ainda — registre um na aba Aditivos" />
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
