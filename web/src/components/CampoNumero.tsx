import { numeroJaUsado, ultimoNumero } from '../lib/numeracao';

export interface NumeroExistente { id: string; numero: string; }

// Campo do número da ARP/contrato: o placeholder mostra o último número da
// sequência (some ao começar a digitar) e um número já usado — mesmo escrito
// de outro jeito, "12/2026" × "012/2026" — é apontado na hora. Quem usa o
// campo bloqueia o envio com `numeroRepetido` (o backend recusa igual).
export function numeroRepetido(existentes: NumeroExistente[] | undefined, numero: string, excetoId?: string) {
  return existentes && numero.trim() ? numeroJaUsado(existentes, numero, excetoId) : null;
}

export function CampoNumero({ id, rotulo, valor, onChange, existentes, excetoId, entidade }: {
  id: string; rotulo: string; valor: string; onChange: (v: string) => void;
  existentes?: NumeroExistente[]; excetoId?: string; entidade: 'ata' | 'contrato';
}) {
  const outros = existentes?.filter((e) => e.id !== excetoId) ?? [];
  const ultimo = ultimoNumero(outros.map((e) => e.numero));
  const usado = numeroRepetido(existentes, valor, excetoId);
  return (
    <div className="field"><label htmlFor={id}>{rotulo}</label>
      <input id={id} className="input" value={valor} onChange={(e) => onChange(e.target.value)} required
        placeholder={ultimo ? `Último usado: ${ultimo}` : 'Ex.: 001/2026'}
        aria-invalid={!!usado} aria-describedby={usado ? `${id}-erro` : undefined}
        style={usado ? { boxShadow: '0 0 0 1px var(--color-critical)' } : undefined} />
      {usado
        ? <p id={`${id}-erro`} role="alert" style={{ fontSize: 11, marginTop: 4, color: 'var(--color-critical)' }}>O número {usado} já foi usado por {entidade === 'ata' ? 'outra ata' : 'outro contrato'}.</p>
        : ultimo && <p className="text-muted" style={{ fontSize: 11, marginTop: 4 }}>Último da sequência: {ultimo}</p>}
    </div>
  );
}
