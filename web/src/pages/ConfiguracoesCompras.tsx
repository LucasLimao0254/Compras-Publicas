import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';
import { ModelosMinutaTipo, type ModelosMinuta, type TipoMinuta } from '../components/ModelosMinutaTipo';

interface Config {
  proximoNumeroOrdem: number;
  ultimoNumeroEmitido: number | null;
  permitirOrdemContratoVencido: boolean;
  dotacaoObrigatoria: boolean;
}

interface Marcador { marcador: string; descricao: string; }

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`toggle${checked ? ' on' : ''}`}>
      <span className="knob" />
    </button>
  );
}

function Retorno({ campo, mensagem }: { campo: string; mensagem: { campo: string; erro: boolean; texto: string } | null }) {
  if (!mensagem || mensagem.campo !== campo) return null;
  return (
    <p role={mensagem.erro ? 'alert' : 'status'} style={{ fontSize: 12.5, margin: '10px 0 0', color: mensagem.erro ? 'var(--color-critical)' : 'var(--color-accent)' }}>
      {mensagem.texto}
    </p>
  );
}

export function ConfiguracoesCompras() {
  const { usuario } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [numeroInput, setNumeroInput] = useState('');
  const [salvando, setSalvando] = useState(false);
  // Resposta de cada ajuste aparece junto do próprio ajuste — antes ia para o
  // fim da página, em cinza, e quem salvava o sequencial não via o erro.
  const [mensagem, setMensagem] = useState<{ campo: string; erro: boolean; texto: string } | null>(null);

  const [modelosMinuta, setModelosMinuta] = useState<ModelosMinuta | null>(null);
  const [marcadores, setMarcadores] = useState<Record<TipoMinuta, Marcador[]> | null>(null);

  async function carregar() {
    const c = await api.get('/configuracoes/compras');
    setConfig(c);
    setNumeroInput(String(c.proximoNumeroOrdem));
  }
  async function carregarMinutas() {
    const [m, mk] = await Promise.all([api.get('/minutas/modelos'), api.get('/minutas/marcadores')]);
    setModelosMinuta(m);
    setMarcadores(mk);
  }
  useEffect(() => { carregar(); carregarMinutas(); }, []);

  async function patch(body: Partial<Config>) {
    const campo = Object.keys(body)[0];
    setSalvando(true);
    setMensagem(null);
    try {
      const atualizado = await api.patch('/configuracoes/compras', body);
      setConfig(atualizado);
      setNumeroInput(String(atualizado.proximoNumeroOrdem));
      setMensagem({ campo, erro: false, texto: 'Salvo.' });
    } catch (err) {
      setMensagem({ campo, erro: true, texto: err instanceof Error ? err.message : 'Erro ao salvar' });
    } finally {
      setSalvando(false);
    }
  }

  if (!config) return <div className="content-page text-muted">Carregando...</div>;

  return (
    <div className="content-page">
      <div className="eyebrow">Compras</div>
      <h2 className="page-title" style={{ marginBottom: 4 }}>Configurações</h2>
      <p className="text-muted" style={{ fontSize: 13.5, margin: '0 0 24px' }}>Ajustes que valem para todas as ordens, contratos e atas deste município.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 640 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="card-title" style={{ marginBottom: 4 }}>Sequencial de ordens</div>
          <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 12px' }}>
            Próximo número de ordem a ser emitido (contratos e atas compartilham a mesma sequência). Ajuste manual — útil ao migrar dados de outro sistema.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="number" min={1} className="input num" style={{ width: 128 }} value={numeroInput} onChange={(e) => setNumeroInput(e.target.value)} />
            <button className="btn btn-primary" onClick={() => patch({ proximoNumeroOrdem: Number(numeroInput) })} disabled={salvando || Number(numeroInput) === config.proximoNumeroOrdem}>
              Salvar
            </button>
            <span className="text-muted" style={{ fontSize: 12.5 }}>
              {config.ultimoNumeroEmitido != null ? `Último número emitido: ${config.ultimoNumeroEmitido} — o próximo precisa ser maior.` : 'Nenhuma ordem emitida ainda.'}
            </span>
          </div>
          <Retorno campo="proximoNumeroOrdem" mensagem={mensagem} />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>Permitir ordem com contrato vencido</div>
              <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
                Desligado (padrão), a emissão de ordens contra um contrato com vigência final no passado é bloqueada. Ligado, o bloqueio é removido — use com cuidado.
              </p>
            </div>
            <Toggle checked={config.permitirOrdemContratoVencido} onChange={(v) => patch({ permitirOrdemContratoVencido: v })} />
          </div>
          <Retorno campo="permitirOrdemContratoVencido" mensagem={mensagem} />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>Dotação orçamentária obrigatória</div>
              <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
                Ligado (padrão), toda ordem precisa ter ao menos uma dotação vinculada antes de ser salva. Desligado, a ordem pode ser criada sem dotação.
              </p>
            </div>
            <Toggle checked={config.dotacaoObrigatoria} onChange={(v) => patch({ dotacaoObrigatoria: v })} />
          </div>
          <Retorno campo="dotacaoObrigatoria" mensagem={mensagem} />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
            <div className="card-title">Minutas</div>
            {modelosMinuta && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: modelosMinuta.prontos === modelosMinuta.total ? 'var(--color-accent)' : 'var(--color-warn)' }}>
                <i className={`ph-fill ${modelosMinuta.prontos === modelosMinuta.total ? 'ph-check-circle' : 'ph-warning-circle'}`} />
                {modelosMinuta.prontos} de {modelosMinuta.total} tipos com modelo
              </span>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
            Modelos de documento (.docx) com marcadores de texto no corpo (ex.: <code className="num">{'{{numero_contrato}}'}</code>). Cada tipo pode ter vários modelos — por exemplo, um contrato para pregão e outro para dispensa. Ao gerar, o sistema sugere o modelo da modalidade da licitação e deixa escolher outro. Sem nenhum modelo para um tipo, o botão de gerar aquele documento fica desabilitado nas telas de contrato e ata, com a razão dita ali.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {modelosMinuta?.modelos.map((m) => (
              <ModelosMinutaTipo key={m.tipo} grupo={m} marcadores={marcadores?.[m.tipo]} ehAdmin={usuario?.tipoUsuario === 'ADMIN'} onAtualizado={setModelosMinuta} />
            ))}
          </div>
          {usuario?.tipoUsuario !== 'ADMIN' && (
            <p className="text-muted" style={{ fontSize: 11.5, margin: '10px 0 0' }}>Somente o Administrador do tenant pode cadastrar, editar ou remover modelos.</p>
          )}
        </div>

      </div>
    </div>
  );
}
