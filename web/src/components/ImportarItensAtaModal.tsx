import { useState } from 'react';
import { api } from '../lib/api';

export function ImportarItensAtaModal({
  ataId, ataOrgaoId, orgaoNome, onClose, onImportado,
}: { ataId: string; ataOrgaoId: string; orgaoNome: string; onClose: () => void; onImportado: () => void }) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ inseridos: number; erros: { linha: number; motivo: string }[] } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function importar() {
    if (!arquivo) return;
    setEnviando(true);
    setErro(null);
    try {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      const r = await api.upload(`/atas/${ataId}/orgaos/${ataOrgaoId}/itens/importar`, formData);
      setResultado(r);
      if (r.inseridos > 0) onImportado();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao importar planilha');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Importar itens por planilha</h3>
        <p className="text-muted" style={{ fontSize: 12.5, margin: '-8px 0 4px' }}>Órgão {orgaoNome}</p>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', borderRadius: 10, background: 'color-mix(in srgb, var(--color-accent) 10%, transparent)', padding: '12px 14px', fontSize: 12, lineHeight: 1.5, color: 'color-mix(in srgb, var(--color-text) 75%, transparent)' }}>
          <i className="ph ph-info" style={{ color: 'var(--color-accent)' }} />
          Arquivo .xlsx, .xls ou .csv com colunas na ordem: Item, Descrição, Unidade, Quantidade, Preço Unitário.
        </div>

        <label className="field" style={{ boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-text) 20%, transparent)', borderRadius: 10, padding: 22, textAlign: 'center', cursor: 'pointer', borderStyle: 'dashed' }}>
          <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={(e) => setArquivo(e.target.files?.[0] ?? null)} />
          <i className="ph ph-file-arrow-up" style={{ fontSize: 20 }} />
          <div style={{ fontSize: 12.5, marginTop: 6 }}>{arquivo ? arquivo.name : 'Arraste a planilha aqui ou clique para enviar'}</div>
        </label>

        {resultado && (
          <div style={{ fontSize: 12.5 }}>
            <p style={{ margin: '0 0 6px', color: 'var(--color-accent-300)' }}>{resultado.inseridos} {resultado.inseridos === 1 ? 'item importado' : 'itens importados'}.</p>
            {!!resultado.erros.length && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '20vh', overflowY: 'auto' }}>
                {resultado.erros.map((e, i) => (
                  <span key={i} style={{ color: 'var(--color-critical)' }}>Linha {e.linha}: {e.motivo}</span>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" onClick={importar} disabled={!arquivo || enviando}>{enviando ? 'Importando...' : 'Importar'}</button>
          <button className="btn btn-secondary" onClick={onClose}>{resultado ? 'Fechar' : 'Cancelar'}</button>
          {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
        </div>
      </div>
    </div>
  );
}
