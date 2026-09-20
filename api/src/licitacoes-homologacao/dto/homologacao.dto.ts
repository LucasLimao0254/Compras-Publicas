import { IsInt, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class NovoFornecedorInput {
  @IsString() cnpjCpf: string;
  @IsString() razaoSocial: string;
}

// Tudo opcional: a revisão corrige só o que o usuário clicar, campo a campo —
// nunca exige reenviar o objeto inteiro do fornecedor extraído.
// `@IsOptional()` trata `null` e `undefined` como "pula a validação deste
// campo" igualmente — usamos essa distinção de propósito no service:
// `undefined` (chave ausente do JSON) = campo não tocado nesta chamada;
// `null` = usuário limpou o campo explicitamente na tela de revisão.
export class PatchFornecedorDto {
  @IsOptional() @IsString() nomeExtraido?: string;
  @IsOptional() @IsString() cnpjExtraido?: string;
  @IsOptional() @IsString() fornecedorId?: string | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => NovoFornecedorInput)
  novoFornecedor?: NovoFornecedorInput;
}

// Mesmo princípio: tudo opcional, a revisão edita campo a campo. A obrigação
// de preencher descrição/unidade/quantidade/valorUnitario só é cobrada em
// concluir-revisao, não aqui — ver LicitacoesHomologacaoService.concluirRevisao.
export class PatchItemDto {
  @IsOptional() @IsInt() numeroItem?: number | null;
  @IsOptional() @IsString() descricao?: string;
  @IsOptional() @IsString() unidade?: string;
  @IsOptional() @IsNumber() @IsPositive() quantidade?: number | null;
  @IsOptional() @IsNumber() @IsPositive() valorUnitario?: number | null;
}
