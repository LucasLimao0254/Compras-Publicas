import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface Resumo {
  saldoDisponivelTotal: number;
  valorTotalContratado: number;
  valorUtilizadoTotal: number;
  percentualUtilizado: number;
  contratosAtivos: number;
  ordensEmitidas: number;
  situacaoContratos: { vigentes: number; vencendo30: number; vencidos: number; arquivados: number };
  topFornecedores: { fornecedorId: string; fornecedor: string; valor: number }[];
}

const CORES = ['var(--color-accent)', 'var(--color-warn)', 'var(--color-critical)', 'var(--color-neutral-600)'];

const ROTULO_KPI = { fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 52%, transparent)' } as const;
const NUMERO_KPI = { fontSize: 26, fontFamily: 'var(--font-heading)', fontWeight: 500 } as const;

// Cada número da Visão geral abre a tela de origem já filtrada (contratos por
// situação, ordens por status, o fornecedor do ranking). Sem permissão para a
// tela de destino, o número fica só como leitura.
function Kpi({ rotulo, valor, cor, para }: { rotulo: string; valor: number; cor?: string; para: string | null }) {
  const conteudo = (
    <>
      <div style={ROTULO_KPI}>{rotulo}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div className="num" style={{ ...NUMERO_KPI, color: cor }}>{valor}</div>
        {para && <span className="ver">ver lista <i className="ph ph-arrow-right" /></span>}
      </div>
    </>
  );
  return para ? <Link to={para} className="card elev-sm card-link">{conteudo}</Link> : <div className="card elev-sm">{conteudo}</div>;
}

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

function HeroLink({ para, children }: { para: string | null; children: React.ReactNode }) {
  return para ? <Link to={para} aria-label="Ver contratos ativos" style={{ display: 'block', color: 'inherit' }}>{children}</Link> : <>{children}</>;
}

