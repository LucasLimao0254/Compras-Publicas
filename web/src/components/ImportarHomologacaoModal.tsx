import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface FornecedorOpcao { id: string; razaoSocial: string; cnpjCpf: string; }
interface ItemImportavel { homologacaoItemId: string; descricao: string; unidade: string; quantidade: number; valorUnitario: number; }

// Usado tanto no wizard de criação de Contrato quanto no passo de itens por
// órgão de uma Ata — só aparece quando a licitação escolhida tem ao menos uma
// homologação com status 'revisado' (ver briefing_upload_homologacao.md,
// seção 3). A confirmação aqui é deliberada: nunca grava direto o que foi
// extraído/revisado sem o usuário conferir a grade primeiro.
export function ImportarHomologacaoModal({
  licitacaoId,
  fornecedorIdPadrao,
  onClose,
  onImportar,
}: {
  licitacaoId: string;
  fornecedorIdPadrao?: string;
  onClose: () => void;
  onImportar: (itens: ItemImportavel[]) => void;
}) {
  const [fornecedores, setFornecedores] = useState<FornecedorOpcao[]>([]);
  const [fornecedorId, setFornecedorId] = useState('');
  const [itens, setItens] = useState<ItemImportavel[]>([]);
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/licitacoes/${licitacaoId}/homologacao-fornecedores`).then((lista: FornecedorOpcao[]) => {
      setFornecedores(lista);
      const inicial = fornecedorIdPadrao && lista.some((f) => f.id === fornecedorIdPadrao) ? fornecedorIdPadrao : (lista.length === 1 ? lista[0].id : '');
      if (inicial) setFornecedorId(inicial);
    });
  }, [licitacaoId, fornecedorIdPadrao]);

  useEffect(() => {
    if (!fornecedorId) { setItens([]); return; }
    setCarregando(true);
    setErro(null);
    api.get(`/licitacoes/${licitacaoId}/homologacao-itens?fornecedorId=${fornecedorId}`)
      .then((lista: ItemImportavel[]) => {
        setItens(lista);
        setSelecionados(new Set(lista.map((_, i) => i)));
        if (!lista.length) setErro('Nenhum item revisado encontrado para este fornecedor nesta licitação.');
      })
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao buscar itens homologados'))
      .finally(() => setCarregando(false));
  }, [licitacaoId, fornecedorId]);

  function toggle(idx: number) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  }

  function confirmar() {
    onImportar(itens.filter((_, i) => selecionados.has(i)));
    onClose();
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">Importar itens da homologação</h3>

        <div className="field">
          <label>Fornecedor homologado</label>
          <select className="input" value={fornecedorId} onChange={(e) => setFornecedorId(e.target.value)}>
            <option value="">Selecione</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.razaoSocial} ({f.cnpjCpf})</option>)}
          </select>
          {!fornecedores.length && <p className="text-muted" style={{ fontSize: 11.5, marginTop: 4 }}>Nenhuma homologação revisada disponível para esta licitação.</p>}
        </div>

        {carregando && <p className="text-muted" style={{ fontSize: 13 }}>Carregando itens...</p>}
        {erro && <p style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</p>}

        {!!itens.length && (
          <table className="table">
            <thead>
              <tr><th style={{ width: 32 }}></th><th>Descrição</th><th style={{ width: 80 }}>Unidade</th><th style={{ width: 90, textAlign: 'right' }}>Qtd.</th><th style={{ width: 120, textAlign: 'right' }}>Valor unit.</th></tr>
            </thead>
            <tbody>
              {itens.map((it, idx) => (
                <tr key={idx} style={{ opacity: selecionados.has(idx) ? 1 : 0.45 }}>
                  <td><input type="checkbox" checked={selecionados.has(idx)} onChange={() => toggle(idx)} /></td>
                  <td>{it.descricao}</td>
                  <td style={{ fontSize: 12.5 }}>{it.unidade}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{it.quantidade}</td>
                  <td className="num" style={{ textAlign: 'right' }}>R$ {it.valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="dialog-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          <button className="btn btn-primary" onClick={confirmar} disabled={!selecionados.size}>
            Importar {selecionados.size || ''} {selecionados.size === 1 ? 'item' : 'itens'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
