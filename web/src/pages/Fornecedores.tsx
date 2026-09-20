import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

interface Fornecedor { id: string; cnpjCpf: string; razaoSocial: string; }

export function Fornecedores() {
  const [lista, setLista] = useState<Fornecedor[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
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
      setCnpjCpf(''); setRazaoSocial(''); setMostrarForm(false);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  return (
    <div className="content-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22 }}>
        <div>
          <div className="eyebrow">Compras</div>
          <h2 className="page-title">Fornecedores</h2>
          <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>{lista.length} {lista.length === 1 ? 'cadastrado' : 'cadastrados'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          <i className={`ph ${mostrarForm ? 'ph-x' : 'ph-plus'}`} />{mostrarForm ? 'Cancelar' : 'Novo fornecedor'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card elev-md" style={{ padding: '20px 22px', marginBottom: 26, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ width: 220 }}><label>CNPJ / CPF</label>
            <input className="input num" value={cnpjCpf} onChange={(e) => setCnpjCpf(e.target.value)} placeholder="00.000.000/0000-00" required /></div>
          <div className="field" style={{ flex: 1, minWidth: 280 }}><label>Razão social</label>
            <input className="input" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} required /></div>
          <button className="btn btn-primary" type="submit">Salvar</button>
          <button className="btn btn-secondary" type="button" onClick={() => setMostrarForm(false)}>Cancelar</button>
          {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
        </form>
      )}

      <table className="table">
        <thead><tr><th style={{ width: 200 }}>CNPJ / CPF</th><th>Razão social</th><th style={{ width: 40 }}></th></tr></thead>
        <tbody>
          {lista.map((f) => (
            <tr key={f.id}>
              <td className="num" style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>{f.cnpjCpf}</td>
              <td>{f.razaoSocial}</td>
              <td style={{ textAlign: 'right' }}>
                <Link to={`/fornecedores/${f.id}`} style={{ display: 'inline-flex', width: 32, height: 32, borderRadius: 8, background: 'color-mix(in srgb, var(--color-accent) 12%, transparent)', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="ph ph-arrow-right" style={{ fontSize: 16, color: 'var(--color-accent)' }} />
                </Link>
              </td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={3} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhum fornecedor cadastrado</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
