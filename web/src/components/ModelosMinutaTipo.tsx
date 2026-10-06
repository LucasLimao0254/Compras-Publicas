import { useState } from 'react';
import { api } from '../lib/api';
import { formatarDia } from '../lib/datas';

export type TipoMinuta = 'ARP' | 'CONTRATO' | 'ADITIVO' | 'APOSTILAMENTO';
export interface ModeloItem { id: string; tipo: TipoMinuta; nome: string; arquivoNome: string; enviadoEm: string; modalidades: string[]; }
export interface ModeloMinutaTipo { tipo: TipoMinuta; carregado: boolean; itens: ModeloItem[]; }
export interface ModelosMinuta { modelos: ModeloMinutaTipo[]; prontos: number; total: number; }
interface Marcador { marcador: string; descricao: string; }

export const MODALIDADES: [string, string][] = [
  ['PREGAO_ELETRONICO', 'Pregão eletrônico'], ['PREGAO_PRESENCIAL', 'Pregão presencial'],
  ['CONCORRENCIA_PUBLICA', 'Concorrência'], ['DISPENSA', 'Dispensa'], ['INEXIGIBILIDADE', 'Inexigibilidade'],
  ['ADESAO_ATA', 'Adesão a ata'], ['CHAMAMENTO_PUBLICO', 'Chamamento público'], ['CARTA_CONVITE', 'Carta convite'],
  ['LEILAO', 'Leilão'], ['CONCURSO', 'Concurso'], ['RDC_PRESENCIAL', 'RDC presencial'], ['DIALOGO_COMPETITIVO', 'Diálogo competitivo'],
];
const ROTULO_MODALIDADE = Object.fromEntries(MODALIDADES);

const TIPOS_LABEL: Record<TipoMinuta, string> = {
  ARP: 'Ata de registro de preços (ARP)', CONTRATO: 'Contrato', ADITIVO: 'Termo aditivo', APOSTILAMENTO: 'Apostilamento',
};

function EscolherModalidades({ valor, onChange, idBase }: { valor: string[]; onChange: (v: string[]) => void; idBase: string }) {
  return (
    <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
      <legend className="text-muted" style={{ fontSize: 11.5, marginBottom: 6 }}>Modalidades de licitação (nenhuma marcada = serve para qualquer uma)</legend>
      {MODALIDADES.map(([chave, rotulo]) => (
        <label key={chave} className="radio" htmlFor={`${idBase}-${chave}`} style={{ fontSize: 12.5 }}>
          <input id={`${idBase}-${chave}`} type="checkbox" checked={valor.includes(chave)} onChange={(e) => onChange(e.target.checked ? [...valor, chave] : valor.filter((v) => v !== chave))} />
          <span className="dot" />{rotulo}
        </label>
      ))}
    </fieldset>
  );
}

