import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface ItemHomologado {
  id: string; numeroItem: number | null; descricao: string; unidade: string | null;
  quantidade: string | null; valorUnitario: string | null; confiancaExtracao: 'alta' | 'media' | 'baixa' | null;
}
interface FornecedorHomologado {
  id: string; nomeExtraido: string; cnpjExtraido: string | null; fornecedorId: string | null;
  fornecedor: { id: string; razaoSocial: string; cnpjCpf: string } | null;
  itens: ItemHomologado[];
}
interface Homologacao {
  id: string; arquivoNome: string; status: string; erroDetalhe: string | null;
  fornecedores: FornecedorHomologado[];
}
interface Opcao { id: string; label: string; cnpjCpf: string; }

const CAMPO_INCOMPLETO: React.CSSProperties = { borderColor: 'var(--color-warn)' };

function itemIncompleto(it: ItemHomologado) {
  return !it.descricao || !it.unidade || it.quantidade == null || it.valorUnitario == null;
}

export function RevisarHomologacaoModal({ homologacaoId, onClose, onSaved }: { homologacaoId: string; onClose: () => void; onSaved: () => void }) {
  const [homologacao, setHomologacao] = useState<Homologacao | null>(null);
  const [fornecedoresCadastrados, setFornecedoresCadastrados] = useState<Opcao[]>([]);
  const [novoFornecedorAberto, setNovoFornecedorAberto] = useState<string | null>(null);
  const [novoCnpj, setNovoCnpj] = useState('');
  const [novaRazaoSocial, setNovaRazaoSocial] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);

  async function carregar() {
    const h = await api.get(`/licitacoes/homologacoes/${homologacaoId}`);
    setHomologacao(h);
  }

  async function carregarFornecedoresCadastrados() {
    const f = await api.get('/fornecedores');
    setFornecedoresCadastrados(f.map((x: any) => ({ id: x.id, label: x.razaoSocial, cnpjCpf: x.cnpjCpf })));
  }

  useEffect(() => {
    carregar();
    carregarFornecedoresCadastrados();
  }, [homologacaoId]);

  async function patchFornecedor(fId: string, body: Record<string, unknown>) {
    setErro(null);
    try {
      const h = await api.patch(`/licitacoes/homologacoes/${homologacaoId}/fornecedores/${fId}`, body);
      setHomologacao(h);
      // Se a própria revisão acabou de cadastrar um fornecedor novo, ele
      // ainda não está na lista carregada no mount — sem isto, o <select>
      // mostra "Selecione..." mesmo com o vínculo já salvo no backend.
      if (body.novoFornecedor) await carregarFornecedoresCadastrados();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar fornecedor');
    }
  }

  async function patchItem(itemId: string, body: Record<string, unknown>) {
    setErro(null);
    try {
      const h = await api.patch(`/licitacoes/homologacoes/${homologacaoId}/itens/${itemId}`, body);
      setHomologacao(h);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao salvar item');
    }
  }

  async function vincularNovoFornecedor(fId: string) {
    if (!novoCnpj || !novaRazaoSocial) return;
    await patchFornecedor(fId, { novoFornecedor: { cnpjCpf: novoCnpj, razaoSocial: novaRazaoSocial } });
    setNovoFornecedorAberto(null);
    setNovoCnpj('');
    setNovaRazaoSocial('');
  }

  async function concluirRevisao() {
    setErro(null);
    setConcluindo(true);
    try {
      await api.post(`/licitacoes/homologacoes/${homologacaoId}/concluir-revisao`);
      onSaved();
      onClose();
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao concluir revisão');
    } finally {
      setConcluindo(false);
    }
  }

  if (!homologacao) return null;

  const pronta = homologacao.fornecedores.length > 0 && homologacao.fornecedores.every((f) => f.fornecedorId && f.itens.length && f.itens.every((it) => !itemIncompleto(it)));

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog dialog-grande" role="dialog" aria-modal="true" aria-labelledby="titulo-revisao" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h3 className="dialog-title" id="titulo-revisao">Revisar homologação — {homologacao.arquivoNome}</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose} aria-label="Fechar"><i className="ph ph-x" />Fechar</button>
        </div>
        <p className="text-muted" style={{ fontSize: 12.5, margin: '-6px 0 4px' }}>
          Confira os dados extraídos da planilha antes de liberar para importação em ata/contrato. Campos com borda amarela vieram vazios ou incompletos na extração.
        </p>

        <div className="dialog-rolagem" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {homologacao.fornecedores.map((f) => (
            <div key={f.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px 1fr', gap: 10, alignItems: 'end', marginBottom: 12 }}>
                <div className="field">
                  <label>Nome extraído</label>
                  <input
                    className="input"
                    defaultValue={f.nomeExtraido}
                    onBlur={(e) => { if (e.target.value !== f.nomeExtraido) patchFornecedor(f.id, { nomeExtraido: e.target.value }); }}
                  />
                </div>
                <div className="field">
                  <label>CNPJ extraído</label>
                  <input
                    className="input num"
                    style={!f.cnpjExtraido ? CAMPO_INCOMPLETO : undefined}
                    defaultValue={f.cnpjExtraido ?? ''}
                    onBlur={(e) => { if (e.target.value !== (f.cnpjExtraido ?? '')) patchFornecedor(f.id, { cnpjExtraido: e.target.value }); }}
                  />
                </div>
                <div className="field">
                  <label>Fornecedor cadastrado</label>
                  <select
                    className="input"
                    style={!f.fornecedorId ? CAMPO_INCOMPLETO : undefined}
                    value={f.fornecedorId ?? ''}
                    onChange={(e) => patchFornecedor(f.id, { fornecedorId: e.target.value || null })}
                  >
                    <option value="">Selecione ou cadastre →</option>
                    {fornecedoresCadastrados.map((o) => <option key={o.id} value={o.id}>{o.label} ({o.cnpjCpf})</option>)}
                  </select>
                </div>
              </div>

              {novoFornecedorAberto === f.id ? (
                <div style={{ display: 'grid', gridTemplateColumns: '200px minmax(0,1fr) auto auto', gap: 8, alignItems: 'end', marginBottom: 12 }}>
                  <div className="field"><label htmlFor={`novo-cnpj-${f.id}`}>CNPJ/CPF do novo fornecedor</label>
                    <input id={`novo-cnpj-${f.id}`} className="input num" value={novoCnpj} onChange={(e) => setNovoCnpj(e.target.value)} /></div>
                  <div className="field"><label htmlFor={`novo-razao-${f.id}`}>Razão social</label>
                    <input id={`novo-razao-${f.id}`} className="input" value={novaRazaoSocial} onChange={(e) => setNovaRazaoSocial(e.target.value)} /></div>
                  <button className="btn btn-primary" onClick={() => vincularNovoFornecedor(f.id)} disabled={!novoCnpj.trim() || !novaRazaoSocial.trim()}>Cadastrar e vincular</button>
                  <button className="btn btn-ghost" onClick={() => setNovoFornecedorAberto(null)}>Cancelar</button>
                </div>
              ) : !f.fornecedorId && (
                <button className="btn btn-ghost" style={{ marginBottom: 12 }} onClick={() => { setNovoFornecedorAberto(f.id); setNovoCnpj(f.cnpjExtraido ?? ''); setNovaRazaoSocial(f.nomeExtraido); }}>
                  <i className="ph ph-plus" />cadastrar como novo fornecedor
                </button>
              )}

              <table className="table">
                <thead>
                  <tr><th style={{ width: 50 }}>#</th><th>Descrição</th><th style={{ width: 90 }}>Unidade</th><th style={{ width: 100 }}>Quantidade</th><th style={{ width: 130 }}>Valor unit.</th></tr>
                </thead>
                <tbody>
                  {f.itens.map((it) => (
                    <tr key={it.id}>
                      <td><input className="input num" defaultValue={it.numeroItem ?? ''} style={it.numeroItem == null ? CAMPO_INCOMPLETO : undefined} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== it.numeroItem) patchItem(it.id, { numeroItem: v }); }} /></td>
                      <td><textarea className="input" rows={2} defaultValue={it.descricao} style={{ resize: 'vertical', minHeight: 40, fontSize: 13, ...(!it.descricao ? CAMPO_INCOMPLETO : {}) }} onBlur={(e) => { if (e.target.value !== it.descricao) patchItem(it.id, { descricao: e.target.value }); }} /></td>
                      <td><input className="input" defaultValue={it.unidade ?? ''} style={!it.unidade ? CAMPO_INCOMPLETO : undefined} onBlur={(e) => { if (e.target.value !== (it.unidade ?? '')) patchItem(it.id, { unidade: e.target.value }); }} /></td>
                      <td><input className="input num" type="number" step="0.001" defaultValue={it.quantidade ?? ''} style={it.quantidade == null ? CAMPO_INCOMPLETO : undefined} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (it.quantidade != null ? Number(it.quantidade) : null)) patchItem(it.id, { quantidade: v }); }} /></td>
                      <td><input className="input num" type="number" step="0.0001" defaultValue={it.valorUnitario ?? ''} style={it.valorUnitario == null ? CAMPO_INCOMPLETO : undefined} onBlur={(e) => { const v = e.target.value ? Number(e.target.value) : null; if (v !== (it.valorUnitario != null ? Number(it.valorUnitario) : null)) patchItem(it.id, { valorUnitario: v }); }} /></td>
                    </tr>
                  ))}
                  {!f.itens.length && <tr><td colSpan={5} style={{ padding: '12px 0', textAlign: 'center' }} className="text-muted">Nenhum item extraído para este fornecedor</td></tr>}
                </tbody>
              </table>
            </div>
          ))}
          {!homologacao.fornecedores.length && <p className="text-muted" style={{ fontSize: 13 }}>Nenhum fornecedor foi extraído deste documento.</p>}
        </div>

        <div className="dialog-actions" style={{ justifyContent: 'flex-start', flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={concluirRevisao} disabled={concluindo || !pronta}>
            {concluindo ? 'Concluindo...' : 'Concluir revisão'}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>Fechar</button>
          {erro && <span style={{ fontSize: 12.5, color: 'var(--color-critical)' }}>{erro}</span>}
          {!pronta && !erro && <span className="text-muted" style={{ fontSize: 11.5 }}>Vincule um fornecedor cadastrado e preencha descrição, unidade, quantidade e valor unitário de todos os itens para concluir.</span>}
        </div>
      </div>
    </div>
  );
}
