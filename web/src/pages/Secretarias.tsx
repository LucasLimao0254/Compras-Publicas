import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Secretaria {
  id: string;
  titulo: string;
  codigoUnidadePncp: string | null;
}

export function Secretarias() {
  const [lista, setLista] = useState<Secretaria[]>([]);
  const [titulo, setTitulo] = useState('');
  const [codigoPncp, setCodigoPncp] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setLista(await api.get('/secretarias'));
  }

  useEffect(() => { carregar(); }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/secretarias', { titulo, codigoUnidadePncp: codigoPncp || undefined });
      setTitulo('');
      setCodigoPncp('');
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-4">Secretarias & Responsáveis</h1>

      <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4 mb-6 flex gap-3 items-end flex-wrap">
        <div>
          <label className="block text-xs text-slate-600 mb-1">Título</label>
          <input className="border rounded px-3 py-2 text-sm" value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs text-slate-600 mb-1">Código Unidade PNCP</label>
          <input className="border rounded px-3 py-2 text-sm" value={codigoPncp} onChange={(e) => setCodigoPncp(e.target.value)} />
        </div>
        <button className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded">Adicionar Novo</button>
        {erro && <span className="text-sm text-red-600">{erro}</span>}
      </form>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Código PNCP</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((s) => (
              <tr key={s.id} className="border-t">
                <td className="px-4 py-2">{s.titulo}</td>
                <td className="px-4 py-2 text-slate-500">{s.codigoUnidadePncp || 'Não vinculado'}</td>
              </tr>
            ))}
            {!lista.length && (
              <tr><td colSpan={2} className="px-4 py-6 text-center text-slate-400">Nenhuma secretaria cadastrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
