import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Fornecedor { id: string; cnpjCpf: string; razaoSocial: string; }

export function Fornecedores() {
  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [cnpjCpf, setCnpjCpf] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() { setLista(await api.get('/fornecedores')); }
  useEffect(() => { carregar(); }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/fornecedores', { cnpjCpf, razaoSocial });
      setCnpjCpf(''); setRazaoSocial('');
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Fornecedores</h1>
      <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4 mb-6 flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs text-slate-600 mb-1">CNPJ/CPF</label>
          <input className="border rounded px-3 py-2 text-sm" value={cnpjCpf} onChange={(e) => setCnpjCpf(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Razão social</label>
          <input className="border rounded px-3 py-2 text-sm w-72" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} required />
        </div>
        <button className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded">Adicionar Novo</button>
        {erro && <span className="text-sm text-red-600">{erro}</span>}
      </form>
      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left"><tr><th className="px-4 py-2">CNPJ/CPF</th><th className="px-4 py-2">Razão social</th></tr></thead>
          <tbody>
            {lista.map((f) => (
              <tr key={f.id} className="border-t"><td className="px-4 py-2">{f.cnpjCpf}</td><td className="px-4 py-2">{f.razaoSocial}</td></tr>
            ))}
            {!lista.length && <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400">Nenhum fornecedor cadastrado</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
