import { ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Cada item referencia a mesma origem da ordem — itemContratoId quando a
// ordem parte de um contrato, ataItemId quando parte de uma ata+órgão (nunca
// os dois). Validado em OrdensService.create(), não aqui: a regra depende do
// que veio em CreateOrdemDto.contratoId/ataOrgaoId.
export class ItemOrdemInput {
  @IsOptional() @IsString() itemContratoId?: string;
  @IsOptional() @IsString() ataItemId?: string;
  @IsNumber() @IsPositive() quantidade: number;
}

export class DotacaoOrdemInput {
  @IsString() dotacaoId: string;
  @IsOptional() @IsNumber() valorRateado?: number;
}

export class CreateOrdemDto {
  @IsOptional() @IsString() contratoId?: string;
  @IsOptional() @IsString() ataOrgaoId?: string;
  @IsOptional() @IsString() unidadeExecutoraId?: string;
  // false cria a ordem como REQUISICAO (rascunho, não valida/decrementa
  // saldo ainda) — default true preserva o comportamento anterior do wizard.
  @IsOptional() @IsBoolean() emitirAgora?: boolean;
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DotacaoOrdemInput)
  dotacoes?: DotacaoOrdemInput[];
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ItemOrdemInput)
  itens: ItemOrdemInput[];
}

export class AlteracaoItemOrdemInput {
  @IsString() itemOrdemId: string;
  @IsNumber() @IsPositive() quantidade: number;
}

// Edição pós-emissão — só quantidade muda; preço unitário e origem
// permanecem os snapshotados na emissão. Ver OrdensService.update.
export class UpdateOrdemDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AlteracaoItemOrdemInput)
  itens: AlteracaoItemOrdemInput[];
}
