import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { RemanejarSaldoModal } from '../components/RemanejarSaldoModal';
import { ImportarHomologacaoModal } from '../components/ImportarHomologacaoModal';
import { GerenciarLotesModal } from '../components/GerenciarLotesModal';
import { ItemHistoricoModal } from '../components/ItemHistoricoModal';
import { ImportarItensAtaModal } from '../components/ImportarItensAtaModal';
import { GerarMinutaButton } from '../components/GerarMinutaButton';
import { formatarDia } from '../lib/datas';
import { DescricaoResumida } from '../components/DescricaoResumida';

interface Orgao { id: string; perfil: string; quantidadeItens: number; valorTotal: number; valorUtilizado: number; saldoDisponivel: number; secretaria: { titulo: string }; }
interface Item { id: string; numeroItem: number; descricao: string; unidade: string; quantidadeContratada: string; valorUnitario: string; quantidadeUtilizada: number; quantidadeDisponivel: number; homologacaoItemId: string | null; }
interface ContratoDaAta { id: string; numero: string; saldoDisponivel: number; valorTotal: number; fornecedor: { razaoSocial: string }; }

export function AtaDetalhe() {
  const { id } = useParams();
  const [ata, setAta] = useState<any>(null);
  const [orgaoAberto, setOrgaoAberto] = useState<string | null>(null);
  const [itensPorOrgao, setItensPorOrgao] = useState<Record<string, Item[]>>({});
  const [mostrarRemanejar, setMostrarRemanejar] = useState(false);
  const [mostrarFormItem, setMostrarFormItem] = useState<string | null>(null);
  const [descricao, setDescricao] = useState('');
  const [unidade, setUnidade] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [valorUnitario, setValorUnitario] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [temHomologacao, setTemHomologacao] = useState(false);
  const ataVinculada = !!ata?.homologacaoFornecedorId;
  const [importarParaOrgao, setImportarParaOrgao] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [mostrarLotes, setMostrarLotes] = useState(false);
  const [importarPlanilhaOrgao, setImportarPlanilhaOrgao] = useState<string | null>(null);
  const [itemEditando, setItemEditando] = useState<Item | null>(null);
  const [itemHistorico, setItemHistorico] = useState<{ orgaoId: string; item: Item } | null>(null);
  const [prorrogando, setProrrogando] = useState(false);
  const [novaVigencia, setNovaVigencia] = useState('');
  const [salvandoProrrogacao, setSalvandoProrrogacao] = useState(false);
  const [contratosDaAta, setContratosDaAta] = useState<ContratoDaAta[]>([]);
  const [modeloArpCarregado, setModeloArpCarregado] = useState(false);

  async function carregar() {
    const a = await api.get(`/atas/${id}`);
    setAta(a);
    api.get(`/licitacoes/${a.licitacaoId}/homologacao-fornecedores`).then((f) => setTemHomologacao(f.length > 0)).catch(() => setTemHomologacao(false));
    api.get(`/atas/${id}/contratos`).then(setContratosDaAta).catch(() => setContratosDaAta([]));
  }
  useEffect(() => { carregar(); }, [id]);
  useEffect(() => {
    api.get('/minutas/modelos').then((m) => setModeloArpCarregado(m.modelos.find((x: any) => x.tipo === 'ARP')?.carregado ?? false));
  }, []);

  async function recarregarItens(orgaoId: string) {
    const itens = await api.get(`/atas/${id}/orgaos/${orgaoId}/itens`);
    setItensPorOrgao((prev) => ({ ...prev, [orgaoId]: itens }));
  }

  function iniciarEdicaoItem(item: Item) {
    setItemEditando(item);
    setDescricao(item.descricao);
    setUnidade(item.unidade);
    setQuantidade(item.quantidadeContratada);
    setValorUnitario(item.valorUnitario);
    setMostrarFormItem(null);
  }

  async function onSubmitEdicaoItem(e: FormEvent, orgaoId: string) {
    e.preventDefault();
    if (!itemEditando) return;
    setErro(null);
    try {
      await api.patch(`/atas/${id}/orgaos/${orgaoId}/itens/${itemEditando.id}`, {
        descricao, unidade, quantidade: Number(quantidade), valorUnitario: Number(valorUnitario),
      });
      setItemEditando(null);
      setDescricao(''); setUnidade(''); setQuantidade(''); setValorUnitario('');
      await recarregarItens(orgaoId);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao editar item');
    }
  }

  // Renovar uma ata é só estender a própria vigenciaFinal (MODELO.md, seção
  // 4) — mesma ata, mesmo teto, saldo restante preservado, sem criar ata
  // nova nem ciclo. O backend valida que a nova data é posterior à atual.
  async function prorrogarAta() {
    setSalvandoProrrogacao(true);
    setErro(null);
    try {
      await api.post(`/atas/${id}/prorrogar`, { vigenciaFinal: novaVigencia });
      setProrrogando(false);
      setNovaVigencia('');
      await carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao prorrogar vigência');
    } finally {
      setSalvandoProrrogacao(false);
    }
  }

  // Importar da homologação reaproveita o endpoint de adicionar item, um a
  // um, em vez de introduzir um endpoint de bulk-insert só para este fluxo —
  // mesmo princípio de menor-mudança já usado no resto do órgão/item aqui.
  async function importarItensHomologados(orgaoId: string, itens: { homologacaoItemId: string; descricao: string; unidade: string; quantidade: number; valorUnitario: number }[]) {
    setImportando(true);
    setErro(null);
    try {
      for (const it of itens) {
        await api.post(`/atas/${id}/orgaos/${orgaoId}/itens`, it);
      }
      const atualizados = await api.get(`/atas/${id}/orgaos/${orgaoId}/itens`);
      setItensPorOrgao((prev) => ({ ...prev, [orgaoId]: atualizados }));
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar itens');
    } finally {
      setImportando(false);
    }
  }

  async function abrirOrgao(orgaoId: string) {
    if (orgaoAberto === orgaoId) { setOrgaoAberto(null); return; }
    setOrgaoAberto(orgaoId);
    if (!itensPorOrgao[orgaoId]) {
      const itens = await api.get(`/atas/${id}/orgaos/${orgaoId}/itens`);
      setItensPorOrgao((prev) => ({ ...prev, [orgaoId]: itens }));
    }
  }

  async function onSubmitItem(e: FormEvent, orgaoId: string) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post(`/atas/${id}/orgaos/${orgaoId}/itens`, {
        descricao, unidade, quantidade: Number(quantidade), valorUnitario: Number(valorUnitario),
      });
      setDescricao(''); setUnidade(''); setQuantidade(''); setValorUnitario('');
      setMostrarFormItem(null);
      const itens = await api.get(`/atas/${id}/orgaos/${orgaoId}/itens`);
      setItensPorOrgao((prev) => ({ ...prev, [orgaoId]: itens }));
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao adicionar item');
    }
  }

  if (!ata) return <div className="content-page text-muted">Carregando...</div>;

  const perc = ata.valorTotal ? ata.saldoDisponivel / ata.valorTotal : 0;
  const circ = 2 * Math.PI * 42;

  return (
    <div className="content-page">
      <Link to="/atas" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-accent)', marginBottom: 16 }}>
        <i className="ph ph-arrow-left" style={{ fontSize: 14 }} />Atas de registro de preços
      </Link>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 32, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
          <div style={{ position: 'relative', width: 100, height: 100, flex: 'none' }}>
            <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="50" cy="50" r="42" fill="none" stroke="color-mix(in srgb, var(--color-text) 9%, transparent)" strokeWidth="9" />
              <circle cx="50" cy="50" r="42" fill="none" stroke="var(--color-accent)" strokeWidth="9" strokeLinecap="round"
                strokeDasharray={circ} strokeDashoffset={circ * (1 - perc)} />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-heading)', fontSize: 20, fontWeight: 500 }}>
              {Math.round(perc * 100)}%
            </div>
          </div>
          <div>
            <h2 style={{ fontSize: 26, margin: '0 0 4px' }}>Ata {ata.numeroArp}</h2>
            <p className="text-muted" style={{ fontSize: 13, margin: '0 0 10px', maxWidth: '52ch' }}>{ata.detentorPrincipal?.razaoSocial}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <span className="tag tag-neutral">{ata.tipo === 'ATAS' ? 'Ata de Registro de Preços' : 'Credenciamento'}</span>
              <span className="tag tag-outline">{ata.situacao}</span>
              <span className="tag tag-outline">{formatarDia(ata.vigenciaInicial)} – {formatarDia(ata.vigenciaFinal)}</span>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="num" style={{ fontSize: 26, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>R$ {ata.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            <div className="num text-muted" style={{ fontSize: 12 }}>de R$ {ata.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <GerarMinutaButton tipo="ARP" entidadeId={ata.id} modeloCarregado={modeloArpCarregado} label="Gerar minuta ARP" />
            <button className="btn btn-primary" onClick={() => setMostrarRemanejar(true)}><i className="ph ph-arrows-left-right" />Remanejar saldo</button>
          </div>
          {prorrogando ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
              <input
                type="date"
                className="input"
                style={{ width: 148 }}
                value={novaVigencia}
                min={new Date(new Date(ata.vigenciaFinal).getTime() + 86400000).toISOString().slice(0, 10)}
                onChange={(e) => setNovaVigencia(e.target.value)}
              />
              <button className="btn btn-primary" onClick={prorrogarAta} disabled={salvandoProrrogacao || !novaVigencia}>{salvandoProrrogacao ? 'Salvando...' : 'Confirmar'}</button>
              <button className="btn btn-ghost" onClick={() => setProrrogando(false)}>Cancelar</button>
            </div>
          ) : (
            <button className="btn btn-ghost" onClick={() => setProrrogando(true)}><i className="ph ph-calendar-plus" />Prorrogar vigência</button>
          )}
        </div>
      </div>

      <h3 style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 500, margin: '28px 0 12px' }}>Órgãos participantes</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {(ata.orgaos as Orgao[]).map((o) => (
          <div key={o.id} className="elev-sm" style={{ borderRadius: 12, background: 'var(--color-surface)' }}>
            <div onClick={() => abrirOrgao(o.id)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer' }}>
              <i className={`ph ${orgaoAberto === o.id ? 'ph-caret-up' : 'ph-caret-down'}`} style={{ fontSize: 15, color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />
              <div style={{ flex: 1, fontSize: 13.5 }}>{o.secretaria.titulo}</div>
              <span className={o.perfil === 'GERENCIADOR' ? 'tag tag-accent' : 'tag tag-neutral'}>{o.perfil === 'GERENCIADOR' ? 'Gerenciador' : 'Participante'}</span>
              <div style={{ textAlign: 'right', minWidth: 150 }}>
                <div className="num" style={{ fontSize: 12.5 }}>R$ {o.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span className="text-muted">de {o.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
              </div>
            </div>

            {orgaoAberto === o.id && (
              <div style={{ margin: '0 18px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>Itens</span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {ata.atasComLotes && (
                      <button className="btn btn-ghost" onClick={() => setMostrarLotes(true)}>Gerenciar lotes</button>
                    )}
                    {/* Ata vinculada a uma homologação só aceita itens da homologação
                        (MODELO.md, invariante 2) — planilha e item digitado à mão
                        ficam só para ata comum. */}
                    {!ataVinculada && (
                      <button className="btn btn-ghost" onClick={() => setImportarPlanilhaOrgao(o.id)}><i className="ph ph-upload-simple" />Importar</button>
                    )}
                    {temHomologacao && (
                      <button className="btn btn-ghost" onClick={() => setImportarParaOrgao(o.id)}><i className="ph ph-file-arrow-down" />importar da homologação</button>
                    )}
                    {!ataVinculada && (
                      <button className="btn btn-ghost" onClick={() => { setItemEditando(null); setDescricao(''); setUnidade(''); setQuantidade(''); setValorUnitario(''); setMostrarFormItem(mostrarFormItem === o.id ? null : o.id); }}>
                        {mostrarFormItem === o.id ? 'Cancelar' : (<><i className="ph ph-plus" />adicionar item</>)}
                      </button>
                    )}
                  </div>
                </div>

                {(mostrarFormItem === o.id || itemEditando) && (
                  <form onSubmit={(e) => (itemEditando ? onSubmitEdicaoItem(e, o.id) : onSubmitItem(e, o.id))} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px 100px 120px auto auto', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                    <input className="input" placeholder="Descrição" value={descricao} onChange={(e) => setDescricao(e.target.value)} disabled={!!itemEditando?.homologacaoItemId} required />
                    <input className="input" placeholder="Unidade" value={unidade} onChange={(e) => setUnidade(e.target.value)} disabled={!!itemEditando?.homologacaoItemId} required />
                    <input className="input num" placeholder="Qtd." type="number" step="0.001" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} required />
                    <input className="input num" placeholder="Valor unit." type="number" step="0.0001" value={valorUnitario} onChange={(e) => setValorUnitario(e.target.value)} disabled={!!itemEditando?.homologacaoItemId} required />
                    <button className="btn btn-primary">{itemEditando ? 'Salvar' : 'OK'}</button>
                    {/* D3: fechar a edição sem salvar */}
                    <button type="button" className="btn btn-ghost" onClick={() => { setItemEditando(null); setMostrarFormItem(null); setErro(null); }}>Cancelar</button>
                  </form>
                )}
                {erro && <p style={{ fontSize: 12.5, color: 'var(--color-critical)', margin: '0 0 8px' }}>{erro}</p>}

                <table className="table">
                  <thead>
                    <tr><th>#</th><th>Descrição</th><th>Unidade</th><th style={{ textAlign: 'right' }}>Contratada</th><th style={{ textAlign: 'right' }}>Valor unit.</th><th style={{ textAlign: 'right' }}>Utilizado</th><th style={{ textAlign: 'right' }}>Disponível</th><th style={{ width: 60 }}></th></tr>
                  </thead>
                  <tbody>
                    {(itensPorOrgao[o.id] ?? []).map((it) => (
                      <tr key={it.id}>
                        <td className="num text-muted">{it.numeroItem}</td>
                        <td style={{ minWidth: 0 }}><DescricaoResumida texto={it.descricao} /></td>
                        <td style={{ fontSize: 12.5, color: 'color-mix(in srgb, var(--color-text) 55%, transparent)' }}>{it.unidade}</td>
                        <td className="num" style={{ textAlign: 'right' }}>{it.quantidadeContratada}</td>
                        <td className="num" style={{ textAlign: 'right' }}>R$ {Number(it.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="num text-muted" style={{ textAlign: 'right' }}>{it.quantidadeUtilizada}</td>
                        <td className="num" style={{ textAlign: 'right', color: 'var(--color-accent-300)' }}>{it.quantidadeDisponivel}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          <i className="ph ph-pencil-simple" title="Editar item" onClick={() => iniciarEdicaoItem(it)} style={{ fontSize: 14, cursor: 'pointer', marginRight: 10, color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />
                          <i className="ph ph-clock-counter-clockwise" title="Histórico" onClick={() => setItemHistorico({ orgaoId: o.id, item: it })} style={{ fontSize: 14, cursor: 'pointer', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />
                        </td>
                      </tr>
                    ))}
                    {!(itensPorOrgao[o.id] ?? []).length && (
                      <tr><td colSpan={8} style={{ padding: '16px 0', textAlign: 'center' }} className="text-muted">Nenhum item cadastrado para este órgão</td></tr>
                    )}
                  </tbody>
                </table>

                {importarPlanilhaOrgao === o.id && (
                  <ImportarItensAtaModal
                    ataId={ata.id}
                    ataOrgaoId={o.id}
                    orgaoNome={o.secretaria.titulo}
                    onClose={() => setImportarPlanilhaOrgao(null)}
                    onImportado={() => { recarregarItens(o.id); carregar(); }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {!!contratosDaAta.length && (
        <>
          <h3 style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 500, margin: '28px 0 12px' }}>Contratos desta ata</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 10 }}>
            {contratosDaAta.map((c) => (
              <Link key={c.id} to={`/contratos/${c.id}`} className="card elev-sm" style={{ padding: 14 }}>
                <div className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500, fontSize: 13.5 }}>Contrato {c.numero}</div>
                <div className="text-muted" style={{ fontSize: 12, margin: '2px 0 8px' }}>{c.fornecedor?.razaoSocial}</div>
                <div className="num" style={{ fontSize: 12 }}>R$ {c.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} <span className="text-muted">de {c.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span></div>
              </Link>
            ))}
          </div>
        </>
      )}

      {mostrarLotes && <GerenciarLotesModal ataId={ata.id} ataNumero={ata.numeroArp} onClose={() => setMostrarLotes(false)} />}
      {itemHistorico && (
        <ItemHistoricoModal
          ataId={ata.id}
          ataOrgaoId={itemHistorico.orgaoId}
          itemId={itemHistorico.item.id}
          itemDescricao={itemHistorico.item.descricao}
          onClose={() => setItemHistorico(null)}
        />
      )}

      {importarParaOrgao && (
        <ImportarHomologacaoModal
          licitacaoId={ata.licitacaoId}
          fornecedorIdPadrao={ata.detentorPrincipalId}
          onClose={() => setImportarParaOrgao(null)}
          onImportar={(itens) => importarItensHomologados(importarParaOrgao, itens)}
        />
      )}
      {importando && <p className="text-muted" style={{ fontSize: 12, margin: '8px 0 0' }}>Importando itens...</p>}

      {mostrarRemanejar && (
        <RemanejarSaldoModal
          ataId={ata.id}
          orgaos={ata.orgaos}
          onClose={() => setMostrarRemanejar(false)}
          onSaved={async () => {
            await carregar();
            setItensPorOrgao({});
            if (orgaoAberto) {
              const itens = await api.get(`/atas/${id}/orgaos/${orgaoAberto}/itens`);
              setItensPorOrgao({ [orgaoAberto]: itens });
            }
          }}
        />
      )}
    </div>
  );
}
