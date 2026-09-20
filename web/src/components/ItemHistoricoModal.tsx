import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Evento {
  id: string; quantidade: string; criadoEm: string;
  usuario: { nome: string };
  itemOrigem: { descricao: string; ataOrgao: { secretaria: { titulo: string } } };
  itemDestino: { descricao: string; ataOrgao: { secretaria: { titulo: string } } };
}

export function ItemHistoricoModal({
  ataId, ataOrgaoId, itemId, itemDescricao, onClose,
}: { ataId: string; ataOrgaoId: string; itemId: string; itemDescricao: string; onClose: () => void }) {
  const [eventos, setEventos] = useState<Evento[] | null>(null);

  useEffect(() => {
    api.get(`/atas/${ataId}/orgaos/${ataOrgaoId}/itens/${itemId}/historico`).then(setEventos);
  }, [ataId, ataOrgaoId, itemId]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Histórico do item</h3>
        <p className="text-muted" style={{ fontSize: 12.5, margin: '-8px 0 4px' }}>{itemDescricao}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '50vh', overflowY: 'auto' }}>
          {eventos === null && <p className="text-muted" style={{ fontSize: 13 }}>Carregando...</p>}
          {eventos?.map((ev) => (
            <div key={ev.id} className="card" style={{ padding: 12 }}>
              <div style={{ fontSize: 13.5 }}>
                <strong>{ev.itemOrigem.ataOrgao.secretaria.titulo}</strong>
                {' → '}
                <strong>{ev.itemDestino.ataOrgao.secretaria.titulo}</strong>
                {': '}{Number(ev.quantidade)} un.
              </div>
              <div className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>{ev.usuario.nome} · {new Date(ev.criadoEm).toLocaleString('pt-BR')}</div>
            </div>
          ))}
          {eventos?.length === 0 && <p className="text-muted" style={{ fontSize: 13 }}>Nenhum remanejamento registrado para este item.</p>}
        </div>

        <div className="dialog-actions"><button className="btn btn-secondary" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  );
}
