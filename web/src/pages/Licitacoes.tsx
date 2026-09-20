import type { ChangeEvent, FormEvent } from 'react';
import { Fragment, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { RevisarHomologacaoModal } from '../components/RevisarHomologacaoModal';

const MODALIDADES = [
  'PREGAO_PRESENCIAL', 'CONCORRENCIA_PUBLICA', 'DISPENSA', 'INEXIGIBILIDADE', 'CARTA_CONVITE',
  'PREGAO_ELETRONICO', 'CHAMAMENTO_PUBLICO', 'LEILAO', 'CONCURSO', 'ADESAO_ATA', 'RDC_PRESENCIAL', 'DIALOGO_COMPETITIVO',
];

interface Licitacao {
  id: string; numero: string; numeroProcesso: string; objeto: string; modalidade: string; srp: boolean;
}

interface Homologacao {
  id: string; arquivoNome: string; enviadoEm: string; status: 'processando' | 'pronto_para_revisao' | 'revisado' | 'erro'; erroDetalhe: string | null;
}

const STATUS_HOMOLOGACAO: Record<Homologacao['status'], { label: string; tag: string }> = {
  processando: { label: 'Processando', tag: 'tag tag-neutral' },
  pronto_para_revisao: { label: 'Pronto para revisão', tag: 'tag tag-warn' },
  revisado: { label: 'Revisado', tag: 'tag tag-ok' },
  erro: { label: 'Erro na extração', tag: 'tag tag-critical' },
};

export function Licitacoes() {
  const [lista, setLista] = useState<Licitacao[]>([]);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [numero, setNumero] = useState('');
  const [numeroProcesso, setNumeroProcesso] = useState('');
  const [objeto, setObjeto] = useState('');
  const [modalidade, setModalidade] = useState(MODALIDADES[5]);
  const [srp, setSrp] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [homologacaoAberta, setHomologacaoAberta] = useState<string | null>(null);
  const [homologacoesPorLicitacao, setHomologacoesPorLicitacao] = useState<Record<string, Homologacao[]>>({});
  const [enviandoPara, setEnviandoPara] = useState<string | null>(null);
  const [erroUpload, setErroUpload] = useState<string | null>(null);
  const [revisando, setRevisando] = useState<string | null>(null);

  async function carregar() { setLista(await api.get('/licitacoes')); }
  useEffect(() => { carregar(); }, []);

  async function carregarHomologacoes(licitacaoId: string) {
    const h = await api.get(`/licitacoes/${licitacaoId}/homologacoes`);
    setHomologacoesPorLicitacao((prev) => ({ ...prev, [licitacaoId]: h }));
  }

  function abrirHomologacao(licitacaoId: string) {
    if (homologacaoAberta === licitacaoId) { setHomologacaoAberta(null); return; }
    setHomologacaoAberta(licitacaoId);
    if (!homologacoesPorLicitacao[licitacaoId]) carregarHomologacoes(licitacaoId);
  }

  async function onUpload(licitacaoId: string, e: ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErroUpload(null);
    setEnviandoPara(licitacaoId);
    try {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      await api.upload(`/licitacoes/${licitacaoId}/homologacao`, formData);
      await carregarHomologacoes(licitacaoId);
    } catch (err) {
      setErroUpload(err instanceof Error ? err.message : 'Erro ao enviar o documento');
    } finally {
      setEnviandoPara(null);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    try {
      await api.post('/licitacoes', { numero, numeroProcesso, objeto, modalidade, srp });
      setNumero(''); setNumeroProcesso(''); setObjeto(''); setMostrarForm(false);
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
          <h2 className="page-title">Licitações</h2>
          <p className="text-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>{lista.length} {lista.length === 1 ? 'processo' : 'processos'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          <i className={`ph ${mostrarForm ? 'ph-x' : 'ph-plus'}`} />{mostrarForm ? 'Cancelar' : 'Nova licitação'}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card elev-md" style={{ padding: '20px 22px', marginBottom: 26, gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 12 }}>
            <div className="field"><label>Número</label>
              <input className="input" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="Ex.: 001/2026" required /></div>
            <div className="field"><label>Número do processo</label>
              <input className="input" value={numeroProcesso} onChange={(e) => setNumeroProcesso(e.target.value)} required /></div>
            <div className="field"><label>Modalidade</label>
              <select className="input" value={modalidade} onChange={(e) => setModalidade(e.target.value)}>
                {MODALIDADES.map((m) => <option key={m} value={m}>{m.replaceAll('_', ' ')}</option>)}
              </select></div>
          </div>
          <label className="radio"><input type="checkbox" checked={srp} onChange={(e) => setSrp(e.target.checked)} /><span className="dot" />Sistema de Registro de Preços (SRP)</label>
          <div className="field"><label>Objeto</label>
            <textarea className="input" value={objeto} onChange={(e) => setObjeto(e.target.value)} required /></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button className="btn btn-primary" type="submit">Salvar licitação</button>
            <button className="btn btn-secondary" type="button" onClick={() => setMostrarForm(false)}>Cancelar</button>
            {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
          </div>
        </form>
      )}

      <table className="table">
        <thead><tr><th style={{ width: 100 }}>Número</th><th style={{ width: 200 }}>Modalidade</th><th style={{ width: 130 }}>Processo</th><th>Objeto</th><th style={{ width: 150 }}>Homologação</th></tr></thead>
        <tbody>
          {lista.map((l) => (
            <Fragment key={l.id}>
              <tr>
                <td className="num" style={{ fontFamily: 'var(--font-heading)', fontWeight: 500 }}>
                  <Link to={`/licitacoes/${l.id}`} style={{ color: 'inherit' }}>{l.numero}</Link>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 12.5 }}>{l.modalidade.replaceAll('_', ' ')}</span>
                    {l.srp && <span className="tag tag-outline">SRP</span>}
                  </div>
                </td>
                <td className="num" style={{ fontSize: 12.5, color: 'color-mix(in srgb, var(--color-text) 58%, transparent)' }}>{l.numeroProcesso}</td>
                <td style={{ fontSize: 13, color: 'color-mix(in srgb, var(--color-text) 72%, transparent)' }}>{l.objeto}</td>
                <td>
                  <button className="btn btn-ghost" onClick={() => abrirHomologacao(l.id)}>
                    <i className={`ph ${homologacaoAberta === l.id ? 'ph-caret-up' : 'ph-caret-down'}`} />
                    {(homologacoesPorLicitacao[l.id]?.length ?? 0) || 'ver'}
                  </button>
                </td>
              </tr>
              {homologacaoAberta === l.id && (
                <tr>
                  <td colSpan={5} style={{ background: 'color-mix(in srgb, var(--color-text) 3%, transparent)', padding: '14px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontFamily: 'var(--font-heading)', fontWeight: 500 }}>Documentos de homologação</span>
                      <label className="btn btn-primary" style={{ cursor: enviandoPara === l.id ? 'wait' : 'pointer' }}>
                        <i className="ph ph-upload-simple" />{enviandoPara === l.id ? 'Enviando e extraindo...' : 'Enviar planilha de homologação'}
                        <input type="file" accept=".xlsx" hidden disabled={enviandoPara === l.id} onChange={(e) => onUpload(l.id, e)} />
                      </label>
                    </div>
                    {erroUpload && <p style={{ fontSize: 12.5, color: 'var(--color-critical)', margin: '0 0 8px' }}>{erroUpload}</p>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(homologacoesPorLicitacao[l.id] ?? []).map((h) => {
                        const info = STATUS_HOMOLOGACAO[h.status];
                        const clicavel = h.status === 'pronto_para_revisao' || h.status === 'revisado';
                        return (
                          <div
                            key={h.id}
                            className="card"
                            style={{ padding: '10px 14px', flexDirection: 'row', alignItems: 'center', gap: 12, cursor: clicavel ? 'pointer' : 'default' }}
                            onClick={() => clicavel && setRevisando(h.id)}
                          >
                            <i className="ph ph-file-xls" style={{ fontSize: 16, color: 'var(--color-accent)' }} />
                            <span style={{ flex: 1, fontSize: 13 }}>{h.arquivoNome}</span>
                            <span className="text-muted" style={{ fontSize: 11.5 }}>{new Date(h.enviadoEm).toLocaleString('pt-BR')}</span>
                            <span className={info.tag}>{info.label}</span>
                          </div>
                        );
                      })}
                      {!(homologacoesPorLicitacao[l.id] ?? []).length && <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>Nenhum documento enviado ainda.</p>}
                    </div>
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
          {!lista.length && <tr><td colSpan={5} style={{ padding: '24px 0', textAlign: 'center' }} className="text-muted">Nenhuma licitação cadastrada</td></tr>}
        </tbody>
      </table>

      {revisando && (
        <RevisarHomologacaoModal
          homologacaoId={revisando}
          onClose={() => setRevisando(null)}
          onSaved={() => { if (homologacaoAberta) carregarHomologacoes(homologacaoAberta); }}
        />
      )}
    </div>
  );
}
