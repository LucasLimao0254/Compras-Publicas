import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface UnidadeExecutora {
  id: string; cnpj: string; razaoSocial: string; endereco: string | null; cep: string | null;
  email: string | null; ordenadorNome: string | null; ordenadorCargo: string | null; ordenadorPortaria: string | null;
}

export function UnidadesExecutoras() {
  const [lista, setLista] = useState<UnidadeExecutora[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [cnpj, setCnpj] = useState('');
  const [razaoSocial, setRazaoSocial] = useState('');
  const [endereco, setEndereco] = useState('');
  const [cep, setCep] = useState('');
  const [email, setEmail] = useState('');
  const [ordenadorNome, setOrdenadorNome] = useState('');
  const [ordenadorCargo, setOrdenadorCargo] = useState('');
  const [ordenadorPortaria, setOrdenadorPortaria] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setLista(await api.get('/unidades-executoras'));
  }
  useEffect(() => { carregar(); }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/unidades-executoras', {
        cnpj, razaoSocial,
        endereco: endereco || undefined, cep: cep || undefined, email: email || undefined,
        ordenadorNome: ordenadorNome || undefined, ordenadorCargo: ordenadorCargo || undefined, ordenadorPortaria: ordenadorPortaria || undefined,
      });
      setMostrarForm(false);
      setCnpj(''); setRazaoSocial(''); setEndereco(''); setCep(''); setEmail(''); setOrdenadorNome(''); setOrdenadorCargo(''); setOrdenadorPortaria('');
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  return (
    <div className="content-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 8 }}>
        <div>
          <div className="eyebrow">Compras</div>
          <h2 className="page-title">Unidades executoras</h2>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          <i className={`ph ${mostrarForm ? 'ph-x' : 'ph-plus'}`} />{mostrarForm ? 'Cancelar' : 'Nova unidade'}
        </button>
      </div>
      <p className="text-muted" style={{ fontSize: 13, margin: '0 0 22px' }}>
        CNPJ que emite a nota fiscal da ordem — útil para municípios com fundos (saúde, assistência social) que têm CNPJ próprio por fundo.
      </p>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card elev-md" style={{ padding: '20px 22px', marginBottom: 26, gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 14 }}>
            <div className="field"><label>CNPJ</label>
              <input className="input num" value={cnpj} onChange={(e) => setCnpj(e.target.value)} required /></div>
            <div className="field"><label>Razão social</label>
              <input className="input" value={razaoSocial} onChange={(e) => setRazaoSocial(e.target.value)} required /></div>
            <div className="field"><label>Endereço</label>
              <input className="input" value={endereco} onChange={(e) => setEndereco(e.target.value)} /></div>
            <div className="field"><label>CEP</label>
              <input className="input num" value={cep} onChange={(e) => setCep(e.target.value)} /></div>
            <div className="field"><label>E-mail</label>
              <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="field"><label>Nome do ordenador de despesas</label>
              <input className="input" value={ordenadorNome} onChange={(e) => setOrdenadorNome(e.target.value)} /></div>
            <div className="field"><label>Cargo do ordenador</label>
              <input className="input" value={ordenadorCargo} onChange={(e) => setOrdenadorCargo(e.target.value)} /></div>
            <div className="field"><label>Portaria de nomeação</label>
              <input className="input" value={ordenadorPortaria} onChange={(e) => setOrdenadorPortaria(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary" type="submit">Salvar</button>
            <button className="btn btn-secondary" type="button" onClick={() => setMostrarForm(false)}>Cancelar</button>
            {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
          </div>
        </form>
      )}

      <table className="table">
        <thead>
          <tr>
            <th style={{ width: 200 }}>CNPJ</th>
            <th>Razão social</th>
            <th>Ordenador de despesas</th>
            <th>E-mail</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((u) => (
            <tr key={u.id}>
              <td className="num" style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 70%, transparent)' }}>{u.cnpj}</td>
              <td>{u.razaoSocial}</td>
              <td className="text-muted">{u.ordenadorNome || '—'}</td>
              <td className="text-muted">{u.email || '—'}</td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={4} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhuma unidade executora cadastrada</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
