import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api';

interface Resumo {
  saldoDisponivelTotal: number;
  valorTotalContratado: number;
  valorUtilizadoTotal: number;
  percentualUtilizado: number;
  contratosAtivos: number;
  ordensEmitidas: number;
  situacaoContratos: { vigentes: number; vencendo30: number; vencidos: number; arquivados: number };
  topFornecedores: { fornecedor: string; valor: number }[];
}

const CORES = ['var(--color-accent)', 'var(--color-warn)', 'var(--color-critical)', 'var(--color-neutral-600)'];

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export function Dashboard() {
  const [resumo, setResumo] = useState<Resumo | null>(null);

  useEffect(() => { api.get('/dashboard/resumo').then(setResumo); }, []);

  if (!resumo) return <div className="content-page text-muted">Carregando...</div>;

  const situacaoData = [
    { name: 'Vigentes', value: resumo.situacaoContratos.vigentes },
    { name: 'Vencendo em 30 dias', value: resumo.situacaoContratos.vencendo30 },
    { name: 'Vencidos', value: resumo.situacaoContratos.vencidos },
    { name: 'Arquivados', value: resumo.situacaoContratos.arquivados },
  ].filter((d) => d.value > 0);

  const disponivel = resumo.valorTotalContratado > 0 ? 100 - resumo.percentualUtilizado : 100;

  return (
    <div className="content-page">
      <div className="eyebrow">Exercício 2026</div>
      <h2 className="page-title" style={{ marginBottom: 22 }}>Visão geral</h2>

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 14, marginBottom: 26 }}>
        <div className="card elev-sm">
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 52%, transparent)' }}>Contratos ativos</div>
          <div className="num" style={{ fontSize: 26, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{resumo.contratosAtivos}</div>
        </div>
        <div className="card elev-sm">
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 52%, transparent)' }}>Ordens emitidas</div>
          <div className="num" style={{ fontSize: 26, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>{resumo.ordensEmitidas}</div>
        </div>
        <div className="card elev-sm">
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 52%, transparent)' }}>Vencendo em 30 dias</div>
          <div className="num" style={{ fontSize: 26, fontFamily: 'var(--font-heading)', fontWeight: 500, color: resumo.situacaoContratos.vencendo30 ? 'var(--color-warn)' : undefined }}>{resumo.situacaoContratos.vencendo30}</div>
        </div>
        <div className="card elev-sm">
          <div style={{ fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'color-mix(in srgb, var(--color-text) 52%, transparent)' }}>Vencidos</div>
          <div className="num" style={{ fontSize: 26, fontFamily: 'var(--font-heading)', fontWeight: 500, color: resumo.situacaoContratos.vencidos ? 'var(--color-critical)' : undefined }}>{resumo.situacaoContratos.vencidos}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1.35fr)', gap: 22 }}>
        <div>
          <h4 style={{ fontSize: 15, marginBottom: 16 }}>Situação dos contratos</h4>
          <div className="card elev-sm" style={{ padding: 16 }}>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={situacaoData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} stroke="var(--color-bg)">
                  {situacaoData.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--color-surface)', border: '1px solid var(--color-divider)', borderRadius: 8, fontSize: 12.5, color: 'var(--color-text)' }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
              {situacaoData.map((d, i) => (
                <div key={d.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: CORES[i % CORES.length] }} />
                  <span className="text-muted">{d.name}</span>
                  <span className="num" style={{ marginLeft: 'auto' }}>{d.value}</span>
                </div>
              ))}
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
                <Bar dataKey="valor" fill="var(--color-accent)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
