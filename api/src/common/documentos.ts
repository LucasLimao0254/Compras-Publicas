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
