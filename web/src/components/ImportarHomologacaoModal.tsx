import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { DescricaoResumida } from './DescricaoResumida';

interface FornecedorOpcao { id: string; razaoSocial: string; cnpjCpf: string; }
// `quantidade` = o que ainda está disponível para importar (saldo da
// homologação, ou do órgão da ata quando `ataOrgaoId` é passado).
interface ItemImportavel { homologacaoItemId: string; descricao: string; unidade: string; quantidade: number; quantidadeHomologada?: number; valorUnitario: number; }

// Usado tanto no wizard de criação de Contrato quanto no passo de itens por
// órgão de uma Ata — só aparece quando a licitação escolhida tem ao menos uma
// homologação com status 'revisado' (ver briefing_upload_homologacao.md,
// seção 3). A confirmação aqui é deliberada: nunca grava direto o que foi
// extraído/revisado sem o usuário conferir a grade primeiro.
export function ImportarHomologacaoModal({
  licitacaoId,
  fornecedorIdPadrao,
  ataOrgaoId,
  onClose,
  onImportar,
}: {
  licitacaoId: string;
  fornecedorIdPadrao?: string;
  ataOrgaoId?: string;
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
    const filtroOrgao = ataOrgaoId ? `&ataOrgaoId=${ataOrgaoId}` : '';
    api.get(`/licitacoes/${licitacaoId}/homologacao-itens?fornecedorId=${fornecedorId}${filtroOrgao}`)
      .then((lista: ItemImportavel[]) => {
        setItens(lista);
        // item sem saldo vem desmarcado e não pode ser marcado
        setSelecionados(new Set(lista.map((it, i) => (it.quantidade > 0 ? i : -1)).filter((i) => i >= 0)));
        if (!lista.length) setErro('Nenhum item revisado encontrado para este fornecedor nesta licitação.');
      })
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao buscar itens homologados'))
      .finally(() => setCarregando(false));
  }, [licitacaoId, fornecedorId, ataOrgaoId]);

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
      <div className="dialog dialog-grande" role="dialog" aria-modal="true" aria-labelledby="titulo-importar" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h3 className="dialog-title" id="titulo-importar">Importar itens da homologação</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Fechar"><i className="ph ph-x" />Fechar</button>
        </div>

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
          <div className="dialog-rolagem">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}>
                    <input type="checkbox" aria-label="Marcar todos com saldo" checked={selecionados.size > 0 && selecionados.size === itens.filter((it) => it.quantidade > 0).length}
                      onChange={(e) => setSelecionados(e.target.checked ? new Set(itens.map((it, i) => (it.quantidade > 0 ? i : -1)).filter((i) => i >= 0)) : new Set())} />
                  </th>
                  <th>Descrição</th><th style={{ width: 100 }}>Unidade</th>
                  <th style={{ width: 130, textAlign: 'right' }}>{ataOrgaoId ? 'Disponível no órgão' : 'Disponível'}</th>
                  <th style={{ width: 120, textAlign: 'right' }}>Valor unit.</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it, idx) => (
                  <tr key={idx} style={{ opacity: selecionados.has(idx) ? 1 : 0.45 }}>
                    <td><input type="checkbox" checked={selecionados.has(idx)} disabled={it.quantidade <= 0} onChange={() => toggle(idx)} aria-label={`Selecionar ${it.descricao.slice(0, 40)}`} /></td>
                    <td style={{ minWidth: 0 }}><DescricaoResumida texto={it.descricao} /></td>
                    <td style={{ fontSize: 12.5 }}>{it.unidade}</td>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {it.quantidade}
                      {it.quantidadeHomologada != null && it.quantidadeHomologada !== it.quantidade && (
                        <div className="text-muted" style={{ fontSize: 11 }}>de {it.quantidadeHomologada} homologados</div>
                      )}
                      {it.quantidade <= 0 && <div style={{ fontSize: 11, color: 'var(--color-critical)' }}>sem saldo</div>}
                    </td>
                    <td className="num" style={{ textAlign: 'right' }}>R$ {it.valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="dialog-actions" style={{ justifyContent: 'flex-start' }}>
          <button className="btn btn-primary" onClick={confirmar} disabled={!selecionados.size}>
            Importar {selecionados.size || ''} {selecionados.size === 1 ? 'item' : 'itens'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
