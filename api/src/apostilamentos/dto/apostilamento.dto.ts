import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

const TIPOS_APOSTILAMENTO = ['REAJUSTE_REPACTUACAO', 'ATUALIZACAO_FINANCEIRA', 'ALTERACAO_RAZAO_SOCIAL', 'EMPENHO_DOTACAO'];

export class CreateApostilamentoDto {
  @IsIn(TIPOS_APOSTILAMENTO) tipo: string;
  @IsString() descricao: string;
  @IsOptional() @IsNumber() valorAnterior?: number;
  @IsOptional() @IsNumber() valorNovo?: number;
}
