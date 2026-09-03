import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface ContratoOpcao { id: string; numero: string; fornecedor: { razaoSocial: string }; }
interface ItemDisp { id: string; descricao: string; unidade: string; valorUnitario: string; quantidadeDisponivel: number; }
interface OrdemRow { id: string; numero: number; status: string; createdAt: string; contrato: { numero: string }; itens: { precoTotal: string }[]; }

export function Ordens() {
  const [ordens, setOrdens] = useState<OrdemRow[]>([]);
  const [contratos, setContratos] = useState<ContratoOpcao[]>([]);
  const [mostrarWizard, setMostrarWizard] = useState(false);
  const [passo, setPasso] = useState<1 | 2>(1);
  const [contratoId, setContratoId] = useState('');
  const [itens, setItens] = useState<ItemDisp[]>([]);
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setOrdens(await api.get('/ordens'));
    setContratos(await api.get('/contratos'));
  }
  useEffect(() => { carregar(); }, []);

  async function irParaPasso2() {
    if (!contratoId) return;
    const dados = await api.get(`/contratos/${contratoId}/itens`);
    setItens(dados);
    setQuantidades({});
    setPasso(2);
  }

  const valorTotal = itens.reduce((acc, it) => acc + (Number(quantidades[it.id] || 0) * Number(it.valorUnitario)), 0);
  const itensSelecionados = Object.values(quantidades).filter((q) => Number(q) > 0).length;

  async function emitir() {
    setErro(null);
    setSalvando(true);
    try {
      const itensPayload = itens
        .filter((it) => Number(quantidades[it.id]) > 0)
        .map((it) => ({ itemContratoId: it.id, quantidade: Number(quantidades[it.id]) }));
      if (!itensPayload.length) throw new Error('Selecione ao menos um item');
      await api.post('/ordens', { contratoId, itens: itensPayload });
      setMostrarWizard(false);
      setPasso(1);
      setContratoId('');
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao emitir ordem');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Painel de ordens</h1>
        <button onClick={() => { setMostrarWizard((v) => !v); setPasso(1); }} className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded">
          {mostrarWizard ? 'Cancelar' : '+ Adicionar Ordem/Requisição'}
        </button>
      </div>

      {mostrarWizard && (
        <div className="bg-white border rounded-lg p-4 mb-6">
          {passo === 1 && (
            <div>
              <h2 className="font-medium mb-3">1. Selecione um contrato</h2>
              <select className="border rounded px-3 py-2 text-sm w-full mb-4" value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
                <option value="">Nº do contrato ou fornecedor</option>
                {contratos.map((c) => <option key={c.id} value={c.id}>{c.numero} — {c.fornecedor.razaoSocial}</option>)}
              </select>
              <button onClick={irParaPasso2} disabled={!contratoId} className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded disabled:opacity-50">
                Continuar
              </button>
            </div>
          )}
          {passo === 2 && (
            <div>
              <h2 className="font-medium mb-3">2. Selecione os itens</h2>
              <div className="text-sm text-slate-500 mb-2">
                Itens selecionados: {itensSelecionados} | Total: R$ {valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
              <div className="max-h-80 overflow-y-auto border rounded mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-left sticky top-0">
                    <tr><th className="px-3 py-2">Descrição</th><th className="px-3 py-2">Disponível</th><th className="px-3 py-2">Valor unit.</th><th className="px-3 py-2 w-32">Qtd. a pedir</th></tr>
                  </thead>
                  <tbody>
                    {itens.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-3 py-2">{it.descricao} <span className="text-slate-400">({it.unidade})</span></td>
                        <td className="px-3 py-2">{it.quantidadeDisponivel}</td>
                        <td className="px-3 py-2">R$ {Number(it.valorUnitario).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number" min={0} max={it.quantidadeDisponivel}
                            className="border rounded px-2 py-1 w-24 text-sm"
                            value={quantidades[it.id] || ''}
                            onChange={(e) => setQuantidades({ ...quantidades, [it.id]: e.target.value })}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => setPasso(1)} className="text-sm text-slate-500">&larr; voltar</button>
                <button onClick={emitir} disabled={salvando} className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded disabled:opacity-50">
                  {salvando ? 'Emitindo...' : 'Salvar'}
                </button>
                {erro && <span className="text-sm text-red-600">{erro}</span>}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="px-4 py-2">Número</th><th className="px-4 py-2">Contrato</th><th className="px-4 py-2">Valor total</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Data</th></tr>
          </thead>
          <tbody>
            {ordens.map((o) => {
              const total = o.itens.reduce((acc, it) => acc + Number(it.precoTotal), 0);
              return (
                <tr key={o.id} className="border-t">
                  <td className="px-4 py-2">{String(o.numero).padStart(3, '0')}</td>
                  <td className="px-4 py-2">{o.contrato?.numero}</td>
                  <td className="px-4 py-2">R$ {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  <td className="px-4 py-2">{o.status === 'EMITIDA' ? 'Emitida' : 'Cancelada'}</td>
                  <td className="px-4 py-2">{new Date(o.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              );
            })}
            {!ordens.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nenhuma ordem emitida</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
