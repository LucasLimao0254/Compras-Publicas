// Valor em reais por extenso ("mil duzentos e trinta e quatro reais e cinco
// centavos") — marcador {{valor_total_extenso}} das minutas. Recebe centavos
// inteiros (common/dinheiro.ts), até 999 bilhões.
const UNIDADES = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const partes: string[] = [];
  const c = Math.floor(n / 100), resto = n % 100;
  if (c) partes.push(CENTENAS[c]);
  if (resto < 20) { if (resto) partes.push(UNIDADES[resto]); }
  else {
    partes.push(DEZENAS[Math.floor(resto / 10)]);
    if (resto % 10) partes.push(UNIDADES[resto % 10]);
  }
  return partes.join(' e ');
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero';
  const grupos = [
    { valor: Math.floor(n / 1e9) % 1000, sing: 'bilhão', plur: 'bilhões' },
    { valor: Math.floor(n / 1e6) % 1000, sing: 'milhão', plur: 'milhões' },
    { valor: Math.floor(n / 1e3) % 1000, sing: 'mil', plur: 'mil' },
    { valor: n % 1000, sing: '', plur: '' },
  ];
  const partes: { texto: string; valor: number }[] = [];
  for (const g of grupos) {
    if (!g.valor) continue;
    if (g.sing === 'mil') partes.push({ texto: g.valor === 1 ? 'mil' : `${ate999(g.valor)} mil`, valor: g.valor });
    else if (g.sing) partes.push({ texto: `${ate999(g.valor)} ${g.valor === 1 ? g.sing : g.plur}`, valor: g.valor });
    else partes.push({ texto: ate999(g.valor), valor: g.valor });
  }
  // "e" antes do último grupo quando ele é < 100 ou centena redonda (mil e cem, mil e vinte)
  return partes.map((p, i) => {
    if (i === 0) return p.texto;
    const ultimo = i === partes.length - 1;
    return (ultimo && (p.valor < 100 || p.valor % 100 === 0) ? ' e ' : ', ') + p.texto;
  }).join('').replace(/, /g, ' ');
}

export function reaisPorExtenso(centavos: number): string {
  const negativo = centavos < 0;
  const total = Math.abs(Math.round(centavos));
  const reais = Math.floor(total / 100), cents = total % 100;
  const partes: string[] = [];
  if (reais) {
    const milhaoRedondo = reais >= 1e6 && reais % 1e6 === 0;
    partes.push(`${inteiroPorExtenso(reais)}${milhaoRedondo ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (cents) partes.push(`${inteiroPorExtenso(cents)} ${cents === 1 ? 'centavo' : 'centavos'}`);
  if (!partes.length) return 'zero reais';
  return (negativo ? 'menos ' : '') + partes.join(' e ');
}