// Um tipo de minuta (ARP, Contrato…) com seus vários modelos: cada um com
// nome e, se quiser, as modalidades a que se aplica — ao gerar o documento, o
// sistema sugere o modelo da modalidade da licitação (MODELO.md, seção 8).
export function ModelosMinutaTipo({ grupo, marcadores, ehAdmin, onAtualizado }: {
  grupo: ModeloMinutaTipo;
  marcadores: Marcador[] | undefined;
  ehAdmin: boolean;
  onAtualizado: (m: ModelosMinuta) => void;
}) {
  const [verMarcadores, setVerMarcadores] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState('');
  const [novasModalidades, setNovasModalidades] = useState<string[]>([]);
  const [novoArquivo, setNovoArquivo] = useState<File | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [edNome, setEdNome] = useState('');
  const [edModalidades, setEdModalidades] = useState<string[]>([]);
  const [removendoId, setRemovendoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executar(acao: () => Promise<ModelosMinuta>) {
    setOcupado(true); setErro(null);
    try { onAtualizado(await acao()); return true; }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro ao salvar o modelo'); return false; }
    finally { setOcupado(false); }
  }

  async function adicionar() {
    if (!novoArquivo) { setErro('Escolha o arquivo .docx do modelo'); return; }
    const fd = new FormData();
    fd.append('arquivo', novoArquivo);
    fd.append('nome', novoNome);
    fd.append('modalidades', JSON.stringify(novasModalidades));
    if (await executar(() => api.upload(`/minutas/modelos/${grupo.tipo}`, fd))) {
      setAdicionando(false); setNovoNome(''); setNovasModalidades([]); setNovoArquivo(null);
    }
  }

  async function substituir(id: string, arquivo: File) {
    const fd = new FormData();
    fd.append('arquivo', arquivo);
    fd.append('substituirId', id);
    await executar(() => api.upload(`/minutas/modelos/${grupo.tipo}`, fd));
  }

  async function salvarEdicao(id: string) {
    if (await executar(() => api.patch(`/minutas/modelos/item/${id}`, { nome: edNome, modalidades: edModalidades }))) setEditandoId(null);
  }

  return (
    <div style={{ borderRadius: 8, background: 'color-mix(in srgb, var(--color-text) 4%, transparent)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className={grupo.carregado ? 'ph-fill ph-check-circle' : 'ph ph-circle-dashed'} style={{ fontSize: 15, color: grupo.carregado ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />
          <div>
            <div style={{ fontSize: 13 }}>{TIPOS_LABEL[grupo.tipo]}</div>
            <div className="text-muted" style={{ fontSize: 11 }}>
              {grupo.itens.length ? `${grupo.itens.length} ${grupo.itens.length === 1 ? 'modelo' : 'modelos'}` : 'Nenhum modelo cadastrado'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button className="btn btn-ghost" type="button" onClick={() => setVerMarcadores((v) => !v)}>{verMarcadores ? 'ocultar marcadores' : 'ver marcadores'}</button>
          {ehAdmin && !adicionando && (
            <button className="btn btn-secondary" type="button" onClick={() => { setAdicionando(true); setErro(null); }}><i className="ph ph-plus" />Adicionar modelo</button>
          )}
        </div>
      </div>

      {verMarcadores && marcadores && (
        <div style={{ paddingTop: 8, boxShadow: 'inset 0 1px 0 var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {marcadores.map((mk) => (
            <div key={mk.marcador} style={{ fontSize: 11.5, display: 'flex', gap: 8 }}>
              <code className="num" style={{ color: 'var(--color-accent-300)', flex: 'none' }}>{`{{${mk.marcador}}}`}</code>
              <span className="text-muted">{mk.descricao}</span>
            </div>
          ))}
        </div>
      )}

      {grupo.itens.map((m) => (
        <div key={m.id} style={{ background: 'var(--color-surface)', borderRadius: 6, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {editandoId === m.id ? (
            <>
              <div className="field"><label htmlFor={`ed-nome-${m.id}`}>Nome do modelo</label>
                <input id={`ed-nome-${m.id}`} className="input" value={edNome} onChange={(e) => setEdNome(e.target.value)} /></div>
              <EscolherModalidades valor={edModalidades} onChange={setEdModalidades} idBase={`ed-${m.id}`} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" type="button" disabled={ocupado} onClick={() => salvarEdicao(m.id)}>Salvar</button>
                <button className="btn btn-ghost" type="button" onClick={() => setEditandoId(null)}>Cancelar</button>
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.nome}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, margin: '4px 0' }}>
                  {m.modalidades.length
                    ? m.modalidades.map((md) => <span key={md} className="tag tag-outline" style={{ fontSize: 10.5 }}>{ROTULO_MODALIDADE[md] ?? md}</span>)
                    : <span className="tag tag-neutral" style={{ fontSize: 10.5 }}>Qualquer modalidade</span>}
                </div>
                <div className="text-muted" style={{ fontSize: 11 }}>{m.arquivoNome} — enviado em {formatarDia(m.enviadoEm)}</div>
              </div>
              {ehAdmin && (
                removendoId === m.id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                    Remover este modelo?
                    <button className="btn btn-secondary" type="button" style={{ color: 'var(--color-critical)' }} disabled={ocupado} onClick={async () => { if (await executar(() => api.delete(`/minutas/modelos/item/${m.id}`))) setRemovendoId(null); }}>Sim, remover</button>
                    <button className="btn btn-ghost" type="button" onClick={() => setRemovendoId(null)}>Voltar</button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <button className="btn btn-ghost" type="button" onClick={() => { setEditandoId(m.id); setEdNome(m.nome); setEdModalidades(m.modalidades); }}>Editar</button>
                    <label className="btn btn-ghost" style={{ cursor: 'pointer' }}>
                      Substituir arquivo
                      <input type="file" accept=".docx" hidden disabled={ocupado} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) substituir(m.id, f); }} />
                    </label>
                    <button className="btn btn-ghost" type="button" style={{ color: 'var(--color-critical)' }} onClick={() => setRemovendoId(m.id)}>Remover</button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      ))}

      {adicionando && (
        <div style={{ background: 'var(--color-surface)', borderRadius: 6, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 500 }}>Novo modelo de {TIPOS_LABEL[grupo.tipo].toLowerCase()}</div>
          <div className="field"><label htmlFor={`novo-nome-${grupo.tipo}`}>Nome do modelo</label>
            <input id={`novo-nome-${grupo.tipo}`} className="input" placeholder="Ex.: Contrato de fornecimento — pregão" value={novoNome} onChange={(e) => setNovoNome(e.target.value)} /></div>
          <EscolherModalidades valor={novasModalidades} onChange={setNovasModalidades} idBase={`novo-${grupo.tipo}`} />
          <div className="field"><label htmlFor={`novo-arquivo-${grupo.tipo}`}>Arquivo .docx</label>
            <input id={`novo-arquivo-${grupo.tipo}`} type="file" accept=".docx" onChange={(e) => setNovoArquivo(e.target.files?.[0] ?? null)} /></div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" type="button" disabled={ocupado || !novoArquivo} onClick={adicionar}>{ocupado ? 'Enviando…' : 'Enviar modelo'}</button>
            <button className="btn btn-ghost" type="button" onClick={() => { setAdicionando(false); setErro(null); }}>Cancelar</button>
          </div>
        </div>
      )}

      {erro && <div role="alert" style={{ fontSize: 11.5, color: 'var(--color-critical)' }}>{erro}</div>}
    </div>
  );
}
