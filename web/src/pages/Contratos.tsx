import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

const FORMAS_FATURAMENTO = ['MENSAL','POR_MEDICAO','POR_ETAPA','POR_ENTREGA','SOB_DEMANDA','PARCELA_UNICA','PAGAMENTO_ANTECIPADO'];

interface Opcao { id: string; label: string; }
interface ItemForm { descricao: string; unidade: string; quantidade: string; valorUnitario: string; }

interface ContratoResumo {
  id: string; numero: string; objeto: string; situacao: string;
  valorTotal: number; saldoDisponivel: number;
  fornecedor: { razaoSocial: string };
  orgaoGerenciador: { titulo: string };
}

export function Contratos() {
  const [lista, setLista] = useState<ContratoResumo[]>([]);
  const [licitacoes, setLicitacoes] = useState<Opcao[]>([]);
  const [secretarias, setSecretarias] = useState<Opcao[]>([]);
  const [fornecedores, setFornecedores] = useState<Opcao[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [numero, setNumero] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [objeto, setObjeto] = useState('');
  const [licitacaoId, setLicitacaoId] = useState('');
  const [orgaoGerenciadorId, setOrgaoGerenciadorId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [vigenciaInicial, setVigenciaInicial] = useState('');
  const [vigenciaFinal, setVigenciaFinal] = useState('');
  const [formaFaturamento, setFormaFaturamento] = useState(FORMAS_FATURAMENTO[4]);
  const [itens, setItens] = useState<ItemForm[]>([{ descricao: '', unidade: '', quantidade: '', valorUnitario: '' }]);

  async function carregar() {
    const [c, l, s, f] = await Promise.all([
      api.get('/contratos'), api.get('/licitacoes'), api.get('/secretarias'), api.get('/fornecedores'),
    ]);
    setLista(c);
    setLicitacoes(l.map((x: any) => ({ id: x.id, label: `${x.numero} — ${x.modalidade.replaceAll('_',' ')}` })));
    setSecretarias(s.map((x: any) => ({ id: x.id, label: x.titulo })));
    setFornecedores(f.map((x: any) => ({ id: x.id, label: `${x.razaoSocial} (${x.cnpjCpf})` })));
  }
  useEffect(() => { carregar(); }, []);

  function addItemRow() { setItens([...itens, { descricao: '', unidade: '', quantidade: '', valorUnitario: '' }]); }
  function updateItem(idx: number, patch: Partial<ItemForm>) {
    setItens(itens.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) { setItens(itens.filter((_, i) => i !== idx)); }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/contratos', {
        numero, numeroProcesso, objeto, licitacaoId, orgaoGerenciadorId, fornecedorId,
        vigenciaInicial, vigenciaFinal, formaFaturamento, situacao: 'VIGENTE',
        itens: itens
          .filter((it) => it.descricao)
          .map((it) => ({ descricao: it.descricao, unidade: it.unidade, quantidade: Number(it.quantidade), valorUnitario: Number(it.valorUnitario) })),
      });
      setMostrarForm(false);
      setNumero(''); setNumeroProcesso(''); setObjeto('');
      setItens([{ descricao: '', unidade: '', quantidade: '', valorUnitario: '' }]);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Contratos</h1>
        <button onClick={() => setMostrarForm((v) => !v)} className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded">
          {mostrarForm ? 'Cancelar' : '+ Adicionar Novo Contrato'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-slate-600 mb-1">Número do contrato/ano</label>
              <input className="border rounded px-3 py-2 text-sm w-full" value={numero} onChange={(e) => setNumero(e.target.value)} required /></div>
            <div><label className="block text-xs text-slate-600 mb-1">Número do processo</label>
              <input className="border rounded px-3 py-2 text-sm w-full" value={numeroProcesso} onChange={(e) => setNumeroProcesso(e.target.value)} required /></div>
            <div><label className="block text-xs text-slate-600 mb-1">Licitação</label>
              <select className="border rounded px-3 py-2 text-sm w-full" value={licitacaoId} onChange={(e) => setLicitacaoId(e.target.value)} required>
                <option value="">Selecione</option>
                {licitacoes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select></div>
            <div><label className="block text-xs text-slate-600 mb-1">Órgão gerenciador</label>
              <select className="border rounded px-3 py-2 text-sm w-full" value={orgaoGerenciadorId} onChange={(e) => setOrgaoGerenciadorId(e.target.value)} required>
                <option value="">Selecione</option>
                {secretarias.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select></div>
            <div><label className="block text-xs text-slate-600 mb-1">Fornecedor</label>
              <select className="border rounded px-3 py-2 text-sm w-full" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)} required>
                <option value="">Selecione</option>
                {fornecedores.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select></div>
            <div><label className="block text-xs text-slate-600 mb-1">Forma de faturamento</label>
              <select className="border rounded px-3 py-2 text-sm w-full" value={formaFaturamento} onChange={(e) => setFormaFaturamento(e.target.value)}>
                {FORMAS_FATURAMENTO.map((f) => <option key={f} value={f}>{f.replaceAll('_',' ')}</option>)}
              </select></div>
            <div><label className="block text-xs text-slate-600 mb-1">Vigência inicial</label>
              <input type="date" className="border rounded px-3 py-2 text-sm w-full" value={vigenciaInicial} onChange={(e) => setVigenciaInicial(e.target.value)} required /></div>
            <div><label className="block text-xs text-slate-600 mb-1">Vigência final</label>
              <input type="date" className="border rounded px-3 py-2 text-sm w-full" value={vigenciaFinal} onChange={(e) => setVigenciaFinal(e.target.value)} required /></div>
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Objeto</label>
            <textarea className="border rounded px-3 py-2 text-sm w-full" value={objeto} onChange={(e) => setObjeto(e.target.value)} required />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Itens do contrato</label>
              <button type="button" onClick={addItemRow} className="text-sm text-[#4C2A85] hover:underline">+ adicionar item</button>
            </div>
            <div className="space-y-2">
              {itens.map((it, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <input className="col-span-5 border rounded px-2 py-1 text-sm" placeholder="Descrição" value={it.descricao} onChange={(e) => updateItem(idx, { descricao: e.target.value })} />
                  <input className="col-span-2 border rounded px-2 py-1 text-sm" placeholder="Unidade" value={it.unidade} onChange={(e) => updateItem(idx, { unidade: e.target.value })} />
                  <input className="col-span-2 border rounded px-2 py-1 text-sm" placeholder="Qtd." type="number" value={it.quantidade} onChange={(e) => updateItem(idx, { quantidade: e.target.value })} />
                  <input className="col-span-2 border rounded px-2 py-1 text-sm" placeholder="Valor unitário" type="number" step="0.01" value={it.valorUnitario} onChange={(e) => updateItem(idx, { valorUnitario: e.target.value })} />
                  <button type="button" onClick={() => removeItem(idx)} className="col-span-1 text-red-500 text-sm">remover</button>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded">Salvar</button>
            {erro && <span className="text-sm text-red-600">{erro}</span>}
          </div>
        </form>
      )}

      <div className="bg-white border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-4 py-2">Contrato Nº</th>
              <th className="px-4 py-2">Fornecedor</th>
              <th className="px-4 py-2">Órgão</th>
              <th className="px-4 py-2">Valor total</th>
              <th className="px-4 py-2">Saldo</th>
              <th className="px-4 py-2">Situação</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-2 whitespace-nowrap">{c.numero}</td>
                <td className="px-4 py-2">{c.fornecedor?.razaoSocial}</td>
                <td className="px-4 py-2">{c.orgaoGerenciador?.titulo}</td>
                <td className="px-4 py-2 whitespace-nowrap">R$ {c.valorTotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2 whitespace-nowrap text-emerald-700">R$ {c.saldoDisponivel.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                <td className="px-4 py-2">{c.situacao}</td>
                <td className="px-4 py-2"><Link className="text-[#4C2A85] hover:underline" to={`/contratos/${c.id}`}>Abrir</Link></td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={7} className="px-4 py-6 text-center text-slate-400">Nenhum contrato cadastrado</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