export function Dashboard() {
  const [resumo, setResumo] = useState<Resumo | null>(null);
  const { temPermissao } = useAuth();
  const navigate = useNavigate();
  const podeContratos = temPermissao('compras.contratos');
  const contratosCom = (situacao: string) => (podeContratos ? `/contratos?situacao=${situacao}` : null);
  const fornecedorPara = (id: string) => (temPermissao('compras.fornecedores') ? `/fornecedores/${id}` : null);

  useEffect(() => { api.get('/dashboard/resumo').then(setResumo); }, []);

  if (!resumo) return <div className="content-page text-muted">Carregando...</div>;

  const situacaoData = [
    { name: 'Vigentes', value: resumo.situacaoContratos.vigentes, filtro: 'VIGENTES', cor: CORES[0] },
    { name: 'Vencendo em 30 dias', value: resumo.situacaoContratos.vencendo30, filtro: 'VENCENDO_30', cor: CORES[1] },
    { name: 'Vencidos', value: resumo.situacaoContratos.vencidos, filtro: 'VENCIDOS', cor: CORES[2] },
    { name: 'Arquivados', value: resumo.situacaoContratos.arquivados, filtro: 'ARQUIVADOS', cor: CORES[3] },
  ].filter((d) => d.value > 0);

  const disponivel = resumo.valorTotalContratado > 0 ? 100 - resumo.percentualUtilizado : 100;

  return (
    <div className="content-page">
      <div className="eyebrow">Exercício 2026</div>
      <h2 className="page-title" style={{ marginBottom: 22 }}>Visão geral</h2>

      <HeroLink para={contratosCom('ATIVOS')}>
      <div style={{
        borderRadius: 14, padding: '26px 28px', marginBottom: 20, position: 'relative', overflow: 'hidden',
        background: 'linear-gradient(105deg, var(--color-section) 0%, color-mix(in srgb, var(--color-section) 40%, var(--color-bg)) 100%)',
      }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(420px 260px at 88% 0%, color-mix(in srgb, var(--color-section-glow) 60%, transparent), transparent 70%)' }} />
        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 48, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--color-accent-300)', marginBottom: 10 }}>Saldo disponível</div>
            <div className="num" style={{ fontSize: 38, fontFamily: 'var(--font-heading)', fontWeight: 500, letterSpacing: '-0.02em', lineHeight: 1 }}>{fmt(resumo.saldoDisponivelTotal)}</div>
            <div style={{ fontSize: 13, color: 'var(--color-neutral-300)', marginTop: 8 }}>
              {disponivel.toFixed(1)}% do contratado, em {resumo.contratosAtivos} contrato(s) vigente(s)
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 240, maxWidth: 420 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--color-neutral-300)', marginBottom: 7 }}>
              <span>Utilizado {fmt(resumo.valorUtilizadoTotal)}</span><span className="num">{resumo.percentualUtilizado.toFixed(1)}%</span>
            </div>
            <div style={{ height: 6, borderRadius: 3, background: 'color-mix(in srgb, var(--color-neutral-100) 14%, transparent)', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(100, resumo.percentualUtilizado)}%`, height: 6, borderRadius: 3, background: 'var(--color-accent-300)', boxShadow: '0 0 12px color-mix(in srgb, var(--color-accent) 60%, transparent)' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--color-neutral-400)', marginTop: 7 }}>Total contratado {fmt(resumo.valorTotalContratado)}</div>
          </div>
        </div>
      </div>

      </HeroLink>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 26 }}>
        <Kpi rotulo="Contratos ativos" valor={resumo.contratosAtivos} para={contratosCom('ATIVOS')} />
        <Kpi rotulo="Ordens emitidas" valor={resumo.ordensEmitidas} para={temPermissao('compras.ordens') ? '/ordens?aba=EMITIDA' : null} />
        <Kpi rotulo="Vencendo em 30 dias" valor={resumo.situacaoContratos.vencendo30} cor={resumo.situacaoContratos.vencendo30 ? 'var(--color-warn)' : undefined} para={contratosCom('VENCENDO_30')} />
        <Kpi rotulo="Vencidos" valor={resumo.situacaoContratos.vencidos} cor={resumo.situacaoContratos.vencidos ? 'var(--color-critical)' : undefined} para={contratosCom('VENCIDOS')} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.35fr)', gap: 22 }}>
        <div>
          <h4 style={{ fontSize: 15, marginBottom: 16 }}>Situação dos contratos</h4>
          <div className="card elev-sm" style={{ padding: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={situacaoData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} stroke="var(--color-bg)"
                  onClick={(d: any) => { const para = contratosCom(d?.payload?.filtro ?? d?.filtro); if (para) navigate(para); }}
                  style={{ cursor: podeContratos ? 'pointer' : undefined }}>
                  {situacaoData.map((d) => <Cell key={d.filtro} fill={d.cor} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 8, fontSize: 12.5, color: 'var(--color-text)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {situacaoData.map((d) => {
                const linha = (
                  <>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: d.cor }} />
                    <span className="text-muted">{d.name}</span>
                    <span className="num" style={{ marginLeft: 'auto' }}>{d.value}</span>
                  </>
                );
                const para = contratosCom(d.filtro);
                const estilo = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 } as const;
                return para
                  ? <Link key={d.filtro} to={para} className="linha-link" style={estilo}>{linha}</Link>
                  : <div key={d.filtro} style={estilo}>{linha}</div>;
              })}
            </div>
          </div>
        </div>
        <div>
          <h4 style={{ fontSize: 15, marginBottom: 16 }}>Top fornecedores por valor contratado</h4>
          <div className="card elev-sm" style={{ padding: 16 }}>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={resumo.topFornecedores} layout="vertical" margin={{ left: 40 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="fornecedor" width={140} tick={{ fontSize: 12, fill: 'var(--color-text)' }} />
                <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 8, fontSize: 12.5, color: 'var(--color-text)' }} />
                <Bar dataKey="valor" fill="var(--color-accent)" radius={[0, 4, 4, 0]}
                  onClick={(d: any) => { const para = fornecedorPara(d?.payload?.fornecedorId ?? d?.fornecedorId); if (para) navigate(para); }}
                  style={{ cursor: temPermissao('compras.fornecedores') ? 'pointer' : undefined }} />
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
              {resumo.topFornecedores.map((f, i) => {
                const para = fornecedorPara(f.fornecedorId);
                const linha = (
                  <>
                    <span className="num text-muted" style={{ width: 16 }}>{i + 1}.</span>
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.fornecedor}</span>
                    <span className="num" style={{ marginLeft: 'auto', flex: 'none' }}>{fmt(f.valor)}</span>
                  </>
                );
                const estilo = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 } as const;
                return para
                  ? <Link key={f.fornecedorId} to={para} className="linha-link" style={estilo}>{linha}</Link>
                  : <div key={f.fornecedorId} style={estilo}>{linha}</div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
