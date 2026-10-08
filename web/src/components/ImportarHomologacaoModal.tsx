import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface FornecedorOpcao { id: string; razaoSocial: string; cnpjCpf: string; }
interface ItemHomologado {
  homologacaoItemId: string; numeroItem: number | null; descricao: string; unidade: string;
  quantidade: number; quantidadeDisponivel: number; valorUnitario: number;
}
export interface ItemImportavel { homologacaoItemId: string; descricao: string; unidade: string; quantidade: number; valorUnitario: number; }

// Usado tanto no wizard de criação de Contrato quanto no passo de itens por
// órgão de uma Ata — só aparece quando a licitação escolhida tem ao menos uma
// homologação com status 'revisado'. O item vem da homologação somente-leitura;
// o único campo editável é a quantidade, com o saldo da origem ao lado
// (MODELO.md, seção 7). Antes a quantidade ia sempre cheia (o teto inteiro),
// o que tornava impossível distribuir um item entre dois órgãos de uma ata.
//
// `saldoPorItem`: saldo da ORIGEM de quem chama, por homologacaoItemId, quando
// ela não é o teto da homologação — o contrato que abate de um órgão de ata
// passa aqui o saldo daquele órgão. Sem isso, vale o saldo ainda não
// distribuído do teto homologado, que a API devolve.
export function ImportarHomologacaoModal({
  licitacaoId,
  fornecedorIdPadrao,
  saldoPorItem,
  rotuloOrigem = 'teto homologado',
  jaIncluidos = [],
  onClose,
  onImportar,
}: {
  licitacaoId: string;
  fornecedorIdPadrao?: string;
  saldoPorItem?: Record<string, number>;
  rotuloOrigem?: string;
  jaIncluidos?: string[];
  onClose: () => void;
  onImportar: (itens: ItemImportavel[]) => void | Promise<void>;
}) {
  const [fornecedores, setFornecedores] = useState<FornecedorOpcao[]>([]);
  const [fornecedorId, setFornecedorId] = useState('');
  const [itens, setItens] = useState<ItemHomologado[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const [carregando, setCarregando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    api.get(`/licitacoes/${licitacaoId}/homologacao-fornecedores`).then((lista: FornecedorOpcao[]) => {
      setFornecedores(lista);
      const inicial = fornecedorIdPadrao && lista.some((f) => f.id === fornecedorIdPadrao) ? fornecedorIdPadrao : (lista.length === 1 ? lista[0].id : '');
      if (inicial) setFornecedorId(inicial);
    }).catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao buscar fornecedores homologados'));
  }, [licitacaoId, fornecedorIdPadrao]);

  const saldoDe = (it: ItemHomologado) => (saldoPorItem ? (saldoPorItem[it.homologacaoItemId] ?? 0) : it.quantidadeDisponivel);
  const jaIncluido = (it: ItemHomologado) => jaIncluidos.includes(it.homologacaoItemId);

  useEffect(() => {
    if (!fornecedorId) { setItens([]); return; }
    setCarregando(true);
    setErro(null);
    api.get(`/licitacoes/${licitacaoId}/homologacao-itens?fornecedorId=${fornecedorId}`)
      .then((lista: ItemHomologado[]) => {
        setItens(lista);
        // Pré-seleciona só o que ainda tem saldo na origem e não está na grade,
        // já com o saldo inteiro como quantidade sugerida.
        const disponiveis = lista.filter((it) => saldoDe(it) > 0 && !jaIncluido(it));
        setSelecionados(new Set(disponiveis.map((it) => it.homologacaoItemId)));
        setQuantidades(Object.fromEntries(disponiveis.map((it) => [it.homologacaoItemId, String(saldoDe(it))])));
        if (!lista.length) setErro('Nenhum item revisado encontrado para este fornecedor nesta licitação.');
      })
      .catch((err) => setErro(err instanceof Error ? err.message : 'Erro ao buscar itens homologados'))
      .finally(() => setCarregando(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [licitacaoId, fornecedorId]);

  function toggle(id: string) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const escolhidos = itens.filter((it) => selecionados.has(it.homologacaoItemId));
  // Quantidade zero é válida (reserva o item no órgão sem alocar nada ainda —
  // MODELO.md, invariante 4); acima do saldo da origem, não.
  const invalido = (it: ItemHomologado) => {
    const q = Number(quantidades[it.homologacaoItemId]);
    return quantidades[it.homologacaoItemId] === undefined || quantidades[it.homologacaoItemId] === '' || !Number.isFinite(q) || q < 0 || q > saldoDe(it);
  };
  const temInvalido = escolhidos.some(invalido);

  async function confirmar() {
    setErro(null);
    setImportando(true);
    try {
      await onImportar(escolhidos.map((it) => ({
        homologacaoItemId: it.homologacaoItemId,
        descricao: it.descricao,
        unidade: it.unidade,
        quantidade: Number(quantidades[it.homologacaoItemId]),
        valorUnitario: it.valorUnitario,
      })));
      onClose();
    } catch (err) {
      // Fica aberto com o motivo — nada foi gravado (a importação é uma
      // transação só), então dá para ajustar e tentar de novo.
      setErro(err instanceof Error ? err.message : 'Erro ao importar itens');
    } finally {
      setImportando(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog" style={{ maxWidth: 760, maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
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

        {!!itens.length && (
          <>
            <p className="text-muted" style={{ fontSize: 12, margin: '0 0 6px' }}>
              Itens vindos da homologação — descrição, unidade e valor não são editáveis aqui. Informe a quantidade de cada item, até o saldo disponível no {rotuloOrigem}.
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: 32 }}></th><th style={{ width: 44 }}>#</th><th>Descrição</th><th style={{ width: 70 }}>Unidade</th>
                  <th style={{ width: 100, textAlign: 'right' }}>Valor unit.</th><th style={{ width: 90, textAlign: 'right' }}>Disponível</th><th style={{ width: 110 }}>Quantidade</th>
                </tr>
              </thead>
              <tbody>
                {itens.map((it) => {
                  const id = it.homologacaoItemId;
                  const marcado = selecionados.has(id);
                  const saldo = saldoDe(it);
                  const incluso = jaIncluido(it);
                  return (
                    <tr key={id} style={{ opacity: marcado ? 1 : 0.5 }}>
                      <td><input type="checkbox" checked={marcado} disabled={incluso} onChange={() => toggle(id)} /></td>
                      <td className="num text-muted">{it.numeroItem ?? '—'}</td>
                      <td>{it.descricao}{incluso && <span className="text-muted" style={{ fontSize: 11 }}> — já está na grade</span>}</td>
                      <td style={{ fontSize: 12.5 }}>{it.unidade}</td>
                      <td className="num" style={{ textAlign: 'right' }}>R$ {it.valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="num" style={{ textAlign: 'right' }}>{saldo}<span className="text-muted" style={{ fontSize: 11 }}> de {it.quantidade}</span></td>
                      <td>
                        <input
                          className="input num" type="number" min={0} max={saldo} step="0.001" style={{ textAlign: 'right', borderColor: marcado && invalido(it) ? 'var(--color-critical)' : undefined }}
                          disabled={!marcado}
                          value={quantidades[id] ?? ''}
                          onChange={(e) => setQuantidades((prev) => ({ ...prev, [id]: e.target.value }))}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {erro && <p style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</p>}
        {temInvalido && <p style={{ fontSize: 12, color: 'var(--color-critical)', margin: 0 }}>Há quantidade em branco, negativa ou acima do saldo disponível.</p>}

        <div className="dialog-actions" style={{ justifyContent: 'flex-start', marginTop: 12 }}>
          <button className="btn btn-primary" onClick={confirmar} disabled={!escolhidos.length || temInvalido || importando}>
            {importando ? 'Importando...' : `Importar ${escolhidos.length || ''} ${escolhidos.length === 1 ? 'item' : 'itens'}`}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
