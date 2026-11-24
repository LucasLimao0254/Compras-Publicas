import { BadRequestException } from '@nestjs/common';

// CNPJ/CPF chegam com ou sem máscara ("00.000.000/0001-00" ou "00000000000100").
// Gravados como texto livre, a mesma empresa virava dois fornecedores, e a busca
// por duplicidade (cadastro e revisão da homologação) não a reconhecia. Aqui o
// documento é validado (dígitos verificadores) e devolvido sempre na mesma
// forma, com máscara; a comparação entre registros é feita pelos dígitos.

export function somenteDigitos(valor: string): string {
  return String(valor ?? '').replace(/\D/g, '');
}

function cpfValido(d: string): boolean {
  if (!/^\d{11}$/.test(d) || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (n: number) => {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
}

function cnpjValido(d: string): boolean {
  if (!/^\d{14}$/.test(d) || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = pesos.reduce((acc, p, i) => acc + Number(d[i]) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

const mascaraCnpj = (d: string) => `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
const mascaraCpf = (d: string) => `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;

// Valida e devolve o documento com máscara. `aceitaCpf: false` para quem só
// pode ser pessoa jurídica (unidade executora).
export function normalizarDocumento(valor: string, opcoes: { aceitaCpf: boolean } = { aceitaCpf: true }): string {
  const d = somenteDigitos(valor);
  if (d.length === 14) {
    if (!cnpjValido(d)) throw new BadRequestException(`CNPJ inválido: ${valor}`);
    return mascaraCnpj(d);
  }
  if (d.length === 11 && opcoes.aceitaCpf) {
    if (!cpfValido(d)) throw new BadRequestException(`CPF inválido: ${valor}`);
    return mascaraCpf(d);
  }
  throw new BadRequestException(opcoes.aceitaCpf ? `Informe um CNPJ (14 dígitos) ou CPF (11 dígitos) válido: ${valor}` : `Informe um CNPJ válido (14 dígitos): ${valor}`);
}
