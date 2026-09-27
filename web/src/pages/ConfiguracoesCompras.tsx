import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../auth/AuthContext';

interface Config {
  proximoNumeroOrdem: number;
  permitirOrdemContratoVencido: boolean;
  dotacaoObrigatoria: boolean;
}

type TipoMinuta = 'ARP' | 'CONTRATO' | 'ADITIVO' | 'APOSTILAMENTO';
interface ModeloMinuta { tipo: TipoMinuta; carregado: boolean; arquivoNome: string | null; enviadoEm: string | null; }
interface ModelosMinuta { modelos: ModeloMinuta[]; prontos: number; total: number; }
interface Marcador { marcador: string; descricao: string; }

const TIPOS_LABEL: Record<TipoMinuta, string> = {
  ARP: 'Ata de registro de preços (ARP)', CONTRATO: 'Contrato', ADITIVO: 'Termo aditivo', APOSTILAMENTO: 'Apostilamento',
};

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`toggle${checked ? ' on' : ''}`}>
      <span className="knob" />
    </button>
  );
}

export function ConfiguracoesCompras() {
  const { usuario } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [numeroInput, setNumeroInput] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  const [modelosMinuta, setModelosMinuta] = useState<ModelosMinuta | null>(null);
  const [marcadores, setMarcadores] = useState<Record<TipoMinuta, Marcador[]> | null>(null);
  const [marcadoresAbertos, setMarcadoresAbertos] = useState<TipoMinuta | null>(null);
  const [enviandoTipo, setEnviandoTipo] = useState<TipoMinuta | null>(null);
  const [erroPorTipo, setErroPorTipo] = useState<Record<string, string>>({});

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
    setSalvando(true);
    setMensagem(null);
    try {
      const atualizado = await api.patch('/configuracoes/compras', body);
      setConfig(atualizado);
      setNumeroInput(String(atualizado.proximoNumeroOrdem));
      setMensagem('Salvo.');
    } catch (err) {
      setMensagem(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  }

  async function onEnviarModelo(tipo: TipoMinuta, arquivo: File) {
    setEnviandoTipo(tipo);
    setErroPorTipo((prev) => ({ ...prev, [tipo]: '' }));
    try {
      const formData = new FormData();
      formData.append('arquivo', arquivo);
      const atualizado = await api.upload(`/minutas/modelos/${tipo}`, formData);
      setModelosMinuta(atualizado);
    } catch (err) {
      setErroPorTipo((prev) => ({ ...prev, [tipo]: err instanceof Error ? err.message : 'Erro ao enviar modelo' }));
    } finally {
      setEnviandoTipo(null);
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
          </div>
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
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
            <div className="card-title">Minutas</div>
            {modelosMinuta && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: modelosMinuta.prontos === modelosMinuta.total ? 'var(--color-accent)' : 'var(--color-warn)' }}>
                <i className={`ph-fill ${modelosMinuta.prontos === modelosMinuta.total ? 'ph-check-circle' : 'ph-warning-circle'}`} />
                {modelosMinuta.prontos} de {modelosMinuta.total} modelos carregados
              </span>
            )}
          </div>
          <p className="text-muted" style={{ fontSize: 12.5, margin: '0 0 14px' }}>
            Upload do modelo de documento (.docx) de cada tipo, um por tipo, com marcadores de texto no corpo (ex.: <code className="num">{'{{numero_contrato}}'}</code>). Sem modelo cadastrado para um tipo, o botão de gerar aquele documento fica desabilitado nas telas de contrato e ata, com a razão dita ali.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {modelosMinuta?.modelos.map((m) => (
              <div key={m.tipo} style={{ borderRadius: 8, background: 'color-mix(in srgb, var(--color-text) 4%, transparent)', padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <i className={m.carregado ? 'ph-fill ph-check-circle' : 'ph ph-circle-dashed'} style={{ fontSize: 15, color: m.carregado ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-text) 45%, transparent)' }} />
                    <div>
                      <div style={{ fontSize: 13 }}>{TIPOS_LABEL[m.tipo]}</div>
                      <div className="text-muted" style={{ fontSize: 11 }}>
                        {m.carregado ? `${m.arquivoNome} — enviado em ${new Date(m.enviadoEm!).toLocaleDateString('pt-BR')}` : 'Nenhum modelo cadastrado'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn btn-ghost" type="button" onClick={() => setMarcadoresAbertos(marcadoresAbertos === m.tipo ? null : m.tipo)}>
                      {marcadoresAbertos === m.tipo ? 'ocultar marcadores' : 'ver marcadores'}
                    </button>
                    {usuario?.tipoUsuario === 'ADMIN' && (
                      <label className="btn btn-secondary" style={{ cursor: enviandoTipo === m.tipo ? 'wait' : 'pointer' }}>
                        <i className="ph ph-upload-simple" />{enviandoTipo === m.tipo ? 'Enviando...' : m.carregado ? 'Substituir' : 'Enviar .docx'}
                        <input
                          type="file"
                          accept=".docx"
                          hidden
                          disabled={enviandoTipo === m.tipo}
                          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onEnviarModelo(m.tipo, f); }}
                        />
                      </label>
                    )}
                  </div>
                </div>
                {marcadoresAbertos === m.tipo && marcadores && (
                  <div style={{ marginTop: 10, paddingTop: 10, boxShadow: 'inset 0 1px 0 var(--color-divider)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {marcadores[m.tipo].map((mk) => (
                      <div key={mk.marcador} style={{ fontSize: 11.5, display: 'flex', gap: 8 }}>
                        <code className="num" style={{ color: 'var(--color-accent-300)', flex: 'none' }}>{`{{${mk.marcador}}}`}</code>
                        <span className="text-muted">{mk.descricao}</span>
                      </div>
                    ))}
                  </div>
                )}
                {erroPorTipo[m.tipo] && <div style={{ fontSize: 11.5, color: 'var(--color-critical)', marginTop: 6 }}>{erroPorTipo[m.tipo]}</div>}
              </div>
            ))}
          </div>
          {usuario?.tipoUsuario !== 'ADMIN' && (
            <p className="text-muted" style={{ fontSize: 11.5, margin: '10px 0 0' }}>Somente o Administrador do tenant pode cadastrar ou substituir modelos.</p>
          )}
        </div>

        {mensagem && <p className="text-muted" style={{ fontSize: 13 }}>{mensagem}</p>}
      </div>
    </div>
  );
}
