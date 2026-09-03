import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('admin@demo.gov.br');
  const [senha, setSenha] = useState('demo123');
  const [tenantCodigo, setTenantCodigo] = useState('1');
  const [erro, setErro] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setLoading(true);
    try {
      await login(email, senha, Number(tenantCodigo));
      navigate('/');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao entrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <form onSubmit={onSubmit} className="bg-white shadow-md rounded-lg p-8 w-full max-w-sm">
        <h1 className="text-xl font-semibold text-[#4C2A85] mb-1">Compras Públicas</h1>
        <p className="text-sm text-slate-500 mb-6">Entre com sua conta do município</p>

        <label className="block text-sm mb-1 text-slate-700">Código do município</label>
        <input
          className="w-full border rounded px-3 py-2 mb-4 text-sm"
          value={tenantCodigo}
          onChange={(e) => setTenantCodigo(e.target.value)}
          required
        />

        <label className="block text-sm mb-1 text-slate-700">E-mail</label>
        <input
          type="email"
          className="w-full border rounded px-3 py-2 mb-4 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <label className="block text-sm mb-1 text-slate-700">Senha</label>
        <input
          type="password"
          className="w-full border rounded px-3 py-2 mb-4 text-sm"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
        />

        {erro && <p className="text-sm text-red-600 mb-4">{erro}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-[#4C2A85] text-white rounded py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>

        <p className="text-xs text-slate-400 mt-4">
          Login de demonstração: código 1, admin@demo.gov.br / demo123 (criado pelo script de seed).
        </p>
      </form>
    </div>
  );
}
