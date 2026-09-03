import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const RECURSOS = [
  { grupo: 'Administrativo', itens: [
    { key: 'administrativo.usuarios', label: 'Usuários' },
    { key: 'administrativo.secretarias', label: 'Secretarias & Responsáveis' },
  ]},
  { grupo: 'Compras', itens: [
    { key: 'compras.dashboard', label: 'Dashboard' },
    { key: 'compras.ordens', label: 'Painel de ordens' },
    { key: 'compras.contratos', label: 'Contratos' },
    { key: 'compras.licitacoes', label: 'Licitações' },
    { key: 'compras.fornecedores', label: 'Fornecedores' },
  ]},
];

interface UsuarioRow { id: string; nome: string; email: string; cpf: string; ativo: boolean; tipoUsuario: string; }

export function Usuarios() {
  const [lista, setLista] = useState<UsuarioRow[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cpf, setCpf] = useState('');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [tipoUsuario, setTipoUsuario] = useState<'ADMIN' | 'PADRAO'>('PADRAO');
  const [permissoes, setPermissoes] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() { setLista(await api.get('/usuarios')); }
  useEffect(() => { carregar(); }, []);

  function togglePermissao(key: string) {
    setPermissoes((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/usuarios', { cpf, nome, email, senha, tipoUsuario, permissoes });
      setCpf(''); setNome(''); setEmail(''); setSenha(''); setPermissoes([]);
      setMostrarForm(false);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Usuários</h1>
        <button onClick={() => setMostrarForm((v) => !v)} className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded">
          {mostrarForm ? 'Cancelar' : '+ Adicionar novo'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="bg-white border rounded-lg p-4 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs text-slate-600 mb-1">CPF</label>
              <input className="border rounded px-3 py-2 text-sm w-full" value={cpf} onChange={(e) => setCpf(e.target.value)} required /></div>
            <div><label className="block text-xs text-slate-600 mb-1">Nome</label>
              <input className="border rounded px-3 py-2 text-sm w-full" value={nome} onChange={(e) => setNome(e.target.value)} required /></div>
            <div><label className="block text-xs text-slate-600 mb-1">E-mail</label>
              <input type="email" className="border rounded px-3 py-2 text-sm w-full" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
            <div><label className="block text-xs text-slate-600 mb-1">Senha</label>
              <input type="password" className="border rounded px-3 py-2 text-sm w-full" value={senha} onChange={(e) => setSenha(e.target.value)} required minLength={6} /></div>
            <div><label className="block text-xs text-slate-600 mb-1">Tipo de usuário</label>
              <select className="border rounded px-3 py-2 text-sm w-full" value={tipoUsuario} onChange={(e) => setTipoUsuario(e.target.value as any)}>
                <option value="PADRAO">Padrão</option>
                <option value="ADMIN">Administrador</option>
              </select></div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Permissões</label>
            {RECURSOS.map((g) => (
              <div key={g.grupo} className="mb-2">
                <div className="text-xs uppercase text-slate-500 mb-1">{g.grupo}</div>
                <div className="flex flex-wrap gap-4">
                  {g.itens.map((it) => (
                    <label key={it.key} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={permissoes.includes(it.key)} onChange={() => togglePermissao(it.key)} />
                      {it.label}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button className="bg-[#4C2A85] text-white text-sm px-4 py-2 rounded">Salvar</button>
            {erro && <span className="text-sm text-red-600">{erro}</span>}
          </div>
        </form>
      )}

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-100 text-left">
            <tr><th className="px-4 py-2">Nome</th><th className="px-4 py-2">E-mail</th><th className="px-4 py-2">Tipo</th><th className="px-4 py-2">Status</th></tr>
          </thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-2">{u.nome}</td>
                <td className="px-4 py-2">{u.email}</td>
                <td className="px-4 py-2">{u.tipoUsuario}</td>
                <td className="px-4 py-2">{u.ativo ? 'Ativado' : 'Inativo'}</td>
              </tr>
            ))}
            {!lista.length && <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Nenhum usuário cadastrado</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
