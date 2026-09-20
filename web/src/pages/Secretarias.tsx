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
  const [mostrarForm, setMostrarForm] = useState(false);
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
      setMostrarForm(false);
      carregar();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar');
    }
  }

  return (
    <div className="content-page">
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 22 }}>
        <div>
          <div className="eyebrow">Administrativo</div>
          <h2 className="page-title">Secretarias e responsáveis</h2>
          <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>{lista.length} {lista.length === 1 ? 'unidade' : 'unidades'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          <i className={`ph ${mostrarForm ? 'ph-x' : 'ph-plus'}`} />{mostrarForm ? 'Cancelar' : 'Nova unidade'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card elev-md" style={{ padding: '20px 22px', marginBottom: 26, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="field" style={{ flex: 1, minWidth: 280 }}><label>Título</label>
            <input className="input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Secretaria Municipal de ..." required /></div>
          <div className="field" style={{ width: 200 }}><label>Código unidade PNCP</label>
            <input className="input num" value={codigoPncp} onChange={(e) => setCodigoPncp(e.target.value)} /></div>
          <button className="btn btn-primary" type="submit">Salvar</button>
          <button className="btn btn-secondary" type="button" onClick={() => setMostrarForm(false)}>Cancelar</button>
          {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
        </form>
      )}

      <table className="table">
        <thead><tr><th>Unidade</th><th style={{ width: 160 }}>Código PNCP</th></tr></thead>
        <tbody>
          {lista.map((s) => (
            <tr key={s.id}>
              <td>{s.titulo}</td>
              <td>{s.codigoUnidadePncp ? <span className="tag tag-neutral num">{s.codigoUnidadePncp}</span> : <span className="tag tag-outline">Não vinculado</span>}</td>
            </tr>
          ))}
          {!lista.length && <tr><td colSpan={2} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhuma secretaria cadastrada</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
