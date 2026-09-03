import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const MODALIDADES = [
  'PREGAO_PRESENCIAL', 'CONCORRENCIA_PUBLICA', 'DISPENSA', 'INEXIGIBILIDADE', 'CARTA_CONVITE',
  'PREGAO_ELETRONICO', 'CHAMAMENTO_PUBLICO', 'LEILAO', 'CONCURSO', 'ADESAO_ATA', 'RDC_PRESENCIAL', 'DIALOGO_COMPETITIVO',
];

interface Licitacao {
  id: string; numero: string; numeroProcesso: string; objeto: string; modalidade: string; srp: boolean;
}

export function Licitacoes() {
  const [lista, setLista] = useState<Licitacao[]>([]);
  const [numero, setNumero] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [objeto, setObjeto] = useState('');
  const [modalidade, setModalidade] = useState(MODALIDADES[5]);
  const [srp, setSrp] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() { setLista(await api.get('/licitacoes')); }
  useEffect(() => { carregar(); }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/licitacoes', { numero, numeroProcesso, objeto, modalidade, srp });
      setNumero(''); setNumeroProcesso(''); setObjeto('');
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Licitações</h1>
      <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4 mb-6 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Número</label>
          <input className="border rounded px-3 py-2 text-sm w-full" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 001/2026" required />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Número do processo</label>
          <input className="border rounded px-3 py-2 text-sm w-full" value={numeroProcesso} onChange={(e) => setNumeroProcesso(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Modalidade</label>
          <select className="border rounded px-3 py-2 text-sm w-full" value={modalidade} onChange={(e) => setModalidade(e.target.value)}>
            {MODALIDADES.map((m) => <option key={m} value={m}>{m.replaceAll('_', ' ')}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-2 mt-5">
          <input id="srp" type="checkbox" checked={srp} onChange={(e) => setSrp(e.target.checked)} />
          <label htmlFor="srp" className="text-sm">Sistema de Registro de Preços (SRP)</label>
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-slate-600 mb-1">Objeto</label>
          <textarea className="border rounded px-3 py-2 text-sm w-full" value={objeto} onChange={(e) => setObjeto(e.target.value)} required />
        </div>
        <div className="col-span-2 flex items-center gap-3">
          <button className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded">Adicionar Novo</button>
          {erro && <span className="text-sm text-red-600">{erro}</span>}
        </div>
      </form>

      <div className="bg-white border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="px-4 py-2">Número</th><th className="px-4 py-2">Modalidade</th><th className="px-4 py-2">Processo</th><th className="px-4 py-2">SRP</th><th className="px-4 py-2">Objeto</th></tr>
          </thead>
          <tbody>
            {lista.map((l) => (
              <tr key={l.id} className="border-t align-top">
                <td className="px-4 py-2 whitespace-nowrap">{l.numero}</td>
                <td className="px-4 py-2 whitespace-nowrap">{l.modalidade.replaceAll('_', ' ')}</td>
                <td className="px-4 py-2 whitespace-nowrap">{l.numeroProcesso}</td>
                <td className="px-4 py-2">{l.srp ? 'Sim' : 'Não'}</td>
                <td className="px-4 py-2 text-slate-600">{l.objeto}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-400">Nenhuma licitação cadastrada</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
