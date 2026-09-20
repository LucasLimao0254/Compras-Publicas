import { useState } from 'react';
import { lerPlanilhaDemanda } from '../lib/planilhaDemanda';

// Botão de seleção em massa por planilha — sempre ao lado da seleção manual
// já existente, nunca a substituindo. Só preenche quantidades no formulário
// já aberto (via onQuantidades); nada é enviado à API até o usuário confirmar
// manualmente o restante do formulário. Útil quando a grade tem dezenas de
// itens (vimos atas reais com 51 itens por órgão).
export function ImportarPlanilhaDemandaButton({
  itens,
  onQuantidades,
}: {
  itens: { id: string; numero: number }[];
  onQuantidades: (quantidades: Record<string, string>) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    e.target.value = '';
    if (!arquivo) return;
    setErro(null);
    setCarregando(true);
    try {
      const entradas = await lerPlanilhaDemanda(arquivo);
      const porNumero = new Map(itens.map((it) => [it.numero, it.id]));
      const quantidades: Record<string, string> = {};
      let semCorrespondencia = 0;
      for (const { numero, quantidade } of entradas) {
        const itemId = porNumero.get(numero);
        if (!itemId) { semCorrespondencia++; continue; }
        quantidades[itemId] = String(quantidade);
      }
      if (!Object.keys(quantidades).length) {
        setErro('Nenhum número de item da planilha corresponde a um item desta grade');
      } else {
        onQuantidades(quantidades);
        if (semCorrespondencia) setErro(`${semCorrespondencia} linha(s) da planilha não correspondem a nenhum item desta grade e foram ignoradas`);
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Erro ao ler a planilha');
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <label className="btn btn-ghost" style={{ cursor: carregando ? 'wait' : 'pointer' }}>
        <i className="ph ph-upload-simple" />{carregando ? 'Lendo planilha...' : 'Importar planilha de demanda'}
        <input type="file" accept=".xlsx" hidden disabled={carregando} onChange={onChange} />
      </label>
      {erro && <span style={{ fontSize: 11.5, color: 'var(--color-critical)' }}>{erro}</span>}
    </div>
  );
}
