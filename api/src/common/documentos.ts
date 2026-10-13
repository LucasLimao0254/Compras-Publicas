// CPF: só dígitos (aceita digitado com pontos e traço) e dígitos verificadores
// corretos. Antes o campo aceitava letras e qualquer sequência.
export function normalizarCpf(valor: string): string {
  return (valor ?? '').replace(/[.\-\s]/g, '');
}

export function cpfValido(valor: string): boolean {
  const cpf = normalizarCpf(valor);
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
  const digito = (base: string) => {
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * (base.length + 1 - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return digito(cpf.slice(0, 9)) === Number(cpf[9]) && digito(cpf.slice(0, 10)) === Number(cpf[10]);
}

// Nome de pessoa: precisa ter letras e não pode ter algarismos.
export function nomePessoaValido(valor: string): boolean {
  const nome = (valor ?? '').trim();
  return /\p{L}/u.test(nome) && !/\d/.test(nome);
}

// CNPJ: 14 dígitos com os dois verificadores corretos.
export function cnpjValido(valor: string): boolean {
  const cnpj = (valor ?? '').replace(/\D/g, '');
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false;
  const digito = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const resto = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i], 0) % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return digito(cnpj.slice(0, 12)) === Number(cnpj[12]) && digito(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

// Documento do fornecedor (CNPJ, ou CPF de pessoa física), sempre gravado no
// mesmo formato — "12345678000195" e "12.345.678/0001-95" eram dois
// fornecedores diferentes. Devolve null se não for um CNPJ/CPF válido.
export function documentoFornecedor(valor: string): string | null {
  const d = (valor ?? '').replace(/\D/g, '');
  if (d.length === 14 && cnpjValido(d)) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11 && cpfValido(d)) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return null;
}

export const soDigitos = (valor: string | null | undefined) => (valor ?? '').replace(/\D/g, '');
