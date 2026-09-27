import { ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// Ordem só nasce de contrato (ver MODELO.md, seção 2) — itemContratoId é a
// única origem possível de um item de ordem.
export class ItemOrdemInput {
  @IsString() itemContratoId: string;
  @IsNumber() @IsPositive() quantidade: number;
}

export class DotacaoOrdemInput {
  @IsString() dotacaoId: string;
  @IsOptional() @IsNumber() valorRateado?: number;
}

export class CreateOrdemDto {
  @IsString() contratoId: string;
  @IsOptional() @IsString() unidadeExecutoraId?: string;
  // false cria a ordem como RASCUNHO (não valida/decrementa saldo ainda) —
  // default true preserva o comportamento anterior do wizard.
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
