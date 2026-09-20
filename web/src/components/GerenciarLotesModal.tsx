import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Lote { id: string; numero: string; nome: string; quantidadeItens: number; }

export function GerenciarLotesModal({ ataId, ataNumero, onClose }: { ataId: string; ataNumero: string; onClose: () => void }) {
  const [lotes, setLotes] = useState<Lote[]>([]);
  const [numero, setNumero] = useState('');
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() { setLotes(await api.get(`/atas/${ataId}/lotes`)); }
  useEffect(() => { carregar(); }, [ataId]);

  async function adicionar() {
    if (!numero || !nome) return;
    setErro(null);
    try {
      await api.post(`/atas/${ataId}/lotes`, { numero, nome });
      setNumero(''); setNome('');
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao adicionar lote');
    }
  }

  async function remover(loteId: string) {
    setErro(null);
    try {
      await api.delete(`/atas/${ataId}/lotes/${loteId}`);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao remover lote — confira se ainda não há itens vinculados a ele');
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Gerenciar lotes</h3>
        <p className="text-muted" style={{ fontSize: 12.5, margin: '-8px 0 4px' }}>Ata {ataNumero}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '30vh', overflowY: 'auto' }}>
          {lotes.map((lo) => (
            <div key={lo.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'color-mix(in srgb, var(--color-text) 4%, transparent)' }}>
              <span className="tag tag-outline">Lote {lo.numero}</span>
              <div style={{ flex: 1, fontSize: 13 }}>{lo.nome}</div>
              <span className="text-muted" style={{ fontSize: 11 }}>{lo.quantidadeItens} {lo.quantidadeItens === 1 ? 'item' : 'itens'}</span>
              <i className="ph ph-trash" onClick={() => remover(lo.id)} style={{ fontSize: 15, cursor: 'pointer', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />
            </div>
          ))}
          {!lotes.length && <p className="text-muted" style={{ fontSize: 13 }}>Nenhum lote cadastrado.</p>}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', gap: 10 }}>
          <div className="field"><label>Número</label>
            <input className="input num" placeholder="01" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
          <div className="field"><label>Nome do lote</label>
            <input className="input" placeholder="Nome do lote" value={nome} onChange={(e) => setNome(e.target.value)} /></div>
        </div>

        <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" onClick={adicionar} disabled={!numero || !nome}><i className="ph ph-plus" />Adicionar lote</button>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
          {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
        </div>
      </div>
    </div>
  );
}
