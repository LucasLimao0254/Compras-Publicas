import { useEffect, useState } from 'react';
import { api, salvarArquivo } from '../lib/api';
import { MODALIDADES, type ModeloItem, type TipoMinuta } from './ModelosMinutaTipo';

const ROTULO_MODALIDADE = Object.fromEntries(MODALIDADES);

interface ModelosDaEntidade { modalidade: string | null; sugeridoId: string | null; modelos: ModeloItem[]; }

// Botão de "gerar documento" reaproveitado nas telas de Contrato e Ata —
// sem modelo cadastrado para o tipo, ou sem a entidade de origem (ex.:
// nenhum aditivo registrado ainda), o botão fica desabilitado com a razão
// dita ao lado (MODELO.md, seção 8) — nunca escondido, nunca com fallback.
// Com vários modelos do tipo, mostra qual será usado — o sugerido pela
// modalidade da licitação vem pré-selecionado — e deixa trocar.
export function GerarMinutaButton({
  tipo, entidadeId, modeloCarregado, label, motivoIndisponivel,
}: {
  tipo: TipoMinuta;
  entidadeId: string | null;
  modeloCarregado: boolean;
  label: string;
  motivoIndisponivel?: string;
}) {
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [opcoes, setOpcoes] = useState<ModelosDaEntidade | null>(null);
  const [modeloId, setModeloId] = useState('');

  useEffect(() => {
    setOpcoes(null);
    if (!entidadeId || !modeloCarregado) return;
    let ativo = true;
    api.get(`/minutas/${tipo}/${entidadeId}/modelos`)
      .then((r: ModelosDaEntidade) => { if (ativo) { setOpcoes(r); setModeloId(r.sugeridoId ?? r.modelos[0]?.id ?? ''); } })
      .catch(() => { /* sem a lista, gera com o sugerido pelo servidor */ });
    return () => { ativo = false; };
  }, [tipo, entidadeId, modeloCarregado]);

  const indisponivel = !entidadeId
    ? (motivoIndisponivel ?? 'Não disponível')
    : !modeloCarregado
      ? 'Nenhum modelo cadastrado para este tipo — cadastre em Configurações'
      : null;

  async function gerar() {
    if (!entidadeId) return;
    setGerando(true);
    setErro(null);
    try {
      const sufixo = modeloId ? `?modeloId=${encodeURIComponent(modeloId)}` : '';
      const { blob, filename } = await api.download(`/minutas/${tipo}/${entidadeId}${sufixo}`);
      salvarArquivo(blob, filename);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar documento');
    } finally {
      setGerando(false);
    }
  }

  const modalidade = opcoes?.modalidade ? ROTULO_MODALIDADE[opcoes.modalidade] ?? opcoes.modalidade : null;
  const escolhido = opcoes?.modelos.find((m) => m.id === modeloId);

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {!indisponivel && opcoes && opcoes.modelos.length > 1 && (
          <select className="input" aria-label="Modelo do documento" value={modeloId} onChange={(e) => setModeloId(e.target.value)} style={{ maxWidth: 260 }}>
            {opcoes.modelos.map((m) => (
              <option key={m.id} value={m.id}>{m.nome}{m.id === opcoes.sugeridoId ? ' (sugerido)' : ''}</option>
            ))}
          </select>
        )}
        <button className="btn btn-secondary" onClick={gerar} disabled={!!indisponivel || gerando} title={indisponivel ?? undefined}>
          <i className="ph ph-file-arrow-down" />{gerando ? 'Gerando...' : label}
        </button>
      </div>
      {!indisponivel && escolhido && (
        <span className="text-muted" style={{ fontSize: 11 }}>
          Modelo: <strong style={{ fontWeight: 500 }}>{escolhido.nome}</strong>
          {modalidade ? ` — licitação por ${modalidade.toLowerCase()}` : ' — sem licitação vinculada'}
          {escolhido.id === opcoes?.sugeridoId ? ' (sugerido)' : ''}
        </span>
      )}
      {indisponivel && <span className="text-muted" style={{ fontSize: 11 }}>{indisponivel}</span>}
      {erro && <span role="alert" style={{ fontSize: 11, color: 'var(--color-critical)' }}>{erro}</span>}
    </div>
  );
}
