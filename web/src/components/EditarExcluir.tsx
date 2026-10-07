import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { CampoNumero, numeroRepetido, type NumeroExistente } from './CampoNumero';

const FORMAS_FATURAMENTO = ['MENSAL', 'POR_MEDICAO', 'POR_ETAPA', 'POR_ENTREGA', 'SOB_DEMANDA', 'PARCELA_UNICA', 'PAGAMENTO_ANTECIPADO'];
const dia = (d: string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');

function Dialogo({ titulo, idTitulo, onFechar, onSalvar, salvando, erro, bloqueado, children }: {
  titulo: string; idTitulo: string; onFechar: () => void; onSalvar: (e: FormEvent) => void; salvando: boolean; erro: string | null; bloqueado?: boolean; children: ReactNode;
}) {
  return (
    <div className="dialog-backdrop" onClick={onFechar}>
      <form className="dialog" style={{ width: 'min(560px, 100%)' }} role="dialog" aria-modal="true" aria-labelledby={idTitulo} onClick={(e) => e.stopPropagation()} onSubmit={onSalvar}>
        <h3 className="dialog-title" id={idTitulo}>{titulo}</h3>
        {children}
        {erro && <p role="alert" style={{ fontSize: 12.5, color: 'var(--color-critical)', margin: 0 }}>{erro}</p>}
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={onFechar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={salvando || bloqueado}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button>
        </div>
      </form>
    </div>
  );
}

function useSalvar(onFechar: () => void, onSalvo: () => void) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  async function salvar(acao: () => Promise<unknown>) {
    setSalvando(true); setErro(null);
    try { await acao(); onSalvo(); onFechar(); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  }
  return { salvando, erro, salvar };
}

export interface AtaEditavel { id: string; numeroArp: string; vigenciaInicial: string; vigenciaFinal: string; situacao: string; }

// Licitação e detentor ficam fixos (os itens e o teto vêm deles); a vigência
// final muda por "Prorrogar vigência", na tela da ata, que guarda histórico.
export function EditarAtaModal({ ata, numerosExistentes, onFechar, onSalvo }: { ata: AtaEditavel; numerosExistentes?: NumeroExistente[]; onFechar: () => void; onSalvo: () => void }) {
  const [numeroArp, setNumeroArp] = useState(ata.numeroArp);
  const [vigenciaInicial, setVigenciaInicial] = useState(dia(ata.vigenciaInicial));
  const [situacao, setSituacao] = useState(ata.situacao);
  const { salvando, erro, salvar } = useSalvar(onFechar, onSalvo);
  return (
    <Dialogo titulo={`Editar ata ${ata.numeroArp}`} idTitulo="titulo-editar-ata" onFechar={onFechar} salvando={salvando} erro={erro}
      bloqueado={!!numeroRepetido(numerosExistentes, numeroArp, ata.id)}
      onSalvar={(e) => { e.preventDefault(); salvar(() => api.patch(`/atas/${ata.id}`, { numeroArp, vigenciaInicial, situacao })); }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <CampoNumero id="ed-ata-numero" rotulo="Número ARP" valor={numeroArp} onChange={setNumeroArp} existentes={numerosExistentes} excetoId={ata.id} entidade="ata" />
        <div className="field"><label htmlFor="ed-ata-situacao">Situação</label>
          <select id="ed-ata-situacao" className="input" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="VIGENTE">Vigente</option><option value="ARQUIVADO">Arquivada</option>
          </select></div>
        <div className="field"><label htmlFor="ed-ata-inicio">Vigência inicial</label>
          <input id="ed-ata-inicio" type="date" className="input" value={vigenciaInicial} onChange={(e) => setVigenciaInicial(e.target.value)} required /></div>
        <div className="field"><label>Vigência final</label>
          <input type="date" className="input" value={dia(ata.vigenciaFinal)} disabled />
          <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>Muda por "Prorrogar vigência", na tela da ata.</p></div>
      </div>
      <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>Licitação e detentor não mudam: os itens e o teto da ata vêm deles.</p>
    </Dialogo>
  );
}

export interface ContratoEditavel {
  id: string; numero: string; numeroProcesso: string; objeto: string; formaFaturamento: string;
  vigenciaInicial: string; vigenciaFinal: string; situacao: string;
}

// Licitação, fornecedor e origem ficam fixos (os itens vêm deles). A vigência
// final só muda aqui enquanto não há ordem nem aditivo; depois, por aditivo
// de prazo — o backend recusa com essa orientação.
export function EditarContratoModal({ contrato, numerosExistentes, onFechar, onSalvo }: { contrato: ContratoEditavel; numerosExistentes?: NumeroExistente[]; onFechar: () => void; onSalvo: () => void }) {
  const [numero, setNumero] = useState(contrato.numero);
  const [numeroProcesso, setNumeroProcesso] = useState(contrato.numeroProcesso);
  const [objeto, setObjeto] = useState(contrato.objeto);
  const [formaFaturamento, setFormaFaturamento] = useState(contrato.formaFaturamento);
  const [vigenciaInicial, setVigenciaInicial] = useState(dia(contrato.vigenciaInicial));
  const [vigenciaFinal, setVigenciaFinal] = useState(dia(contrato.vigenciaFinal));
  const [situacao, setSituacao] = useState(contrato.situacao);
  const { salvando, erro, salvar } = useSalvar(onFechar, onSalvo);
  return (
    <Dialogo titulo={`Editar contrato ${contrato.numero}`} idTitulo="titulo-editar-contrato" onFechar={onFechar} salvando={salvando} erro={erro}
      bloqueado={!!numeroRepetido(numerosExistentes, numero, contrato.id)}
      onSalvar={(e) => { e.preventDefault(); salvar(() => api.patch(`/contratos/${contrato.id}`, { numero, numeroProcesso, objeto, formaFaturamento, vigenciaInicial, vigenciaFinal, situacao })); }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 12 }}>
        <CampoNumero id="ed-ct-numero" rotulo="Número do contrato/ano" valor={numero} onChange={setNumero} existentes={numerosExistentes} excetoId={contrato.id} entidade="contrato" />
        <div className="field"><label htmlFor="ed-ct-processo">Número do processo</label>
          <input id="ed-ct-processo" className="input" value={numeroProcesso} onChange={(e) => setNumeroProcesso(e.target.value)} required /></div>
        <div className="field"><label htmlFor="ed-ct-faturamento">Forma de faturamento</label>
          <select id="ed-ct-faturamento" className="input" value={formaFaturamento} onChange={(e) => setFormaFaturamento(e.target.value)}>
            {FORMAS_FATURAMENTO.map((f) => <option key={f} value={f}>{f.replaceAll('_', ' ')}</option>)}
          </select></div>
        <div className="field"><label htmlFor="ed-ct-situacao">Situação</label>
          <select id="ed-ct-situacao" className="input" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="MINUTA">Minuta</option><option value="VIGENTE">Vigente</option><option value="ARQUIVADO">Arquivado</option>
          </select></div>
        <div className="field"><label htmlFor="ed-ct-inicio">Vigência inicial</label>
          <input id="ed-ct-inicio" type="date" className="input" value={vigenciaInicial} onChange={(e) => setVigenciaInicial(e.target.value)} required /></div>
        <div className="field"><label htmlFor="ed-ct-fim">Vigência final</label>
          <input id="ed-ct-fim" type="date" className="input" value={vigenciaFinal} onChange={(e) => setVigenciaFinal(e.target.value)} required />
          <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>Com ordens ou aditivos, prorrogue por aditivo de prazo.</p></div>
      </div>
      <div className="field"><label htmlFor="ed-ct-objeto">Objeto</label>
        <textarea id="ed-ct-objeto" className="input" rows={3} value={objeto} onChange={(e) => setObjeto(e.target.value)} required /></div>
      <p className="text-muted" style={{ fontSize: 11.5, margin: 0 }}>Licitação, fornecedor e origem não mudam: os itens do contrato vêm deles.</p>
    </Dialogo>
  );
}

// Excluir com confirmação no próprio lugar. Só o Administrador vê o botão —
// a mesma regra que o backend aplica; a recusa (ex.: contrato com ordens)
// aparece logo abaixo, com a orientação de arquivar.
export function BotaoExcluir({ rotulo, caminho, onExcluido, compacto }: { rotulo: string; caminho: string; onExcluido: () => void; compacto?: boolean }) {
  const { usuario } = useAuth();
  const [confirmando, setConfirmando] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  if (usuario?.tipoUsuario !== 'ADMIN') return null;

  async function excluir() {
    setExcluindo(true); setErro(null);
    try { await api.delete(caminho); onExcluido(); }
    catch (err) { setErro(err instanceof Error ? err.message : 'Erro ao excluir'); setConfirmando(false); }
    finally { setExcluindo(false); }
  }

  const confirmacao = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      Excluir {rotulo}?
      <button type="button" className="btn btn-secondary" style={{ color: 'var(--color-critical)' }} disabled={excluindo} onClick={excluir}>{excluindo ? 'Excluindo…' : 'Sim, excluir'}</button>
      <button type="button" className="btn btn-ghost" onClick={() => setConfirmando(false)}>Voltar</button>
    </span>
  );
  const mensagem = erro && <span role="alert" style={{ fontSize: 11.5, color: 'var(--color-critical)', textAlign: 'right', whiteSpace: 'normal' }}>{erro}</span>;

  // Na linha de uma tabela a confirmação e a recusa abrem num painel ao lado
  // do ícone, sem espremer as colunas.
  if (compacto) {
    return (
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <button type="button" className="icone-acao" title={`Excluir ${rotulo}`} aria-label={`Excluir ${rotulo}`} onClick={() => { setConfirmando(true); setErro(null); }}>
          <i className="ph ph-trash" />
        </button>
        {(confirmando || erro) && (
          <span className="painel-flutuante">
            {confirmando ? confirmacao : mensagem}
            {!confirmando && <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-end' }} onClick={() => setErro(null)}>Fechar</button>}
          </span>
        )}
      </span>
    );
  }

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, maxWidth: 380 }}>
      {confirmando ? confirmacao : (
        <button type="button" className="btn btn-secondary" style={{ color: 'var(--color-critical)' }} onClick={() => { setConfirmando(true); setErro(null); }}><i className="ph ph-trash" />Excluir</button>
      )}
      {mensagem}
    </span>
  );
}
