import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Licitacao { id: string; numero: string; numeroProcesso: string; objeto: string; modalidade: string; srp: boolean; }
interface Homologacao { id: string; arquivoNome: string; enviadoEm: string; status: string; }
interface AtaResumo { id: string; numeroArp: string; situacao: string; valorTotal: number; saldoDisponivel: number; }
interface ContratoResumo { id: string; numero: string; situacao: string; valorTotal: number; saldoDisponivel: number; fornecedor: { razaoSocial: string }; }

const STATUS_HOMOLOGACAO_LABEL: Record<string, string> = {
  processando: 'Processando', pronto_para_revisao: 'Pronto para revisão', revisado: 'Revisado', erro: 'Erro na extração', substituido: 'Substituída por reenvio',
};

export function LicitacaoDetalhe() {
  const { id } = useParams();
  const [licitacao, setLicitacao] = useState<Licitacao | null>(null);
  const [homologacoes, setHomologacoes] = useState<Homologacao[]>([]);
  const [derivados, setDerivados] = useState<{ atas: AtaResumo[]; contratos: ContratoResumo[] }>({ atas: [], contratos: [] });

  useEffect(() => {
    if (!id) return;
    api.get(`/licitacoes/${id}`).then(setLicitacao);
    api.get(`/licitacoes/${id}/homologacoes`).then(setHomologacoes);
    api.get(`/licitacoes/${id}/derivados`).then(setDerivados);
  }, [id]);

  if (!licitacao) return <div className="content-page text-muted">Carregando...</div>;

  return (
    <div className="content-page">
      <Link to="/licitacoes" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-accent)', marginBottom: 16 }}>
        <i className="ph ph-arrow-left" style={{ fontSize: 14 }} />Licitações
      </Link>

      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow">Licitação</div>
        <h2 className="page-title">{licitacao.numero}</h2>
        <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>{licitacao.modalidade.replaceAll('_', ' ')} · processo {licitacao.numeroProcesso}{licitacao.srp ? ' · SRP' : ''}</p>
        <p style={{ fontSize: 13.5, margin: '10px 0 0', color: 'color-mix(in srgb, var(--color-text) 65%, transparent)', maxWidth: '70ch' }}>{licitacao.objeto}</p>
      </div>

      {!!homologacoes.length && (
        <>
          <h3 style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 500, margin: '0 0 12px' }}>Homologação</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28 }}>
            {homologacoes.map((h) => (
              <div key={h.id} className="card" style={{ padding: '10px 14px', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <i className="ph ph-file-xls" style={{ fontSize: 16, color: 'var(--color-accent)' }} />
                <span style={{ flex: 1, fontSize: 13 }}>{h.arquivoNome}</span>
                <span className="text-muted" style={{ fontSize: 11.5 }}>{new Date(h.enviadoEm).toLocaleString('pt-BR')}</span>
                <span className="tag tag-neutral">{STATUS_HOMOLOGACAO_LABEL[h.status] ?? h.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {!!derivados.atas.length && (
        <>
          <h3 style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 500, margin: '0 0 12px' }}>Atas derivadas</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 28 }}>
            {derivados.atas.map((a) => (
              <Link key={a.id} to={`/atas/${a.id}`} className="card elev-sm" style={{ padding: '12px 16px', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Ata {a.numeroArp}</span>
                <span className="num" style={{ fontSize: 12.5 }}>R$ {a.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de {a.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {!!derivados.contratos.length && (
        <>
          <h3 style={{ fontSize: 14, fontFamily: 'var(--font-heading)', fontWeight: 500, margin: '0 0 12px' }}>Contratos derivados</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {derivados.contratos.map((c) => (
              <Link key={c.id} to={`/contratos/${c.id}`} className="card elev-sm" style={{ padding: '12px 16px', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Contrato {c.numero} — {c.fornecedor?.razaoSocial}</span>
                <span className="num" style={{ fontSize: 12.5 }}>R$ {c.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de {c.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {!homologacoes.length && !derivados.atas.length && !derivados.contratos.length && (
        <p className="text-muted" style={{ fontSize: 13 }}>Nenhuma homologação, ata ou contrato derivado desta licitação ainda.</p>
      )}
    </div>
  );
}
