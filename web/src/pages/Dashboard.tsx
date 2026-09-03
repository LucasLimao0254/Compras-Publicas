import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Legend } from 'recharts';
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

const CORES = ['#4C2A85', '#F59E0B', '#EF4444', '#94A3B8'];

function fmt(v: number) { return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

export function Dashboard() {
  const [resumo, setResumo] = useState<Resumo | null>(null);

  useEffect(() => { api.get('/dashboard/resumo').then(setResumo); }, []);

  if (!resumo) return <p className="text-slate-500">Carregando...</p>;

  const situacaoData = [
    { name: 'Vigentes', value: resumo.situacaoContratos.vigentes },
    { name: 'Vencendo em 30 dias', value: resumo.situacaoContratos.vencendo30 },
    { name: 'Vencidos', value: resumo.situacaoContratos.vencidos },
    { name: 'Arquivados', value: resumo.situacaoContratos.arquivados },
  ].filter((d) => d.value > 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Dashboard de compras</h1>

      <div className="bg-white border rounded-lg p-6 mb-6 flex items-center gap-6">
        <div className="text-3xl font-bold text-emerald-600">
          {resumo.valorTotalContratado > 0 ? (100 - resumo.percentualUtilizado).toFixed(1) : '100.0'}%
          <div className="text-xs font-normal text-slate-500">disponível</div>
        </div>
        <div>
          <div className="text-2xl font-semibold">{fmt(resumo.saldoDisponivelTotal)}</div>
          <div className="text-sm text-slate-500">Saldo disponível entre {resumo.contratosAtivos} contrato(s) vigente(s)</div>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Contratos ativos</div>
          <div className="text-xl font-semibold">{resumo.contratosAtivos}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Saldo utilizado</div>
          <div className="text-xl font-semibold">{resumo.percentualUtilizado.toFixed(1)}%</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Ordens emitidas</div>
          <div className="text-xl font-semibold">{resumo.ordensEmitidas}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Vencendo / Vencidos</div>
          <div className="text-xl font-semibold">{resumo.situacaoContratos.vencendo30} / {resumo.situacaoContratos.vencidos}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-medium mb-2">Situação dos contratos</h2>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={situacaoData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85}>
                {situacaoData.map((_, i) => <Cell key={i} fill={CORES[i % CORES.length]} />)}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border rounded-lg p-4">
          <h2 className="font-medium mb-2">Top fornecedores por valor contratado</h2>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={resumo.topFornecedores} layout="vertical" margin={{ left: 40 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="fornecedor" width={140} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => fmt(Number(v))} />
              <Bar dataKey="valor" fill="#4C2A85" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
