import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Evento {
  id: string; tipoEvento: string; criadoEm: string;
  dadosSnapshot: unknown;
  usuario: { nome: string };
}

const LABELS: Record<string, string> = {
  cadastrou: 'Ordem cadastrada',
  emitiu_ordem: 'Ordem emitida',
  assinatura_concluida: 'Assinaturas concluídas',
  cancelou: 'Ordem cancelada',
};

export function HistoricoOrdemModal({ ordemId, numero, onClose }: { ordemId: string; numero: string; onClose: () => void }) {
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/ordens/${ordemId}/historico`).then(setEventos);
  }, [ordemId]);

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Histórico da ordem {numero}</h3>
        <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Eventos em ordem cronológica</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '50vh', overflowY: 'auto' }}>
          {eventos.map((e) => (
            <div key={e.id} style={{ display: 'flex', gap: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-accent)', marginTop: 6, flex: 'none' }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, marginBottom: 2 }}>{LABELS[e.tipoEvento] ?? e.tipoEvento}</div>
                <div className="text-muted" style={{ fontSize: 11.5 }}>{e.usuario.nome} · {new Date(e.criadoEm).toLocaleString('pt-BR')}</div>
                {e.dadosSnapshot != null && (
                  <div style={{ marginTop: 4 }}>
                    <a href="#" onClick={(ev) => { ev.preventDefault(); setExpandido(expandido === e.id ? null : e.id); }} style={{ fontSize: 11.5 }}>
                      {expandido === e.id ? 'ocultar dados' : 'Mostrar dados'}
                    </a>
                    {expandido === e.id && (
                      <pre style={{ marginTop: 6, background: 'var(--color-bg)', border: '1px solid var(--color-divider)', borderRadius: 8, padding: 8, fontSize: 11, overflowX: 'auto' }}>{JSON.stringify(e.dadosSnapshot, null, 2)}</pre>
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
          {!eventos.length && <p className="text-muted" style={{ fontSize: 13 }}>Nenhum evento registrado ainda.</p>}
        </div>
        <div className="dialog-actions"><button className="btn btn-secondary" onClick={onClose}>Fechar</button></div>
      </div>
    </div>
  );
}
