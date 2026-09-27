import { IsBoolean, IsInt, IsOptional, IsPositive } from 'class-validator';

export class UpdateConfiguracoesComprasDto {
  @IsOptional() @IsInt() @IsPositive() proximoNumeroOrdem?: number;
  @IsOptional() @IsBoolean() permitirOrdemContratoVencido?: boolean;
  @IsOptional() @IsBoolean() dotacaoObrigatoria?: boolean;
}
