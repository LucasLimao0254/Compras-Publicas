import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface AtaResumo { id: string; numeroArp: string; situacao: string; valorTotal: number; saldoDisponivel: number; }
interface ContratoResumo { id: string; numero: string; situacao: string; valorTotal: number; saldoDisponivel: number; }
interface Processo {
  licitacao: { id: string; numero: string; numeroProcesso: string; objeto: string; modalidade: string };
  atas: AtaResumo[];
  contratos: ContratoResumo[];
}
interface Fornecedor { id: string; razaoSocial: string; cnpjCpf: string; }

export function FornecedorProcessos() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [fornecedor, setFornecedor] = useState<Fornecedor | null>(null);
  const [processos, setProcessos] = useState<Processo[]>([]);
  const [processoAbertoKey, setProcessoAbertoKey] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get(`/fornecedores/${id}`).then(setFornecedor);
    api.get(`/fornecedores/${id}/processos`).then(setProcessos);
  }, [id]);

  if (!fornecedor) return <div className="content-page text-muted">Carregando...</div>;

  const processoAberto = processos.find((p) => p.licitacao.id === processoAbertoKey) ?? null;

  function abrirProcesso(p: Processo) {
    // Com ata: navega direto pra tela de detalhe da ata (mesmo padrão usado
    // no resto do produto) — sem nível intermediário. Sem ata: abre a lista
    // "Contratos deste processo" nesta própria página, com breadcrumb.
    if (p.atas.length) { navigate(`/atas/${p.atas[0].id}`); return; }
    setProcessoAbertoKey(p.licitacao.id);
  }

  return (
    <div className="content-page">
      <Link to="/fornecedores" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--color-accent)', marginBottom: 16 }}>
        <i className="ph ph-arrow-left" style={{ fontSize: 14 }} />Fornecedores
      </Link>

      <div style={{ marginBottom: 24 }}>
        <div className="eyebrow">Fornecedor</div>
        <h2 className="page-title">{fornecedor.razaoSocial}</h2>
        <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>{fornecedor.cnpjCpf}</p>
      </div>

      <div style={{ fontSize: 12, marginBottom: 12 }}>
        {processoAberto ? (
          <>
            <span onClick={() => setProcessoAbertoKey(null)} style={{ color: 'var(--color-accent)', cursor: 'pointer' }}>Processos</span>
            {' › '}{processoAberto.licitacao.objeto}
          </>
        ) : (
          <span className="text-muted" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11 }}>Processos</span>
        )}
      </div>

      {!processoAberto && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {processos.map((p) => {
            const valorTotal = [...p.atas, ...p.contratos].reduce((acc, x) => acc + x.valorTotal, 0);
            const saldoDisponivel = [...p.atas, ...p.contratos].reduce((acc, x) => acc + x.saldoDisponivel, 0);
            const perc = valorTotal ? saldoDisponivel / valorTotal : 0;
            return (
              <div key={p.licitacao.id} onClick={() => abrirProcesso(p)} className="card elev-sm" style={{ padding: 16, cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                  <div>
                    <span className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{p.licitacao.numero}</span>
                    <span className="text-muted" style={{ fontSize: 12, marginLeft: 8 }}>{p.licitacao.modalidade.replaceAll('_', ' ')}</span>
                  </div>
                  <span className="text-muted" style={{ fontSize: 12 }}>{p.licitacao.numeroProcesso}</span>
                </div>
                <p style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 65%, transparent)', margin: '0 0 10px' }}>{p.licitacao.objeto}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                  <span className="num">R$ {saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                  <span className="num text-muted">de {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
                <div className="saldo-bar"><span style={{ width: `${Math.max(2, Math.round(perc * 100))}%` }} /></div>
              </div>
            );
          })}
          {!processos.length && <p className="text-muted" style={{ fontSize: 13 }}>Nenhum processo encontrado para este fornecedor.</p>}
        </div>
      )}

      {processoAberto && (
        <div>
          <div className="text-muted" style={{ fontSize: 11, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Contratos deste processo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {processoAberto.contratos.map((c) => (
              <Link key={c.id} to={`/contratos/${c.id}`} className="card elev-sm" style={{ padding: '12px 16px', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Contrato {c.numero}</span>
                <span className="num" style={{ fontSize: 12.5 }}>R$ {c.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de {c.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </Link>
            ))}
            {!processoAberto.contratos.length && <p className="text-muted" style={{ fontSize: 13 }}>Nenhum contrato encontrado neste processo.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
