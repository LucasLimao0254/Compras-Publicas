import { useEffect, useState } from 'react';
import { api } from '../lib/api';

interface Config {
  proximoNumeroOrdem: number;
  permitirOrdemContratoVencido: boolean;
  permitirOrdemDiretoAta: boolean;
  dotacaoObrigatoria: boolean;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className={`toggle${checked ? ' on' : ''}`}>
      <span className="knob" />
    </button>
  );
}

export function ConfiguracoesCompras() {
  const [config, setConfig] = useState<Config | null>(null);
  const [numeroInput, setNumeroInput] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState<string | null>(null);

  async function carregar() {
    const c = await api.get('/configuracoes/compras');
    setConfig(c);
    setNumeroInput(String(c.proximoNumeroOrdem));
  }
  useEffect(() => { carregar(); }, []);

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

        <div className="card" style={{ padding: 20, boxShadow: config.permitirOrdemDiretoAta ? 'inset 0 0 0 1px var(--color-accent)' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <div className="card-title" style={{ marginBottom: 4 }}>Ordens direto de uma ata</div>
              <p className="text-muted" style={{ fontSize: 12.5, margin: 0 }}>
                Desligado (padrão), a ordem só existe a partir de um contrato. Ligado, aparece o botão "Criar ordem" nos detalhes da ata e o consumo é abatido do saldo da ata, por órgão. A numeração é a mesma série das ordens de contrato.
              </p>
            </div>
            <Toggle checked={config.permitirOrdemDiretoAta} onChange={(v) => patch({ permitirOrdemDiretoAta: v })} />
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

        {mensagem && <p className="text-muted" style={{ fontSize: 13 }}>{mensagem}</p>}
      </div>
    </div>
  );
}
