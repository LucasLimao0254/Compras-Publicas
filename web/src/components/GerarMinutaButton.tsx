import { useState } from 'react';
import { api, salvarArquivo } from '../lib/api';

type TipoMinuta = 'ARP' | 'CONTRATO' | 'ADITIVO' | 'APOSTILAMENTO';

// Botão de "gerar documento" reaproveitado nas telas de Contrato e Ata —
// sem modelo cadastrado para o tipo, ou sem a entidade de origem (ex.:
// nenhum aditivo registrado ainda), o botão fica desabilitado com a razão
// dita ao lado (MODELO.md, seção 8) — nunca escondido, nunca com fallback.
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
      const { blob, filename } = await api.download(`/minutas/${tipo}/${entidadeId}`);
      salvarArquivo(blob, filename);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao gerar documento');
    } finally {
      setGerando(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
      <button className="btn btn-secondary" onClick={gerar} disabled={!!indisponivel || gerando} title={indisponivel ?? undefined}>
        <i className="ph ph-file-arrow-down" />{gerando ? 'Gerando...' : label}
      </button>
      {indisponivel && <span className="text-muted" style={{ fontSize: 11 }}>{indisponivel}</span>}
      {erro && <span style={{ fontSize: 11, color: 'var(--color-critical)' }}>{erro}</span>}
    </div>
  );
}
