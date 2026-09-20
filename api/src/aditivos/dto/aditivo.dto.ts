import { IsArray, IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

// ACRESCIMO_ESPECIAL: Art. 65 §1º-B (obras de reforma de edifício/equipamento)
// — teto próprio de 50%, mesmo formato de VALOR (usa `percentual`), pool
// inteiramente separado do teto de 25% de VALOR/QUANTIDADE.
const TIPOS_ADITIVO = ['VALOR', 'PRAZO', 'QUANTIDADE', 'SUPRESSAO', 'ACRESCIMO_ESPECIAL'];

export class ItemAcrescimoInput {
  @IsString() itemContratoId: string;
  @IsNumber() @IsPositive() quantidade: number;
}

export class CreateAditivoDto {
  @IsIn(TIPOS_ADITIVO) tipo: string;
  @IsString() numero: string;
  @IsDateString() dataAssinatura: string;
  @IsString() fundamentoLegal: string;
  @IsString() justificativa: string;
  // VALOR / SUPRESSAO — sempre a magnitude positiva do percentual; o sinal
  // do efeito (acréscimo vs. decréscimo) vem só de `tipo`, nunca de um
  // percentual negativo (ver AditivosService.create).
  @IsOptional() @IsNumber() @IsPositive() percentual?: number;
  // PRAZO
  @IsOptional() @IsInt() @IsPositive() diasProrrogacao?: number;
  // QUANTIDADE
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ItemAcrescimoInput)
  itens?: ItemAcrescimoInput[];
}
