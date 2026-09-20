import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';

interface Orgao { id: string; perfil: string; secretaria: { titulo: string }; }
interface ItemComSaldo {
  id: string; numeroItem: number; descricao: string; unidade: string;
  valorUnitario: string; quantidadeDisponivel: number;
}
interface Historico {
  id: string; quantidade: string; criadoEm: string;
  usuario: { nome: string };
  itemOrigem: { descricao: string; ataOrgao: { secretaria: { titulo: string } } };
  itemDestino: { descricao: string; ataOrgao: { secretaria: { titulo: string } } };
}

export function RemanejarSaldoModal({ ataId, orgaos, onClose, onSaved }: { ataId: string; orgaos: Orgao[]; onClose: () => void; onSaved: () => void }) {
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [historico, setHistorico] = useState<Historico[]>([]);

  const [origemId, setOrigemId] = useState('');
  const [destinoId, setDestinoId] = useState('');
  const [itensOrigem, setItensOrigem] = useState<ItemComSaldo[]>([]);
  const [itensDestino, setItensDestino] = useState<ItemComSaldo[]>([]);
  const [itemOrigemId, setItemOrigemId] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (origemId) api.get(`/atas/${ataId}/orgaos/${origemId}/itens`).then(setItensOrigem);
    else setItensOrigem([]);
    setItemOrigemId('');
  }, [ataId, origemId]);

  useEffect(() => {
    if (destinoId) api.get(`/atas/${ataId}/orgaos/${destinoId}/itens`).then(setItensDestino);
    else setItensDestino([]);
    setItemOrigemId('');
  }, [ataId, destinoId]);

  const itensElegiveis = useMemo(() => {
    return itensOrigem
      .filter((io) => itensDestino.some((id_) => id_.numeroItem === io.numeroItem && id_.unidade === io.unidade && id_.valorUnitario === io.valorUnitario))
      .filter((io) => io.quantidadeDisponivel > 0);
  }, [itensOrigem, itensDestino]);

  const itemSelecionado = itensElegiveis.find((i) => i.id === itemOrigemId);

  async function carregarHistorico() {
    const h = await api.get(`/atas/${ataId}/remanejamentos`);
    setHistorico(h);
    setMostrarHistorico(true);
  }

  async function onSubmit() {
    setErro(null);
    if (!itemOrigemId || !quantidade) { setErro('Selecione o item e a quantidade'); return; }
    const destinoItem = itensDestino.find(
      (id_) => id_.numeroItem === itemSelecionado?.numeroItem && id_.unidade === itemSelecionado?.unidade && id_.valorUnitario === itemSelecionado?.valorUnitario,
    );
    if (!destinoItem) { setErro('Item equivalente não encontrado no destino'); return; }
    setSalvando(true);
    try {
      await api.post(`/atas/${ataId}/remanejar-saldo`, {
        ataItemOrigemId: itemOrigemId,
        ataItemDestinoId: destinoItem.id,
        quantidade: Number(quantidade),
      });
      onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao remanejar saldo');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        {mostrarHistorico ? (
          <>
            <h3 className="dialog-title">Histórico de remanejamentos</h3>
            <button className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={() => setMostrarHistorico(false)}><i className="ph ph-arrow-left" />voltar</button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '50vh', overflowY: 'auto' }}>
              {historico.map((h) => (
                <div key={h.id} className="card" style={{ padding: 12 }}>
                  <div style={{ fontSize: 13.5 }}>
                    <strong>{h.itemOrigem.ataOrgao.secretaria.titulo}</strong>
                    {' → '}
                    <strong>{h.itemDestino.ataOrgao.secretaria.titulo}</strong>
                    {': '}{Number(h.quantidade)} un. de "{h.itemOrigem.descricao}"
                  </div>
                  <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>{h.usuario.nome} — {new Date(h.criadoEm).toLocaleString('pt-BR')}</div>
                </div>
              ))}
              {!historico.length && <p className="text-muted" style={{ fontSize: 13 }}>Nenhum remanejamento registrado ainda.</p>}
            </div>
            <div className="dialog-actions"><button className="btn btn-secondary" onClick={onClose}>Fechar</button></div>
          </>
        ) : (
          <>
            <h3 className="dialog-title">Remanejar saldo entre órgãos</h3>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderRadius: 10, background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', padding: '12px 14px', fontSize: 12, lineHeight: 1.5, color: 'color-mix(in srgb, var(--color-text) 75%, transparent)' }}>
              <i className="ph ph-info" style={{ color: 'var(--color-accent)' }} />
              Só é possível remanejar itens com o mesmo número, preço unitário e unidade no órgão de destino, dentro do saldo disponível do órgão de origem.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="field">
                <label>Órgão de origem</label>
                <select className="input" value={origemId} onChange={(e) => setOrigemId(e.target.value)}>
                  <option value="">Selecione</option>
                  {orgaos.map((o) => <option key={o.id} value={o.id} disabled={o.id === destinoId}>{o.secretaria.titulo}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Órgão de destino</label>
                <select className="input" value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
                  <option value="">Selecione</option>
                  {orgaos.map((o) => <option key={o.id} value={o.id} disabled={o.id === origemId}>{o.secretaria.titulo}</option>)}
                </select>
              </div>
            </div>

            {origemId && destinoId && (
              <div className="field">
                <label>Item elegível</label>
                <select className="input" value={itemOrigemId} onChange={(e) => setItemOrigemId(e.target.value)}>
                  <option value="">Selecione</option>
                  {itensElegiveis.map((i) => (
                    <option key={i.id} value={i.id}>#{i.numeroItem} — {i.descricao} (disponível: {i.quantidadeDisponivel} {i.unidade})</option>
                  ))}
                </select>
                {!itensElegiveis.length && <p style={{ fontSize: 11.5, color: 'var(--color-warn)', marginTop: 4 }}>Nenhum item com saldo disponível é equivalente entre os dois órgãos.</p>}
              </div>
            )}

            {itemSelecionado && (
              <div className="field">
                <label>Quantidade a remanejar (máx. {itemSelecionado.quantidadeDisponivel})</label>
                <input className="input num" type="number" min={0} max={itemSelecionado.quantidadeDisponivel} step="0.001" value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
              </div>
            )}

            <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn btn-primary" onClick={onSubmit} disabled={salvando}>{salvando ? 'Salvando...' : 'Confirmar remanejamento'}</button>
              <button className="btn btn-ghost" onClick={carregarHistorico}>Histórico</button>
              {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
