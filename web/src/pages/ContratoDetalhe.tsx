import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';

interface Item { id: string; numero: number; descricao: string; unidade: string; quantidade: string; valorUnitario: string; quantidadeUtilizada: number; quantidadeDisponivel: number; }

export function ContratoDetalhe() {
  const { id } = useParams();
  const [contrato, setContrato] = useState<any>(null);
  const [itens, setItens] = useState<Item[]>([]);

  async function carregar() {
    const [c, i] = await Promise.all([api.get(`/contratos/${id}`), api.get(`/contratos/${id}/itens`)]);
    setContrato(c);
    setItens(i);
  }
  useEffect(() => { carregar(); }, [id]);

  if (!contrato) return <p className="text-slate-500">Carregando...</p>;

  return (
    <div>
      <Link to="/contratos" className="text-sm text-[#4C2A85] hover:underline">&larr; Voltar</Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Contrato Nº {contrato.numero}</h1>
      <p className="text-slate-500 mb-6">{contrato.objeto}</p>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Valor total</div>
          <div className="text-lg font-semibold">R$ {contrato.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Saldo disponível</div>
          <div className="text-lg font-semibold text-emerald-700">R$ {contrato.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Fornecedor</div>
          <div className="text-sm font-medium">{contrato.fornecedor?.razaoSocial}</div>
        </div>
        <div className="bg-white border rounded-lg p-4">
          <div className="text-xs text-slate-500">Situação</div>
          <div className="text-sm font-medium">{contrato.situacao}</div>
        </div>
      </div>

      <h2 className="text-lg font-semibold mb-2">Itens do contrato ({itens.length})</h2>
      <div className="bg-white border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-4 py-2">#</th><th className="px-4 py-2">Descrição</th><th className="px-4 py-2">Unidade</th>
              <th className="px-4 py-2">Qtd. contratada</th><th className="px-4 py-2">Valor unit.</th>
              <th className="px-4 py-2">Utilizado</th><th className="px-4 py-2">Disponível</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((it) => (
              <tr key={it.id} className="border-t">
                <td className="px-4 py-2">{it.numero}</td>
                <td className="px-4 py-2">{it.descricao}</td>
                <td className="px-4 py-2">{it.unidade}</td>
                <td className="px-4 py-2">{it.quantidade}</td>
                <td className="px-4 py-2">R$ {Number(it.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2">{it.quantidadeUtilizada}</td>
                <td className="px-4 py-2 text-emerald-700">{it.quantidadeDisponivel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
